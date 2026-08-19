/**
 * The streaming, bounded, cancellable CSV reader.
 *
 * ## Streaming is the property, not the adjective
 *
 * The parser never holds the file. It decodes chunk by chunk, parses
 * character by character, and yields each row as it completes. The only thing
 * it accumulates is the record currently being read — and that is bounded
 * too, by `maxBufferedBytes`, because an unterminated quoted field is exactly
 * the input that turns "streaming" into "buffering the whole file with extra
 * steps".
 *
 * A parser that buffered the file would make the declared 10 MiB ceiling a
 * property of the heap rather than of the policy, and the failure mode of a
 * heap bound is a process that dies rather than a request that is refused.
 *
 * ## Every bound comes from the declared policy
 *
 * `packages/platform/src/ingestion/limits.ts` owns the numbers. Nothing here
 * restates one, and there is no constant in this file that a policy field
 * does not supply. Eight bounds are enforced:
 *
 * | Bound | Refusal | Reached by |
 * |---|---|---|
 * | `maxBytes` | `SOURCE_TOO_LARGE` | raw bytes consumed |
 * | `maxRows` | `TOO_MANY_ROWS` | data rows produced |
 * | `maxColumns` | `TOO_MANY_COLUMNS` | fields in one row |
 * | `maxFieldBytes` | `FIELD_TOO_LARGE` | UTF-8 bytes in one field |
 * | `maxBufferedBytes` | `BUFFERED_BYTES_EXCEEDED` | the in-progress record |
 * | `maxBufferedRows` | *back-pressure* | rows held before yielding |
 * | `deadlineMs` | `DEADLINE_EXCEEDED` | wall clock, at row boundaries |
 * | (cancellation) | `CANCELLED` | the caller's `AbortSignal` |
 *
 * **`maxBufferedRows` is the one that is back-pressure rather than a
 * refusal, and deliberately.** It bounds how many completed rows may sit in
 * memory before the consumer takes one. Refusing a file for having more rows
 * than the buffer would refuse every real statement — the buffer is 500 and a
 * statement legitimately has thousands. So the parser stops parsing and
 * yields instead, and the evidence that the bound holds is the high-water
 * mark, which the parser reports for exactly that purpose.
 *
 * ## REJECT, NEVER TRUNCATE
 *
 * Every refusal above throws `CsvParseRefusedError` naming the bound. There
 * is no path that returns the first N rows, no path that drops an over-long
 * field, and no path that reports success on a partial read.
 *
 * ## What is refused before a line is read
 *
 * Invalid UTF-8 (`fatal: true`, so a malformed sequence throws rather than
 * becoming U+FFFD in somebody's merchant name), NUL bytes, and the magic
 * numbers of spreadsheets and archives. A person who uploaded an `.xlsx`
 * needs to be told it is a spreadsheet, not shown nine hundred encoding
 * errors — and an `.xlsx` IS a zip, so it decodes to plausible-looking
 * garbage rather than failing outright.
 *
 * ## Determinism
 *
 * Given the same bytes and the same policy, the same rows. Chunk boundaries
 * do not affect the result: the decoder is stateful across chunks (`stream:
 * true`) and the record parser carries its own state, so a field split across
 * two chunks — or across a multi-byte character's bytes — reads identically
 * to one that was not.
 */

import type {
  CsvParseRequest,
  CsvParseResult,
  CsvParserPort,
  ParsedHeader,
  ParsedRow,
} from '../../application/ports/csv-parser.js';
import { CsvParseRefusedError } from '../../application/ports/csv-parser.js';
import { UPLOADED_FILE_CONTENT, UntrustedSourceText } from '../../domain/content-trust.js';

/** Stored on every committed transaction's provenance. */
export const CSV_PARSER_VERSION = 'statement-csv/rfc4180-streaming/v1';

/**
 * File signatures this parser refuses outright.
 *
 * Named by what a person would call the file rather than by the format, so
 * the refusal a client renders is about the thing they uploaded. The list is
 * short on purpose: it covers what people actually export a statement as by
 * mistake, and it is a REFUSAL list rather than an allow list — sniffing what
 * a file IS from its bytes is exactly what this module refuses to do for the
 * media type.
 */
const REFUSED_SIGNATURES: readonly {
  readonly bytes: readonly number[];
  readonly code: 'SPREADSHEET_CONTENT' | 'COMPRESSED_CONTENT' | 'BINARY_CONTENT';
  readonly what: string;
}[] = [
  // PK\x03\x04 — a zip, which is what an .xlsx, .ods and .numbers all are.
  { bytes: [0x50, 0x4b, 0x03, 0x04], code: 'SPREADSHEET_CONTENT', what: 'a spreadsheet or a zip archive' },
  // OLE2 compound file — a legacy .xls or .doc.
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], code: 'SPREADSHEET_CONTENT', what: 'a legacy spreadsheet' },
  { bytes: [0x1f, 0x8b], code: 'COMPRESSED_CONTENT', what: 'a gzip archive' },
  { bytes: [0x42, 0x5a, 0x68], code: 'COMPRESSED_CONTENT', what: 'a bzip2 archive' },
  { bytes: [0x37, 0x7a, 0xbc, 0xaf], code: 'COMPRESSED_CONTENT', what: 'a 7-zip archive' },
  { bytes: [0x52, 0x61, 0x72, 0x21], code: 'COMPRESSED_CONTENT', what: 'a RAR archive' },
  { bytes: [0x25, 0x50, 0x44, 0x46], code: 'BINARY_CONTENT', what: 'a PDF' },
];

const QUOTE = '"';
const DELIMITER = ',';

export class StreamingCsvParser implements CsvParserPort {
  readonly version = CSV_PARSER_VERSION;

  /**
   * The most rows this parser has ever held at once, across every parse.
   *
   * Exposed so the buffered-row bound can be evidenced rather than asserted:
   * a test runs a file far larger than the bound and reads this. It is a
   * diagnostic, not a contract — nothing in the pipeline reads it.
   */
  #rowBufferHighWaterMark = 0;

  get rowBufferHighWaterMark(): number {
    return this.#rowBufferHighWaterMark;
  }

  parse(request: CsvParseRequest): Promise<CsvParseResult> {
    const state = new ParseState(request, (held) => {
      if (held > this.#rowBufferHighWaterMark) this.#rowBufferHighWaterMark = held;
    });
    // The header is not known until the first record is read, and the first
    // record is not read until the caller pulls — so `header` is a getter
    // rather than a value. Making it a value would force this method to read
    // ahead before returning, which is the one thing a streaming reader must
    // not do.
    return Promise.resolve({
      get header(): ParsedHeader | null {
        return state.header;
      },
      rows: { [Symbol.asyncIterator]: () => state.run() },
    });
  }
}

/**
 * One parse, with all of its counters.
 *
 * A class rather than a closure because the counters are the interesting part
 * of this file: having them named on one object makes it possible to read, in
 * one place, exactly what is bounded and what is not.
 */
class ParseState {
  #bytesConsumed = 0;
  #dataRows = 0;
  /** The record being read: completed fields plus the field in progress. */
  #fields: string[] = [];
  #current = '';
  #inQuotes = false;
  /** True immediately after a closing quote, to detect `""` escapes. */
  #quoteJustClosed = false;
  /** True when the record has any content, so a trailing newline is not a row. */
  #recordStarted = false;
  #headerTaken = false;
  #headerColumnCount: number | null = null;

  constructor(
    private readonly request: CsvParseRequest,
    private readonly observeHeld: (held: number) => void,
  ) {}

  #header: ParsedHeader | null = null;

  /** The header row, once the first record has been read. `null` before that. */
  get header(): ParsedHeader | null {
    return this.#header;
  }

  async *run(): AsyncGenerator<ParsedRow> {
    const { limits, source } = this.request;
    // `fatal: true` is the whole point: a malformed UTF-8 sequence throws
    // instead of becoming U+FFFD inside somebody's merchant name, where it
    // would be committed, fingerprinted, and impossible to notice.
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
    let first = true;
    const pending: ParsedRow[] = [];

    for await (const chunk of source) {
      this.#checkCancelled();
      this.#checkDeadline();

      if (first) {
        first = false;
        this.#refuseKnownSignature(chunk);
      }

      this.#bytesConsumed += chunk.byteLength;
      if (this.#bytesConsumed > limits.maxBytes) {
        throw new CsvParseRefusedError(
          'SOURCE_TOO_LARGE',
          `this statement exceeds the declared ceiling of ${limits.maxBytes} bytes and was ` +
            'refused rather than truncated',
        );
      }

      let text: string;
      try {
        text = decoder.decode(chunk, { stream: true });
      } catch {
        throw new CsvParseRefusedError(
          'INVALID_ENCODING',
          'these bytes are not valid UTF-8. They are refused rather than repaired: a replacement ' +
            'character substituted into a merchant name is committed, fingerprinted, and ' +
            'invisible afterwards',
        );
      }

      for (const character of text) {
        const row = this.#consume(character, limits);
        if (row !== null) {
          pending.push(row);
          this.observeHeld(pending.length);
          // BACK-PRESSURE, not a refusal. The parser stops reading and hands
          // rows over rather than growing a buffer no bound would then mean
          // anything.
          if (pending.length >= limits.maxBufferedRows) {
            while (pending.length > 0) {
              const next = pending.shift();
              if (next !== undefined) yield next;
            }
            this.#checkCancelled();
            this.#checkDeadline();
          }
        }
      }

      while (pending.length > 0) {
        const next = pending.shift();
        if (next !== undefined) yield next;
      }
    }

    // Flush the decoder: an incomplete multi-byte sequence at the very end is
    // invalid UTF-8, and `stream: false` is what makes it say so.
    try {
      const tail = decoder.decode();
      for (const character of tail) {
        const row = this.#consume(character, limits);
        if (row !== null) yield row;
      }
    } catch {
      throw new CsvParseRefusedError(
        'INVALID_ENCODING',
        'these bytes end in an incomplete UTF-8 sequence, so the file is truncated or is not ' +
          'text. It is refused rather than read up to the break',
      );
    }

    if (this.#inQuotes) {
      throw new CsvParseRefusedError(
        'MALFORMED_QUOTING',
        'a quoted field is never closed, so where this record ends cannot be decided. Guessing ' +
          'would silently merge two statement lines into one',
      );
    }
    // A file that does not end in a newline still has a last row.
    if (this.#recordStarted) {
      const row = this.#finishRecord(limits);
      if (row !== null) yield row;
    }
  }

  /**
   * Feeds one character through the RFC 4180 state machine.
   *
   * Returns the completed record, or `null` while one is still being read.
   * CRLF and LF are both record terminators and a lone CR is ignored: real
   * exports mix them, sometimes within one file, and treating a stray CR as
   * content would put an invisible character at the end of every merchant
   * name.
   */
  #consume(character: string, limits: CsvParseRequest['limits']): ParsedRow | null {
    if (this.#inQuotes) {
      if (this.#quoteJustClosed) {
        this.#quoteJustClosed = false;
        if (character === QUOTE) {
          // `""` inside a quoted field is one literal quote.
          this.#appendToField(QUOTE, limits);
          return null;
        }
        this.#inQuotes = false;
        return this.#consumeUnquoted(character, limits);
      }
      if (character === QUOTE) {
        this.#quoteJustClosed = true;
        return null;
      }
      this.#appendToField(character, limits);
      return null;
    }
    return this.#consumeUnquoted(character, limits);
  }

  #consumeUnquoted(character: string, limits: CsvParseRequest['limits']): ParsedRow | null {
    if (character === QUOTE && this.#current === '') {
      this.#inQuotes = true;
      this.#recordStarted = true;
      return null;
    }
    if (character === DELIMITER) {
      this.#pushField(limits);
      this.#recordStarted = true;
      return null;
    }
    if (character === '\n') {
      if (!this.#recordStarted && this.#fields.length === 0 && this.#current === '') {
        // A blank line between records. Skipped rather than staged as an
        // empty row: a person did not write it and a reason code about it
        // would be noise on a review screen.
        return null;
      }
      return this.#finishRecord(limits);
    }
    if (character === '\r') return null;
    this.#appendToField(character, limits);
    this.#recordStarted = true;
    return null;
  }

  #appendToField(character: string, limits: CsvParseRequest['limits']): void {
    this.#current += character;
    // The in-progress RECORD is what is bounded, not just the field: an
    // unterminated quote grows the field, and a row with ten thousand tiny
    // fields grows the record. Both are the same memory.
    const held = this.#recordByteLength();
    if (held > limits.maxBufferedBytes) {
      throw new CsvParseRefusedError(
        'BUFFERED_BYTES_EXCEEDED',
        `one record exceeds the declared in-memory ceiling of ${limits.maxBufferedBytes} bytes. ` +
          'The usual cause is a quoted field that is never closed, which would otherwise make ' +
          'the whole file one record',
      );
    }
  }

  #pushField(limits: CsvParseRequest['limits']): void {
    const bytes = byteLengthOf(this.#current);
    if (bytes > limits.maxFieldBytes) {
      throw new CsvParseRefusedError(
        'FIELD_TOO_LARGE',
        `one field exceeds the declared ceiling of ${limits.maxFieldBytes} bytes. It is refused ` +
          'rather than shortened: a truncated statement narrative is a wrong record that looks ' +
          'like a right one',
        this.#dataRows + 1,
      );
    }
    this.#fields.push(this.#current);
    this.#current = '';
    if (this.#fields.length > limits.maxColumns) {
      throw new CsvParseRefusedError(
        'TOO_MANY_COLUMNS',
        `one record has more than the declared ceiling of ${limits.maxColumns} columns`,
        this.#dataRows + 1,
      );
    }
  }

  #finishRecord(limits: CsvParseRequest['limits']): ParsedRow | null {
    this.#pushField(limits);
    const fields = this.#fields;
    this.#fields = [];
    this.#current = '';
    this.#inQuotes = false;
    this.#quoteJustClosed = false;
    this.#recordStarted = false;

    if (!this.#headerTaken && this.request.hasHeaderRow) {
      this.#headerTaken = true;
      this.#headerColumnCount = fields.length;
      // The header is kept so a caller can show which columns exist. It is
      // NEVER used to decide what a column MEANS: a header is content from
      // the file, and matching on its text is how a mapping starts depending
      // on a string that can carry an account number.
      //
      // It is wrapped rather than kept as a string, and the wrapper is not
      // decoration: this is the one value in the module that no code consumes
      // and no rule validates, which makes it the one that reaches a log line
      // by accident. `UntrustedSourceText` renders as a redaction everywhere
      // but an explicit `reveal()`. The text itself is untouched — nothing is
      // trimmed, escaped or prefixed, because what the file said is the fact.
      this.#header = {
        fields: Object.freeze(
          fields.map((field) => UntrustedSourceText.of(field, UPLOADED_FILE_CONTENT)),
        ),
      };
      return null;
    }
    if (this.#headerColumnCount === null) this.#headerColumnCount = fields.length;

    this.#dataRows += 1;
    if (this.#dataRows > limits.maxRows) {
      throw new CsvParseRefusedError(
        'TOO_MANY_ROWS',
        `this statement has more than the declared ceiling of ${limits.maxRows} rows and was ` +
          'refused rather than truncated. A statement that silently lost its last thousand ' +
          'lines is a wrong balance nobody can explain',
        this.#dataRows,
      );
    }
    this.#checkDeadline();
    return { rowNumber: this.#dataRows, fields: Object.freeze([...fields]) };
  }

  #recordByteLength(): number {
    let total = byteLengthOf(this.#current);
    for (const field of this.#fields) total += byteLengthOf(field);
    return total;
  }

  #checkDeadline(): void {
    if (this.request.now().getTime() > this.request.deadlineAt.getTime()) {
      throw new CsvParseRefusedError(
        'DEADLINE_EXCEEDED',
        'this parse exceeded its declared wall-clock budget and was stopped. Nothing was staged: ' +
          'a partially parsed statement is not a shorter statement',
      );
    }
  }

  #checkCancelled(): void {
    if (this.request.signal?.aborted === true) {
      throw new CsvParseRefusedError(
        'CANCELLED',
        'this parse was cancelled by the caller. Cancellation is a first-class outcome rather ' +
          'than a timeout: a person who navigated away should not leave a reader working through ' +
          'ten megabytes for another thirty seconds',
      );
    }
  }

  #refuseKnownSignature(chunk: Uint8Array): void {
    for (const signature of REFUSED_SIGNATURES) {
      if (signature.bytes.every((byte, index) => chunk[index] === byte)) {
        throw new CsvParseRefusedError(
          signature.code,
          `this file is ${signature.what}, not a CSV. It is refused as a whole rather than read ` +
            'line by line, because a person who uploaded the wrong file needs to be told which ' +
            'file they uploaded — not shown a thousand encoding errors',
        );
      }
    }
    // A NUL byte in the first chunk is the cheapest binary tell there is, and
    // it is also refused later by the domain's control-character rule; here it
    // stops a whole file rather than every line of one.
    if (chunk.includes(0)) {
      throw new CsvParseRefusedError(
        'BINARY_CONTENT',
        'this file contains NUL bytes, so it is binary rather than text. It is refused as a ' +
          'whole rather than read line by line',
      );
    }
  }
}

/** UTF-8 byte length without allocating an encoder per call. */
const ENCODER = new TextEncoder();
function byteLengthOf(value: string): number {
  return ENCODER.encode(value).byteLength;
}
