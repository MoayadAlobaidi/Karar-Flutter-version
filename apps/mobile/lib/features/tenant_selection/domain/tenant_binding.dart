// PURE DART ONLY. See lib/README.md — domain purity.
//
// TENANT BINDING AND SWITCHING.
//
// The tenant a session is bound to is decided by the platform and by nothing
// else. This layer never derives it from a query parameter, a header, a stored
// preference, or an identifier a person typed. The only identifier it ever
// sends is one the platform itself listed as an active membership, and the
// platform verifies that membership again before any binding changes.
//
// TOKEN MATERIAL DOES NOT APPEAR HERE. A switch issues a brand-new session and
// kills every prior token; adopting the replacement credential is the data
// layer's job, and the outcome this layer publishes names the tenant and the
// session, never the credential.
import 'package:meta/meta.dart';

import '../../../core/errors/result.dart';

/// One tenant the principal may bind to, exactly as the platform listed it.
@immutable
final class TenantChoice {
  const TenantChoice({required this.tenantId, required this.name, required this.roleHint});

  final String tenantId;
  final String name;

  /// Informational. Authoritative roles are enforced server-side.
  final String roleHint;

  @override
  bool operator ==(Object other) =>
      other is TenantChoice &&
      other.tenantId == tenantId &&
      other.name == name &&
      other.roleHint == roleHint;

  @override
  int get hashCode => Object.hash(tenantId, name, roleHint);

  @override
  String toString() => 'TenantChoice($tenantId)';
}

/// What the client should do with the memberships the platform returned.
@immutable
sealed class TenantSelectionDecision {
  const TenantSelectionDecision();
}

/// No usable membership. The session stays unbound and every tenant-bound
/// surface stays unavailable. This is an onboarding state, not a failure.
final class NoTenantMembership extends TenantSelectionDecision {
  const NoTenantMembership();

  @override
  String toString() => 'NoTenantMembership()';
}

/// Exactly one membership. Binding it without asking is the approved path: the
/// question has one possible answer, so asking it would be ceremony.
final class BindSingleTenant extends TenantSelectionDecision {
  const BindSingleTenant(this.choice);

  final TenantChoice choice;

  @override
  String toString() => 'BindSingleTenant(${choice.tenantId})';
}

/// Several memberships. The principal chooses from this list and from nothing
/// else — there is no free-text identifier and no locally invented tenant.
final class ChooseTenant extends TenantSelectionDecision {
  const ChooseTenant(this.choices);

  final List<TenantChoice> choices;

  @override
  String toString() => 'ChooseTenant(${choices.length})';
}

/// Decides what to do with a list of platform-supplied memberships.
@immutable
final class TenantSelectionPolicy {
  const TenantSelectionPolicy();

  TenantSelectionDecision decide(List<TenantChoice> choices) {
    if (choices.isEmpty) {
      return const NoTenantMembership();
    }
    if (choices.length == 1) {
      return BindSingleTenant(choices.single);
    }
    return ChooseTenant(List<TenantChoice>.unmodifiable(choices));
  }

  /// Whether [tenantId] is one of the memberships the platform listed.
  ///
  /// The platform verifies membership again, so this is not the security
  /// boundary. It exists so the client cannot originate a request for a tenant
  /// nobody offered it.
  bool isOffered(List<TenantChoice> choices, String tenantId) =>
      choices.any((TenantChoice choice) => choice.tenantId == tenantId);
}

/// The result of a successful binding call.
@immutable
sealed class TenantBindingOutcome {
  const TenantBindingOutcome();

  /// The tenant now bound.
  TenantChoice get tenant;
}

/// FIRST BIND. The existing session gained the binding; no token rotated and
/// the credential in hand keeps working.
final class TenantBound extends TenantBindingOutcome {
  const TenantBound(this.tenant);

  @override
  final TenantChoice tenant;

  @override
  String toString() => 'TenantBound(${tenant.tenantId})';
}

/// SWITCH. The previous session and its refresh families were revoked and a
/// brand-new session was issued. The replacement credential has already been
/// adopted by the data layer before this value exists, so nothing downstream
/// can be holding the dead one.
final class TenantSwitched extends TenantBindingOutcome {
  const TenantSwitched({required this.tenant, required this.sessionId});

  @override
  final TenantChoice tenant;

  /// The NEW session identifier. Opaque and non-secret.
  final String sessionId;

  @override
  String toString() => 'TenantSwitched(${tenant.tenantId})';
}

/// Local state that belongs to one tenant and must not survive a switch.
///
/// Capability answers, consent status, profile and every other tenant-scoped
/// read are stale the instant the binding changes. Discarding them is part of
/// the switch, not a later refresh: a screen must never be able to render the
/// previous tenant's answer under the new tenant's name.
abstract interface class TenantScopedState {
  Future<void> discard();
}

/// The port for binding and switching.
abstract interface class TenantBindingRepository {
  /// Binds the session to [tenantId], or switches it there.
  ///
  /// On a switch the implementation MUST drop the old credential and adopt the
  /// new one before returning, so no caller can observe a state in which both
  /// exist.
  Future<Result<TenantBindingOutcome>> bind(String tenantId);
}

/// Binds an unbound session to a tenant the platform offered.
final class BindTenant {
  const BindTenant(this._repository);

  final TenantBindingRepository _repository;

  Future<Result<TenantBindingOutcome>> call(TenantChoice choice) =>
      _repository.bind(choice.tenantId);
}

/// Switches a bound session to another tenant.
///
/// Local tenant-scoped state is discarded FIRST. If the call then fails, the
/// client has thrown away a cache it can refetch; the opposite order would
/// leave the previous tenant's data on screen under a new binding.
final class SwitchTenant {
  const SwitchTenant({
    required TenantBindingRepository repository,
    required TenantScopedState scopedState,
  })  : _repository = repository,
        _scopedState = scopedState;

  final TenantBindingRepository _repository;
  final TenantScopedState _scopedState;

  Future<Result<TenantBindingOutcome>> call(TenantChoice choice) async {
    await _scopedState.discard();
    return _repository.bind(choice.tenantId);
  }
}
