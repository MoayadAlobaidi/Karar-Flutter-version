// The transactions repository, over the GENERATED client.
//
// Every request is a generated operation and every body is a generated request
// DTO. Nothing here spells a path, a query-parameter name, a body field name
// or an enumeration wire value: the contract states each of those once, and
// the generator is the one reader of it.
//
// Two mappings are load-bearing and are the reason a hand-written mapper still
// exists between the DTOs and the domain:
//
//   * a calendar day goes out as `YYYY-MM-DD` and comes back the same way. The
//     contract types it `format: date`, the generated DTO carries it as a
//     `String`, and this file turns it into [CalendarDay] — never a
//     `DateTime`, in either direction, so no offset is ever applied to a day
//     an institution wrote on its books;
//   * a manual amount goes out as `{ magnitude, direction }`. There is no code
//     path here that sends a signed amount, because the platform refuses one
//     and because a client that guessed the sign would write a wrong record
//     that looks exactly like a right one.
import '../../../core/errors/result.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../financial_accounts/data/api_financial_accounts_repository.dart'
    show railAvailabilityFromDto, sourceKindFromDto, sourceKindToDto;
import '../../financial_accounts/data/contract_mapping.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/domain/page.dart';
import '../domain/transaction.dart';
import '../domain/transaction_detail.dart';
import '../domain/transactions_repository.dart';

/// [TransactionsRepository] over the generated client.
final class ApiTransactionsRepository implements TransactionsRepository {
  const ApiTransactionsRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<Page<Transaction>>> listOwn({
    TransactionFilter filter = const TransactionFilter(),
    int? limit,
    String? cursor,
  }) =>
      guarded<Page<Transaction>>('financial.transactions', () async {
        final response = await _client.listOwnTransactions(
          limit: limit,
          cursor: cursor,
          accountId: filter.accountId,
          currency: filter.currencyCode,
          direction: filter.direction == null
              ? null
              : moneyDirectionToDto(filter.direction!),
          status:
              filter.status == null ? null : transactionStatusToDto(filter.status!),
          sourceKind:
              filter.sourceKind == null ? null : sourceKindToDto(filter.sourceKind!),
          // Days go out as days. A `DateTime` here would attach a time and an
          // offset to something that has neither.
          bookedFrom: filter.bookedFrom?.iso8601,
          bookedTo: filter.bookedTo?.iso8601,
        );
        return pageFrom<Transaction, TransactionViewDto>(
          response.items,
          response.page,
          transactionFromDto,
        );
      });

  @override
  Future<Result<TransactionDetail>> read(String transactionId) =>
      guarded<TransactionDetail>(
        'financial.transactions.read',
        () async => transactionDetailFromDto(
          await _client.readOwnTransaction(transactionId: transactionId),
        ),
      );

  @override
  Future<Result<Transaction>> createManual(ManualTransactionDraft draft) =>
      guarded<Transaction>(
        'financial.transactions.create',
        () async => transactionFromDto(
          await _client.createOwnManualTransaction(body: createBodyFor(draft)),
        ),
      );

  @override
  Future<Result<Transaction>> correct(
    String transactionId,
    TransactionCorrection correction,
  ) =>
      guarded<Transaction>(
        'financial.transactions.correct',
        () async => transactionFromDto(
          await _client.correctOwnTransaction(
            transactionId: transactionId,
            body: correctionBodyFor(correction),
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
        () async => categoryAssignmentFromDto(
          await _client.assignOwnTransactionCategory(
            transactionId: transactionId,
            body: AssignOwnTransactionCategoryRequestDto(categoryCode: categoryCode),
          ),
        ),
      );

  @override
  Future<Result<List<TransactionProvenance>>> listProvenance(String transactionId) =>
      guarded<List<TransactionProvenance>>(
        'financial.transactions.provenance',
        () async {
          final response = await _client.listOwnTransactionProvenance(
            transactionId: transactionId,
          );
          return List<TransactionProvenance>.unmodifiable(<TransactionProvenance>[
            for (final row in response.items) provenanceFromDto(row),
          ]);
        },
      );

  @override
  Future<Result<TransactionDeletionOutcome>> delete(String transactionId) =>
      guarded<TransactionDeletionOutcome>(
        'financial.transactions.delete',
        () async => deletionOutcomeFromDto(
          await _client.deleteOwnTransaction(transactionId: transactionId),
        ),
      );
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/// The manual-entry body.
///
/// `magnitude` and `direction` travel together and the magnitude is
/// non-negative by construction: [MoneyEntry] cannot be built from a signed
/// value, so there is no path here that could send one.
CreateOwnManualTransactionRequestDto createBodyFor(ManualTransactionDraft draft) {
  final merchant = _presentOrNull(draft.merchant);
  final note = _presentOrNull(draft.note);
  return CreateOwnManualTransactionRequestDto(
    accountId: draft.accountId,
    magnitude: amountToDto(draft.entry.magnitude),
    direction: moneyDirectionToDto(draft.entry.direction),
    bookingDate: draft.bookingDate.iso8601,
    description: draft.description.trim(),
    valueDate: draft.valueDate == null
        ? const Omittable<String>.omitted()
        : Omittable<String>.sent(draft.valueDate!.iso8601),
    merchant: merchant == null
        ? const Omittable<String>.omitted()
        : Omittable<String>.sent(merchant),
    note: note == null
        ? const Omittable<String>.omitted()
        : Omittable<String>.sent(note),
  );
}

/// The correction body.
///
/// A field ABSENT is left alone; a field present as `null` is CLEARED. The
/// `clear*` flags are the only way a null reaches the wire.
CorrectOwnTransactionRequestDto correctionBodyFor(TransactionCorrection correction) =>
    CorrectOwnTransactionRequestDto(
      expectedVersion: correction.expectedVersion,
      // Both halves or neither: sending one without the other is a request the
      // platform refuses, and rightly.
      magnitude: correction.entry == null
          ? null
          : amountToDto(correction.entry!.magnitude),
      direction: correction.entry == null
          ? null
          : moneyDirectionToDto(correction.entry!.direction),
      bookingDate: correction.bookingDate?.iso8601,
      valueDate: correction.clearValueDate
          ? const Omittable<String>.sent(null)
          : (correction.valueDate == null
              ? const Omittable<String>.omitted()
              : Omittable<String>.sent(correction.valueDate!.iso8601)),
      merchant: correction.clearMerchant
          ? const Omittable<String>.sent(null)
          : _omittableText(correction.merchant),
      description: _presentOrNull(correction.description),
      note: correction.clearNote
          ? const Omittable<String>.sent(null)
          : _omittableText(correction.note),
      status: correction.status == null
          ? null
          : transactionStatusToDto(correction.status!),
    );

/// The `MinorUnitAmount` a figure travels as.
///
/// `minorUnits` stays the exact characters the domain holds. Nothing here
/// parses it to a number, so nothing can round it.
MinorUnitAmountDto amountToDto(Money money) => MinorUnitAmountDto(
      minorUnits: money.minorUnits,
      currency: money.currency,
      exponent: money.exponent,
    );

String? _presentOrNull(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

/// Text that is sent when the caller supplied some and omitted otherwise.
///
/// Blank is treated as "said nothing", not as "clear it": clearing is the
/// caller's explicit `clear*` flag, so a stray space cannot erase a merchant.
Omittable<String> _omittableText(String? value) {
  final trimmed = _presentOrNull(value);
  return trimmed == null
      ? const Omittable<String>.omitted()
      : Omittable<String>.sent(trimmed);
}

// ---------------------------------------------------------------------------
// Vocabularies
//
// Exhaustive switches, no default arm, in both directions. Regeneration after
// a contract change breaks this file rather than letting a new member fall
// silently into a fallback.
// ---------------------------------------------------------------------------

MoneyDirectionDto moneyDirectionToDto(MoneyDirection direction) =>
    switch (direction) {
      MoneyDirection.moneyOut => MoneyDirectionDto.moneyOut,
      MoneyDirection.moneyIn => MoneyDirectionDto.moneyIn,
      MoneyDirection.unrecognised => throw unwritableVocabularyMember('direction'),
    };

MoneyDirection moneyDirectionFromDto(MoneyDirectionDto dto) => switch (dto) {
      MoneyDirectionDto.moneyOut => MoneyDirection.moneyOut,
      MoneyDirectionDto.moneyIn => MoneyDirection.moneyIn,
      MoneyDirectionDto.unknown => MoneyDirection.unrecognised,
    };

TransactionStatusDto transactionStatusToDto(TransactionStatus status) =>
    switch (status) {
      TransactionStatus.posted => TransactionStatusDto.posted,
      TransactionStatus.voided => TransactionStatusDto.voided,
      TransactionStatus.unrecognised => throw unwritableVocabularyMember('status'),
    };

TransactionStatus transactionStatusFromDto(TransactionStatusDto dto) => switch (dto) {
      TransactionStatusDto.posted => TransactionStatus.posted,
      TransactionStatusDto.voided => TransactionStatus.voided,
      TransactionStatusDto.unknown => TransactionStatus.unrecognised,
    };

SourceDirection sourceDirectionFromDto(SourceDirectionDto dto) => switch (dto) {
      SourceDirectionDto.debit => SourceDirection.debit,
      SourceDirectionDto.credit => SourceDirection.credit,
      SourceDirectionDto.notStated => SourceDirection.notStated,
      SourceDirectionDto.unknown => SourceDirection.unrecognised,
    };

DirectionMapping directionMappingFromDto(DirectionMappingDto dto) => switch (dto) {
      DirectionMappingDto.manualEntry => DirectionMapping.manualEntry,
      DirectionMappingDto.sourceDirectionWord => DirectionMapping.sourceDirectionWord,
      DirectionMappingDto.sourceSignedAmount => DirectionMapping.sourceSignedAmount,
      DirectionMappingDto.sourceSignedAmountInverted =>
        DirectionMapping.sourceSignedAmountInverted,
      DirectionMappingDto.unknown => DirectionMapping.unrecognised,
    };

RevisionAttribution revisionAttributionFromDto(RevisionAttributionDto dto) =>
    switch (dto) {
      RevisionAttributionDto.sourceImport => RevisionAttribution.sourceImport,
      RevisionAttributionDto.manualEntry => RevisionAttribution.manualEntry,
      RevisionAttributionDto.userInput => RevisionAttribution.userInput,
      RevisionAttributionDto.unknown => RevisionAttribution.unrecognised,
    };

RevisableField revisableFieldFromDto(RevisableFieldDto dto) => switch (dto) {
      RevisableFieldDto.amount => RevisableField.amount,
      RevisableFieldDto.bookingdate => RevisableField.bookingDate,
      RevisableFieldDto.valuedate => RevisableField.valueDate,
      RevisableFieldDto.merchant => RevisableField.merchant,
      RevisableFieldDto.description => RevisableField.description,
      RevisableFieldDto.note => RevisableField.note,
      RevisableFieldDto.status => RevisableField.status,
      RevisableFieldDto.unknown => RevisableField.unrecognised,
    };

AssignmentSource assignmentSourceFromDto(AssignmentSourceDto dto) => switch (dto) {
      AssignmentSourceDto.user => AssignmentSource.user,
      AssignmentSourceDto.rule => AssignmentSource.rule,
      AssignmentSourceDto.unknown => AssignmentSource.unrecognised,
    };

AssignmentStatus assignmentStatusFromDto(AssignmentStatusDto dto) => switch (dto) {
      AssignmentStatusDto.active => AssignmentStatus.active,
      AssignmentStatusDto.superseded => AssignmentStatus.superseded,
      AssignmentStatusDto.unknown => AssignmentStatus.unrecognised,
    };

CategoryAssignmentOrigin categoryAssignmentOriginFromDto(
  ProvenanceViewCategoryAssignmentSourceDto dto,
) =>
    switch (dto) {
      ProvenanceViewCategoryAssignmentSourceDto.none => CategoryAssignmentOrigin.none,
      ProvenanceViewCategoryAssignmentSourceDto.user => CategoryAssignmentOrigin.user,
      ProvenanceViewCategoryAssignmentSourceDto.rule => CategoryAssignmentOrigin.rule,
      ProvenanceViewCategoryAssignmentSourceDto.unknown =>
        CategoryAssignmentOrigin.unrecognised,
    };

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

/// One transaction.
Transaction transactionFromDto(TransactionViewDto dto) => Transaction(
      transactionId: dto.transactionId,
      accountId: dto.accountId,
      amount: moneyFrom(dto.amount, 'TransactionView.amount'),
      direction: moneyDirectionFromDto(dto.direction),
      bookingDate: calendarDayFrom(dto.bookingDate, 'TransactionView.bookingDate'),
      valueDate:
          calendarDayFromOrNull(dto.valueDate, 'TransactionView.valueDate'),
      eventOccurredAt: dto.eventOccurredAt,
      sourceTimezone: dto.sourceTimezone,
      merchant: dto.merchant,
      description: dto.description,
      note: dto.note,
      originalAmount:
          moneyFromOrNull(dto.originalAmount, 'TransactionView.originalAmount'),
      sourceKind: sourceKindFromDto(dto.sourceKind),
      availability: railAvailabilityFromDto(dto.availability),
      status: transactionStatusFromDto(dto.status),
      createdAt: dto.createdAt,
      version: dto.version,
    );

/// The transaction with its history, its active category and the divergence
/// the platform stated.
TransactionDetail transactionDetailFromDto(ReadOwnTransactionResponseDto dto) =>
    TransactionDetail(
      transaction: transactionFromDto(dto.transaction),
      revisions: List<TransactionRevision>.unmodifiable(<TransactionRevision>[
        for (final revision in dto.revisions) revisionFromDto(revision),
      ]),
      activeCategory: dto.activeCategory == null
          ? null
          : categoryAssignmentFromDto(dto.activeCategory!),
      divergesFromSource: dto.divergesFromSource,
    );

/// One revision.
TransactionRevision revisionFromDto(TransactionRevisionViewDto dto) =>
    TransactionRevision(
      revisionNumber: dto.revisionNumber,
      attribution: revisionAttributionFromDto(dto.attribution),
      changedFields: List<RevisableField>.unmodifiable(<RevisableField>[
        for (final field in dto.changedFields) revisableFieldFromDto(field),
      ]),
      values: revisionValuesFromDto(dto.values),
      recordedAt: dto.recordedAt,
    );

/// The values one revision recorded.
RevisionValues revisionValuesFromDto(RevisionValuesViewDto dto) => RevisionValues(
      amount: moneyFrom(dto.amount, 'RevisionValuesView.amount'),
      direction: moneyDirectionFromDto(dto.direction),
      bookingDate:
          calendarDayFrom(dto.bookingDate, 'RevisionValuesView.bookingDate'),
      valueDate:
          calendarDayFromOrNull(dto.valueDate, 'RevisionValuesView.valueDate'),
      eventOccurredAt: dto.eventOccurredAt,
      sourceTimezone: dto.sourceTimezone,
      merchant: dto.merchant,
      description: dto.description,
      note: dto.note,
      status: transactionStatusFromDto(dto.status),
    );

/// One category assignment.
CategoryAssignment categoryAssignmentFromDto(CategoryAssignmentViewDto dto) =>
    CategoryAssignment(
      assignmentId: dto.assignmentId,
      categoryCode: dto.categoryCode,
      assignmentSource: assignmentSourceFromDto(dto.assignmentSource),
      ruleVersion: dto.ruleVersion,
      status: assignmentStatusFromDto(dto.status),
      assignedAt: dto.assignedAt,
    );

/// One provenance row.
TransactionProvenance provenanceFromDto(ProvenanceViewDto dto) =>
    TransactionProvenance(
      revisionNumber: dto.revisionNumber,
      sourceKind: sourceKindFromDto(dto.sourceKind),
      availability: railAvailabilityFromDto(dto.availability),
      accountId: dto.accountId,
      importedFromStatement: dto.importedFromStatement,
      versions: ProcessingVersions(
        parserVersion: dto.versions.parserVersion,
        mappingVersion: dto.versions.mappingVersion,
        normalizationVersion: dto.versions.normalizationVersion,
        // The ALGORITHM version. Never a fingerprint, which is a dedup handle
        // and is absent from this projection by construction.
        fingerprintVersion: dto.versions.fingerprintVersion,
      ),
      sourceDirection: sourceDirectionFromDto(dto.sourceDirection),
      directionMapping: directionMappingFromDto(dto.directionMapping),
      categoryAssignmentSource:
          categoryAssignmentOriginFromDto(dto.categoryAssignmentSource),
      createdAt: dto.createdAt,
    );

/// The delete outcome.
///
/// `applied` is true only for a complete delete. The switch is exhaustive:
/// PARTIALLY_APPLIED, and any outcome token this build does not recognise, are
/// both reported as not applied. Reporting "deleted" for a delete that did not
/// finish is the one answer this mapper must never give.
TransactionDeletionOutcome deletionOutcomeFromDto(
  TransactionDeletionOutcomeViewDto dto,
) =>
    TransactionDeletionOutcome(
      transactionId: dto.transactionId,
      applied: switch (dto.outcome) {
        TransactionDeletionOutcomeViewOutcomeDto.deleted => true,
        TransactionDeletionOutcomeViewOutcomeDto.partiallyApplied => false,
        TransactionDeletionOutcomeViewOutcomeDto.unknown => false,
      },
      transferMatchesDeleted: dto.transferMatchesDeleted,
      // The refusal code as the contract spells it. `toWire` answers null for
      // a token this build has never seen, which is the honest rendering: the
      // client holds no name for it and must not invent one.
      code: dto.code?.toWire(),
    );
