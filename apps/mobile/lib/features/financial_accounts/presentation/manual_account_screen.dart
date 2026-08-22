// ADDING OR EDITING AN ACCOUNT BY HAND.
//
// The form offers exactly the six types the contract names, and the wallet
// kind appears IF AND ONLY IF the type is WALLET — the platform holds the same
// biconditional in its database, so a wallet kind on a savings account is a
// rule violation rather than a stray field.
//
// The issuer is named EITHER by choosing a reviewed catalogue entry OR by
// typing one the catalogue does not hold, never both: two names for one issuer
// is a rule violation, not a merge. The form makes that a radio choice so the
// invalid combination cannot be expressed.
//
// The MASK is a short masked tail and the helper says so. A value that reads
// as a full account, card or IBAN number is refused at the domain and rendered
// as withheld — see `domain/safe_mask.dart`.
//
// There is no origin control and no status control on the create form: the
// platform fixes origin to MANUAL and status to ACTIVE and accepts neither
// from a caller. There is therefore no path in this client through which an
// EXTERNAL_PROVIDER account could be asked for.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../domain/financial_account.dart';
import 'accounts_providers.dart';
import 'financial_labels.dart';
import 'financial_routes.dart';
import 'financial_widgets.dart';

/// How the issuer is being named.
enum IssuerChoice { catalogue, unlisted, none }

/// The create-and-edit form.
final class ManualAccountScreen extends ConsumerStatefulWidget {
  const ManualAccountScreen({this.accountId, super.key});

  /// Null for a create. An opaque identifier for an edit.
  final String? accountId;

  @override
  ConsumerState<ManualAccountScreen> createState() => _ManualAccountScreenState();
}

class _ManualAccountScreenState extends ConsumerState<ManualAccountScreen> {
  final TextEditingController _displayName = TextEditingController();
  final TextEditingController _currency = TextEditingController();
  final TextEditingController _mask = TextEditingController();
  final TextEditingController _unlistedIssuer = TextEditingController();

  AccountType _type = AccountType.current;
  WalletKind? _walletKind;
  AccountNature _nature = AccountNature.asset;
  AccountLifecycle _lifecycle = AccountLifecycle.active;
  IssuerChoice _issuerChoice = IssuerChoice.none;
  String? _issuerId;
  String? _seededFor;
  int? _expectedVersion;

  bool get _isEdit => widget.accountId != null;

  @override
  void dispose() {
    _displayName.dispose();
    _currency.dispose();
    _mask.dispose();
    _unlistedIssuer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final form = ref.watch(accountFormControllerProvider);
    final issuers = ref.watch(selectableIssuersProvider).value ?? const <Issuer>[];
    final existing =
        _isEdit ? ref.watch(accountDetailProvider(widget.accountId!)).value : null;
    if (existing != null) {
      _seed(existing);
    }

    return Scaffold(
      appBar: KararAppBar(
        title: _isEdit ? l10n.accountFormEditTitle : l10n.accountFormCreateTitle,
        onBack: () => context.go(
          _isEdit
              ? FinancialRoutes.accountDetailPath(widget.accountId!)
              : FinancialRoutes.accounts,
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          children: <Widget>[
            _Outcome(state: form, l10n: l10n),
            if (issuers.isEmpty)
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
                child: KararBanner(
                  message: l10n.accountFormIssuersUnavailable,
                  tone: KararStatusTone.info,
                ),
              ),
            KararCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  KararTextField(
                    label: l10n.accountFormDisplayNameLabel,
                    helperText: l10n.accountFormDisplayNameHelper,
                    controller: _displayName,
                    isRequired: true,
                    maxLength: 120,
                  ),
                  SizedBox(height: context.spacing.md),
                  FinancialChoiceRow(
                    label: l10n.accountFormTypeLabel,
                    children: <Widget>[
                      for (final type in <AccountType>[
                        AccountType.current,
                        AccountType.savings,
                        AccountType.creditCard,
                        AccountType.cash,
                        AccountType.wallet,
                        AccountType.other,
                      ])
                        FinancialChoice(
                          label: accountTypeLabel(type, l10n),
                          isSelected: _type == type,
                          onPressed: () => setState(() {
                            _type = type;
                            // The wallet kind exists if and only if the type
                            // is WALLET. Clearing it here is what keeps the
                            // pair from ever being sent in the invalid
                            // combination.
                            _walletKind = type == AccountType.wallet
                                ? (_walletKind ?? WalletKind.mobileMoney)
                                : null;
                          }),
                        ),
                    ],
                  ),
                  if (_type == AccountType.wallet)
                    FinancialChoiceRow(
                      label: l10n.accountFormWalletKindLabel,
                      children: <Widget>[
                        for (final kind in <WalletKind>[
                          WalletKind.mobileMoney,
                          WalletKind.eMoney,
                          WalletKind.prepaid,
                          WalletKind.payroll,
                          WalletKind.superApp,
                          WalletKind.other,
                        ])
                          FinancialChoice(
                            label: walletKindLabel(kind, l10n),
                            isSelected: _walletKind == kind,
                            onPressed: () => setState(() => _walletKind = kind),
                          ),
                      ],
                    ),
                  Text(
                    l10n.accountFormWalletKindHelper,
                    textAlign: TextAlign.start,
                    style: context.typography.bodySmall
                        .copyWith(color: context.colors.contentTertiary),
                  ),
                  SizedBox(height: context.spacing.md),
                  FinancialChoiceRow(
                    label: l10n.accountFormNatureLabel,
                    children: <Widget>[
                      for (final nature in <AccountNature>[
                        AccountNature.asset,
                        AccountNature.liability,
                        AccountNature.notStated,
                      ])
                        FinancialChoice(
                          label: accountNatureLabel(nature, l10n),
                          isSelected: _nature == nature,
                          onPressed: () => setState(() => _nature = nature),
                        ),
                    ],
                  ),
                  KararTextField(
                    label: l10n.accountFormCurrencyLabel,
                    helperText: _isEdit
                        ? l10n.accountFormCurrencyImmutable
                        : l10n.accountFormCurrencyHelper,
                    controller: _currency,
                    isRequired: !_isEdit,
                    // The platform refuses a currency change once records
                    // exist, and offering the control would imply a conversion
                    // this platform does not perform.
                    isEnabled: !_isEdit,
                    maxLength: 3,
                  ),
                  SizedBox(height: context.spacing.md),
                  KararTextField(
                    label: l10n.accountFormMaskLabel,
                    helperText: l10n.accountFormMaskHelper,
                    controller: _mask,
                    maxLength: 8,
                  ),
                  SizedBox(height: context.spacing.md),
                  if (_isEdit)
                    FinancialChoiceRow(
                      label: l10n.accountLifecycleFieldLabel,
                      children: <Widget>[
                        for (final lifecycle in <AccountLifecycle>[
                          AccountLifecycle.active,
                          AccountLifecycle.archived,
                          AccountLifecycle.closed,
                        ])
                          FinancialChoice(
                            label: accountLifecycleLabel(lifecycle, l10n),
                            isSelected: _lifecycle == lifecycle,
                            onPressed: () => setState(() => _lifecycle = lifecycle),
                          ),
                      ],
                    ),
                  FinancialChoiceRow(
                    label: l10n.accountFormIssuerLabel,
                    children: <Widget>[
                      FinancialChoice(
                        label: l10n.accountFormIssuerNoneOption,
                        isSelected: _issuerChoice == IssuerChoice.none,
                        onPressed: () => setState(() {
                          _issuerChoice = IssuerChoice.none;
                          _issuerId = null;
                        }),
                      ),
                      if (issuers.isNotEmpty)
                        FinancialChoice(
                          label: l10n.accountFormIssuerCatalogueOption,
                          isSelected: _issuerChoice == IssuerChoice.catalogue,
                          onPressed: () => setState(() {
                            _issuerChoice = IssuerChoice.catalogue;
                            _unlistedIssuer.clear();
                          }),
                        ),
                      FinancialChoice(
                        label: l10n.accountFormIssuerUnlistedOption,
                        isSelected: _issuerChoice == IssuerChoice.unlisted,
                        onPressed: () => setState(() {
                          _issuerChoice = IssuerChoice.unlisted;
                          _issuerId = null;
                        }),
                      ),
                    ],
                  ),
                  if (_issuerChoice == IssuerChoice.catalogue)
                    FinancialChoiceRow(
                      label: l10n.accountFormIssuerCatalogueOption,
                      children: <Widget>[
                        for (final issuer in issuers)
                          FinancialChoice(
                            label: issuerDisplayName(issuer, l10n),
                            isSelected: _issuerId == issuer.issuerId,
                            onPressed: () =>
                                setState(() => _issuerId = issuer.issuerId),
                          ),
                      ],
                    ),
                  if (_issuerChoice == IssuerChoice.unlisted)
                    KararTextField(
                      label: l10n.accountFormIssuerUnlistedLabel,
                      controller: _unlistedIssuer,
                      maxLength: 120,
                    ),
                  SizedBox(height: context.spacing.lg),
                  KararButton(
                    label: l10n.actionSave,
                    isFullWidth: true,
                    isLoading: form is AccountFormSubmitting,
                    onPressed: _submit,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Fills the form from the stored account once, so a rebuild does not
  /// overwrite an edit in progress.
  void _seed(FinancialAccount account) {
    if (_seededFor == account.accountId) {
      return;
    }
    _seededFor = account.accountId;
    _displayName.text = account.displayName;
    _currency.text = account.currency.code;
    _mask.text = account.mask.value ?? '';
    _type = account.accountType;
    _walletKind = account.walletKind;
    _nature = account.nature;
    _lifecycle = account.lifecycle;
    _expectedVersion = account.version;
    switch (account.issuer) {
      case IssuerFromCatalogue(:final issuer):
        _issuerChoice = IssuerChoice.catalogue;
        _issuerId = issuer.issuerId;
      case IssuerUnlisted(:final label):
        _issuerChoice = IssuerChoice.unlisted;
        _unlistedIssuer.text = label;
      case IssuerNotStated():
        _issuerChoice = IssuerChoice.none;
    }
  }

  void _submit() {
    final controller = ref.read(accountFormControllerProvider.notifier);
    final unlisted = _issuerChoice == IssuerChoice.unlisted
        ? _unlistedIssuer.text.trim()
        : null;
    final issuerId = _issuerChoice == IssuerChoice.catalogue ? _issuerId : null;

    if (_isEdit) {
      final version = _expectedVersion;
      if (version == null) {
        return;
      }
      unawaited(
        controller.update(
          widget.accountId!,
          AccountEdit(
            expectedVersion: version,
            displayName: _displayName.text.trim(),
            accountType: _type,
            walletKind: _type == AccountType.wallet ? _walletKind : null,
            clearWalletKind: _type != AccountType.wallet,
            nature: _nature,
            lifecycle: _lifecycle,
            mask: _mask.text.trim().isEmpty ? null : _mask.text.trim(),
            clearMask: _mask.text.trim().isEmpty,
            issuerId: issuerId,
            unlistedIssuerLabel:
                unlisted != null && unlisted.isNotEmpty ? unlisted : null,
            clearIssuer: _issuerChoice == IssuerChoice.none,
          ),
        ),
      );
      return;
    }

    unawaited(
      controller.create(
        ManualAccountDraft(
          displayName: _displayName.text.trim(),
          accountType: _type,
          currencyCode: _currency.text.trim().toUpperCase(),
          walletKind: _type == AccountType.wallet ? _walletKind : null,
          nature: _nature,
          issuerId: issuerId,
          unlistedIssuerLabel:
              unlisted != null && unlisted.isNotEmpty ? unlisted : null,
          mask: _mask.text.trim().isEmpty ? null : _mask.text.trim(),
        ),
      ),
    );
  }
}

/// The outcome of the last save, as a validation summary or a banner.
final class _Outcome extends StatelessWidget {
  const _Outcome({required this.state, required this.l10n});

  final AccountFormState state;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final Widget? banner = switch (state) {
      AccountFormIdle() || AccountFormSubmitting() => null,
      AccountFormSaved() =>
        KararBanner(message: l10n.accountFormSaved, tone: KararStatusTone.success),
      AccountFormRejected(
        :final violatedFields,
        :final isVersionConflict,
        :final isNoChange,
      ) =>
        KararBanner(
          title: violatedFields.isEmpty
              ? null
              : l10n.accountFormValidationSummaryTitle,
          message: violatedFields.isNotEmpty
              ? <String>[
                  for (final field in violatedFields)
                    accountDraftErrorLabel(field, l10n),
                ].join('\n')
              : isVersionConflict
                  ? l10n.accountFormVersionConflict
                  : isNoChange
                      ? l10n.accountFormNoChange
                      : l10n.accountFormRejected,
          tone: KararStatusTone.danger,
        ),
    };
    if (banner == null) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
      // Announced as a live region so a screen-reader user learns the save was
      // refused without hunting for the reason.
      child: Semantics(liveRegion: true, child: banner),
    );
  }
}

/// The copy for one field-level refusal.
String accountDraftErrorLabel(String field, AppLocalizations l10n) {
  if (field == AccountDraftViolation.displayNameRequired.name) {
    return l10n.accountFormErrorDisplayName;
  }
  if (field == AccountDraftViolation.currencyRequired.name) {
    return l10n.accountFormErrorCurrency;
  }
  if (field == AccountDraftViolation.walletKindRequired.name) {
    return l10n.accountFormErrorWalletKindRequired;
  }
  if (field == AccountDraftViolation.walletKindNotAllowed.name) {
    return l10n.accountFormErrorWalletKindNotAllowed;
  }
  if (field == AccountDraftViolation.issuerNamedTwice.name) {
    return l10n.accountFormErrorIssuerNamedTwice;
  }
  return l10n.accountFormRejected;
}
