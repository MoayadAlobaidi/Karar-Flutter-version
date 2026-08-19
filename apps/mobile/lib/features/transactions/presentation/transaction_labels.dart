// The transaction vocabularies, turned into translated copy.
//
// Exhaustive switches, an `unrecognised` arm with its own copy, and no
// `default` — the same rule as `financial_accounts/presentation/financial_labels.dart`
// and for the same reason.
import '../../../l10n/karar_localization.dart';
import '../../financial_accounts/domain/money.dart';
import '../domain/transaction.dart';
import '../domain/transaction_detail.dart';

String moneyDirectionLabel(MoneyDirection direction, AppLocalizations l10n) =>
    switch (direction) {
      MoneyDirection.moneyIn => l10n.directionMoneyIn,
      MoneyDirection.moneyOut => l10n.directionMoneyOut,
      MoneyDirection.unrecognised => l10n.directionUnrecognised,
    };

String transactionStatusLabel(TransactionStatus status, AppLocalizations l10n) =>
    switch (status) {
      TransactionStatus.posted => l10n.transactionStatusPosted,
      TransactionStatus.voided => l10n.transactionStatusVoided,
      TransactionStatus.unrecognised => l10n.transactionStatusUnrecognised,
    };

String revisionAttributionLabel(RevisionAttribution attribution, AppLocalizations l10n) =>
    switch (attribution) {
      RevisionAttribution.sourceImport => l10n.transactionRevisionSourceImport,
      RevisionAttribution.manualEntry => l10n.transactionRevisionManualEntry,
      RevisionAttribution.userInput => l10n.transactionRevisionUserInput,
      RevisionAttribution.unrecognised => l10n.transactionRevisionUnrecognised,
    };

String revisableFieldLabel(RevisableField field, AppLocalizations l10n) =>
    switch (field) {
      RevisableField.amount => l10n.revisableFieldAmount,
      RevisableField.bookingDate => l10n.revisableFieldBookingDate,
      RevisableField.valueDate => l10n.revisableFieldValueDate,
      RevisableField.merchant => l10n.revisableFieldMerchant,
      RevisableField.description => l10n.revisableFieldDescription,
      RevisableField.note => l10n.revisableFieldNote,
      RevisableField.status => l10n.revisableFieldStatus,
      RevisableField.unrecognised => l10n.revisableFieldUnrecognised,
    };

String sourceDirectionLabel(SourceDirection direction, AppLocalizations l10n) =>
    switch (direction) {
      SourceDirection.debit => l10n.sourceDirectionDebit,
      SourceDirection.credit => l10n.sourceDirectionCredit,
      SourceDirection.notStated => l10n.sourceDirectionNotStated,
      SourceDirection.unrecognised => l10n.sourceDirectionUnrecognised,
    };

String directionMappingLabel(DirectionMapping mapping, AppLocalizations l10n) =>
    switch (mapping) {
      DirectionMapping.manualEntry => l10n.directionMappingManualEntry,
      DirectionMapping.sourceDirectionWord => l10n.directionMappingSourceDirectionWord,
      DirectionMapping.sourceSignedAmount => l10n.directionMappingSourceSignedAmount,
      DirectionMapping.sourceSignedAmountInverted =>
        l10n.directionMappingSourceSignedAmountInverted,
      DirectionMapping.unrecognised => l10n.directionMappingUnrecognised,
    };

String assignmentSourceLabel(AssignmentSource source, AppLocalizations l10n) =>
    switch (source) {
      AssignmentSource.user => l10n.transactionCategoryByUser,
      AssignmentSource.rule => l10n.transactionCategoryByRule,
      AssignmentSource.unrecognised => l10n.transactionCategoryBySourceUnrecognised,
    };

String categoryAssignmentOriginLabel(
  CategoryAssignmentOrigin origin,
  AppLocalizations l10n,
) =>
    switch (origin) {
      CategoryAssignmentOrigin.none => l10n.transactionCategoryNone,
      CategoryAssignmentOrigin.user => l10n.transactionCategoryByUser,
      CategoryAssignmentOrigin.rule => l10n.transactionCategoryByRule,
      CategoryAssignmentOrigin.unrecognised =>
        l10n.transactionCategoryBySourceUnrecognised,
    };
