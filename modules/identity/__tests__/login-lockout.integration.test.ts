/**
 * Login against a real PostgreSQL: valid, invalid (one generic error for
 * unknown/wrong/disabled), and the derived lockout — including the AUTHN-11
 * property that engaging the lock resets nothing: failures recorded before
 * the lock still count after it lapses.
 *
 * Rate limits would fire at the same 10/15m threshold as the lockout ledger
 * (deliberately); this suite raises the LIMITER's ceiling so the ledger
 * derivation is what's being proven, then proves the limiter separately.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  allowAllRateLimiter,
  createIdentityHarness,
  printSkipBanner,
  probePostgres,
  securityEventCount,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('LOGIN', unreachable);

const EMAIL = 'login.user@example.com';
const PASSWORD = 'a-genuinely-fine-password';

async function register(h: IdentityHarness, email: string, password: string) {
  const outcome = await h.runtime.useCases.registerAccount.execute({
    email,
    password,
    client: h.client,
  });
  expect(outcome.ok).toBe(true);
  const account = await h.runtime.deps.accounts.findByEmail(email);
  expect(account).not.toBeNull();
  return account!;
}

describe.skipIf(unreachable !== null)('login and lockout (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    // The permissive limiter exposes the LEDGER controls; the distributed
    // limiter is proven with a real one in the dedicated test below.
    h = await createIdentityHarness({ suite: 'login', rateLimiter: allowAllRateLimiter });
    await register(h, EMAIL, PASSWORD);
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('logs in with valid credentials: session row, family, first token, tokens issued', async () => {
    const outcome = await h.runtime.useCases.login.execute({
      email: EMAIL,
      password: PASSWORD,
      client: h.client,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || outcome.value.kind !== 'session') throw new Error('expected a session');
    const issued = outcome.value.session;
    expect(issued.accessToken.split('.')).toHaveLength(3);
    expect(issued.refreshToken.length).toBeGreaterThanOrEqual(43);

    const account = await h.runtime.deps.accounts.findByEmail(EMAIL);
    const sessions = await h.runtime.deps.sessions.listSessions(account!.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.ipDigest).toBe(h.client.ipDigest);
    expect(sessions[0]?.userAgentSummary).toBe('Chrome on macOS');

    const families = await h.prisma.client.refreshTokenFamily.findMany({});
    expect(families).toHaveLength(1);
    const tokens = await h.prisma.client.refreshToken.findMany({});
    expect(tokens).toHaveLength(1);
    // The raw refresh token never persists — only its SHA-256.
    expect(tokens[0]?.tokenHash).not.toBe(issued.refreshToken);

    // The access token verifies and authenticates a request (DB-backed).
    const principal = await h.runtime.useCases.authenticateRequest.execute(issued.accessToken);
    expect(principal.ok).toBe(true);
  });

  it('answers unknown address and wrong password with the SAME generic error', async () => {
    const unknown = await h.runtime.useCases.login.execute({
      email: 'nobody.here@example.com',
      password: PASSWORD,
      client: h.client,
    });
    const wrong = await h.runtime.useCases.login.execute({
      email: EMAIL,
      password: 'not-the-password',
      client: h.client,
    });
    expect(unknown.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (unknown.ok || wrong.ok) throw new Error('expected failures');
    expect(unknown.error).toEqual(wrong.error);
  });

  it('locks after 10 failures per (account, ip) and does NOT reset the counter on lock', async () => {
    const email = 'lockout.case@example.com';
    const password = 'lockout-case-password';
    const account = await register(h, email, password);

    // One failure exists already? No — fresh address. Drive to the threshold.
    for (let i = 0; i < 10; i += 1) {
      const failed = await h.runtime.useCases.login.execute({
        email,
        password: 'wrong-password',
        client: h.client,
      });
      expect(failed.ok).toBe(false);
    }
    expect(await securityEventCount(h, account.id, 'login_failed')).toBe(10);

    // Locked: even the CORRECT password gets the generic error, the ledger
    // records login_locked, and NO login_failed is appended (the lock cannot
    // extend itself).
    const lockedAttempt = await h.runtime.useCases.login.execute({
      email,
      password,
      client: h.client,
    });
    expect(lockedAttempt.ok).toBe(false);
    expect(await securityEventCount(h, account.id, 'login_locked')).toBe(1);
    expect(await securityEventCount(h, account.id, 'login_failed')).toBe(10);

    // AUTHN-11: engaging the lock erased nothing. 14 minutes later the
    // failures are still inside the window and the lock still holds.
    h.clock.advance(14 * 60_000);
    const stillLocked = await h.runtime.useCases.login.execute({
      email,
      password,
      client: h.client,
    });
    expect(stillLocked.ok).toBe(false);
    expect(await securityEventCount(h, account.id, 'login_locked')).toBe(2);

    // Past the window the derivation counts zero and the real password works.
    h.clock.advance(2 * 60_000);
    const afterWindow = await h.runtime.useCases.login.execute({
      email,
      password,
      client: h.client,
    });
    expect(afterWindow.ok).toBe(true);
  });

  it('scopes the lockout to the ip digest: a different address is not locked out', async () => {
    const email = 'perip.case@example.com';
    const password = 'per-ip-case-password';
    await register(h, email, password);
    const otherClient = {
      ipDigest: h.runtime.deps.digester.ipDigest('198.51.100.7'),
      userAgentSummary: 'Firefox on Windows',
    };
    for (let i = 0; i < 10; i += 1) {
      await h.runtime.useCases.login.execute({
        email,
        password: 'wrong-password',
        client: h.client,
      });
    }
    // Locked for the attacking ip, open for the owner's other device.
    const attacker = await h.runtime.useCases.login.execute({
      email,
      password,
      client: h.client,
    });
    expect(attacker.ok).toBe(false);
    const owner = await h.runtime.useCases.login.execute({
      email,
      password,
      client: otherClient,
    });
    expect(owner.ok).toBe(true);
  });

  it('rejects a disabled account with the SAME generic error and records the event', async () => {
    const email = 'disabled.case@example.com';
    const password = 'disabled-case-password';
    const account = await register(h, email, password);
    const disabled = await h.runtime.useCases.disableAccount.execute({
      accountId: account.id,
      reason: 'compliance hold',
      actorAccountId: null,
      client: h.client,
    });
    expect(disabled.ok).toBe(true);

    const attempt = await h.runtime.useCases.login.execute({
      email,
      password,
      client: h.client,
    });
    expect(attempt.ok).toBe(false);
    if (attempt.ok) throw new Error('expected failure');
    expect(attempt.error.kind).toBe('invalid_credentials');
    expect(await securityEventCount(h, account.id, 'account_disabled_login_attempt')).toBe(1);
  });

  it('enforces the distributed per-account login limit at 10/15m', async () => {
    // Separate harness with the REAL limiter. A NON-EXISTENT address proves
    // the budget is identical for unknown accounts: the limiter keys on the
    // address digest, not on account rows — no existence oracle.
    const limited = await createIdentityHarness({ suite: 'loginrl' });
    try {
      const email = 'no-such-account@example.com';
      for (let i = 0; i < 10; i += 1) {
        const failed = await limited.runtime.useCases.login.execute({
          email,
          password: 'whatever-password',
          client: limited.client,
        });
        expect(failed.ok).toBe(false);
      }
      await expect(
        limited.runtime.useCases.login.execute({
          email,
          password: 'whatever-password',
          client: limited.client,
        }),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    } finally {
      await limited.end();
    }
  });
});
