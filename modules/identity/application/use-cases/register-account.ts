/**
 * RegisterAccount — create an account and start e-mail verification.
 *
 * Enumeration resistance is the shape of the whole flow: the response for a
 * fresh registration and for an already-taken address is IDENTICAL (the
 * unique violation is caught and converted, never surfaced), the password is
 * hashed on both paths so timing matches, and the only place the difference
 * exists is the security ledger.
 */

import { Result, UserId } from '@karar/shared-kernel';

import { parseEmail } from '../../domain/email-address.js';
import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';
import { RATE_LIMIT_POLICIES } from '@karar/platform/dist/ratelimit/index.js';

export interface RegisterAccountInput {
  readonly email: string;
  readonly password: string;
  readonly client: ClientContext;
}

/** The single, deliberately information-free success shape. */
export interface RegisterAccountAccepted {
  readonly kind: 'accepted';
}

export type RegisterAccountError =
  | { readonly kind: 'invalid_email' }
  | { readonly kind: 'invalid_password'; readonly minLength: number; readonly maxLength: number };

export class RegisterAccount {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(
    input: RegisterAccountInput,
  ): Promise<Result<RegisterAccountAccepted, RegisterAccountError>> {
    const deps = this.deps;
    const emailResult = parseEmail(input.email);
    if (!emailResult.ok) return Result.err({ kind: 'invalid_email' });
    const email = emailResult.value;

    const { passwordMinLength, passwordMaxLength } = deps.policy;
    if (input.password.length < passwordMinLength || input.password.length > passwordMaxLength) {
      return Result.err({
        kind: 'invalid_password',
        minLength: passwordMinLength,
        maxLength: passwordMaxLength,
      });
    }

    // Registration sends a verification e-mail, so it spends from the same
    // budget as resends: 3/h per address digest (fail-closed).
    await deps.rateLimits.assertWithinLimit(
      RATE_LIMIT_POLICIES.verificationSend,
      deps.rateLimitKeys.emailKey(email),
      deps.clock.now(),
    );

    // Hash before the insert: the duplicate path pays the same cost.
    const credential = await deps.passwordHasher.hash(input.password);
    const accountId = UserId.of(deps.secretSource.id());
    const now = deps.clock.now();

    const created = await deps.accounts.createWithCredential({
      id: accountId,
      email,
      passwordHash: credential.passwordHash,
      paramsVersion: credential.paramsVersion,
      now,
    });

    if (created === 'duplicate_email') {
      // Same response as success; the difference exists only in the ledger.
      await recordSecurity(deps, {
        accountId: null,
        eventType: 'registration_duplicate',
        ipDigest: input.client.ipDigest,
      });
      return Result.ok({ kind: 'accepted' });
    }

    await this.issueVerification(accountId, email, input.client);

    await auditOrFail(deps, {
      action: 'identity.account.registered',
      accountId,
      resourceType: 'identity_account',
      resourceId: accountId,
      outcome: 'SUCCESS',
    });

    return Result.ok({ kind: 'accepted' });
  }

  /** Shared with ResendVerification: mint, store hashed, send. */
  async issueVerification(accountId: UserId, email: string, client: ClientContext): Promise<void> {
    const deps = this.deps;
    const now = deps.clock.now();
    const code = deps.secretSource.verificationCode();
    const expiresAt = new Date(now.getTime() + deps.policy.verificationCodeTtlMs);
    await deps.verifications.create({
      id: deps.secretSource.id(),
      accountId,
      codeHash: deps.digester.verificationCodeDigest(code),
      expiresAt,
      attempts: 0,
      maxAttempts: deps.policy.verificationMaxAttempts,
      consumedAt: null,
      createdAt: now,
    });
    await deps.notifications.sendVerificationCode({ to: email, code, expiresAt });
    await recordSecurity(deps, {
      accountId,
      eventType: 'verification_email_sent',
      ipDigest: client.ipDigest,
    });
  }
}
