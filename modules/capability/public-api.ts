/**
 * The capability module's only legal import surface (architecture test 3).
 *
 * Exported: the domain vocabulary (availability states, denial reasons and
 * their client classification, the pure gate engine and client projection),
 * the ports this module declares (the jurisdiction-policy workstream's
 * resolver binds behind PolicyCeilingSource at composition; the RBAC
 * workstream implements PolicyService), the use cases — including the two
 * resolver facades the bootstrap workstream consumes: the FULL internal
 * resolution (every denial reason) and the CLIENT-SAFE resolution (hidden
 * capabilities and hidden reasons already filtered) — and the one shipped
 * provider source (a dependency-free null object every composition needs
 * until a real provider integration exists).
 *
 * Deliberately absent: the Prisma repositories and the id source
 * (infrastructure is wired by the composition root, never imported across
 * modules); any HTTP surface (none exists this phase — the bootstrap
 * endpoint consumes these use cases); and any operator surface beyond the
 * permission-gated use cases (the permissions are declared-but-unseeded:
 * absence denies).
 */

export {
  ALLOWING_STATES,
  AVAILABILITY_STATES,
  isAllowingState,
  isAvailabilityState,
  type AllowingState,
  type AvailabilityState,
  type CapabilityAvailabilityRecord,
} from './domain/availability-state.js';
export {
  CLIENT_SURFACEABLE_REASONS,
  DENIAL_REASONS,
  HIDDEN_DENIAL_REASONS,
  clientReasonFor,
  isDenialReason,
  type ClientDenialReason,
  type DenialReason,
} from './domain/denial-reason.js';
export {
  ENTITLEMENT_STATUSES,
  entitlementSatisfiesAt,
  isEntitlementStatus,
  type EntitlementStatus,
  type TenantCapabilityEntitlement,
} from './domain/entitlement.js';
export {
  GATES,
  resolveCapabilityGates,
  type AvailabilityFacts,
  type CapabilityResolution,
  type CeilingFacts,
  type ClearedCapabilityFacts,
  type ConsentFacts,
  type DescriptorFacts,
  type EntitlementFacts,
  type GateInputs,
  type GateName,
  type LicenceFacts,
  type LicensingFacts,
  type ProcessingBasisFacts,
  type ProviderFacts,
  type ResolutionPins,
  type ResolutionProvenance,
} from './domain/resolution.js';
export {
  toClientView,
  type ClientCapabilityEntry,
  type ClientExposureFacts,
} from './domain/client-view.js';

export {
  CAPABILITY_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from './application/ports/policy-service.js';
export {
  PolicyCeilingUnresolvableError,
  type PolicyCeilingQuery,
  type PolicyCeilingSource,
} from './application/ports/policy-ceiling-source.js';
export type { ConsentGate, ConsentSubject } from './application/ports/consent-gate.js';
export type {
  LicenceDirectory,
  LicensingSubject,
} from './application/ports/licence-directory.js';
export type {
  ProviderAvailabilitySource,
  ProviderConnectionStatus,
} from './application/ports/provider-availability-source.js';
export type { CapabilityAvailabilityRepository } from './application/ports/availability-repository.js';
export type {
  EntitlementPrincipal,
  TenantCapabilityEntitlementRepository,
} from './application/ports/entitlement-repository.js';
export type { IdSource } from './application/ports/id-source.js';

export {
  InvalidCapabilityInputError,
  type AboveCeiling,
  type AlreadyExists,
  type AuditAppendFailed,
  type NotFound,
  type ResolutionFailed,
  type StoreFailure,
  type UnknownCapability,
  type VersionConflict,
} from './application/errors.js';
export { CapabilityAuditTrail, type CapabilityAuditEntry } from './application/audit-trail.js';
export {
  clientExposureFactsFor,
  descriptorFactsFor,
  productionRegistryView,
  registryView,
  type CapabilityRegistryView,
} from './application/registry-view.js';

export {
  ResolveCapabilityAvailability,
  type CapabilityResolutionSet,
  type ResolutionSubject,
  type ResolveCapabilityAvailabilityError,
  type ResolveCapabilityAvailabilityInput,
} from './application/use-cases/resolve-capability-availability.js';
export {
  ResolveClientCapabilityView,
  type ClientCapabilityView,
  type ClientCapabilityViewInput,
} from './application/use-cases/client-capability-view.js';
export {
  SetCapabilityAvailability,
  type SetCapabilityAvailabilityError,
  type SetCapabilityAvailabilityInput,
} from './application/use-cases/manage-availability.js';
export {
  GrantTenantCapabilityEntitlement,
  RevokeTenantCapabilityEntitlement,
  type GrantTenantCapabilityEntitlementError,
  type GrantTenantCapabilityEntitlementInput,
  type RevokeTenantCapabilityEntitlementError,
  type RevokeTenantCapabilityEntitlementInput,
} from './application/use-cases/manage-entitlements.js';

export { NoProvidersConfiguredSource } from './infrastructure/providers/no-providers-configured-source.js';
