/**
 * Jurisdiction assignments — which legal regime governs a user or a tenant,
 * as effective-dated history rows (migrations 0072/0073).
 *
 * Source and verification are SEPARATE axes: where an assignment came from
 * never implies it is verified. A user-selected country NEVER automatically
 * becomes a verified jurisdiction — USER_DECLARED is structurally UNVERIFIED
 * (CHECK-bound in the schema, re-validated here), and verification arrives
 * only as a NEW row with source PROVIDER_VERIFIED. Capabilities that require
 * a verified jurisdiction fail closed on anything but the VERIFIED state
 * below, which is why the effective state is a three-arm union rather than a
 * nullable row: NONE and UNVERIFIED are first-class denials.
 *
 * Rows are forward-binding history: the row pins what was assigned and when
 * (its jurisdiction and effective window never change after creation — only
 * effective_to is ever set, once). Downstream records with legal consequence
 * pin their OWN jurisdiction at creation; these rows are the history that
 * explains those pins.
 */

import type { TenantId, UserId } from '@karar/shared-kernel';
import type { JurisdictionId } from '@karar/jurisdiction-policy';

export const ASSIGNMENT_SOURCES = [
  'USER_DECLARED',
  'PROVIDER_VERIFIED',
  'OPERATOR_ASSIGNED',
  'CONTRACT_DERIVED',
] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];

export const VERIFICATION_STATUSES = ['UNVERIFIED', 'VERIFIED'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export interface UserJurisdictionAssignment {
  readonly id: string;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly jurisdictionCode: JurisdictionId;
  readonly source: AssignmentSource;
  readonly verificationStatus: VerificationStatus;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly reason: string;
  readonly assignedBy: string;
  readonly createdAt: Date;
}

export interface TenantJurisdictionAssignment {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly jurisdictionCode: JurisdictionId;
  readonly source: AssignmentSource;
  readonly verificationStatus: VerificationStatus;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly reason: string;
  readonly assignedBy: string;
  readonly createdAt: Date;
}

/**
 * The (source, verification) pairs an assignment may legally carry — the
 * same rule the schema CHECKs enforce, validated before any insert so the
 * caller gets a typed outcome instead of a constraint violation.
 */
export function verificationPermittedForSource(
  source: AssignmentSource,
  verificationStatus: VerificationStatus,
): boolean {
  if (source === 'USER_DECLARED') return verificationStatus === 'UNVERIFIED';
  if (source === 'PROVIDER_VERIFIED') return verificationStatus === 'VERIFIED';
  return true;
}

/** Whether the assignment's effective window covers instant `at`. */
export function assignmentActiveAt(
  assignment: { readonly effectiveFrom: Date; readonly effectiveTo: Date | null },
  at: Date,
): boolean {
  return (
    assignment.effectiveFrom.getTime() <= at.getTime() &&
    (assignment.effectiveTo === null || assignment.effectiveTo.getTime() > at.getTime())
  );
}

/**
 * The assignment in effect at `at` among a principal's rows: the one whose
 * window covers the instant, latest effective_from winning if history holds
 * concurrent windows (the assign use case ends the open row first, so
 * overlap is transient at worst).
 */
export function pickEffectiveAssignment<
  T extends { readonly effectiveFrom: Date; readonly effectiveTo: Date | null },
>(assignments: readonly T[], at: Date): T | null {
  const covering = assignments.filter((assignment) => assignmentActiveAt(assignment, at));
  if (covering.length === 0) return null;
  return covering.reduce((latest, candidate) =>
    candidate.effectiveFrom.getTime() > latest.effectiveFrom.getTime() ? candidate : latest,
  );
}

/**
 * The typed effective state the capability resolver enforces against.
 * UNVERIFIED is deliberately not a boolean on a row: a capability that
 * requires a verified jurisdiction denies on NONE and on UNVERIFIED alike,
 * and both arms say why.
 */
export type EffectiveJurisdictionState<T> =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'UNVERIFIED'; readonly assignment: T }
  | { readonly kind: 'VERIFIED'; readonly assignment: T };

export function effectiveJurisdictionState<
  T extends {
    readonly effectiveFrom: Date;
    readonly effectiveTo: Date | null;
    readonly verificationStatus: VerificationStatus;
  },
>(assignments: readonly T[], at: Date): EffectiveJurisdictionState<T> {
  const assignment = pickEffectiveAssignment(assignments, at);
  if (assignment === null) return { kind: 'NONE' };
  return assignment.verificationStatus === 'VERIFIED'
    ? { kind: 'VERIFIED', assignment }
    : { kind: 'UNVERIFIED', assignment };
}
