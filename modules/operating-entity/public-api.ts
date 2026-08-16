/**
 * The operating-entity module's only legal import surface (architecture
 * test 3).
 *
 * Exported: domain vocabulary and read shapes, the authorization port this
 * module declares (the RBAC workstream implements it centrally), and the use
 * cases — everything a consuming module or the composition root needs to
 * drive the entity register, bindings, and the EntityMigration workflow
 * through the application layer.
 *
 * Deliberately absent: the Prisma repositories and the id source
 * (infrastructure implementations are wired by the composition root, never
 * imported across modules), and every mutation path that would let a caller
 * change a binding without the migration workflow — no such use case exists
 * to export (MODULE.md, permissions deliberately absent).
 */

export {
  OPERATING_ENTITY_STATUSES,
  isPermittedInJurisdiction,
  type EntityJurisdictionPermission,
  type OperatingEntity,
  type OperatingEntityId,
  type OperatingEntityStatus,
} from './domain/operating-entity.js';
export {
  ENTITY_LICENCE_STATUSES,
  licenceStatusRequiresEvidence,
  type EntityLicence,
  type EntityLicenceStatus,
} from './domain/entity-licence.js';
export {
  DATA_PROTECTION_ROLES,
  POLICY_PACK_PIN_STATES,
  roleAssignmentActiveAt,
  type DataProtectionRole,
  type DataProtectionRoleAssignment,
  type PolicyPackPinState,
} from './domain/role-assignment.js';
export {
  ASSIGNMENT_SCOPES,
  assignmentActiveAt,
  type AssignmentScope,
  type OperatingEntityAssignment,
} from './domain/entity-assignment.js';
export {
  ENTITY_MIGRATION_STATUSES,
  ENTITY_MIGRATION_TERMINAL_STATUSES,
  isTerminalMigrationStatus,
  migrationTransitionAllowed,
  type EntityMigration,
  type EntityMigrationStatus,
} from './domain/entity-migration.js';
export { JurisdictionRef, PurposeRef, InvalidReferenceError } from './domain/refs.js';

export {
  ENTITY_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from './application/ports/policy-service.js';
export type { IdSource } from './application/ports/id-source.js';
export type {
  EntityAssignmentRepository,
  EntityLicenceRepository,
  EntityMigrationRepository,
  OperatingEntityRepository,
  RoleAssignmentQuery,
  RoleAssignmentRepository,
} from './application/ports/repositories.js';
export type {
  OperatingEntitySummary,
  OperatingEntitySummaryReader,
} from './application/ports/entity-summary-reader.js';
export {
  InvalidOperatingEntityInputError,
  type AuditAppendFailed,
  type InvalidTransition,
  type NotFound,
  type StoreFailure,
} from './application/errors.js';
export { EntityAuditTrail, type AuditEntry } from './application/audit-trail.js';

export {
  CreateOperatingEntity,
  GetOperatingEntity,
  UpdateOperatingEntityStatus,
  type CreateOperatingEntityError,
  type CreateOperatingEntityInput,
  type GetOperatingEntityError,
  type GetOperatingEntityInput,
  type UpdateOperatingEntityStatusError,
  type UpdateOperatingEntityStatusInput,
} from './application/use-cases/entity-admin.js';
export {
  EndJurisdictionPermission,
  GrantJurisdictionPermission,
  type EndJurisdictionPermissionInput,
  type GrantJurisdictionPermissionInput,
  type JurisdictionPermissionError,
} from './application/use-cases/jurisdiction-permissions.js';
export {
  RecordEntityLicence,
  UpdateEntityLicenceStatus,
  type EvidenceRequired,
  type LicenceRecordError,
  type RecordEntityLicenceInput,
  type UpdateEntityLicenceStatusInput,
} from './application/use-cases/licence-records.js';
export {
  CreateRoleAssignment,
  EndRoleAssignment,
  QueryRoleAssignments,
  type CreateRoleAssignmentInput,
  type EndRoleAssignmentInput,
  type QueryRoleAssignmentsError,
  type QueryRoleAssignmentsInput,
  type RoleAssignmentError,
} from './application/use-cases/role-assignments.js';
export {
  ResolveEffectiveOperatingEntity,
  SetTenantDefaultEntity,
  SetUserContractingEntity,
  type EffectiveOperatingEntity,
  type NoEffectiveEntity,
  type ResolveEffectiveEntityError,
  type ResolveEffectiveOperatingEntityInput,
  type SetAssignmentError,
  type SetTenantDefaultEntityInput,
  type SetUserContractingEntityInput,
} from './application/use-cases/entity-assignments.js';
export {
  GetEffectiveOperatingEntitySummary,
  type GetEffectiveOperatingEntitySummaryError,
  type GetEffectiveOperatingEntitySummaryInput,
} from './application/use-cases/entity-summary.js';
export {
  AdvanceEntityMigration,
  ProposeEntityMigration,
  RecordMigrationReconsentEvaluation,
  type AdvanceEntityMigrationInput,
  type EntityMigrationError,
  type ProposeEntityMigrationInput,
  type RecordMigrationReconsentEvaluationInput,
} from './application/use-cases/entity-migration.js';
