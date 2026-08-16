/**
 * The bootstrap module's only legal import surface (architecture test 3).
 *
 * Exported: the principal/binding vocabulary, the ports this module declares
 * (the composition root binds tenancy's and identity's use cases plus the
 * jurisdiction/entity/policy/capability resolvers to them — all structural,
 * this module imports no other module), the two use cases, and the NestJS
 * surface. Deliberately absent: any re-export of another module's types and
 * any admin/write surface beyond the tenant-binding endpoint.
 */

// application — principal, binding states, errors
export type { BootstrapPrincipal } from './application/principal.js';
export {
  choiceFor,
  choicesOf,
  stateForChoices,
  type BindingStateView,
} from './application/binding-state.js';
export type {
  BindingConflict,
  ContextUnavailable,
  GetBootstrapError,
  InvalidTenantSelection,
  MembershipRequired,
  MembershipRevokedConcurrently,
  SetTenantBindingError,
  Unauthenticated,
} from './application/errors.js';

// application — ports the composition root binds
export type {
  BindSessionPort,
  BindingClientContext,
  ContextDenial,
  ResolveTenantContextPort,
  RevokeSessionPort,
  SwitchTenantPort,
  SwitchedSessionView,
  TenantChoiceView,
  TenantContextActor,
  TenantResolutionView,
} from './application/ports/tenant-context.js';
export type {
  BootstrapSubject,
  ClientCapabilitiesPort,
  ClientCapabilityRequirementView,
  ClientCapabilityView,
  EnrichmentSubject,
  JurisdictionAssignmentView,
  JurisdictionContextPort,
  JurisdictionStateView,
  OperatingEntityReferencePort,
  OperatingEntityReferenceView,
  PolicyPackStatusPort,
  PolicyPackStatusView,
} from './application/ports/context-enrichment.js';
export type {
  AuditTrail,
  AuditTrailEntry,
  AuditTrailFailure,
} from './application/ports/audit-trail.js';

// application — use cases
export {
  GetBootstrap,
  type BootstrapView,
  type GetBootstrapDependencies,
} from './application/use-cases/get-bootstrap.js';
export {
  SetTenantBinding,
  type SetTenantBindingDependencies,
  type SetTenantBindingResult,
} from './application/use-cases/set-tenant-binding.js';

// presentation — the NestJS surface
export {
  BOOTSTRAP_PRINCIPAL_SOURCE,
  type BootstrapPrincipalSource,
} from './presentation/http/principal-source.js';
export {
  BOOTSTRAP_USE_CASES,
  BootstrapController,
  type BootstrapUseCases,
} from './presentation/http/bootstrap.controller.js';
export {
  BootstrapApiModule,
  type BootstrapApiModuleOptions,
} from './presentation/bootstrap-api.module.js';
