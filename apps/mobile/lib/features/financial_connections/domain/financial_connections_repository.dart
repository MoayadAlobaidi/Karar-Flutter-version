// PURE DART ONLY. See lib/README.md — domain purity.
//
// THE PORT, AND THE OPERATIONS THAT DO NOT EXIST ON IT.
//
// This surface is READ-ONLY, and the port says so by having nothing else on it.
// The contract offers no create, no update, no delete and no link-confirmation
// route here, and a port method that does not exist cannot be called by
// mistake, cannot be wired to a button, and cannot be added without somebody
// noticing that the contract has no operation behind it.
//
// In particular there is NO `connect`, NO `authorise`, NO `refresh` and NO
// `sync`. Each of those would need a rail this platform has never built, and
// each would put a control on screen that promises something no code performs.
// The absence is the design.
import '../../../core/errors/result.dart';
import '../../financial_accounts/domain/account_source_link.dart';
import 'financial_connection.dart';

/// Which connections to read. `null` means every one the caller owns.
///
/// A separate type from [ConnectionStatus] because a filter is not a status:
/// the absence of a filter is a real choice and is not a member of the
/// vocabulary the contract declares. `unrecognised` has no place here at all —
/// asking the platform to filter by a value this build cannot name is a client
/// defect, and it is refused before a request leaves.
enum ConnectionStatusFilter {
  /// Connections that accept data the person supplies.
  accepting,

  /// Connections that exist and have had nothing set up on them.
  notConfigured,

  /// Connections that are set up and not usable at the moment.
  unavailable,

  /// Connections the person is finished with.
  retired,

  /// Connections whose rail has no implementation on this platform.
  notImplemented;

  /// The status this filter narrows to.
  ConnectionStatus get status => switch (this) {
        ConnectionStatusFilter.accepting => ConnectionStatus.active,
        ConnectionStatusFilter.notConfigured => ConnectionStatus.notConfigured,
        ConnectionStatusFilter.unavailable => ConnectionStatus.unavailable,
        ConnectionStatusFilter.retired => ConnectionStatus.retired,
        ConnectionStatusFilter.notImplemented => ConnectionStatus.notImplemented,
      };
}

/// The caller's own connections. Reads only.
abstract interface class FinancialConnectionsRepository {
  /// One page of the caller's own connections, oldest first.
  Future<Result<FinancialConnectionPage>> listOwn({
    ConnectionStatusFilter? status,
    int? limit,
    String? cursor,
  });
}

/// One page of connections with the platform's own cursor.
///
/// A page type of its own rather than the financial `Page<T>`: this surface
/// carries no amounts, and reusing a type from the money-bearing feature would
/// invite somebody to hang a total off it later.
final class FinancialConnectionPage {
  const FinancialConnectionPage({
    required this.items,
    required this.hasMore,
    required this.nextCursor,
  });

  final List<FinancialConnection> items;

  /// The STORE's own answer, echoed. Never derived from how many rows came
  /// back: a short page can still have a successor.
  final bool hasMore;

  final String? nextCursor;

  @override
  String toString() => 'FinancialConnectionPage()';
}

/// Reads one page of the caller's own connections.
final class LoadFinancialConnectionPage {
  const LoadFinancialConnectionPage(this._repository, {this.pageLimit = 50});

  final FinancialConnectionsRepository _repository;
  final int pageLimit;

  Future<Result<FinancialConnectionPage>> call({
    ConnectionStatusFilter? status,
    String? cursor,
  }) =>
      _repository.listOwn(status: status, limit: pageLimit, cursor: cursor);
}

/// The sources feeding one account, in the order the platform stated.
///
/// The order is ECHOED, never sorted here. The contract returns "strongest
/// priority first" and each row carries its own `sourcePriority`, so the screen
/// shows the platform's ordering together with the number it is based on. A
/// client-side sort would be this build asserting a precedence the platform did
/// not state, and the two would drift the moment the rule changed.
List<AccountSourceLink> sourcesInStatedPriorityOrder(
  Iterable<AccountSourceLink> links,
) =>
    List<AccountSourceLink>.unmodifiable(links);

/// Whether two of an account's sources claim the same priority.
///
/// Reported rather than resolved. When two sources are equally strong there is
/// no answer to "which one wins", and picking one for display would be this
/// client inventing a precedence. The screen says the ordering is not decided
/// instead.
bool priorityOrderIsAmbiguous(Iterable<AccountSourceLink> links) {
  final seen = <int>{};
  for (final link in links) {
    if (!seen.add(link.sourcePriority)) {
      return true;
    }
  }
  return false;
}
