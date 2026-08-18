/**
 * RFC 7807 problems for the bootstrap surface (backend.md §9) — every
 * failure carries a machine-readable `code`; store detail never crosses the
 * edge.
 *
 * ONE 503 CODE, deliberately: `BOOTSTRAP_UNAVAILABLE` answers every
 * dependency failure this surface can hit — tenant-context resolution, the
 * audit append, the jurisdiction read, the PolicyPack ledger, and capability
 * resolution. Splitting it per dependency would publish which internal
 * component is down (a topology disclosure the client cannot use) and would
 * fragment client retry logic for one identical remedy: retry, then
 * re-authenticate. `retryable` carries the only distinction that changes what
 * the client should do, and `requestId` correlates the failure with the
 * server-side log line that holds the actual cause.
 *
 * The problem BODY carries no `detail` on the 503 path: the use case's
 * message names the failing dependency and stays in the logs.
 */

import type { GetBootstrapError, SetTenantBindingError } from '../../application/errors.js';

export interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  /** Present where retrying is meaningful; absent otherwise, never guessed. */
  readonly retryable?: boolean;
  /** The caller's own request correlation id, echoed for support/log joining. */
  readonly requestId?: string;
}

export interface ProblemResponse {
  readonly status: number;
  readonly body: ProblemBody;
}

function withCorrelation(body: ProblemBody, requestId: string | undefined): ProblemBody {
  return requestId === undefined ? body : { ...body, requestId };
}

export function authenticationRequiredProblem(requestId?: string): ProblemResponse {
  return {
    status: 401,
    body: withCorrelation(
      {
        type: 'about:blank',
        title: 'Authentication required',
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
        detail: 'no authenticated principal is bound to this request',
      },
      requestId,
    ),
  };
}

/**
 * The single 503 document. `retryable` is stated by the caller — a transient
 * store fault is retryable; a structurally unresolvable configuration is not.
 */
function bootstrapUnavailableProblem(retryable: boolean, requestId: string | undefined): ProblemResponse {
  return {
    status: 503,
    body: withCorrelation(
      {
        type: 'about:blank',
        title: 'Bootstrap unavailable',
        status: 503,
        code: 'BOOTSTRAP_UNAVAILABLE',
        // Static on purpose: internal store detail never crosses the edge.
        retryable,
      },
      requestId,
    ),
  };
}

export function problemForBootstrapError(
  error: GetBootstrapError | SetTenantBindingError,
  requestId?: string,
): ProblemResponse {
  switch (error.kind) {
    case 'unauthenticated':
      return authenticationRequiredProblem(requestId);
    case 'invalid_tenant_selection':
      return {
        status: 400,
        body: withCorrelation(
          {
            type: 'about:blank',
            title: 'Invalid tenant selection',
            status: 400,
            code: 'INVALID_TENANT_SELECTION',
            detail: error.message,
          },
          requestId,
        ),
      };
    case 'membership_required':
      return {
        status: 403,
        body: withCorrelation(
          {
            type: 'about:blank',
            title: 'Membership required',
            status: 403,
            code: 'MEMBERSHIP_REQUIRED',
            detail: error.message,
          },
          requestId,
        ),
      };
    case 'binding_conflict':
      return {
        status: 409,
        body: withCorrelation(
          {
            type: 'about:blank',
            title: 'Binding conflict',
            status: 409,
            code: 'BINDING_CONFLICT',
            detail: error.message,
          },
          requestId,
        ),
      };
    case 'membership_revoked_concurrently':
      return {
        status: 409,
        body: withCorrelation(
          {
            type: 'about:blank',
            title: 'Membership revoked concurrently',
            status: 409,
            code: 'MEMBERSHIP_REVOKED_CONCURRENTLY',
            detail: error.message,
          },
          requestId,
        ),
      };
    case 'context_unavailable':
      // Tenant-context resolution or the audit append failed. Both are store
      // faults from the caller's side, so retrying may succeed.
      return bootstrapUnavailableProblem(true, requestId);
    case 'resolution_unavailable':
      return bootstrapUnavailableProblem(error.retryable, requestId);
  }
}
