/**
 * The RFC 7807 documents the financial surface authors for itself.
 *
 * FAILURES ARE THROWN, NEVER WRITTEN. This surface never touches a content
 * type: a problem travels to the HTTP entrypoint's error boundary as the body
 * of an `HttpException` and is forwarded verbatim — `code`, `reason`,
 * `retryable`, echoed `requestId` and all — by the single writer in
 * apps/api/src/errors/problem-response.ts, which is the only place in the
 * service that names the problem media type. A second writer here is exactly
 * the defect that once put RFC 7807 bodies under `application/json` on
 * twenty-five operation/status pairs.
 *
 * WHAT NEVER CROSSES THIS BOUNDARY. Store, driver and provider text; stacks
 * and causes; the ciphertext, nonce, auth tag, algorithm or key version of
 * any encrypted field; any dedup or source-account fingerprint; any raw
 * source row, cell or header; any object-storage locator; and the basis,
 * approval reference or pack version of a retention decision. Where a module
 * error carries one of those, this file drops it and keeps only the code.
 */

export interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly reason?: string;
  readonly retryable?: boolean;
  readonly requestId?: string;
  readonly limitBytes?: number;
}

export interface ProblemResponse {
  readonly status: number;
  readonly body: ProblemBody;
}

function problem(
  status: number,
  title: string,
  code: string,
  extra: Omit<ProblemBody, 'type' | 'title' | 'status' | 'code'> = {},
): ProblemResponse {
  return { status, body: { type: 'about:blank', title, status, code, ...extra } };
}

export function authenticationRequiredProblem(): ProblemResponse {
  return problem(401, 'Authentication required', 'AUTHENTICATION_REQUIRED', {
    detail: 'no authenticated principal is bound to this request',
  });
}

export function tenantBindingRequiredProblem(): ProblemResponse {
  return problem(403, 'Tenant binding required', 'TENANT_BINDING_REQUIRED', {
    detail: 'the session is authenticated but not bound to a tenant',
  });
}

/**
 * A malformed request. `field` names WHICH input was wrong; the value itself
 * is never echoed, because a rejected body may hold an account number the
 * caller mistyped into the wrong field.
 */
export function invalidRequestProblem(field: string, why: string): ProblemResponse {
  return problem(400, 'Invalid request', 'INVALID_REQUEST', {
    detail: `'${field}' ${why}`,
  });
}

export function invalidCursorProblem(): ProblemResponse {
  return problem(400, 'Invalid cursor', 'INVALID_CURSOR', {
    detail: 'the cursor does not name a position in this result set; start from the first page',
  });
}

export function invalidLimitProblem(): ProblemResponse {
  return problem(400, 'Invalid page size', 'INVALID_REQUEST', {
    detail: "'limit' must be a positive integer",
  });
}

/**
 * A dependency could not answer. The detail is STATIC: the store's own
 * message names tables, constraints and sometimes values, none of which is
 * the caller's to read.
 */
export function storeUnavailableProblem(): ProblemResponse {
  return problem(503, 'Persistence unavailable', 'STORE_UNAVAILABLE', { retryable: true });
}

/**
 * No approved retention decision governs the dataset this write would create.
 *
 * The dataset name is safe and useful; the decision's period, basis, approval
 * reference and pack version are internal review artefacts and stay
 * server-side. `retryable` is false because retrying cannot produce a legal
 * decision — only counsel can.
 */
export function retentionUnresolvedProblem(dataset: string): ProblemResponse {
  return problem(422, 'Retention decision unresolved', 'RETENTION_UNRESOLVED', {
    detail: `no approved retention decision governs '${dataset}', so nothing durable may be written`,
    retryable: false,
  });
}

/** A refusal whose code the module authored; used where the code IS the answer. */
export function codedProblem(
  status: number,
  title: string,
  code: string,
  detail?: string,
): ProblemResponse {
  return problem(status, title, code, detail === undefined ? {} : { detail });
}
