/**
 * The ONE derivation of "which jurisdiction governs this principal".
 *
 * THE RULE: the SUBJECT'S OWN assignment governs, with no fallback. A
 * principal carrying no user jurisdiction assignment has no governing
 * jurisdiction and is denied — `NONE` is a denial, never an invitation to
 * substitute the tenant's.
 *
 * Why the subject's and not the tenant's: a PolicyPack decides how a PERSON
 * is treated — consent basis, retention, disclosure, identity requirements.
 * The tenant's operating jurisdiction is a different axis, and it already has
 * its own enforcement path through the operating-entity and licence gates.
 * Falling back from the subject's jurisdiction to the tenant's would let a
 * principal with no assignment inherit whatever the tenant's pack permits —
 * a widening, in a design whose whole point is that nothing widens.
 *
 * Every consumer at this composition root reads this function, so the
 * capability ceiling, the reported jurisdiction, the reported pack, and the
 * provenance pinned into a consent grant cannot disagree. The independent
 * review found them derived from two different assignment tables; this is the
 * fix, and the rule is stated in docs/architecture/jurisdiction-policy.md.
 */

import type { Clock, TenantId, UserId } from '@karar/shared-kernel';
import { effectiveJurisdictionState } from '@karar/jurisdiction';
import type { PrismaUserJurisdictionAssignmentRepository } from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-assignment-repositories.js';

export interface GoverningJurisdiction {
  readonly kind: 'NONE' | 'UNVERIFIED' | 'VERIFIED';
  /** The jurisdiction code, present unless the kind is NONE. */
  readonly code: string | null;
}

export interface JurisdictionSubject {
  readonly userId: string;
  readonly tenantId: string | null;
}

/**
 * Resolves the governing jurisdiction for a principal. The read is itself
 * tenant+user RLS-scoped, so an unbound principal cannot be resolved at all —
 * that is reported as NONE rather than as an error, because "no governing
 * jurisdiction" is exactly the fail-closed answer every consumer expects.
 */
export async function governingJurisdictionFor(
  assignments: PrismaUserJurisdictionAssignmentRepository,
  clock: Clock,
  subject: JurisdictionSubject,
): Promise<GoverningJurisdiction> {
  if (subject.tenantId === null) {
    return { kind: 'NONE', code: null };
  }
  const rows = await assignments.listForPrincipal({
    tenantId: subject.tenantId as TenantId,
    userId: subject.userId as UserId,
  });
  const state = effectiveJurisdictionState(rows, clock.now());
  return state.kind === 'NONE'
    ? { kind: 'NONE', code: null }
    : { kind: state.kind, code: String(state.assignment.jurisdictionCode) };
}
