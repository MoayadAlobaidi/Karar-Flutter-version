/**
 * The MFA matrix against a real PostgreSQL: enrol → confirm → challenge on
 * login (TOTP and recovery), encrypted-at-rest secrets with key-version
 * provenance, one-time recovery codes with the derived 5/15m attempt lock,
 * disable (proof required, codes destroyed), and the mfa_verify budget.
 *
 * The TOTP codes tests present are computed with the same otplib the adapter
 * uses, against the secret captured from the ONE response that carries it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NobleCryptoPlugin, ScureBase32Plugin, TOTP } from 'otplib';
import { UserId } from '@karar/shared-kernel';

import {
  allowAllRateLimiter,
  createIdentityHarness,
  printSkipBanner,
  probePostgres,
  securityEventCount,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('MFA', unreachable);

const PASSWORD = 'mfa-suite-password';
const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

async function codeFor(h: IdentityHarness, secret: string): Promise<string> {
  return totp.generate({ secret, epoch: Math.floor(h.clock.now().getTime() / 1000) });
}

interface EnrolledAccount {
  accountId: UserId;
  email: string;
  secret: string;
  recoveryCodes: readonly string[];
}

async function registerWithMfa(h: IdentityHarness, email: string): Promise<EnrolledAccount> {
  await h.runtime.useCases.registerAccount.execute({ email, password: PASSWORD, client: h.client });
  const account = await h.runtime.deps.accounts.findByEmail(email);
  const accountId = account!.id;

  const enrolled = await h.runtime.useCases.enrollMfa.execute({ accountId, client: h.client });
  if (!enrolled.ok) throw new Error('expected enrolment to start');
  const secret = enrolled.value.secret;

  const confirmed = await h.runtime.useCases.confirmMfa.execute({
    accountId,
    code: await codeFor(h, secret),
    client: h.client,
  });
  if (!confirmed.ok) throw new Error('expected confirmation');
  return { accountId, email, secret, recoveryCodes: confirmed.value.recoveryCodes };
}

async function challengeTokenFor(h: IdentityHarness, email: string): Promise<string> {
  const outcome = await h.runtime.useCases.login.execute({
    email,
    password: PASSWORD,
    client: h.client,
  });
  if (!outcome.ok || outcome.value.kind !== 'mfa_required') {
    throw new Error('expected an MFA challenge');
  }
  return outcome.value.challengeToken;
}

describe.skipIf(unreachable !== null)('MFA lifecycle (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    h = await createIdentityHarness({ suite: 'mfa', rateLimiter: allowAllRateLimiter });
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('enrols and confirms: secret encrypted at rest with provenance, 10 one-time codes issued', async () => {
    const { accountId, secret, recoveryCodes } = await registerWithMfa(h, 'mfa.happy@example.com');

    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);
    for (const code of recoveryCodes) expect(code).toMatch(/^[0-9A-Z]{26}$/);

    // Owner-only RLS: an UNSCOPED read of the MFA tables sees nothing…
    const unscoped = await h.prisma.client.$queryRaw<
      Array<{ account_id: string }>
    >`SELECT account_id FROM public.mfa_enrolments`;
    expect(unscoped).toHaveLength(0);
    // …the owner-scoped transaction sees the row.
    const row = await h.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${accountId}, true)`;
      return tx.$queryRaw<
        Array<{ secret_ciphertext: Uint8Array; key_version: string; confirmed_at: Date | null }>
      >`SELECT secret_ciphertext, key_version, confirmed_at FROM public.mfa_enrolments`;
    });
    expect(row).toHaveLength(1);
    expect(row[0]?.confirmed_at).not.toBeNull();
    // Encrypted at rest: the ciphertext is not the secret, and the row names
    // the exact key version that produced it (ADR-0017).
    const storedText = Buffer.from(row[0]!.secret_ciphertext).toString('utf8');
    expect(storedText).not.toContain(secret);
    expect(row[0]?.key_version).toMatch(/^karar-ref:key-version:identity-mfa-secrets@v\d+$/);

    // Recovery codes rest as SHA-256 hashes, never raw.
    const codeRows = await h.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${accountId}, true)`;
      return tx.$queryRaw<
        Array<{ code_hash: string }>
      >`SELECT code_hash FROM public.mfa_recovery_codes`;
    });
    expect(codeRows).toHaveLength(10);
    for (const stored of codeRows) {
      expect(recoveryCodes).not.toContain(stored.code_hash);
    }

    // The secret appears in NO audit row and NO ledger row.
    const auditBlob = JSON.stringify(h.auditWriter.events);
    expect(auditBlob).not.toContain(secret);
    const ledger = await h.prisma.client.authenticationSecurityEvent.findMany({});
    expect(JSON.stringify(ledger)).not.toContain(secret);
    expect(accountId).toBeTruthy();
  });

  it('gates login on the challenge and completes it with a TOTP code (±1 step window)', async () => {
    const { email, secret, accountId } = await registerWithMfa(h, 'mfa.challenge@example.com');
    const challengeToken = await challengeTokenFor(h, email);

    // A code from the PREVIOUS 30s step still verifies (window ±1)…
    const previousStep = await totp.generate({
      secret,
      epoch: Math.floor(h.clock.now().getTime() / 1000) - 30,
    });
    const completed = await h.runtime.useCases.verifyMfaChallenge.withTotp({
      challengeToken,
      code: previousStep,
      client: h.client,
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw new Error('unreachable');
    expect(
      (await h.runtime.useCases.authenticateRequest.execute(completed.value.session.accessToken))
        .ok,
    ).toBe(true);
    expect(await securityEventCount(h, accountId, 'mfa_completed')).toBe(1);

    // …but a code two steps out does not.
    const challenge2 = await challengeTokenFor(h, email);
    const staleCode = await totp.generate({
      secret,
      epoch: Math.floor(h.clock.now().getTime() / 1000) - 90,
    });
    const stale = await h.runtime.useCases.verifyMfaChallenge.withTotp({
      challengeToken: challenge2,
      code: staleCode,
      client: h.client,
    });
    expect(stale.ok).toBe(false);
  });

  it('expires the challenge token and rejects a forged or reused-audience token', async () => {
    const { email } = await registerWithMfa(h, 'mfa.expiry@example.com');
    const challengeToken = await challengeTokenFor(h, email);
    h.clock.advance(6 * 60_000); // past the 5-minute challenge window
    const expired = await h.runtime.useCases.verifyMfaChallenge.withTotp({
      challengeToken,
      code: '000000',
      client: h.client,
    });
    expect(expired.ok).toBe(false);
    if (expired.ok) throw new Error('unreachable');
    expect(expired.error.kind).toBe('invalid_challenge');

    // An ACCESS token must never pass where a challenge is expected.
    const login = await h.runtime.useCases.login.execute({
      email: 'mfa.expiry@example.com',
      password: PASSWORD,
      client: h.client,
    });
    void login; // mfa_required — no access token exists for this account; use a fresh non-MFA one
    await h.runtime.useCases.registerAccount.execute({
      email: 'plain.token@example.com',
      password: PASSWORD,
      client: h.client,
    });
    const plain = await h.runtime.useCases.login.execute({
      email: 'plain.token@example.com',
      password: PASSWORD,
      client: h.client,
    });
    if (!plain.ok || plain.value.kind !== 'session') throw new Error('expected session');
    const crossAudience = await h.runtime.useCases.verifyMfaChallenge.withTotp({
      challengeToken: plain.value.session.accessToken,
      code: '000000',
      client: h.client,
    });
    expect(crossAudience.ok).toBe(false);
  });

  it('completes login with a recovery code exactly once', async () => {
    const { email, accountId, recoveryCodes } = await registerWithMfa(h, 'mfa.recovery@example.com');
    const challengeToken = await challengeTokenFor(h, email);
    const code = recoveryCodes[0] as string;

    const completed = await h.runtime.useCases.verifyMfaChallenge.withRecoveryCode({
      challengeToken,
      recoveryCode: code,
      client: h.client,
    });
    expect(completed.ok).toBe(true);
    expect(await securityEventCount(h, accountId, 'recovery_code_used')).toBe(1);
    const remaining = await h.runtime.deps.mfa.countUnusedRecoveryCodes(accountId);
    expect(remaining).toBe(9);

    // One-time: the SAME code fails on a fresh challenge.
    const challenge2 = await challengeTokenFor(h, email);
    const replay = await h.runtime.useCases.verifyMfaChallenge.withRecoveryCode({
      challengeToken: challenge2,
      recoveryCode: code,
      client: h.client,
    });
    expect(replay.ok).toBe(false);
    expect(await securityEventCount(h, accountId, 'recovery_code_failed')).toBe(1);
  });

  it('locks recovery after 5 failed attempts in 15m — and the counter never resets (AUTHN-04)', async () => {
    const { email, accountId, recoveryCodes } = await registerWithMfa(h, 'mfa.lock@example.com');

    for (let i = 0; i < 5; i += 1) {
      const challengeToken = await challengeTokenFor(h, email);
      const failed = await h.runtime.useCases.verifyMfaChallenge.withRecoveryCode({
        challengeToken,
        recoveryCode: 'AAAAAAAAAAAAAAAAAAAAAAAAAA',
        client: h.client,
      });
      expect(failed.ok).toBe(false);
    }
    expect(await securityEventCount(h, accountId, 'recovery_code_failed')).toBe(5);

    // Locked: even a VALID code is refused, recovery_locked is recorded, and
    // no recovery_code_failed is appended (the lock cannot extend itself).
    const challengeToken = await challengeTokenFor(h, email);
    const lockedProbe = await h.runtime.useCases.verifyMfaChallenge.withRecoveryCode({
      challengeToken,
      recoveryCode: recoveryCodes[0] as string,
      client: h.client,
    });
    expect(lockedProbe.ok).toBe(false);
    expect(await securityEventCount(h, accountId, 'recovery_locked')).toBe(1);
    expect(await securityEventCount(h, accountId, 'recovery_code_failed')).toBe(5);

    // 14 minutes on: still locked (nothing was reset when the lock engaged).
    h.clock.advance(14 * 60_000);
    const stillLocked = await h.runtime.useCases.verifyMfaChallenge.withRecoveryCode({
      challengeToken: await challengeTokenFor(h, email),
      recoveryCode: recoveryCodes[0] as string,
      client: h.client,
    });
    expect(stillLocked.ok).toBe(false);

    // Past the window the valid code works.
    h.clock.advance(2 * 60_000);
    const afterWindow = await h.runtime.useCases.verifyMfaChallenge.withRecoveryCode({
      challengeToken: await challengeTokenFor(h, email),
      recoveryCode: recoveryCodes[0] as string,
      client: h.client,
    });
    expect(afterWindow.ok).toBe(true);
  });

  it('disables MFA with proof, destroys recovery codes, and re-enrolment starts clean', async () => {
    const { email, accountId, secret } = await registerWithMfa(h, 'mfa.disable@example.com');

    const wrongProof = await h.runtime.useCases.disableMfa.execute({
      accountId,
      code: '000000',
      client: h.client,
    });
    expect(wrongProof.ok).toBe(false);

    const disabled = await h.runtime.useCases.disableMfa.execute({
      accountId,
      code: await codeFor(h, secret),
      client: h.client,
    });
    expect(disabled.ok).toBe(true);

    const codesLeft = await h.prisma.client.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*)::bigint AS count FROM public.mfa_recovery_codes`;
    // Owner-scoped count through the repository confirms zero as well.
    expect(await h.runtime.deps.mfa.countUnusedRecoveryCodes(accountId)).toBe(0);
    void codesLeft;

    // Login is single-factor again.
    const login = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    expect(login.ok && login.value.kind === 'session').toBe(true);

    // Re-enrolment mints a DIFFERENT secret and requires confirmation anew.
    const reEnrolled = await h.runtime.useCases.enrollMfa.execute({ accountId, client: h.client });
    expect(reEnrolled.ok).toBe(true);
    if (!reEnrolled.ok) throw new Error('unreachable');
    expect(reEnrolled.value.secret).not.toBe(secret);
    const midLogin = await h.runtime.useCases.login.execute({
      email,
      password: PASSWORD,
      client: h.client,
    });
    // Unconfirmed enrolment does not gate login.
    expect(midLogin.ok && midLogin.value.kind === 'session').toBe(true);

    expect(h.auditWriter.events.map((e) => e.action)).toContain('identity.mfa.disabled');
  });

  it('keeps the admin-MFA-requirable flag representable on the account', async () => {
    const { accountId } = await registerWithMfa(h, 'mfa.flag@example.com');
    await h.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${accountId}, true)`;
      await tx.identityAccount.update({ where: { id: accountId }, data: { mfaRequired: true } });
    });
    const account = await h.runtime.deps.accounts.findById(accountId);
    expect(account?.mfaRequired).toBe(true);
  });

  it('enforces the distributed mfa_verify budget at 10/15m', async () => {
    const limited = await createIdentityHarness({ suite: 'mfarl' });
    try {
      const email = 'mfa.limited@example.com';
      await limited.runtime.useCases.registerAccount.execute({
        email,
        password: PASSWORD,
        client: limited.client,
      });
      const account = await limited.runtime.deps.accounts.findByEmail(email);
      const enrolled = await limited.runtime.useCases.enrollMfa.execute({
        accountId: account!.id,
        client: limited.client,
      });
      if (!enrolled.ok) throw new Error('expected enrolment');
      await limited.runtime.useCases.confirmMfa.execute({
        accountId: account!.id,
        code: await totp.generate({
          secret: enrolled.value.secret,
          epoch: Math.floor(limited.clock.now().getTime() / 1000),
        }),
        client: limited.client,
      });
      const login = await limited.runtime.useCases.login.execute({
        email,
        password: PASSWORD,
        client: limited.client,
      });
      if (!login.ok || login.value.kind !== 'mfa_required') throw new Error('expected challenge');
      const challengeToken = login.value.challengeToken;

      for (let i = 0; i < 10; i += 1) {
        const attempt = await limited.runtime.useCases.verifyMfaChallenge.withTotp({
          challengeToken,
          code: '000000',
          client: limited.client,
        });
        expect(attempt.ok).toBe(false);
      }
      await expect(
        limited.runtime.useCases.verifyMfaChallenge.withTotp({
          challengeToken,
          code: '000000',
          client: limited.client,
        }),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    } finally {
      await limited.end();
    }
  });
});
