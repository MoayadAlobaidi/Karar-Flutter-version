/**
 * The ONE place an RFC 7807 document is written to the wire.
 *
 * THE DEFECT THIS CLOSES. `GlobalExceptionFilter` has always stamped
 * `application/problem+json` on THROWN failures. Five modules — tenancy,
 * users, bootstrap, jurisdiction, and the consent CONTENT route — answered
 * their failures through Fastify's reply object instead, so 25 (operation,
 * status) pairs sent a problem BODY under Fastify's default
 * `application/json`. A generated client that dispatches on Content-Type saw
 * two error models from one API: a problem document on one path and an
 * ordinary payload on the next. The runtime conformance suite recorded every
 * one of them.
 *
 * THE RULE. A module that cannot serve a request answers by THROWING its
 * problem — as an `HttpException` carrying the RFC 7807 body it authored —
 * and the filter writes it through `writeProblemResponse`. No controller
 * touches a content type, so there is no second implementation to diverge
 * from this one, and a new module cannot mislabel a problem without first
 * inventing its own writer.
 *
 * WHY THE BODY IS PASSED THROUGH VERBATIM. The module authored it: the
 * machine-readable `code` (`PROFILE_NOT_FOUND`, `INVITATION_NOT_REDEEMABLE`,
 * `BOOTSTRAP_UNAVAILABLE`, …) is the module's own contract with its clients,
 * as are `reason`, `retryable`, and the echoed `requestId`. Re-deriving the
 * document from the platform error model here would replace all of them with
 * the ten infrastructure codes and lose the correlation id with them. What
 * this file owns is the media type and nothing else.
 *
 * The bodies are module-authored and already safe by construction: they carry
 * a fixed title, a safe detail, and — on the dependency-failure arms — no
 * detail at all. Nothing in this file adds a stack, a cause, or a driver
 * message, and nothing here reads one.
 */

/** The single media type every RFC 7807 body leaves this service with. */
export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

/** The reply surface the writer needs; fastify is not a direct dependency. */
export interface ProblemReplyLike {
  status(code: number): ProblemReplyLike;
  header(name: string, value: string): ProblemReplyLike;
  send(body: unknown): unknown;
}

/**
 * A complete RFC 7807 document a module authored and threw for itself. The
 * four members are the ones every module's `problems.ts` states as required;
 * anything the module adds beyond them (`detail`, `reason`, `retryable`,
 * `requestId`) rides along untouched.
 */
export interface AuthoredProblem {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>> & {
    readonly type: string;
    readonly title: string;
    readonly status: number;
    readonly code: string;
  };
}

interface HttpExceptionLike {
  getStatus(): number;
  getResponse(): unknown;
}

function isHttpExceptionLike(value: unknown): value is HttpExceptionLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<HttpExceptionLike>;
  return typeof candidate.getStatus === 'function' && typeof candidate.getResponse === 'function';
}

/**
 * The module-authored problem carried by `exception`, or null when the
 * exception is anything else.
 *
 * RECOGNITION IS STRUCTURAL AND STRICT, the same way the kill-switch denial
 * beside it is recognised. A body qualifies only when it states all four
 * required RFC 7807 members with the right types AND its `status` agrees with
 * the exception's — a document that disagreed with the status it is being
 * sent under would be a defect worth surfacing, not one worth forwarding. A
 * framework exception (`NotFoundException`, `BadRequestException`) states
 * none of them and falls through to the platform error model, unchanged.
 */
export function authoredProblemOf(exception: unknown): AuthoredProblem | null {
  if (!isHttpExceptionLike(exception)) return null;
  const body: unknown = exception.getResponse();
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const candidate = body as Record<string, unknown>;
  if (
    typeof candidate['type'] !== 'string' ||
    typeof candidate['title'] !== 'string' ||
    typeof candidate['status'] !== 'number' ||
    typeof candidate['code'] !== 'string' ||
    candidate['code'] === ''
  ) {
    return null;
  }
  const status = exception.getStatus();
  if (candidate['status'] !== status) return null;
  return { status, body: candidate as AuthoredProblem['body'] };
}

/**
 * Writes a problem document. Every RFC 7807 response this service sends goes
 * through here, so the media type is decided once.
 */
export function writeProblemResponse(reply: ProblemReplyLike, status: number, body: unknown): void {
  reply.status(status).header('content-type', PROBLEM_JSON_CONTENT_TYPE).send(body);
}
