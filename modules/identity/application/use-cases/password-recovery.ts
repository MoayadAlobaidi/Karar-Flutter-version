/**
 * Password recovery: ForgotPassword issues a one-time reset token (generic
 * response ALWAYS — the flow admits no account-existence oracle), and
 * ResetPassword consumes it.
 *
 * Documented session policy (access-control.md §7): a completed reset
 * revokes EVERY session and family and bumps the token version — a reset is
 * what a user does when they believe the credential is compromised, so
 * nothing issued under it survives. ChangePassword (authenticated, requires
 * the current password) revokes every OTHER session and keeps the one that
 * proved the current password.
 */

import { Result, type UserId } from '@karar/shared-kernel';

import { normalizeEmail } from '../../domain/email-address.js';
import type { SessionId } from '../../domain/session.js';
import { RATE_LIMIT_POLICIES } from '@karar/platform/dist/ratelimit/index.js';
import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';

export class ForgotPassword {
  constructor(private readonly deps: IdentityDependencies) {}

  /** Always 'accepted' — existing, unknown, cooling-down, and disabled alike. */
  async execute(input: {
    readonly email: string;
    readonly client: ClientContext;
  }): Promise<{ readonly kind: 'accepted' }> {
    const deps = this.deps;
    const email = normalizeEmail(input.email);

    await deps.rateLimits.assertWithinLimit(
      RATE_LIMIT_POLICIES.resetSend,
      deps.rateLimitKeys.emailKey(email),
      deps.clock.now(),
    );

    const account = await deps.accounts.findByEmail(email);
    if (account === null || account.status !== 'active') {
      return { kind: 'accepted' };
    }

    const now = deps.clock.now();
    const latest = await deps.resets.latestCreatedAt(account.id);
    if (latest !== null && now.getTime() - latest.getTime() < deps.policy.resetRequestCooldownMs) {
      // Per-account cooldown: same response, no new token.
      return { kind: 'accepted' };
    }

    const token = deps.secretSource.resetToken();
    const expiresAt = new Date(now.getTime() + deps.policy.resetTokenTtlMs);
    await deps.resets.create({
      id: deps.secretSource.id(),
      accountId: account.id,
      codeHash: deps.digester.resetTokenDigest(token),
      expiresAt,
      attempts: 0,
      maxAttempts: deps.policy.resetMaxAttempts,
      consumedAt: null,
      createdAt: now,
      requestedIpDigest: input.client.ipDigest,
    });
    await deps.notifications.sendPasswordReset({ to: account.email, token, expiresAt });
    await recordSecurity(deps, {
      accountId: account.id,
      eventType: 'password_reset_requested',
      ipDigest: input.client.ipDigest,
    });
    return { kind: 'accepted' };
  }
}

export type ResetPasswordError =
  | { readonly kind: 'invalid_token' }
  | { readonly kind: 'invalid_password'; readonly minLength: number; readonly maxLength: number };

export class ResetPassword {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(input: {
    readonly token: string;
    readonly newPassword: string;
    readonly client: ClientContext;
  }): Promise<Result<{ readonly kind: 'reset' }, ResetPasswordError>> {
    const deps = this.deps;
    const invalid = Result.err<ResetPasswordError>({ kind: 'invalid_token' });

    const { passwordMinLength, passwordMaxLength } = deps.policy;
    if (
      input.newPassword.length < passwordMinLength ||
      input.newPassword.length > passwordMaxLength
    ) {
      return Result.err({
        kind: 'invalid_password',
        minLength: passwordMinLength,
        maxLength: passwordMaxLength,
      });
    }

    const request = await deps.resets.findByCodeHash(deps.digester.resetTokenDigest(input.token));
    if (request === null) {
      await recordSecurity(deps, {
        accountId: null,
        eventType: 'password_reset_failed',
        ipDigest: input.client.ipDigest,
        metadata: { reason: 'unknown_token' },
      });
      return invalid;
    }

    const now = deps.clock.now();
    const dead =
      request.consumedAt !== null ||
      request.expiresAt.getTime() <= now.getTime() ||
      request.attempts >= request.maxAttempts;
    if (dead) {
      await deps.resets.recordFailedAttempt(request.id);
      await recordSecurity(deps, {
        accountId: request.accountId,
        eventType: 'password_reset_failed',
        ipDigest: input.client.ipDigest,
        metadata: { reason: 'dead_token' },
      });
      return invalid;
    }

    const credential = await deps.passwordHasher.hash(input.newPassword);
    await deps.resets.consume(request.id, request.accountId, now);
    await deps.accounts.replacePassword({
      accountId: request.accountId,
      passwordHash: credential.passwordHash,
      paramsVersion: credential.paramsVersion,
      now,
    });
    // Reset policy: EVERYTHING goes — all sessions, all families.
    const revokedCount = await deps.sessions.revokeAllSessions({
      accountId: request.accountId,
      reason: 'password_reset',
      now,
    });
    await recordSecurity(deps, {
      accountId: request.accountId,
      eventType: 'password_reset_completed',
      ipDigest: input.client.ipDigest,
      metadata: { revokedCount },
    });
    await auditOrFail(deps, {
      action: 'identity.password.reset',
      accountId: request.accountId,
      resourceType: 'identity_account',
      resourceId: request.accountId,
      outcome: 'SUCCESS',
      metadata: { revokedCount },
    });
    const owner = await deps.accounts.findById(request.accountId);
    if (owner !== null) {
      await deps.notifications.sendSecurityNotice({
        to: owner.email,
        kind: 'password_reset_completed',
      });
    }
    return Result.ok({ kind: 'reset' });
  }
}

export type ChangePasswordError =
  | { readonly kind: 'invalid_current_password' }
  | { readonly kind: 'invalid_password'; readonly minLength: number; readonly maxLength: number };

export class ChangePassword {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(input: {
    readonly accountId: UserId;
    readonly currentSessionId: SessionId;
    readonly currentPassword: string;
    readonly newPassword: string;
    readonly client: ClientContext;
  }): Promise<Result<{ readonly kind: 'changed' }, ChangePasswordError>> {
    const deps = this.deps;

    const { passwordMinLength, passwordMaxLength } = deps.policy;
    if (
      input.newPassword.length < passwordMinLength ||
      input.newPassword.length > passwordMaxLength
    ) {
      return Result.err({
        kind: 'invalid_password',
        minLength: passwordMinLength,
        maxLength: passwordMaxLength,
      });
    }

    const credential = await deps.accounts.getCredential(input.accountId);
    if (credential === null) return Result.err({ kind: 'invalid_current_password' });
    const verified = await deps.passwordHasher.verify(
      credential.passwordHash,
      input.currentPassword,
    );
    if (!verified) {
      await recordSecurity(deps, {
        accountId: input.accountId,
        eventType: 'login_failed',
        ipDigest: input.client.ipDigest,
        metadata: { reason: 'change_password_wrong_current' },
      });
      return Result.err({ kind: 'invalid_current_password' });
    }

    const now = deps.clock.now();
    const next = await deps.passwordHasher.hash(input.newPassword);
    await deps.accounts.replacePassword({
      accountId: input.accountId,
      passwordHash: next.passwordHash,
      paramsVersion: next.paramsVersion,
      now,
    });
    // Change policy: every OTHER session goes; the proving session stays.
    const revokedCount = await deps.sessions.revokeAllSessions({
      accountId: input.accountId,
      reason: 'password_changed',
      now,
      exceptSessionId: input.currentSessionId,
    });
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'password_changed',
      ipDigest: input.client.ipDigest,
      metadata: { revokedCount },
    });
    await auditOrFail(deps, {
      action: 'identity.password.changed',
      accountId: input.accountId,
      resourceType: 'identity_account',
      resourceId: input.accountId,
      outcome: 'SUCCESS',
      metadata: { revokedCount },
    });
    const owner = await deps.accounts.findById(input.accountId);
    if (owner !== null) {
      await deps.notifications.sendSecurityNotice({ to: owner.email, kind: 'password_changed' });
    }
    return Result.ok({ kind: 'changed' });
  }
}
