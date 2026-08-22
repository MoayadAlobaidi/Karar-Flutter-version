// EVERY TYPED CODE GETS ITS OWN SENTENCE.
//
// This file is the whole of the translation from the platform vocabularies to
// words a person reads, and it is written as EXHAUSTIVE SWITCHES WITH NO
// DEFAULT ARM. Two properties follow, and both are the point:
//
//   1. A code added to the contract stops this file compiling. Somebody then
//      has to write a sentence for it. A `Map` with a fallback would compile
//      and answer "something went wrong" forever, which is precisely how an
//      important new refusal becomes invisible.
//   2. NO REFUSAL IS EVER GENERIC. `SOURCE_TOO_LARGE` and `SPREADSHEET_CONTENT`
//      send a person to two completely different remedies — split the file
//      versus export it again as CSV — and rounding either to "we could not
//      import your file" throws away the only part that helps.
//
// The `unrecognised` arms are honest rather than generic: they say this VERSION
// does not know the code, which is a true statement about the client and leaves
// the person able to report something useful. They never say the file is
// broken, because that is not known.
//
// A `Map<SomeEnum, String>` here would also trip rule 3 of
// `test/architecture/financial_contract_reading_test.dart`, which is the same
// judgement expressed as a build failure.
import '../../../l10n/generated/app_localizations.dart';
import '../domain/column_mapping.dart';
import '../domain/import_lifecycle.dart';
import '../domain/row_issue.dart';
import '../domain/statement_import.dart';
import '../domain/statement_sample.dart';
import '../domain/statement_source.dart';
import '../domain/statement_source_picker.dart';

String importStateLabel(ImportLifecycleState state, AppLocalizations l10n) =>
    switch (state) {
      ImportLifecycleState.draft => l10n.statementImportStateDraft,
      ImportLifecycleState.sourceStored => l10n.statementImportStateSourceStored,
      ImportLifecycleState.parsing => l10n.statementImportStateParsing,
      ImportLifecycleState.reviewRequired => l10n.statementImportStateReviewRequired,
      ImportLifecycleState.committing => l10n.statementImportStateCommitting,
      ImportLifecycleState.committed => l10n.statementImportStateCommitted,
      ImportLifecycleState.rejected => l10n.statementImportStateRejected,
      ImportLifecycleState.failed => l10n.statementImportStateFailed,
      ImportLifecycleState.duplicate => l10n.statementImportStateDuplicate,
      ImportLifecycleState.erased => l10n.statementImportStateErased,
      ImportLifecycleState.unrecognised => l10n.statementImportStateUnrecognised,
    };

/// The sentence for one typed import refusal.
String importRefusalMessage(ImportRefusal refusal, AppLocalizations l10n) =>
    switch (refusal) {
      ImportRefusal.sourceTooLarge => l10n.statementImportRefusalSourceTooLarge,
      ImportRefusal.tooManyRows => l10n.statementImportRefusalTooManyRows,
      ImportRefusal.tooManyColumns => l10n.statementImportRefusalTooManyColumns,
      ImportRefusal.fieldTooLarge => l10n.statementImportRefusalFieldTooLarge,
      ImportRefusal.bufferedRowsExceeded =>
        l10n.statementImportRefusalBufferedRowsExceeded,
      ImportRefusal.bufferedBytesExceeded =>
        l10n.statementImportRefusalBufferedBytesExceeded,
      ImportRefusal.deadlineExceeded => l10n.statementImportRefusalDeadlineExceeded,
      ImportRefusal.cancelled => l10n.statementImportRefusalCancelled,
      ImportRefusal.tooManyErrors => l10n.statementImportRefusalTooManyErrors,
      ImportRefusal.unsupportedMediaType =>
        l10n.statementImportRefusalUnsupportedMediaType,
      ImportRefusal.invalidEncoding => l10n.statementImportRefusalInvalidEncoding,
      ImportRefusal.binaryContent => l10n.statementImportRefusalBinaryContent,
      ImportRefusal.spreadsheetContent => l10n.statementImportRefusalSpreadsheetContent,
      ImportRefusal.compressedContent => l10n.statementImportRefusalCompressedContent,
      ImportRefusal.malformedQuoting => l10n.statementImportRefusalMalformedQuoting,
      ImportRefusal.emptySource => l10n.statementImportRefusalEmptySource,
      ImportRefusal.noHeaderRow => l10n.statementImportRefusalNoHeaderRow,
      ImportRefusal.mappingAmbiguous => l10n.statementImportRefusalMappingAmbiguous,
      ImportRefusal.multipleAccountsInSource =>
        l10n.statementImportRefusalMultipleAccountsInSource,
      ImportRefusal.currencyMismatch => l10n.statementImportRefusalCurrencyMismatch,
      ImportRefusal.reconciliationMismatch =>
        l10n.statementImportRefusalReconciliationMismatch,
      ImportRefusal.sourceAlreadyImported =>
        l10n.statementImportRefusalSourceAlreadyImported,
      ImportRefusal.sourceIntegrityFailed =>
        l10n.statementImportRefusalSourceIntegrityFailed,
      ImportRefusal.sourceUnreadable => l10n.statementImportRefusalSourceUnreadable,
      ImportRefusal.unrecognised => l10n.statementImportRefusalUnrecognised,
    };

/// The sentence for one typed row refusal. Carries no value from the file,
/// because the platform sent none and this client has nowhere to hold one.
String rowReasonMessage(RowIssueReason reason, AppLocalizations l10n) =>
    switch (reason) {
      RowIssueReason.requiredFieldMissing =>
        l10n.statementImportReasonRequiredFieldMissing,
      RowIssueReason.unreadableAmount => l10n.statementImportReasonUnreadableAmount,
      RowIssueReason.ambiguousDecimalSeparator =>
        l10n.statementImportReasonAmbiguousDecimalSeparator,
      RowIssueReason.ambiguousDateOrder => l10n.statementImportReasonAmbiguousDateOrder,
      RowIssueReason.unreadableDate => l10n.statementImportReasonUnreadableDate,
      RowIssueReason.unreadableInstant => l10n.statementImportReasonUnreadableInstant,
      RowIssueReason.unknownTimezone => l10n.statementImportReasonUnknownTimezone,
      RowIssueReason.unknownCurrency => l10n.statementImportReasonUnknownCurrency,
      RowIssueReason.currencyMismatch => l10n.statementImportReasonCurrencyMismatch,
      RowIssueReason.ambiguousDirection => l10n.statementImportReasonAmbiguousDirection,
      RowIssueReason.debitAndCreditBothPresent =>
        l10n.statementImportReasonDebitAndCreditBothPresent,
      RowIssueReason.debitAndCreditBothAbsent =>
        l10n.statementImportReasonDebitAndCreditBothAbsent,
      RowIssueReason.fieldTooLarge => l10n.statementImportReasonFieldTooLarge,
      RowIssueReason.tooManyColumns => l10n.statementImportReasonTooManyColumns,
      RowIssueReason.columnCountMismatch =>
        l10n.statementImportReasonColumnCountMismatch,
      RowIssueReason.invalidEncoding => l10n.statementImportReasonInvalidEncoding,
      RowIssueReason.malformedQuoting => l10n.statementImportReasonMalformedQuoting,
      RowIssueReason.amountExceedsRange => l10n.statementImportReasonAmountExceedsRange,
      RowIssueReason.decimalPlacesExceedCurrency =>
        l10n.statementImportReasonDecimalPlacesExceedCurrency,
      RowIssueReason.unrecognised => l10n.statementImportReasonUnrecognised,
    };

/// What the person can actually do about a refused row.
String rowRemedyMessage(RowIssueRemedy remedy, AppLocalizations l10n) =>
    switch (remedy) {
      RowIssueRemedy.stateAConvention => l10n.statementImportRemedyStateAConvention,
      RowIssueRemedy.correctTheMapping => l10n.statementImportRemedyCorrectTheMapping,
      RowIssueRemedy.correctTheFile => l10n.statementImportRemedyCorrectTheFile,
      RowIssueRemedy.respectABound => l10n.statementImportRemedyRespectABound,
      RowIssueRemedy.unknown => l10n.statementImportRemedyUnknown,
    };

/// The name of the field a refusal is about, in this client's own vocabulary.
/// Never the header text from the file, which can itself carry an account
/// number.
String statementFieldLabel(StatementField field, AppLocalizations l10n) =>
    switch (field) {
      StatementField.row => l10n.statementImportFieldRow,
      StatementField.bookingDate => l10n.statementImportFieldBookingDate,
      StatementField.valueDate => l10n.statementImportFieldValueDate,
      StatementField.eventOccurredAt => l10n.statementImportFieldEventOccurredAt,
      StatementField.sourceTimezone => l10n.statementImportFieldSourceTimezone,
      StatementField.amount => l10n.statementImportFieldAmount,
      StatementField.debitAmount => l10n.statementImportFieldDebitAmount,
      StatementField.creditAmount => l10n.statementImportFieldCreditAmount,
      StatementField.currency => l10n.statementImportFieldCurrency,
      StatementField.description => l10n.statementImportFieldDescription,
      StatementField.merchant => l10n.statementImportFieldMerchant,
      StatementField.sourceBalance => l10n.statementImportFieldSourceBalance,
      StatementField.sourceReference => l10n.statementImportFieldSourceReference,
      StatementField.instrumentMask => l10n.statementImportFieldInstrumentMask,
      StatementField.unrecognised => l10n.statementImportFieldUnrecognised,
    };

String reconciliationMessage(ReconciliationOutcome outcome, AppLocalizations l10n) =>
    switch (outcome) {
      ReconciliationOutcome.matched => l10n.statementImportReconciliationMatched,
      ReconciliationOutcome.mismatched => l10n.statementImportReconciliationMismatched,
      ReconciliationOutcome.notAvailable =>
        l10n.statementImportReconciliationNotAvailable,
      ReconciliationOutcome.unrecognised =>
        l10n.statementImportReconciliationUnrecognised,
    };

String mappingViolationMessage(MappingViolation violation, AppLocalizations l10n) =>
    switch (violation) {
      MappingViolation.columnIndexInvalid =>
        l10n.statementImportMappingColumnIndexInvalid,
      MappingViolation.columnUsedTwice => l10n.statementImportMappingColumnUsedTwice,
      MappingViolation.currencyNotDetermined =>
        l10n.statementImportMappingCurrencyNotDetermined,
      MappingViolation.currencyDoublyDetermined =>
        l10n.statementImportMappingCurrencyDoublyDetermined,
      MappingViolation.balanceKindNotStated =>
        l10n.statementImportMappingBalanceKindNotStated,
      MappingViolation.timezoneWithoutInstant =>
        l10n.statementImportMappingTimezoneWithoutInstant,
    };

String signFrameLabel(AmountSignFrame frame, AppLocalizations l10n) => switch (frame) {
      AmountSignFrame.accountHolder => l10n.statementImportSignFrameAccountHolder,
      AmountSignFrame.bankLedger => l10n.statementImportSignFrameBankLedger,
    };

String dateOrderLabel(StatementDateOrder order, AppLocalizations l10n) =>
    switch (order) {
      StatementDateOrder.iso => l10n.statementImportDateOrderIso,
      StatementDateOrder.dayFirst => l10n.statementImportDateOrderDayFirst,
      StatementDateOrder.monthFirst => l10n.statementImportDateOrderMonthFirst,
    };

String sourceBalanceKindLabel(SourceBalanceKind kind, AppLocalizations l10n) =>
    switch (kind) {
      SourceBalanceKind.running => l10n.statementImportBalanceKindRunning,
      SourceBalanceKind.ledger => l10n.statementImportBalanceKindLedger,
      SourceBalanceKind.available => l10n.statementImportBalanceKindAvailable,
      SourceBalanceKind.closing => l10n.statementImportBalanceKindClosing,
    };

String statementBalanceKindLabel(StatementBalanceKind kind, AppLocalizations l10n) =>
    switch (kind) {
      StatementBalanceKind.opening => l10n.statementImportStatedBalanceOpening,
      StatementBalanceKind.closing => l10n.statementImportStatedBalanceClosing,
      StatementBalanceKind.ledger => l10n.statementImportStatedBalanceLedger,
      StatementBalanceKind.available => l10n.statementImportStatedBalanceAvailable,
    };

/// Why a chosen file was refused before it was ever uploaded.
String sourceProblemMessage(
  SourceProblem problem,
  AppLocalizations l10n,
  String Function(int megabytes) sizeLimitMessage,
) =>
    switch (problem) {
      SourceProblem.empty => l10n.statementImportSourceEmpty,
      SourceProblem.tooLarge => sizeLimitMessage(maxSourceBytes ~/ (1024 * 1024)),
    };

/// Why the chosen file could not be shown for mapping.
String sampleProblemMessage(SampleProblem problem, AppLocalizations l10n) =>
    switch (problem) {
      SampleProblem.invalidEncoding => l10n.statementImportSampleInvalidEncoding,
      SampleProblem.malformedQuoting => l10n.statementImportSampleMalformedQuoting,
      SampleProblem.empty => l10n.statementImportSourceEmpty,
      SampleProblem.tooManyColumns => l10n.statementImportSampleTooManyColumns,
    };

/// What happened when the device was asked for a document.
///
/// Returns null for the two outcomes that are not messages: a chosen file
/// speaks for itself, and a cancelled picker is a person changing their mind,
/// which is not an event worth narrating back at them.
String? pickerOutcomeMessage(PickerOutcome outcome, AppLocalizations l10n) =>
    switch (outcome) {
      PickerOutcomeChosen() => null,
      PickerOutcomeCancelled() => null,
      PickerOutcomeUnavailable() => l10n.statementImportPickerUnavailableDetail,
      PickerOutcomeUnreadable() => l10n.statementImportPickerUnreadable,
    };
