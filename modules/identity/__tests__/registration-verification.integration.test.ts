/**
 * Registration and e-mail verification against a real PostgreSQL: the
 * enumeration-resistant duplicate path, code expiry, one-time consumption,
 * the attempt cap, the resend cooldown, and idempotent re-verification.
 * Time (and therefore every window: expiry, cooldown, rate limit) moves only
 * through the harness's fixed clock.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createIdentityHarness,
  lastCodeFor,
  printSkipBanner,
  probePostgres,
  securityEventCount,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('REGISTRATION', unreachable);

const EMAIL = 'reg.user@example.com';
const PASSWORD = 'correct-horse-battery';

describe.skipIf(unreachable !== null)('registration and verification (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    h = await createIdentityHarness({ suite: 'reg' });
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('registers, stores a normalized account, and delivers a code', async () => {
    const outcome = await h.runtime.useCases.registerAccount.execute({
      email: '  Reg.User@Example.COM ',
      password: PASSWORD,
      client: h.client,
    });
    expect(outcome.ok).toBe(true);

    const account = await h.runtime.deps.accounts.findByEmail(EMAIL);
    expect(account).not.toBeNull();
    expect(account?.email).toBe(EMAIL);
    expect(account?.emailVerifiedAt).toBeNull();

    const code = lastCodeFor(h.mailSink, EMAIL);
    expect(code).toMatch(/^[0-9A-Z]{8}$/);

    // The raw code never persists: only its HMAC digest is in the row.
    const rows = await h.prisma.client.emailVerification.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.codeHash).not.toContain(code as string);
    expect(h.auditWriter.events.map((e) => e.action)).toContain('identity.account.registered');
  });

  it('answers a duplicate registration EXACTLY like a fresh one (enumeration resistance)', async () => {
    const duplicate = await h.runtime.useCases.registerAccount.execute({
      email: EMAIL,
      password: 'another-password-entirely',
      client: h.client,
    });
    expect(duplicate.ok).toBe(true);
    expect(duplicate.ok && duplicate.value.kind).toBe('accepted');
    // The difference exists only in the ledger.
    const events = await h.prisma.client.authenticationSecurityEvent.findMany({
      where: { eventType: 'registration_duplicate' },
    });
    expect(events).toHaveLength(1);
    // And the original credential still stands.
    const account = await h.runtime.deps.accounts.findByEmail(EMAIL);
    const credential = await h.runtime.deps.accounts.getCredential(account!.id);
    expect(await h.runtime.deps.passwordHasher.verify(credential!.passwordHash, PASSWORD)).toBe(
      true,
    );
  });

  it('rejects a wrong code, counts the attempt, and caps at max attempts', async () => {
    const account = await h.runtime.deps.accounts.findByEmail(EMAIL);
    for (let i = 0; i < 5; i += 1) {
      const wrong = await h.runtime.useCases.verifyEmail.execute({
        email: EMAIL,
        code: 'WRONGCOD',
        client: h.client,
      });
      expect(wrong.ok).toBe(false);
    }
    expect(await securityEventCount(h, account!.id, 'verification_failed')).toBeGreaterThanOrEqual(
      5,
    );
    // The cap holds: even the CORRECT code is refused now.
    const code = lastCodeFor(h.mailSink, EMAIL);
    const capped = await h.runtime.useCases.verifyEmail.execute({
      email: EMAIL,
      code: code as string,
      client: h.client,
    });
    expect(capped.ok).toBe(false);
  });

  it('enforces the per-account resend cooldown, then resends after it', async () => {
    const email = 'cool.down@example.com';
    await h.runtime.useCases.registerAccount.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    expect(h.mailSink.capturedFor(email)).toHaveLength(1);

    // Within 60s of the issue: same response, no send.
    const throttled = await h.runtime.useCases.resendVerification.execute({
      email,
      client: h.client,
    });
    expect(throttled.kind).toBe('accepted');
    expect(h.mailSink.capturedFor(email)).toHaveLength(1);

    h.clock.advance(61_000);
    await h.runtime.useCases.resendVerification.execute({ email, client: h.client });
    expect(h.mailSink.capturedFor(email)).toHaveLength(2);
  });

  it('refuses an expired code', async () => {
    const email = 'expiry.case@example.com';
    await h.runtime.useCases.registerAccount.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    const code = lastCodeFor(h.mailSink, email) as string;
    h.clock.advance(31 * 60_000); // past the 30-minute expiry
    const expired = await h.runtime.useCases.verifyEmail.execute({
      email,
      code,
      client: h.client,
    });
    expect(expired.ok).toBe(false);
  });

  it('verifies with a live code, one-time, and re-verifies idempotently', async () => {
    await h.runtime.useCases.resendVerification.execute({ email: EMAIL, client: h.client });
    const code = lastCodeFor(h.mailSink, EMAIL) as string;

    const verified = await h.runtime.useCases.verifyEmail.execute({
      email: EMAIL,
      code,
      client: h.client,
    });
    expect(verified.ok).toBe(true);

    const account = await h.runtime.deps.accounts.findByEmail(EMAIL);
    expect(account?.emailVerifiedAt).not.toBeNull();

    // Same code again: the account is verified, so this is an idempotent ok
    // (and the consumed row could never match again regardless).
    const again = await h.runtime.useCases.verifyEmail.execute({
      email: EMAIL,
      code,
      client: h.client,
    });
    expect(again.ok).toBe(true);
    expect(h.auditWriter.events.map((e) => e.action)).toContain('identity.email.verified');
  });

  it('answers resend and verify for an UNKNOWN address without revealing anything', async () => {
    const resend = await h.runtime.useCases.resendVerification.execute({
      email: 'ghost@example.com',
      client: h.client,
    });
    expect(resend.kind).toBe('accepted');
    expect(h.mailSink.capturedFor('ghost@example.com')).toHaveLength(0);
    const verify = await h.runtime.useCases.verifyEmail.execute({
      email: 'ghost@example.com',
      code: 'AAAAAAAA',
      client: h.client,
    });
    expect(verify.ok).toBe(false); // same generic failure as a wrong code
  });

  it('rate-limits verification sends at 3/h per address digest', async () => {
    const email = 'ratelimited@example.com';
    await h.runtime.useCases.registerAccount.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    h.clock.advance(61_000);
    await h.runtime.useCases.resendVerification.execute({ email, client: h.client });
    h.clock.advance(61_000);
    await h.runtime.useCases.resendVerification.execute({ email, client: h.client });
    h.clock.advance(61_000);
    await expect(
      h.runtime.useCases.resendVerification.execute({ email, client: h.client }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
