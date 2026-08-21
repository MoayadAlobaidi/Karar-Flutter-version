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
  registerCsvContentTypeParser,
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

describe('the catch-all parser answers only for the route it exists for', () => {
  // The matcher is `/^.*$/` on the SHARED Fastify instance, because that is the
  // only instance there is. Registered without a scope guard it answered for
  // every route in the service: any request carrying a media type Fastify has
  // no exact parser for stopped getting Fastify's own 415 and started getting
  // the UNSUPPORTED_BODY sentinel as its body. Nothing was found that would
  // proceed on such a body, but that was a property of every other route rather
  // than of this file, and not one this file could keep true.
  interface Registered {
    readonly parser: (
      request: { headers: Record<string, string>; url?: string },
      payload: unknown,
      done: (error: Error | null, body?: unknown) => void,
    ) => void;
  }

  function register(): Registered {
    let captured: Registered['parser'] | null = null;
    registerCsvContentTypeParser({
      addContentTypeParser: (_matcher: RegExp, parser: Registered['parser']) => {
        captured = parser;
        return undefined;
      },
    } as never);
    if (captured === null) throw new Error('no parser registered');
    return { parser: captured };
  }

  /**
   * A payload the parser can drain. `drainBounded` attaches Node stream
   * listeners, so an async generator is not enough for the refusal paths.
   */
  function streamStub(): AsyncGenerator<Uint8Array> & {
    on(event: string, listener: (chunk: Uint8Array) => void): unknown;
    resume(): unknown;
    destroy(): void;
  } {
    const stream = chunks([]) as AsyncGenerator<Uint8Array> & Record<string, unknown>;
    stream['on'] = () => stream;
    stream['resume'] = () => stream;
    stream['destroy'] = () => undefined;
    return stream as never;
  }

  function answer(url: string | undefined, contentType: string): { error: Error | null; body: unknown } {
    const { parser } = register();
    let outcome: { error: Error | null; body: unknown } = { error: null, body: undefined };
    parser(
      { headers: { 'content-type': contentType }, ...(url === undefined ? {} : { url }) },
      streamStub(),
      (error, body) => {
        outcome = { error, body };
      },
    );
    return outcome;
  }

  const UPLOAD = '/financial/statement-imports/01J0000000000000000000000A/source';

  it('hands the upload route its stream', () => {
    const { error, body } = answer(UPLOAD, 'text/csv');
    expect(error).toBeNull();
    expect(isByteStream(body)).toBe(true);
  });

  it('hands the upload route the sentinel for any other media type', () => {
    const { error, body } = answer(UPLOAD, 'application/xml');
    expect(error).toBeNull();
    expect(isUnsupportedBody(body)).toBe(true);
  });

  it('refuses 415 for every other route rather than handing over a sentinel', () => {
    for (const url of [
      '/auth/login',
      '/financial/transactions',
      '/financial/statement-imports',
      '/financial/statement-imports/01J0000000000000000000000A',
      '/financial/statement-imports/01J0000000000000000000000A/parse',
      undefined,
    ]) {
      const { error, body } = answer(url, 'application/xml');
      expect({ url, unsupported: isUnsupportedBody(body) }).toEqual({ url, unsupported: false });
      expect(error).not.toBeNull();
      expect((error as { statusCode?: number } | null)?.statusCode).toBe(415);
    }
  });

  it('does not treat a lookalike path as the upload route', () => {
    for (const url of [
      '/financial/statement-imports/x/source/extra',
      '/other/financial/statement-imports/x/source',
      '/financial/statement-imports//source',
    ]) {
      const { error } = answer(url, 'text/csv');
      expect({ url, refused: error !== null }).toEqual({ url, refused: true });
    }
  });

  it('accepts the upload route with a query string', () => {
    const { error, body } = answer(`${UPLOAD}?x=1`, 'text/csv');
    expect(error).toBeNull();
    expect(isByteStream(body)).toBe(true);
  });
});
