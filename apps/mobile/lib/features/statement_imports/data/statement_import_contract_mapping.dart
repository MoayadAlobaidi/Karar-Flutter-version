// THE ONE PLACE THE STATEMENT-IMPORT CONTRACT IS TRANSLATED.
//
// Requests are issued by `KararApiClient`, which is generated from the
// contract. No path, no query-parameter name, no body field name and no
// enumeration wire value is written by hand anywhere in this feature: each
// would be a second reading of a contract that already has one, and a second
// reading is a place for the two to drift apart without anything failing.
//
// What IS written by hand is the mapping between the generated DTOs and the
// domain types, and it lives here and nowhere else.
//
// EVERY vocabulary mapping below is an EXHAUSTIVE switch over the generated
// enumeration with NO DEFAULT ARM. That is the regression guard, not a style:
// the day the contract gains a refusal code or a row reason, regeneration adds
// it to the generated enum and this file stops compiling until somebody decides
// what it means to a person. A `Map` lookup with a fallback would compile
// happily and answer "unrecognised" forever — which is exactly how a new,
// important refusal becomes invisible.
//
// The generated `unknown` member always maps to the domain's `unrecognised`,
// never to a real member: a value this build has not shipped for renders as
// unrecognised rather than as whichever member happened to be first.
import '../../../core/networking/generated/models.dart';
import '../domain/column_mapping.dart';
import '../domain/import_lifecycle.dart';
import '../domain/row_issue.dart';
import '../domain/statement_import.dart';

// ---------------------------------------------------------------------------
// Wire -> domain
// ---------------------------------------------------------------------------

ImportLifecycleState importStateFromDto(ImportStateDto dto) => switch (dto) {
      ImportStateDto.draft => ImportLifecycleState.draft,
      ImportStateDto.sourceStored => ImportLifecycleState.sourceStored,
      ImportStateDto.parsing => ImportLifecycleState.parsing,
      ImportStateDto.reviewRequired => ImportLifecycleState.reviewRequired,
      ImportStateDto.committing => ImportLifecycleState.committing,
      ImportStateDto.committed => ImportLifecycleState.committed,
      ImportStateDto.rejected => ImportLifecycleState.rejected,
      ImportStateDto.failed => ImportLifecycleState.failed,
      ImportStateDto.duplicate => ImportLifecycleState.duplicate,
      ImportStateDto.erased => ImportLifecycleState.erased,
      ImportStateDto.unknown => ImportLifecycleState.unrecognised,
    };

ImportRefusal importRefusalFromDto(ImportRefusalCodeDto dto) => switch (dto) {
      ImportRefusalCodeDto.sourceTooLarge => ImportRefusal.sourceTooLarge,
      ImportRefusalCodeDto.tooManyRows => ImportRefusal.tooManyRows,
      ImportRefusalCodeDto.tooManyColumns => ImportRefusal.tooManyColumns,
      ImportRefusalCodeDto.fieldTooLarge => ImportRefusal.fieldTooLarge,
      ImportRefusalCodeDto.bufferedRowsExceeded => ImportRefusal.bufferedRowsExceeded,
      ImportRefusalCodeDto.bufferedBytesExceeded => ImportRefusal.bufferedBytesExceeded,
      ImportRefusalCodeDto.deadlineExceeded => ImportRefusal.deadlineExceeded,
      ImportRefusalCodeDto.cancelled => ImportRefusal.cancelled,
      ImportRefusalCodeDto.tooManyErrors => ImportRefusal.tooManyErrors,
      ImportRefusalCodeDto.unsupportedMediaType => ImportRefusal.unsupportedMediaType,
      ImportRefusalCodeDto.invalidEncoding => ImportRefusal.invalidEncoding,
      ImportRefusalCodeDto.binaryContent => ImportRefusal.binaryContent,
      ImportRefusalCodeDto.spreadsheetContent => ImportRefusal.spreadsheetContent,
      ImportRefusalCodeDto.compressedContent => ImportRefusal.compressedContent,
      ImportRefusalCodeDto.malformedQuoting => ImportRefusal.malformedQuoting,
      ImportRefusalCodeDto.emptySource => ImportRefusal.emptySource,
      ImportRefusalCodeDto.noHeaderRow => ImportRefusal.noHeaderRow,
      ImportRefusalCodeDto.mappingAmbiguous => ImportRefusal.mappingAmbiguous,
      ImportRefusalCodeDto.multipleAccountsInSource =>
        ImportRefusal.multipleAccountsInSource,
      ImportRefusalCodeDto.currencyMismatch => ImportRefusal.currencyMismatch,
      ImportRefusalCodeDto.reconciliationMismatch => ImportRefusal.reconciliationMismatch,
      ImportRefusalCodeDto.sourceAlreadyImported => ImportRefusal.sourceAlreadyImported,
      ImportRefusalCodeDto.sourceIntegrityFailed => ImportRefusal.sourceIntegrityFailed,
      ImportRefusalCodeDto.sourceUnreadable => ImportRefusal.sourceUnreadable,
      ImportRefusalCodeDto.unknown => ImportRefusal.unrecognised,
    };

ReconciliationOutcome reconciliationFromDto(ReconciliationStatusDto dto) => switch (dto) {
      ReconciliationStatusDto.notAvailable => ReconciliationOutcome.notAvailable,
      ReconciliationStatusDto.matched => ReconciliationOutcome.matched,
      ReconciliationStatusDto.mismatched => ReconciliationOutcome.mismatched,
      ReconciliationStatusDto.unknown => ReconciliationOutcome.unrecognised,
    };

StatementField safeFieldFromDto(SafeFieldDto dto) => switch (dto) {
      SafeFieldDto.row => StatementField.row,
      SafeFieldDto.bookingDate => StatementField.bookingDate,
      SafeFieldDto.valueDate => StatementField.valueDate,
      SafeFieldDto.eventOccurredAt => StatementField.eventOccurredAt,
      SafeFieldDto.sourceTimezone => StatementField.sourceTimezone,
      SafeFieldDto.amount => StatementField.amount,
      SafeFieldDto.debitAmount => StatementField.debitAmount,
      SafeFieldDto.creditAmount => StatementField.creditAmount,
      SafeFieldDto.currency => StatementField.currency,
      SafeFieldDto.description => StatementField.description,
      SafeFieldDto.merchant => StatementField.merchant,
      SafeFieldDto.sourceBalance => StatementField.sourceBalance,
      SafeFieldDto.sourceReference => StatementField.sourceReference,
      SafeFieldDto.instrumentMask => StatementField.instrumentMask,
      SafeFieldDto.unknown => StatementField.unrecognised,
    };

RowIssueReason rowReasonFromDto(RowErrorReasonCodeDto dto) => switch (dto) {
      RowErrorReasonCodeDto.requiredFieldMissing => RowIssueReason.requiredFieldMissing,
      RowErrorReasonCodeDto.unreadableAmount => RowIssueReason.unreadableAmount,
      RowErrorReasonCodeDto.ambiguousDecimalSeparator =>
        RowIssueReason.ambiguousDecimalSeparator,
      RowErrorReasonCodeDto.ambiguousDateOrder => RowIssueReason.ambiguousDateOrder,
      RowErrorReasonCodeDto.unreadableDate => RowIssueReason.unreadableDate,
      RowErrorReasonCodeDto.unreadableInstant => RowIssueReason.unreadableInstant,
      RowErrorReasonCodeDto.unknownTimezone => RowIssueReason.unknownTimezone,
      RowErrorReasonCodeDto.unknownCurrency => RowIssueReason.unknownCurrency,
      RowErrorReasonCodeDto.currencyMismatch => RowIssueReason.currencyMismatch,
      RowErrorReasonCodeDto.ambiguousDirection => RowIssueReason.ambiguousDirection,
      RowErrorReasonCodeDto.debitAndCreditBothPresent =>
        RowIssueReason.debitAndCreditBothPresent,
      RowErrorReasonCodeDto.debitAndCreditBothAbsent =>
        RowIssueReason.debitAndCreditBothAbsent,
      RowErrorReasonCodeDto.fieldTooLarge => RowIssueReason.fieldTooLarge,
      RowErrorReasonCodeDto.tooManyColumns => RowIssueReason.tooManyColumns,
      RowErrorReasonCodeDto.columnCountMismatch => RowIssueReason.columnCountMismatch,
      RowErrorReasonCodeDto.invalidEncoding => RowIssueReason.invalidEncoding,
      RowErrorReasonCodeDto.malformedQuoting => RowIssueReason.malformedQuoting,
      RowErrorReasonCodeDto.amountExceedsRange => RowIssueReason.amountExceedsRange,
      RowErrorReasonCodeDto.decimalPlacesExceedCurrency =>
        RowIssueReason.decimalPlacesExceedCurrency,
      RowErrorReasonCodeDto.unknown => RowIssueReason.unrecognised,
    };

ImportCounts countsFromDto(ImportCountsViewDto dto) => ImportCounts(
      rowCount: dto.rowCount,
      validRowCount: dto.validRowCount,
      invalidRowCount: dto.invalidRowCount,
      exactDuplicateCount: dto.exactDuplicateCount,
      probableDuplicateCount: dto.probableDuplicateCount,
      committedTransactionCount: dto.committedTransactionCount,
    );

RowIssue rowIssueFromDto(RowErrorViewDto dto) => RowIssue(
      rowNumber: dto.rowNumber,
      field: safeFieldFromDto(dto.safeField),
      reason: rowReasonFromDto(dto.reasonCode),
    );

/// The full import view — the only response that carries `version`, and
/// therefore the only one that enables a later commit.
StatementImportSnapshot snapshotFromViewDto(StatementImportViewDto dto) =>
    StatementImportSnapshot(
      importId: dto.importId,
      state: importStateFromDto(dto.state),
      accountId: dto.accountId,
      counts: countsFromDto(dto.counts),
      reconciliation: reconciliationFromDto(dto.reconciliationStatus),
      awaitsDecision: dto.awaitsDecision,
      hasStoredSource: dto.hasStoredSource,
      refusal: dto.refusalCode == null ? null : importRefusalFromDto(dto.refusalCode!),
      version: dto.version,
    );

/// The status view. Carries no `version` — the contract states that absence as
/// a limitation, so the snapshot's is null and a commit cannot be issued from
/// a read alone.
StatementImportSnapshot snapshotFromStatusDto(StatementImportStatusViewDto dto) =>
    StatementImportSnapshot(
      importId: dto.importId,
      state: importStateFromDto(dto.state),
      accountId: dto.accountId,
      counts: countsFromDto(dto.counts),
      reconciliation: reconciliationFromDto(dto.reconciliationStatus),
      awaitsDecision: dto.awaitsDecision,
      hasStoredSource: dto.hasStoredSource,
      refusal: dto.refusalCode == null ? null : importRefusalFromDto(dto.refusalCode!),
    );

StatementImportPreview previewFromDto(StatementImportPreviewViewDto dto) =>
    StatementImportPreview(
      snapshot: StatementImportSnapshot(
        importId: dto.importId,
        state: importStateFromDto(dto.state),
        accountId: dto.accountId,
        counts: countsFromDto(dto.counts),
        reconciliation: reconciliationFromDto(dto.reconciliationStatus),
        awaitsDecision: dto.awaitsDecision,
        hasStoredSource: dto.hasStoredSource,
        refusal: dto.refusalCode == null ? null : importRefusalFromDto(dto.refusalCode!),
      ),
      rowIssues: dto.rowErrors.map(rowIssueFromDto).toList(growable: false),
      reportedErrorCount: dto.reportedErrorCount,
      totalErrorCount: dto.totalErrorCount,
    );

ImportCommitReceipt commitReceiptFromDto(StatementImportCommittedViewDto dto) =>
    ImportCommitReceipt(
      importId: dto.importId,
      committedTransactionCount: dto.committedTransactionCount,
      alreadyCommitted: dto.alreadyCommitted,
      transactionIds: List<String>.unmodifiable(dto.transactionIds),
    );

ImportErasureReceipt erasureReceiptFromDto(StatementImportErasedViewDto dto) =>
    ImportErasureReceipt(
      importId: dto.importId,
      storedObjectDeleted: dto.storedObjectDeleted,
      rowsDeleted: dto.rowsDeleted,
    );

/// The cursor for the next page of row errors, or null when there is none.
String? nextPreviewCursor(StatementImportPreviewViewDto dto) =>
    dto.page.hasMore ? dto.page.nextCursor : null;

// ---------------------------------------------------------------------------
// Domain -> wire
// ---------------------------------------------------------------------------

StatementColumnMappingDateOrderDto dateOrderToDto(StatementDateOrder order) =>
    switch (order) {
      StatementDateOrder.iso => StatementColumnMappingDateOrderDto.iso,
      StatementDateOrder.dayFirst => StatementColumnMappingDateOrderDto.dayFirst,
      StatementDateOrder.monthFirst => StatementColumnMappingDateOrderDto.monthFirst,
    };

AmountColumnsSignedSignFrameDto signFrameToDto(AmountSignFrame frame) => switch (frame) {
      AmountSignFrame.accountHolder => AmountColumnsSignedSignFrameDto.accountHolder,
      AmountSignFrame.bankLedger => AmountColumnsSignedSignFrameDto.bankLedger,
    };

StatementColumnMappingSourceBalanceKindDto sourceBalanceKindToDto(
  SourceBalanceKind kind,
) =>
    switch (kind) {
      SourceBalanceKind.running => StatementColumnMappingSourceBalanceKindDto.running,
      SourceBalanceKind.ledger => StatementColumnMappingSourceBalanceKindDto.ledger,
      SourceBalanceKind.available => StatementColumnMappingSourceBalanceKindDto.available,
      SourceBalanceKind.closing => StatementColumnMappingSourceBalanceKindDto.closing,
    };

StatedStatementBalanceKindDto statementBalanceKindToDto(StatementBalanceKind kind) =>
    switch (kind) {
      StatementBalanceKind.opening => StatedStatementBalanceKindDto.opening,
      StatementBalanceKind.closing => StatedStatementBalanceKindDto.closing,
      StatementBalanceKind.ledger => StatedStatementBalanceKindDto.ledger,
      StatementBalanceKind.available => StatedStatementBalanceKindDto.available,
    };

AmountColumnsDto amountColumnsToDto(AmountMapping amount) => switch (amount) {
      SignedAmountMapping(:final amountColumn, :final signFrame) => AmountColumnsSignedDto(
          amountColumn: amountColumn,
          signFrame: signFrameToDto(signFrame),
        ),
      DebitCreditAmountMapping(:final debitColumn, :final creditColumn) =>
        AmountColumnsDebitCreditDto(
          debitColumn: debitColumn,
          creditColumn: creditColumn,
        ),
    };

StatementColumnMappingDto mappingToDto(StatementColumnMapping mapping) =>
    StatementColumnMappingDto(
      bookingDateColumn: mapping.bookingDateColumn,
      descriptionColumn: mapping.descriptionColumn,
      amount: amountColumnsToDto(mapping.amount),
      hasHeaderRow: mapping.hasHeaderRow,
      valueDateColumn: mapping.valueDateColumn,
      eventOccurredAtColumn: mapping.eventOccurredAtColumn,
      sourceTimezoneColumn: mapping.sourceTimezoneColumn,
      merchantColumn: mapping.merchantColumn,
      currencyColumn: mapping.currencyColumn,
      statedCurrency: mapping.statedCurrencyCode,
      sourceBalanceColumn: mapping.sourceBalanceColumn,
      sourceBalanceKind: mapping.sourceBalanceKind == null
          ? null
          : sourceBalanceKindToDto(mapping.sourceBalanceKind!),
      sourceReferenceColumn: mapping.sourceReferenceColumn,
      instrumentMaskColumn: mapping.instrumentMaskColumn,
      accountIdentifierColumn: mapping.accountIdentifierColumn,
      dateOrder: mapping.dateOrder == null ? null : dateOrderToDto(mapping.dateOrder!),
    );

StatedStatementBalanceDto statedBalanceToDto(StatedStatementBalance balance) =>
    StatedStatementBalanceDto(
      minorUnits: balance.minorUnits,
      kind: statementBalanceKindToDto(balance.kind),
      currency: balance.currencyCode,
    );
