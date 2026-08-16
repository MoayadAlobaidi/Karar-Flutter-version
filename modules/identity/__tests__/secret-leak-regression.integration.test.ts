/**
 * Secret-leak regression: drive every identity flow, collect every output
 * channel the module writes (audit rows, the security ledger, security
 * notices, thrown-error problem documents), and grep the lot for every
 * secret the run produced — the password, the stored hash, raw refresh and
 * reset tokens, the verification code, the TOTP secret, every recovery
 * code, and the access token. One assertion sweep, so a future field
 * addition that leaks anything fails HERE.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NobleCryptoPlugin, ScureBase32Plugin, TOTP } from 'otplib';
import { toProblemDetails } from '@karar/platform/dist/errors/index.js';

import {
  allowAllRateLimiter,
  createIdentityHarness,
  lastCodeFor,
  lastResetTokenFor,
  printSkipBanner,
  probePostgres,
  type IdentityHarness,
} from './helpers/identity-test-harness.js';

const unreachable = await probePostgres();
if (unreachable !== null) printSkipBanner('LEAK-REGRESSION', unreachable);

const EMAIL = 'leak.subject@example.com';
const PASSWORD = 'the-secret-password-nobody-may-see';
const NEW_PASSWORD = 'the-second-secret-password-kept';
const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

describe.skipIf(unreachable !== null)('secret-leak regression (live PostgreSQL)', () => {
  let h: IdentityHarness;

  beforeAll(async () => {
    h = await createIdentityHarness({ suite: 'leak', rateLimiter: allowAllRateLimiter });
  }, 180_000);

  afterAll(async () => {
    await h.end();
  });

  it('no output channel carries credential material from any flow', async () => {
    const secrets: Record<string, string> = { password: PASSWORD, newPassword: NEW_PASSWORD };
    // Failure outcomes exactly as they leave the module: Result errors (what
    // controllers translate) and thrown errors as RFC 7807 documents.
    const problems: string[] = [];
    const capture = async (fn: () => Promise<unknown>) => {
      try {
        const outcome = (await fn()) as { ok?: boolean; error?: unknown };
        if (outcome !== null && typeof outcome === 'object' && outcome.ok === false) {
          problems.push(JSON.stringify(outcome.error));
        }
      } catch (error) {
        problems.push(JSON.stringify(toProblemDetails(error)));
      }
    };
    const uc = h.runtime.useCases;

    // Registration + verification (including a failed attempt).
    await uc.registerAccount.execute({ email: EMAIL, password: PASSWORD, client: h.client });
    secrets['verificationCode'] = lastCodeFor(h.mailSink, EMAIL) as string;
    await capture(() =>
      uc.verifyEmail.execute({ email: EMAIL, code: 'WRONGCOD', client: h.client }),
    );
    await uc.verifyEmail.execute({
      email: EMAIL,
      code: secrets['verificationCode'],
      client: h.client,
    });

    // Login (wrong then right), MFA enrol/confirm/challenge, refresh + reuse.
    await capture(() =>
      uc.login.execute({ email: EMAIL, password: 'wrong-password-attempt', client: h.client }),
    );
    const account = await h.runtime.deps.accounts.findByEmail(EMAIL);
    const enrolled = await uc.enrollMfa.execute({ accountId: account!.id, client: h.client });
    if (!enrolled.ok) throw new Error('expected enrolment');
    secrets['totpSecret'] = enrolled.value.secret;
    const epoch = () => Math.floor(h.clock.now().getTime() / 1000);
    const confirmed = await uc.confirmMfa.execute({
      accountId: account!.id,
      code: await totp.generate({ secret: secrets['totpSecret'], epoch: epoch() }),
      client: h.client,
    });
    if (!confirmed.ok) throw new Error('expected confirmation');
    confirmed.value.recoveryCodes.forEach((code, i) => {
      secrets[`recoveryCode${i}`] = code;
    });

    const login = await uc.login.execute({ email: EMAIL, password: PASSWORD, client: h.client });
    if (!login.ok || login.value.kind !== 'mfa_required') throw new Error('expected challenge');
    const completed = await uc.verifyMfaChallenge.withTotp({
      challengeToken: login.value.challengeToken,
      code: await totp.generate({ secret: secrets['totpSecret'], epoch: epoch() }),
      client: h.client,
    });
    if (!completed.ok) throw new Error('expected session');
    secrets['accessToken'] = completed.value.session.accessToken;
    secrets['refreshToken'] = completed.value.session.refreshToken;

    const refreshed = await uc.refreshSession.execute({
      refreshToken: secrets['refreshToken'],
      client: h.client,
    });
    if (!refreshed.ok) throw new Error('expected rotation');
    secrets['rotatedRefreshToken'] = refreshed.value.refreshToken;
    await capture(() =>
      uc.refreshSession.execute({ refreshToken: secrets['refreshToken']!, client: h.client }),
    ); // reuse → notice sent

    // Password recovery end-to-end.
    await uc.forgotPassword.execute({ email: EMAIL, client: h.client });
    secrets['resetToken'] = lastResetTokenFor(h.mailSink, EMAIL) as string;
    await uc.resetPassword.execute({
      token: secrets['resetToken'],
      newPassword: NEW_PASSWORD,
      client: h.client,
    });

    // The stored hash is itself SECRET-classified output.
    const credential = await h.runtime.deps.accounts.getCredential(account!.id);
    secrets['passwordHash'] = credential!.passwordHash;

    // ---- the sweep ----------------------------------------------------
    const ledgerRows = await h.prisma.client.authenticationSecurityEvent.findMany({});
    const channels: Record<string, string> = {
      auditRows: JSON.stringify(h.auditWriter.events),
      ledgerRows: JSON.stringify(ledgerRows),
      problemDocuments: problems.join('\n'),
      securityNotices: JSON.stringify(
        h.mailSink.captured().filter((entry) => entry.type === 'security_notice'),
      ),
    };

    expect(h.auditWriter.events.length).toBeGreaterThan(3);
    expect(ledgerRows.length).toBeGreaterThan(5);
    expect(problems.length).toBeGreaterThan(0);

    for (const [channelName, blob] of Object.entries(channels)) {
      for (const [secretName, secretValue] of Object.entries(secrets)) {
        expect
          .soft(
            blob.includes(secretValue),
            `${channelName} leaked ${secretName}`,
          )
          .toBe(false);
      }
    }

    // The ledger also never carries a raw e-mail address or raw IP.
    expect(channels['ledgerRows']).not.toContain(EMAIL);
    expect(channels['ledgerRows']).not.toContain('203.0.113.10');
    expect(channels['auditRows']).not.toContain('203.0.113.10');
  });
});
