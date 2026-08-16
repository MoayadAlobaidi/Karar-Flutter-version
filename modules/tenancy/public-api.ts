/**
 * The tenancy module's only legal import surface (architecture test 3).
 *
 * Exported: domain read shapes and rules, application ports (including the
 * PolicyService port the authorization module implements), the use cases,
 * the NestJS API module, and the infrastructure implementations the
 * composition root needs to wire them. The permissive/deny policy doubles
 * are exported FOR TESTS ONLY and say so.
 */

// domain — read shapes and rules
export {
  MEMBERSHIP_STATES,
  TENANT_STATUSES,
  TENANT_TYPES,
  evaluateRedeemability,
  isValidInvitationEmail,
  isValidRoleHint,
  normalizeInvitationEmail,
  type MembershipState,
  type RedemptionDenialReason,
  type Tenant,
  type TenantInvitation,
  type TenantMembership,
  type TenantStatus,
  type TenantType,
} from './domain/tenancy.js';

// application — principals, errors, ports, use cases
export {
  requireAuthenticated,
  requirePrincipal,
  requireRedeemer,
  requireSessionActor,
  type AuthenticatedActor,
  type MissingPrincipalContext,
  type PrincipalActor,
  type RedeemerActor,
} from './application/principal.js';
export type {
  AlreadyMember,
  BindingFailed,
  CreateInvitationError,
  FirstPartyTenantUnavailable,
  GetOwnTenantError,
  GrantFirstPartyMembershipError,
  InvalidInvitationInput,
  InvitationNotFound,
  InvitationNotRedeemable,
  ListMembersError,
  ListOwnMembershipsError,
  MembershipNotFound,
  MembershipRevokedConcurrently,
  NotAuthorized,
  RedeemInvitationError,
  ResolveTenantContextError,
  RevokeInvitationError,
  StoreFailure,
  SwitchTenantError,
  TenantNotFound,
} from './application/errors.js';
export {
  TENANCY_PERMISSIONS,
  type PolicyActor,
  type PolicyDecision,
  type PolicyService,
  type TenancyPermission,
} from './application/ports/policy-service.js';
export type {
  MemberTenantRepository,
  TenantRepository,
} from './application/ports/tenant-repository.js';
export type {
  MembershipRepository,
  OwnMembershipRepository,
} from './application/ports/membership-repository.js';
export type {
  BindSessionTenantPort,
  BindingClientContext,
  RebindSessionTenantPort,
  ReboundSessionView,
  RevokeSessionPort,
  SessionBindingDenial,
} from './application/ports/session-binding.js';
export {
  RedemptionPrivilegeViolation,
  type CreateInvitationRecord,
  type InvitationRepository,
  type RedemptionOutcome,
  type RedemptionPrivilegeEvidence,
} from './application/ports/invitation-repository.js';
export type {
  InvitationTokenSource,
  IssuedInvitationToken,
} from './application/ports/invitation-token-source.js';
export type { RedeemerEmailSource } from './application/ports/redeemer-email-source.js';
export type {
  AuditTrail,
  AuditTrailEntry,
  AuditTrailFailure,
} from './application/ports/audit-trail.js';
export {
  DenyAllForTestsPolicyService,
  PermissiveForTestsPolicyService,
} from './application/testing/permissive-policy-service.js';
export { GetOwnTenant, type OwnTenantView } from './application/use-cases/get-own-tenant.js';
export { ListMembers } from './application/use-cases/list-members.js';
export {
  CreateInvitation,
  type CreateInvitationInput,
  type InvitationCreated,
} from './application/use-cases/create-invitation.js';
export {
  RevokeInvitation,
  type InvitationRevoked,
} from './application/use-cases/revoke-invitation.js';
export {
  RedeemInvitation,
  type InvitationRedeemed,
  type RedeemInvitationInput,
} from './application/use-cases/redeem-invitation.js';
export {
  ListOwnMemberships,
  membershipActiveAt,
} from './application/use-cases/list-own-memberships.js';
export {
  ResolveTenantContext,
  type TenantChoice,
  type TenantContextResolution,
} from './application/use-cases/resolve-tenant-context.js';
export {
  SwitchTenant,
  type SwitchTenantInput,
  type TenantSwitched,
} from './application/use-cases/switch-tenant.js';
export {
  FIRST_PARTY_MEMBER_ROLE_HINT,
  GrantFirstPartyMembership,
  type FirstPartyMembershipGranted,
} from './application/use-cases/grant-first-party-membership.js';

// infrastructure — implementations for the composition root
export { PrismaTenantRepository } from './infrastructure/persistence/prisma-tenant-repository.js';
export { PrismaMembershipRepository } from './infrastructure/persistence/prisma-membership-repository.js';
export { PrismaInvitationRepository } from './infrastructure/persistence/prisma-invitation-repository.js';
export { TenancyStoreError } from './infrastructure/persistence/row-mappers.js';
export { Sha256InvitationTokenSource } from './infrastructure/providers/sha256-invitation-token-source.js';
export { RecordAuditEventAuditTrail } from './infrastructure/audit/record-audit-event-audit-trail.js';

// presentation — the NestJS surface
export {
  TENANCY_PRINCIPAL_SOURCE,
  type AuthenticatedPrincipal,
  type AuthenticatedRedeemer,
  type TenancyPrincipalSource,
} from './presentation/http/principal-source.js';
export {
  TENANCY_USE_CASES,
  TenancyController,
  type TenancyUseCases,
} from './presentation/http/tenancy.controller.js';
export {
  TenancyApiModule,
  type TenancyApiModuleOptions,
} from './presentation/tenancy-api.module.js';
