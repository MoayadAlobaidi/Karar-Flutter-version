/**
 * The limit policy's own tests.
 *
 * These are not about whether 10 MiB is the right ceiling — that is a revisable
 * engineering choice. They are about whether a malformed policy can reach a
 * running process, because the failure this file prevents is an unbounded
 * parser, and an unbounded parser looks exactly like a bounded one until it
 * meets a large file.
 */
import { describe, expect, it } from 'vitest';

import {
  INGESTION_LIMIT_POLICIES,
  InvalidIngestionLimitPolicyError,
  assertIngestionLimitPoliciesValid,
  assertValidIngestionLimitPolicy,
  ingestionLimitPolicyFor,
  type IngestionLimitPolicy,
} from './limits.js';

const NUMERIC_FIELDS: readonly (keyof IngestionLimitPolicy)[] = [
  'maxBytes',
  'maxRows',
  'maxColumns',
  'maxFieldBytes',
  'maxPageSize',
  'defaultPageSize',
  'maxBufferedRows',
  'maxBufferedBytes',
  'deadlineMs',
  'maxReportedErrors',
  'maxBatchSize',
];

function valid(): IngestionLimitPolicy {
  return { ...INGESTION_LIMIT_POLICIES.csvStatementImport };
}

describe('the declared policies are usable', () => {
  it('every declared policy validates', () => {
    expect(() => assertIngestionLimitPoliciesValid()).not.toThrow();
  });

  it('declares at least the manual and CSV paths', () => {
    // Non-vacuity: a registry that emptied would make every assertion here
    // pass while leaving every ingestion path unbounded.
    const ids = Object.values(INGESTION_LIMIT_POLICIES).map((p) => p.pathId);
    expect(ids).toContain('manual-transaction');
    expect(ids).toContain('csv-statement-import');
  });

  it('resolves a declared path and refuses an undeclared one', () => {
    // MEASURED, not chosen. See the policy's own comment: the parse and the
    // commit each run inside one interactive transaction, and 50,000 rows —
    // the number this asserted until the Phase 5 closeout — could not be
    // reached by an order of magnitude. The failure was a RETRYABLE 503 for a
    // file that would never import.
    expect(ingestionLimitPolicyFor('csv-statement-import').maxRows).toBe(2_000);
    expect(() => ingestionLimitPolicyFor('no-such-path')).toThrow(InvalidIngestionLimitPolicyError);
  });

  it('bounds the manual path too, at exactly one row', () => {
    // The manual path is the one most likely to be waved through as "it is
    // only one transaction". One is a bound; absent is not.
    expect(INGESTION_LIMIT_POLICIES.manualTransaction.maxRows).toBe(1);
  });
});

describe('a malformed policy cannot reach a running process', () => {
  for (const field of NUMERIC_FIELDS) {
    it(`rejects a missing ${field}`, () => {
      const policy = valid();
      // Through `unknown`: the compiler is right that the two types do not
      // overlap, and the point of the test is to build the malformed shape a
      // careless caller could hand us at runtime.
      delete (policy as unknown as Record<string, unknown>)[field];
      expect(() => assertValidIngestionLimitPolicy(policy)).toThrow(
        InvalidIngestionLimitPolicyError,
      );
    });

    it(`rejects a zero ${field}`, () => {
      expect(() => assertValidIngestionLimitPolicy({ ...valid(), [field]: 0 })).toThrow(
        InvalidIngestionLimitPolicyError,
      );
    });

    it(`rejects a negative ${field}`, () => {
      expect(() => assertValidIngestionLimitPolicy({ ...valid(), [field]: -1 })).toThrow(
        InvalidIngestionLimitPolicyError,
      );
    });

    it(`rejects a non-finite ${field}`, () => {
      // Infinity is the shape "unlimited" would take if anyone tried to express
      // it, which is precisely what must not be expressible.
      expect(() =>
        assertValidIngestionLimitPolicy({ ...valid(), [field]: Number.POSITIVE_INFINITY }),
      ).toThrow(InvalidIngestionLimitPolicyError);
    });
  }

  it('rejects an empty pathId', () => {
    expect(() => assertValidIngestionLimitPolicy({ ...valid(), pathId: '' })).toThrow(
      InvalidIngestionLimitPolicyError,
    );
  });

  it('rejects a default page larger than the maximum page', () => {
    expect(() =>
      assertValidIngestionLimitPolicy({ ...valid(), defaultPageSize: 500, maxPageSize: 200 }),
    ).toThrow(/defaultPageSize/);
  });

  it('rejects buffering more rows than the row ceiling allows', () => {
    expect(() =>
      assertValidIngestionLimitPolicy({ ...valid(), maxBufferedRows: 60_000, maxRows: 50_000 }),
    ).toThrow(/maxBufferedRows/);
  });

  it('rejects buffering more bytes than the byte ceiling allows', () => {
    expect(() =>
      assertValidIngestionLimitPolicy({ ...valid(), maxBufferedBytes: 32 * 1024 * 1024 }),
    ).toThrow(/maxBufferedBytes/);
  });

  it('rejects two paths sharing one id', () => {
    // A refusal problem names the path. Two paths under one name makes a
    // refusal untraceable to the thing that refused.
    const duplicate = { a: valid(), b: { ...valid() } };
    expect(() => assertIngestionLimitPoliciesValid(duplicate)).toThrow(/declared more than once/);
  });
});
