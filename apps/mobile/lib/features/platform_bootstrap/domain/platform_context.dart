// PURE DART ONLY. See lib/README.md — domain purity.
//
// The platform/account context this workstream renders.
//
// It carries identity, tenancy, jurisdiction, operating entity, policy-pack
// version and capability state. It carries no money, no account, no
// transaction, no balance, no score and no synchronisation state, because the
// platform publishes none of those and this client invents nothing.
//
// Every enumeration below has an explicit member for a value this build does
// not recognise. Unrecognised is not a synonym for absent: an unrecognised
// state closes the surface it governs rather than choosing a convenient
// meaning for it.
import 'package:meta/meta.dart';

import 'platform_capability.dart';

/// One tenant the principal may bind the session to.
@immutable
final class TenantMembershipOption {
  const TenantMembershipOption({
    required this.tenantId,
    required this.name,
    required this.roleHint,
  });

  final String tenantId;
  final String name;

  /// Informational. The authoritative role is enforced server-side and is
  /// never read as a permission by this client.
  final String roleHint;

  @override
  bool operator ==(Object other) =>
      other is TenantMembershipOption &&
      other.tenantId == tenantId &&
      other.name == name &&
      other.roleHint == roleHint;

  @override
  int get hashCode => Object.hash(tenantId, name, roleHint);

  @override
  String toString() => 'TenantMembershipOption($tenantId)';
}

/// Whether the session is bound to a tenant, as the platform reported it.
///
/// The binding is never derived from a query parameter, a header, a stored
/// preference or a typed identifier. Only this value, which came from the
/// platform, decides.
@immutable
sealed class TenantContext {
  const TenantContext();
}

/// Bound to exactly one tenant.
final class TenantContextBound extends TenantContext {
  const TenantContextBound(this.tenant);

  final TenantMembershipOption tenant;

  @override
  String toString() => 'TenantContextBound(${tenant.tenantId})';
}

/// No binding, and no membership to bind to.
final class TenantContextUnbound extends TenantContext {
  const TenantContextUnbound();

  @override
  String toString() => 'TenantContextUnbound()';
}

/// Several memberships; the principal must choose one.
final class TenantContextSelectionRequired extends TenantContext {
  const TenantContextSelectionRequired(this.choices);

  final List<TenantMembershipOption> choices;

  @override
  String toString() => 'TenantContextSelectionRequired(${choices.length})';
}

/// The effective-jurisdiction state.
///
/// Clients key on the state, never on the identifier: behaviour differences
/// resolve through policy packs, so no jurisdiction's rules are written here.
enum PlatformJurisdictionState { none, unverified, verified, unrecognised }

/// The jurisdiction as the platform reported it.
@immutable
final class JurisdictionStatus {
  const JurisdictionStatus({required this.state, this.jurisdictionId});

  final PlatformJurisdictionState state;

  /// Display and pack selection only. Null when the state is `none`.
  final String? jurisdictionId;

  /// Whether a governing jurisdiction is in effect at all. A declaration that
  /// has not been verified still governs; verification is a separate claim
  /// this client never makes on the platform's behalf.
  bool get isAssigned =>
      state == PlatformJurisdictionState.unverified ||
      state == PlatformJurisdictionState.verified;

  @override
  bool operator ==(Object other) =>
      other is JurisdictionStatus &&
      other.state == state &&
      other.jurisdictionId == jurisdictionId;

  @override
  int get hashCode => Object.hash(state, jurisdictionId);

  @override
  String toString() => 'JurisdictionStatus(${state.name})';
}

/// The reviewed safe projection of the contracting legal person.
///
/// The register holds more than this. The rest is deliberately absent and must
/// not be added: licence records, registration internals, contracting
/// capacity, controller/processor analysis, data-protection role assignments,
/// entity status and administrative timestamps. None of them may be inferred
/// from what is here either.
@immutable
final class OperatingEntityDetails {
  const OperatingEntityDetails({
    required this.id,
    required this.name,
    this.jurisdictionRef,
    this.contactReference,
  });

  final String id;

  /// The registered legal name. There is deliberately no separate display or
  /// trading name, and none is constructed.
  final String name;

  /// The regime the entity is registered in, as data for display. Never
  /// branched on.
  final String? jurisdictionRef;

  /// A published role mailbox, never a named person.
  final String? contactReference;

  @override
  bool operator ==(Object other) =>
      other is OperatingEntityDetails &&
      other.id == id &&
      other.name == name &&
      other.jurisdictionRef == jurisdictionRef &&
      other.contactReference == contactReference;

  @override
  int get hashCode => Object.hash(id, name, jurisdictionRef, contactReference);

  @override
  String toString() => 'OperatingEntityDetails($id)';
}

/// Which legal person the caller contracted with, as a state.
@immutable
sealed class OperatingEntityContext {
  const OperatingEntityContext();
}

/// The entity is known and carried.
final class OperatingEntityAssigned extends OperatingEntityContext {
  const OperatingEntityAssigned(this.entity);

  final OperatingEntityDetails entity;

  @override
  String toString() => 'OperatingEntityAssigned(${entity.id})';
}

/// No binding exists. Not an error, and not a missing entity: the caller has
/// not yet contracted with one.
final class OperatingEntityUnassigned extends OperatingEntityContext {
  const OperatingEntityUnassigned();

  @override
  String toString() => 'OperatingEntityUnassigned()';
}

/// The read failed. The reference is not known, and is not guessed.
final class OperatingEntityUnavailable extends OperatingEntityContext {
  const OperatingEntityUnavailable();

  @override
  String toString() => 'OperatingEntityUnavailable()';
}

/// A state this build does not recognise. Treated as closed.
final class OperatingEntityUnrecognised extends OperatingEntityContext {
  const OperatingEntityUnrecognised();

  @override
  String toString() => 'OperatingEntityUnrecognised()';
}

/// The governing policy pack, by version and status only.
///
/// Pack CONTENT never reaches the client through this type. `approved` is the
/// prerequisite consent acceptance depends on; an unapproved or absent pack
/// means the platform can pin no provenance to an acceptance, so the client
/// must not offer one.
@immutable
final class PolicyPackStatus {
  const PolicyPackStatus({this.version, this.status});

  static const String activeStatus = 'ACTIVE';

  final String? version;
  final String? status;

  bool get isApproved => status == activeStatus;

  @override
  bool operator ==(Object other) =>
      other is PolicyPackStatus && other.version == version && other.status == status;

  @override
  int get hashCode => Object.hash(version, status);

  @override
  String toString() => 'PolicyPackStatus(${status ?? 'absent'})';
}

/// Everything the authenticated platform surface renders.
@immutable
final class PlatformContext {
  const PlatformContext({
    required this.userId,
    required this.sessionId,
    required this.emailVerified,
    required this.tenant,
    required this.jurisdiction,
    required this.operatingEntity,
    required this.policyPack,
    required this.navigation,
  });

  final String userId;

  /// Opaque and non-secret. Rendered so a person can quote it to support.
  final String sessionId;

  final bool emailVerified;
  final TenantContext tenant;
  final JurisdictionStatus jurisdiction;
  final OperatingEntityContext operatingEntity;
  final PolicyPackStatus policyPack;
  final CapabilityNavigation navigation;

  /// The bound tenant, or null. Reading it is the only way a screen learns
  /// which tenant it is in.
  TenantMembershipOption? get boundTenant => switch (tenant) {
        TenantContextBound(:final tenant) => tenant,
        TenantContextUnbound() => null,
        TenantContextSelectionRequired() => null,
      };

  /// Whether the platform completed capability resolution and reported no
  /// service. An honest empty state, never an outage.
  bool get hasNoAvailableServices => switch (navigation) {
        CapabilityNavigationResolved(:final destinations) => destinations.isEmpty,
        CapabilityNavigationUnresolved() => false,
      };

  /// Whether capability resolution did not complete. Capability-gated surfaces
  /// stay closed.
  bool get capabilityResolutionUnavailable => navigation is CapabilityNavigationUnresolved;

  @override
  String toString() => 'PlatformContext(sessionId: $sessionId)';
}
