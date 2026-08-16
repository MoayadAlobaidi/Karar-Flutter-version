/**
 * EntityMigration — the ONLY path by which an entity binding moves (ADR-0024
 * §5). Explicit, audited, with a recorded re-consent evaluation. NEVER a
 * silent UPDATE, and never a rewrite of history: records created under
 * Entity A keep their pinned Entity A, because that is what happened.
 *
 * State machine (operating-entity.md §5):
 *
 *   PROPOSED ──▶ RECONSENT_EVALUATED ──▶ AWAITING_ACCEPTANCE ──▶ MIGRATED
 *                        │                        │
 *                        └──▶ MIGRATED            └──▶ BLOCKED
 *                       (no re-consent required)   (declined / lapsed)
 *
 * Terminal rows (MIGRATED, BLOCKED) are immutable history — enforced here as
 * a pure transition rule, and independently in the database by trigger.
 */

import type { OperatingEntityId } from './operating-entity.js';
import type { AssignmentScope } from './entity-assignment.js';

export const ENTITY_MIGRATION_STATUSES = [
  'PROPOSED',
  'RECONSENT_EVALUATED',
  'AWAITING_ACCEPTANCE',
  'MIGRATED',
  'BLOCKED',
] as const;
export type EntityMigrationStatus = (typeof ENTITY_MIGRATION_STATUSES)[number];

export const ENTITY_MIGRATION_TERMINAL_STATUSES = ['MIGRATED', 'BLOCKED'] as const;

const TRANSITIONS: Readonly<Record<EntityMigrationStatus, ReadonlyArray<EntityMigrationStatus>>> = {
  PROPOSED: ['RECONSENT_EVALUATED'],
  RECONSENT_EVALUATED: ['AWAITING_ACCEPTANCE', 'MIGRATED'],
  AWAITING_ACCEPTANCE: ['MIGRATED', 'BLOCKED'],
  MIGRATED: [],
  BLOCKED: [],
};

export function migrationTransitionAllowed(
  from: EntityMigrationStatus,
  to: EntityMigrationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminalMigrationStatus(status: EntityMigrationStatus): boolean {
  return status === 'MIGRATED' || status === 'BLOCKED';
}

export interface EntityMigration {
  readonly id: string;
  readonly scope: AssignmentScope;
  /** Opaque reference to the tenant or user whose binding migrates. */
  readonly subjectRef: string;
  readonly fromEntity: OperatingEntityId;
  readonly toEntity: OperatingEntityId;
  readonly status: EntityMigrationStatus;
  readonly reason: string;
  /** Cross-module reference to the consent module's recorded evaluation. */
  readonly reconsentEvaluationId: string | null;
  readonly proposedBy: string;
  readonly proposedAt: Date;
  readonly completedAt: Date | null;
}
