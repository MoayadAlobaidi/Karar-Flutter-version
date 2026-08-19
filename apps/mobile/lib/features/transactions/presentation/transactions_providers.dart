// Providers for the transaction surface.
//
// The listing accumulates PAGES rather than reloading: the platform's cursor
// encodes a position in the caller's own result set, and a client that reset
// to the first page whenever anything changed would show a person the wrong
// month and tell them nothing about why.
//
// Everything here is tenant-scoped and is registered as such at composition
// time.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
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
final class TransactionListingController extends AsyncNotifier<TransactionListing> {
  String? _nextCursor;

  @override
  Future<TransactionListing> build() async {
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
    state = AsyncData<TransactionListing>(
      switch (result) {
        Failed<Page<Transaction>>(:final failure) => TransactionsUnavailable(failure),
        Success<Page<Transaction>>(:final value) =>
          _accumulate(current.transactions, value, filter: filter),
      },
    );
  }

  Future<void> refresh() async {
    state = const AsyncLoading<TransactionListing>();
    state = await AsyncValue.guard<TransactionListing>(build);
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
final accountRecentTransactionsProvider =
    FutureProvider.family<List<Transaction>, String>(
  (Ref ref, String accountId) async {
    final result = await ref.watch(loadTransactionPageProvider)(
      filter: TransactionFilter(accountId: accountId),
    );
    return switch (result) {
      Success<Page<Transaction>>(:final value) => value.items,
      Failed<Page<Transaction>>() => const <Transaction>[],
    };
  },
);

/// One transaction with its history, its active category and the divergence
/// the platform stated.
final transactionDetailProvider =
    FutureProvider.family<TransactionDetail, String>(
  (Ref ref, String transactionId) async {
    final result = await ref.watch(loadTransactionDetailProvider)(transactionId);
    return switch (result) {
      Success<TransactionDetail>(:final value) => value,
      Failed<TransactionDetail>(:final failure) => throw TransactionReadFailure(failure),
    };
  },
);

/// The safe provenance of one transaction.
final transactionProvenanceProvider =
    FutureProvider.family<List<TransactionProvenance>, String>(
  (Ref ref, String transactionId) async {
    final result = await ref.watch(loadTransactionProvenanceProvider)(transactionId);
    return switch (result) {
      Success<List<TransactionProvenance>>(:final value) => value,
      Failed<List<TransactionProvenance>>(:final failure) =>
        throw TransactionReadFailure(failure),
    };
  },
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
final class TransactionWriteController extends Notifier<TransactionWriteState> {
  @override
  TransactionWriteState build() => const TransactionWriteIdle();

  Future<void> create(ManualTransactionDraft draft) async {
    if (state is TransactionWriteSubmitting) {
      return;
    }
    state = const TransactionWriteSubmitting();
    final result = await ref.read(recordManualTransactionProvider)(draft);
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
    state = const TransactionWriteSubmitting();
    final result = await ref.read(correctTransactionProvider)(transactionId, correction);
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
    state = const TransactionWriteSubmitting();
    final result =
        await ref.read(assignTransactionCategoryProvider)(transactionId, categoryCode);
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
    state = const TransactionWriteSubmitting();
    final result = await ref.read(deleteTransactionProvider)(transactionId);
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
