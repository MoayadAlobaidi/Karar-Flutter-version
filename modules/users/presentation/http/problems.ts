/**
 * RFC 7807 problem responses (backend.md §9): every failure carries a
 * machine-readable `code` so clients render honest states. Store failures map
 * to a static detail — driver/internal text never crosses the boundary.
 */

import type {
  GetOwnProfileError,
  RequestAccountDisableError,
  UpdateOwnProfileError,
} from '../../application/errors.js';

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

type UsersError = GetOwnProfileError | UpdateOwnProfileError | RequestAccountDisableError;

export function problemForUsersError(error: UsersError): ProblemResponse {
  switch (error.kind) {
    case 'missing_principal_context':
      return authenticationRequiredProblem();
    case 'profile_not_found':
      return {
        status: 404,
        body: {
          type: 'about:blank',
          title: 'Profile not found',
          status: 404,
          code: 'PROFILE_NOT_FOUND',
          detail: error.message,
        },
      };
    case 'invalid_profile_field':
      return {
        status: 400,
        body: {
          type: 'about:blank',
          title: 'Invalid profile field',
          status: 400,
          code: 'INVALID_PROFILE_FIELD',
          detail: error.message,
        },
      };
    case 'no_approved_field_changes':
      return {
        status: 400,
        body: {
          type: 'about:blank',
          title: 'Nothing to update',
          status: 400,
          code: 'NO_APPROVED_FIELD_CHANGES',
          detail: error.message,
        },
      };
    case 'invalid_status_transition':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Invalid status transition',
          status: 409,
          code: 'INVALID_STATUS_TRANSITION',
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
