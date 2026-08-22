// RECORDING A TRANSACTION BY HAND.
//
// The amount is entered as a MAGNITUDE and a DIRECTION, never as a signed
// number. There is no field on this form that accepts a minus sign, and the
// draft type refuses one: a client that got the sign backwards would write a
// wrong financial record that looks exactly like a right one, and the platform
// refuses a signed amount for the same reason.
//
// What the person types becomes minor units by STRING transformation, with the
// currency's own exponent — see `minorUnitsFromTypedAmount`. No `double` is
// constructed anywhere on this path.
//
// The booking date is typed and parsed as a CALENDAR DAY. It is never turned
// into a `DateTime`, so the day that is stored is the day that was typed
// wherever the phone happens to be.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/calendar_day.dart';
import '../../financial_accounts/domain/financial_account.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/presentation/accounts_providers.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../domain/transactions_repository.dart';
import 'transaction_labels.dart';
import 'transactions_providers.dart';

/// The manual-transaction form.
final class ManualTransactionScreen extends ConsumerStatefulWidget {
  const ManualTransactionScreen({super.key});

  @override
  ConsumerState<ManualTransactionScreen> createState() =>
      _ManualTransactionScreenState();
}

class _ManualTransactionScreenState
    extends ConsumerState<ManualTransactionScreen> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _bookingDate = TextEditingController();
  final TextEditingController _valueDate = TextEditingController();
  final TextEditingController _description = TextEditingController();
  final TextEditingController _merchant = TextEditingController();
  final TextEditingController _note = TextEditingController();

  String? _accountId;
  MoneyDirection _direction = MoneyDirection.moneyOut;
  List<String> _localErrors = const <String>[];

  @override
  void dispose() {
    _amount.dispose();
    _bookingDate.dispose();
    _valueDate.dispose();
    _description.dispose();
    _merchant.dispose();
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final write = ref.watch(transactionWriteControllerProvider);
    final accountsView = ref.watch(ownAccountsProvider).value;
    final accounts = accountsView is AccountsLoaded
        ? accountsView.accounts
        : const <FinancialAccount>[];

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.transactionFormCreateTitle,
        onBack: () => context.go(FinancialRoutes.transactions),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          children: <Widget>[
            if (accounts.isEmpty)
              KararStateView.empty(
                title: l10n.transactionFormNoAccounts,
                message: l10n.accountsEmptyDescription,
                actionLabel: l10n.accountsAddManualAction,
                onAction: () => context.go(FinancialRoutes.accountCreate),
              )
            else ...<Widget>[
              _ValidationSummary(errors: _localErrors, l10n: l10n),
              _Outcome(state: write, l10n: l10n),
              KararCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    FinancialChoiceRow(
                      label: l10n.transactionFormAccountLabel,
                      children: <Widget>[
                        for (final account in accounts)
                          FinancialChoice(
                            label: account.displayName,
                            isSelected: _accountId == account.accountId,
                            onPressed: () =>
                                setState(() => _accountId = account.accountId),
                          ),
                      ],
                    ),
                    KararTextField(
                      label: l10n.transactionFormMagnitudeLabel,
                      helperText: l10n.transactionFormMagnitudeHelper,
                      controller: _amount,
                      keyboardType: TextInputType.number,
                      // Arabic-Indic digits are normalised on the way in, so a
                      // person typing in their own numerals is understood.
                      normalizeArabicDigits: true,
                      isRequired: true,
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
                            onPressed: () =>
                                setState(() => _direction = direction),
                          ),
                      ],
                    ),
                    KararTextField(
                      label: l10n.transactionFormBookingDateLabel,
                      helperText: l10n.transactionFormDayHelper,
                      controller: _bookingDate,
                      normalizeArabicDigits: true,
                      isRequired: true,
                    ),
                    SizedBox(height: context.spacing.md),
                    KararTextField(
                      label: l10n.transactionFormValueDateLabel,
                      helperText: l10n.transactionFormOptionalHelper,
                      controller: _valueDate,
                      normalizeArabicDigits: true,
                    ),
                    SizedBox(height: context.spacing.md),
                    KararTextField(
                      label: l10n.transactionFormDescriptionLabel,
                      controller: _description,
                      isRequired: true,
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
                    SizedBox(height: context.spacing.lg),
                    KararButton(
                      label: l10n.actionSave,
                      isFullWidth: true,
                      isLoading: write is TransactionWriteSubmitting,
                      onPressed: () => _submit(accounts),
                    ),
                    // THE ANSWER TO THE DUPLICATE QUESTION, offered only when
                    // the platform has actually asked it. A second, separate
                    // control rather than a change to Save: re-pressing Save
                    // would be the same unqualified claim and would be refused
                    // identically forever, and a person pressing it twice must
                    // not silently become a person asserting a repeat.
                    if (write is TransactionDuplicateRefused) ...<Widget>[
                      SizedBox(height: context.spacing.md),
                      KararButton(
                        label: l10n.transactionDuplicateConfirmAction,
                        isFullWidth: true,
                        onPressed: () => unawaited(
                          ref
                              .read(transactionWriteControllerProvider.notifier)
                              .confirmAnotherOccurrence(write),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _submit(List<FinancialAccount> accounts) {
    final errors = <String>[];
    final accountId = _accountId;
    final account = accountId == null
        ? null
        : accounts
              .where((FinancialAccount a) => a.accountId == accountId)
              .firstOrNull;
    if (account == null) {
      errors.add(TransactionDraftViolation.accountRequired.name);
    }
    final minorUnits = account == null
        ? null
        : minorUnitsFromTypedAmount(_amount.text, account.currency.exponent);
    if (minorUnits == null) {
      errors.add(TransactionDraftViolation.magnitudeRequired.name);
    }
    final bookingDate = CalendarDay.tryParse(_bookingDate.text.trim());
    if (bookingDate == null) {
      errors.add(_bookingDateError);
    }
    final valueDateText = _valueDate.text.trim();
    final valueDate = valueDateText.isEmpty
        ? null
        : CalendarDay.tryParse(valueDateText);
    if (valueDateText.isNotEmpty && valueDate == null) {
      errors.add(_valueDateError);
    }
    if (_description.text.trim().isEmpty) {
      errors.add(TransactionDraftViolation.descriptionRequired.name);
    }

    setState(() => _localErrors = errors);
    if (errors.isNotEmpty ||
        account == null ||
        minorUnits == null ||
        bookingDate == null) {
      return;
    }

    unawaited(
      ref
          .read(transactionWriteControllerProvider.notifier)
          .create(
            ManualTransactionDraft(
              accountId: account.accountId,
              entry: MoneyEntry(
                magnitude: Money(
                  minorUnits: minorUnits,
                  currency: account.currency.code,
                  exponent: account.currency.exponent,
                ),
                direction: _direction,
              ),
              bookingDate: bookingDate,
              description: _description.text.trim(),
              valueDate: valueDate,
              merchant: _merchant.text.trim().isEmpty
                  ? null
                  : _merchant.text.trim(),
              note: _note.text.trim().isEmpty ? null : _note.text.trim(),
            ),
          ),
    );
  }
}

const String _bookingDateError = 'bookingDate';
const String _valueDateError = 'valueDate';

/// The list of fields that must be corrected, announced as one block.
///
/// A summary rather than errors scattered down the form: a screen reader user
/// who submits an invalid form otherwise has to hunt for what went wrong.
final class _ValidationSummary extends StatelessWidget {
  const _ValidationSummary({required this.errors, required this.l10n});

  final List<String> errors;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    if (errors.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
      child: Semantics(
        liveRegion: true,
        child: KararBanner(
          title: l10n.transactionFormValidationSummaryTitle,
          message: <String>[
            for (final error in errors) transactionDraftErrorLabel(error, l10n),
          ].join('\n'),
          tone: KararStatusTone.danger,
        ),
      ),
    );
  }
}

/// The copy for one field-level refusal.
String transactionDraftErrorLabel(String field, AppLocalizations l10n) {
  if (field == TransactionDraftViolation.accountRequired.name) {
    return l10n.transactionFormErrorAccount;
  }
  if (field == TransactionDraftViolation.descriptionRequired.name) {
    return l10n.transactionFormErrorDescription;
  }
  if (field == TransactionDraftViolation.directionRequired.name) {
    return l10n.transactionFormErrorDirection;
  }
  if (field == TransactionDraftViolation.magnitudeRequired.name) {
    return l10n.transactionFormErrorMagnitude;
  }
  if (field == _valueDateError) {
    return l10n.transactionFormErrorValueDate;
  }
  return l10n.transactionFormErrorBookingDate;
}

final class _Outcome extends StatelessWidget {
  const _Outcome({required this.state, required this.l10n});

  final TransactionWriteState state;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final Widget? banner = switch (state) {
      TransactionWriteIdle() ||
      TransactionWriteSubmitting() ||
      TransactionCategorySaved() ||
      TransactionDeleteSettled() => null,
      TransactionWriteSaved() => KararBanner(
        message: l10n.transactionFormSaved,
        tone: KararStatusTone.success,
      ),
      TransactionWriteRejected(:final violatedFields) => KararBanner(
        title: l10n.transactionFormValidationSummaryTitle,
        message: violatedFields.isEmpty
            ? l10n.transactionRejected
            : <String>[
                for (final field in violatedFields)
                  transactionDraftErrorLabel(field, l10n),
              ].join('\n'),
        tone: KararStatusTone.danger,
      ),
      // A QUESTION, NOT AN ERROR, and the tone says so. The platform cannot
      // tell an accidental double-tap from a second real purchase and neither
      // can this screen; the person can. `warning` rather than `danger`
      // because nothing has gone wrong — a guard did its job and is asking.
      TransactionDuplicateRefused() => KararBanner(
        title: l10n.transactionDuplicateTitle,
        message: l10n.transactionDuplicateMessage,
        tone: KararStatusTone.warning,
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
