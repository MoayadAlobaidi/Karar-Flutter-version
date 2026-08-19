// WHAT AN IMPORT IS, TO THE CLIENT.
//
// Three views, because the contract has three and they carry different things:
// the full import (which alone carries `version`, and therefore alone enables a
// commit), the preview (counts and bounded row errors), and the commit receipt.
//
// ## `version` travels from the write that produced it
//
// The contract states this as a limitation rather than hiding it: the single-
// import read does NOT carry `version`, so a client takes the `expectedVersion`
// it needs for a commit from the response to the write it last performed — the
// upload or the parse. [StatementImportSnapshot.version] is therefore non-null
// only on the arms that came from a write, and [StatementImportPreview] has no
// version at all. A commit issued without one is not something this type system
// permits, which is the point: a blind commit could apply a decision the person
// took against a different parse.
//
// ## Nothing here can hold a value from the file
//
// No cell, no header text, no amount, no merchant, no balance, no source
// reference, no fingerprint and no storage locator has a field on any type in
// this file, and none may be added. The contract withholds every one of them
// deliberately; a client type with somewhere to put one is a client that will
// eventually be given one.
import 'package:meta/meta.dart';

import 'import_lifecycle.dart';
import 'row_issue.dart';

/// An import as the platform last described it.
@immutable
final class StatementImportSnapshot {
  const StatementImportSnapshot({
    required this.importId,
    required this.state,
    required this.accountId,
    required this.counts,
    required this.reconciliation,
    required this.awaitsDecision,
    required this.hasStoredSource,
    this.refusal,
    this.version,
  });

  final String importId;
  final ImportLifecycleState state;

  /// The person's own account, which they chose before the file was read.
  final String accountId;

  final ImportCounts counts;
  final ReconciliationOutcome reconciliation;

  /// Whether this import is waiting for the person to commit or erase it.
  final bool awaitsDecision;

  /// Whether encrypted source bytes exist. EXISTENCE only — a locator is
  /// enough to ask a store for somebody's bank statement, so none is carried
  /// and none may be added.
  final bool hasStoredSource;

  /// Why the import was refused, when it was. Null is not "fine": an import in
  /// `FAILED` with no code is a platform that did not say, and the interface
  /// says exactly that rather than inventing a reason.
  final ImportRefusal? refusal;

  /// The optimistic-concurrency token, present only when this snapshot came
  /// from a write. See the header.
  final int? version;

  /// Whether a commit may be offered.
  ///
  /// Every condition is required, and the reconciliation one is the load-
  /// bearing one: committing a statement whose own stated balance disagrees
  /// with its rows writes records nobody can trust, and the platform refuses
  /// it at the commit anyway. Offering a button that is certain to be refused
  /// teaches people that refusals are noise.
  bool get canCommit =>
      awaitsDecision &&
      state == ImportLifecycleState.reviewRequired &&
      reconciliation != ReconciliationOutcome.mismatched &&
      version != null;

  @override
  String toString() => 'StatementImportSnapshot(${state.name})';
}

/// The review surface: counts, and one bounded page of row errors.
@immutable
final class StatementImportPreview {
  const StatementImportPreview({
    required this.snapshot,
    required this.rowIssues,
    required this.reportedErrorCount,
    required this.totalErrorCount,
  });

  final StatementImportSnapshot snapshot;

  /// One page of the bounded report. Never every failure, and the surface says
  /// so whenever [isTruncated].
  final List<RowIssue> rowIssues;

  /// How many the report holds.
  final int reportedErrorCount;

  /// How many rows really failed.
  ///
  /// Carried separately from [reportedErrorCount] because collapsing the two
  /// turns a truncated report into a complete-looking one — the same failure
  /// mode as a silently truncated import.
  final int totalErrorCount;

  /// Whether the platform withheld failures this report does not list.
  bool get isTruncated => totalErrorCount > reportedErrorCount;

  @override
  String toString() => 'StatementImportPreview(issues: ${rowIssues.length})';
}

/// What a commit wrote.
@immutable
final class ImportCommitReceipt {
  const ImportCommitReceipt({
    required this.importId,
    required this.committedTransactionCount,
    required this.alreadyCommitted,
    required this.transactionIds,
  });

  final String importId;
  final int committedTransactionCount;

  /// True when this was an idempotent retry and nothing was written a second
  /// time. Shown as such: a person who taps commit twice deserves to be told
  /// their statement was imported once, not that it failed.
  final bool alreadyCommitted;

  /// The person's own new transactions, addressable on the transactions
  /// surface.
  final List<String> transactionIds;

  @override
  String toString() => 'ImportCommitReceipt(count: $committedTransactionCount)';
}

/// What an erasure removed.
@immutable
final class ImportErasureReceipt {
  const ImportErasureReceipt({
    required this.importId,
    required this.storedObjectDeleted,
    required this.rowsDeleted,
  });

  final String importId;
  final bool storedObjectDeleted;
  final bool rowsDeleted;

  @override
  String toString() => 'ImportErasureReceipt()';
}

/// The balance a STATEMENT states about itself, for reconciliation only.
///
/// Not a balance of the account, and never written as one. The parse compares
/// it against the rows and answers matched, mismatched or not-available.
@immutable
final class StatedStatementBalance {
  const StatedStatementBalance({
    required this.minorUnits,
    required this.kind,
    required this.currencyCode,
  });

  /// An exact integer count of minor units, as characters. Never a number:
  /// a number is a float, and a float is not a ledger value.
  final String minorUnits;

  final StatementBalanceKind kind;
  final String currencyCode;

  /// Carries no figure.
  @override
  String toString() => 'StatedStatementBalance()';
}

/// Which balance of the statement was stated. Declared next to the type that
/// carries it rather than in the mapping, because this one is a fact about the
/// FILE as a whole rather than about a column.
enum StatementBalanceKind { opening, closing, ledger, available }
