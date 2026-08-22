// PURE DART ONLY. See lib/README.md — domain purity.
//
// The transaction, its append-only history, its active category and its
// provenance.
//
// A correction APPENDS. Nothing is overwritten, the imported value stays
// attributable, and `divergesFromSource` is stated by the platform rather than
// worked out here — a client that compared revisions itself would be inventing
// a claim about what the source said.
import 'package:meta/meta.dart';

import '../../financial_accounts/domain/calendar_day.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/domain/source_rail.dart';
import 'transaction.dart';

/// Who decided a category. There is deliberately no AI member and no
/// SUGGESTED member: this platform assigns deterministically or a person does.
enum AssignmentSource { user, rule, unrecognised }

/// Whether an assignment still stands.
enum AssignmentStatus { active, superseded, unrecognised }

/// Where the category on a transaction came from, including "nobody has said".
enum CategoryAssignmentOrigin { none, user, rule, unrecognised }

/// A complete snapshot of the revisable values, never a patch.
@immutable
final class RevisionValues {
  const RevisionValues({
    required this.amount,
    required this.direction,
    required this.bookingDate,
    required this.valueDate,
    required this.eventOccurredAt,
    required this.sourceTimezone,
    required this.merchant,
    required this.description,
    required this.note,
    required this.status,
  });

  final Money amount;
  final MoneyDirection direction;
  final CalendarDay bookingDate;
  final CalendarDay? valueDate;
  final DateTime? eventOccurredAt;
  final String? sourceTimezone;
  final String? merchant;
  final String description;
  final String? note;
  final TransactionStatus status;

  @override
  String toString() => 'RevisionValues()';
}

/// One entry of the append-only history.
@immutable
final class TransactionRevision {
  const TransactionRevision({
    required this.revisionNumber,
    required this.attribution,
    required this.changedFields,
    required this.values,
    required this.recordedAt,
  });

  /// Revision 1 is what was originally recorded and lists no changed fields.
  final int revisionNumber;

  final RevisionAttribution attribution;
  final List<RevisableField> changedFields;
  final RevisionValues values;
  final DateTime recordedAt;

  @override
  String toString() => 'TransactionRevision($revisionNumber)';
}

/// The active category on a transaction.
@immutable
final class CategoryAssignment {
  const CategoryAssignment({
    required this.assignmentId,
    required this.categoryCode,
    required this.assignmentSource,
    required this.ruleVersion,
    required this.status,
    required this.assignedAt,
  });

  final String assignmentId;
  final String categoryCode;
  final AssignmentSource assignmentSource;

  /// Present only for a RULE assignment; null for a person's own choice.
  final String? ruleVersion;

  final AssignmentStatus status;
  final DateTime assignedAt;

  @override
  String toString() => 'CategoryAssignment($assignmentId)';
}

/// How this record was processed. `fingerprintVersion` is the ALGORITHM
/// version and never a fingerprint — a fingerprint is a dedup handle and has
/// no place on a screen.
@immutable
final class ProcessingVersions {
  const ProcessingVersions({
    required this.parserVersion,
    required this.mappingVersion,
    required this.normalizationVersion,
    required this.fingerprintVersion,
  });

  final String parserVersion;
  final String mappingVersion;
  final String normalizationVersion;
  final String fingerprintVersion;

  @override
  String toString() => 'ProcessingVersions()';
}

/// Where one revision of a record came from, as the safe projection.
///
/// `importedFromStatement` reports the EXISTENCE of a statement origin as a
/// boolean. The import id and the source row reference are not carried,
/// because a row reference is a handle into staged source content.
@immutable
final class TransactionProvenance {
  const TransactionProvenance({
    required this.revisionNumber,
    required this.sourceKind,
    required this.availability,
    required this.accountId,
    required this.importedFromStatement,
    required this.versions,
    required this.sourceDirection,
    required this.directionMapping,
    required this.categoryAssignmentSource,
    required this.createdAt,
  });

  final int revisionNumber;
  final SourceKind sourceKind;
  final RailAvailability availability;
  final String accountId;
  final bool importedFromStatement;
  final ProcessingVersions versions;
  final SourceDirection sourceDirection;
  final DirectionMapping directionMapping;
  final CategoryAssignmentOrigin categoryAssignmentSource;
  final DateTime createdAt;

  @override
  String toString() => 'TransactionProvenance($revisionNumber)';
}

/// A transaction with everything the detail screen renders.
@immutable
final class TransactionDetail {
  const TransactionDetail({
    required this.transaction,
    required this.revisions,
    required this.activeCategory,
    required this.divergesFromSource,
  });

  final Transaction transaction;

  /// Oldest first, exactly as the platform ordered them.
  final List<TransactionRevision> revisions;

  final CategoryAssignment? activeCategory;

  /// True when a person has corrected a value the source supplied. STATED by
  /// the platform; never derived here.
  final bool divergesFromSource;

  @override
  String toString() => 'TransactionDetail()';
}

/// What a delete actually did.
///
/// A partial outcome is a real answer: the transaction and the transfer
/// matches that name it live in different modules behind separate ports, so
/// the count is what was really erased and is never rounded up.
@immutable
final class TransactionDeletionOutcome {
  const TransactionDeletionOutcome({
    required this.transactionId,
    required this.applied,
    required this.transferMatchesDeleted,
    required this.code,
  });

  final String transactionId;

  /// True only for a complete delete. A partial application is false, so a
  /// screen cannot report "deleted" for a delete that did not finish.
  final bool applied;

  final int transferMatchesDeleted;

  /// Present only when the outcome was partial.
  final String? code;

  @override
  String toString() => 'TransactionDeletionOutcome()';
}
