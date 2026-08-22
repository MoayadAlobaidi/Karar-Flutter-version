// PURE DART ONLY. See lib/README.md — domain purity.
//
// THE PORT, AND THE THREE THINGS A PERSON CAN DO.
//
// There is deliberately NO SUGGEST OPERATION. Suggestion is produced by the
// platform from the subject's own transactions; a client-driven "match these
// two" would let a person assert a relationship the equal-and-opposite rule
// refuses, and the contract does not offer one. A port method that does not
// exist cannot be called by mistake.
//
// There is deliberately NO UN-CONFIRM either. Withdrawing a confirmation is
// [RejectTransferMatch] from `CONFIRMED`, which is what the contract states and
// what the database enforces. A second verb pretending otherwise would be a
// second name for one transition, and the two would drift.
//
// EVERY WRITE CARRIES `expectedVersion`. A blind confirmation is a decision
// recorded about whatever the pair happens to be now rather than about the pair
// the person was shown, and this platform's answer to that is a 409 the caller
// must handle rather than an overwrite nobody sees.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import 'transfer_match.dart';

/// Which decisions to read. `null` means every state.
///
/// A separate type from [MatchState] because a filter is not a state: the
/// absence of a filter is a real choice here and is not a member of the
/// vocabulary the contract declares.
enum MatchStateFilter {
  /// The questions still waiting for the person.
  awaitingDecision,

  /// What the person has actually agreed.
  confirmed,

  /// What they turned down, including confirmations they withdrew.
  rejected;

  /// The state this filter narrows to.
  MatchState get state => switch (this) {
        MatchStateFilter.awaitingDecision => MatchState.suggested,
        MatchStateFilter.confirmed => MatchState.confirmed,
        MatchStateFilter.rejected => MatchState.rejected,
      };
}

/// The caller's own transfer matches.
abstract interface class TransferMatchesRepository {
  /// One page of the caller's own matches, newest suggestion first.
  Future<Result<TransferMatchPage>> listOwn({
    MatchStateFilter? state,
    int? limit,
    String? cursor,
  });

  /// The person's own decision that two of their transactions were one
  /// movement of their money. Idempotent on the platform: confirming an
  /// already-confirmed match answers with the current row.
  Future<Result<TransferMatch>> confirm({
    required String matchId,
    required int expectedVersion,
  });

  /// The person's refusal — or, from `CONFIRMED`, the withdrawal of a decision
  /// they made. Terminal either way: the row is KEPT so the pair is not
  /// proposed again, and it can never be confirmed afterwards.
  Future<Result<TransferMatch>> reject({
    required String matchId,
    required int expectedVersion,
  });
}

/// One page of matches with the platform's own cursor.
///
/// A page type of its own rather than the financial `Page<T>`: this surface
/// carries no amounts, and reusing a type from the money-bearing feature would
/// invite somebody to hang a total off it later.
final class TransferMatchPage {
  const TransferMatchPage({
    required this.items,
    required this.hasMore,
    required this.nextCursor,
  });

  final List<TransferMatch> items;

  /// The STORE's own answer, echoed. Never derived from how many rows came
  /// back: a short page can still have a successor.
  final bool hasMore;

  final String? nextCursor;

  @override
  String toString() => 'TransferMatchPage()';
}

/// Reads one page of the caller's own matches.
final class LoadTransferMatchPage {
  const LoadTransferMatchPage(this._repository, {this.pageLimit = 50});

  final TransferMatchesRepository _repository;
  final int pageLimit;

  Future<Result<TransferMatchPage>> call({
    MatchStateFilter? state,
    String? cursor,
  }) =>
      _repository.listOwn(state: state, limit: pageLimit, cursor: cursor);
}

/// Records the person's confirmation.
///
/// The guard is here rather than only in the widget tree. A confirmation is the
/// one thing that makes a match authoritative, so the rules about when it may
/// be asked for belong where every caller passes, not on the screen that
/// happens to have a button today.
final class ConfirmTransferMatch {
  const ConfirmTransferMatch(this._repository);

  final TransferMatchesRepository _repository;

  Future<Result<TransferMatch>> call(TransferMatch match) {
    if (!match.isConfirmable) {
      return Future<Result<TransferMatch>>.value(
        Failed<TransferMatch>(refusalFor(match)),
      );
    }
    return _repository.confirm(
      matchId: match.matchId,
      expectedVersion: match.version,
    );
  }
}

/// Records the person's refusal, or withdraws their confirmation.
final class RejectTransferMatch {
  const RejectTransferMatch(this._repository);

  final TransferMatchesRepository _repository;

  Future<Result<TransferMatch>> call(TransferMatch match) {
    if (!match.isRejectable) {
      return Future<Result<TransferMatch>>.value(
        const Failed<TransferMatch>(
          InvalidRequestFailure(code: transferMatchTransitionUnavailableCode),
        ),
      );
    }
    return _repository.reject(
      matchId: match.matchId,
      expectedVersion: match.version,
    );
  }
}

/// Why this client refuses to ask for a confirmation, without sending.
///
/// The cross-currency arm is the one that matters. The platform cannot hold a
/// cross-currency match and holds no exchange rate; a client that sent the
/// request anyway would be asking the platform to relate two amounts it has no
/// way to relate, and the person would read the resulting error as a fault of
/// their own.
Failure refusalFor(TransferMatch match) {
  if (match.spansTwoCurrencies) {
    return const InvalidRequestFailure(code: transferMatchCrossCurrencyCode);
  }
  return const InvalidRequestFailure(code: transferMatchTransitionUnavailableCode);
}

/// This CLIENT'S own code for a pair it will not offer to confirm because the
/// two sides name two currencies. Not a platform code: the platform cannot
/// produce the situation, so it has no name for it.
const String transferMatchCrossCurrencyCode = 'CLIENT_CROSS_CURRENCY_PAIR';

/// This client's own code for an answer that is not available from the state
/// the pair is in.
const String transferMatchTransitionUnavailableCode =
    'CLIENT_TRANSITION_UNAVAILABLE';

/// The platform's own codes, read structurally and never by message text.
const String transferMatchNotFoundCode = 'TRANSFER_MATCH_NOT_FOUND';
const String transferMatchVersionConflictCode = 'TRANSFER_MATCH_VERSION_CONFLICT';
const String transferMatchRuleViolatedCode = 'TRANSFER_MATCH_RULE_VIOLATED';
