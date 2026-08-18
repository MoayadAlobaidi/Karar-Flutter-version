// PURE DART ONLY. See value_objects/email_address.dart for the shared-kernel
// note.
//
// ENUMERATION RESISTANCE, STRUCTURALLY.
//
// Registration, resend-verification and forgot-password all answer 202 with
// the same body whether or not the address is known to the platform. That
// protection is only worth having if the CLIENT does not undo it, and a client
// undoes it the moment it renders anything the server sent — a `detail`
// string, a cooldown, a count — because two different renderings are two
// different answers.
//
// This type is therefore EMPTY, and deliberately so. It carries no server
// text and no payload of any kind, so "the address was new" and "the address
// was already registered" are not merely rendered the same way: they are the
// same value, and no future edit to a screen can make them differ.
import 'package:meta/meta.dart';

/// The platform accepted the request and will act on it if there is anything
/// to act on. It reveals nothing further, and neither does this client.
@immutable
final class NeutralReceipt {
  const NeutralReceipt();

  @override
  bool operator ==(Object other) => other is NeutralReceipt;

  @override
  int get hashCode => (NeutralReceipt).hashCode;

  @override
  String toString() => 'NeutralReceipt()';
}
