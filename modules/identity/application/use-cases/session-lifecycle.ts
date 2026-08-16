/**
 * Session lifecycle for an authenticated principal: list own sessions (the
 * RLS owner policy IS the scope), revoke one, revoke all others, log out.
 * All revocation is server-side row state (legacy AUTHN-07); nothing here
 * ever touches process memory as a session store (AUTHN-16).
 */

import { Result, type UserId } from '@karar/shared-kernel';

import { isSessionLive, type Session, type SessionId } from '../../domain/session.js';

// Presentation-legal access to the branded id (controllers never import
// domain/ directly — architecture test 6).
export type { SessionId } from '../../domain/session.js';

/** Brand a transport-supplied session id for the use-case surface. */
export function toSessionId(raw: string): SessionId {
  return raw as SessionId;
}
import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';

export interface SessionView {
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly current: boolean;
  readonly userAgentSummary: string | null;
  /** The stored digest — recognizable to the platform, meaningless outside it. */
  readonly ipDigest: string | null;
}

export class ListSessions {
  constructor(private readonly deps: IdentityDependencies) {}

  /** Live sessions only, newest first, the caller's own marked `current`. */
  async execute(input: {
    readonly accountId: UserId;
    readonly currentSessionId: SessionId;
  }): Promise<readonly SessionView[]> {
    const now = this.deps.clock.now();
    const sessions = await this.deps.sessions.listSessions(input.accountId);
    return sessions
      .filter((session) => isSessionLive(session, now))
      .map((session: Session) => ({
        sessionId: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        current: session.id === input.currentSessionId,
        userAgentSummary: session.userAgentSummary,
        ipDigest: session.ipDigest,
      }));
  }
}

export type RevokeSessionError = { readonly kind: 'not_found' };

export class RevokeSession {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(input: {
    readonly accountId: UserId;
    readonly sessionId: SessionId;
    readonly client: ClientContext;
  }): Promise<Result<{ readonly kind: 'revoked' }, RevokeSessionError>> {
    const deps = this.deps;
    const revoked = await deps.sessions.revokeSession({
      accountId: input.accountId,
      sessionId: input.sessionId,
      reason: 'revoked_by_owner',
      now: deps.clock.now(),
    });
    if (!revoked) return Result.err({ kind: 'not_found' });
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'session_revoked',
      ipDigest: input.client.ipDigest,
      metadata: { sessionId: input.sessionId, reason: 'revoked_by_owner' },
    });
    await auditOrFail(deps, {
      action: 'identity.session.revoked',
      accountId: input.accountId,
      resourceType: 'identity_session',
      resourceId: input.sessionId,
      outcome: 'SUCCESS',
    });
    return Result.ok({ kind: 'revoked' });
  }
}

export class RevokeOtherSessions {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(input: {
    readonly accountId: UserId;
    readonly currentSessionId: SessionId;
    readonly client: ClientContext;
  }): Promise<{ readonly kind: 'revoked'; readonly revokedCount: number }> {
    const deps = this.deps;
    const revokedCount = await deps.sessions.revokeAllSessions({
      accountId: input.accountId,
      reason: 'revoked_other_sessions',
      now: deps.clock.now(),
      exceptSessionId: input.currentSessionId,
    });
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'sessions_revoked_bulk',
      ipDigest: input.client.ipDigest,
      metadata: { reason: 'revoked_other_sessions', revokedCount },
    });
    await auditOrFail(deps, {
      action: 'identity.sessions.revoked_others',
      accountId: input.accountId,
      resourceType: 'identity_account',
      resourceId: input.accountId,
      outcome: 'SUCCESS',
      metadata: { revokedCount },
    });
    return { kind: 'revoked', revokedCount };
  }
}

export class Logout {
  constructor(private readonly deps: IdentityDependencies) {}

  /** Idempotent: logging out an already-dead session is still a logout. */
  async execute(input: {
    readonly accountId: UserId;
    readonly sessionId: SessionId;
    readonly client: ClientContext;
  }): Promise<{ readonly kind: 'logged_out' }> {
    const deps = this.deps;
    const revoked = await deps.sessions.revokeSession({
      accountId: input.accountId,
      sessionId: input.sessionId,
      reason: 'logout',
      now: deps.clock.now(),
    });
    if (revoked) {
      await recordSecurity(deps, {
        accountId: input.accountId,
        eventType: 'session_revoked',
        ipDigest: input.client.ipDigest,
        metadata: { sessionId: input.sessionId, reason: 'logout' },
      });
    }
    return { kind: 'logged_out' };
  }
}
