// EVERY VOCABULARY GETS ITS OWN SENTENCE, AND NO SENTENCE IS AN INVITATION.
//
// This file is the whole of the translation from the platform's vocabularies to
// words a person reads on this surface, and it is written as EXHAUSTIVE
// SWITCHES WITH NO `default` ARM. Three properties follow, and each is the
// point:
//
//   1. a member added to the contract stops this file compiling, so somebody
//      has to write a sentence for it. A `Map` with a fallback would compile
//      and answer "unrecognised" forever — which is also what rule 3 of
//      `test/architecture/financial_contract_reading_test.dart` exists to stop;
//
//   2. NOT_IMPLEMENTED, NOT_CONFIGURED and UNAVAILABLE GET THREE DIFFERENT
//      SENTENCES. "We never built this", "nothing has been set up on it" and
//      "it is off at the moment" send a person to three different conclusions,
//      and only one of them is ever going to change. Rounding all three to "not
//      available" throws away the only part that tells a person whether to wait,
//      to act, or to stop expecting anything;
//
//   3. NO SENTENCE HERE OFFERS ANYTHING. There is no "connect", no "link your
//      bank", no "coming soon" and no "set this up" for a rail that does not
//      exist — because the platform builds none of it, and a sentence that
//      implied otherwise would be the product lying about its own capabilities
//      at exactly the screen where a person went to check.
//
// The `unrecognised` arms are honest rather than generic: they say this VERSION
// does not know the value, which is a true statement about the client and
// leaves the person able to report something useful.
import '../../../core/errors/failure.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/account_source_link.dart';
import '../../financial_accounts/domain/source_rail.dart';
import '../domain/financial_connection.dart';
import '../domain/financial_connections_repository.dart';
import '../domain/rail_standing.dart';
import '../domain/source_arrival.dart';

/// The NAME of one rail.
///
/// A name and nothing more. Naming a rail is not a claim that it works, which
/// is why [railStandingSentence] travels beside it everywhere on this surface.
String connectionRailLabel(ConnectionRail rail, AppLocalizations l10n) =>
    switch (rail) {
      ConnectionRail.manual => l10n.connectionRailManual,
      ConnectionRail.userFileUpload => l10n.connectionRailUserFileUpload,
      ConnectionRail.openFinanceApi => l10n.connectionRailOpenFinanceApi,
      ConnectionRail.directBankOrWalletApi =>
        l10n.connectionRailDirectBankOrWalletApi,
      ConnectionRail.licensedAggregatorApi =>
        l10n.connectionRailLicensedAggregatorApi,
      ConnectionRail.hostToHostSftp => l10n.connectionRailHostToHostSftp,
      ConnectionRail.iso20022File => l10n.connectionRailIso20022File,
      ConnectionRail.swiftMtFile => l10n.connectionRailSwiftMtFile,
      ConnectionRail.ofxQfxFile => l10n.connectionRailOfxQfxFile,
      ConnectionRail.qifFile => l10n.connectionRailQifFile,
      ConnectionRail.pdfStatement => l10n.connectionRailPdfStatement,
      ConnectionRail.secureEmailStatement => l10n.connectionRailSecureEmailStatement,
      ConnectionRail.deviceSignal => l10n.connectionRailDeviceSignal,
      ConnectionRail.unrecognised => l10n.connectionRailUnrecognised,
    };

/// The badge word for what this build can do with a rail.
String railStandingBadge(RailStanding standing, AppLocalizations l10n) =>
    switch (standing) {
      RailStanding.subjectEntersIt => l10n.railStandingBadgeYouEnterIt,
      RailStanding.subjectUploadsAFile => l10n.railStandingBadgeYouUploadIt,
      RailStanding.notBuilt => l10n.railStandingBadgeNotBuilt,
      RailStanding.unknownToThisVersion => l10n.railStandingBadgeUnknown,
    };

/// The full sentence for what this build can do with a rail.
///
/// The [RailStanding.notBuilt] arm is the load-bearing one. It says the rail
/// does not exist here — not that it is switched off, not that it is planned,
/// not that it is coming. Those would each be a promise, and this platform has
/// made none.
String railStandingSentence(RailStanding standing, AppLocalizations l10n) =>
    switch (standing) {
      RailStanding.subjectEntersIt => l10n.railStandingYouEnterIt,
      RailStanding.subjectUploadsAFile => l10n.railStandingYouUploadIt,
      RailStanding.notBuilt => l10n.railStandingNotBuilt,
      RailStanding.unknownToThisVersion => l10n.railStandingUnknown,
    };

/// The tone a standing is drawn in.
///
/// [RailStanding.notBuilt] is INFORMATIONAL rather than a warning or an error.
/// A rail this platform never built is not a fault of the person's, nothing is
/// broken, and there is nothing for them to fix — drawing it in red would ask
/// them to act on something no action reaches.
KararStatusTone railStandingTone(RailStanding standing) => switch (standing) {
      RailStanding.subjectEntersIt => KararStatusTone.success,
      RailStanding.subjectUploadsAFile => KararStatusTone.success,
      RailStanding.notBuilt => KararStatusTone.info,
      RailStanding.unknownToThisVersion => KararStatusTone.warning,
    };

/// The platform's own answer to "can this rail run today".
String railAvailabilityLabel(
  RailAvailability availability,
  AppLocalizations l10n,
) =>
    switch (availability) {
      RailAvailability.executable => l10n.railAvailabilityExecutable,
      RailAvailability.notImplemented => l10n.railAvailabilityNotImplemented,
      RailAvailability.unrecognised => l10n.railAvailabilityUnrecognised,
    };

/// One connection's lifecycle, as its own sentence.
///
/// Five statuses, five sentences, and the three that a careless reading would
/// merge stay apart. See rule 2 in the file header.
String connectionStatusLabel(ConnectionStatus status, AppLocalizations l10n) =>
    switch (status) {
      // "Accepts what you supply", never "Connected". ACTIVE is a statement
      // about whether this record will take data the PERSON gives it.
      ConnectionStatus.active => l10n.connectionStatusAcceptsWhatYouSupply,
      ConnectionStatus.notConfigured => l10n.connectionStatusNotConfigured,
      ConnectionStatus.unavailable => l10n.connectionStatusUnavailable,
      ConnectionStatus.retired => l10n.connectionStatusRetired,
      ConnectionStatus.notImplemented => l10n.connectionStatusNotImplemented,
      ConnectionStatus.unrecognised => l10n.connectionStatusUnrecognised,
    };

/// The tone one status is drawn in.
KararStatusTone connectionStatusTone(ConnectionStatus status) => switch (status) {
      ConnectionStatus.active => KararStatusTone.success,
      ConnectionStatus.notConfigured => KararStatusTone.neutral,
      ConnectionStatus.unavailable => KararStatusTone.warning,
      ConnectionStatus.retired => KararStatusTone.neutral,
      ConnectionStatus.notImplemented => KararStatusTone.info,
      ConnectionStatus.unrecognised => KararStatusTone.warning,
    };

/// The name of one listing filter.
String connectionFilterLabel(
  ConnectionStatusFilter? filter,
  AppLocalizations l10n,
) =>
    switch (filter) {
      null => l10n.dataSourcesFilterAll,
      ConnectionStatusFilter.accepting => l10n.dataSourcesFilterAccepting,
      ConnectionStatusFilter.notConfigured => l10n.dataSourcesFilterNotConfigured,
      ConnectionStatusFilter.unavailable => l10n.dataSourcesFilterUnavailable,
      ConnectionStatusFilter.retired => l10n.dataSourcesFilterRetired,
      ConnectionStatusFilter.notImplemented => l10n.dataSourcesFilterNotImplemented,
    };

/// Why this source was linked to this account.
///
/// EXACT or PROBABLE, and nothing in between. There is no confidence figure in
/// this platform, so there is none to render and none may be invented.
String matchBasisLabel(MatchBasis basis, AppLocalizations l10n) => switch (basis) {
      MatchBasis.exactExternalReference => l10n.sourceMatchBasisExact,
      MatchBasis.probable => l10n.sourceMatchBasisProbable,
      MatchBasis.unrecognised => l10n.sourceMatchBasisUnrecognised,
    };

/// When data last arrived through one source, or that none has.
///
/// The sentence names the PERSON as the origin in both arms, so a date on this
/// row cannot be read as this platform having been in touch with anybody.
String sourceArrivalSentence(
  SourceArrival arrival,
  AppLocalizations l10n, {
  required String Function(DateTime instant) formatInstant,
}) =>
    switch (arrival) {
      DataArrivedAt(:final at) => l10n.sourceArrivalYouSupplied(formatInstant(at)),
      NoDataHasArrived() => l10n.sourceArrivalNone,
    };

/// Why this account's sources could not be read.
///
/// Exhaustive over the sealed failure taxonomy, so a new failure kind does not
/// compile until somebody has decided what it means here. Every arm ends the
/// same way where it can: nothing about the person's data changed, because this
/// surface reads and never writes.
String sourceReadRefusalMessage(Failure failure, AppLocalizations l10n) =>
    switch (failure) {
      NotFoundFailure() => l10n.dataSourcesRefusalGone,
      OfflineFailure() => l10n.dataSourcesRefusalOffline,
      TimeoutFailure() => l10n.dataSourcesRefusalOffline,
      // Everything below is "this could not be read just now, and nothing about
      // your data changed". They are enumerated rather than defaulted so that a
      // failure kind added later has to be considered here instead of silently
      // joining them.
      AuthenticationRequiredFailure() ||
      SessionExpiredFailure() ||
      SessionChangedFailure() ||
      NotAuthorizedFailure() ||
      OperationRestrictedFailure() ||
      ConsentRequiredFailure() ||
      ReConsentRequiredFailure() ||
      TenantSelectionRequiredFailure() ||
      BootstrapUnavailableFailure() ||
      CapabilityResolutionUnavailableFailure() ||
      RateLimitedFailure() ||
      DependencyUnavailableFailure() ||
      InvalidRequestFailure() ||
      ConflictFailure() ||
      RequestCancelledFailure() ||
      UnsafeRequestNotReplayedFailure() ||
      SecureStorageUnavailableFailure() ||
      LocalStorageUnavailableFailure() ||
      LocalSecurityStateUnavailableFailure() ||
      LocalSecurityStateCorruptFailure() ||
      ConfigurationInvalidFailure() ||
      ContractViolationFailure() ||
      UnexpectedFailure() =>
        l10n.dataSourcesRefusalGeneric,
    };
