/**
 * Login — password authentication, lockout, and the MFA fork.
 *
 * ONE failure the caller can see: 'invalid_credentials'. Unknown address,
 * wrong password, disabled account, and an engaged lockout all produce it —
 * each records its own distinct ledger event server-side. Timing is
 * equalized: the unknown-address and missing-credential paths burn a dummy
 * argon2 verification.
 *
 * Lockout (legacy AUTHN-11): derived per (account, ip digest) by COUNTING
 * `login_failed` ledger rows in the window — threshold 10/15m. Engaging the
 * lock writes `login_locked` and erases nothing, so the counter cannot
 * reset when the lock applies, and failures recorded before the lock still
 * count after it lapses. Attempts while locked do not even reach the
 * password verifier (no oracle, no cost).
 */

import { Result } from '@karar/shared-kernel';

import { isMfaActive } from '../../domain/mfa.js';
import { normalizeEmail } from '../../domain/email-address.js';
import { RATE_LIMIT_POLICIES } from '@karar/platform/dist/ratelimit/index.js';
import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';
import { SessionIssuer, type IssuedSession } from '../session-issuer.js';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly client: ClientContext;
}

export type LoginSuccess =
  | { readonly kind: 'session'; readonly session: IssuedSession }
  | {
      readonly kind: 'mfa_required';
      readonly challengeToken: string;
      readonly challengeExpiresAt: Date;
    };

export type LoginError = { readonly kind: 'invalid_credentials' };

const INVALID = Result.err<LoginError>({ kind: 'invalid_credentials' });

export class Login {
  private readonly issuer: SessionIssuer;

  constructor(private readonly deps: IdentityDependencies) {
    this.issuer = new SessionIssuer(deps);
  }

  async execute(input: LoginInput): Promise<Result<LoginSuccess, LoginError>> {
    const deps = this.deps;
    const email = normalizeEmail(input.email);
    const ipDigest = input.client.ipDigest;

    // Distributed limits first — account-keyed on the ADDRESS digest so the
    // budget is identical for existing and non-existing accounts (no
    // existence oracle), and ip-keyed for spray coverage. Both fail closed.
    await deps.rateLimits.assertWithinLimit(
      RATE_LIMIT_POLICIES.loginPerAccount,
      deps.rateLimitKeys.emailKey(email),
      deps.clock.now(),
    );
    if (ipDigest !== null) {
      await deps.rateLimits.assertWithinLimit(
        RATE_LIMIT_POLICIES.loginPerIp,
        deps.rateLimitKeys.idKey(ipDigest),
        deps.clock.now(),
      );
    }

    const account = await deps.accounts.findByEmail(email);
    if (account === null) {
      await deps.passwordHasher.dummyVerify();
      await recordSecurity(deps, {
        accountId: null,
        eventType: 'login_failed',
        ipDigest,
        metadata: { reason: 'unknown_account' },
      });
      return INVALID;
    }

    // Lockout ledger check — before the verifier, so a locked window costs
    // an attacker nothing to probe and gives them nothing back.
    if (await this.isLockedOut(account.id, ipDigest)) {
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'login_locked',
        ipDigest,
      });
      return INVALID;
    }

    const credential = await deps.accounts.getCredential(account.id);
    if (credential === null) {
      await deps.passwordHasher.dummyVerify();
      await this.recordFailure(account.id, ipDigest, 'no_credential');
      return INVALID;
    }

    const verified = await deps.passwordHasher.verify(credential.passwordHash, input.password);
    if (!verified) {
      await this.recordFailure(account.id, ipDigest, 'wrong_password');
      return INVALID;
    }

    // Disabled is checked AFTER verification so the timing of the disabled
    // path matches the normal one; the response stays generic (AUTHN-08).
    if (account.status !== 'active') {
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'account_disabled_login_attempt',
        ipDigest,
      });
      return INVALID;
    }

    // Upgrade-on-login: a hash under an older parameter set is replaced now,
    // while the plaintext is legitimately in hand.
    if (deps.passwordHasher.needsRehash(credential.paramsVersion)) {
      const upgraded = await deps.passwordHasher.hash(input.password);
      await deps.accounts.replacePassword({
        accountId: account.id,
        passwordHash: upgraded.passwordHash,
        paramsVersion: upgraded.paramsVersion,
        now: deps.clock.now(),
      });
    }

    const enrolment = await deps.mfa.getEnrolment(account.id);
    if (isMfaActive(enrolment)) {
      const challenge = await deps.tokenSigner.signChallengeToken(account.id, deps.clock.now());
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'mfa_challenge_issued',
        ipDigest,
      });
      return Result.ok({
        kind: 'mfa_required',
        challengeToken: challenge.token,
        challengeExpiresAt: challenge.expiresAt,
      });
    }

    const session = await this.issuer.issue(account, input.client);
    await recordSecurity(deps, {
      accountId: account.id,
      eventType: 'login_succeeded',
      ipDigest,
      metadata: { sessionId: session.sessionId },
    });
    await auditOrFail(deps, {
      action: 'identity.login.succeeded',
      accountId: account.id,
      resourceType: 'identity_session',
      resourceId: session.sessionId,
      outcome: 'SUCCESS',
    });
    return Result.ok({ kind: 'session', session });
  }

  private async isLockedOut(accountId: string, ipDigest: string | null): Promise<boolean> {
    const deps = this.deps;
    const since = new Date(deps.clock.now().getTime() - deps.policy.lockoutWindowMs);
    const failures = await deps.securityEvents.countSince({
      accountId,
      eventTypes: ['login_failed'],
      ...(ipDigest !== null ? { ipDigest } : {}),
      since,
    });
    return failures >= deps.policy.lockoutThreshold;
  }

  private async recordFailure(
    accountId: string,
    ipDigest: string | null,
    reason: string,
  ): Promise<void> {
    await recordSecurity(this.deps, {
      accountId,
      eventType: 'login_failed',
      ipDigest,
      metadata: { reason },
    });
  }
}
