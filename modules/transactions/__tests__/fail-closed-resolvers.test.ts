/**
 * The three local-only ports this module publishes refuse outside `local`, and
 * the refusal belongs to the resolver rather than to where the resolver is
 * called from.
 *
 * ## Why this suite exists
 *
 * The AES field-encryption adapter and the keyed dedup-fingerprint adapter
 * used to carry no environment guard at all. They minted their own key
 * material when handed none, and the only thing keeping them out of a deployed
 * process was that the Phase 5 composition root built four OTHER, guarded
 * providers on earlier lines. Anything that disturbed that order — a
 * reordering, an extracted helper, a lazily constructed provider, a second
 * composition entry point — would have put in-process key material into a
 * deployed environment with nothing failing anywhere.
 *
 * So the assertions below deliberately do not compose anything. They call each
 * resolver ON ITS OWN, with no other Phase 5 constructor having run, which is
 * the only way to demonstrate that the refusal is not being borrowed from a
 * neighbour. `FIRST_REFUSAL` goes further and is evaluated before any other
 * statement in this file, at module load: whatever else this suite does
 * afterwards, that one refusal happened with nothing else having run at all.
 *
 * ## What is NOT asserted here
 *
 * That an approved provider exists. There is none, on purpose — this
 * repository ships no cloud or KMS adapter for these ports, and the
 * approved-provider slot stays empty and failing closed until one arrives with
 * the custody and rotation story a readiness review checks. The tests below
 * pass a stub into that slot only to prove the slot is honoured; they never
 * treat the stub as a provider this module supplies.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HsfField } from '../domain/hsf-field.js';
import { HsfFieldEncryptionError } from '../application/ports/hsf-field-encryption.js';
import type { DedupFingerprintPort } from '../application/ports/dedup-fingerprint.js';
import type { HsfFieldEncryptionPort } from '../application/ports/hsf-field-encryption.js';
import type { TransactionRetentionDecisionPort } from '../application/ports/transaction-retention-decision.js';
import {
  LocalAesGcmFieldEncryptionProvider,
  resolveHsfFieldEncryptionPort,
} from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import {
  DedupFingerprintKeyUnavailableError,
  LocalKeyedDedupFingerprintProvider,
  resolveDedupFingerprintPort,
} from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import {
  LocalTransactionRetentionFixtureEnvironmentError,
  resolveTransactionRetentionDecisionPort,
} from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import { BOOKED, account, principal, syntheticMerchant } from './fakes/synthetic-fixtures.js';

/**
 * Evaluated at module load, BEFORE every other statement in this file and
 * before any provider, repository or use case in this module has been
 * constructed. If the guard were still being borrowed from a neighbouring
 * constructor, this would return a working provider holding a fresh AES key.
 */
const FIRST_REFUSAL: unknown = (() => {
  try {
    resolveHsfFieldEncryptionPort({ env: 'production' });
    return null;
  } catch (error) {
    return error;
  }
})();

/** The three deployed environments `KARAR_ENV` accepts besides `local`. */
const DEPLOYED_ENVIRONMENTS = ['dev', 'staging', 'production'] as const;

const PROVIDERS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'infrastructure',
  'providers',
);

describe('the guarded resolver refuses first, on its own', () => {
  it('refused at module load with no other Phase 5 constructor having run', () => {
    // Not `toThrow` on a fresh call: the refusal being asserted is the one that
    // already happened above, before this file did anything else.
    expect(FIRST_REFUSAL).toBeInstanceOf(HsfFieldEncryptionError);
    expect((FIRST_REFUSAL as HsfFieldEncryptionError).kind).toBe('key_unavailable');
  });

  it('refuses the same way when the dedup resolver is the first call instead', () => {
    // The mirror of the case above, with the two resolvers swapped. Neither
    // ordering makes either of them permissive, which is the property the old
    // composition root did not have.
    expect(() => resolveDedupFingerprintPort({ env: 'production' })).toThrow(
      DedupFingerprintKeyUnavailableError,
    );
    expect(() => resolveHsfFieldEncryptionPort({ env: 'production' })).toThrow(
      HsfFieldEncryptionError,
    );
  });
});

describe('every deployed environment gets a typed refusal', () => {
  for (const env of DEPLOYED_ENVIRONMENTS) {
    it(`refuses HSF field encryption in '${env}'`, () => {
      let caught: unknown;
      try {
        resolveHsfFieldEncryptionPort({ env });
      } catch (error) {
        caught = error;
      }
      expect(
        caught,
        `KARAR_ENV='${env}' must not resolve a local encryption provider`,
      ).toBeInstanceOf(HsfFieldEncryptionError);
      expect((caught as HsfFieldEncryptionError).kind).toBe('key_unavailable');
      expect((caught as Error).message).toContain(env);
    });

    it(`refuses dedup fingerprints in '${env}'`, () => {
      let caught: unknown;
      try {
        resolveDedupFingerprintPort({ env });
      } catch (error) {
        caught = error;
      }
      expect(caught, `KARAR_ENV='${env}' must not resolve a local dedup provider`).toBeInstanceOf(
        DedupFingerprintKeyUnavailableError,
      );
      expect((caught as DedupFingerprintKeyUnavailableError).env).toBe(env);
    });

    it(`refuses the retention decision in '${env}'`, () => {
      let caught: unknown;
      try {
        resolveTransactionRetentionDecisionPort({ env });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LocalTransactionRetentionFixtureEnvironmentError);
      expect((caught as LocalTransactionRetentionFixtureEnvironmentError).env).toBe(env);
    });
  }

  it('refuses an unrecognised environment token too, rather than defaulting to permissive', () => {
    // A typo in KARAR_ENV must not read as "not one of the deployed ones,
    // therefore local". Anything that is not exactly `local` is refused.
    for (const env of ['', 'Local', 'LOCAL', 'local ', 'prodcution']) {
      expect(() => resolveHsfFieldEncryptionPort({ env })).toThrow(HsfFieldEncryptionError);
      expect(() => resolveDedupFingerprintPort({ env })).toThrow(
        DedupFingerprintKeyUnavailableError,
      );
      expect(() => resolveTransactionRetentionDecisionPort({ env })).toThrow(
        LocalTransactionRetentionFixtureEnvironmentError,
      );
    }
  });
});

describe('the approved-provider slot', () => {
  it('is honoured in a deployed environment, and is the only thing that opens it', () => {
    // The slot exists so a deployment CAN wire a key-management-backed adapter.
    // This module ships nothing to put in it; the stubs below are the test's,
    // and their presence is what turns the refusal off — not the environment.
    const encryption: HsfFieldEncryptionPort = new LocalAesGcmFieldEncryptionProvider({
      key: Buffer.alloc(32, 7),
    });
    const fingerprints: DedupFingerprintPort = new LocalKeyedDedupFingerprintProvider({
      rootKey: Buffer.alloc(32, 9),
    });
    const retention: TransactionRetentionDecisionPort = {
      decide: () =>
        Promise.resolve({
          state: 'PENDING_LEGAL_REVIEW',
          openQuestion: 'a stub, standing in for a PolicyPack-backed provider',
        }),
    };

    expect(
      resolveHsfFieldEncryptionPort({ env: 'production', approvedProvider: encryption }),
    ).toBe(encryption);
    expect(resolveDedupFingerprintPort({ env: 'production', approvedProvider: fingerprints })).toBe(
      fingerprints,
    );
    expect(
      resolveTransactionRetentionDecisionPort({ env: 'production', approvedProvider: retention }),
    ).toBe(retention);
  });

  it('treats an explicitly null approved provider as absent rather than as permission', () => {
    for (const env of DEPLOYED_ENVIRONMENTS) {
      expect(() => resolveHsfFieldEncryptionPort({ env, approvedProvider: null })).toThrow(
        HsfFieldEncryptionError,
      );
      expect(() => resolveDedupFingerprintPort({ env, approvedProvider: null })).toThrow(
        DedupFingerprintKeyUnavailableError,
      );
      expect(() =>
        resolveTransactionRetentionDecisionPort({ env, approvedProvider: null }),
      ).toThrow(LocalTransactionRetentionFixtureEnvironmentError);
    }
  });
});

describe('local still works, end to end through the resolvers', () => {
  it('encrypts and decrypts a narrative field under the resolved provider', async () => {
    const encryption = resolveHsfFieldEncryptionPort({ env: 'local' });
    const alice = principal();
    const context = {
      table: 'transactions',
      rowId: '33333333-3333-7333-8333-333333333333',
      field: 'merchant',
    } as const;
    const merchant = syntheticMerchant('corner shop');
    const stored = await encryption.encryptField(alice, HsfField.of(merchant), context);
    const read = await encryption.decryptField(alice, stored, context);
    expect(read.reveal()).toBe(merchant);
  });

  it('fingerprints deterministically under the resolved provider', async () => {
    const fingerprints = resolveDedupFingerprintPort({ env: 'local' });
    const alice = principal();
    const input = {
      accountRef: account(),
      bookingDate: BOOKED,
      amountMinorUnits: -4500n,
      currencyCode: 'QAR',
      normalizedNarrative: syntheticMerchant('corner shop'),
    };
    const first = await fingerprints.fingerprint(alice, input);
    const second = await fingerprints.fingerprint(alice, input);
    expect(first.value).toBe(second.value);
    expect(first.version).toBe(fingerprints.version);
  });

  it('answers the retention gate under the fixture, labelled as having no effect', async () => {
    const retention = resolveTransactionRetentionDecisionPort({ env: 'local' });
    const decision = await retention.decide(principal());
    expect(decision.state).toBe('DECIDED');
    // The value itself is never written here — it lives in the devDependency
    // fixture package precisely so it cannot ship. Only its labelling is
    // asserted, and only through the field that says what the answer is worth.
    expect(decision.state === 'DECIDED' && decision.effect).toBe('SYNTHETIC_NO_LEGAL_EFFECT');
  });

  it('lets a local run pin its own key material so ciphertext survives a restart', async () => {
    const pinned = Buffer.alloc(32, 3);
    const alice = principal();
    const context = {
      table: 'transactions',
      rowId: '55555555-5555-7555-8555-555555555555',
      field: 'note',
    } as const;
    const note = syntheticMerchant('monthly rent');
    const first = resolveHsfFieldEncryptionPort({ env: 'local', localKey: pinned });
    const stored = await first.encryptField(alice, HsfField.of(note), context);
    // A different resolver call, standing in for the next process: the same
    // pinned key reads back what the previous one wrote.
    const second = resolveHsfFieldEncryptionPort({ env: 'local', localKey: pinned });
    expect((await second.decryptField(alice, stored, context)).reveal()).toBe(note);
  });
});

describe('no adapter mints key material for itself', () => {
  it('refuses a short dedup root key rather than padding or replacing it', () => {
    expect(() => new LocalKeyedDedupFingerprintProvider({ rootKey: randomBytes(8) })).toThrow();
  });

  it('refuses a wrong-length AES key rather than generating a usable one', () => {
    expect(() => new LocalAesGcmFieldEncryptionProvider({ key: randomBytes(16) })).toThrow(
      HsfFieldEncryptionError,
    );
  });

  /**
   * A source-text assertion, because no runtime call can demonstrate the
   * ABSENCE of a fallback: a constructor that generates a key when handed none
   * looks, from the outside, exactly like one that was handed a good key. The
   * `ports-for-ingestion` suite reads this module's source for the same reason.
   *
   * What is checked is positional: every place a KEY is generated must sit
   * after the point where its resolver has already refused every non-local
   * environment. A generation moved above that line — into a constructor
   * default, a field initialiser, or a helper — fails here.
   */
  it('generates key material only inside a resolver that has already refused non-local', () => {
    const cases: ReadonlyArray<{ file: string; resolver: string; generator: string }> = [
      {
        file: 'local-aes-gcm-field-encryption-provider.ts',
        resolver: 'export function resolveHsfFieldEncryptionPort',
        generator: 'randomBytes(KEY_BYTES)',
      },
      {
        file: 'local-keyed-dedup-fingerprint-provider.ts',
        resolver: 'export function resolveDedupFingerprintPort',
        generator: 'randomBytes(ROOT_KEY_BYTES)',
      },
    ];
    for (const { file, resolver, generator } of cases) {
      const source = fs.readFileSync(path.join(PROVIDERS_DIR, file), 'utf8');
      const resolverAt = source.indexOf(resolver);
      expect(resolverAt, `${file} no longer declares ${resolver}`).toBeGreaterThan(-1);
      const generations = [...source.matchAll(new RegExp(escapeForRegExp(generator), 'g'))];
      expect(
        generations.length,
        `${file} must generate its key exactly once, inside ${resolver}`,
      ).toBe(1);
      expect(
        generations[0]?.index ?? -1,
        `${file} generates key material before ${resolver} has refused non-local environments`,
      ).toBeGreaterThan(resolverAt);
    }
  });
});

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
