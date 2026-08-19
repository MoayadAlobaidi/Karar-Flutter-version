// PROVIDERS FOR THE DATA-SOURCE SURFACE.
//
// A connection is one organisation's record of how that organisation's data
// reaches this platform, so everything cached here belongs to one organisation
// and every entry is registered as tenant-scoped at composition time. The
// asynchronous read is a [TenantScopedAsyncNotifier] rather than a
// `FutureProvider`: only a notifier can EMPTY itself, and `ref.invalidate`
// RELOADS — it leaves the previous organisation's answer readable for the whole
// reload window. See `app/lifecycle/tenant_data_scope.dart`.
//
// ## Nothing here writes
//
// There is no confirm, no decline, no connect and no refresh, because the port
// has none and the contract has none. Every controller below reads and
// accumulates pages, and the only state a person can change is which subset
// they are looking at. That is why there is no in-flight progress marker and no
// optimistic update anywhere in this file: there is no write to be optimistic
// about.
//
// ## Every write that follows an `await` is guarded
//
// Riverpod REUSES a notifier instance across an invalidation — only `build`
// re-runs — so `ref.mounted` is still true for an element that has already been
// discarded and rebuilt. An unguarded `state = …` after the round trip appends
// one organisation's page to another organisation's listing.
//
// ## Why the per-account sources are read through the financial workstream
//
// `accountSourceLinksProvider` already reads `listOwnAccountSourceLinks`
// through the generated client, and it is already registered as tenant-scoped
// by `financialTenantScopedProviders()`. A second provider over the same
// operation would be a second reading of one contract path and a second cache
// of one organisation's data — and the second cache is the one somebody forgets
// to discard. This surface therefore watches the existing family and adds a
// presentation of it, rather than a copy of it.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_financial_connections_repository.dart';
import '../domain/financial_connection.dart';
import '../domain/financial_connections_repository.dart';

final Provider<FinancialConnectionsRepository> financialConnectionsRepositoryProvider =
    Provider<FinancialConnectionsRepository>(
  (Ref ref) => ApiFinancialConnectionsRepository(ref.watch(apiClientProvider)),
);

final Provider<LoadFinancialConnectionPage> loadFinancialConnectionPageProvider =
    Provider<LoadFinancialConnectionPage>(
  (Ref ref) => LoadFinancialConnectionPage(
    ref.watch(financialConnectionsRepositoryProvider),
  ),
);

/// Which of the person's connections they are looking at.
///
/// Defaults to ALL of them. This surface exists to answer "where is my data
/// coming from", and opening it pre-filtered would hide part of the answer
/// behind a control the person has not touched.
final class ConnectionFilterController extends Notifier<ConnectionStatusFilter?> {
  @override
  ConnectionStatusFilter? build() => null;

  void show(ConnectionStatusFilter? filter) => state = filter;
}

final NotifierProvider<ConnectionFilterController, ConnectionStatusFilter?>
    connectionFilterProvider =
    NotifierProvider<ConnectionFilterController, ConnectionStatusFilter?>(
  ConnectionFilterController.new,
);

/// Which connection rows the person has opened for detail.
///
/// Tenant-scoped even though it holds no money: the identifiers in it are one
/// organisation's.
final class ExpandedConnectionController extends Notifier<Set<String>> {
  @override
  Set<String> build() => const <String>{};

  void toggle(String connectionId) => state = state.contains(connectionId)
      ? <String>{...state}.difference(<String>{connectionId})
      : <String>{...state, connectionId};
}

final NotifierProvider<ExpandedConnectionController, Set<String>>
    expandedConnectionProvider =
    NotifierProvider<ExpandedConnectionController, Set<String>>(
  ExpandedConnectionController.new,
);

/// What the listing screen renders.
sealed class ConnectionListing {
  const ConnectionListing();
}

final class ConnectionsLoaded extends ConnectionListing {
  const ConnectionsLoaded({
    required this.connections,
    required this.hasMore,
    required this.isLoadingMore,
    required this.filter,
  });

  final List<FinancialConnection> connections;

  /// The STORE's own answer, echoed. Never derived from the number of rows on
  /// screen: a short page can still have a successor.
  final bool hasMore;

  final bool isLoadingMore;

  /// Which subset is being shown, so an empty result can say which kind of
  /// empty it is.
  final ConnectionStatusFilter? filter;
}

final class ConnectionsUnavailable extends ConnectionListing {
  const ConnectionsUnavailable(this.failure);

  final Failure failure;
}

/// Accumulates the pages of the person's own connections.
final class ConnectionListingController
    extends TenantScopedAsyncNotifier<ConnectionListing> {
  String? _nextCursor;

  /// No organisation's connections are held. NOT an empty list: an empty list
  /// is a claim that this organisation has no connections, and that claim would
  /// be about the organisation the session has just left.
  @override
  ConnectionListing get discarded =>
      const ConnectionsUnavailable(SessionChangedFailure());

  @override
  Future<ConnectionListing> load() async {
    final filter = ref.watch(connectionFilterProvider);
    _nextCursor = null;
    final result = await ref.watch(loadFinancialConnectionPageProvider)(
      status: filter,
    );
    return switch (result) {
      Failed<FinancialConnectionPage>(:final failure) =>
        ConnectionsUnavailable(failure),
      Success<FinancialConnectionPage>(:final value) =>
        _accumulate(const <FinancialConnection>[], value, filter: filter),
    };
  }

  /// Follows the platform's own cursor. Stops only when it says there is no
  /// next page.
  Future<void> loadMore() async {
    final current = state.value;
    if (current is! ConnectionsLoaded || !current.hasMore || current.isLoadingMore) {
      return;
    }
    final cursor = _nextCursor;
    if (cursor == null) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = AsyncData<ConnectionListing>(
      ConnectionsLoaded(
        connections: current.connections,
        hasMore: current.hasMore,
        isLoadingMore: true,
        filter: current.filter,
      ),
    );
    final result = await ref.read(loadFinancialConnectionPageProvider)(
      status: current.filter,
      cursor: cursor,
    );
    if (issued.hasEnded) {
      // The page was asked for under an organisation the session has left. It
      // would be APPENDED to whatever the new organisation has loaded.
      return;
    }
    state = AsyncData<ConnectionListing>(
      switch (result) {
        Failed<FinancialConnectionPage>(:final failure) =>
          ConnectionsUnavailable(failure),
        Success<FinancialConnectionPage>(:final value) =>
          _accumulate(current.connections, value, filter: current.filter),
      },
    );
  }

  Future<void> refresh() async {
    final TenantDataGeneration issued = binding;
    state = const AsyncLoading<ConnectionListing>();
    final AsyncValue<ConnectionListing> answer =
        await AsyncValue.guard<ConnectionListing>(load);
    if (issued.hasEnded) {
      return;
    }
    state = answer;
  }

  ConnectionsLoaded _accumulate(
    List<FinancialConnection> existing,
    FinancialConnectionPage page, {
    required ConnectionStatusFilter? filter,
  }) {
    _nextCursor = page.nextCursor;
    return ConnectionsLoaded(
      connections: List<FinancialConnection>.unmodifiable(<FinancialConnection>[
        ...existing,
        ...page.items,
      ]),
      hasMore: page.hasMore && page.nextCursor != null,
      isLoadingMore: false,
      filter: filter,
    );
  }
}

final AsyncNotifierProvider<ConnectionListingController, ConnectionListing>
    connectionListingProvider =
    AsyncNotifierProvider<ConnectionListingController, ConnectionListing>(
  ConnectionListingController.new,
);

/// Providers whose value belongs to one organisation.
///
/// A connection names one organisation's record of how its data arrives, and
/// the filter and the opened set name that organisation's rows. A provider
/// missing from this list would survive a tenant switch and leave one
/// organisation's data-source structure readable under another.
///
/// Each entry names its KIND, and the asynchronous constructor accepts only a
/// [TenantScopedAsyncNotifier] — the only shape that can empty itself. A
/// `FutureProvider` cannot be added here at all.
///
/// `accountSourceLinksProvider` is deliberately NOT here: it belongs to the
/// financial workstream, which registers it. Registering it twice would be two
/// entries for one cache, and Riverpod would still only discard it once.
List<TenantScopedProvider> connectionsProviders() => <TenantScopedProvider>[
      tenantScopedAsync(connectionListingProvider),
      tenantScopedNotifier(connectionFilterProvider),
      tenantScopedNotifier(expandedConnectionProvider),
    ];
