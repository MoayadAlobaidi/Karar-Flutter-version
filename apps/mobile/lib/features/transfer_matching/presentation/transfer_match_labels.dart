// EVERY VOCABULARY GETS ITS OWN SENTENCE.
//
// This file is the whole of the translation from the platform's vocabularies to
// words a person reads, and it is written as EXHAUSTIVE SWITCHES WITH NO
// `default` ARM. Two properties follow, and both are the point:
//
//   1. a member added to the contract stops this file compiling, so somebody
//      has to write a sentence for it. A `Map` with a fallback would compile
//      and answer "unrecognised" forever — which is also what rule 3 of
//      `test/architecture/financial_contract_reading_test.dart` exists to stop;
//   2. NO REFUSAL IS EVER GENERIC WHEN A SPECIFIC ONE EXISTS. "This pair
//      changed while it was on your screen" and "that answer is no longer
//      available" send a person to two different remedies, and rounding either
//      to "something went wrong" throws away the only part that helps.
//
// The `unrecognised` arms are honest rather than generic: they say this VERSION
// does not know the value, which is a true statement about the client and
// leaves the person able to report something useful. They never describe the
// pair, because nothing here knows what an unknown member means.
import '../../../core/errors/failure.dart';
import '../../../l10n/generated/app_localizations.dart';
import '../../../shared/shared.dart';
import '../domain/transfer_match.dart';
import '../domain/transfer_matches_repository.dart';
import 'transfer_matching_providers.dart';

/// The badge word for one match state.
String matchStateLabel(MatchState state, AppLocalizations l10n) => switch (state) {
      MatchState.suggested => l10n.transferMatchStateSuggested,
      MatchState.confirmed => l10n.transferMatchStateConfirmed,
      MatchState.rejected => l10n.transferMatchStateRejected,
      MatchState.unrecognised => l10n.transferMatchStateUnrecognised,
    };

/// The tone the badge is drawn in.
///
/// `suggested` is NEUTRAL rather than a warning or a success. A proposal is a
/// question, and colouring it as either an achievement or a problem would tell
/// a person what to answer before they have read it.
KararStatusTone matchStateTone(MatchState state) => switch (state) {
      MatchState.suggested => KararStatusTone.neutral,
      MatchState.confirmed => KararStatusTone.success,
      MatchState.rejected => KararStatusTone.info,
      MatchState.unrecognised => KararStatusTone.warning,
    };

/// What this state means for the person's own record of what they earned and
/// spent.
///
/// The `suggested` arm is the load-bearing one: it says out loud that nothing
/// has happened, so a proposal cannot be read as something already applied.
String matchStateNote(MatchState state, AppLocalizations l10n) => switch (state) {
      MatchState.suggested => l10n.transferMatchNothingChangedNote,
      MatchState.confirmed => l10n.transferMatchConfirmedNote,
      MatchState.rejected => l10n.transferMatchRejectedNote,
      MatchState.unrecognised => l10n.transferMatchUnrecognisedNote,
    };

/// The rule the platform matched on, written out.
String suggestionBasisSentence(SuggestionBasis basis, AppLocalizations l10n) =>
    switch (basis) {
      SuggestionBasis.equalAndOppositeSameCurrencyWithinWindow =>
        l10n.transferMatchBasisEqualAndOpposite,
      SuggestionBasis.unrecognised => l10n.transferMatchBasisUnrecognised,
    };

/// The name of one filter.
String matchFilterLabel(MatchStateFilter filter, AppLocalizations l10n) =>
    switch (filter) {
      MatchStateFilter.awaitingDecision => l10n.transferMatchesFilterAwaiting,
      MatchStateFilter.confirmed => l10n.transferMatchesFilterConfirmed,
      MatchStateFilter.rejected => l10n.transferMatchesFilterRejected,
    };

/// The empty-state title for one filter, so "nothing here" says which kind of
/// nothing it is.
String emptyListingTitle(MatchStateFilter filter, AppLocalizations l10n) =>
    switch (filter) {
      MatchStateFilter.awaitingDecision => l10n.transferMatchesEmptyAwaitingTitle,
      MatchStateFilter.confirmed => l10n.transferMatchesEmptyConfirmedTitle,
      MatchStateFilter.rejected => l10n.transferMatchesEmptyRejectedTitle,
    };

String emptyListingDescription(MatchStateFilter filter, AppLocalizations l10n) =>
    switch (filter) {
      MatchStateFilter.awaitingDecision =>
        l10n.transferMatchesEmptyAwaitingDescription,
      MatchStateFilter.confirmed => l10n.transferMatchesEmptyConfirmedDescription,
      MatchStateFilter.rejected => l10n.transferMatchesEmptyRejectedDescription,
    };

/// What is being recorded right now, named rather than shown as an unlabelled
/// spinner a screen reader cannot describe.
///
/// The `idle` arm answers null: there is nothing in flight to announce, and a
/// sentence for it would be a status that is always on.
String? decisionProgressStatus(MatchDecisionProgress progress, AppLocalizations l10n) =>
    switch (progress) {
      MatchDecisionProgress.idle => null,
      MatchDecisionProgress.confirming => l10n.transferMatchConfirmingStatus,
      MatchDecisionProgress.rejecting => l10n.transferMatchRejectingStatus,
    };

/// Why a decision was not recorded.
///
/// Exhaustive over the sealed failure taxonomy, so a new failure kind does not
/// compile until somebody has decided what it means here. The three arms that
/// carry a code are checked BEFORE the type arms they belong to, because a
/// version conflict and an illegal transition both arrive as `ConflictFailure`
/// and send a person to different remedies: reload and answer again, versus
/// this answer is gone.
///
/// EVERY MESSAGE ENDS THE SAME WAY WHERE IT CAN: nothing was changed. A person
/// who has just pressed a button about their own money needs to know whether it
/// took effect, and "an error occurred" does not say.
String decisionRefusalMessage(Failure failure, AppLocalizations l10n) {
  final code = failure.code;
  if (code == transferMatchCrossCurrencyCode) {
    return l10n.transferMatchRefusalCrossCurrency;
  }
  if (code == transferMatchRuleViolatedCode ||
      code == transferMatchTransitionUnavailableCode) {
    return l10n.transferMatchRefusalNotAvailable;
  }
  return switch (failure) {
    NotFoundFailure() => l10n.transferMatchRefusalGone,
    ConflictFailure() => l10n.transferMatchRefusalConflict,
    // Everything below is "your answer was not recorded, and nothing changed",
    // which is the honest and complete statement for each of them on this
    // surface. They are enumerated rather than defaulted so that a failure kind
    // added later has to be considered here instead of silently joining them.
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
    OfflineFailure() ||
    TimeoutFailure() ||
    RequestCancelledFailure() ||
    UnsafeRequestNotReplayedFailure() ||
    SecureStorageUnavailableFailure() ||
    LocalStorageUnavailableFailure() ||
    LocalSecurityStateUnavailableFailure() ||
    LocalSecurityStateCorruptFailure() ||
    ConfigurationInvalidFailure() ||
    ContractViolationFailure() ||
    UnexpectedFailure() =>
      l10n.transferMatchRefusalGeneric,
  };
}
