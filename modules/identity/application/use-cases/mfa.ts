/**
 * MFA lifecycle: enrol → confirm (proves possession, issues recovery codes)
 * → challenge at login → disable. The TOTP secret is returned exactly once
 * (enrol) and recovery codes exactly once (confirm); after that neither is
 * ever rendered again — not in responses, not in logs, not in audit
 * metadata. The secret rests encrypted through the platform
 * EncryptionProvider with key-version provenance (ADR-0017).
 *
 * Recovery-code verification carries its own attempt ledger (the second half
 * of legacy AUTHN-04): 5 failures per account per 15 minutes locks recovery
 * — derived by counting append-only events, so the lock resets nothing.
 */

import { Result, type UserId } from '@karar/shared-kernel';

import { isMfaActive, RECOVERY_CODE_COUNT } from '../../domain/mfa.js';
import { RATE_LIMIT_POLICIES } from '@karar/platform/dist/ratelimit/index.js';
import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';
import { SessionIssuer, type IssuedSession } from '../session-issuer.js';

// --- enrol -----------------------------------------------------------------

export type EnrollMfaError = { readonly kind: 'already_enrolled' };

export interface MfaEnrolmentStarted {
  readonly kind: 'enrolment_started';
  /** Rendered ONCE for the authenticator app; never retrievable again. */
  readonly secret: string;
  readonly otpauthUrl: string;
}

export class EnrollMfa {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(input: {
    readonly accountId: UserId;
    readonly client: ClientContext;
  }): Promise<Result<MfaEnrolmentStarted, EnrollMfaError>> {
    const deps = this.deps;
    const existing = await deps.mfa.getEnrolment(input.accountId);
    if (isMfaActive(existing)) return Result.err({ kind: 'already_enrolled' });

    const account = await deps.accounts.findById(input.accountId);
    const label = account?.email ?? input.accountId;
    const secret = deps.totp.generateSecret();
    const encrypted = await deps.mfaCipher.encrypt(secret);
    await deps.mfa.saveEnrolment({
      accountId: input.accountId,
      type: 'totp',
      secretCiphertext: encrypted.ciphertext,
      keyVersion: encrypted.keyVersion,
      createdAt: deps.clock.now(),
      confirmedAt: null,
      disabledAt: null,
    });
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'mfa_enrolled',
      ipDigest: input.client.ipDigest,
    });
    await auditOrFail(deps, {
      action: 'identity.mfa.enrolled',
      accountId: input.accountId,
      resourceType: 'identity_account',
      resourceId: input.accountId,
      outcome: 'SUCCESS',
    });
    return Result.ok({
      kind: 'enrolment_started',
      secret,
      otpauthUrl: deps.totp.otpauthUrl(secret, label),
    });
  }
}

// --- confirm ---------------------------------------------------------------

export type ConfirmMfaError =
  { readonly kind: 'no_pending_enrolment' } | { readonly kind: 'invalid_code' };

export interface MfaConfirmed {
  readonly kind: 'confirmed';
  /** Rendered ONCE; stored only as SHA-256 hashes. */
  readonly recoveryCodes: readonly string[];
}

export class ConfirmMfa {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(input: {
    readonly accountId: UserId;
    readonly code: string;
    readonly client: ClientContext;
  }): Promise<Result<MfaConfirmed, ConfirmMfaError>> {
    const deps = this.deps;
    const enrolment = await deps.mfa.getEnrolment(input.accountId);
    if (enrolment === null || enrolment.confirmedAt !== null || enrolment.disabledAt !== null) {
      return Result.err({ kind: 'no_pending_enrolment' });
    }
    const secret = await deps.mfaCipher.decrypt({
      ciphertext: enrolment.secretCiphertext,
      keyVersion: enrolment.keyVersion,
    });
    if (!(await deps.totp.verify(input.code, secret, deps.clock.now()))) {
      await recordSecurity(deps, {
        accountId: input.accountId,
        eventType: 'mfa_challenge_failed',
        ipDigest: input.client.ipDigest,
        metadata: { phase: 'confirm' },
      });
      return Result.err({ kind: 'invalid_code' });
    }

    const now = deps.clock.now();
    await deps.mfa.confirmEnrolment(input.accountId, now);
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      deps.secretSource.recoveryCode(),
    );
    await deps.mfa.replaceRecoveryCodes(
      input.accountId,
      recoveryCodes.map((code) => ({
        id: deps.secretSource.id(),
        codeHash: deps.digester.recoveryCodeDigest(code),
        createdAt: now,
      })),
    );
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'mfa_confirmed',
      ipDigest: input.client.ipDigest,
    });
    await auditOrFail(deps, {
      action: 'identity.mfa.confirmed',
      accountId: input.accountId,
      resourceType: 'identity_account',
      resourceId: input.accountId,
      outcome: 'SUCCESS',
    });
    const account = await deps.accounts.findById(input.accountId);
    if (account !== null) {
      await deps.notifications.sendSecurityNotice({ to: account.email, kind: 'mfa_enrolled' });
    }
    return Result.ok({ kind: 'confirmed', recoveryCodes });
  }
}

// --- challenge (login completion) ------------------------------------------

export type MfaChallengeError =
  { readonly kind: 'invalid_challenge' } | { readonly kind: 'invalid_code' };

export class VerifyMfaChallenge {
  private readonly issuer: SessionIssuer;

  constructor(private readonly deps: IdentityDependencies) {
    this.issuer = new SessionIssuer(deps);
  }

  /** TOTP path: challenge token + authenticator code → session. */
  async withTotp(input: {
    readonly challengeToken: string;
    readonly code: string;
    readonly client: ClientContext;
  }): Promise<
    Result<{ readonly kind: 'session'; readonly session: IssuedSession }, MfaChallengeError>
  > {
    const deps = this.deps;
    const opened = await this.openChallenge(input.challengeToken);
    if (!opened.ok) return opened;
    const { account } = opened.value;

    const enrolment = await deps.mfa.getEnrolment(account.id);
    if (!isMfaActive(enrolment)) return Result.err({ kind: 'invalid_challenge' });
    const secret = await deps.mfaCipher.decrypt({
      ciphertext: enrolment.secretCiphertext,
      keyVersion: enrolment.keyVersion,
    });
    if (!(await deps.totp.verify(input.code, secret, deps.clock.now()))) {
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'mfa_challenge_failed',
        ipDigest: input.client.ipDigest,
        metadata: { phase: 'challenge' },
      });
      return Result.err({ kind: 'invalid_code' });
    }
    return Result.ok(await this.completeLogin(account.id, input.client, 'totp'));
  }

  /** Recovery path: challenge token + one-time recovery code → session. */
  async withRecoveryCode(input: {
    readonly challengeToken: string;
    readonly recoveryCode: string;
    readonly client: ClientContext;
  }): Promise<
    Result<{ readonly kind: 'session'; readonly session: IssuedSession }, MfaChallengeError>
  > {
    const deps = this.deps;
    const opened = await this.openChallenge(input.challengeToken);
    if (!opened.ok) return opened;
    const { account } = opened.value;

    // Recovery attempt ledger (AUTHN-04): 5/15m per account, derived, non-resetting.
    const since = new Date(deps.clock.now().getTime() - deps.policy.recoveryLockWindowMs);
    const failures = await deps.securityEvents.countSince({
      accountId: account.id,
      eventTypes: ['recovery_code_failed'],
      since,
    });
    if (failures >= deps.policy.recoveryLockThreshold) {
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'recovery_locked',
        ipDigest: input.client.ipDigest,
      });
      return Result.err({ kind: 'invalid_code' });
    }

    const normalized = input.recoveryCode.trim().toUpperCase();
    const consumed = await deps.mfa.consumeRecoveryCode(
      account.id,
      deps.digester.recoveryCodeDigest(normalized),
      deps.clock.now(),
    );
    if (!consumed) {
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'recovery_code_failed',
        ipDigest: input.client.ipDigest,
      });
      return Result.err({ kind: 'invalid_code' });
    }
    const remaining = await deps.mfa.countUnusedRecoveryCodes(account.id);
    await recordSecurity(deps, {
      accountId: account.id,
      eventType: 'recovery_code_used',
      ipDigest: input.client.ipDigest,
      metadata: { remaining },
    });
    return Result.ok(await this.completeLogin(account.id, input.client, 'recovery_code'));
  }

  private async openChallenge(challengeToken: string) {
    const deps = this.deps;
    const claims = await deps.tokenSigner.verifyChallengeToken(challengeToken, deps.clock.now());
    if (!claims.ok) {
      return Result.err<MfaChallengeError>({ kind: 'invalid_challenge' });
    }
    const accountId = claims.value.accountId;

    // Every challenge presentation spends from the MFA budget (fail-closed).
    await deps.rateLimits.assertWithinLimit(
      RATE_LIMIT_POLICIES.mfaVerify,
      deps.rateLimitKeys.idKey(accountId),
      deps.clock.now(),
    );

    const account = await deps.accounts.findById(accountId);
    if (account === null || account.status !== 'active') {
      return Result.err<MfaChallengeError>({ kind: 'invalid_challenge' });
    }
    return Result.ok({ account });
  }

  private async completeLogin(
    accountId: UserId,
    client: ClientContext,
    method: 'totp' | 'recovery_code',
  ) {
    const deps = this.deps;
    const account = await deps.accounts.findById(accountId);
    if (account === null) {
      // openChallenge just loaded it; disappearance mid-flight is a defect.
      throw new Error('account vanished between challenge verification and session issue');
    }
    const session = await this.issuer.issue(account, client);
    await recordSecurity(deps, {
      accountId,
      eventType: 'mfa_completed',
      ipDigest: client.ipDigest,
      metadata: { method, sessionId: session.sessionId },
    });
    await recordSecurity(deps, {
      accountId,
      eventType: 'login_succeeded',
      ipDigest: client.ipDigest,
      metadata: { sessionId: session.sessionId, mfa: true },
    });
    await auditOrFail(deps, {
      action: 'identity.login.succeeded',
      accountId,
      resourceType: 'identity_session',
      resourceId: session.sessionId,
      outcome: 'SUCCESS',
      metadata: { mfa: true },
    });
    return { kind: 'session' as const, session };
  }
}

// --- disable ---------------------------------------------------------------

export type DisableMfaError = { readonly kind: 'not_enrolled' } | { readonly kind: 'invalid_code' };

export class DisableMfa {
  constructor(private readonly deps: IdentityDependencies) {}

  /** Requires proof of possession: a current TOTP code or an unused recovery code. */
  async execute(input: {
    readonly accountId: UserId;
    readonly code: string;
    readonly client: ClientContext;
  }): Promise<Result<{ readonly kind: 'disabled' }, DisableMfaError>> {
    const deps = this.deps;
    const enrolment = await deps.mfa.getEnrolment(input.accountId);
    if (!isMfaActive(enrolment)) return Result.err({ kind: 'not_enrolled' });

    await deps.rateLimits.assertWithinLimit(
      RATE_LIMIT_POLICIES.mfaVerify,
      deps.rateLimitKeys.idKey(input.accountId),
      deps.clock.now(),
    );

    const secret = await deps.mfaCipher.decrypt({
      ciphertext: enrolment.secretCiphertext,
      keyVersion: enrolment.keyVersion,
    });
    let proven = await deps.totp.verify(input.code, secret, deps.clock.now());
    if (!proven) {
      proven = await deps.mfa.consumeRecoveryCode(
        input.accountId,
        deps.digester.recoveryCodeDigest(input.code.trim().toUpperCase()),
        deps.clock.now(),
      );
    }
    if (!proven) {
      await recordSecurity(deps, {
        accountId: input.accountId,
        eventType: 'mfa_challenge_failed',
        ipDigest: input.client.ipDigest,
        metadata: { phase: 'disable' },
      });
      return Result.err({ kind: 'invalid_code' });
    }

    await deps.mfa.disableEnrolment(input.accountId, deps.clock.now());
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'mfa_disabled',
      ipDigest: input.client.ipDigest,
    });
    await auditOrFail(deps, {
      action: 'identity.mfa.disabled',
      accountId: input.accountId,
      resourceType: 'identity_account',
      resourceId: input.accountId,
      outcome: 'SUCCESS',
    });
    const account = await deps.accounts.findById(input.accountId);
    if (account !== null) {
      await deps.notifications.sendSecurityNotice({ to: account.email, kind: 'mfa_disabled' });
    }
    return Result.ok({ kind: 'disabled' });
  }
}
