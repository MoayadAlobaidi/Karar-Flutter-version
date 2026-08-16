/**
 * The authorization module's only legal import surface (architecture test 3).
 *
 * Exported: the compile-time catalogue, domain read shapes and rules, the
 * canonical PolicyService interface with its REAL implementation
 * (RbacPolicyService), the request-scoped memo wrapper, the Result-shaped
 * facade for the operating-entity/consent port shape, the application-level
 * authorize() helper, the AssignRole/RevokeRole use cases, the HTTP
 * permission guard (both enforcement points — capability-registry.md §6),
 * and the infrastructure implementations the composition root wires.
 */

// domain — the catalogue and its rules
export {
  CatalogueViolationError,
  PERMISSION_CATALOGUE,
  PERMISSION_NAME_GRAMMAR,
  ROLE_CATALOGUE,
  ROLE_PERMISSION_GRANTS,
  isPermissionName,
  isRoleId,
  permissionsGrantedTo,
  roleDefinition,
  roleScopeAdmitsBinding,
  validateCatalogue,
  type PermissionDefinition,
  type PermissionName,
  type RoleDefinition,
  type RoleId,
  type RoleScope,
} from './domain/catalogue.js';
export {
  ASSIGNMENT_STATUSES,
  assignmentActiveAt,
  assignmentAppliesTo,
  type AssignmentStatus,
  type RoleAssignment,
} from './domain/role-assignment.js';

// application — actors, decisions, the real PolicyService, helpers, use cases
export { requirePolicyActor, type InvalidActor, type PolicyActor } from './application/actor.js';
export {
  POLICY_DENIAL_REASONS,
  RbacPolicyService,
  type PolicyDecision,
  type PolicyDenialReason,
  type PolicyService,
} from './application/policy-service.js';
export { RequestScopedPolicyService } from './application/request-scoped-policy-service.js';
export {
  PrincipalRefPolicyService,
  type AuthorizationDenied,
  type PolicyPrincipalRef,
} from './application/principal-ref-policy-service.js';
export { authorize } from './application/authorize.js';
export type {
  AlreadyAssigned,
  AssignRoleError,
  AssignmentNotFound,
  DelegationDenied,
  InvalidAssignmentInput,
  NotAuthorized,
  RevokeRoleError,
  RoleNotFound,
  RoleScopeMismatch,
  StoreFailure,
} from './application/errors.js';
export {
  RoleAssignmentConflictError,
  type RoleAssignmentGrant,
  type RoleAssignmentRepository,
  type RoleAssignmentRevocation,
  type WriteContext,
} from './application/ports/role-assignment-repository.js';
export type {
  AuditTrail,
  AuditTrailEntry,
  AuditTrailFailure,
} from './application/ports/audit-trail.js';
export {
  AssignRole,
  type AssignRoleInput,
  type RoleAssigned,
} from './application/use-cases/assign-role.js';
export {
  RevokeRole,
  type RevokeRoleInput,
  type RoleRevoked,
} from './application/use-cases/revoke-role.js';

// infrastructure — implementations for the composition root
export { PrismaRoleAssignmentRepository } from './infrastructure/persistence/prisma-role-assignment-repository.js';
export { AuthorizationStoreError } from './infrastructure/persistence/row-mappers.js';
export { RecordAuditEventAuditTrail } from './infrastructure/audit/record-audit-event-audit-trail.js';

// presentation — the guard (controller enforcement point) and its wiring
export {
  AUTHORIZATION_POLICY_SERVICE,
  AUTHORIZATION_PRINCIPAL_SOURCE,
  PermissionGuard,
  requirePermission,
  type AuthorizationPrincipalSource,
} from './presentation/http/permission.guard.js';
export {
  AuthorizationModule,
  type AuthorizationModuleOptions,
} from './presentation/authorization-api.module.js';
