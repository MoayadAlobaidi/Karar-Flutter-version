/**
 * Where the principal comes from — and why it is never a parameter.
 *
 * **No use-case input in this module carries a `userId` or a `tenantId`.**
 * The acting principal is read from ambient request context through this
 * port, which the composition root binds to the authenticated session.
 *
 * This is a deliberate design constraint, not a style preference. A
 * `userId` parameter on a use case is an affordance: some controller, some
 * job, some admin tool eventually passes a value that did not come from the
 * caller's own session, and the whole isolation argument collapses into "we
 * were careful". MODULE.md states the product rule directly — *no `?userId=`
 * parameter is accepted anywhere, and no staff endpoint returns one
 * customer's transactions* — and the way to hold that rule is to make the
 * parameter not exist. A reviewer can then verify it by reading the input
 * types, not by auditing every call site.
 *
 * The port is a plain reader. Resolution — session cookie, bearer token,
 * membership record — belongs to identity and tenancy, and this module's only
 * requirement is that whatever answers here came from the caller's own record
 * and never from client input (tenancy.md §6).
 *
 * `current()` returning `null` is fail-closed by construction: every use case
 * turns it into a typed `PRINCIPAL_CONTEXT_MISSING` refusal before any
 * repository is touched.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

/** The authenticated subject whose rows a call may touch. */
export interface TransactionsPrincipal {
  readonly tenantId: TenantId;
  readonly userId: UserId;
}

export interface PrincipalContextPort {
  /** The bound principal, or `null` when the call has no principal context. */
  current(): TransactionsPrincipal | null;
}
