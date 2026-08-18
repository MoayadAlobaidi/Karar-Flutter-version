// PURE DART ONLY.
//
// The application-level view of `GET /platform/bootstrap`.
//
// This is the shape the shell and the router read. It is MAPPED from the
// generated DTO by `ApiBootstrapGateway`; no generated type appears above that
// boundary, so a contract change is absorbed in one file.
//
// Nothing here is money, a balance, an account, or a transaction. Bootstrap
// carries identity, tenancy, jurisdiction, operating entity, policy-pack
// version and capability state — and nothing else.
import 'package:meta/meta.dart';

/// One tenant the principal may bind the session to.
@immutable
final class TenantOption {
  const TenantOption({required this.tenantId, required this.name, required this.roleHint});

  final String tenantId;
  final String name;

  /// Informational only. Authoritative roles live server-side.
  final String roleHint;

  @override
  bool operator ==(Object other) =>
      other is TenantOption &&
      other.tenantId == tenantId &&
      other.name == name &&
      other.roleHint == roleHint;

  @override
  int get hashCode => Object.hash(tenantId, name, roleHint);

  @override
  String toString() => 'TenantOption($tenantId)';
}

/// Whether the session is bound to a tenant.
@immutable
sealed class TenantBinding {
  const TenantBinding();
}

/// No binding, and no membership to bind to.
final class TenantUnbound extends TenantBinding {
  const TenantUnbound();
}

/// Bound to exactly one tenant.
final class TenantBound extends TenantBinding {
  const TenantBound(this.tenant);

  final TenantOption tenant;
}

/// Several memberships; the principal must choose.
final class TenantSelectionRequired extends TenantBinding {
  const TenantSelectionRequired(this.choices);

  final List<TenantOption> choices;
}

/// The effective-jurisdiction state. Clients key on this, never on the
/// identifier: behaviour differences resolve through policy packs.
enum JurisdictionState { none, unverified, verified, unknown }

/// Whether the contracting legal person is known.
enum OperatingEntityState {
  /// The entity is known and carried.
  assigned,

  /// No binding exists.
  unassigned,

  /// The read failed. Treated as a closed door by the startup coordinator.
  unavailable,

  /// A state this build does not recognise. Also treated as closed.
  unknown,
}

/// The reviewed safe projection of the contracting entity.
@immutable
final class OperatingEntitySummary {
  const OperatingEntitySummary({
    required this.id,
    required this.name,
    required this.jurisdictionRef,
    required this.contactReference,
  });

  final String id;

  /// The registered legal name.
  final String name;

  /// Display data only. Never branched on.
  final String? jurisdictionRef;

  /// A published role-mailbox reference, never a named person.
  final String? contactReference;

  @override
  String toString() => 'OperatingEntitySummary($id)';
}

/// Whether capability resolution completed.
enum CapabilityResolutionState {
  /// Resolution completed; [BootstrapSnapshot.capabilities] is the answer,
  /// even when empty.
  resolved,

  /// A state this build does not recognise. Capability-gated surfaces stay
  /// closed.
  unknown,
}

/// One client-visible capability.
@immutable
final class CapabilityView {
  const CapabilityView({required this.id, required this.status, required this.requirements});

  final String id;
  final String status;

  /// Actionable requirements only.
  final List<String> requirements;

  @override
  String toString() => 'CapabilityView($id)';
}

/// The bootstrap context, as the application uses it.
@immutable
final class BootstrapSnapshot {
  const BootstrapSnapshot({
    required this.userId,
    required this.emailVerified,
    required this.sessionId,
    required this.binding,
    required this.jurisdictionState,
    required this.jurisdictionId,
    required this.operatingEntityState,
    required this.operatingEntity,
    required this.policyPackVersion,
    required this.policyPackStatus,
    required this.capabilityState,
    required this.capabilities,
  });

  final String userId;
  final bool emailVerified;
  final String sessionId;
  final TenantBinding binding;
  final JurisdictionState jurisdictionState;

  /// Display and pack selection only; null when the state is `none`.
  final String? jurisdictionId;

  final OperatingEntityState operatingEntityState;
  final OperatingEntitySummary? operatingEntity;

  /// Version and status only — never pack content.
  final String? policyPackVersion;
  final String? policyPackStatus;

  final CapabilityResolutionState capabilityState;
  final List<CapabilityView> capabilities;

  /// Whether a capability is present and reports the given status.
  bool hasCapability(String id, {String status = 'AVAILABLE'}) {
    if (capabilityState != CapabilityResolutionState.resolved) {
      // Fail closed: an unresolved capability set grants nothing.
      return false;
    }
    for (final capability in capabilities) {
      if (capability.id == id) {
        return capability.status == status;
      }
    }
    return false;
  }

  @override
  String toString() => 'BootstrapSnapshot(sessionId: $sessionId)';
}
