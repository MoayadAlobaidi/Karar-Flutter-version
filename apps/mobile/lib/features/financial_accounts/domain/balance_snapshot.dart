// PURE DART ONLY. See lib/README.md — domain purity.
//
// A BALANCE IS A FIGURE A SOURCE REPORTED, WITH THE KIND IT REPORTED.
//
// Nothing here is derived. No figure is computed from transactions, no
// `balanceKind` stands in for another, and there is no "the balance" — an
// account has as many balances as its sources reported kinds for it, and the
// screen shows them by kind because collapsing them would mean choosing one
// and calling it the answer.
//
// There is deliberately no aggregate of any sort: no sum across accounts, no
// sum across currencies, no net position. Those are Phase 6 and they are not
// expressible with the types in this file.
import 'package:meta/meta.dart';

import 'money.dart';
import 'source_rail.dart';

export 'source_rail.dart' show RailAvailability, SourceKind;

/// What a source said the figure MEANS.
enum BalanceKind {
  booked,
  available,
  current,
  outstanding,
  creditLimit,

  /// The platform's own OTHER_SOURCE_REPORTED: the source reported a kind
  /// this vocabulary does not name.
  otherSourceReported,

  /// A kind this build does not recognise.
  unrecognised,
}

/// One figure a source reported.
@immutable
final class BalanceSnapshot {
  const BalanceSnapshot({
    required this.snapshotId,
    required this.accountId,
    required this.amount,
    required this.balanceKind,
    required this.sourceKind,
    required this.availability,
    required this.asOf,
    required this.capturedAt,
  });

  final String snapshotId;
  final String accountId;
  final Money amount;
  final BalanceKind balanceKind;
  final SourceKind sourceKind;
  final RailAvailability availability;

  /// The moment the source says this figure was true. An INSTANT, not a day:
  /// the contract types it as one and so does this.
  final DateTime asOf;

  /// The moment this platform recorded it.
  final DateTime capturedAt;

  @override
  String toString() => 'BalanceSnapshot($snapshotId)';
}

/// The reported balances of ONE account, kept apart by kind.
///
/// The grouping is the whole point. A screen that showed a single figure would
/// have had to pick a kind and present it as the balance; this makes the
/// choice visible instead, and makes a total impossible to assemble by
/// accident — there is no member here that holds one.
@immutable
final class BalancesByKind {
  const BalancesByKind(this.entries);

  /// One entry per kind the sources reported, most recently true first within
  /// each kind.
  final List<BalanceKindGroup> entries;

  bool get isEmpty => entries.isEmpty;

  /// Groups [snapshots] by kind, newest `asOf` first inside each group, and
  /// orders the groups by the fixed vocabulary order so two accounts read the
  /// same way.
  static BalancesByKind from(Iterable<BalanceSnapshot> snapshots) {
    final byKind = <BalanceKind, List<BalanceSnapshot>>{};
    for (final snapshot in snapshots) {
      byKind.putIfAbsent(snapshot.balanceKind, () => <BalanceSnapshot>[]).add(snapshot);
    }
    final groups = <BalanceKindGroup>[];
    for (final kind in BalanceKind.values) {
      final held = byKind[kind];
      if (held == null) {
        continue;
      }
      held.sort((BalanceSnapshot a, BalanceSnapshot b) => b.asOf.compareTo(a.asOf));
      groups.add(
        BalanceKindGroup(kind: kind, snapshots: List<BalanceSnapshot>.unmodifiable(held)),
      );
    }
    return BalancesByKind(List<BalanceKindGroup>.unmodifiable(groups));
  }

  @override
  String toString() => 'BalancesByKind(${entries.length})';
}

/// Every figure a source reported for one kind.
@immutable
final class BalanceKindGroup {
  const BalanceKindGroup({required this.kind, required this.snapshots});

  final BalanceKind kind;

  /// Newest first. More than one is normal: two sources may report the same
  /// kind, and neither is silently discarded.
  final List<BalanceSnapshot> snapshots;

  /// The figure a source reported most recently for this kind. It is the
  /// LATEST REPORT, not a computed current balance, and the screen labels it
  /// with its own `asOf` so nobody has to assume it is now.
  BalanceSnapshot get mostRecent => snapshots.first;

  @override
  String toString() => 'BalanceKindGroup(${kind.name})';
}
