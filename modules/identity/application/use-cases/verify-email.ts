/**
 * VerifyEmail — consume a one-time verification code.
 *
 * One generic failure for everything (unknown address, no active code,
 * wrong code, expired code, attempt cap) — the caller learns "that did not
 * verify", never why. Verifying an already-verified account is an expected,
 * idempotent success. ResendVerification lives here too: same table, same
 * cooldown, same generic response.
 */

import { Result } from '@karar/shared-kernel';

import { normalizeEmail } from '../../domain/email-address.js';
import { RATE_LIMIT_POLICIES } from '@karar/platform/dist/ratelimit/index.js';
import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';
import type { RegisterAccount } from './register-account.js';

export interface VerifyEmailInput {
  readonly email: string;
  readonly code: string;
  readonly client: ClientContext;
}

export type VerifyEmailError = { readonly kind: 'invalid_code' };

export class VerifyEmail {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(
    input: VerifyEmailInput,
  ): Promise<Result<{ readonly kind: 'verified' }, VerifyEmailError>> {
    const deps = this.deps;
    const email = normalizeEmail(input.email);
    const invalid = Result.err<VerifyEmailError>({ kind: 'invalid_code' });

    const account = await deps.accounts.findByEmail(email);
    if (account === null) return invalid;
    if (account.emailVerifiedAt !== null) {
      // Idempotent re-verify: already proven, nothing to consume.
      return Result.ok({ kind: 'verified' });
    }

    const now = deps.clock.now();
    const active = await deps.verifications.latestActive(account.id, now);
    if (active === null) return invalid;
    if (active.attempts >= active.maxAttempts) {
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'verification_failed',
        ipDigest: input.client.ipDigest,
        metadata: { reason: 'attempt_cap' },
      });
      return invalid;
    }

    const presented = deps.digester.verificationCodeDigest(input.code.trim().toUpperCase());
    if (!deps.digester.digestsEqual(presented, active.codeHash)) {
      await deps.verifications.recordFailedAttempt(active.id);
      await recordSecurity(deps, {
        accountId: account.id,
        eventType: 'verification_failed',
        ipDigest: input.client.ipDigest,
        metadata: { reason: 'mismatch' },
      });
      return invalid;
    }

    await deps.verifications.consume(active.id, now);
    await deps.accounts.markEmailVerified(account.id, now);
    await recordSecurity(deps, {
      accountId: account.id,
      eventType: 'email_verified',
      ipDigest: input.client.ipDigest,
    });
    await auditOrFail(deps, {
      action: 'identity.email.verified',
      accountId: account.id,
      resourceType: 'identity_account',
      resourceId: account.id,
      outcome: 'SUCCESS',
    });
    return Result.ok({ kind: 'verified' });
  }
}

export interface ResendVerificationInput {
  readonly email: string;
  readonly client: ClientContext;
}

export class ResendVerification {
  constructor(
    private readonly deps: IdentityDependencies,
    private readonly register: RegisterAccount,
  ) {}

  /** Always 'accepted' — whether the account exists, is verified, or is cooling down. */
  async execute(input: ResendVerificationInput): Promise<{ readonly kind: 'accepted' }> {
    const deps = this.deps;
    const email = normalizeEmail(input.email);

    await deps.rateLimits.assertWithinLimit(
      RATE_LIMIT_POLICIES.verificationSend,
      deps.rateLimitKeys.emailKey(email),
      deps.clock.now(),
    );

    const account = await deps.accounts.findByEmail(email);
    if (account === null || account.emailVerifiedAt !== null || account.status !== 'active') {
      return { kind: 'accepted' };
    }

    const latest = await deps.verifications.latestCreatedAt(account.id);
    const now = deps.clock.now();
    if (
      latest !== null &&
      now.getTime() - latest.getTime() < deps.policy.verificationResendCooldownMs
    ) {
      // Cooling down: same response, no send.
      return { kind: 'accepted' };
    }

    await this.register.issueVerification(account.id, account.email, input.client);
    return { kind: 'accepted' };
  }
}
