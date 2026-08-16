/**
 * Account disable/enable — the administrative kill switch for a principal.
 *
 * Disable revokes EVERYTHING (sessions, families — hence refresh tokens) and
 * bumps the token version, so no artefact issued before the disable works
 * after it (legacy AUTHN-08). Enable restores the ability to LOG IN and
 * nothing else: prior sessions stay revoked — resurrection is the exact bug
 * the requirement exists to prevent, and the integration tests prove the
 * negative.
 *
 * Authorization (which ROLE may call this) is the RBAC workstream's; this
 * use case is the mechanism. The audit row carries the acting principal.
 */

import { Result, type UserId } from '@karar/shared-kernel';

import {
  auditOrFail,
  recordSecurity,
  type ClientContext,
  type IdentityDependencies,
} from '../identity-deps.js';

export type AccountAdministrationError = { readonly kind: 'account_not_found' };

export class DisableAccount {
  constructor(private readonly deps: IdentityDependencies) {}

  async execute(input: {
    readonly accountId: UserId;
    readonly reason: string;
    /** The acting principal (an operator, or the owner), for the audit row. */
    readonly actorAccountId: UserId | null;
    readonly client: ClientContext;
  }): Promise<
    Result<
      { readonly kind: 'disabled'; readonly revokedSessions: number },
      AccountAdministrationError
    >
  > {
    const deps = this.deps;
    const account = await deps.accounts.findById(input.accountId);
    if (account === null) return Result.err({ kind: 'account_not_found' });

    const now = deps.clock.now();
    await deps.accounts.setStatus({
      accountId: input.accountId,
      status: 'disabled',
      reason: input.reason,
      bumpTokenVersion: true,
      now,
    });
    const revokedSessions = await deps.sessions.revokeAllSessions({
      accountId: input.accountId,
      reason: 'account_disabled',
      now,
    });
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'account_disabled',
      ipDigest: input.client.ipDigest,
      metadata: { revokedSessions },
    });
    await auditOrFail(deps, {
      action: 'identity.account.disabled',
      accountId: input.actorAccountId,
      resourceType: 'identity_account',
      resourceId: input.accountId,
      outcome: 'SUCCESS',
      metadata: { reason: input.reason, revokedSessions },
    });
    await deps.notifications.sendSecurityNotice({
      to: account.email,
      kind: 'account_disabled',
    });
    return Result.ok({ kind: 'disabled', revokedSessions });
  }
}

export class EnableAccount {
  constructor(private readonly deps: IdentityDependencies) {}

  /** Re-enables login. Deliberately revives NOTHING that was revoked. */
  async execute(input: {
    readonly accountId: UserId;
    readonly actorAccountId: UserId | null;
    readonly client: ClientContext;
  }): Promise<Result<{ readonly kind: 'enabled' }, AccountAdministrationError>> {
    const deps = this.deps;
    const account = await deps.accounts.findById(input.accountId);
    if (account === null) return Result.err({ kind: 'account_not_found' });

    await deps.accounts.setStatus({
      accountId: input.accountId,
      status: 'active',
      reason: null,
      // A fresh version boundary: tokens minted while disabled (there should
      // be none, but "should" is not a control) do not validate now.
      bumpTokenVersion: true,
      now: deps.clock.now(),
    });
    await recordSecurity(deps, {
      accountId: input.accountId,
      eventType: 'account_enabled',
      ipDigest: input.client.ipDigest,
    });
    await auditOrFail(deps, {
      action: 'identity.account.enabled',
      accountId: input.actorAccountId,
      resourceType: 'identity_account',
      resourceId: input.accountId,
      outcome: 'SUCCESS',
    });
    return Result.ok({ kind: 'enabled' });
  }
}
