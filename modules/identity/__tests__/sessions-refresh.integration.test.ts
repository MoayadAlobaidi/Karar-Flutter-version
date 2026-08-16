/**
 * Sessions and refresh rotation against a real PostgreSQL: one-time rotation
 * with lineage, CONCURRENT presentation resolving to exactly one winner,
 * reuse detection revoking family + session + recording + notifying, the
 * session lifecycle surface, disable-revokes-everything with re-enable
 * restoring nothing, and the FORCEd RLS posture proven adversarially on
 * non-empty data.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UserId } from '@karar/shared-kernel';

import type { IssuedSession } from '../application/session-issuer.js';
import type { SessionId } from '../domain/session.js';
import {
  allowAllRateLimiter,
  createIdentityHarness,
  printSkipBanner,
  probePostgres,
  securityEventCount,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('SESSIONS', unreachable);

const PASSWORD = 'sessions-suite-password';

async function registerAndLogin(
  h: IdentityHarness,
  email: string,
): Promise<{ accountId: UserId; session: IssuedSession }> {
  await h.runtime.useCases.registerAccount.execute({ email, password: PASSWORD, client: h.client });
  const account = await h.runtime.deps.accounts.findByEmail(email);
  const outcome = await h.runtime.useCases.login.execute({
    email,
    password: PASSWORD,
    client: h.client,
  });
  if (!outcome.ok || outcome.value.kind !== 'session') throw new Error('expected a session');
  return { accountId: account!.id, session: outcome.value.session };
}

describe.skipIf(unreachable !== null)('sessions and refresh rotation (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    h = await createIdentityHarness({ suite: 'sess', rateLimiter: allowAllRateLimiter });
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('rotates a refresh token once, recording used_at and supersededBy lineage', async () => {
    const { session } = await registerAndLogin(h, 'rotate@example.com');

    const refreshed = await h.runtime.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: h.client,
    });
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) throw new Error('expected rotation');
    expect(refreshed.value.refreshToken).not.toBe(session.refreshToken);
    expect(refreshed.value.sessionId).toBe(session.sessionId);

    const tokens = await h.prisma.client.refreshToken.findMany({});
    expect(tokens).toHaveLength(2);
    const presented = tokens.find((t) => t.supersededBy !== null);
    const successor = tokens.find((t) => t.supersededBy === null);
    expect(presented?.usedAt).not.toBeNull();
    expect(presented?.supersededBy).toBe(successor?.id);
    expect(successor?.usedAt).toBeNull();

    // The new access token authenticates; the rotation touched last_seen.
    const principal = await h.runtime.useCases.authenticateRequest.execute(
      refreshed.value.accessToken,
    );
    expect(principal.ok).toBe(true);
  });

  it('CONCURRENT: two parallel refreshes with the same token — exactly one succeeds', async () => {
    const { accountId, session } = await registerAndLogin(h, 'concurrent@example.com');

    const [a, b] = await Promise.all([
      h.runtime.useCases.refreshSession.execute({
        refreshToken: session.refreshToken,
        client: h.client,
      }),
      h.runtime.useCases.refreshSession.execute({
        refreshToken: session.refreshToken,
        client: h.client,
      }),
    ]);

    const successes = [a, b].filter((r) => r.ok);
    const failures = [a, b].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const failure = failures[0];
    if (failure === undefined || failure.ok) throw new Error('expected one failure');
    expect(failure.error.kind).toBe('reuse_detected');

    // The loser triggered the reuse response: family and session revoked.
    const families = await h.prisma.client.refreshTokenFamily.findMany({
      where: { accountId },
    });
    expect(families).toHaveLength(1);
    expect(families[0]?.revokedAt).not.toBeNull();
    expect(families[0]?.revokedReason).toBe('refresh_reuse_detected');
    expect(await securityEventCount(h, accountId, 'refresh_reuse_detected')).toBe(1);
  });

  it('detects reuse of a rotated token: revokes family + session, records, notifies', async () => {
    const email = 'reuse@example.com';
    const { accountId, session } = await registerAndLogin(h, email);

    const first = await h.runtime.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: h.client,
    });
    expect(first.ok).toBe(true);

    // An attacker (or stale client) presents the ORIGINAL token again.
    const replay = await h.runtime.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: h.client,
    });
    expect(replay.ok).toBe(false);
    if (replay.ok) throw new Error('expected reuse detection');
    expect(replay.error.kind).toBe('reuse_detected');

    // Family AND session are dead — including for the legitimate successor.
    if (!first.ok) throw new Error('unreachable');
    const successorAttempt = await h.runtime.useCases.refreshSession.execute({
      refreshToken: first.value.refreshToken,
      client: h.client,
    });
    expect(successorAttempt.ok).toBe(false);

    const sessions = await h.runtime.deps.sessions.listSessions(accountId);
    expect(sessions[0]?.revokedReason).toBe('refresh_reuse_detected');
    expect(await securityEventCount(h, accountId, 'refresh_reuse_detected')).toBe(1);

    // The account was told, without secrets in the message.
    const notice = h.mailSink
      .capturedFor(email)
      .find(
        (entry) =>
          entry.type === 'security_notice' && entry.message.kind === 'refresh_reuse_detected',
      );
    expect(notice).toBeDefined();
  });

  it('rejects an expired refresh token', async () => {
    const { session } = await registerAndLogin(h, 'stale@example.com');
    h.clock.advance(15 * 24 * 60 * 60_000); // past the 14-day token lifetime
    const outcome = await h.runtime.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: h.client,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.error.kind).toBe('invalid_token');
  });

  it('lists own sessions, revokes one, revokes others, and logs out', async () => {
    const email = 'lifecycle@example.com';
    const { accountId, session: s1 } = await registerAndLogin(h, email);
    const login2 = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    const login3 = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    if (!login2.ok || login2.value.kind !== 'session') throw new Error('expected session');
    if (!login3.ok || login3.value.kind !== 'session') throw new Error('expected session');
    const s2 = login2.value.session;
    const s3 = login3.value.session;

    const listed = await h.runtime.useCases.listSessions.execute({
      accountId,
      currentSessionId: s1.sessionId,
    });
    expect(listed).toHaveLength(3);
    expect(listed.filter((s) => s.current)).toHaveLength(1);

    // Revoke one specific other session.
    const revoked = await h.runtime.useCases.revokeSession.execute({
      accountId,
      sessionId: s3.sessionId,
      client: h.client,
    });
    expect(revoked.ok).toBe(true);
    // Its refresh token is dead with its family.
    const s3refresh = await h.runtime.useCases.refreshSession.execute({
      refreshToken: s3.refreshToken,
      client: h.client,
    });
    expect(s3refresh.ok).toBe(false);
    // Revoking it again reports not_found (nothing live matches).
    const again = await h.runtime.useCases.revokeSession.execute({
      accountId,
      sessionId: s3.sessionId,
      client: h.client,
    });
    expect(again.ok).toBe(false);

    // Revoke everything except the current session.
    const others = await h.runtime.useCases.revokeOtherSessions.execute({
      accountId,
      currentSessionId: s1.sessionId,
      client: h.client,
    });
    expect(others.revokedCount).toBe(1); // s2 (s3 already revoked)
    expect(
      (await h.runtime.useCases.authenticateRequest.execute(s2.accessToken)).ok,
    ).toBe(false);
    expect(
      (await h.runtime.useCases.authenticateRequest.execute(s1.accessToken)).ok,
    ).toBe(true);

    // Logout kills the current one; a second logout is an idempotent no-op.
    await h.runtime.useCases.logout.execute({
      accountId,
      sessionId: s1.sessionId,
      client: h.client,
    });
    expect(
      (await h.runtime.useCases.authenticateRequest.execute(s1.accessToken)).ok,
    ).toBe(false);
    await h.runtime.useCases.logout.execute({
      accountId,
      sessionId: s1.sessionId,
      client: h.client,
    });
  });

  it('disable revokes sessions, families, and tokens; re-enable resurrects NOTHING', async () => {
    const email = 'disable.cycle@example.com';
    const { accountId, session } = await registerAndLogin(h, email);
    // A second session so the count proves bulk revocation.
    const second = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    if (!second.ok || second.value.kind !== 'session') throw new Error('expected session');

    const disabled = await h.runtime.useCases.disableAccount.execute({
      accountId,
      reason: 'fraud investigation',
      actorAccountId: null,
      client: h.client,
    });
    expect(disabled.ok).toBe(true);
    if (!disabled.ok) throw new Error('unreachable');
    expect(disabled.value.revokedSessions).toBe(2);

    // Everything is dead: access tokens (tv bumped + session revoked),
    // refresh tokens (family revoked), and new logins (status).
    expect((await h.runtime.useCases.authenticateRequest.execute(session.accessToken)).ok).toBe(
      false,
    );
    const refreshAttempt = await h.runtime.useCases.refreshSession.execute({
      refreshToken: second.value.session.refreshToken,
      client: h.client,
    });
    expect(refreshAttempt.ok).toBe(false);

    const enabled = await h.runtime.useCases.enableAccount.execute({
      accountId,
      actorAccountId: null,
      client: h.client,
    });
    expect(enabled.ok).toBe(true);

    // AUTHN-08: re-enabling resurrects no session, no family, no token.
    expect((await h.runtime.useCases.authenticateRequest.execute(session.accessToken)).ok).toBe(
      false,
    );
    const refreshAfterEnable = await h.runtime.useCases.refreshSession.execute({
      refreshToken: second.value.session.refreshToken,
      client: h.client,
    });
    expect(refreshAfterEnable.ok).toBe(false);
    const live = (await h.runtime.deps.sessions.listSessions(accountId)).filter(
      (s) => s.revokedAt === null,
    );
    expect(live).toHaveLength(0);

    // But the OWNER can log in again fresh.
    const fresh = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    expect(fresh.ok).toBe(true);
  });

  it('RLS adversarial: owner reads own NON-EMPTY sessions; other scopes read nothing', async () => {
    const alice = await registerAndLogin(h, 'alice.rls@example.com');
    const bob = await registerAndLogin(h, 'bob.rls@example.com');

    // Non-empty expected data: the isolation claim is only tested when the
    // owner actually sees rows (backend.md §12).
    const aliceSessions = await h.runtime.deps.sessions.listSessions(alice.accountId);
    expect(aliceSessions.length).toBeGreaterThan(0);

    // A transaction scoped to Bob cannot see Alice's session…
    const crossRead = await h.runtime.deps.sessions.findSession(
      bob.accountId,
      alice.session.sessionId as SessionId,
    );
    expect(crossRead).toBeNull();

    // …and cannot revoke it either (0 rows match under Bob's policy).
    const crossRevoke = await h.runtime.deps.sessions.revokeSession({
      accountId: bob.accountId,
      sessionId: alice.session.sessionId as SessionId,
      reason: 'revoked_by_owner',
      now: h.clock.now(),
    });
    expect(crossRevoke).toBe(false);
    const aliceStillLive = await h.runtime.deps.sessions.findSession(
      alice.accountId,
      alice.session.sessionId as SessionId,
    );
    expect(aliceStillLive?.revokedAt ?? null).toBeNull();

    // A transaction with NO principal context sees NO sessions at all —
    // sessions carry no bootstrap arm.
    const bootstrapView = await h.prisma.client.session.findMany({});
    expect(bootstrapView).toHaveLength(0);

    // identity_accounts under a principal context is self-only.
    const bobsViewOfAlice = await h.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${bob.accountId}, true)`;
      return tx.identityAccount.findMany({ where: { id: alice.accountId } });
    });
    expect(bobsViewOfAlice).toHaveLength(0);
  });

  it('append-only ledger: UPDATE and DELETE on security events are impossible for the app role', async () => {
    await expect(
      h.prisma.client.$executeRaw`UPDATE public.authentication_security_events SET event_type = 'forged'`,
    ).rejects.toThrow();
    await expect(
      h.prisma.client.$executeRaw`DELETE FROM public.authentication_security_events`,
    ).rejects.toThrow();
  });
});
