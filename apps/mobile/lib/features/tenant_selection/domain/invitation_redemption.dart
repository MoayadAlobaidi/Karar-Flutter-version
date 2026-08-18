// PURE DART ONLY. See lib/README.md — domain purity.
//
// INVITATION REDEMPTION.
//
// This is the one action available to a principal with no membership, and it
// is what keeps the no-membership state from being a dead end.
//
// The token is a bearer credential for exactly one redemption. It is held only
// for the length of the call, is never persisted, is never logged, and is
// never placed in a preference store. The invited address is matched
// server-side against the redeemer's own verified identity; this client sends
// no email address and asserts no identity of its own.
//
// The tenant the redemption joins comes from the invitation RECORD, server
// side. A tenant identifier is never sent with a redemption and could not be
// honoured if it were.
import 'package:meta/meta.dart';

import '../../../core/errors/result.dart';

/// A one-time invitation token, as typed or pasted by the invitee.
///
/// The type exists so a raw string cannot drift into a log line or a
/// preference write by accident: it has no `toString` that reveals the value.
@immutable
final class InvitationToken {
  const InvitationToken._(this.value);

  /// Returns null for a blank token rather than sending one the platform can
  /// only refuse.
  static InvitationToken? tryParse(String? raw) {
    final trimmed = raw?.trim() ?? '';
    return trimmed.isEmpty ? null : InvitationToken._(trimmed);
  }

  final String value;

  @override
  String toString() => 'InvitationToken(redacted)';
}

/// The membership a redemption produced.
@immutable
final class RedeemedMembership {
  const RedeemedMembership({required this.tenantId, required this.membershipId});

  /// From the invitation record, server-side.
  final String tenantId;

  final String membershipId;

  @override
  String toString() => 'RedeemedMembership($tenantId)';
}

/// The port for redeeming an invitation.
abstract interface class TenantInvitationRepository {
  Future<Result<RedeemedMembership>> redeem(InvitationToken token);
}

/// Redeems an invitation as the authenticated principal.
final class RedeemInvitation {
  const RedeemInvitation(this._repository);

  final TenantInvitationRepository _repository;

  Future<Result<RedeemedMembership>> call(InvitationToken token) =>
      _repository.redeem(token);
}
