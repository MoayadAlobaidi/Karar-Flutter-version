// PURE DART ONLY. See lib/README.md — domain purity.
//
// A CONNECTION IS A RECORD OF HOW DATA REACHES THIS PLATFORM. IT IS NOT A LINK
// TO A BANK.
//
// The word "connection" is the contract's, and it is the most dangerous word on
// this surface, so the type is shaped to make the wrong reading impossible:
//
//   * there is NO CREDENTIAL FIELD, and none may be added. No username, no
//     password, no mPIN, no OTP, no recovery code, no token, no cookie, no
//     certificate. The platform stores none, so there is nothing of that shape
//     to carry;
//   * there is NO SYNCHRONISATION CURSOR and no last-sync token, which would
//     imply a synchronisation that does not exist;
//   * [impliesLiveInstitutionLink] is READ OFF THE WIRE rather than assumed.
//     The contract emits it precisely so the claim is checkable, and the
//     repository refuses a response in which it is true — a value nothing can
//     produce is a value nothing should render;
//   * [ConnectionStatus.active] means the connection ACCEPTS DATA THE SUBJECT
//     SUPPLIES. It does not mean anything is connected, and the label for it
//     says so.
//
// THE FIVE STATUSES STAY FIVE. NOT_IMPLEMENTED ("we never built this"),
// NOT_CONFIGURED ("nothing has been set up") and UNAVAILABLE ("this is off
// right now") are three different answers that send a person to three
// different conclusions. Collapsing them into one "unavailable" throws away the
// only part a person could act on, so they are separate members here and get
// separate sentences on screen.
import 'package:meta/meta.dart';

import '../../financial_accounts/domain/account_source_link.dart';
import '../../financial_accounts/domain/source_rail.dart';
import 'rail_standing.dart';

/// The connection's own lifecycle.
///
/// NOT ONE OF THESE MEANS CONNECTED.
enum ConnectionStatus {
  /// The connection accepts data the subject supplies. Nothing more.
  active,

  /// The connection exists and nothing has been set up on it yet.
  notConfigured,

  /// Set up, and not usable at the moment.
  unavailable,

  /// The person is finished with it. Kept so its history stays readable.
  retired,

  /// The rail this connection names has no implementation on this platform.
  /// Distinct from [unavailable]: nothing is switched off, because nothing was
  /// ever built.
  notImplemented,

  /// A status this build does not know. Never softened into one of the five
  /// above.
  unrecognised,
}

/// One of the caller's own connections, as the safe summary the read path
/// returns.
@immutable
final class FinancialConnection {
  const FinancialConnection({
    required this.connectionId,
    required this.rail,
    required this.availability,
    required this.status,
    required this.displayLabel,
    required this.institutionId,
    required this.impliesLiveInstitutionLink,
    required this.providerAccessImplemented,
    required this.createdAt,
    required this.updatedAt,
    required this.version,
  });

  final String connectionId;

  final ConnectionRail rail;

  /// The PLATFORM'S answer to "can this rail run today". Carried so it can be
  /// shown and so it can be checked, never so it can grant a capability: see
  /// [standing], which does not consult it.
  final RailAvailability availability;

  final ConnectionStatus status;

  /// The subject's OWN name for this connection. Source-supplied text, so it is
  /// bidi-isolated wherever it is rendered and never trusted as markup.
  final String displayLabel;

  /// The catalogue row this connection names, or null. An opaque identifier:
  /// that this platform can spell an issuer's name is not evidence that it can
  /// reach one.
  final String? institutionId;

  /// False for every value of every status vocabulary on this surface. Read off
  /// the wire so the claim is checkable rather than merely stated in prose.
  final bool impliesLiveInstitutionLink;

  /// False while `providerAccessStatus` is NOT_IMPLEMENTED, which is its only
  /// permitted value.
  final bool providerAccessImplemented;

  /// When this record was created. A record, not an arrival of data.
  final DateTime createdAt;

  /// When this record last changed. Deliberately NOT a freshness figure: it
  /// says the row was edited, not that anything was fetched from anywhere. The
  /// only instants about data arriving are on the source link's observation.
  final DateTime updatedAt;

  final int version;

  /// What this build can say about the rail, derived from the rail ALONE.
  ///
  /// [availability] is not consulted. A response that claimed a bank rail was
  /// EXECUTABLE would be refused at the boundary; if one ever reached here it
  /// still could not turn this into an offer, because nothing downstream asks
  /// the response what a rail can do.
  RailStanding get standing => standingOfRail(rail);

  /// Whether everything on this connection is there because the person put it
  /// there. True for exactly the two rails that exist.
  bool get isSuppliedBySubject => standingIsSuppliedBySubject(standing);

  @override
  bool operator ==(Object other) =>
      other is FinancialConnection &&
      other.connectionId == connectionId &&
      other.rail == rail &&
      other.availability == availability &&
      other.status == status &&
      other.displayLabel == displayLabel &&
      other.institutionId == institutionId &&
      other.impliesLiveInstitutionLink == impliesLiveInstitutionLink &&
      other.providerAccessImplemented == providerAccessImplemented &&
      other.version == version;

  @override
  int get hashCode => Object.hash(
        connectionId,
        rail,
        availability,
        status,
        displayLabel,
        institutionId,
        impliesLiveInstitutionLink,
        providerAccessImplemented,
        version,
      );

  /// Names nothing. A connection label in a log line is the subject's own words
  /// about their own money leaving through a diagnostic sink.
  @override
  String toString() => 'FinancialConnection()';
}
