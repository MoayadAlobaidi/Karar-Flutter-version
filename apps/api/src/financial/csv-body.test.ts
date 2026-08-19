// THE BYTE BOUND, AND THAT IT IS THE CENTRAL ONE.
//
// Two properties are worth proving, and neither is provable by reading the
// code:
//
//   1. The number this path enforces IS the number in
//      packages/platform/src/ingestion/limits.ts. A copy that drifted would
//      still look right in review — that is exactly the failure the central
//      registry exists to prevent — so the test compares against the registry
//      rather than a literal of its own.
//   2. The bound holds WHILE READING, not only against the declared
//      Content-Length. `Content-Length` is a claim by the client; a chunked
//      upload declares nothing, and a lying one declares whatever gets it
//      past the first check.
import { describe, expect, it } from 'vitest';

import {
  StatementSourceTooLargeError,
  boundedBytes,
  csvSourceByteBound,
  declaredLengthExceedsBound,
  isByteStream,
  isUnsupportedBody,
} from './csv-body.js';
import { CSV_STATEMENT_LIMITS } from './use-cases.js';

async function* chunks(sizes: readonly number[]): AsyncGenerator<Uint8Array> {
  for (const size of sizes) yield new Uint8Array(size);
}

async function drain(source: AsyncIterable<Uint8Array>): Promise<number> {
  let total = 0;
  for await (const chunk of source) total += chunk.byteLength;
  return total;
}

describe('the byte bound is the central one', () => {
  it('enforces exactly the declared maxBytes for this ingestion path', () => {
    expect(csvSourceByteBound()).toBe(CSV_STATEMENT_LIMITS.maxBytes);
    // And the policy this path names is the CSV one, not the manual one.
    expect(CSV_STATEMENT_LIMITS.pathId).toBe('csv-statement-import');
  });
});

describe('check one — the declared length, before a byte is read', () => {
  it('refuses a Content-Length above the bound', () => {
    expect(declaredLengthExceedsBound(String(CSV_STATEMENT_LIMITS.maxBytes + 1))).toBe(true);
  });

  it('accepts one exactly at the bound', () => {
    expect(declaredLengthExceedsBound(String(CSV_STATEMENT_LIMITS.maxBytes))).toBe(false);
  });

  it('does not refuse a request that declares nothing', () => {
    // A chunked upload legitimately has no Content-Length. This check simply
    // cannot answer for it, which is why the second check exists.
    expect(declaredLengthExceedsBound(undefined)).toBe(false);
    expect(declaredLengthExceedsBound('not-a-number')).toBe(false);
  });
});

describe('check two — the accumulated length, on every chunk', () => {
  it('passes a stream that stays inside the bound', async () => {
    const read = await drain(boundedBytes(chunks([1_000, 2_000, 3_000])));
    expect(read).toBe(6_000);
  });

  it('throws the MOMENT the running total crosses the bound', async () => {
    // The stream is torn down rather than read to the end and discarded, and
    // nothing is truncated to fit: a statement cut short is a wrong financial
    // record that looks exactly like a right one.
    const oversized = chunks([CSV_STATEMENT_LIMITS.maxBytes, 1]);
    await expect(drain(boundedBytes(oversized))).rejects.toBeInstanceOf(
      StatementSourceTooLargeError,
    );
  });

  it('catches a body that LIED about its declared length', async () => {
    // The case the first check cannot see: a small Content-Length and a large
    // body. The second check is the one that actually holds.
    expect(declaredLengthExceedsBound('10')).toBe(false);
    await expect(
      drain(boundedBytes(chunks([CSV_STATEMENT_LIMITS.maxBytes + 1]))),
    ).rejects.toBeInstanceOf(StatementSourceTooLargeError);
  });

  it('names the bound it enforced, so a refusal is actionable', () => {
    expect(new StatementSourceTooLargeError().limitBytes).toBe(CSV_STATEMENT_LIMITS.maxBytes);
  });
});

describe('the body the route accepts', () => {
  it('recognises a byte stream', () => {
    expect(isByteStream(chunks([1]))).toBe(true);
    expect(isByteStream({ some: 'json' })).toBe(false);
    expect(isByteStream(null)).toBe(false);
  });

  it('recognises the sentinel the parser hands over for any other media type', () => {
    // A sentinel rather than a framework error, so the 415 is written by this
    // service's own problem writer rather than by Fastify's error path.
    expect(isUnsupportedBody(Symbol.for('karar.api.financial.unsupported-body'))).toBe(true);
    expect(isUnsupportedBody({ some: 'json' })).toBe(false);
  });
});
