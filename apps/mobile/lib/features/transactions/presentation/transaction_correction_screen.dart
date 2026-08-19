// CORRECTING A TRANSACTION.
//
// A correction APPENDS a revision. The previous values stay in the history and
// the imported value remains attributable, which is why this screen says so
// before a person changes anything.
//
// `expectedVersion` travels with every correction, so a concurrent change is
// refused rather than silently discarded. The fields are seeded from what is
// stored and only what actually differs is sent — an empty change set is
// declined locally rather than provoking the platform's own refusal.
//
// The account, the currency, the source instant and the source time zone are
// NOT correctable, and there is no control for any of them: changing one would
// make the record a different record while keeping its history, which is how a
// corrected row becomes an untraceable one.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/calendar_day.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../domain/transaction.dart';
import '../domain/transaction_detail.dart';
import '../domain/transactions_repository.dart';
import 'transaction_labels.dart';
import 'transactions_providers.dart';

/// The correction form.
final class TransactionCorrectionScreen extends ConsumerStatefulWidget {
  const TransactionCorrectionScreen({required this.transactionId, super.key});

  final String transactionId;

  @override
  ConsumerState<TransactionCorrectionScreen> createState() =>
      _TransactionCorrectionScreenState();
}

class _TransactionCorrectionScreenState
    extends ConsumerState<TransactionCorrectionScreen> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _bookingDate = TextEditingController();
  final TextEditingController _description = TextEditingController();
  final TextEditingController _merchant = TextEditingController();
  final TextEditingController _note = TextEditingController();

  MoneyDirection? _direction;
  TransactionStatus? _status;
  String? _seededFor;
  List<String> _localErrors = const <String>[];

  @override
  void dispose() {
    _amount.dispose();
    _bookingDate.dispose();
    _description.dispose();
    _merchant.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final detail = ref.watch(transactionDetailProvider(widget.transactionId));
    final write = ref.watch(transactionWriteControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.transactionCorrectTitle,
        onBack: () => context.go(
          FinancialRoutes.transactionDetailPath(widget.transactionId),
        ),
      ),
      body: SafeArea(
        top: false,
        child: detail.when(
          loading: () => KararLoadingView(subject: l10n.transactionCorrectTitle),
          error: (Object error, StackTrace _) => Center(
            child: SingleChildScrollView(
              padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
              child: KararStateView.error(
                title: l10n.transactionDetailUnavailableTitle,
                message: l10n.transactionDetailUnavailableDescription,
              ),
            ),
          ),
          data: (TransactionDetail value) => _form(context, l10n, value, write),
        ),
      ),
    );
  }

  Widget _form(
    BuildContext context,
    AppLocalizations l10n,
    TransactionDetail detail,
    TransactionWriteState write,
  ) {
    _seed(detail.transaction);
    final transaction = detail.transaction;

    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        KararBanner(
          message: l10n.transactionCorrectNotice,
          tone: KararStatusTone.info,
        ),
        SizedBox(height: context.spacing.md),
        if (_localErrors.isNotEmpty)
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
            child: Semantics(
              liveRegion: true,
              child: KararBanner(
                title: l10n.transactionFormValidationSummaryTitle,
                message: <String>[
                  for (final error in _localErrors) _errorLabel(error, l10n),
                ].join('\n'),
                tone: KararStatusTone.danger,
              ),
            ),
          ),
        _CorrectionOutcome(state: write, l10n: l10n),
        KararCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              LabelledValue(
                label: l10n.accountCurrencyLabel,
                value: transaction.amount.currency,
              ),
              SizedBox(height: context.spacing.md),
              KararTextField(
                label: l10n.transactionFormMagnitudeLabel,
                helperText: l10n.transactionFormMagnitudeHelper,
                controller: _amount,
                keyboardType: TextInputType.number,
                normalizeArabicDigits: true,
              ),
              SizedBox(height: context.spacing.md),
              FinancialChoiceRow(
                label: l10n.transactionFormDirectionLabel,
                children: <Widget>[
                  for (final direction in <MoneyDirection>[
                    MoneyDirection.moneyIn,
                    MoneyDirection.moneyOut,
                  ])
                    FinancialChoice(
                      label: moneyDirectionLabel(direction, l10n),
                      isSelected: _direction == direction,
                      onPressed: () => setState(() => _direction = direction),
                    ),
                ],
              ),
              KararTextField(
                label: l10n.transactionFormBookingDateLabel,
                helperText: l10n.transactionFormDayHelper,
                controller: _bookingDate,
                normalizeArabicDigits: true,
              ),
              SizedBox(height: context.spacing.md),
              KararTextField(
                label: l10n.transactionFormDescriptionLabel,
                controller: _description,
                maxLength: 512,
              ),
              SizedBox(height: context.spacing.md),
              KararTextField(
                label: l10n.transactionFormMerchantLabel,
                helperText: l10n.transactionFormOptionalHelper,
                controller: _merchant,
                maxLength: 512,
              ),
              SizedBox(height: context.spacing.md),
              KararTextField(
                label: l10n.transactionFormNoteLabel,
                helperText: l10n.transactionFormOptionalHelper,
                controller: _note,
                maxLength: 512,
              ),
              SizedBox(height: context.spacing.md),
              FinancialChoiceRow(
                label: l10n.transactionFilterStatusLabel,
                children: <Widget>[
                  for (final status in <TransactionStatus>[
                    TransactionStatus.posted,
                    TransactionStatus.voided,
                  ])
                    FinancialChoice(
                      label: transactionStatusLabel(status, l10n),
                      isSelected: _status == status,
                      onPressed: () => setState(() => _status = status),
                    ),
                ],
              ),
              SizedBox(height: context.spacing.lg),
              KararButton(
                label: l10n.actionSave,
                isFullWidth: true,
                isLoading: write is TransactionWriteSubmitting,
                onPressed: () => _submit(transaction),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// Fills the form from the stored values once, so a rebuild does not
  /// overwrite an edit in progress.
  void _seed(Transaction transaction) {
    if (_seededFor == transaction.transactionId) {
      return;
    }
    _seededFor = transaction.transactionId;
    _amount.text = _typedAmountOf(transaction.amount);
    _bookingDate.text = transaction.bookingDate.iso8601;
    _description.text = transaction.description;
    _merchant.text = transaction.merchant ?? '';
    _note.text = transaction.note ?? '';
    _direction = transaction.direction;
    _status = transaction.status;
  }

  void _submit(Transaction transaction) {
    final errors = <String>[];
    final minorUnits =
        minorUnitsFromTypedAmount(_amount.text, transaction.amount.exponent);
    if (minorUnits == null) {
      errors.add(TransactionDraftViolation.magnitudeRequired.name);
    }
    final bookingDate = CalendarDay.tryParse(_bookingDate.text.trim());
    if (bookingDate == null) {
      errors.add('bookingDate');
    }
    if (_description.text.trim().isEmpty) {
      errors.add(TransactionDraftViolation.descriptionRequired.name);
    }
    setState(() => _localErrors = errors);
    if (errors.isNotEmpty || minorUnits == null || bookingDate == null) {
      return;
    }

    // Only what actually differs is sent. The magnitude and the direction
    // travel together or not at all, exactly as the platform requires.
    final storedMagnitude = transaction.amount.magnitudeMinorUnits;
    final amountChanged =
        minorUnits != storedMagnitude || _direction != transaction.direction;

    unawaited(
      ref.read(transactionWriteControllerProvider.notifier).correct(
            transaction.transactionId,
            TransactionCorrection(
              expectedVersion: transaction.version,
              entry: amountChanged
                  ? MoneyEntry(
                      magnitude: Money(
                        minorUnits: minorUnits,
                        currency: transaction.amount.currency,
                        exponent: transaction.amount.exponent,
                      ),
                      direction: _direction ?? transaction.direction,
                    )
                  : null,
              bookingDate:
                  bookingDate == transaction.bookingDate ? null : bookingDate,
              description: _description.text.trim() == transaction.description
                  ? null
                  : _description.text.trim(),
              merchant: _merchant.text.trim() == (transaction.merchant ?? '')
                  ? null
                  : (_merchant.text.trim().isEmpty ? null : _merchant.text.trim()),
              clearMerchant:
                  transaction.merchant != null && _merchant.text.trim().isEmpty,
              note: _note.text.trim() == (transaction.note ?? '')
                  ? null
                  : (_note.text.trim().isEmpty ? null : _note.text.trim()),
              clearNote: transaction.note != null && _note.text.trim().isEmpty,
              status: _status == transaction.status ? null : _status,
            ),
          ),
    );
  }

  String _errorLabel(String field, AppLocalizations l10n) {
    if (field == TransactionDraftViolation.magnitudeRequired.name) {
      return l10n.transactionFormErrorMagnitude;
    }
    if (field == TransactionDraftViolation.descriptionRequired.name) {
      return l10n.transactionFormErrorDescription;
    }
    return l10n.transactionFormErrorBookingDate;
  }
}

/// Renders the stored minor units back into something a person can edit.
///
/// String arithmetic only: the digits are split at the exponent, which is the
/// exact inverse of `minorUnitsFromTypedAmount`.
String _typedAmountOf(Money money) {
  final digits = money.magnitudeMinorUnits;
  if (money.exponent <= 0) {
    return digits;
  }
  final padded = digits.padLeft(money.exponent + 1, '0');
  final split = padded.length - money.exponent;
  return '${padded.substring(0, split)}.${padded.substring(split)}';
}

final class _CorrectionOutcome extends StatelessWidget {
  const _CorrectionOutcome({required this.state, required this.l10n});

  final TransactionWriteState state;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final Widget? banner = switch (state) {
      TransactionWriteIdle() ||
      TransactionWriteSubmitting() ||
      TransactionCategorySaved() ||
      TransactionDeleteSettled() =>
        null,
      TransactionWriteSaved() => KararBanner(
          message: l10n.transactionCorrectionSaved,
          tone: KararStatusTone.success,
        ),
      TransactionWriteRejected(:final isVersionConflict, :final isNoChange) =>
        KararBanner(
          message: isVersionConflict
              ? l10n.transactionVersionConflict
              : isNoChange
                  ? l10n.transactionNoChange
                  : l10n.transactionRejected,
          tone: KararStatusTone.danger,
        ),
    };
    if (banner == null) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
      child: Semantics(liveRegion: true, child: banner),
    );
  }
}
