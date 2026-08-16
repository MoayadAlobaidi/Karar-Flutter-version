/**
 * Persistence port for consent grants — SUBJECT RECORDS under RLS. Every
 * method takes the acting principal, and the implementation runs each
 * statement inside a principal-context transaction (transaction-local
 * app.tenant_id / app.user_id GUCs, bound from the caller's own record —
 * never from client input). A missing context returns nothing: fail closed.
 *
 * There is no update-in-place and no delete: `recordAcceptance` supersedes
 * prior ACTIVE grants for the triple and inserts the NEW row atomically;
 * `withdraw` performs the single lawful ACTIVE -> WITHDRAWN transition.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';

import type { ConsentGrant } from '../../domain/consent-grant.js';
import type { JurisdictionRef, OperatingEntityRef, PurposeRef } from '../../domain/refs.js';

/** The authenticated subject the grant rows belong to. */
export interface ConsentPrincipal {
  readonly userId: UserId;
  readonly tenantId: TenantId;
}

export interface ConsentGrantRepository {
  /**
   * Atomically: mark the principal's prior ACTIVE grants for the same
   * (entity, purpose, jurisdiction) triple SUPERSEDED, then insert `grant`
   * as the new ACTIVE row. Returns the superseded ids.
   */
  recordAcceptance(
    principal: ConsentPrincipal,
    grant: ConsentGrant,
  ): Promise<{ readonly supersededIds: ReadonlyArray<string> }>;

  findById(principal: ConsentPrincipal, id: string): Promise<ConsentGrant | null>;

  /**
   * The resolution row: latest non-SUPERSEDED grant for the triple
   * (ACTIVE if one exists, else the latest WITHDRAWN), or null.
   */
  latestResolutionGrant(
    principal: ConsentPrincipal,
    entityId: OperatingEntityRef,
    purposeRef: PurposeRef,
    jurisdictionRef: JurisdictionRef,
  ): Promise<ConsentGrant | null>;

  /** The principal's full grant history (own rows only, by RLS). */
  listGrants(principal: ConsentPrincipal): Promise<ReadonlyArray<ConsentGrant>>;

  /** ACTIVE -> WITHDRAWN, setting withdrawn_at. The row is preserved. */
  withdraw(principal: ConsentPrincipal, id: string, at: Date): Promise<void>;
}
