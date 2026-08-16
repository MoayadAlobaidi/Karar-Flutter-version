/**
 * RFC 7807 problems for the bootstrap surface (backend.md §9) — every
 * failure carries a machine-readable `code`; store detail never crosses the
 * edge.
 */

import type { GetBootstrapError, SetTenantBindingError } from '../../application/errors.js';

export interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
}

export interface ProblemResponse {
  readonly status: number;
  readonly body: ProblemBody;
}

export function authenticationRequiredProblem(): ProblemResponse {
  return {
    status: 401,
    body: {
      type: 'about:blank',
      title: 'Authentication required',
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      detail: 'no authenticated principal is bound to this request',
    },
  };
}

export function problemForBootstrapError(
  error: GetBootstrapError | SetTenantBindingError,
): ProblemResponse {
  switch (error.kind) {
    case 'unauthenticated':
      return authenticationRequiredProblem();
    case 'invalid_tenant_selection':
      return {
        status: 400,
        body: {
          type: 'about:blank',
          title: 'Invalid tenant selection',
          status: 400,
          code: 'INVALID_TENANT_SELECTION',
          detail: error.message,
        },
      };
    case 'membership_required':
      return {
        status: 403,
        body: {
          type: 'about:blank',
          title: 'Membership required',
          status: 403,
          code: 'MEMBERSHIP_REQUIRED',
          detail: error.message,
        },
      };
    case 'binding_conflict':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Binding conflict',
          status: 409,
          code: 'BINDING_CONFLICT',
          detail: error.message,
        },
      };
    case 'membership_revoked_concurrently':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Membership revoked concurrently',
          status: 409,
          code: 'MEMBERSHIP_REVOKED_CONCURRENTLY',
          detail: error.message,
        },
      };
    case 'context_unavailable':
      return {
        status: 503,
        body: {
          type: 'about:blank',
          title: 'Bootstrap unavailable',
          status: 503,
          code: 'BOOTSTRAP_UNAVAILABLE',
          // Static on purpose: internal store detail never crosses the edge.
        },
      };
  }
}
