// PURE DART ONLY. See lib/README.md — domain purity.
//
// HOW DATA ARRIVES, AND HOW FRESH IT IS.
//
// This is the safe projection and the only one a read path returns. The stored
// entity carries an external account reference and a keyed fingerprint;
// neither has a field here, and neither may be reconstructed from what does.
//
// Thirteen rails are NAMED because the vocabulary has to describe the world.
// Exactly two can be RUN. Naming a rail is not a claim that it works, which is
// why [RailAvailability] travels beside it everywhere and why
// `data_origin.dart` derives every label from the pair rather than from the
// rail alone.
import 'package:meta/meta.dart';

import 'calendar_day.dart';
import 'source_rail.dart';

/// How data arrives.
enum ConnectionRail {
  manual,
  userFileUpload,
  openFinanceApi,
  directBankOrWalletApi,
  licensedAggregatorApi,
  hostToHostSftp,
  iso20022File,
  swiftMtFile,
  ofxQfxFile,
  qifFile,
  pdfStatement,
  secureEmailStatement,
  deviceSignal,
  unrecognised,
}

/// How much weight this source's version of a fact carries.
enum SourceAuthority { authoritative, supplemental, unverified, unrecognised }

/// Why this source was linked to this account. There is no confidence score
/// in this platform and none may be invented for display.
enum MatchBasis { exactExternalReference, probable, unrecognised }

/// The link's own lifecycle. None of these means "connected to a bank".
enum SourceLinkStatus {
  pendingConfirmation,
  linked,
  declined,
  dormant,
  unrecognised,
}

/// What was OBSERVED, not what is supported.
enum SourceDataObservationState {
  observed,

  /// This platform has not seen it.
  notObserved,

  /// The source never offered it.
  notProvided,

  unrecognised,
}

/// Freshness as observation, not as health.
@immutable
final class SourceObservation {
  const SourceObservation({
    required this.firstObservedAt,
    required this.lastObservedAt,
    required this.lastSuccessfulImportAt,
  });

  final DateTime firstObservedAt;
  final DateTime lastObservedAt;

  /// Null when no import has yet succeeded. Never approximated, and never
  /// substituted with [lastObservedAt] — "we saw the source" and "an import
  /// finished" are different facts.
  final DateTime? lastSuccessfulImportAt;

  @override
  String toString() => 'SourceObservation()';
}

/// What this source has been seen to supply.
@immutable
final class SourceCapabilities {
  const SourceCapabilities({required this.balance, required this.pendingTransactions});

  final SourceDataObservationState balance;
  final SourceDataObservationState pendingTransactions;

  @override
  String toString() => 'SourceCapabilities()';
}

/// One source feeding one account, as a safe summary.
@immutable
final class AccountSourceLink {
  const AccountSourceLink({
    required this.sourceLinkId,
    required this.accountId,
    required this.connectionId,
    required this.rail,
    required this.availability,
    required this.sourceAuthority,
    required this.matchBasis,
    required this.status,
    required this.impliesLiveInstitutionLink,
    required this.providerAccessImplemented,
    required this.subjectConfirmedAt,
    required this.sourcePriority,
    required this.observation,
    required this.historyCoverage,
    required this.capabilities,
    required this.version,
  });

  final String sourceLinkId;
  final String accountId;
  final String connectionId;
  final ConnectionRail rail;
  final RailAvailability availability;
  final SourceAuthority sourceAuthority;
  final MatchBasis matchBasis;
  final SourceLinkStatus status;

  /// False for every value of every status vocabulary on this surface. Carried
  /// so the claim is checkable rather than merely stated in prose.
  final bool impliesLiveInstitutionLink;

  /// False while `providerAccessStatus` is NOT_IMPLEMENTED, its only value.
  final bool providerAccessImplemented;

  /// When the person confirmed this link, or null while they have not.
  final DateTime? subjectConfirmedAt;

  final int sourcePriority;
  final SourceObservation observation;

  /// The calendar range this source has supplied, as DAYS. Null when nothing
  /// has been supplied.
  final CalendarDayRange? historyCoverage;

  final SourceCapabilities capabilities;
  final int version;

  @override
  String toString() => 'AccountSourceLink($sourceLinkId)';
}
