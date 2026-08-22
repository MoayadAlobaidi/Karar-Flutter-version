// PURE DART ONLY. See lib/README.md — domain purity.
//
// A TRANSFER MATCH IS A RELATIONSHIP BETWEEN TWO OF THE PERSON'S OWN
// TRANSACTIONS, NOT A THIRD RECORD OF THE MONEY.
//
// A wallet top-up from a bank account is ONE movement that the data records
// TWICE, once leaving and once arriving. Counted as two transactions it makes a
// month in which somebody moved their own money look like a month in which they
// earned and spent it (ADR-0028).
//
// The fix is a relationship. Both transactions stay exactly as their sources
// reported them. Nothing here nets them off, totals them, recategorises them or
// produces a conclusion — and this type has NO AMOUNT FIELD AT ALL, because the
// contract has none: the figures live on the two transactions the match names,
// and a copy on the relationship would be a third number free to disagree with
// both.
//
// A SUGGESTION CHANGES NOTHING. `MatchState.suggested` is a question the
// product asks. Only the person's confirmation makes a match authoritative,
// and [TransferMatch.authoritative] is the PLATFORM'S OWN WORD for that, read
// off the wire rather than inferred from a state this build might only
// half-recognise.
import 'package:meta/meta.dart';

/// Where a match stands.
///
/// [rejected] is TERMINAL: a rejected pair can never be confirmed, and it keeps
/// its row so the same wrong pairing is not proposed again as though nobody had
/// ever looked at it.
enum MatchState {
  /// The platform proposed this pair. Nothing has changed.
  suggested,

  /// The person said these two movements are one movement.
  confirmed,

  /// The person said they are not — or withdrew a confirmation they had made.
  rejected,

  /// A state this build does not know. Never rendered as any of the three
  /// above, and never actionable.
  unrecognised,
}

/// Why the platform proposed a pair.
///
/// A RULE, not a score. This platform produces no confidence figure anywhere,
/// so there is none to display and none may be invented for the screen.
enum SuggestionBasis {
  /// Two amounts exactly equal and opposite, in the SAME currency, booked
  /// within the declared window.
  equalAndOppositeSameCurrencyWithinWindow,

  /// A basis this build does not know. Stated as unknown rather than described
  /// with the sentence of whichever basis happened to be first.
  unrecognised,
}

/// One side of the relationship.
///
/// It carries NO AMOUNT AND NO DATE, exactly as the contract's `MatchSideView`
/// does: those belong to the transaction it names. A copy here would be free to
/// disagree with the record it claims to describe.
@immutable
final class MatchSide {
  const MatchSide({
    required this.transactionId,
    required this.accountId,
    required this.currencyCode,
  });

  /// The caller's own transaction. Opaque.
  final String transactionId;

  /// The account it sits on. Opaque.
  final String accountId;

  /// ISO 4217 alphabetic code, exactly as sent. A denomination, never a value:
  /// no arithmetic is possible over it and none is attempted.
  final String currencyCode;

  @override
  bool operator ==(Object other) =>
      other is MatchSide &&
      other.transactionId == transactionId &&
      other.accountId == accountId &&
      other.currencyCode == currencyCode;

  @override
  int get hashCode => Object.hash(transactionId, accountId, currencyCode);

  /// Carries no identifier. A transaction reference in a log line is financial
  /// structure leaving through a diagnostic sink.
  @override
  String toString() => 'MatchSide()';
}

/// One proposed or decided relationship between two of the caller's own
/// transactions.
@immutable
final class TransferMatch {
  const TransferMatch({
    required this.matchId,
    required this.outflow,
    required this.inflow,
    required this.state,
    required this.authoritative,
    required this.suggestionBasis,
    required this.suggestionWindow,
    required this.subjectDecidedAt,
    required this.firstSuggestedAt,
    required this.createdAt,
    required this.updatedAt,
    required this.version,
  });

  final String matchId;

  /// The side money left.
  final MatchSide outflow;

  /// The side money arrived on.
  final MatchSide inflow;

  final MatchState state;

  /// THE PLATFORM'S OWN ANSWER to "does this count". True only for
  /// [MatchState.confirmed].
  ///
  /// Read rather than derived. The contract emits it precisely so a client
  /// renders the distinction instead of deciding for itself whether a
  /// suggestion counts — and the mapper refuses a response in which the two
  /// disagree, rather than picking whichever one it prefers.
  final bool authoritative;

  final SuggestionBasis suggestionBasis;

  /// The VERSION LABEL of the rule that produced the suggestion, e.g.
  /// `equal-and-opposite/same-currency/P3D/v1`.
  ///
  /// Kept verbatim and shown, so a person can tell later which rule looked at
  /// their data. It is deliberately not parsed into a number of days: widening
  /// the window later must not silently reinterpret a question somebody has
  /// already answered.
  final String suggestionWindow;

  /// When the person decided. Null while they have not.
  final DateTime? subjectDecidedAt;

  final DateTime firstSuggestedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// The optimistic-concurrency token, and the ONLY number on this type.
  final int version;

  /// Whether the person has answered the question this pair asks.
  bool get awaitsDecision => state == MatchState.suggested;

  /// Whether the two sides name two different currencies.
  ///
  /// The platform cannot produce one: `transfer_matches_same_currency_only`
  /// makes it unwritable, and no source-stated FX relationship exists anywhere
  /// in this platform. So this is a DRIFT DETECTOR rather than an ordinary
  /// case — and the surface states the refusal instead of relating the two
  /// amounts, because relating them would require a rate this platform does not
  /// have and must not invent.
  bool get spansTwoCurrencies => outflow.currencyCode != inflow.currencyCode;

  /// Whether a person may still answer "yes, one movement" to this pair.
  ///
  /// False for a decided pair, false for a state this build cannot read, and
  /// false across two currencies. Every screen asks this rather than testing
  /// the state itself, so the cross-currency refusal cannot be forgotten at one
  /// of the call sites.
  bool get isConfirmable => state == MatchState.suggested && !spansTwoCurrencies;

  /// Whether a person may still answer "no, these are separate" — which from
  /// [MatchState.confirmed] is how a confirmation is WITHDRAWN. There is no
  /// un-confirm verb, in the contract or here.
  bool get isRejectable =>
      state == MatchState.suggested || state == MatchState.confirmed;

  /// Whether rejecting this pair would withdraw a decision the person made,
  /// rather than answer a question they have not.
  bool get rejectionWouldWithdrawConfirmation => state == MatchState.confirmed;

  @override
  bool operator ==(Object other) =>
      other is TransferMatch &&
      other.matchId == matchId &&
      other.outflow == outflow &&
      other.inflow == inflow &&
      other.state == state &&
      other.authoritative == authoritative &&
      other.suggestionBasis == suggestionBasis &&
      other.suggestionWindow == suggestionWindow &&
      other.subjectDecidedAt == subjectDecidedAt &&
      other.version == version;

  @override
  int get hashCode => Object.hash(
        matchId,
        outflow,
        inflow,
        state,
        authoritative,
        suggestionBasis,
        suggestionWindow,
        subjectDecidedAt,
        version,
      );

  /// Names nothing. Not the pair, not the accounts, not the state.
  @override
  String toString() => 'TransferMatch()';
}
