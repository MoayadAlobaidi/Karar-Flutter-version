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
  /**
   * The occurrence ordinal that WOULD be accepted, on `OCCURRENCE_ORDINAL_NOT_NEXT`.
   *
   * Structured rather than left in the prose. The detail already said "the next
   * unused occurrence for this movement is N", and a client that had to parse
   * an integer out of an English sentence would break the first time the
   * sentence was translated — so the one fact a caller must act on was
   * unreachable to it, and a person who genuinely bought the same thing twice
   * could not record the second one.
   *
   * Safe to disclose: it is a small counter over a movement the caller has just
   * described in full. It reveals how many identical movements the caller
   * already has, which the caller is the subject of.
   */
  readonly nextOrdinal?: number;
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
 * The capability behind this surface is not available for this principal.
 *
 * ONE DOCUMENT FOR EVERY REASON, BYTE FOR BYTE. Unbuilt code, a capability
 * deployed nowhere, a jurisdiction that no policy pack clears, a pack still
 * with legal review, a missing or expired entitlement, consent that was never
 * given or has been withdrawn, an unconfigured provider, and a store that
 * could not be read all produce exactly this. There is no `reason`, no
 * `retryable` and no detail that varies: a caller able to tell two refusals
 * apart could enumerate the platform's legal and commercial posture one
 * request at a time, which is the same reason another subject's account id
 * answers 404 identically to an id that never existed.
 *
 * `retryable` is absent rather than false. Present, it would have to be true
 * for the store-failure case and false for the others, and that single
 * boolean would be the leak this document exists to prevent.
 */
export function capabilityUnavailableProblem(): ProblemResponse {
  return problem(403, 'Capability unavailable', 'CAPABILITY_UNAVAILABLE', {
    detail: 'this capability is not available for this principal',
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
  extra: Omit<ProblemBody, 'type' | 'title' | 'status' | 'code' | 'detail'> = {},
): ProblemResponse {
  return problem(status, title, code, {
    ...(detail === undefined ? {} : { detail }),
    ...extra,
  });
}
