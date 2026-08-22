// PURE DART ONLY. See lib/README.md — domain purity.
//
// The transaction ports and the use cases that sequence them.
//
// A DELETE port exists here because the platform exposes the operation, and it
// returns the OUTCOME rather than void: the delete spans two modules, a
// partial application is a real answer, and a client that returned success for
// one would be telling a person their record is gone when part of it is not.
//
// There is no category-filter parameter, because the contract has none: a
// transaction's active category lives in another table and is read per
// transaction, so the filter would have cost one query per row of every page.
import 'package:meta/meta.dart';

import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../financial_accounts/domain/calendar_day.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/domain/page.dart';
import '../../financial_accounts/domain/source_rail.dart';
import 'transaction.dart';
import 'transaction_detail.dart';

/// The filters the listing accepts. Every one of them narrows the caller's own
/// set; none can widen it.
@immutable
final class TransactionFilter {
  const TransactionFilter({
    this.accountId,
    this.currencyCode,
    this.direction,
    this.status,
    this.sourceKind,
    this.bookedFrom,
    this.bookedTo,
  });

  final String? accountId;
  final String? currencyCode;
  final MoneyDirection? direction;
  final TransactionStatus? status;
  final SourceKind? sourceKind;

  /// Calendar days, sent as days. Never widened to an instant.
  final CalendarDay? bookedFrom;
  final CalendarDay? bookedTo;

  bool get isEmpty =>
      accountId == null &&
      currencyCode == null &&
      direction == null &&
      status == null &&
      sourceKind == null &&
      bookedFrom == null &&
      bookedTo == null;

  int get activeCount => <Object?>[
    accountId,
    currencyCode,
    direction,
    status,
    sourceKind,
    bookedFrom,
    bookedTo,
  ].where((Object? value) => value != null).length;

  TransactionFilter copyWith({
    String? accountId,
    String? currencyCode,
    MoneyDirection? direction,
    TransactionStatus? status,
    SourceKind? sourceKind,
    CalendarDay? bookedFrom,
    CalendarDay? bookedTo,
    bool clearAccountId = false,
    bool clearCurrencyCode = false,
    bool clearDirection = false,
    bool clearStatus = false,
    bool clearSourceKind = false,
    bool clearBookedFrom = false,
    bool clearBookedTo = false,
  }) => TransactionFilter(
    accountId: clearAccountId ? null : (accountId ?? this.accountId),
    currencyCode: clearCurrencyCode
        ? null
        : (currencyCode ?? this.currencyCode),
    direction: clearDirection ? null : (direction ?? this.direction),
    status: clearStatus ? null : (status ?? this.status),
    sourceKind: clearSourceKind ? null : (sourceKind ?? this.sourceKind),
    bookedFrom: clearBookedFrom ? null : (bookedFrom ?? this.bookedFrom),
    bookedTo: clearBookedTo ? null : (bookedTo ?? this.bookedTo),
  );

  @override
  String toString() => 'TransactionFilter($activeCount)';
}

/// What a person supplies to record a transaction by hand.
///
/// A magnitude and a direction, never a signed amount — the platform refuses
/// one, and so does this type.
@immutable
final class ManualTransactionDraft {
  const ManualTransactionDraft({
    required this.accountId,
    required this.entry,
    required this.bookingDate,
    required this.description,
    this.valueDate,
    this.merchant,
    this.note,
    this.occurrenceOrdinal,
  });

  final String accountId;
  final MoneyEntry entry;
  final CalendarDay bookingDate;
  final String description;
  final CalendarDay? valueDate;
  final String? merchant;
  final String? note;

  /// WHICH OCCURRENCE of an otherwise identical movement this is.
  ///
  /// Null on a first attempt, which is the ordinary case and the one a person
  /// never thinks about. The platform refuses a second identical movement with
  /// `DUPLICATE_TRANSACTION` — deliberately, because an accidental double-tap
  /// and a second real purchase look exactly alike from the outside — and only
  /// a person can say which it was. Setting this is that answer.
  ///
  /// It exists because the field was in the contract and in the generated
  /// client from the beginning and reached neither this type nor the wire, so
  /// a person who genuinely bought the same coffee twice could record one of
  /// them and their ledger silently understated their spending
  /// (`KAR-RSK-049`).
  final int? occurrenceOrdinal;

  /// The same draft, re-stated as a specific occurrence.
  ///
  /// The ordinal comes from the server's refusal, never from the client adding
  /// one to a previous value: the server names the next unused ordinal, and
  /// between the refusal and the retry another write may have taken it.
  ManualTransactionDraft asOccurrence(int ordinal) => ManualTransactionDraft(
    accountId: accountId,
    entry: entry,
    bookingDate: bookingDate,
    description: description,
    valueDate: valueDate,
    merchant: merchant,
    note: note,
    occurrenceOrdinal: ordinal,
  );

  List<TransactionDraftViolation> get violations => <TransactionDraftViolation>[
    if (accountId.trim().isEmpty) TransactionDraftViolation.accountRequired,
    if (description.trim().isEmpty)
      TransactionDraftViolation.descriptionRequired,
    if (entry.direction == MoneyDirection.unrecognised)
      TransactionDraftViolation.directionRequired,
    if (!_isNonNegativeMagnitude(entry.magnitude.minorUnits))
      TransactionDraftViolation.magnitudeRequired,
  ];

  @override
  String toString() => 'ManualTransactionDraft()';
}

/// A rule the client checks before it sends.
enum TransactionDraftViolation {
  accountRequired,
  descriptionRequired,
  directionRequired,

  /// A magnitude must be present and must not be signed.
  magnitudeRequired,
}

/// A correction. `magnitude` and `direction` travel together or not at all,
/// exactly as the platform requires.
@immutable
final class TransactionCorrection {
  const TransactionCorrection({
    required this.expectedVersion,
    this.entry,
    this.bookingDate,
    this.valueDate,
    this.clearValueDate = false,
    this.merchant,
    this.clearMerchant = false,
    this.description,
    this.note,
    this.clearNote = false,
    this.status,
  });

  final int expectedVersion;

  /// Both halves of the amount, or neither.
  final MoneyEntry? entry;

  final CalendarDay? bookingDate;
  final CalendarDay? valueDate;
  final bool clearValueDate;
  final String? merchant;
  final bool clearMerchant;
  final String? description;
  final String? note;
  final bool clearNote;
  final TransactionStatus? status;

  bool get isEmpty =>
      entry == null &&
      bookingDate == null &&
      valueDate == null &&
      !clearValueDate &&
      merchant == null &&
      !clearMerchant &&
      description == null &&
      note == null &&
      !clearNote &&
      status == null;

  @override
  String toString() => 'TransactionCorrection()';
}

/// The caller's own transactions.
abstract interface class TransactionsRepository {
  Future<Result<Page<Transaction>>> listOwn({
    TransactionFilter filter = const TransactionFilter(),
    int? limit,
    String? cursor,
  });

  Future<Result<TransactionDetail>> read(String transactionId);

  Future<Result<Transaction>> createManual(ManualTransactionDraft draft);

  Future<Result<Transaction>> correct(
    String transactionId,
    TransactionCorrection correction,
  );

  Future<Result<CategoryAssignment>> assignCategory(
    String transactionId,
    String categoryCode,
  );

  Future<Result<List<TransactionProvenance>>> listProvenance(
    String transactionId,
  );

  /// Deletes the transaction and the transfer matches naming it. The outcome
  /// says how far it got.
  Future<Result<TransactionDeletionOutcome>> delete(String transactionId);
}

/// Reads one page of the caller's own transactions.
final class LoadTransactionPage {
  const LoadTransactionPage(this._repository, {this.pageLimit = 50});

  final TransactionsRepository _repository;
  final int pageLimit;

  Future<Result<Page<Transaction>>> call({
    TransactionFilter filter = const TransactionFilter(),
    String? cursor,
  }) => _repository.listOwn(filter: filter, limit: pageLimit, cursor: cursor);
}

/// Reads one transaction with its history.
final class LoadTransactionDetail {
  const LoadTransactionDetail(this._repository);

  final TransactionsRepository _repository;

  Future<Result<TransactionDetail>> call(String transactionId) =>
      _repository.read(transactionId);
}

/// Reads the safe provenance of one transaction.
final class LoadTransactionProvenance {
  const LoadTransactionProvenance(this._repository);

  final TransactionsRepository _repository;

  Future<Result<List<TransactionProvenance>>> call(String transactionId) =>
      _repository.listProvenance(transactionId);
}

/// Records one transaction by hand.
final class RecordManualTransaction {
  const RecordManualTransaction(this._repository);

  final TransactionsRepository _repository;

  Future<Result<Transaction>> call(ManualTransactionDraft draft) {
    final violations = draft.violations;
    if (violations.isNotEmpty) {
      return Future<Result<Transaction>>.value(
        Failed<Transaction>(
          InvalidRequestFailure(
            code: invalidRequestCode,
            fields: <String>[
              for (final violation in violations) violation.name,
            ],
          ),
        ),
      );
    }
    return _repository.createManual(draft);
  }
}

/// Appends one correction.
final class CorrectTransaction {
  const CorrectTransaction(this._repository);

  final TransactionsRepository _repository;

  Future<Result<Transaction>> call(
    String transactionId,
    TransactionCorrection correction,
  ) {
    if (correction.isEmpty) {
      return Future<Result<Transaction>>.value(
        const Failed<Transaction>(
          InvalidRequestFailure(code: transactionNoChangeCode),
        ),
      );
    }
    return _repository.correct(transactionId, correction);
  }
}

/// Records a person's own category choice.
final class AssignTransactionCategory {
  const AssignTransactionCategory(this._repository);

  final TransactionsRepository _repository;

  Future<Result<CategoryAssignment>> call(
    String transactionId,
    String categoryCode,
  ) => _repository.assignCategory(transactionId, categoryCode);
}

/// Deletes one transaction, reporting how far the delete got.
final class DeleteTransaction {
  const DeleteTransaction(this._repository);

  final TransactionsRepository _repository;

  Future<Result<TransactionDeletionOutcome>> call(String transactionId) =>
      _repository.delete(transactionId);
}

/// Whether a signed-integer string is a non-negative magnitude.
bool _isNonNegativeMagnitude(String minorUnits) {
  if (minorUnits.isEmpty || minorUnits.startsWith('-')) {
    return false;
  }
  for (final unit in minorUnits.codeUnits) {
    if (unit < 0x30 || unit > 0x39) {
      return false;
    }
  }
  return true;
}

/// The platform's own code for a malformed request.
const String invalidRequestCode = 'INVALID_REQUEST';

/// The platform's own code for a correction that changes nothing.
const String transactionNoChangeCode = 'NO_CHANGE';

/// The platform's refusal of an otherwise identical movement.
///
/// Not an error to render: it is a question only the person can answer, and
/// `TransactionDuplicateRefused` is where the client asks it.
const String transactionDuplicateCode = 'DUPLICATE_TRANSACTION';

/// The ordinal a repeat claimed is not the next unused one — another write took
/// it in between. The problem body carries the ordinal that IS free.
const String transactionOccurrenceNotNextCode = 'OCCURRENCE_ORDINAL_NOT_NEXT';
