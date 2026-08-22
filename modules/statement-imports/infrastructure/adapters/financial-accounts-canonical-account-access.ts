/**
 * `CanonicalAccountAccessPort`, satisfied over `@karar/financial-accounts`'
 * public API.
 *
 * One of the three files in this module that import another module, and it
 * imports only that module's `public-api.ts` — never a path inside it
 * (architecture test 3). The accounts module knows nothing about this one and
 * does not change for any of this.
 *
 * `findOwnById` runs inside the caller's own principal context, so an account
 * that is absent, another user's, another tenant's, or never minted all come
 * back as `null` — and this adapter passes that through unchanged.
 * Distinguishing them would rebuild the existence oracle both modules avoid.
 *
 * **The lifecycle value is mapped, not cast**, and an unmapped one becomes
 * `UNRECOGNIZED` rather than `ACTIVE`. A status the accounts module adds and
 * nobody maps here is a gap, and the fail-closed reading of a gap is that a
 * statement may not be imported into it — not that it may.
 */

import type {
  AccountsPrincipal,
  AccountStatus,
  FinancialAccountId,
  FinancialAccountRepository,
} from '@karar/financial-accounts';

import type {
  CanonicalAccountAccessPort,
  CanonicalAccountSummary,
} from '../../application/ports/canonical-account-access.js';
import type { ImportsPrincipal } from '../../application/principal.js';
import type { CanonicalAccountRef } from '../../domain/refs.js';

/** The accounts module's lifecycle vocabulary, mapped onto this module's. */
function toLifecycleState(status: AccountStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'ARCHIVED':
      return 'ARCHIVED';
    case 'CLOSED':
      return 'CLOSED';
    default:
      return 'UNRECOGNIZED';
  }
}

export class FinancialAccountsCanonicalAccountAdapter implements CanonicalAccountAccessPort {
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async resolveOwnAccount(
    actor: ImportsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<CanonicalAccountSummary | null> {
    // The two principals are structurally identical — both a kernel TenantId
    // plus a kernel UserId — and are still restated field by field rather than
    // cast. A cast would silently keep compiling if either shape gained a
    // field, and the field it would most likely gain is one this module has no
    // business forwarding.
    const principal: AccountsPrincipal = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
      ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
    };
    const account = await this.accounts.findOwnById(
      principal,
      accountRef.accountId as FinancialAccountId,
    );
    if (account === null) return null;
    return {
      accountRef,
      lifecycleState: toLifecycleState(account.status),
      // Reported so a mismatch can be REFUSED, never so an account can be
      // selected by it. See the port: a rule that matched a statement to an
      // account on institution + type + currency is exactly what ADR-0028
      // forbids, and the port cannot express the question.
      currencyCode: account.currency.code,
    };
  }
}
