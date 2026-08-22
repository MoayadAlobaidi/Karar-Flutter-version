// THE HARNESS FOR THE TRANSFER-MATCHING SUITE.
//
// Both repositories are scripted doubles, so every step above the ports runs
// for real: the use cases, the listing controller, the optimistic progress
// marker, the labels and the widgets.
//
// TWO THINGS THIS HARNESS IS BUILT TO MAKE PROVABLE:
//
//   * WHAT WAS SENT. `confirmations` and `rejections` record every write, so a
//     test can assert that a surface which merely RENDERED a proposal issued
//     none — which is the whole of "a confirmation the person did not make
//     never happens";
//   * WHEN IT WAS SENT. `gate` holds a write open until a test releases it, so
//     the in-flight state can be inspected rather than inferred. Without it the
//     optimistic update and its reversal both happen inside one `await` and
//     nothing can tell them apart.
import 'dart:async';

import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/money.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/domain/transactions_repository.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_match.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_matches_repository.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_matching_providers.dart';

import '../../financial_accounts/support/financial_fixtures.dart';
import '../../financial_accounts/support/financial_harness.dart';

export 'package:flutter_riverpod/misc.dart' show Override;

const String outflowAccountId = 'account-0001';
const String inflowAccountId = 'account-0003';
const String outflowTransactionId = 'transaction-out-0001';
const String inflowTransactionId = 'transaction-in-0001';
const String matchFixtureId = 'match-0001';

/// The window label the platform actually ships, so a test asserting it is
/// asserting the shipped rule rather than a string invented here.
const String shippedWindowLabel = 'equal-and-opposite/same-currency/P3D/v1';

/// One relationship.
///
/// The defaults describe a consistent SUGGESTED row: not authoritative, no
/// decision instant. A test that wants a contradiction has to ask for one,
/// which is what makes the contradiction tests honest.
TransferMatch matchFixture({
  String matchId = matchFixtureId,
  MatchState state = MatchState.suggested,
  bool? authoritative,
  DateTime? subjectDecidedAt,
  String outflowCurrency = 'QAR',
  String inflowCurrency = 'QAR',
  SuggestionBasis basis = SuggestionBasis.equalAndOppositeSameCurrencyWithinWindow,
  String suggestionWindow = shippedWindowLabel,
  int version = 1,
}) => TransferMatch(
  matchId: matchId,
  outflow: MatchSide(
    transactionId: outflowTransactionId,
    accountId: outflowAccountId,
    currencyCode: outflowCurrency,
  ),
  inflow: MatchSide(
    transactionId: inflowTransactionId,
    accountId: inflowAccountId,
    currencyCode: inflowCurrency,
  ),
  state: state,
  authoritative: authoritative ?? (state == MatchState.confirmed),
  suggestionBasis: basis,
  suggestionWindow: suggestionWindow,
  subjectDecidedAt:
      subjectDecidedAt ?? (state == MatchState.suggested ? null : DateTime.utc(2026, 4, 5, 9)),
  firstSuggestedAt: DateTime.utc(2026, 4, 4, 8),
  createdAt: DateTime.utc(2026, 4, 4, 8),
  updatedAt: DateTime.utc(2026, 4, 4, 8),
  version: version,
);

/// One write this repository was asked to perform.
final class RecordedDecision {
  const RecordedDecision(this.matchId, this.expectedVersion);

  final String matchId;
  final int expectedVersion;

  @override
  String toString() => 'RecordedDecision($matchId, $expectedVersion)';
}

/// Transfer matches, driven by a script.
final class ScriptedTransferMatchesRepository implements TransferMatchesRepository {
  ScriptedTransferMatchesRepository({
    this.matches = const <TransferMatch>[],
    this.listFailure,
    this.confirmResult,
    this.rejectResult,
    this.hasMore = false,
  });

  List<TransferMatch> matches;
  Failure? listFailure;
  Result<TransferMatch>? confirmResult;
  Result<TransferMatch>? rejectResult;
  bool hasMore;

  /// Held open while non-null, so a test can inspect the in-flight state.
  Completer<void>? gate;

  final List<MatchStateFilter?> requestedStates = <MatchStateFilter?>[];
  final List<String?> requestedCursors = <String?>[];
  final List<RecordedDecision> confirmations = <RecordedDecision>[];
  final List<RecordedDecision> rejections = <RecordedDecision>[];

  /// Every call, in order, so a test can assert a surface issued only reads.
  final List<String> calls = <String>[];

  @override
  Future<Result<TransferMatchPage>> listOwn({
    MatchStateFilter? state,
    int? limit,
    String? cursor,
  }) async {
    calls.add('list');
    requestedStates.add(state);
    requestedCursors.add(cursor);
    final failure = listFailure;
    if (failure != null) {
      return Failed<TransferMatchPage>(failure);
    }
    return Success<TransferMatchPage>(
      TransferMatchPage(
        items: matches,
        hasMore: hasMore,
        nextCursor: hasMore ? 'cursor-next' : null,
      ),
    );
  }

  @override
  Future<Result<TransferMatch>> confirm({
    required String matchId,
    required int expectedVersion,
  }) async {
    calls.add('confirm');
    confirmations.add(RecordedDecision(matchId, expectedVersion));
    await gate?.future;
    return confirmResult ??
        Success<TransferMatch>(
          matchFixture(matchId: matchId, state: MatchState.confirmed, version: 2),
        );
  }

  @override
  Future<Result<TransferMatch>> reject({
    required String matchId,
    required int expectedVersion,
  }) async {
    calls.add('reject');
    rejections.add(RecordedDecision(matchId, expectedVersion));
    await gate?.future;
    return rejectResult ??
        Success<TransferMatch>(
          matchFixture(matchId: matchId, state: MatchState.rejected, version: 2),
        );
  }
}

/// The two transactions a pair relates, scripted PER IDENTIFIER.
///
/// Per identifier rather than one answer for every read, because the whole
/// point of the evidence panel is that the two sides are two different
/// movements — a double that answered the same thing twice would let a screen
/// that rendered one side twice pass.
final class ScriptedMovementsRepository implements TransactionsRepository {
  ScriptedMovementsRepository({
    Map<String, TransactionDetail>? details,
    this.unreadable = const <String>{},
  }) : details = details ?? <String, TransactionDetail>{};

  final Map<String, TransactionDetail> details;

  /// Identifiers whose read fails, so "answer only when you can see both" can
  /// be proved rather than asserted.
  Set<String> unreadable;

  final List<String> reads = <String>[];

  @override
  Future<Result<TransactionDetail>> read(String transactionId) async {
    reads.add(transactionId);
    if (unreadable.contains(transactionId)) {
      return const Failed<TransactionDetail>(DependencyUnavailableFailure());
    }
    final held = details[transactionId];
    if (held == null) {
      return const Failed<TransactionDetail>(NotFoundFailure());
    }
    return Success<TransactionDetail>(held);
  }

  @override
  Future<Result<Page<Transaction>>> listOwn({
    TransactionFilter filter = const TransactionFilter(),
    int? limit,
    String? cursor,
  }) async => Success<Page<Transaction>>(onePage<Transaction>(const <Transaction>[]));

  @override
  Future<Result<Transaction>> createManual(ManualTransactionDraft draft) async =>
      const Failed<Transaction>(DependencyUnavailableFailure());

  @override
  Future<Result<Transaction>> correct(
    String transactionId,
    TransactionCorrection correction,
  ) async => const Failed<Transaction>(DependencyUnavailableFailure());

  @override
  Future<Result<CategoryAssignment>> assignCategory(
    String transactionId,
    String categoryCode,
  ) async => const Failed<CategoryAssignment>(DependencyUnavailableFailure());

  @override
  Future<Result<List<TransactionProvenance>>> listProvenance(String transactionId) async =>
      const Success<List<TransactionProvenance>>(<TransactionProvenance>[]);

  @override
  Future<Result<TransactionDeletionOutcome>> delete(String transactionId) async =>
      const Failed<TransactionDeletionOutcome>(DependencyUnavailableFailure());
}

/// The two movements of the fixture pair: equal and opposite, one currency.
///
/// `-25000` and `25000` are the SAME magnitude with opposite signs, which is
/// what the platform's rule means. They are supplied as exact minor-unit
/// strings and nothing in the client adds, negates or converts them.
ScriptedMovementsRepository movementsFixture({
  String outflowMinorUnits = '-25000',
  String inflowMinorUnits = '25000',
  String outflowCurrency = 'QAR',
  String inflowCurrency = 'QAR',
  Set<String> unreadable = const <String>{},
}) => ScriptedMovementsRepository(
  details: <String, TransactionDetail>{
    outflowTransactionId: transactionDetail(
      held: transaction(
        transactionId: outflowTransactionId,
        accountId: outflowAccountId,
        amount: money(outflowMinorUnits, currency: outflowCurrency),
        direction: MoneyDirection.moneyOut,
        description: 'Top-up sent',
      ),
    ),
    inflowTransactionId: transactionDetail(
      held: transaction(
        transactionId: inflowTransactionId,
        accountId: inflowAccountId,
        amount: money(inflowMinorUnits, currency: inflowCurrency),
        direction: MoneyDirection.moneyIn,
        description: 'Top-up received',
      ),
    ),
  },
  unreadable: unreadable,
);

/// The portfolio the two sides sit on, so the accounts are NAMED rather than
/// rendered as identifiers.
ScriptedAccountsRepository accountsFixture() => ScriptedAccountsRepository(
  accounts: <FinancialAccount>[
    account(accountId: outflowAccountId, displayName: 'Everyday account'),
    account(accountId: inflowAccountId, displayName: 'Travel wallet'),
  ],
);

/// The overrides a transfer-matching test installs.
List<Override> transferMatchingOverrides({
  ScriptedTransferMatchesRepository? matches,
  ScriptedMovementsRepository? movements,
  ScriptedAccountsRepository? accounts,
}) => <Override>[
  ...financialOverrides(accounts: accounts ?? accountsFixture()),
  transferMatchesRepositoryProvider.overrideWithValue(
    matches ?? ScriptedTransferMatchesRepository(),
  ),
  if (movements != null) transactionsRepositoryProvider.overrideWithValue(movements),
];
