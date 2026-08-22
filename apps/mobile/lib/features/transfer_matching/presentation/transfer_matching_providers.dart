// PROVIDERS FOR THE TRANSFER-MATCHING SURFACE.
//
// A match is a relationship between two of ONE organisation's transactions, so
// everything cached here belongs to one organisation and every entry is
// registered as tenant-scoped at composition time. Each asynchronous read is a
// [TenantScopedAsyncNotifier] rather than a `FutureProvider`: only a notifier
// can EMPTY itself, and `ref.invalidate` RELOADS — it leaves the previous
// organisation's answer readable for the whole reload window. See
// `app/lifecycle/tenant_data_scope.dart`.
//
// ## The optimistic update is a PROGRESS marker, never a state change
//
// Tapping "yes, one movement" must feel immediate, and it must not tell a
// person something the platform has not said. So the in-flight update writes
// only [TransferMatchRow.progress]; [TransferMatchRow.match] — the thing the
// badge, the wording and the available actions are all derived from — is
// replaced ONLY by the row the platform answers with.
//
// Two consequences, and both are the point:
//
//   * a write that fails leaves NOTHING behind. The progress marker returns to
//     idle, the refusal is attached to that row, and the pair still reads
//     "waiting for you" — because it still is;
//   * a suggestion is never rendered as confirmed on the strength of a tap.
//     Only `authoritative`, which the platform states, does that.
//
// ## Every write that follows an `await` is guarded
//
// Riverpod REUSES a notifier instance across an invalidation — only `build`
// re-runs — so `ref.mounted` is still true for an element that has already been
// discarded and rebuilt. An unguarded `state = …` after the round trip records
// one organisation's decision into the listing another organisation's screens
// read.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_transfer_matches_repository.dart';
import '../domain/transfer_match.dart';
import '../domain/transfer_matches_repository.dart';

final Provider<TransferMatchesRepository> transferMatchesRepositoryProvider =
    Provider<TransferMatchesRepository>(
  (Ref ref) => ApiTransferMatchesRepository(ref.watch(apiClientProvider)),
);

final Provider<LoadTransferMatchPage> loadTransferMatchPageProvider =
    Provider<LoadTransferMatchPage>(
  (Ref ref) => LoadTransferMatchPage(ref.watch(transferMatchesRepositoryProvider)),
);

final Provider<ConfirmTransferMatch> confirmTransferMatchProvider =
    Provider<ConfirmTransferMatch>(
  (Ref ref) => ConfirmTransferMatch(ref.watch(transferMatchesRepositoryProvider)),
);

final Provider<RejectTransferMatch> rejectTransferMatchProvider =
    Provider<RejectTransferMatch>(
  (Ref ref) => RejectTransferMatch(ref.watch(transferMatchesRepositoryProvider)),
);

/// Which decisions the person is looking at.
///
/// Defaults to the questions still waiting for them: this surface exists to be
/// answered, and opening it on a list of things already settled would bury the
/// only part that needs a person.
final class TransferMatchFilterController extends Notifier<MatchStateFilter> {
  @override
  MatchStateFilter build() => MatchStateFilter.awaitingDecision;

  void show(MatchStateFilter filter) => state = filter;
}

final NotifierProvider<TransferMatchFilterController, MatchStateFilter>
    transferMatchFilterProvider =
    NotifierProvider<TransferMatchFilterController, MatchStateFilter>(
  TransferMatchFilterController.new,
);

/// The pairs whose two movements the person has opened.
///
/// Opening one is what reads the two transactions, so a page of proposals costs
/// one request rather than two per row. It is tenant-scoped even though it
/// holds no money: the identifiers in it are one organisation's.
final class OpenedTransferMatchController extends Notifier<Set<String>> {
  @override
  Set<String> build() => const <String>{};

  void toggle(String matchId) => state = state.contains(matchId)
      ? <String>{...state}.difference(<String>{matchId})
      : <String>{...state, matchId};

  bool isOpen(String matchId) => state.contains(matchId);
}

final NotifierProvider<OpenedTransferMatchController, Set<String>>
    openedTransferMatchProvider =
    NotifierProvider<OpenedTransferMatchController, Set<String>>(
  OpenedTransferMatchController.new,
);

/// What is happening to one row right now.
///
/// Deliberately NOT a state of the match. A match's state is what the platform
/// says it is; this is what this client is doing about it.
enum MatchDecisionProgress {
  /// Nothing in flight.
  idle,

  /// The person's confirmation is being recorded.
  confirming,

  /// The person's refusal — or the withdrawal of their confirmation — is being
  /// recorded.
  rejecting,
}

/// One proposal as the listing holds it.
final class TransferMatchRow {
  const TransferMatchRow({
    required this.match,
    this.progress = MatchDecisionProgress.idle,
    this.refusal,
  });

  final TransferMatch match;

  final MatchDecisionProgress progress;

  /// The last refusal for THIS row, or null. Attached to the row rather than to
  /// the screen so a failure names the pair it belongs to instead of covering
  /// the whole list with a banner.
  final Failure? refusal;

  bool get isDeciding => progress != MatchDecisionProgress.idle;

  /// Marks a write as in flight. The match itself is untouched — see the note
  /// at the top of this file.
  TransferMatchRow deciding(MatchDecisionProgress next) =>
      TransferMatchRow(match: match, progress: next);

  /// Takes the platform's answer. The row the person now sees is the row the
  /// platform returned, never one this client assembled.
  TransferMatchRow settled(TransferMatch answered) =>
      TransferMatchRow(match: answered);

  /// The write failed. Nothing about the match changes.
  TransferMatchRow refused(Failure failure) =>
      TransferMatchRow(match: match, refusal: failure);

  @override
  String toString() => 'TransferMatchRow()';
}

/// What the listing screen renders.
sealed class TransferMatchListing {
  const TransferMatchListing();
}

final class TransferMatchesLoaded extends TransferMatchListing {
  const TransferMatchesLoaded({
    required this.rows,
    required this.hasMore,
    required this.isLoadingMore,
    required this.filter,
  });

  final List<TransferMatchRow> rows;

  /// The STORE's own answer, echoed. Never derived from the number of rows on
  /// screen.
  final bool hasMore;

  final bool isLoadingMore;

  /// Which decisions are being shown, so an empty result can say which kind of
  /// empty it is.
  final MatchStateFilter filter;

  TransferMatchesLoaded withRows(List<TransferMatchRow> replacement) =>
      TransferMatchesLoaded(
        rows: List<TransferMatchRow>.unmodifiable(replacement),
        hasMore: hasMore,
        isLoadingMore: isLoadingMore,
        filter: filter,
      );
}

final class TransferMatchesUnavailable extends TransferMatchListing {
  const TransferMatchesUnavailable(this.failure);

  final Failure failure;
}

/// Accumulates the pages of proposals, and sequences the person's decisions.
final class TransferMatchListingController
    extends TenantScopedAsyncNotifier<TransferMatchListing> {
  String? _nextCursor;

  /// No organisation's proposals are held. NOT an empty list: an empty list is
  /// a claim that this organisation has nothing to decide, and that claim would
  /// be about the organisation the session has just left.
  @override
  TransferMatchListing get discarded =>
      const TransferMatchesUnavailable(SessionChangedFailure());

  @override
  Future<TransferMatchListing> load() async {
    final filter = ref.watch(transferMatchFilterProvider);
    _nextCursor = null;
    final result = await ref.watch(loadTransferMatchPageProvider)(state: filter);
    return switch (result) {
      Failed<TransferMatchPage>(:final failure) => TransferMatchesUnavailable(failure),
      Success<TransferMatchPage>(:final value) =>
        _accumulate(const <TransferMatchRow>[], value, filter: filter),
    };
  }

  /// Follows the platform's own cursor. Stops only when it says there is no
  /// next page.
  Future<void> loadMore() async {
    final current = state.value;
    if (current is! TransferMatchesLoaded ||
        !current.hasMore ||
        current.isLoadingMore) {
      return;
    }
    final cursor = _nextCursor;
    if (cursor == null) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = AsyncData<TransferMatchListing>(
      TransferMatchesLoaded(
        rows: current.rows,
        hasMore: current.hasMore,
        isLoadingMore: true,
        filter: current.filter,
      ),
    );
    final result = await ref
        .read(loadTransferMatchPageProvider)(state: current.filter, cursor: cursor);
    if (issued.hasEnded) {
      // The page was asked for under an organisation the session has left. It
      // would be APPENDED to whatever the new organisation has loaded.
      return;
    }
    state = AsyncData<TransferMatchListing>(
      switch (result) {
        Failed<TransferMatchPage>(:final failure) =>
          TransferMatchesUnavailable(failure),
        Success<TransferMatchPage>(:final value) =>
          _accumulate(current.rows, value, filter: current.filter),
      },
    );
  }

  Future<void> refresh() async {
    final TenantDataGeneration issued = binding;
    state = const AsyncLoading<TransferMatchListing>();
    final AsyncValue<TransferMatchListing> answer =
        await AsyncValue.guard<TransferMatchListing>(load);
    if (issued.hasEnded) {
      return;
    }
    state = answer;
  }

  /// Records the person's confirmation of one pair.
  ///
  /// Nothing in this class ever calls it on its own, and nothing calls it in
  /// response to a read: it is reached from exactly one widget, from an
  /// explicit press. Auto-confirmation is not a thing this controller can be
  /// asked to do.
  Future<void> confirm(String matchId) => _decide(
        matchId,
        MatchDecisionProgress.confirming,
        (TransferMatch match) => ref.read(confirmTransferMatchProvider)(match),
      );

  /// Records the person's refusal, or withdraws a confirmation they made.
  Future<void> reject(String matchId) => _decide(
        matchId,
        MatchDecisionProgress.rejecting,
        (TransferMatch match) => ref.read(rejectTransferMatchProvider)(match),
      );

  Future<void> _decide(
    String matchId,
    MatchDecisionProgress progress,
    Future<Result<TransferMatch>> Function(TransferMatch match) write,
  ) async {
    final current = state.value;
    if (current is! TransferMatchesLoaded) {
      return;
    }
    final index = current.rows.indexWhere(
      (TransferMatchRow row) => row.match.matchId == matchId,
    );
    if (index < 0) {
      return;
    }
    final row = current.rows[index];
    if (row.isDeciding) {
      // A second press while the first is in flight would record the decision
      // twice. The platform is idempotent for a confirmation, but a rejection
      // is not a thing to send twice on the strength of a double tap.
      return;
    }
    final TenantDataGeneration issued = binding;
    state = AsyncData<TransferMatchListing>(
      current.withRows(
        _replacing(current.rows, index, row.deciding(progress)),
      ),
    );

    final result = await write(row.match);

    if (issued.hasEnded) {
      // The decision was issued under an organisation the session has left.
      // Writing it back would report one organisation's answer in another's
      // listing.
      return;
    }
    final settled = state.value;
    if (settled is! TransferMatchesLoaded) {
      return;
    }
    final settledIndex = settled.rows.indexWhere(
      (TransferMatchRow candidate) => candidate.match.matchId == matchId,
    );
    if (settledIndex < 0) {
      return;
    }
    state = AsyncData<TransferMatchListing>(
      settled.withRows(
        _replacing(
          settled.rows,
          settledIndex,
          switch (result) {
            // NOTHING OF THE OPTIMISTIC UPDATE SURVIVES. The row goes back to
            // the match as it was, carrying the refusal so the person is told
            // rather than left looking at an unchanged row.
            Failed<TransferMatch>(:final failure) => row.refused(failure),
            Success<TransferMatch>(:final value) => row.settled(value),
          },
        ),
      ),
    );
  }

  List<TransferMatchRow> _replacing(
    List<TransferMatchRow> rows,
    int index,
    TransferMatchRow replacement,
  ) =>
      <TransferMatchRow>[
        for (var position = 0; position < rows.length; position++)
          if (position == index) replacement else rows[position],
      ];

  TransferMatchesLoaded _accumulate(
    List<TransferMatchRow> existing,
    TransferMatchPage page, {
    required MatchStateFilter filter,
  }) {
    _nextCursor = page.nextCursor;
    return TransferMatchesLoaded(
      rows: List<TransferMatchRow>.unmodifiable(<TransferMatchRow>[
        ...existing,
        for (final match in page.items) TransferMatchRow(match: match),
      ]),
      hasMore: page.hasMore && page.nextCursor != null,
      isLoadingMore: false,
      filter: filter,
    );
  }
}

final AsyncNotifierProvider<TransferMatchListingController, TransferMatchListing>
    transferMatchListingProvider =
    AsyncNotifierProvider<TransferMatchListingController, TransferMatchListing>(
  TransferMatchListingController.new,
);

/// Providers whose value belongs to one organisation.
///
/// A match names two of one organisation's transactions on two of its accounts.
/// A provider missing from this list would survive a tenant switch and put one
/// organisation's financial structure in front of another.
///
/// Each entry names its KIND, and the asynchronous constructors accept only a
/// [TenantScopedAsyncNotifier] — the only shape that can empty itself. A
/// `FutureProvider` cannot be added here at all.
List<TenantScopedProvider> transferMatchingProviders() =>
    <TenantScopedProvider>[
      tenantScopedAsync(transferMatchListingProvider),
      tenantScopedNotifier(transferMatchFilterProvider),
      tenantScopedNotifier(openedTransferMatchProvider),
    ];
