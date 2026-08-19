// Providers for the transaction surface.
//
// The listing accumulates PAGES rather than reloading: the platform's cursor
// encodes a position in the caller's own result set, and a client that reset
// to the first page whenever anything changed would show a person the wrong
// month and tell them nothing about why.
//
// Everything here is tenant-scoped and is registered as such at composition
// time. Every asynchronous read is a [TenantScopedAsyncNotifier] rather than a
// `FutureProvider`: only a notifier can EMPTY itself, and `ref.invalidate`
// reloads rather than empties — see `app/lifecycle/tenant_data_scope.dart`.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show AsyncNotifierProviderFamily;

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../financial_accounts/domain/page.dart';
import '../data/api_transactions_repository.dart';
import '../domain/transaction.dart';
import '../domain/transaction_detail.dart';
import '../domain/transactions_repository.dart';

final Provider<TransactionsRepository> transactionsRepositoryProvider =
    Provider<TransactionsRepository>(
  (Ref ref) => ApiTransactionsRepository(ref.watch(apiClientProvider)),
);

final Provider<LoadTransactionPage> loadTransactionPageProvider =
    Provider<LoadTransactionPage>(
  (Ref ref) => LoadTransactionPage(ref.watch(transactionsRepositoryProvider)),
);

final Provider<LoadTransactionDetail> loadTransactionDetailProvider =
    Provider<LoadTransactionDetail>(
  (Ref ref) => LoadTransactionDetail(ref.watch(transactionsRepositoryProvider)),
);

final Provider<LoadTransactionProvenance> loadTransactionProvenanceProvider =
    Provider<LoadTransactionProvenance>(
  (Ref ref) => LoadTransactionProvenance(ref.watch(transactionsRepositoryProvider)),
);

final Provider<RecordManualTransaction> recordManualTransactionProvider =
    Provider<RecordManualTransaction>(
  (Ref ref) => RecordManualTransaction(ref.watch(transactionsRepositoryProvider)),
);

final Provider<CorrectTransaction> correctTransactionProvider =
    Provider<CorrectTransaction>(
  (Ref ref) => CorrectTransaction(ref.watch(transactionsRepositoryProvider)),
);

final Provider<AssignTransactionCategory> assignTransactionCategoryProvider =
    Provider<AssignTransactionCategory>(
  (Ref ref) => AssignTransactionCategory(ref.watch(transactionsRepositoryProvider)),
);

final Provider<DeleteTransaction> deleteTransactionProvider =
    Provider<DeleteTransaction>(
  (Ref ref) => DeleteTransaction(ref.watch(transactionsRepositoryProvider)),
);

/// The filter the listing is currently narrowed by.
final class TransactionFilterController extends Notifier<TransactionFilter> {
  @override
  TransactionFilter build() => const TransactionFilter();

  void apply(TransactionFilter filter) => state = filter;

  void clear() => state = const TransactionFilter();
}

final NotifierProvider<TransactionFilterController, TransactionFilter>
    transactionFilterProvider =
    NotifierProvider<TransactionFilterController, TransactionFilter>(
  TransactionFilterController.new,
);

/// What the listing screen renders.
sealed class TransactionListing {
  const TransactionListing();
}

final class TransactionsLoaded extends TransactionListing {
  const TransactionsLoaded({
    required this.transactions,
    required this.hasMore,
    required this.isLoadingMore,
    required this.filtered,
  });

  final List<Transaction> transactions;

  /// The STORE's own answer, echoed. Never derived from the number of rows on
  /// screen: the platform applies most filters after the keyset query, so a
  /// short page can still have a successor.
  final bool hasMore;

  final bool isLoadingMore;

  /// Whether any filter is narrowing the listing, so an empty result can say
  /// which kind of empty it is.
  final bool filtered;
}

final class TransactionsUnavailable extends TransactionListing {
  const TransactionsUnavailable(this.failure);

  final Failure failure;
}

/// Accumulates the pages of the listing.
final class TransactionListingController
    extends TenantScopedAsyncNotifier<TransactionListing> {
  String? _nextCursor;

  /// No organisation's transactions are held. Not an empty page: an empty page
  /// is a claim that the organisation has no transactions in range.
  @override
  TransactionListing get discarded =>
      const TransactionsUnavailable(SessionChangedFailure());

  @override
  Future<TransactionListing> load() async {
    final filter = ref.watch(transactionFilterProvider);
    _nextCursor = null;
    final result = await ref.watch(loadTransactionPageProvider)(filter: filter);
    return switch (result) {
      Failed<Page<Transaction>>(:final failure) => TransactionsUnavailable(failure),
      Success<Page<Transaction>>(:final value) => _accumulate(
          <Transaction>[],
          value,
          filter: filter,
        ),
    };
  }

  /// Follows the platform's own cursor. Stops only when it says there is no
  /// next page.
  Future<void> loadMore() async {
    final current = state.value;
    if (current is! TransactionsLoaded || !current.hasMore || current.isLoadingMore) {
      return;
    }
    final cursor = _nextCursor;
    if (cursor == null) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = AsyncData<TransactionListing>(
      TransactionsLoaded(
        transactions: current.transactions,
        hasMore: current.hasMore,
        isLoadingMore: true,
        filtered: current.filtered,
      ),
    );
    final filter = ref.read(transactionFilterProvider);
    final result =
        await ref.read(loadTransactionPageProvider)(filter: filter, cursor: cursor);
    if (issued.hasEnded) {
      // The page was asked for under an organisation the session has left. It
      // would be APPENDED to whatever the new organisation has loaded, which is
      // one listing holding two organisations' transactions.
      return;
    }
    state = AsyncData<TransactionListing>(
      switch (result) {
        Failed<Page<Transaction>>(:final failure) => TransactionsUnavailable(failure),
        Success<Page<Transaction>>(:final value) =>
          _accumulate(current.transactions, value, filter: filter),
      },
    );
  }

  Future<void> refresh() async {
    final TenantDataGeneration issued = binding;
    state = const AsyncLoading<TransactionListing>();
    final AsyncValue<TransactionListing> answer =
        await AsyncValue.guard<TransactionListing>(load);
    if (issued.hasEnded) {
      // Riverpod reuses this notifier across an invalidation, so `ref.mounted`
      // is still true for an element that has already been discarded and
      // rebuilt. Without this the previous organisation's transactions replace
      // the new organisation's in the state its screens read.
      return;
    }
    state = answer;
  }

  TransactionsLoaded _accumulate(
    List<Transaction> existing,
    Page<Transaction> page, {
    required TransactionFilter filter,
  }) {
    _nextCursor = page.cursor.nextCursor;
    return TransactionsLoaded(
      transactions: List<Transaction>.unmodifiable(<Transaction>[
        ...existing,
        ...page.items,
      ]),
      hasMore: page.cursor.hasMore && page.cursor.nextCursor != null,
      isLoadingMore: false,
      filtered: !filter.isEmpty,
    );
  }
}

final AsyncNotifierProvider<TransactionListingController, TransactionListing>
    transactionListingProvider =
    AsyncNotifierProvider<TransactionListingController, TransactionListing>(
  TransactionListingController.new,
);

/// The most recent transactions on one account, for the account detail screen.
final class AccountRecentTransactionsController
    extends TenantScopedAsyncNotifier<List<Transaction>> {
  AccountRecentTransactionsController(this.accountId);

  final String accountId;

  @override
  List<Transaction> get discarded => const <Transaction>[];

  @override
  Future<List<Transaction>> load() async {
    final result = await ref.watch(loadTransactionPageProvider)(
      filter: TransactionFilter(accountId: accountId),
    );
    return switch (result) {
      Success<Page<Transaction>>(:final value) => value.items,
      Failed<Page<Transaction>>() => const <Transaction>[],
    };
  }
}

final AsyncNotifierProviderFamily<AccountRecentTransactionsController,
        List<Transaction>, String> accountRecentTransactionsProvider =
    AsyncNotifierProvider.family<AccountRecentTransactionsController,
        List<Transaction>, String>(
  AccountRecentTransactionsController.new,
);

/// One transaction with its history, its active category and the divergence
/// the platform stated.
///
/// Nullable so that "no organisation's transaction is held here" is a value the
/// provider can be written to hold; writing a fresh `AsyncData` is the only
/// thing that erases a cached answer.
final class TransactionDetailController
    extends TenantScopedAsyncNotifier<TransactionDetail?> {
  TransactionDetailController(this.transactionId);

  final String transactionId;

  @override
  TransactionDetail? get discarded => null;

  @override
  Future<TransactionDetail?> load() async {
    final result = await ref.watch(loadTransactionDetailProvider)(transactionId);
    return switch (result) {
      Success<TransactionDetail>(:final value) => value,
      Failed<TransactionDetail>(:final failure) => throw TransactionReadFailure(failure),
    };
  }
}

final AsyncNotifierProviderFamily<TransactionDetailController, TransactionDetail?,
        String> transactionDetailProvider =
    AsyncNotifierProvider.family<TransactionDetailController, TransactionDetail?,
        String>(
  TransactionDetailController.new,
);

/// The safe provenance of one transaction.
final class TransactionProvenanceController
    extends TenantScopedAsyncNotifier<List<TransactionProvenance>> {
  TransactionProvenanceController(this.transactionId);

  final String transactionId;

  @override
  List<TransactionProvenance> get discarded => const <TransactionProvenance>[];

  @override
  Future<List<TransactionProvenance>> load() async {
    final result = await ref.watch(loadTransactionProvenanceProvider)(transactionId);
    return switch (result) {
      Success<List<TransactionProvenance>>(:final value) => value,
      Failed<List<TransactionProvenance>>(:final failure) =>
        throw TransactionReadFailure(failure),
    };
  }
}

final AsyncNotifierProviderFamily<TransactionProvenanceController,
        List<TransactionProvenance>, String> transactionProvenanceProvider =
    AsyncNotifierProvider.family<TransactionProvenanceController,
        List<TransactionProvenance>, String>(
  TransactionProvenanceController.new,
);

/// Carries a typed failure through `AsyncValue.error`.
final class TransactionReadFailure implements Exception {
  const TransactionReadFailure(this.failure);

  final Failure failure;

  /// Names the failure type only: a transaction reference has no place in a
  /// crash dump.
  @override
  String toString() => 'TransactionReadFailure(${failure.diagnosticLabel})';
}

/// The state of one transaction write — create, correct, categorise or delete.
sealed class TransactionWriteState {
  const TransactionWriteState();
}

final class TransactionWriteIdle extends TransactionWriteState {
  const TransactionWriteIdle();
}

final class TransactionWriteSubmitting extends TransactionWriteState {
  const TransactionWriteSubmitting();
}

final class TransactionWriteSaved extends TransactionWriteState {
  const TransactionWriteSaved(this.transaction);

  final Transaction transaction;
}

final class TransactionCategorySaved extends TransactionWriteState {
  const TransactionCategorySaved(this.assignment);

  final CategoryAssignment assignment;
}

/// The delete finished, in full or in part. `outcome.applied` is false for a
/// partial application, so a screen cannot report a clean delete for one.
final class TransactionDeleteSettled extends TransactionWriteState {
  const TransactionDeleteSettled(this.outcome);

  final TransactionDeletionOutcome outcome;
}

final class TransactionWriteRejected extends TransactionWriteState {
  const TransactionWriteRejected(this.failure);

  final Failure failure;

  List<String> get violatedFields {
    final held = failure;
    return held is InvalidRequestFailure ? held.fields : const <String>[];
  }

  bool get isVersionConflict => failure is ConflictFailure;

  bool get isNoChange => failure.code == transactionNoChangeCode;

  /// A person's own category choice already stands and was not replaced.
  bool get isUserAssignmentWins => failure.code == 'USER_ASSIGNMENT_WINS';

  bool get isCategoryUnknown => failure.code == 'CATEGORY_UNKNOWN';
}

/// Sequences one transaction write.
///
/// EVERY WRITE THAT FOLLOWS AN `await` IS GUARDED. Riverpod reuses this
/// notifier instance across an invalidation — only `build` re-runs — so
/// `ref.mounted` is still true after the tenant-scoped discard, and an
/// unguarded `state = …` reports a write confirmed under the PREVIOUS
/// organisation as this organisation's, and refreshes this organisation's
/// listings on the strength of it.
final class TransactionWriteController extends Notifier<TransactionWriteState> {
  @override
  TransactionWriteState build() => const TransactionWriteIdle();

  /// The binding this controller is currently acting for.
  TenantDataGeneration get binding => ref.tenantBinding();

  Future<void> create(ManualTransactionDraft draft) async {
    if (state is TransactionWriteSubmitting) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = const TransactionWriteSubmitting();
    final result = await ref.read(recordManualTransactionProvider)(draft);
    if (issued.hasEnded) {
      return;
    }
    switch (result) {
      case Failed<Transaction>(:final failure):
        state = TransactionWriteRejected(failure);
      case Success<Transaction>(:final value):
        state = TransactionWriteSaved(value);
        await _refreshListings(value.accountId);
    }
  }

  Future<void> correct(
    String transactionId,
    TransactionCorrection correction,
  ) async {
    if (state is TransactionWriteSubmitting) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = const TransactionWriteSubmitting();
    final result = await ref.read(correctTransactionProvider)(transactionId, correction);
    if (issued.hasEnded) {
      return;
    }
    switch (result) {
      case Failed<Transaction>(:final failure):
        state = TransactionWriteRejected(failure);
      case Success<Transaction>(:final value):
        state = TransactionWriteSaved(value);
        ref.invalidate(transactionDetailProvider(transactionId));
        ref.invalidate(transactionProvenanceProvider(transactionId));
        await _refreshListings(value.accountId);
    }
  }

  Future<void> assignCategory(String transactionId, String categoryCode) async {
    if (state is TransactionWriteSubmitting) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = const TransactionWriteSubmitting();
    final result =
        await ref.read(assignTransactionCategoryProvider)(transactionId, categoryCode);
    if (issued.hasEnded) {
      return;
    }
    switch (result) {
      case Failed<CategoryAssignment>(:final failure):
        state = TransactionWriteRejected(failure);
      case Success<CategoryAssignment>(:final value):
        state = TransactionCategorySaved(value);
        ref.invalidate(transactionDetailProvider(transactionId));
    }
  }

  Future<void> delete(String transactionId, {required String accountId}) async {
    if (state is TransactionWriteSubmitting) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = const TransactionWriteSubmitting();
    final result = await ref.read(deleteTransactionProvider)(transactionId);
    if (issued.hasEnded) {
      return;
    }
    switch (result) {
      case Failed<TransactionDeletionOutcome>(:final failure):
        state = TransactionWriteRejected(failure);
      case Success<TransactionDeletionOutcome>(:final value):
        state = TransactionDeleteSettled(value);
        await _refreshListings(accountId);
    }
  }

  void reset() => state = const TransactionWriteIdle();

  Future<void> _refreshListings(String accountId) async {
    ref.invalidate(accountRecentTransactionsProvider(accountId));
    await ref.read(transactionListingProvider.notifier).refresh();
  }
}

final NotifierProvider<TransactionWriteController, TransactionWriteState>
    transactionWriteControllerProvider =
    NotifierProvider<TransactionWriteController, TransactionWriteState>(
  TransactionWriteController.new,
);
