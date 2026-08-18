/**
 * The jurisdiction module's only legal import surface (architecture test 3).
 *
 * Exported: the domain vocabulary (assignments, the typed effective-
 * jurisdiction state the capability resolver fails closed on, the
 * activation-ledger derivation, reference-record views), the ports this
 * module declares (the RBAC workstream implements PolicyService; the
 * composition root implements the wiring), the use cases, the audit trail,
 * and the error vocabulary.
 *
 * Deliberately absent: the Prisma repositories and the id source
 * (infrastructure is wired by the composition root); any HTTP surface (none
 * exists this phase — MODULE.md "APIs exposed"); and any use case that
 * edits the jurisdiction or country REGISTERS — the registers change by
 * reviewed migration only.
 *
 * Pure policy machinery (packs, validation, EffectivePolicy resolution)
 * is NOT re-exported here: consumers take it from @karar/jurisdiction-policy
 * directly — one source, no drift.
 */

export {
  ASSIGNMENT_SOURCES,
  VERIFICATION_STATUSES,
  assignmentActiveAt,
  effectiveJurisdictionState,
  pickEffectiveAssignment,
  verificationPermittedForSource,
  type AssignmentSource,
  type EffectiveJurisdictionState,
  type TenantJurisdictionAssignment,
  type UserJurisdictionAssignment,
  type VerificationStatus,
} from './domain/assignment.js';
export {
  ACTIVATION_ACTIONS,
  deriveActivePack,
  type ActivationAction,
  type ActivePackState,
  type PackActivationRecord,
} from './domain/pack-activation.js';
export {
  approvalRecorded,
  declarabilityRefusalAt,
  type CountryRecord,
  type DeclarabilityRefusal,
  type JurisdictionRecord,
  type JurisdictionSettingsRecord,
} from './domain/reference.js';

export {
  JURISDICTION_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from './application/ports/policy-service.js';
export type { IdSource } from './application/ports/id-source.js';
export type {
  JurisdictionDirectory,
  JurisdictionSettingsReader,
  PackActivationLedger,
  TenantAssignmentPrincipal,
  TenantJurisdictionAssignmentRepository,
  UserAssignmentPrincipal,
  UserJurisdictionAssignmentRepository,
} from './application/ports/repositories.js';
export {
  InvalidJurisdictionInputError,
  type ActivationDenied,
  type AlreadyActive,
  type AuditAppendFailed,
  type DeclarationNotPermitted,
  type NotActive,
  type NotFound,
  type PackInvalid,
  type StoreFailure,
  type UnknownJurisdiction,
  type VerificationSourceMismatch,
} from './application/errors.js';
export { JurisdictionAuditTrail, type AuditEntry } from './application/audit-trail.js';

export {
  AssignUserJurisdiction,
  EndUserJurisdictionAssignment,
  GetEffectiveUserJurisdiction,
  type AssignUserJurisdictionError,
  type AssignUserJurisdictionInput,
  type EndUserJurisdictionAssignmentError,
  type EndUserJurisdictionAssignmentInput,
  type GetEffectiveUserJurisdictionError,
  type GetEffectiveUserJurisdictionInput,
} from './application/use-cases/user-assignments.js';
export {
  AssignTenantJurisdiction,
  EndTenantJurisdictionAssignment,
  GetEffectiveTenantJurisdiction,
  type AssignTenantJurisdictionError,
  type AssignTenantJurisdictionInput,
  type EndTenantJurisdictionAssignmentError,
  type EndTenantJurisdictionAssignmentInput,
  type GetEffectiveTenantJurisdictionError,
  type GetEffectiveTenantJurisdictionInput,
} from './application/use-cases/tenant-assignments.js';
export {
  ActivatePackVersion,
  GetActivePackVersion,
  RetirePackVersion,
  type ActivatePackVersionError,
  type ActivatePackVersionInput,
  type GetActivePackVersionError,
  type GetActivePackVersionInput,
  type RetirePackVersionError,
  type RetirePackVersionInput,
} from './application/use-cases/pack-activation.js';
export {
  DeclareOwnJurisdiction,
  type DeclareOwnJurisdictionError,
  type DeclareOwnJurisdictionInput,
  type DeclaredJurisdiction,
} from './application/use-cases/self-declaration.js';
export {
  ListDeclarableJurisdictions,
  type DeclarableJurisdiction,
  type ListDeclarableJurisdictionsError,
  type ListDeclarableJurisdictionsInput,
} from './application/use-cases/declarable-jurisdictions.js';

// presentation — the subject-facing routes: the declarable-reference listing
// a client needs to offer a chooser, and the self-declaration write itself.
// Operator assignment, verification, and pack activation stay off the
// consumer API.
export {
  JURISDICTION_PRINCIPAL_SOURCE,
  type JurisdictionPrincipal,
  type JurisdictionPrincipalSource,
} from './presentation/http/principal-source.js';
export {
  JURISDICTION_USE_CASES,
  JurisdictionController,
  type JurisdictionUseCases,
} from './presentation/http/jurisdiction.controller.js';
export {
  JurisdictionApiModule,
  type JurisdictionApiModuleOptions,
} from './presentation/jurisdiction-api.module.js';
