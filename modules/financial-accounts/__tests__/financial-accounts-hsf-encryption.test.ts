/**
 * The HSF field-encryption contract, exercised against the LOCAL adapter.
 *
 * These are the properties a production key-management adapter must also
 * satisfy — the local adapter exists so they are testable, not so they are
 * only true locally. Every case here is an attack a stolen or tampered
 * database gives someone: move a ciphertext to another row, move it to
 * another column, replay it under another subject, or present it after a key
 * rotation. All four must fail authentication rather than decrypt into a
 * plausible wrong record, because a wrong-but-plausible account name is worse
 * than one that fails to load.
 *
 * The environment refusals are here too. `KARAR_ENV` is never read from the
 * process: the adapters take it as an argument, so a test can assert the
 * refusal for staging and production without pretending to be either.
 *
 * All fixtures are obviously synthetic.
 */

import { describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import {
  HsfFieldEncryptionError,
  type EncryptedField,
  type FieldEncryptionContext,
  type HsfFieldEncryptionPort,
} from '../application/ports/hsf-field-encryption.js';
import type { AccountsPrincipal } from '../application/principal.js';
import { HSF_REDACTION, HsfField } from '../domain/hsf-field.js';
import {
  LocalAesGcmFieldEncryptionProvider,
  LocalHsfEncryptionEnvironmentError,
  resolveHsfFieldEncryptionPort,
} from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import {
  LocalRetentionFixtureEnvironmentError,
  LocalSyntheticRetentionDecisionProvider,
  resolveRetentionDecisionPort,
} from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
/** Two people inside ONE tenant: the case tenant scoping alone would miss. */
const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');

const ACTOR_A1: AccountsPrincipal = { tenantId: TENANT_A, userId: USER_A1 };
const ACTOR_A2: AccountsPrincipal = { tenantId: TENANT_A, userId: USER_A2 };
const ACTOR_B1: AccountsPrincipal = { tenantId: TENANT_B, userId: USER_A1 };

const ROW_ONE = 'fa000000-0000-4000-8000-000000000001';
const ROW_TWO = 'fa000000-0000-4000-8000-000000000002';

/** A fixed key so a test can construct a second adapter that shares it. */
const SYNTHETIC_KEY = new Uint8Array(32).fill(7);

const SYNTHETIC_DISPLAY_NAME = 'Synthetic Test Account One';
const SYNTHETIC_MASK = '*0000';

function provider(options: { key?: Uint8Array; keyVersion?: string } = {}) {
  return new LocalAesGcmFieldEncryptionProvider({
    env: 'local',
    key: options.key ?? SYNTHETIC_KEY,
    ...(options.keyVersion !== undefined ? { keyVersion: options.keyVersion } : {}),
  });
}

function context(
  rowId: string,
  field: FieldEncryptionContext['field'],
): FieldEncryptionContext {
  return { table: 'financial_accounts', rowId, field };
}

async function expectRejection(
  attempt: Promise<unknown>,
): Promise<HsfFieldEncryptionError> {
  const error = await attempt.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(HsfFieldEncryptionError);
  return error as HsfFieldEncryptionError;
}

describe('HSF field encryption: the round trip and its shape', () => {
  it('returns ciphertext, a fresh 12-byte nonce, a 16-byte tag, an algorithm and a key version', async () => {
    const encryption = provider();
    const first = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    const second = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );

    expect(first.algorithm).toBe('AES-256-GCM');
    expect(first.keyVersion).not.toBe('');
    expect(first.nonce).toHaveLength(12);
    expect(first.authTag).toHaveLength(16);
    // Fresh nonce per encryption, so the same plaintext is not the same
    // ciphertext: nonce reuse under GCM is catastrophic, not merely weak, and
    // a repeated ciphertext would also be an equality oracle over the value.
    expect(Buffer.from(first.nonce).equals(Buffer.from(second.nonce))).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);

    const back = await encryption.decryptField(
      ACTOR_A1,
      first,
      context(ROW_ONE, 'displayName'),
    );
    expect(back.reveal()).toBe(SYNTHETIC_DISPLAY_NAME);
  });

  it('is length-preserving, which is what lets the mask column keep a byte bound', async () => {
    // Migration 0088 bounds mask_ciphertext at 8 bytes because |C| = |P| under
    // AES-GCM. If that ever stopped holding, a full PAN would fit in a column
    // whose entire purpose is that it cannot.
    const encryption = provider();
    for (const plaintext of [SYNTHETIC_MASK, '0000', '****0000', SYNTHETIC_DISPLAY_NAME]) {
      const encrypted = await encryption.encryptField(
        ACTOR_A1,
        HsfField.of(plaintext),
        context(ROW_ONE, 'mask'),
      );
      expect(encrypted.ciphertext.length).toBe(Buffer.byteLength(plaintext, 'utf8'));
    }
    // A 16-digit card number is 16 bytes and would not fit the 8-byte bound.
    const wouldNotFit = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of('4111111111111111'),
      context(ROW_ONE, 'mask'),
    );
    expect(wouldNotFit.ciphertext.length).toBeGreaterThan(8);
  });
});

describe('HSF field encryption: a ciphertext cannot be transplanted', () => {
  it('moved to ANOTHER ROW, it fails authentication', async () => {
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    const error = await expectRejection(
      encryption.decryptField(ACTOR_A1, encrypted, context(ROW_TWO, 'displayName')),
    );
    expect(error.kind).toBe('decryption_failed');
  });

  it('moved to ANOTHER FIELD on the same row, it fails authentication', async () => {
    // Without this, a mask could be presented as an account name, or the other
    // way round — both decrypt to something a reader would believe.
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_MASK),
      context(ROW_ONE, 'mask'),
    );
    for (const field of ['displayName', 'userSuppliedInstitutionLabel'] as const) {
      const error = await expectRejection(
        encryption.decryptField(ACTOR_A1, encrypted, context(ROW_ONE, field)),
      );
      expect(error.kind).toBe('decryption_failed');
    }
  });

  it('replayed under ANOTHER USER IN THE SAME TENANT, it fails authentication', async () => {
    // The load-bearing case: two members of one household tenant are two
    // different subjects whose accounts sit in the same table, so a
    // tenant-only binding would let one read the other's name.
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    const error = await expectRejection(
      encryption.decryptField(ACTOR_A2, encrypted, context(ROW_ONE, 'displayName')),
    );
    expect(error.kind).toBe('decryption_failed');
  });

  it('replayed under ANOTHER TENANT, it fails authentication', async () => {
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    const error = await expectRejection(
      encryption.decryptField(ACTOR_B1, encrypted, context(ROW_ONE, 'displayName')),
    );
    expect(error.kind).toBe('decryption_failed');
  });

  it('a single flipped byte in the ciphertext or the tag fails, rather than decrypting to garbage', async () => {
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );

    const flippedCiphertext = new Uint8Array(encrypted.ciphertext);
    flippedCiphertext.set([(flippedCiphertext.at(0) ?? 0) ^ 0xff], 0);
    const flippedTag = new Uint8Array(encrypted.authTag);
    flippedTag.set([(flippedTag.at(0) ?? 0) ^ 0xff], 0);
    const tamperedCiphertext = { ...encrypted, ciphertext: flippedCiphertext };
    const tamperedTag = { ...encrypted, authTag: flippedTag };

    for (const candidate of [tamperedCiphertext, tamperedTag]) {
      const error = await expectRejection(
        encryption.decryptField(ACTOR_A1, candidate, context(ROW_ONE, 'displayName')),
      );
      expect(error.kind).toBe('decryption_failed');
    }
  });
});

describe('HSF field encryption: key version provenance', () => {
  it('a ciphertext from another key version fails SAFELY and names the reason', async () => {
    // Not "decrypted to nothing" and not a silent empty field: a key the
    // adapter does not hold is an operational condition someone must see.
    const written = provider({ keyVersion: 'karar-ref:key-version:synthetic-test@v1' });
    const rotated = provider({ keyVersion: 'karar-ref:key-version:synthetic-test@v2' });
    const encrypted = await written.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );

    const error = await expectRejection(
      rotated.decryptField(ACTOR_A1, encrypted, context(ROW_ONE, 'displayName')),
    );
    expect(error.kind).toBe('key_unavailable');
    expect(error.message).toContain('key version');
    // The row is still readable under the version that wrote it — which is
    // the entire reason the version is stored per row (ADR-0017).
    const back = await written.decryptField(
      ACTOR_A1,
      encrypted,
      context(ROW_ONE, 'displayName'),
    );
    expect(back.reveal()).toBe(SYNTHETIC_DISPLAY_NAME);
  });

  it('an unknown algorithm is refused rather than guessed at', async () => {
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    const error = await expectRejection(
      encryption.decryptField(
        ACTOR_A1,
        { ...encrypted, algorithm: 'ROT13' } as EncryptedField,
        context(ROW_ONE, 'displayName'),
      ),
    );
    expect(error.kind).toBe('decryption_failed');
  });

  it('a malformed nonce or tag is refused before any cipher is constructed', async () => {
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    for (const candidate of [
      { ...encrypted, nonce: new Uint8Array(11) },
      { ...encrypted, authTag: new Uint8Array(15) },
    ]) {
      const error = await expectRejection(
        encryption.decryptField(ACTOR_A1, candidate, context(ROW_ONE, 'displayName')),
      );
      expect(error.kind).toBe('decryption_failed');
    }
  });
});

describe('HSF field encryption: no HIGHLY_SENSITIVE_FINANCIAL value reaches a log or an error', () => {
  /** Everything a failure could plausibly carry outward. */
  function surfaces(error: HsfFieldEncryptionError): string[] {
    return [
      error.message,
      String(error),
      error.stack ?? '',
      JSON.stringify({ error: error.message, kind: error.kind }),
    ];
  }

  it('every failure kind is opaque: no plaintext, no key, no nonce', async () => {
    const written = provider({ keyVersion: 'karar-ref:key-version:synthetic-test@v1' });
    const rotated = provider({ keyVersion: 'karar-ref:key-version:synthetic-test@v2' });
    const encrypted = await written.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );

    const failures = [
      await expectRejection(
        written.decryptField(ACTOR_A2, encrypted, context(ROW_ONE, 'displayName')),
      ),
      await expectRejection(
        written.decryptField(ACTOR_A1, encrypted, context(ROW_TWO, 'displayName')),
      ),
      await expectRejection(
        rotated.decryptField(ACTOR_A1, encrypted, context(ROW_ONE, 'displayName')),
      ),
    ];

    for (const failure of failures) {
      for (const rendered of surfaces(failure)) {
        expect(rendered).not.toContain(SYNTHETIC_DISPLAY_NAME);
        expect(rendered).not.toContain(SYNTHETIC_MASK);
        expect(rendered).not.toContain(Buffer.from(SYNTHETIC_KEY).toString('hex'));
        expect(rendered).not.toContain(Buffer.from(encrypted.nonce).toString('hex'));
      }
    }
  });

  it('the two context failures are INDISTINGUISHABLE, so neither is an oracle', async () => {
    // "wrong row" and "wrong subject" answering differently would let someone
    // holding a ciphertext learn which of the two they had guessed right.
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    const wrongRow = await expectRejection(
      encryption.decryptField(ACTOR_A1, encrypted, context(ROW_TWO, 'displayName')),
    );
    const wrongSubject = await expectRejection(
      encryption.decryptField(ACTOR_A2, encrypted, context(ROW_ONE, 'displayName')),
    );
    expect(wrongRow.kind).toBe(wrongSubject.kind);
    expect(wrongRow.message).toBe(wrongSubject.message);
  });

  it('a decrypted field still redacts on every accidental rendering path', async () => {
    const encryption = provider();
    const encrypted = await encryption.encryptField(
      ACTOR_A1,
      HsfField.of(SYNTHETIC_DISPLAY_NAME),
      context(ROW_ONE, 'displayName'),
    );
    const back = await encryption.decryptField(
      ACTOR_A1,
      encrypted,
      context(ROW_ONE, 'displayName'),
    );
    expect(`${back}`).toBe(HSF_REDACTION);
    expect(JSON.stringify({ name: back })).not.toContain(SYNTHETIC_DISPLAY_NAME);
  });
});

describe('local providers refuse to exist outside local development', () => {
  const deployed = ['dev', 'staging', 'production'] as const;

  it('the encryption adapter throws for dev, staging and production', () => {
    for (const env of deployed) {
      expect(() => new LocalAesGcmFieldEncryptionProvider({ env })).toThrow(
        LocalHsfEncryptionEnvironmentError,
      );
    }
    // An unrecognised environment string is not local either — an unset or
    // misspelled KARAR_ENV must fail closed, not open.
    expect(() => new LocalAesGcmFieldEncryptionProvider({ env: '' })).toThrow(
      LocalHsfEncryptionEnvironmentError,
    );
    expect(() => new LocalAesGcmFieldEncryptionProvider({ env: 'local' })).not.toThrow();
  });

  it('resolving encryption in a deployed environment with NO approved provider refuses', () => {
    for (const env of deployed) {
      const attempt = () => resolveHsfFieldEncryptionPort({ env });
      expect(attempt).toThrow(HsfFieldEncryptionError);
      // The refusal says what to wire, because the person reading it at boot
      // is the person who has to fix it.
      expect(attempt).toThrow(/no approved HSF field-encryption provider/);
    }
  });

  it('resolving encryption in a deployed environment WITH an approved provider is permitted', () => {
    // The seam has to be usable, or a deployment would have no way through it.
    const approved: HsfFieldEncryptionPort = {
      algorithm: 'AES-256-GCM',
      encryptField: () => Promise.reject(new Error('not exercised')),
      decryptField: () => Promise.reject(new Error('not exercised')),
    };
    for (const env of deployed) {
      expect(resolveHsfFieldEncryptionPort({ env, approvedProvider: approved })).toBe(approved);
    }
  });

  it('the retention fixture throws for dev, staging and production', () => {
    for (const env of deployed) {
      expect(() => new LocalSyntheticRetentionDecisionProvider({ env })).toThrow(
        LocalRetentionFixtureEnvironmentError,
      );
      expect(() => resolveRetentionDecisionPort({ env })).toThrow(
        LocalRetentionFixtureEnvironmentError,
      );
    }
    expect(() => new LocalSyntheticRetentionDecisionProvider({ env: 'local' })).not.toThrow();
  });

  it('the retention resolution never substitutes the fixture for a missing provider', async () => {
    // The failure mode this closes: "we forgot to wire retention" presenting
    // as "retention is fine".
    expect(() => resolveRetentionDecisionPort({ env: 'production', approvedProvider: null })).toThrow(
      LocalRetentionFixtureEnvironmentError,
    );

    const local = resolveRetentionDecisionPort({ env: 'local' });
    const decision = await local.decideFor(ACTOR_A1, 'financial_accounts');
    expect(decision.state).toBe('DECIDED');
    if (decision.state === 'DECIDED') {
      // Every field a reader could mistake for evidence says what it is, and
      // the period is zero rather than a plausible number.
      expect(decision.basis).toContain('SYNTHETIC-NO-LEGAL-EFFECT');
      expect(decision.approvalReference).toContain('SYNTHETIC-NO-LEGAL-EFFECT');
      expect(decision.packVersion).toContain('SYNTHETIC-NO-LEGAL-EFFECT');
      expect(decision.retentionPeriod).toBe('P0D');
      // And it is not the real Qatar pack, which decides nothing and is not
      // touched by anything in this module.
      expect(decision.packVersion).not.toBe('qa/v1');
    }
  });
});
