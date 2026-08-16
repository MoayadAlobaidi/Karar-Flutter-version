/**
 * The users module's only legal import surface (architecture test 3).
 *
 * Exported: the domain read shapes, the application ports and use cases, the
 * NestJS API module, and the infrastructure implementations the composition
 * root needs to wire them (apps/ compose modules through this front door;
 * other modules may import types and use cases, never implementations).
 */

// domain — read shapes and field rules
export {
  USER_STATUSES,
  canTransitionUserStatus,
  parseDisplayName,
  parseLocale,
  type ProfileFieldViolation,
  type UserProfile,
  type UserStatus,
  type UserStatusChange,
} from './domain/user-profile.js';

// application — principal, errors, ports, use cases
export { requirePrincipal, type MissingPrincipalContext, type PrincipalActor } from './application/principal.js';
export type {
  GetOwnProfileError,
  InvalidProfileField,
  InvalidStatusTransition,
  NoApprovedFieldChanges,
  ProfileNotFound,
  RequestAccountDisableError,
  StoreFailure,
  UpdateOwnProfileError,
} from './application/errors.js';
export {
  ProfileStoreError,
  type CreateOwnProfileInput,
  type OwnProfileFieldChanges,
  type OwnStatusTransition,
  type StatusTransitionOutcome,
  type UserProfileRepository,
} from './application/ports/user-profile-repository.js';
export type {
  AuditTrail,
  AuditTrailEntry,
  AuditTrailFailure,
} from './application/ports/audit-trail.js';
export { GetOwnProfile } from './application/use-cases/get-own-profile.js';
export {
  UpdateOwnProfile,
  type UpdateOwnProfileInput,
} from './application/use-cases/update-own-profile.js';
export {
  RequestAccountDisable,
  type AccountDisableRequested,
  type RequestAccountDisableInput,
} from './application/use-cases/request-account-disable.js';

// infrastructure — implementations for the composition root
export { PrismaUserProfileRepository } from './infrastructure/persistence/prisma-user-profile-repository.js';
export { RecordAuditEventAuditTrail } from './infrastructure/audit/record-audit-event-audit-trail.js';

// presentation — the NestJS surface
export {
  USERS_PRINCIPAL_SOURCE,
  type AuthenticatedPrincipal,
  type PrincipalSource,
} from './presentation/http/principal-source.js';
export {
  USERS_USE_CASES,
  UsersController,
  type UsersUseCases,
} from './presentation/http/users.controller.js';
export { UsersApiModule, type UsersApiModuleOptions } from './presentation/users-api.module.js';
