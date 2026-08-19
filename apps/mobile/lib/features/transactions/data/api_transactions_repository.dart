// The transactions repository.
//
// Two mappings here are load-bearing:
//
//   * a calendar day goes out as `YYYY-MM-DD` and comes back the same way. It
//     is never turned into a `DateTime` in either direction, so no offset is
//     ever applied to a day an institution wrote on its books;
//   * a manual amount goes out as `{ magnitude, direction }`. There is no code
//     path here that sends a signed amount, because the platform refuses one
//     and because a client that guessed the sign would write a wrong record
//     that looks exactly like a right one.
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/http_method.dart';
import '../../financial_accounts/data/api_financial_accounts_repository.dart'
    show railAvailabilityByWire, sourceKindByWire;
import '../../financial_accounts/data/financial_gateway.dart';
import '../../financial_accounts/data/financial_wire.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/domain/page.dart';
import '../../financial_accounts/domain/source_rail.dart';
import '../domain/transaction.dart';
import '../domain/transaction_detail.dart';
import '../domain/transactions_repository.dart';

const Map<String, MoneyDirection> moneyDirectionByWire = <String, MoneyDirection>{
  'MONEY_OUT': MoneyDirection.moneyOut,
  'MONEY_IN': MoneyDirection.moneyIn,
};

const Map<MoneyDirection, String> moneyDirectionWire = <MoneyDirection, String>{
  MoneyDirection.moneyOut: 'MONEY_OUT',
  MoneyDirection.moneyIn: 'MONEY_IN',
};

const Map<String, TransactionStatus> transactionStatusByWire =
    <String, TransactionStatus>{
  'POSTED': TransactionStatus.posted,
  'VOIDED': TransactionStatus.voided,
};

const Map<TransactionStatus, String> transactionStatusWire =
    <TransactionStatus, String>{
  TransactionStatus.posted: 'POSTED',
  TransactionStatus.voided: 'VOIDED',
};

const Map<String, SourceDirection> sourceDirectionByWire = <String, SourceDirection>{
  'DEBIT': SourceDirection.debit,
  'CREDIT': SourceDirection.credit,
  'NOT_STATED': SourceDirection.notStated,
};

const Map<String, DirectionMapping> directionMappingByWire = <String, DirectionMapping>{
  'MANUAL_ENTRY': DirectionMapping.manualEntry,
  'SOURCE_DIRECTION_WORD': DirectionMapping.sourceDirectionWord,
  'SOURCE_SIGNED_AMOUNT': DirectionMapping.sourceSignedAmount,
  'SOURCE_SIGNED_AMOUNT_INVERTED': DirectionMapping.sourceSignedAmountInverted,
};

const Map<String, RevisionAttribution> revisionAttributionByWire =
    <String, RevisionAttribution>{
  'SOURCE_IMPORT': RevisionAttribution.sourceImport,
  'MANUAL_ENTRY': RevisionAttribution.manualEntry,
  'USER_INPUT': RevisionAttribution.userInput,
};

const Map<String, RevisableField> revisableFieldByWire = <String, RevisableField>{
  'amount': RevisableField.amount,
  'bookingDate': RevisableField.bookingDate,
  'valueDate': RevisableField.valueDate,
  'merchant': RevisableField.merchant,
  'description': RevisableField.description,
  'note': RevisableField.note,
  'status': RevisableField.status,
};

const Map<String, AssignmentSource> assignmentSourceByWire = <String, AssignmentSource>{
  'USER': AssignmentSource.user,
  'RULE': AssignmentSource.rule,
};

const Map<String, AssignmentStatus> assignmentStatusByWire = <String, AssignmentStatus>{
  'ACTIVE': AssignmentStatus.active,
  'SUPERSEDED': AssignmentStatus.superseded,
};

const Map<String, CategoryAssignmentOrigin> categoryAssignmentOriginByWire =
    <String, CategoryAssignmentOrigin>{
  'NONE': CategoryAssignmentOrigin.none,
  'USER': CategoryAssignmentOrigin.user,
  'RULE': CategoryAssignmentOrigin.rule,
};

/// [TransactionsRepository] over the shared transport.
final class ApiTransactionsRepository implements TransactionsRepository {
  const ApiTransactionsRepository(this._gateway);

  final FinancialGateway _gateway;

  @override
  Future<Result<Page<Transaction>>> listOwn({
    TransactionFilter filter = const TransactionFilter(),
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<Transaction>>(
        'financial.transactions',
        () async => decodePage<Transaction>(
          await _gateway.get(
            FinancialPaths.transactions,
            query: <String, Object?>{
              'limit': limit,
              'cursor': cursor,
              'accountId': filter.accountId,
              'currency': filter.currencyCode,
              'direction': moneyDirectionWire[filter.direction],
              'status': transactionStatusWire[filter.status],
              'sourceKind': sourceKindWire[filter.sourceKind],
              // Days go out as days. `toIso8601String()` on a DateTime here
              // would attach a time and an offset to something that has
              // neither.
              'bookedFrom': filter.bookedFrom?.iso8601,
              'bookedTo': filter.bookedTo?.iso8601,
            },
            location: 'financial.transactions',
          ),
          'financial.transactions',
          decodeTransaction,
        ),
      );

  @override
  Future<Result<TransactionDetail>> read(String transactionId) =>
      guarded<TransactionDetail>(
        'financial.transactions.read',
        () async => decodeTransactionDetail(
          await _gateway.get(
            FinancialPaths.transaction(transactionId),
            location: 'financial.transactions.read',
          ),
        ),
      );

  @override
  Future<Result<Transaction>> createManual(ManualTransactionDraft draft) =>
      guarded<Transaction>(
        'financial.transactions.create',
        () async => decodeTransaction(
          await _gateway.send(
            HttpMethod.post,
            FinancialPaths.transactions,
            body: <String, Object?>{
              'accountId': draft.accountId,
              'magnitude': _moneyBody(draft.entry.magnitude),
              'direction': moneyDirectionWire[draft.entry.direction],
              'bookingDate': draft.bookingDate.iso8601,
              'description': draft.description.trim(),
              if (draft.valueDate != null) 'valueDate': draft.valueDate!.iso8601,
              if (_present(draft.merchant)) 'merchant': draft.merchant!.trim(),
              if (_present(draft.note)) 'note': draft.note!.trim(),
            },
            location: 'financial.transactions.create',
          ),
        ),
      );

  @override
  Future<Result<Transaction>> correct(
    String transactionId,
    TransactionCorrection correction,
  ) =>
      guarded<Transaction>(
        'financial.transactions.correct',
        () async => decodeTransaction(
          await _gateway.send(
            HttpMethod.patch,
            FinancialPaths.transaction(transactionId),
            body: <String, Object?>{
              'expectedVersion': correction.expectedVersion,
              // Both halves or neither: sending one without the other is a
              // request the platform refuses, and rightly.
              if (correction.entry != null) ...<String, Object?>{
                'magnitude': _moneyBody(correction.entry!.magnitude),
                'direction': moneyDirectionWire[correction.entry!.direction],
              },
              if (correction.bookingDate != null)
                'bookingDate': correction.bookingDate!.iso8601,
              if (correction.clearValueDate)
                'valueDate': null
              else if (correction.valueDate != null)
                'valueDate': correction.valueDate!.iso8601,
              if (correction.clearMerchant)
                'merchant': null
              else if (_present(correction.merchant))
                'merchant': correction.merchant!.trim(),
              if (_present(correction.description))
                'description': correction.description!.trim(),
              if (correction.clearNote)
                'note': null
              else if (_present(correction.note))
                'note': correction.note!.trim(),
              if (correction.status != null)
                'status': transactionStatusWire[correction.status],
            },
            location: 'financial.transactions.correct',
          ),
        ),
      );

  @override
  Future<Result<CategoryAssignment>> assignCategory(
    String transactionId,
    String categoryCode,
  ) =>
      guarded<CategoryAssignment>(
        'financial.transactions.category',
        () async => decodeCategoryAssignment(
          await _gateway.send(
            HttpMethod.put,
            FinancialPaths.transactionCategory(transactionId),
            body: <String, Object?>{'categoryCode': categoryCode},
            location: 'financial.transactions.category',
          ),
        ),
      );

  @override
  Future<Result<List<TransactionProvenance>>> listProvenance(String transactionId) =>
      guarded<List<TransactionProvenance>>(
        'financial.transactions.provenance',
        () async => decodePage<TransactionProvenance>(
          await _gateway.get(
            FinancialPaths.transactionProvenance(transactionId),
            location: 'financial.transactions.provenance',
          ),
          'financial.transactions.provenance',
          decodeProvenance,
        ).items,
      );

  @override
  Future<Result<TransactionDeletionOutcome>> delete(String transactionId) =>
      guarded<TransactionDeletionOutcome>(
        'financial.transactions.delete',
        () async => decodeDeletionOutcome(
          await _gateway.send(
            HttpMethod.delete,
            FinancialPaths.transaction(transactionId),
            location: 'financial.transactions.delete',
          ),
        ),
      );

  static JsonMap _moneyBody(Money money) => <String, Object?>{
        'minorUnits': money.minorUnits,
        'currency': money.currency,
        'exponent': money.exponent,
      };

  static bool _present(String? value) => value != null && value.trim().isNotEmpty;
}

/// The wire form of the rail vocabulary, for the listing filter.
const Map<SourceKind, String> sourceKindWire = <SourceKind, String>{
  SourceKind.manual: 'MANUAL',
  SourceKind.csv: 'CSV',
  // Present so the map is total over the vocabulary. No path in this platform
  // produces a record with this rail, so a filter for it returns nothing —
  // which is the honest answer rather than an error.
  SourceKind.externalProvider: 'EXTERNAL_PROVIDER',
};

/// One transaction.
Transaction decodeTransaction(JsonMap json) {
  const at = 'TransactionView';
  return Transaction(
    transactionId: json.string('transactionId', at),
    accountId: json.string('accountId', at),
    amount: json.money('amount', at),
    direction: decodeEnum<MoneyDirection>(
      json.stringOrNull('direction', at),
      moneyDirectionByWire,
      MoneyDirection.unrecognised,
    ),
    bookingDate: json.calendarDay('bookingDate', at),
    valueDate: json.calendarDayOrNull('valueDate', at),
    eventOccurredAt: json.instantOrNull('eventOccurredAt', at),
    sourceTimezone: json.stringOrNull('sourceTimezone', at),
    merchant: json.stringOrNull('merchant', at),
    description: json.string('description', at),
    note: json.stringOrNull('note', at),
    originalAmount: json.moneyOrNull('originalAmount', at),
    sourceKind: decodeEnum<SourceKind>(
      json.stringOrNull('sourceKind', at),
      sourceKindByWire,
      SourceKind.unrecognised,
    ),
    availability: decodeEnum<RailAvailability>(
      json.stringOrNull('availability', at),
      railAvailabilityByWire,
      RailAvailability.unrecognised,
    ),
    status: decodeEnum<TransactionStatus>(
      json.stringOrNull('status', at),
      transactionStatusByWire,
      TransactionStatus.unrecognised,
    ),
    createdAt: json.instant('createdAt', at),
    version: json.integer('version', at),
  );
}

/// The transaction with its history, its active category and the divergence
/// the platform stated.
TransactionDetail decodeTransactionDetail(JsonMap json) {
  const at = 'ReadOwnTransactionResponse';
  final activeCategory = json.objectOrNull('activeCategory', at);
  return TransactionDetail(
    transaction: decodeTransaction(json.object('transaction', at)),
    revisions: List<TransactionRevision>.unmodifiable(<TransactionRevision>[
      for (final revision in json.objectList('revisions', at)) decodeRevision(revision),
    ]),
    activeCategory:
        activeCategory == null ? null : decodeCategoryAssignment(activeCategory),
    divergesFromSource: json.boolean('divergesFromSource', at),
  );
}

/// One revision.
TransactionRevision decodeRevision(JsonMap json) {
  const at = 'TransactionRevisionView';
  final values = json.object('values', at);
  final changed = json['changedFields'];
  return TransactionRevision(
    revisionNumber: json.integer('revisionNumber', at),
    attribution: decodeEnum<RevisionAttribution>(
      json.stringOrNull('attribution', at),
      revisionAttributionByWire,
      RevisionAttribution.unrecognised,
    ),
    changedFields: List<RevisableField>.unmodifiable(<RevisableField>[
      if (changed is List<Object?>)
        for (final field in changed)
          decodeEnum<RevisableField>(
            field is String ? field : null,
            revisableFieldByWire,
            RevisableField.unrecognised,
          ),
    ]),
    values: RevisionValues(
      amount: values.money('amount', '$at.values'),
      direction: decodeEnum<MoneyDirection>(
        values.stringOrNull('direction', '$at.values'),
        moneyDirectionByWire,
        MoneyDirection.unrecognised,
      ),
      bookingDate: values.calendarDay('bookingDate', '$at.values'),
      valueDate: values.calendarDayOrNull('valueDate', '$at.values'),
      eventOccurredAt: values.instantOrNull('eventOccurredAt', '$at.values'),
      sourceTimezone: values.stringOrNull('sourceTimezone', '$at.values'),
      merchant: values.stringOrNull('merchant', '$at.values'),
      description: values.string('description', '$at.values'),
      note: values.stringOrNull('note', '$at.values'),
      status: decodeEnum<TransactionStatus>(
        values.stringOrNull('status', '$at.values'),
        transactionStatusByWire,
        TransactionStatus.unrecognised,
      ),
    ),
    recordedAt: json.instant('recordedAt', at),
  );
}

/// One category assignment.
CategoryAssignment decodeCategoryAssignment(JsonMap json) {
  const at = 'CategoryAssignmentView';
  return CategoryAssignment(
    assignmentId: json.string('assignmentId', at),
    categoryCode: json.string('categoryCode', at),
    assignmentSource: decodeEnum<AssignmentSource>(
      json.stringOrNull('assignmentSource', at),
      assignmentSourceByWire,
      AssignmentSource.unrecognised,
    ),
    ruleVersion: json.stringOrNull('ruleVersion', at),
    status: decodeEnum<AssignmentStatus>(
      json.stringOrNull('status', at),
      assignmentStatusByWire,
      AssignmentStatus.unrecognised,
    ),
    assignedAt: json.instant('assignedAt', at),
  );
}

/// One provenance row.
TransactionProvenance decodeProvenance(JsonMap json) {
  const at = 'ProvenanceView';
  final versions = json.object('versions', at);
  return TransactionProvenance(
    revisionNumber: json.integer('revisionNumber', at),
    sourceKind: decodeEnum<SourceKind>(
      json.stringOrNull('sourceKind', at),
      sourceKindByWire,
      SourceKind.unrecognised,
    ),
    availability: decodeEnum<RailAvailability>(
      json.stringOrNull('availability', at),
      railAvailabilityByWire,
      RailAvailability.unrecognised,
    ),
    accountId: json.string('accountId', at),
    importedFromStatement: json.boolean('importedFromStatement', at),
    versions: ProcessingVersions(
      parserVersion: versions.string('parserVersion', '$at.versions'),
      mappingVersion: versions.string('mappingVersion', '$at.versions'),
      normalizationVersion: versions.string('normalizationVersion', '$at.versions'),
      // The ALGORITHM version. Never a fingerprint, which is a dedup handle
      // and is absent from this projection by construction.
      fingerprintVersion: versions.string('fingerprintVersion', '$at.versions'),
    ),
    sourceDirection: decodeEnum<SourceDirection>(
      json.stringOrNull('sourceDirection', at),
      sourceDirectionByWire,
      SourceDirection.unrecognised,
    ),
    directionMapping: decodeEnum<DirectionMapping>(
      json.stringOrNull('directionMapping', at),
      directionMappingByWire,
      DirectionMapping.unrecognised,
    ),
    categoryAssignmentSource: decodeEnum<CategoryAssignmentOrigin>(
      json.stringOrNull('categoryAssignmentSource', at),
      categoryAssignmentOriginByWire,
      CategoryAssignmentOrigin.unrecognised,
    ),
    createdAt: json.instant('createdAt', at),
  );
}

/// The delete outcome.
///
/// `applied` is true only for a complete delete: PARTIALLY_APPLIED, and any
/// outcome token this build does not recognise, are both reported as not
/// applied. Reporting "deleted" for a delete that did not finish is the one
/// answer this decoder must never give.
TransactionDeletionOutcome decodeDeletionOutcome(JsonMap json) {
  const at = 'TransactionDeletionOutcomeView';
  return TransactionDeletionOutcome(
    transactionId: json.string('transactionId', at),
    applied: json.string('outcome', at) == 'DELETED',
    transferMatchesDeleted: json.integer('transferMatchesDeleted', at),
    code: json.stringOrNull('code', at),
  );
}
