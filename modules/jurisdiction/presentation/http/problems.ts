/**
 * RFC 7807 problems for the jurisdiction self-declaration surface. Every
 * failure carries a machine-readable `code`; store detail never crosses the
 * edge, and neither does the register's internal state beyond the fact that
 * the named identifier is not declarable.
 */

import type { DeclareOwnJurisdictionError } from '../../application/use-cases/self-declaration.js';

export interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly retryable?: boolean;
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
 * An unbound session cannot declare: the assignment table is RLS-FORCEd on
 * both principal GUCs, so there is no context to write under. Reported as the
 * need to bind a tenant first, not as a server fault.
 */
export function tenantBindingRequiredProblem(requestId?: string): ProblemResponse {
  return {
    status: 409,
    body: withCorrelation(
      {
        type: 'about:blank',
        title: 'Tenant binding required',
        status: 409,
        code: 'TENANT_BINDING_REQUIRED',
        detail:
          'the session is not bound to a tenant; bind one through the platform bootstrap surface before declaring a jurisdiction',
      },
      requestId,
    ),
  };
}

export function invalidDeclarationProblem(detail: string, requestId?: string): ProblemResponse {
  return {
    status: 400,
    body: withCorrelation(
      {
        type: 'about:blank',
        title: 'Invalid jurisdiction declaration',
        status: 400,
        code: 'INVALID_JURISDICTION_DECLARATION',
        detail,
      },
      requestId,
    ),
  };
}

export function problemForDeclarationError(
  error: DeclareOwnJurisdictionError,
  requestId?: string,
): ProblemResponse {
  switch (error.kind) {
    case 'UNKNOWN_JURISDICTION':
      // The caller named something the register does not hold. The code is
      // echoed because the caller supplied it; nothing else about the
      // register crosses the edge.
      return invalidDeclarationProblem(
        `'${error.code}' is not a jurisdiction this platform recognises`,
        requestId,
      );
    case 'DECLARATION_NOT_PERMITTED':
      return {
        status: 409,
        body: withCorrelation(
          {
            type: 'about:blank',
            title: 'Declaration not permitted',
            status: 409,
            code: 'DECLARATION_NOT_PERMITTED',
            detail: error.message,
          },
          requestId,
        ),
      };
    case 'STORE_FAILURE':
    case 'AUDIT_APPEND_FAILED':
      // Static on purpose: store text and audit internals never cross the edge.
      return {
        status: 503,
        body: withCorrelation(
          {
            type: 'about:blank',
            title: 'Jurisdiction declaration unavailable',
            status: 503,
            code: 'JURISDICTION_DECLARATION_UNAVAILABLE',
            retryable: true,
          },
          requestId,
        ),
      };
  }
}
