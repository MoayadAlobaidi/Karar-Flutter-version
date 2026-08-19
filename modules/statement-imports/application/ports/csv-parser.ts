/**
 * `CsvParserPort` — turning a stream of bytes into a stream of field arrays,
 * inside declared bounds, with a deadline, and cancellably.
 *
 * ## Why the parser is a PORT and not a function in the domain
 *
 * Everything about it is I/O-shaped: it consumes an async byte stream, it
 * watches a clock for a deadline, and it honours an abort signal. None of
 * those belong in a layer that must be deterministic and clock-free
 * (architecture test 11). What IS in the domain is the part that matters for
 * correctness — how a field's text becomes a financial fact — and that lives
 * in `normalization.ts` and `statement-row.ts`, where it can be tested with
 * no stream, no clock and no mocks.
 *
 * ## Streaming is a contract term, not an implementation detail
 *
 * The port yields rows as it reads them and never materialises the file. That
 * is what makes the declared 10 MiB ceiling a policy rather than a hope: a
 * parser that buffered the whole file would be bounded by the heap, and the
 * failure mode of a heap bound is a process that dies rather than a request
 * that is refused. The buffered-row and buffered-byte limits below exist for
 * the same reason one layer down — a "streaming" parser that accumulates
 * every parsed row before yielding is a buffering parser with a generator on
 * top.
 *
 * ## Every limit comes from the central policy, and none is invented here
 *
 * `packages/platform/src/ingestion/limits.ts` is where the numbers live, for
 * the reason its own header gives: the legacy had no numbers at all, because
 * every bound lived wherever the code happened to need one. This port takes a
 * whole `IngestionLimitPolicy` rather than eleven arguments, so a caller
 * cannot pass ten of them and forget the eleventh.
 *
 * ## REJECT, NEVER TRUNCATE
 *
 * Every bound produces a typed refusal that names which bound was hit. There
 * is no path that returns the first N rows, no path that drops an over-long
 * field, and no path that reports success on a partial read. A silently
 * shortened statement is a wrong financial record that looks like a right
 * one, and it is discovered — if ever — by a person wondering why their
 * balance is off.
 *
 * ## What is refused before parsing starts
 *
 * `text/csv` only. Invalid UTF-8, content with NUL bytes, and the signatures
 * of spreadsheets and archives are refused as whole-file refusals rather than
 * as thousands of per-line errors: a person who uploaded an `.xlsx` needs to
 * be told it is a spreadsheet, not shown 900 encoding errors.
 */

import type { IngestionLimitPolicy } from '@karar/platform/dist/ingestion/limits.js';

import type { UntrustedSourceText } from '../../domain/content-trust.js';
import type { ImportRefusalCode } from '../../domain/reason-codes.js';

/** One parsed line: its 1-based data-row number and its fields, in order. */
export interface ParsedRow {
  readonly rowNumber: number;
  readonly fields: readonly string[];
}

/**
 * The header line, when the caller said the file has one.
 *
 * **The fields are wrapped, and the row's are not, and the asymmetry is the
 * whole point.** A data row's fields go straight into `mapStatementRow`, which
 * reads them BY INDEX and turns each into a typed fact or a typed refusal — a
 * closed pipeline with one entrance and one exit. A header goes nowhere: no
 * mapping consults it, no refusal quotes it, and nothing in this module
 * decides anything from its text (see `reason-codes.ts`). It is carried only
 * so a client can show a person which columns exist.
 *
 * That makes it the one value in this module with no destination and no
 * validation — which is exactly the value that ends up in a log line, an
 * exception message or an analytics event by accident. `UntrustedSourceText`
 * renders as a redaction everywhere except an explicit `reveal()`, so the
 * accident is not available.
 */
export interface ParsedHeader {
  readonly fields: readonly UntrustedSourceText[];
}

/** Why a parse stopped short. Always names the bound or the content problem. */
export class CsvParseRefusedError extends Error {
  override readonly name = 'CsvParseRefusedError';

  constructor(
    readonly code: ImportRefusalCode,
    message: string,
    /** The 1-based data row the refusal occurred at, when it was a row. */
    readonly rowNumber: number | null = null,
  ) {
    super(message);
  }
}

export interface CsvParseRequest {
  /** The decrypted bytes, streamed. Never a buffer. */
  readonly source: AsyncIterable<Uint8Array>;
  /** The declared policy — `csvStatementImport`, resolved by the caller. */
  readonly limits: IngestionLimitPolicy;
  /** Whether the first line is a header. Stated by the caller; never sniffed. */
  readonly hasHeaderRow: boolean;
  /**
   * Cancellation. A person who navigates away, or a request that is torn
   * down, must not leave a parser reading a 10 MiB file for thirty more
   * seconds — and a parser that cannot be cancelled makes the deadline the
   * only way to stop it, which turns every cancellation into a timeout.
   */
  readonly signal?: AbortSignal;
  /**
   * The deadline as an absolute instant, supplied by the caller from its
   * Clock. Absolute rather than a duration so the port never reads a clock to
   * decide when it started — the caller owns time, and a parse that is
   * resumed or retried does not silently get a fresh budget.
   */
  readonly deadlineAt: Date;
  /** Reads the current instant. The one clock dependency, injected. */
  readonly now: () => Date;
}

export interface CsvParseResult {
  readonly header: ParsedHeader | null;
  /** Yields rows as they are read. Throws `CsvParseRefusedError` on any bound. */
  readonly rows: AsyncIterable<ParsedRow>;
}

export interface CsvParserPort {
  /** The version this implementation is. Stored on every committed transaction. */
  readonly version: string;

  /**
   * Begins a parse. The returned iterable is lazy: nothing is read until the
   * caller pulls, and abandoning the iterable stops the read.
   */
  parse(request: CsvParseRequest): Promise<CsvParseResult>;
}
