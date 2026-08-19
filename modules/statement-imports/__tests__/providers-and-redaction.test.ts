/**
 * The LOCAL providers' refusals, and the redaction rule.
 *
 * Two claims are under test, and both are the kind that is usually only
 * written in a comment:
 *
 *  1. **A local adapter cannot exist outside `KARAR_ENV=local`, and a
 *     non-local environment with nothing wired gets a throw rather than a
 *     fallback.** Refusing to construct is the guarantee; a comment saying
 *     "do not use in production" is not.
 *  2. **No failure this module returns carries a driver message, a key, or a
 *     fragment of the statement — and the `cause` that does carry the
 *     original throw is NON-ENUMERABLE**, so `JSON.stringify`, object spread,
 *     structured logging and an RFC 7807 body all drop it without anyone
 *     remembering to.
 */

import { describe, expect, it } from 'vitest';

import {
  accountAccessUnavailable,
  commitFailed,
  fingerprintUnavailable,
  sourceStoreUnavailable,
  storeFailure,
} from '../application/errors.js';
import { EncryptedSourceStoreError } from '../application/ports/encrypted-source-store.js';
import { HSF_REDACTION, HsfField } from '../domain/hsf-field.js';
import { SourceObjectRef } from '../domain/encrypted-source.js';
import { LocalAesGcmFieldEncryptionProvider, resolveHsfFieldEncryptionPort } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import {
  LocalEncryptedSourceStore,
  LocalSourceStoreEnvironmentError,
  resolveEncryptedSourceStorePort,
} from '../infrastructure/providers/local-encrypted-source-store.js';
import {
  LocalKeyedFileFingerprintProvider,
  fileFingerprintsEqual,
} from '../infrastructure/providers/local-keyed-file-fingerprint-provider.js';
import {
  LocalRetentionFixtureEnvironmentError,
  LocalSyntheticRetentionDecisionProvider,
  resolveRetentionDecisionPort,
} from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import { ACTOR_A1, ACTOR_A2, ACTOR_B1, bytesOf, streamOf } from './fixtures.js';
// The marker is IMPORTED, never typed. `tsc` emits these tests into the same
// dist/ a deployment ships, so a fixture value written here travels exactly as
// far as one written in source — which the retention closure test proves by
// scanning every dist/ in the production closure.
import { SYNTHETIC_RETENTION_MARKER } from '@karar/financial-retention-local-fixtures';

const NON_LOCAL = ['dev', 'staging', 'production', 'prod', 'test', ''] as const;

describe('the local providers refuse to exist outside a local environment', () => {
  it.each(NON_LOCAL)('the encrypted source store refuses KARAR_ENV=%s', (env) => {
    expect(() => new LocalEncryptedSourceStore({ env })).toThrow(LocalSourceStoreEnvironmentError);
  });

  it.each(NON_LOCAL)('the HSF field encryption provider refuses KARAR_ENV=%s', (env) => {
    expect(() => new LocalAesGcmFieldEncryptionProvider({ env })).toThrow();
  });

  it.each(NON_LOCAL)('the retention fixture refuses KARAR_ENV=%s', (env) => {
    expect(() => new LocalSyntheticRetentionDecisionProvider({ env })).toThrow(
      LocalRetentionFixtureEnvironmentError,
    );
  });
});

describe('the resolvers refuse rather than substitute', () => {
  it.each(NON_LOCAL)('the source store throws for KARAR_ENV=%s with nothing wired', (env) => {
    // No fallback, no "temporarily use the local one", no silently disabled
    // encryption. The failure is at construction, before a single statement
    // has been handled.
    expect(() => resolveEncryptedSourceStorePort({ env })).toThrow(EncryptedSourceStoreError);
  });

  it.each(NON_LOCAL)('field encryption throws for KARAR_ENV=%s with nothing wired', (env) => {
    expect(() => resolveHsfFieldEncryptionPort({ env })).toThrow();
  });

  it.each(NON_LOCAL)('retention throws for KARAR_ENV=%s with nothing wired', (env) => {
    expect(() => resolveRetentionDecisionPort({ env })).toThrow(
      LocalRetentionFixtureEnvironmentError,
    );
  });

  it('accepts an approved provider in any environment, which is the point of the seam', () => {
    const approved = new LocalEncryptedSourceStore({ env: 'local' });
    expect(resolveEncryptedSourceStorePort({ env: 'production', approvedProvider: approved })).toBe(
      approved,
    );
  });
});

describe('the retention fixture labels itself as having no legal effect', () => {
  it('answers DECIDED with a self-describing basis and a marked effect', async () => {
    const provider = new LocalSyntheticRetentionDecisionProvider({ env: 'local' });
    const decision = await provider.decideFor(ACTOR_A1, 'statement_import_source');
    expect(decision.state).toBe('DECIDED');
    if (decision.state !== 'DECIDED') return;
    // A field rather than a naming convention, so the fact survives a log
    // line, a serialized payload, and a reader who never opened the adapter.
    expect(decision.effect).toBe('SYNTHETIC_NO_LEGAL_EFFECT');
    expect(decision.basis).toContain(SYNTHETIC_RETENTION_MARKER);
    expect(decision.approvalReference).toContain(SYNTHETIC_RETENTION_MARKER);
    expect(decision.packVersion).toContain(SYNTHETIC_RETENTION_MARKER);
    // Zero, deliberately: a plausible-looking period is the one value here
    // somebody could paste into a deployment and believe.
    expect(decision.retentionPeriod).toBe('P0D');
  });
});

describe('the file fingerprint is keyed, per subject, and versioned', () => {
  const provider = new LocalKeyedFileFingerprintProvider({
    rootKey: new Uint8Array(32).fill(7),
  });
  const bytes = bytesOf('Booking Date,Description,Amount\n2026-08-10,SYNTHETIC,−1.00\n');

  it('is stable for the same subject and the same bytes', async () => {
    const first = await provider.fingerprint(ACTOR_A1, streamOf(bytes));
    const second = await provider.fingerprint(ACTOR_A1, streamOf(bytes));
    expect(first).toBe(second);
  });

  it('DIFFERS for two members of ONE tenant — the case a tenant key would miss', async () => {
    const a1 = await provider.fingerprint(ACTOR_A1, streamOf(bytes));
    const a2 = await provider.fingerprint(ACTOR_A2, streamOf(bytes));
    expect(a1).not.toBe(a2);
  });

  it('DIFFERS across tenants', async () => {
    const a1 = await provider.fingerprint(ACTOR_A1, streamOf(bytes));
    const b1 = await provider.fingerprint(ACTOR_B1, streamOf(bytes));
    expect(a1).not.toBe(b1);
  });

  it('DIFFERS under a different root key — it is keyed, not a plain digest', async () => {
    const other = new LocalKeyedFileFingerprintProvider({ rootKey: new Uint8Array(32).fill(9) });
    expect(await provider.fingerprint(ACTOR_A1, streamOf(bytes))).not.toBe(
      await other.fingerprint(ACTOR_A1, streamOf(bytes)),
    );
  });

  it('never compares values across versions', () => {
    expect(
      fileFingerprintsEqual({ value: 'abc', version: 'v1' }, { value: 'abc', version: 'v2' }),
    ).toBe(false);
    expect(
      fileFingerprintsEqual({ value: 'abc', version: 'v1' }, { value: 'abc', version: 'v1' }),
    ).toBe(true);
  });
});

describe('the source object reference is opaque', () => {
  it('REFUSES a URI, because a provider address must not reach the domain', () => {
    expect(() => SourceObjectRef.of('s3://bucket/key')).toThrow();
    expect(() => SourceObjectRef.of('https://example.invalid/x')).toThrow();
    expect(() => SourceObjectRef.of('file:///tmp/x')).toThrow();
  });

  it('REFUSES whitespace — a handle with a space in it is a path or a sentence', () => {
    expect(() => SourceObjectRef.of('local src 1')).toThrow();
  });

  it('accepts an opaque token', () => {
    expect(SourceObjectRef.of('local-src-0123456789abcdef')).toBe('local-src-0123456789abcdef');
  });
});

describe('HSF values redact themselves on every accidental rendering path', () => {
  const field = HsfField.of('SYNTHETIC MERCHANT ONE');

  it('renders as a marker in a template literal, a log line, and JSON', () => {
    expect(`${field}`).toBe(HSF_REDACTION);
    expect(String(field)).toBe(HSF_REDACTION);
    expect(JSON.stringify({ merchant: field })).toBe(`{"merchant":"${HSF_REDACTION}"}`);
    expect(JSON.stringify(field)).toBe(`"${HSF_REDACTION}"`);
  });

  it('yields the plaintext only through a grep-able call', () => {
    expect(field.reveal()).toBe('SYNTHETIC MERCHANT ONE');
  });
});

describe('failures carry a stable message and a non-enumerable cause', () => {
  const driverThrow = Object.assign(
    new Error('duplicate key value violates unique constraint "transactions_dedup_key" DETAIL: Key (dedup_fingerprint)=(SECRET) already exists'),
    { code: '23505' },
  );

  const failures = [
    storeFailure('stage the parsed statement', driverThrow),
    sourceStoreUnavailable(driverThrow),
    fingerprintUnavailable(driverThrow),
    accountAccessUnavailable(driverThrow),
    commitFailed(driverThrow),
  ];

  it.each(failures.map((failure) => [failure.kind, failure] as const))(
    '%s drops its cause from every serialization',
    (_kind, failure) => {
      // A field that must not be serialized is safer as a field that cannot
      // be. `JSON.stringify`, object spread and `Object.keys` all drop it.
      expect(JSON.stringify(failure)).not.toContain('SECRET');
      expect(JSON.stringify(failure)).not.toContain('23505');
      expect(JSON.stringify(failure)).not.toContain('transactions_dedup_key');
      expect(Object.keys(failure)).not.toContain('cause');
      expect(JSON.stringify({ ...failure })).not.toContain('SECRET');
    },
  );

  it.each(failures.map((failure) => [failure.kind, failure] as const))(
    '%s still hands the original throw to the boundary logger',
    (_kind, failure) => {
      // Non-enumerable does not mean absent: the one place allowed to log it
      // can still reach it.
      expect((failure as { cause?: unknown }).cause).toBe(driverThrow);
    },
  );

  it('never interpolates driver text into the message', () => {
    for (const failure of failures) {
      expect(failure.message).not.toContain('duplicate key');
      expect(failure.message).not.toContain('SECRET');
      expect(failure.message.length).toBeGreaterThan(40);
    }
  });
});
