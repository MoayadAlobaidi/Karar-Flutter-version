/**
 * Password recovery and change against a real PostgreSQL: generic responses
 * always, token expiry/one-time/cooldown, the 3/h send limit, the documented
 * revocation policies (reset revokes ALL sessions; change revokes all
 * OTHERS), and change-password's current-password requirement.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UserId } from '@karar/shared-kernel';

import type { IssuedSession } from '../application/session-issuer.js';
import type { SessionId } from '../domain/session.js';
import {
  createIdentityHarness,
  lastResetTokenFor,
  printSkipBanner,
  probePostgres,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('RECOVERY', unreachable);

const PASSWORD = 'recovery-suite-password';

async function registerAndLogin(
  h: IdentityHarness,
  email: string,
  password: string = PASSWORD,
): Promise<{ accountId: UserId; session: IssuedSession }> {
  await h.runtime.useCases.registerAccount.execute({ email, password, client: h.client });
  const account = await h.runtime.deps.accounts.findByEmail(email);
  const outcome = await h.runtime.useCases.login.execute({ email, password, client: h.client });
  if (!outcome.ok || outcome.value.kind !== 'session') throw new Error('expected a session');
  return { accountId: account!.id, session: outcome.value.session };
}

describe.skipIf(unreachable !== null)('password recovery and change (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    h = await createIdentityHarness({ suite: 'recov' });
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('answers forgot-password identically for existing and unknown addresses', async () => {
    const email = 'forgot.me@example.com';
    await registerAndLogin(h, email);

    const known = await h.runtime.useCases.forgotPassword.execute({ email, client: h.client });
    const unknown = await h.runtime.useCases.forgotPassword.execute({
      email: 'never.registered@example.com',
      client: h.client,
    });
    expect(known).toEqual(unknown);

    // Only the real account got a token — and the stored row is a digest
    // with the requester's IP digest, never raw values.
    expect(lastResetTokenFor(h.mailSink, email)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.mailSink.capturedFor('never.registered@example.com')).toHaveLength(0);
    const rows = await h.prisma.client.passwordResetRequest.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.codeHash).not.toBe(lastResetTokenFor(h.mailSink, email));
    expect(rows[0]?.requestedIpDigest).toBe(h.client.ipDigest);
  });

  it('applies the per-account cooldown, then the 3/h send limit', async () => {
    const email = 'forgot.me@example.com';
    // Within 60s of the previous request: accepted, no send.
    const before = h.mailSink.capturedFor(email).length;
    await h.runtime.useCases.forgotPassword.execute({ email, client: h.client });
    expect(h.mailSink.capturedFor(email)).toHaveLength(before);

    // Two more spaced sends exhaust the 3/h budget (the throttled call above
    // spent budget too — a refused send is still an attempt).
    h.clock.advance(61_000);
    await h.runtime.useCases.forgotPassword.execute({ email, client: h.client });
    expect(h.mailSink.capturedFor(email)).toHaveLength(before + 1);
    h.clock.advance(61_000);
    await expect(
      h.runtime.useCases.forgotPassword.execute({ email, client: h.client }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('resets with a live token ONCE, revokes ALL sessions, and notifies', async () => {
    const email = 'reset.all@example.com';
    const { accountId, session: s1 } = await registerAndLogin(h, email);
    const login2 = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    if (!login2.ok || login2.value.kind !== 'session') throw new Error('expected session');
    const s2 = login2.value.session;

    await h.runtime.useCases.forgotPassword.execute({ email, client: h.client });
    const token = lastResetTokenFor(h.mailSink, email) as string;

    const reset = await h.runtime.useCases.resetPassword.execute({
      token,
      newPassword: 'a-brand-new-password',
      client: h.client,
    });
    expect(reset.ok).toBe(true);

    // Reset policy: EVERY session and family is gone; old password dead.
    expect((await h.runtime.useCases.authenticateRequest.execute(s1.accessToken)).ok).toBe(false);
    expect((await h.runtime.useCases.authenticateRequest.execute(s2.accessToken)).ok).toBe(false);
    expect(
      (
        await h.runtime.useCases.refreshSession.execute({
          refreshToken: s1.refreshToken,
          client: h.client,
        })
      ).ok,
    ).toBe(false);
    const oldLogin = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    expect(oldLogin.ok).toBe(false);
    const newLogin = await h.runtime.useCases.login.execute({
      email,
      password: 'a-brand-new-password',
      client: h.client,
    });
    expect(newLogin.ok).toBe(true);

    // One-time: the same token is dead now.
    const replay = await h.runtime.useCases.resetPassword.execute({
      token,
      newPassword: 'yet-another-password',
      client: h.client,
    });
    expect(replay.ok).toBe(false);

    // Notice carries the event, never the password or token.
    const notice = h.mailSink
      .capturedFor(email)
      .find(
        (e) => e.type === 'security_notice' && e.message.kind === 'password_reset_completed',
      );
    expect(notice).toBeDefined();
    expect(h.auditWriter.events.map((e) => e.action)).toContain('identity.password.reset');
    expect(accountId).toBeTruthy();
  });

  it('refuses an expired reset token and an unknown one with the same generic error', async () => {
    const email = 'reset.expired@example.com';
    await registerAndLogin(h, email);
    await h.runtime.useCases.forgotPassword.execute({ email, client: h.client });
    const token = lastResetTokenFor(h.mailSink, email) as string;

    h.clock.advance(31 * 60_000); // past the 30-minute expiry
    const expired = await h.runtime.useCases.resetPassword.execute({
      token,
      newPassword: 'wont-be-accepted-anyway',
      client: h.client,
    });
    const unknown = await h.runtime.useCases.resetPassword.execute({
      token: 'A'.repeat(43),
      newPassword: 'wont-be-accepted-anyway',
      client: h.client,
    });
    expect(expired.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (expired.ok || unknown.ok) throw new Error('expected failures');
    expect(expired.error).toEqual(unknown.error);
  });

  it('caps failed presentations of a resolvable-but-dead token', async () => {
    const email = 'reset.capped@example.com';
    await registerAndLogin(h, email);
    await h.runtime.useCases.forgotPassword.execute({ email, client: h.client });
    const token = lastResetTokenFor(h.mailSink, email) as string;
    h.clock.advance(31 * 60_000);
    for (let i = 0; i < 3; i += 1) {
      await h.runtime.useCases.resetPassword.execute({
        token,
        newPassword: 'irrelevant-password',
        client: h.client,
      });
    }
    const row = await h.prisma.client.passwordResetRequest.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.attempts).toBe(3);
    const failures = await h.prisma.client.authenticationSecurityEvent.count({
      where: { eventType: 'password_reset_failed' },
    });
    expect(failures).toBeGreaterThanOrEqual(3);
  });

  it('change-password requires the current password and revokes every OTHER session', async () => {
    const email = 'change.pw@example.com';
    const { accountId, session: current } = await registerAndLogin(h, email);
    const other = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    if (!other.ok || other.value.kind !== 'session') throw new Error('expected session');
    const otherSession = other.value.session;

    const wrongCurrent = await h.runtime.useCases.changePassword.execute({
      accountId,
      currentSessionId: current.sessionId as SessionId,
      currentPassword: 'not-the-current-password',
      newPassword: 'the-next-password-then',
      client: h.client,
    });
    expect(wrongCurrent.ok).toBe(false);

    const changed = await h.runtime.useCases.changePassword.execute({
      accountId,
      currentSessionId: current.sessionId as SessionId,
      currentPassword: PASSWORD,
      newPassword: 'the-next-password-then',
      client: h.client,
    });
    expect(changed.ok).toBe(true);

    // The OTHER session is revoked; the proving session's ROW stays live.
    const sessions = await h.runtime.deps.sessions.listSessions(accountId);
    const currentRow = sessions.find((s) => s.id === current.sessionId);
    const otherRow = sessions.find((s) => s.id === otherSession.sessionId);
    expect(currentRow?.revokedAt).toBeNull();
    expect(otherRow?.revokedAt).not.toBeNull();
    expect(otherRow?.revokedReason).toBe('password_changed');

    // Token-version boundary: BOTH old access tokens are stale, but the
    // current session's refresh chain still works and yields a fresh one.
    expect((await h.runtime.useCases.authenticateRequest.execute(current.accessToken)).ok).toBe(
      false,
    );
    const refreshed = await h.runtime.useCases.refreshSession.execute({
      refreshToken: current.refreshToken,
      client: h.client,
    });
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) throw new Error('unreachable');
    expect((await h.runtime.useCases.authenticateRequest.execute(refreshed.value.accessToken)).ok).toBe(
      true,
    );
    // The other session's refresh chain is dead with its family.
    expect(
      (
        await h.runtime.useCases.refreshSession.execute({
          refreshToken: otherSession.refreshToken,
          client: h.client,
        })
      ).ok,
    ).toBe(false);

    expect(h.auditWriter.events.map((e) => e.action)).toContain('identity.password.changed');
  });
});
