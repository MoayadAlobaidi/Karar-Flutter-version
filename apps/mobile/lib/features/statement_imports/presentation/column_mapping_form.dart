// WHERE THE PERSON STATES WHAT THE FILE MEANS.
//
// ## Nothing on this screen has a guessed default
//
// Three choices start EMPTY and the parse button stays disabled until each is
// made, because each has a wrong answer that looks exactly like a right one:
//
//   * whether the first row is a heading. Guess wrong and either a heading
//     becomes a refused transaction, or a real transaction is silently thrown
//     away;
//   * whether the amount is one signed column or a debit and credit pair;
//   * whose point of view a signed column uses. Guess wrong and every payment
//     in the file becomes income.
//
// A checkbox that starts ticked is a guess wearing a control. So the header
// question is two explicit choices with neither preselected, and the same for
// the amount shape and the sign frame.
//
// DATE ORDER IS DIFFERENT, and the difference is deliberate: "not stated" is a
// real, documented value rather than an absence. A file whose dates are
// unambiguous needs no order, and a file whose dates ARE ambiguous produces
// `AMBIGUOUS_DATE_ORDER` on the affected rows — a typed refusal the person can
// act on — instead of a plausible reading nobody chose. So it defaults to "not
// stated" and the helper text says what that means.
//
// ## The header row is shown, and never matched on
//
// The sample grid renders the file so the person can see which column is which.
// NOTHING IN THIS FILE READS THAT TEXT. There is no list of known header names,
// no fuzzy match and no scoring: a header is content from the file and matching
// on it is how a column of dates silently becomes a column of amounts. The
// header is something a person reads, not something this code does.
import 'package:flutter/material.dart';

import '../../../shared/shared.dart';
import '../../financial_accounts/domain/money.dart';
import '../domain/column_mapping.dart';
import '../domain/statement_import.dart';
import '../domain/statement_sample.dart';
import 'statement_import_labels.dart';
import 'untrusted_cell_text.dart';

/// Which shape the amount takes in this file. Stated, never detected.
enum _AmountShape { signed, debitCredit }

/// Where the currency comes from. Exactly one of the two, never both.
enum _CurrencySource { column, statedForFile }

/// What the person stated, ready to send.
@immutable
final class StatedMapping {
  const StatedMapping({required this.mapping, this.balance});

  final StatementColumnMapping mapping;
  final StatedStatementBalance? balance;
}

/// The mapping step.
class ColumnMappingForm extends StatefulWidget {
  const ColumnMappingForm({
    required this.sample,
    required this.accountCurrencyCode,
    required this.accountCurrencyExponent,
    required this.onSubmit,
    this.isSubmitting = false,
    super.key,
  });

  final StatementSample sample;

  /// The currency of the account this import targets, used only to interpret a
  /// typed statement balance. It is NEVER used as the currency of the file:
  /// that is stated separately, because assuming it would turn a USD statement
  /// into QAR without a single visible sign.
  final String accountCurrencyCode;
  final int accountCurrencyExponent;

  final void Function(StatedMapping stated) onSubmit;
  final bool isSubmitting;

  @override
  State<ColumnMappingForm> createState() => _ColumnMappingFormState();
}

class _ColumnMappingFormState extends State<ColumnMappingForm> {
  // Deliberately null: see the file header. Each must be chosen.
  bool? _hasHeaderRow;
  _AmountShape? _amountShape;
  AmountSignFrame? _signFrame;
  _CurrencySource? _currencySource;

  int? _bookingDateColumn;
  int? _descriptionColumn;
  int? _amountColumn;
  int? _debitColumn;
  int? _creditColumn;
  int? _valueDateColumn;
  int? _merchantColumn;
  int? _currencyColumn;
  int? _sourceBalanceColumn;
  int? _sourceReferenceColumn;
  int? _instrumentMaskColumn;
  int? _accountIdentifierColumn;

  SourceBalanceKind? _sourceBalanceKind;

  /// "Not stated" is the documented default and a real answer, so this one
  /// starts with a value.
  StatementDateOrder? _dateOrder;

  final TextEditingController _statedCurrency = TextEditingController();
  final TextEditingController _statedBalance = TextEditingController();
  StatementBalanceKind? _statedBalanceKind;

  @override
  void dispose() {
    _statedCurrency.dispose();
    _statedBalance.dispose();
    super.dispose();
  }

  /// The mapping as stated so far, or null while a required choice is missing.
  StatementColumnMapping? get _mapping {
    final hasHeaderRow = _hasHeaderRow;
    final bookingDateColumn = _bookingDateColumn;
    final descriptionColumn = _descriptionColumn;
    final amount = _amountMapping;
    if (hasHeaderRow == null ||
        bookingDateColumn == null ||
        descriptionColumn == null ||
        amount == null) {
      return null;
    }
    final statedCurrency = _statedCurrency.text.trim().toUpperCase();
    return StatementColumnMapping(
      bookingDateColumn: bookingDateColumn,
      descriptionColumn: descriptionColumn,
      amount: amount,
      hasHeaderRow: hasHeaderRow,
      valueDateColumn: _valueDateColumn,
      merchantColumn: _merchantColumn,
      currencyColumn: _currencySource == _CurrencySource.column ? _currencyColumn : null,
      statedCurrencyCode:
          _currencySource == _CurrencySource.statedForFile && statedCurrency.isNotEmpty
              ? statedCurrency
              : null,
      sourceBalanceColumn: _sourceBalanceColumn,
      sourceBalanceKind: _sourceBalanceKind,
      sourceReferenceColumn: _sourceReferenceColumn,
      instrumentMaskColumn: _instrumentMaskColumn,
      accountIdentifierColumn: _accountIdentifierColumn,
      dateOrder: _dateOrder,
    );
  }

  AmountMapping? get _amountMapping {
    switch (_amountShape) {
      case null:
        return null;
      case _AmountShape.signed:
        final column = _amountColumn;
        final frame = _signFrame;
        if (column == null || frame == null) {
          return null;
        }
        return SignedAmountMapping(amountColumn: column, signFrame: frame);
      case _AmountShape.debitCredit:
        final debit = _debitColumn;
        final credit = _creditColumn;
        if (debit == null || credit == null) {
          return null;
        }
        return DebitCreditAmountMapping(debitColumn: debit, creditColumn: credit);
    }
  }

  /// What the platform would refuse, said here instead of after a round trip.
  List<MappingViolation> get _violations {
    final mapping = _mapping;
    if (mapping == null) {
      return const <MappingViolation>[];
    }
    return checkMapping(mapping, columnCount: widget.sample.columnCount);
  }

  /// The typed statement balance in exact minor units, or null when none was
  /// typed. Returns null with [_balanceTyped] true when it could not be read.
  String? get _statedBalanceMinorUnits {
    final typed = _statedBalance.text.trim();
    if (typed.isEmpty) {
      return null;
    }
    return minorUnitsFromTypedAmount(typed, widget.accountCurrencyExponent);
  }

  bool get _balanceTyped => _statedBalance.text.trim().isNotEmpty;

  bool get _balanceUnreadable => _balanceTyped && _statedBalanceMinorUnits == null;

  bool get _canSubmit =>
      !widget.isSubmitting &&
      _mapping != null &&
      _violations.isEmpty &&
      !_balanceUnreadable &&
      !(_balanceTyped && _statedBalanceKind == null);

  void _submit() {
    final mapping = _mapping;
    if (mapping == null || !_canSubmit) {
      return;
    }
    final minorUnits = _statedBalanceMinorUnits;
    final kind = _statedBalanceKind;
    widget.onSubmit(
      StatedMapping(
        mapping: mapping,
        balance: minorUnits == null || kind == null
            ? null
            : StatedStatementBalance(
                minorUnits: minorUnits,
                kind: kind,
                currencyCode: widget.accountCurrencyCode,
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final signed = _amountShape == _AmountShape.signed;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(l10n.statementImportMappingIntro, style: context.typography.bodyMedium),
        SizedBox(height: context.spacing.md),
        _SampleGrid(sample: widget.sample, hasHeaderRow: _hasHeaderRow ?? false),
        SizedBox(height: context.spacing.md),

        // Whether the first row is a heading. No preselection.
        _ChoiceGroup<bool>(
          label: l10n.statementImportHeaderRowLabel,
          helper: l10n.statementImportHeaderRowHelper,
          value: _hasHeaderRow,
          options: <_Choice<bool>>[
            _Choice<bool>(value: true, label: l10n.statementImportHeaderRowYes),
            _Choice<bool>(value: false, label: l10n.statementImportHeaderRowNo),
          ],
          onChanged: (bool value) => setState(() => _hasHeaderRow = value),
        ),

        _ColumnPicker(
          label: l10n.statementImportFieldBookingDate,
          value: _bookingDateColumn,
          sample: widget.sample,
          hasHeaderRow: _hasHeaderRow ?? false,
          isRequired: true,
          onChanged: (int? value) => setState(() => _bookingDateColumn = value),
        ),
        _ColumnPicker(
          label: l10n.statementImportFieldDescription,
          value: _descriptionColumn,
          sample: widget.sample,
          hasHeaderRow: _hasHeaderRow ?? false,
          isRequired: true,
          onChanged: (int? value) => setState(() => _descriptionColumn = value),
        ),

        // How the amount is written. No preselection.
        _ChoiceGroup<_AmountShape>(
          label: l10n.statementImportAmountShapeLabel,
          value: _amountShape,
          options: <_Choice<_AmountShape>>[
            _Choice<_AmountShape>(
              value: _AmountShape.signed,
              label: l10n.statementImportAmountShapeSigned,
            ),
            _Choice<_AmountShape>(
              value: _AmountShape.debitCredit,
              label: l10n.statementImportAmountShapeDebitCredit,
            ),
          ],
          onChanged: (_AmountShape value) => setState(() => _amountShape = value),
        ),

        if (signed) ...<Widget>[
          _ColumnPicker(
            label: l10n.statementImportFieldAmount,
            value: _amountColumn,
            sample: widget.sample,
            hasHeaderRow: _hasHeaderRow ?? false,
            isRequired: true,
            onChanged: (int? value) => setState(() => _amountColumn = value),
          ),
          // Whose frame the signs use. No preselection: a wrong frame turns
          // every payment in the file into income.
          _ChoiceGroup<AmountSignFrame>(
            label: l10n.statementImportSignFrameLabel,
            helper: l10n.statementImportSignFrameHelper,
            value: _signFrame,
            options: <_Choice<AmountSignFrame>>[
              for (final frame in AmountSignFrame.values)
                _Choice<AmountSignFrame>(
                  value: frame,
                  label: signFrameLabel(frame, l10n),
                ),
            ],
            onChanged: (AmountSignFrame value) => setState(() => _signFrame = value),
          ),
        ] else if (_amountShape == _AmountShape.debitCredit) ...<Widget>[
          _ColumnPicker(
            label: l10n.statementImportFieldDebitAmount,
            value: _debitColumn,
            sample: widget.sample,
            hasHeaderRow: _hasHeaderRow ?? false,
            isRequired: true,
            onChanged: (int? value) => setState(() => _debitColumn = value),
          ),
          _ColumnPicker(
            label: l10n.statementImportFieldCreditAmount,
            value: _creditColumn,
            sample: widget.sample,
            hasHeaderRow: _hasHeaderRow ?? false,
            isRequired: true,
            onChanged: (int? value) => setState(() => _creditColumn = value),
          ),
        ],

        // Where the currency comes from: one source or the other, never both.
        _ChoiceGroup<_CurrencySource>(
          label: l10n.statementImportCurrencySourceLabel,
          helper: l10n.statementImportCurrencyHelper,
          value: _currencySource,
          options: <_Choice<_CurrencySource>>[
            _Choice<_CurrencySource>(
              value: _CurrencySource.column,
              label: l10n.statementImportCurrencyFromColumn,
            ),
            _Choice<_CurrencySource>(
              value: _CurrencySource.statedForFile,
              label: l10n.statementImportCurrencyStatedForFile,
            ),
          ],
          onChanged: (_CurrencySource value) => setState(() {
            _currencySource = value;
            if (value == _CurrencySource.column) {
              _statedCurrency.clear();
            } else {
              _currencyColumn = null;
            }
          }),
        ),
        if (_currencySource == _CurrencySource.column)
          _ColumnPicker(
            label: l10n.statementImportFieldCurrency,
            value: _currencyColumn,
            sample: widget.sample,
            hasHeaderRow: _hasHeaderRow ?? false,
            isRequired: true,
            onChanged: (int? value) => setState(() => _currencyColumn = value),
          ),
        if (_currencySource == _CurrencySource.statedForFile)
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
            child: KararTextField(
              label: l10n.statementImportStatedCurrencyLabel,
              controller: _statedCurrency,
              isRequired: true,
              maxLength: 3,
              onChanged: (String _) => setState(() {}),
            ),
          ),

        // How ambiguous dates are written. "Not stated" is a real answer.
        _ChoiceGroup<StatementDateOrder?>(
          label: l10n.statementImportDateOrderLabel,
          helper: l10n.statementImportDateOrderHelper,
          value: _dateOrder,
          allowNullValue: true,
          options: <_Choice<StatementDateOrder?>>[
            _Choice<StatementDateOrder?>(
              value: null,
              label: l10n.statementImportDateOrderNotStated,
            ),
            for (final order in StatementDateOrder.values)
              _Choice<StatementDateOrder?>(
                value: order,
                label: dateOrderLabel(order, l10n),
              ),
          ],
          onChanged: (StatementDateOrder? value) => setState(() => _dateOrder = value),
        ),

        _OptionalColumns(
          sample: widget.sample,
          hasHeaderRow: _hasHeaderRow ?? false,
          valueDateColumn: _valueDateColumn,
          merchantColumn: _merchantColumn,
          sourceBalanceColumn: _sourceBalanceColumn,
          sourceReferenceColumn: _sourceReferenceColumn,
          instrumentMaskColumn: _instrumentMaskColumn,
          accountIdentifierColumn: _accountIdentifierColumn,
          onValueDate: (int? v) => setState(() => _valueDateColumn = v),
          onMerchant: (int? v) => setState(() => _merchantColumn = v),
          onSourceBalance: (int? v) => setState(() {
            _sourceBalanceColumn = v;
            if (v == null) {
              _sourceBalanceKind = null;
            }
          }),
          onSourceReference: (int? v) => setState(() => _sourceReferenceColumn = v),
          onInstrumentMask: (int? v) => setState(() => _instrumentMaskColumn = v),
          onAccountIdentifier: (int? v) => setState(() => _accountIdentifierColumn = v),
        ),

        if (_sourceBalanceColumn != null)
          _ChoiceGroup<SourceBalanceKind>(
            label: l10n.statementImportBalanceKindLabel,
            value: _sourceBalanceKind,
            options: <_Choice<SourceBalanceKind>>[
              for (final kind in SourceBalanceKind.values)
                _Choice<SourceBalanceKind>(
                  value: kind,
                  label: sourceBalanceKindLabel(kind, l10n),
                ),
            ],
            onChanged: (SourceBalanceKind value) =>
                setState(() => _sourceBalanceKind = value),
          ),

        SizedBox(height: context.spacing.md),
        Text(
          l10n.statementImportStatedBalanceLabel,
          style: context.typography.titleMedium,
        ),
        Text(
          l10n.statementImportStatedBalanceHelper,
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentTertiary,
          ),
        ),
        SizedBox(height: context.spacing.xs),
        KararTextField(
          label: l10n.statementImportStatedBalanceLabel,
          controller: _statedBalance,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          normalizeArabicDigits: true,
          errorText: _balanceUnreadable ? l10n.statementImportStatedBalanceInvalid : null,
          onChanged: (String _) => setState(() {}),
        ),
        if (_balanceTyped)
          _ChoiceGroup<StatementBalanceKind>(
            label: l10n.statementImportStatedBalanceKindLabel,
            value: _statedBalanceKind,
            options: <_Choice<StatementBalanceKind>>[
              for (final kind in StatementBalanceKind.values)
                _Choice<StatementBalanceKind>(
                  value: kind,
                  label: statementBalanceKindLabel(kind, l10n),
                ),
            ],
            onChanged: (StatementBalanceKind value) =>
                setState(() => _statedBalanceKind = value),
          ),

        SizedBox(height: context.spacing.md),
        for (final violation in _violations)
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.xs),
            child: KararBanner(
              message: mappingViolationMessage(violation, l10n),
              tone: KararStatusTone.warning,
            ),
          ),
        SizedBox(height: context.spacing.sm),
        KararButton(
          label: l10n.statementImportActionParse,
          onPressed: _canSubmit ? _submit : null,
          isLoading: widget.isSubmitting,
          isFullWidth: true,
        ),
      ],
    );
  }
}

/// The first rows of the file, rendered inertly.
class _SampleGrid extends StatelessWidget {
  const _SampleGrid({required this.sample, required this.hasHeaderRow});

  final StatementSample sample;
  final bool hasHeaderRow;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          l10n.statementImportPreviewCaption,
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentTertiary,
          ),
        ),
        Text(
          l10n.statementImportPreviewInertNote,
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentTertiary,
          ),
        ),
        SizedBox(height: context.spacing.xs),
        // Wide files scroll rather than forcing the page to.
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              for (var index = 0; index < sample.rows.length; index++)
                _SampleRowView(
                  row: sample.rows[index],
                  isHeader: hasHeaderRow && index == 0,
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SampleRowView extends StatelessWidget {
  const _SampleRowView({required this.row, required this.isHeader});

  final SampleRow row;
  final bool isHeader;

  @override
  Widget build(BuildContext context) {
    final style = isHeader
        ? context.typography.labelMedium
        : context.typography.bodySmall;
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.xxs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          for (final cell in row.cells)
            Container(
              width: 132,
              padding: EdgeInsetsDirectional.only(end: context.spacing.sm),
              child: UntrustedCellText(cell, style: style, maxLines: 1),
            ),
        ],
      ),
    );
  }
}

/// One choice among several, with nothing preselected unless a value is given.
class _Choice<T> {
  const _Choice({required this.value, required this.label});

  final T value;
  final String label;
}

class _ChoiceGroup<T> extends StatelessWidget {
  const _ChoiceGroup({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.helper,
    this.allowNullValue = false,
  });

  final String label;
  final String? helper;
  final T? value;
  final List<_Choice<T>> options;
  final void Function(T value) onChanged;

  /// Whether null is one of the offered values rather than "nothing chosen".
  final bool allowNullValue;

  @override
  Widget build(BuildContext context) {
    final helperText = helper;
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: context.typography.labelLarge),
          if (helperText != null)
            Text(
              helperText,
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentTertiary,
              ),
            ),
          SizedBox(height: context.spacing.xxs),
          Wrap(
            spacing: context.spacing.xs,
            runSpacing: context.spacing.xs,
            children: <Widget>[
              for (final option in options)
                _ChoiceChip<T>(
                  label: option.label,
                  isSelected: allowNullValue || value != null
                      ? value == option.value
                      : false,
                  onPressed: () => onChanged(option.value),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChoiceChip<T> extends StatelessWidget {
  const _ChoiceChip({
    required this.label,
    required this.isSelected,
    required this.onPressed,
  });

  final String label;
  final bool isSelected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: isSelected,
        label: label,
        child: KararButton(
          label: label,
          onPressed: onPressed,
          variant: isSelected
              ? KararButtonVariant.primary
              : KararButtonVariant.secondary,
        ),
      );
}

/// Chooses which column carries one field, or none.
class _ColumnPicker extends StatelessWidget {
  const _ColumnPicker({
    required this.label,
    required this.value,
    required this.sample,
    required this.hasHeaderRow,
    required this.onChanged,
    this.isRequired = false,
    this.helper,
  });

  final String label;
  final int? value;
  final StatementSample sample;
  final bool hasHeaderRow;
  final void Function(int? value) onChanged;
  final bool isRequired;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final helperText = helper;
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            isRequired ? '$label ${l10n.fieldRequiredIndicator}' : label,
            style: context.typography.labelLarge,
          ),
          if (helperText != null)
            Text(
              helperText,
              style: context.typography.bodySmall.copyWith(
                color: context.colors.contentTertiary,
              ),
            ),
          Semantics(
            label: label,
            child: DropdownButton<int?>(
              value: value,
              isExpanded: true,
              hint: Text(l10n.statementImportColumnNotMapped),
              onChanged: onChanged,
              items: <DropdownMenuItem<int?>>[
                if (!isRequired)
                  DropdownMenuItem<int?>(
                    child: Text(l10n.statementImportColumnNotMapped),
                  ),
                for (var index = 0; index < sample.columnCount; index++)
                  DropdownMenuItem<int?>(
                    value: index,
                    child: _ColumnOptionLabel(
                      index: index,
                      sample: sample,
                      hasHeaderRow: hasHeaderRow,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Names one column: its position, and — when the file has a heading row — the
/// heading itself, rendered inertly. The heading is shown so a person can
/// recognise the column; nothing in this code reads it.
class _ColumnOptionLabel extends StatelessWidget {
  const _ColumnOptionLabel({
    required this.index,
    required this.sample,
    required this.hasHeaderRow,
  });

  final int index;
  final StatementSample sample;
  final bool hasHeaderRow;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final position = context.formatter.applyNumerals(
      l10n.statementImportColumnNumber(index + 1),
    );
    final header = hasHeaderRow && sample.rows.isNotEmpty
        ? sample.rows.first.cellAt(index)
        : null;
    if (header == null || header.isEmpty) {
      return Text(position, maxLines: 1, overflow: TextOverflow.ellipsis);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        UntrustedCellText(header, style: context.typography.bodyMedium, maxLines: 1),
        Text(
          position,
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentTertiary,
          ),
          maxLines: 1,
        ),
      ],
    );
  }
}

/// The columns a statement may or may not carry.
class _OptionalColumns extends StatelessWidget {
  const _OptionalColumns({
    required this.sample,
    required this.hasHeaderRow,
    required this.valueDateColumn,
    required this.merchantColumn,
    required this.sourceBalanceColumn,
    required this.sourceReferenceColumn,
    required this.instrumentMaskColumn,
    required this.accountIdentifierColumn,
    required this.onValueDate,
    required this.onMerchant,
    required this.onSourceBalance,
    required this.onSourceReference,
    required this.onInstrumentMask,
    required this.onAccountIdentifier,
  });

  final StatementSample sample;
  final bool hasHeaderRow;
  final int? valueDateColumn;
  final int? merchantColumn;
  final int? sourceBalanceColumn;
  final int? sourceReferenceColumn;
  final int? instrumentMaskColumn;
  final int? accountIdentifierColumn;
  final void Function(int?) onValueDate;
  final void Function(int?) onMerchant;
  final void Function(int?) onSourceBalance;
  final void Function(int?) onSourceReference;
  final void Function(int?) onInstrumentMask;
  final void Function(int?) onAccountIdentifier;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _ColumnPicker(
          label: l10n.statementImportFieldValueDate,
          value: valueDateColumn,
          sample: sample,
          hasHeaderRow: hasHeaderRow,
          onChanged: onValueDate,
        ),
        _ColumnPicker(
          label: l10n.statementImportFieldMerchant,
          value: merchantColumn,
          sample: sample,
          hasHeaderRow: hasHeaderRow,
          onChanged: onMerchant,
        ),
        _ColumnPicker(
          label: l10n.statementImportFieldSourceBalance,
          value: sourceBalanceColumn,
          sample: sample,
          hasHeaderRow: hasHeaderRow,
          onChanged: onSourceBalance,
        ),
        _ColumnPicker(
          label: l10n.statementImportFieldSourceReference,
          value: sourceReferenceColumn,
          sample: sample,
          hasHeaderRow: hasHeaderRow,
          onChanged: onSourceReference,
        ),
        _ColumnPicker(
          label: l10n.statementImportFieldInstrumentMask,
          value: instrumentMaskColumn,
          sample: sample,
          hasHeaderRow: hasHeaderRow,
          onChanged: onInstrumentMask,
        ),
        _ColumnPicker(
          label: l10n.statementImportFieldAccountIdentifier,
          helper: l10n.statementImportAccountIdentifierHelper,
          value: accountIdentifierColumn,
          sample: sample,
          hasHeaderRow: hasHeaderRow,
          onChanged: onAccountIdentifier,
        ),
      ],
    );
  }
}
