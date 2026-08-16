/**
 * Persistence port for subject policy selections — SUBJECT RECORDS under
 * RLS. Every method takes the acting principal, and the implementation runs
 * each statement inside a principal-context transaction (transaction-local
 * app.tenant_id / app.user_id GUCs, bound from the caller's own record —
 * never from client input). A missing context returns nothing: fail closed.
 *
 * There is no update-in-place and no delete: `recordSelection` supersedes
 * the prior ACTIVE selection for (user, tenant, capability) and inserts the
 * NEW row atomically; `withdraw` performs the single lawful
 * ACTIVE -> WITHDRAWN transition on a preserved row.
 *
 * The port stores capability ids as strings — validity against the
 * production registry is the recording use case's job, before anything
 * reaches this port.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { SubjectPolicySelection } from '../../domain/selection.js';

/** The authenticated subject the selection rows belong to. */
export interface SubjectPolicyPrincipal {
  readonly userId: UserId;
  readonly tenantId: TenantId;
}

export interface SubjectPolicySelectionRepository {
  /**
   * Atomically: mark the principal's prior ACTIVE selections for the same
   * capability SUPERSEDED, then insert `selection` as the new ACTIVE row.
   * Returns the superseded ids. Old rows keep their pinned versions —
   * supersession never rewrites history.
   */
  recordSelection(
    principal: SubjectPolicyPrincipal,
    selection: SubjectPolicySelection,
  ): Promise<{ readonly supersededIds: ReadonlyArray<string> }>;

  findById(principal: SubjectPolicyPrincipal, id: string): Promise<SubjectPolicySelection | null>;

  /**
   * The principal's selection history for one capability (own rows only, by
   * RLS), ordered by effectiveFrom then insertion — the input
   * `resolveSelectionAt` replays temporal questions over.
   */
  listSelections(
    principal: SubjectPolicyPrincipal,
    capabilityId: string,
  ): Promise<ReadonlyArray<SubjectPolicySelection>>;

  /** ACTIVE -> WITHDRAWN, setting withdrawn_at. The row is preserved. */
  withdraw(principal: SubjectPolicyPrincipal, id: string, at: Date): Promise<void>;
}
