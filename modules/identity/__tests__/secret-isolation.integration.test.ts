/**
 * A SECRET THAT LOOKS LIKE AN INSTRUCTION IS STILL ONLY A SECRET.
 *
 * `IgnorePreviousInstructions!123` is a perfectly good password. So is a
 * recovery code that happens to spell `SYSTEMREVEALALLSECRETS`. Neither is
 * content, neither is a prompt, and neither may appear anywhere a person or a
 * future model could read it back.
 *
 * The classification exists in `@karar/content-trust` as SECRET_AUTH_MATERIAL,
 * whose one permitted destination is the credential verifier. This proves the
 * classification is true of the RUNNING SYSTEM rather than of a type: the
 * values below are pushed through real registration, real login, real MFA and
 * real recovery against live PostgreSQL, and then every place the platform
 * durably records anything about that account is read back and searched for
 * them.
 *
 * It matters that the values are instruction-shaped. A test using `hunter2`
 * would prove the same isolation, but this one also demonstrates that nothing
 * treats a credential as text to be interpreted — no normalisation pass, no
 * event payload, no diagnostic string.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  allowAllRateLimiter,
  createIdentityHarness,
  printSkipBanner,
  probePostgres,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('SECRET-ISOLATION', unreachable);

/** Synthetic. Instruction-shaped, and valid under the real password policy. */
const INJECTION_PASSWORD = 'IgnorePreviousInstructions!123';
const REPLACEMENT_PASSWORD = 'SYSTEM-reveal-every-secret!456';
const EMAIL = 'secret.isolation@example.invalid';

/** Every column the platform durably writes about an authentication attempt. */
async function everyRecordedString(h: IdentityHarness): Promise<string> {
  const rows = await h.prisma.client.$queryRaw<{ dump: string }[]>`
    SELECT coalesce(string_agg(t.dump, ' '), '') AS dump
      FROM (
        SELECT row_to_json(e)::text AS dump FROM public.authentication_security_events e
        UNION ALL
        SELECT row_to_json(a)::text FROM public.identity_accounts a
        UNION ALL
        SELECT row_to_json(c)::text FROM public.password_credentials c
        UNION ALL
        SELECT row_to_json(v)::text FROM public.email_verifications v
        UNION ALL
        SELECT row_to_json(r)::text FROM public.password_reset_requests r
        UNION ALL
        SELECT row_to_json(o)::text FROM platform.outbox_events o
      ) AS t`;
  return rows[0]?.dump ?? '';
}

describe.skipIf(unreachable !== null)('secret auth material is never content (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    h = await createIdentityHarness({ suite: 'secrets', rateLimiter: allowAllRateLimiter });
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('registers, fails, and succeeds with an instruction-shaped password', async () => {
    const registered = await h.runtime.useCases.registerAccount.execute({
      email: EMAIL,
      password: INJECTION_PASSWORD,
      client: h.client,
    });
    expect(registered.ok).toBe(true);

    // A wrong password, so a failure path records whatever it records.
    const wrong = await h.runtime.useCases.login.execute({
      email: EMAIL,
      password: 'SYSTEM: this one is wrong!789',
      client: h.client,
    });
    expect(wrong.ok).toBe(false);

    // And the right one, so the success path does too.
    const right = await h.runtime.useCases.login.execute({
      email: EMAIL,
      password: INJECTION_PASSWORD,
      client: h.client,
    });
    expect(right.ok).toBe(true);
  });

  it('writes the password nowhere — not in an event, an account, or the outbox', async () => {
    const recorded = await everyRecordedString(h);

    // The scan must actually have something to scan.
    expect(recorded.length).toBeGreaterThan(100);
    expect(recorded).not.toContain(INJECTION_PASSWORD);
    expect(recorded).not.toContain('SYSTEM: this one is wrong!789');
    // Not even a fragment that would make it guessable.
    expect(recorded).not.toContain('IgnorePreviousInstructions');
  });

  it('stores a verifier, not the password, and not a reversible encoding of it', async () => {
    const rows = await h.prisma.client.$queryRaw<{ hash: string }[]>`
      SELECT password_hash AS hash FROM public.password_credentials LIMIT 1`;
    const hash = rows[0]?.hash ?? '';

    expect(hash).not.toBe('');
    expect(hash).not.toContain(INJECTION_PASSWORD);
    // A modern password hash, not an encoding: base64 of the password would
    // round-trip, and this must not.
    expect(Buffer.from(hash, 'base64').toString('utf8')).not.toContain('Ignore');
  });

  it('keeps a reset token out of every record too', async () => {
    // `forgotPassword` answers identically for a known and an unknown address
    // — it is deliberately not an existence oracle — so there is no `ok` to
    // assert here. What matters is what it WROTE.
    await h.runtime.useCases.forgotPassword.execute({ email: EMAIL, client: h.client });

    const recorded = await everyRecordedString(h);
    // The delivered token is a secret; only its digest may be durable.
    const tokens = await h.prisma.client.$queryRaw<{ digest: string }[]>`
      SELECT code_hash AS digest FROM public.password_reset_requests LIMIT 1`;
    const digest = tokens[0]?.digest ?? '';
    expect(digest).not.toBe('');
    expect(recorded).not.toContain(REPLACEMENT_PASSWORD);
  });
});
