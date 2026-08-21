/**
 * The CSV upload body: how a statement reaches the import route, and how the
 * byte bound is enforced on the way.
 *
 * THE BOUND COMES FROM THE CENTRAL POLICY AND NOWHERE ELSE.
 * `INGESTION_LIMIT_POLICIES.csvStatementImport.maxBytes` in
 * packages/platform/src/ingestion/limits.ts is the only number this file
 * knows. Nothing here restates it, defaults it, or accepts it from a request:
 * a caller cannot raise the ceiling it is being held to, and a reader asking
 * "what is the largest statement this accepts?" has one file to open.
 *
 * IT IS CHECKED TWICE, AND BOTH CHECKS ARE NECESSARY.
 *
 *   1. BEFORE READING, against the declared `Content-Length`. This is the
 *      cheap refusal: a 200 MB upload is rejected on its header instead of
 *      being streamed through the process first.
 *   2. WHILE READING, against the accumulated length, on every chunk. This is
 *      the one that actually holds: `Content-Length` is a claim by the
 *      client. A chunked upload declares nothing at all, and a lying one
 *      declares whatever gets it past step 1. The stream is aborted the
 *      moment the accumulated count crosses the bound.
 *
 * NOTHING IS TRUNCATED TO FIT. A statement cut short is a wrong financial
 * record that looks exactly like a right one — the whole month is there
 * except the part that was not, and nobody can see which. Crossing the bound
 * is a refusal, with a stable code and the bound named in it.
 *
 * WHY A CONTENT-TYPE PARSER AT ALL. Fastify decides whether a body is
 * parseable before any handler runs, and refuses an unregistered media type
 * itself — which would answer this route from outside the module's error
 * boundary, with a shape the contract does not describe. Registering one
 * parser puts that decision back inside the route: `text/csv` becomes a
 * stream the handler consumes under the bound above, and every other media
 * type becomes a sentinel the handler answers 415 for, through the same
 * problem writer as every other failure.
 */

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';

/** The one media type this ingestion path accepts. */
export const CSV_MEDIA_TYPE = 'text/csv';

/** The bounds this path is held to, from the central policy. */
const CSV_LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

/**
 * What the parser hands a handler when the body was not `text/csv`.
 *
 * A sentinel rather than an error, so the refusal is written by the route's
 * own problem mapper (415, `UNSUPPORTED_MEDIA_TYPE`) instead of by Fastify's
 * error path, which knows nothing about RFC 7807.
 */
export const UNSUPPORTED_BODY = Symbol.for('karar.api.financial.unsupported-body');

/** Thrown by the bounded reader when the accumulated length crosses the bound. */
export class StatementSourceTooLargeError extends Error {
  override readonly name = 'StatementSourceTooLargeError';
  readonly limitBytes = CSV_LIMITS.maxBytes;
  constructor() {
    super('the statement exceeds the declared byte bound for this ingestion path');
  }
}

/** The minimum of a Node readable this file needs; fastify is not a dependency. */
interface ByteStream extends AsyncIterable<Uint8Array> {
  resume(): unknown;
  destroy(error?: Error): unknown;
}

interface ParserRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  /** Present on Fastify requests; the parser runs after routing. */
  readonly url?: string;
}

type ParserDone = (error: Error | null, body?: unknown) => void;

interface ContentTypeParserHost {
  addContentTypeParser(
    matcher: RegExp,
    parser: (request: ParserRequest, payload: ByteStream, done: ParserDone) => void,
  ): unknown;
}

function headerValue(request: ParserRequest, name: string): string | undefined {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value : undefined;
}

/** The media type without its parameters: `text/csv; charset=utf-8` is CSV. */
function essenceOf(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

/**
 * CHECK ONE: the declared length, before a byte is read.
 *
 * A missing or unparseable `Content-Length` is NOT a refusal — a chunked
 * upload legitimately has none — it simply means this check cannot answer,
 * and the check that always can is the one below.
 */
export function declaredLengthExceedsBound(contentLength: string | undefined): boolean {
  if (contentLength === undefined) return false;
  const declared = Number(contentLength);
  return Number.isFinite(declared) && declared > CSV_LIMITS.maxBytes;
}

/**
 * CHECK TWO: the accumulated length, on every chunk.
 *
 * The generator yields each chunk as it arrives — nothing accumulates in
 * memory but the counter — and throws the moment the total crosses the bound,
 * which tears down the read rather than finishing it and discarding the
 * result.
 */
export async function* boundedBytes(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
  let read = 0;
  for await (const chunk of source) {
    read += chunk.byteLength;
    if (read > CSV_LIMITS.maxBytes) throw new StatementSourceTooLargeError();
    yield chunk;
  }
}

/**
 * Drains a body this route will not accept, under the same bound.
 *
 * A stream nobody reads leaves the connection open until it times out; a
 * stream read without a bound is the unbounded read this whole file exists to
 * prevent. So the drain counts too, and destroys the stream once it has seen
 * enough to know the caller is not going to stop.
 */
function drainBounded(payload: ByteStream): void {
  let read = 0;
  const onData = (chunk: Uint8Array): void => {
    read += chunk.byteLength;
    if (read > CSV_LIMITS.maxBytes) payload.destroy();
  };
  (payload as unknown as { on(event: string, listener: (chunk: Uint8Array) => void): void }).on(
    'data',
    onData,
  );
  payload.resume();
}

/**
 * Registers the parser on the running HTTP adapter.
 *
 * Called from a module's `onModuleInit`, so both entrypoints that build the
 * application — `main.ts` and the runtime-conformance harness — get the same
 * parser without either of them knowing it exists. A parser registered in
 * only one of them would make the conformance suite prove something about a
 * server nobody runs.
 *
 * The matcher is a RegExp rather than the exact media type on purpose: it is
 * consulted only for content types Fastify has no exact parser for, which
 * leaves `application/json` and the form parsers exactly as they were for
 * every other route in the service, and gives this route a body it can answer
 * 415 about instead of a framework error it cannot shape.
 */
/**
 * The one route that uploads bytes: `POST /financial/statement-imports/:id/source`.
 *
 * The catch-all matcher below is registered on the SHARED Fastify instance,
 * because that is the only instance there is — so without this guard the
 * parser answers for every route in the service, and any request carrying a
 * media type Fastify has no exact parser for stops getting Fastify's own 415
 * and starts getting the UNSUPPORTED_BODY symbol as its body. No route was
 * found that would proceed on such a body, but "no route does this today" is a
 * property of every other route rather than of this file, and it is not one
 * this file can keep true.
 */
const SOURCE_UPLOAD_PATH = /^\/financial\/statement-imports\/[^/?#]+\/source(?:[?#]|$)/;

/** True when this request targets the upload route this parser exists for. */
function targetsSourceUpload(request: ParserRequest): boolean {
  return typeof request.url === 'string' && SOURCE_UPLOAD_PATH.test(request.url);
}

export function registerCsvContentTypeParser(host: ContentTypeParserHost): void {
  // ANCHORED, and Fastify asks for that in a security warning rather than a
  // style note: an unanchored matcher leaves it unable to tell the essence
  // MIME type from its parameters, which is how a body labelled
  // `text/csv; boundary=…` gets routed by a parser that never looked past the
  // first character. The essence is compared inside the parser too.
  host.addContentTypeParser(/^.*$/, (request, payload, done) => {
    // Every other route keeps the framework's behaviour, including its 415.
    if (!targetsSourceUpload(request)) {
      done(new UnsupportedMediaTypeError(), undefined);
      return;
    }
    if (essenceOf(headerValue(request, 'content-type')) !== CSV_MEDIA_TYPE) {
      drainBounded(payload);
      done(null, UNSUPPORTED_BODY);
      return;
    }
    // The stream itself, unread. The handler consumes it through
    // `boundedBytes`, so the second check runs on the real chunks and the
    // process never holds a whole statement.
    done(null, payload);
  });
}

/**
 * What a route outside this parser's scope gets: the same 415 Fastify would
 * have produced itself, carrying the status code it sets on the error.
 */
class UnsupportedMediaTypeError extends Error {
  readonly statusCode = 415;

  constructor() {
    super('Unsupported Media Type');
    this.name = 'UnsupportedMediaTypeError';
  }
}

/** True when the parser handed the handler a body it must refuse. */
export function isUnsupportedBody(body: unknown): boolean {
  return body === UNSUPPORTED_BODY;
}

/** True when the body is the CSV stream this route expects. */
export function isByteStream(body: unknown): body is AsyncIterable<Uint8Array> {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function'
  );
}

/** The declared byte bound, for a refusal that names what it enforced. */
export function csvSourceByteBound(): number {
  return CSV_LIMITS.maxBytes;
}
