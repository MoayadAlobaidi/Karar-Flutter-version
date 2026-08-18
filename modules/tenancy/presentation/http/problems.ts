/**
 * RFC 7807 problems for the tenancy surface (backend.md §9) — every failure
 * carries a machine-readable `code`; store detail never crosses the edge.
 */

import type {
  CreateInvitationError,
  GetOwnTenantError,
  ListMembersError,
  ListOwnMembershipsError,
  RedeemInvitationError,
  RevokeInvitationError,
} from '../../application/errors.js';

export interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly reason?: string;
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

type TenancyError =
  | GetOwnTenantError
  | ListMembersError
  | ListOwnMembershipsError
  | CreateInvitationError
  | RevokeInvitationError
  | RedeemInvitationError;

export function problemForTenancyError(error: TenancyError): ProblemResponse {
  switch (error.kind) {
    case 'missing_principal_context':
      return authenticationRequiredProblem();
    case 'not_authorized':
      return {
        status: 403,
        body: {
          type: 'about:blank',
          title: 'Not authorized',
          status: 403,
          code: 'NOT_AUTHORIZED',
          detail: error.message,
          reason: error.permission,
        },
      };
    case 'tenant_not_found':
      return {
        status: 404,
        body: {
          type: 'about:blank',
          title: 'Tenant not found',
          status: 404,
          code: 'TENANT_NOT_FOUND',
          detail: error.message,
        },
      };
    case 'membership_not_found':
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
    case 'invitation_not_found':
      return {
        status: 404,
        body: {
          type: 'about:blank',
          title: 'Invitation not found',
          status: 404,
          code: 'INVITATION_NOT_FOUND',
          detail: error.message,
        },
      };
    case 'invitation_not_redeemable':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Invitation not redeemable',
          status: 409,
          code: 'INVITATION_NOT_REDEEMABLE',
          detail: error.message,
          reason: error.reason,
        },
      };
    case 'already_member':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Already a member',
          status: 409,
          code: 'ALREADY_MEMBER',
          detail: error.message,
        },
      };
    case 'invalid_invitation_input':
      return {
        status: 400,
        body: {
          type: 'about:blank',
          title: 'Invalid invitation input',
          status: 400,
          code: 'INVALID_INVITATION_INPUT',
          detail: error.message,
        },
      };
    case 'store_failure':
      return {
        status: 503,
        body: {
          type: 'about:blank',
          title: 'Persistence unavailable',
          status: 503,
          code: 'STORE_UNAVAILABLE',
          // Static on purpose: internal store detail never crosses the edge.
        },
      };
  }
}
