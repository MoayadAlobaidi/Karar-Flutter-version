/**
 * Response shapes shared by the identity controllers. `GENERIC_ACCEPTED` is
 * the enumeration-resistant answer: registration, resend, and forgot-password
 * return this SAME object whether or not the account exists.
 */

import type { IssuedSession } from '../../application/session-issuer.js';

export const GENERIC_ACCEPTED = Object.freeze({
  status: 'accepted',
  detail: 'If the address is eligible, an e-mail has been sent.',
});

export function toSessionResponse(session: IssuedSession) {
  return {
    status: 'authenticated',
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
    sessionId: session.sessionId,
  };
}
