// PURE DART ONLY. See lib/README.md — domain purity.
//
// WHAT THIS BUILD MAY SAY ABOUT A RAIL.
//
// Thirteen rails are NAMED by the contract because the vocabulary has to
// describe the world. Exactly two exist: MANUAL and USER_FILE_UPLOAD. Every
// other rail is NOT_IMPLEMENTED, no issuer exposes an interface to this
// platform, and no credential of any kind is stored anywhere (ADR-0028).
//
// This file is the ONE place the client turns a rail into a statement, and it
// is built so that the misleading statement is UNSAYABLE rather than merely
// unsaid:
//
//   * [RailStanding] has no member meaning "connect", "coming soon", "link
//     your bank" or "available later". Producing one is not a matter of
//     flipping a condition — it takes a new member and a new translated
//     string, which is a reviewable change rather than a slip;
//   * [standingInvitesConnection] is a constant `false` written as a function
//     over the vocabulary, so a test asserts it for EVERY member rather than
//     for the members somebody remembered;
//   * THE RAIL DECIDES, NOT THE RESPONSE. [standingOfRail] is an exhaustive
//     switch over the rails, with no `default` arm and no availability
//     parameter. A response that claimed EXECUTABLE for a rail this build has
//     never had code for could not talk the screen into offering anything,
//     because the screen never asks the response what a rail can do.
//
// The response is not ignored, though. [railContradictsAvailability] compares
// what the platform said with what this build knows, so the disagreement is a
// typed contract violation at the boundary instead of two screens quietly
// disagreeing. It deliberately makes NO CLAIM about a rail this build does not
// recognise: a newer platform that implements a fourteenth rail must not be
// refused by an older client.
import '../../financial_accounts/domain/account_source_link.dart';
import '../../financial_accounts/domain/source_rail.dart';

/// What this build can honestly say about one rail.
///
/// Four members, and none of them is a promise. Read the file header before
/// adding a fifth.
enum RailStanding {
  /// The person types the data in themselves. `MANUAL`.
  subjectEntersIt,

  /// The person uploads a file and the platform reads it. `USER_FILE_UPLOAD`.
  subjectUploadsAFile,

  /// This platform has no code for this rail. It is not switched off, not
  /// pending and not scheduled — it does not exist here.
  notBuilt,

  /// A rail this VERSION of the client does not know. The platform may have
  /// added it; this build cannot describe it and does not guess.
  unknownToThisVersion,
}

/// Whether a standing asserts that this platform can reach an institution.
///
/// A constant `false`, written as a function so a test can assert it over the
/// whole of [RailStanding.values] rather than over the members somebody
/// remembered to check. No issuer exposes an interface to this platform and no
/// credential of any kind is stored (ADR-0028).
bool standingInvitesConnection(RailStanding standing) => false;

/// Whether the person themselves is the source of everything on this rail.
///
/// True for exactly the two rails that exist. It is what a screen asks before
/// describing data as having arrived, and it is the reason a "last updated"
/// line can never be read as the platform having checked with anybody.
bool standingIsSuppliedBySubject(RailStanding standing) => switch (standing) {
      RailStanding.subjectEntersIt => true,
      RailStanding.subjectUploadsAFile => true,
      RailStanding.notBuilt => false,
      RailStanding.unknownToThisVersion => false,
    };

/// The standing of one rail, from the rail ALONE.
///
/// No availability parameter, deliberately. Availability is the platform's
/// answer to "can this run today"; it is checked against this one at the
/// boundary (see [railContradictsAvailability]) and it is never allowed to
/// GRANT a capability, only to disagree. The eleven unimplemented rails are
/// written out one by one rather than defaulted, so the day one of them is
/// built this file stops compiling until somebody writes what it now means.
RailStanding standingOfRail(ConnectionRail rail) => switch (rail) {
      ConnectionRail.manual => RailStanding.subjectEntersIt,
      ConnectionRail.userFileUpload => RailStanding.subjectUploadsAFile,
      ConnectionRail.openFinanceApi ||
      ConnectionRail.directBankOrWalletApi ||
      ConnectionRail.licensedAggregatorApi ||
      ConnectionRail.hostToHostSftp ||
      ConnectionRail.iso20022File ||
      ConnectionRail.swiftMtFile ||
      ConnectionRail.ofxQfxFile ||
      ConnectionRail.qifFile ||
      ConnectionRail.pdfStatement ||
      ConnectionRail.secureEmailStatement ||
      ConnectionRail.deviceSignal =>
        RailStanding.notBuilt,
      ConnectionRail.unrecognised => RailStanding.unknownToThisVersion,
    };

/// Whether the platform's own [availability] disagrees with what this build
/// knows about [rail].
///
/// The contract states one split and the database enforces it: EXECUTABLE for
/// MANUAL and USER_FILE_UPLOAD, NOT_IMPLEMENTED for every other rail. A
/// response outside that split is drift, and drift about THIS field is the
/// difference between "you supplied this" and "a bank sent it", so it is
/// refused at the boundary rather than rendered.
///
/// Two arms make no claim, and both are deliberate:
///
///   * a rail this build does not recognise. A newer platform implementing a
///     fourteenth rail is a deployment, not a defect, and an older client that
///     refused it would break on an upgrade it did not ship for;
///   * an availability this build does not recognise. There is nothing to
///     compare against, and [standingOfRail] has already refused to grant the
///     rail anything on the strength of it.
bool railContradictsAvailability(
  ConnectionRail rail,
  RailAvailability availability,
) {
  if (rail == ConnectionRail.unrecognised) {
    return false;
  }
  final bool builtHere = standingIsSuppliedBySubject(standingOfRail(rail));
  return switch (availability) {
    RailAvailability.executable => !builtHere,
    RailAvailability.notImplemented => builtHere,
    RailAvailability.unrecognised => false,
  };
}

/// Every rail the contract names, in a stable order, so the honest statement
/// about the rails that do not exist covers all of them rather than the ones a
/// person happens to hold a connection on.
///
/// [ConnectionRail.unrecognised] is excluded: it is this client's name for a
/// value the platform sent, not a rail the platform declares, and listing it
/// as though it were one would invent a rail nobody named.
List<ConnectionRail> declaredRails() => <ConnectionRail>[
      for (final rail in ConnectionRail.values)
        if (rail != ConnectionRail.unrecognised) rail,
    ];
