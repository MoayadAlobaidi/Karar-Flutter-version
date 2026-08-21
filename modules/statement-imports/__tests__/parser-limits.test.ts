/**
 * The parser: RFC 4180 correctness, and every declared bound at limit−1,
 * exactly-limit and limit+1.
 *
 * The three-point pattern is the whole point of this file. A resource ceiling
 * is the classic off-by-one, and an off-by-one on a resource ceiling only
 * shows up in production: the file that is exactly at the limit is the one
 * nobody tests and the one a real bank export lands on.
 *
 * Every limit comes from a policy built here from the DECLARED one
 * (`csvStatementImport`), narrowed so a test can reach it in milliseconds.
 * The values are narrowed, never invented — the shape and the field names are
 * the platform's, so a field added to the policy shows up here as a type
 * error rather than as an unenforced bound.
 */

import { describe, expect, it } from 'vitest';

import {
  INGESTION_LIMIT_POLICIES,
  assertValidIngestionLimitPolicy,
  type IngestionLimitPolicy,
} from '@karar/platform/dist/ingestion/limits.js';

import { CsvParseRefusedError } from '../application/ports/csv-parser.js';
import type { ParsedRow } from '../application/ports/csv-parser.js';
import { StreamingCsvParser } from '../infrastructure/parsing/streaming-csv-parser.js';
import { bytesOf, chunkedStreamOf, streamOf } from './fixtures.js';

/** The declared policy, narrowed for a test. Every field is still the real one. */
function policy(overrides: Partial<IngestionLimitPolicy> = {}): IngestionLimitPolicy {
  const narrowed: IngestionLimitPolicy = {
    ...INGESTION_LIMIT_POLICIES.csvStatementImport,
    ...overrides,
  };
  // The platform's own validator, so a narrowed policy that could not exist in
  // production cannot be used to make a bound look enforced.
  assertValidIngestionLimitPolicy(narrowed);
  return narrowed;
}

const FAR_FUTURE = new Date('2099-01-01T00:00:00.000Z');

async function readAll(
  csv: string,
  limits: IngestionLimitPolicy,
  options: {
    readonly hasHeaderRow?: boolean;
    readonly now?: () => Date;
    readonly deadlineAt?: Date;
    readonly signal?: AbortSignal;
    readonly chunkSize?: number;
  } = {},
): Promise<readonly ParsedRow[]> {
  const parser = new StreamingCsvParser();
  const bytes = bytesOf(csv);
  const result = await parser.parse({
    source:
      options.chunkSize === undefined
        ? streamOf(bytes)
        : chunkedStreamOf(bytes, options.chunkSize),
    limits,
    hasHeaderRow: options.hasHeaderRow ?? false,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    deadlineAt: options.deadlineAt ?? FAR_FUTURE,
    now: options.now ?? (() => new Date('2026-08-12T09:00:00.000Z')),
  });
  const rows: ParsedRow[] = [];
  for await (const row of result.rows) rows.push(row);
  return rows;
}

async function refusalOf(
  csv: string,
  limits: IngestionLimitPolicy,
  options: Parameters<typeof readAll>[2] = {},
): Promise<string> {
  try {
    await readAll(csv, limits, options);
    return 'ACCEPTED';
  } catch (error) {
    if (error instanceof CsvParseRefusedError) return error.code;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// RFC 4180
// ---------------------------------------------------------------------------

describe('RFC 4180 quoting', () => {
  it('reads plain fields, quoted fields, and quotes inside quoted fields', async () => {
    const rows = await readAll(
      'a,"b,with,commas","c said ""hello""",d\n',
      policy(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fields).toEqual(['a', 'b,with,commas', 'c said "hello"', 'd']);
  });

  it('reads newlines inside a quoted field as content, not as a record end', async () => {
    const rows = await readAll('a,"line one\nline two",c\n', policy());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fields[1]).toBe('line one\nline two');
  });

  it('accepts CRLF, LF and a mixture of the two', async () => {
    const rows = await readAll('a,b\r\nc,d\ne,f\r\n', policy());
    expect(rows.map((row) => row.fields)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });

  it('reads a final record with no trailing newline', async () => {
    const rows = await readAll('a,b\nc,d', policy());
    expect(rows).toHaveLength(2);
    expect(rows[1]?.fields).toEqual(['c', 'd']);
  });

  it('skips blank lines rather than staging them as empty rows', async () => {
    const rows = await readAll('a,b\n\n\nc,d\n', policy());
    expect(rows.map((row) => row.rowNumber)).toEqual([1, 2]);
  });

  it('takes the header out of the data rows when the caller says there is one', async () => {
    const rows = await readAll('Date,Amount\n2026-08-12,45.00\n', policy(), {
      hasHeaderRow: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowNumber).toBe(1);
    expect(rows[0]?.fields).toEqual(['2026-08-12', '45.00']);
  });

  it('REFUSES an unterminated quoted field rather than guessing where it ends', async () => {
    expect(await refusalOf('a,"never closed\n', policy())).toBe('MALFORMED_QUOTING');
  });
});

describe('determinism across chunk boundaries', () => {
  it('reads identically whatever size the chunks are', async () => {
    const csv = 'a,"b,with,commas",شركة ٧\nc,"d\ne",f\n';
    const whole = await readAll(csv, policy());
    for (const chunkSize of [1, 2, 3, 7, 13]) {
      const chunked = await readAll(csv, policy(), { chunkSize });
      expect(chunked.map((row) => row.fields)).toEqual(whole.map((row) => row.fields));
    }
  });
});

// ---------------------------------------------------------------------------
// Encoding and content refusals
// ---------------------------------------------------------------------------

describe('content refusals', () => {
  async function refusalOfBytes(bytes: Uint8Array): Promise<string> {
    const parser = new StreamingCsvParser();
    try {
      const result = await parser.parse({
        source: streamOf(bytes),
        limits: policy(),
        hasHeaderRow: false,
        deadlineAt: FAR_FUTURE,
        now: () => new Date('2026-08-12T09:00:00.000Z'),
      });
      for await (const _row of result.rows) void _row;
      return 'ACCEPTED';
    } catch (error) {
      if (error instanceof CsvParseRefusedError) return error.code;
      throw error;
    }
  }

  it('REFUSES invalid UTF-8 rather than substituting a replacement character', async () => {
    // A lone continuation byte. Repaired, it would become U+FFFD inside a
    // merchant name — committed, fingerprinted, and invisible afterwards.
    expect(await refusalOfBytes(new Uint8Array([0x61, 0x2c, 0xff, 0x0a]))).toBe(
      'INVALID_ENCODING',
    );
  });

  it('REFUSES a truncated multi-byte sequence at the end of the file', async () => {
    expect(await refusalOfBytes(new Uint8Array([0x61, 0x2c, 0xd8]))).toBe('INVALID_ENCODING');
  });

  it('REFUSES a spreadsheet by signature, as a whole file', async () => {
    // An .xlsx IS a zip, so it decodes to plausible garbage rather than
    // failing — which is why the signature check exists.
    expect(await refusalOfBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe(
      'SPREADSHEET_CONTENT',
    );
    expect(await refusalOfBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0x00]))).toBe(
      'SPREADSHEET_CONTENT',
    );
  });

  it('REFUSES compressed content by signature', async () => {
    expect(await refusalOfBytes(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]))).toBe(
      'COMPRESSED_CONTENT',
    );
  });

  it('REFUSES binary content', async () => {
    expect(await refusalOfBytes(new Uint8Array([0x61, 0x00, 0x62, 0x0a]))).toBe(
      'BINARY_CONTENT',
    );
    expect(await refusalOfBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(
      'BINARY_CONTENT',
    );
  });

  it('accepts a UTF-8 BOM and does not leave it in the first field', async () => {
    const rows = await readAll('﻿a,b\n', policy());
    expect(rows[0]?.fields).toEqual(['a', 'b']);
  });
});

// ---------------------------------------------------------------------------
// The bounds, at limit−1 / exactly-limit / limit+1
// ---------------------------------------------------------------------------

describe('maxRows', () => {
  const MAX = 10;
  const limits = policy({ maxRows: MAX, maxBufferedRows: 4 });
  const rowsCsv = (count: number) =>
    Array.from({ length: count }, (_, index) => `r${index},1.00`).join('\n') + '\n';

  it('accepts limit − 1', async () => {
    expect(await readAll(rowsCsv(MAX - 1), limits)).toHaveLength(MAX - 1);
  });
  it('accepts exactly the limit', async () => {
    expect(await readAll(rowsCsv(MAX), limits)).toHaveLength(MAX);
  });
  it('REFUSES limit + 1, and refuses rather than truncating', async () => {
    expect(await refusalOf(rowsCsv(MAX + 1), limits)).toBe('TOO_MANY_ROWS');
  });
});

describe('maxColumns', () => {
  const MAX = 8;
  const limits = policy({ maxColumns: MAX });
  const columnsCsv = (count: number) => Array.from({ length: count }, () => 'x').join(',') + '\n';

  it('accepts limit − 1', async () => {
    expect((await readAll(columnsCsv(MAX - 1), limits))[0]?.fields).toHaveLength(MAX - 1);
  });
  it('accepts exactly the limit', async () => {
    expect((await readAll(columnsCsv(MAX), limits))[0]?.fields).toHaveLength(MAX);
  });
  it('REFUSES limit + 1', async () => {
    expect(await refusalOf(columnsCsv(MAX + 1), limits)).toBe('TOO_MANY_COLUMNS');
  });
});

describe('maxFieldBytes', () => {
  const MAX = 32;
  const limits = policy({ maxFieldBytes: MAX });
  const fieldCsv = (bytes: number) => `${'x'.repeat(bytes)}\n`;

  it('accepts limit − 1', async () => {
    expect((await readAll(fieldCsv(MAX - 1), limits))[0]?.fields[0]).toHaveLength(MAX - 1);
  });
  it('accepts exactly the limit', async () => {
    expect((await readAll(fieldCsv(MAX), limits))[0]?.fields[0]).toHaveLength(MAX);
  });
  it('REFUSES limit + 1, and refuses rather than shortening', async () => {
    expect(await refusalOf(fieldCsv(MAX + 1), limits)).toBe('FIELD_TOO_LARGE');
  });
  it('counts UTF-8 BYTES, not characters', async () => {
    // Arabic characters are two bytes each: 20 of them are 40 bytes and must
    // be refused under a 32-byte ceiling, even though they are 20 characters.
    expect(await refusalOf(`${'ش'.repeat(20)}\n`, limits)).toBe('FIELD_TOO_LARGE');
  });
});

describe('maxBytes', () => {
  const MAX = 64;
  const limits = policy({ maxBytes: MAX, maxBufferedBytes: MAX, maxFieldBytes: MAX });
  // One byte per row of payload plus the newline, so the size is exact.
  const bytesCsv = (total: number) => 'a\n'.repeat(total / 2);

  it('accepts limit − 1 (rounded to a whole record)', async () => {
    await expect(readAll(bytesCsv(MAX - 2), limits)).resolves.toHaveLength((MAX - 2) / 2);
  });
  it('accepts exactly the limit', async () => {
    await expect(readAll(bytesCsv(MAX), limits)).resolves.toHaveLength(MAX / 2);
  });
  it('REFUSES limit + 1', async () => {
    expect(await refusalOf(`${bytesCsv(MAX)}b\n`, limits)).toBe('SOURCE_TOO_LARGE');
  });
});

describe('maxBufferedBytes', () => {
  const MAX = 48;
  // An unterminated quoted field is what turns "streaming" into "buffering
  // the whole file with extra steps", so it is what this bound is tested with.
  const limits = policy({ maxBufferedBytes: MAX, maxFieldBytes: 4096, maxBytes: 4096 });
  const heldCsv = (bytes: number) => `"${'x'.repeat(bytes)}`;

  it('accepts limit − 1 held in one record', async () => {
    // Still unterminated, so it refuses for QUOTING rather than for BUFFER —
    // which is the assertion: the buffer bound was not the one that fired.
    expect(await refusalOf(heldCsv(MAX - 1), limits)).toBe('MALFORMED_QUOTING');
  });
  it('accepts exactly the limit held in one record', async () => {
    expect(await refusalOf(heldCsv(MAX), limits)).toBe('MALFORMED_QUOTING');
  });
  it('REFUSES limit + 1', async () => {
    expect(await refusalOf(heldCsv(MAX + 1), limits)).toBe('BUFFERED_BYTES_EXCEEDED');
  });
});

describe('maxBufferedRows', () => {
  // The one bound that is BACK-PRESSURE rather than a refusal: refusing a
  // file for having more rows than the buffer would refuse every real
  // statement. The evidence is therefore the high-water mark — the parser
  // holds at most the bound, whatever the file's size — plus the fact that
  // nothing is truncated.
  const MAX = 4;
  const limits = policy({ maxBufferedRows: MAX, maxRows: 1000 });
  const rowsCsv = (count: number) =>
    Array.from({ length: count }, (_, index) => `r${index},1.00`).join('\n') + '\n';

  async function highWaterFor(rows: number): Promise<{ held: number; delivered: number }> {
    const parser = new StreamingCsvParser();
    const result = await parser.parse({
      source: streamOf(bytesOf(rowsCsv(rows))),
      limits,
      hasHeaderRow: false,
      deadlineAt: FAR_FUTURE,
      now: () => new Date('2026-08-12T09:00:00.000Z'),
    });
    let delivered = 0;
    for await (const _row of result.rows) {
      void _row;
      delivered += 1;
    }
    return { held: parser.rowBufferHighWaterMark, delivered };
  }

  it('holds fewer than the bound for a file smaller than it (limit − 1)', async () => {
    const { held, delivered } = await highWaterFor(MAX - 1);
    expect(held).toBeLessThanOrEqual(MAX);
    expect(delivered).toBe(MAX - 1);
  });
  it('holds at most the bound for a file exactly its size', async () => {
    const { held, delivered } = await highWaterFor(MAX);
    expect(held).toBeLessThanOrEqual(MAX);
    expect(delivered).toBe(MAX);
  });
  it('still holds at most the bound for a file far larger, and delivers every row', async () => {
    const { held, delivered } = await highWaterFor(MAX * 50 + 1);
    expect(held).toBeLessThanOrEqual(MAX);
    expect(delivered).toBe(MAX * 50 + 1);
  });
});

describe('deadlineMs', () => {
  const limits = policy({ maxRows: 1000 });
  const rowsCsv = (count: number) =>
    Array.from({ length: count }, (_, index) => `r${index},1.00`).join('\n') + '\n';

  /** A clock that advances one millisecond per reading. */
  function tickingClock(startMs: number): () => Date {
    let current = startMs;
    return () => {
      current += 1;
      return new Date(current);
    };
  }

  const START = Date.parse('2026-08-12T09:00:00.000Z');

  it('accepts a parse that finishes one tick INSIDE the deadline', async () => {
    const rows = await readAll(rowsCsv(5), limits, {
      now: tickingClock(START),
      deadlineAt: new Date(START + 100),
    });
    expect(rows).toHaveLength(5);
  });

  it('accepts a parse that finishes exactly ON the deadline', async () => {
    // The check is `>` rather than `>=`: a parse that lands exactly on its
    // budget spent exactly its budget and did not exceed it.
    const rows = await readAll(rowsCsv(5), limits, {
      now: tickingClock(START),
      deadlineAt: new Date(START + 6),
    });
    expect(rows).toHaveLength(5);
  });

  it('REFUSES a parse that crosses the deadline, and stages nothing', async () => {
    expect(
      await refusalOf(rowsCsv(50), limits, {
        now: tickingClock(START),
        deadlineAt: new Date(START + 5),
      }),
    ).toBe('DEADLINE_EXCEEDED');
  });
});

describe('cancellation', () => {
  it('stops on an aborted signal, as its own outcome rather than as a timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      await refusalOf('a,b\nc,d\n', policy(), { signal: controller.signal }),
    ).toBe('CANCELLED');
  });
});

// ---------------------------------------------------------------------------
// Cost of consuming a character
// ---------------------------------------------------------------------------

/**
 * The parser used to measure the in-progress record by RE-ENCODING it on every
 * character, which made a parse quadratic in record length. Because a record
 * carries no bound until one of the byte counters trips, the entire cost was
 * paid before the bound could refuse anything: a 200 KB body with no delimiter
 * and no newline held the event loop for 48.7 seconds and then answered
 * FIELD_TOO_LARGE. Node runs one thread, and `POST /financial/statement-
 * imports/:importId/parse` awaits this parse inline, so that was every tenant's
 * request stalled by one authenticated upload well inside every declared limit.
 *
 * These tests pin the two properties that fix depends on, so the quadratic form
 * cannot come back unnoticed.
 */
describe('a pathological record cannot buy unbounded work', () => {
  it('refuses a field with no delimiter and no newline in time that stays flat', async () => {
    // Quadratic cost would show as ~4x per doubling. The assertion is on the
    // RATIO rather than on any absolute duration, so a slow or loaded machine
    // does not turn this into a flake: what is being tested is the shape of
    // the growth, not the speed of the host.
    const limits = policy({ maxFieldBytes: 4 * 1024 * 1024, maxBufferedBytes: 8 * 1024 * 1024 });
    const timed = async (n: number): Promise<number> => {
      const started = process.hrtime.bigint();
      await refusalOf('a'.repeat(n), limits);
      return Number(process.hrtime.bigint() - started) / 1e6;
    };
    await timed(50_000); // warm, so JIT does not pay for the first measurement
    const small = await timed(100_000);
    const large = await timed(400_000);
    // Four times the input. Linear predicts ~4x, quadratic predicts ~16x.
    // A generous ceiling still separates them decisively.
    expect(large / Math.max(small, 0.5)).toBeLessThan(8);
  });

  it('bounds the field AS IT GROWS, not only where it ends', async () => {
    // No delimiter and no newline anywhere: under the old code the field bound
    // was reached only at end-of-input, so the whole body was consumed first.
    const limits = policy({ maxFieldBytes: 64, maxBufferedBytes: 8 * 1024 * 1024 });
    expect(await refusalOf('a'.repeat(500_000), limits)).toBe('FIELD_TOO_LARGE');
  });

  it('reaches its DEADLINE inside a single record, where there is no boundary to check at', async () => {
    // The deadline used to be checked only at chunk and record boundaries. An
    // input that is one chunk and one unterminated record reaches neither, so
    // the declared wall-clock budget could not stop it — which is exactly how
    // a 48-second parse survived a 30-second deadline.
    const START = Date.parse('2026-08-12T09:00:00.000Z');
    let calls = 0;
    const clock = (): Date => {
      calls += 1;
      // Still inside the budget for the first few reads, then past it.
      return new Date(START + (calls > 2 ? 10_000 : 0));
    };
    const limits = policy({ maxFieldBytes: 4 * 1024 * 1024, maxBufferedBytes: 8 * 1024 * 1024 });
    expect(
      await refusalOf('a'.repeat(200_000), limits, {
        now: clock,
        deadlineAt: new Date(START + 1_000),
      }),
    ).toBe('DEADLINE_EXCEEDED');
  });
});

describe('the byte counters agree with the encoder', () => {
  // The counters are maintained incrementally, so a wrong width silently moves
  // every byte bound. They are checked against TextEncoder over content that
  // uses all four UTF-8 widths, including an astral code point.
  const SAMPLES = ['plain', 'Ω', 'ß', 'رصيد', 'مصرف الراجحي', '𝄞', '👨‍👩‍👧‍👦', 'a٤b'];

  for (const sample of SAMPLES) {
    it(`bounds ${JSON.stringify(sample)} at exactly its encoded length`, async () => {
      const exact = bytesOf(sample).byteLength;
      // At the bound: accepted. One byte under it: refused. That pair pins the
      // count exactly — an over- or under-count moves one of the two.
      expect(await refusalOf(sample, policy({ maxFieldBytes: exact }))).toBe('ACCEPTED');
      expect(await refusalOf(sample, policy({ maxFieldBytes: exact - 1 }))).toBe('FIELD_TOO_LARGE');
    });
  }
});
