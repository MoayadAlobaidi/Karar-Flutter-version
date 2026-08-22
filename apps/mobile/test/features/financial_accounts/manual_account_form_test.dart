// CREATING AND EDITING AN ACCOUNT BY HAND.
//
// The rules the form has to make unexpressible rather than merely validate:
//
//   * a wallet kind exists IF AND ONLY IF the type is WALLET;
//   * an issuer is a reviewed catalogue entry OR a typed label, never both;
//   * the currency cannot change on an existing account;
//   * there is no origin and no status control on a create, so an
//     EXTERNAL_PROVIDER account cannot be asked for from this client at all.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/manual_account_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import 'support/financial_fixtures.dart';
import 'support/financial_harness.dart';

const Size formSurface = Size(1400, 24000);

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(ManualAccountScreen)));

Future<ScriptedAccountsRepository> pumpForm(
  WidgetTester tester, {
  String? accountId,
  ScriptedAccountsRepository? repository,
  Locale locale = const Locale('en'),
  double textScale = 1.0,
}) async {
  final held =
      repository ??
      ScriptedAccountsRepository(
        accounts: <FinancialAccount>[
          account(accountId: 'account-0001', displayName: 'Everyday account'),
        ],
        issuers: <Issuer>[issuerOne(), issuerTwo()],
      );
  await pumpFeatureScreen(
    tester,
    ManualAccountScreen(accountId: accountId),
    locale: locale,
    textScale: textScale,
    surfaceSize: formSurface,
    overrides: financialOverrides(accounts: held),
  );
  return held;
}

void main() {
  group('the create form', () {
    testInBothDirections('offers exactly the six account types the contract names', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpForm(tester, locale: locale, textScale: scale);
      final l10n = mountedL10n(tester);
      for (final label in <String>[
        l10n.accountTypeCurrent,
        l10n.accountTypeSavings,
        l10n.accountTypeCreditCard,
        l10n.accountTypeCash,
        l10n.accountTypeWallet,
        l10n.accountTypeOther,
      ]) {
        expect(find.text(label), findsOneWidget, reason: '$label is not offered');
      }
      // The unrecognised member is a rendering state, never an option.
      expect(find.text(l10n.accountTypeUnrecognised), findsNothing);
    }, textScales: featureTextScales);

    testWidgets('the wallet kind appears only once WALLET is chosen', (WidgetTester tester) async {
      await pumpForm(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.walletKindMobileMoney), findsNothing);
      await tester.tap(find.text(l10n.accountTypeWallet));
      await tester.pumpAndSettle();
      expect(find.text(l10n.walletKindMobileMoney), findsOneWidget);

      await tester.tap(find.text(l10n.accountTypeSavings));
      await tester.pumpAndSettle();
      expect(find.text(l10n.walletKindMobileMoney), findsNothing);
    });

    testWidgets('a wallet is created with its kind', (WidgetTester tester) async {
      final repository = await pumpForm(tester);
      final l10n = mountedL10n(tester);

      await tester.enterText(find.byType(TextField).first, 'Wallet a person typed');
      await tester.tap(find.text(l10n.accountTypeWallet));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.walletKindPayroll));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(1), 'QAR');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final draft = repository.created.single;
      expect(draft.accountType, AccountType.wallet);
      expect(draft.walletKind, WalletKind.payroll);
      expect(draft.currencyCode, 'QAR');
      expect(draft.violations, isEmpty);
    });

    testWidgets('a non-wallet is created with no wallet kind at all', (WidgetTester tester) async {
      final repository = await pumpForm(tester);
      final l10n = mountedL10n(tester);

      await tester.enterText(find.byType(TextField).first, 'Savings');
      await tester.tap(find.text(l10n.accountTypeSavings));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(1), 'usd');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final draft = repository.created.single;
      expect(draft.walletKind, isNull);
      expect(draft.currencyCode, 'USD');
    });

    testWidgets('an issuer is a catalogue entry or a typed label, never both', (
      WidgetTester tester,
    ) async {
      final repository = await pumpForm(tester);
      final l10n = mountedL10n(tester);

      // Choosing the catalogue clears any typed label, so the invalid pair
      // cannot be assembled through the interface.
      await tester.tap(find.text(l10n.accountFormIssuerUnlistedOption));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, 'Issuer Entered By Hand');
      await tester.tap(find.text(l10n.accountFormIssuerCatalogueOption));
      await tester.pumpAndSettle();
      await tester.tap(find.text(issuerOneNameEn));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'Account');
      await tester.enterText(find.byType(TextField).at(1), 'QAR');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final draft = repository.created.single;
      expect(draft.issuerId, issuerOneId);
      expect(draft.unlistedIssuerLabel, isNull);
    });

    testWidgets('an unlisted issuer is sent as the label and no catalogue id', (
      WidgetTester tester,
    ) async {
      final repository = await pumpForm(tester);
      final l10n = mountedL10n(tester);

      await tester.tap(find.text(l10n.accountFormIssuerUnlistedOption));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).last, unlistedIssuerLabel);
      await tester.enterText(find.byType(TextField).first, 'Account');
      await tester.enterText(find.byType(TextField).at(1), 'QAR');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final draft = repository.created.single;
      expect(draft.unlistedIssuerLabel, unlistedIssuerLabel);
      expect(draft.issuerId, isNull);
    });

    testInBothDirections('a refused draft is summarised field by field', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpForm(tester, locale: locale, textScale: scale);
      final l10n = mountedL10n(tester);

      // Nothing typed: the name and the currency are both missing.
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      expect(find.text(l10n.accountFormValidationSummaryTitle), findsOneWidget);
      expect(find.textContaining(l10n.accountFormErrorDisplayName), findsOneWidget);
    }, textScales: featureTextScales);

    testWidgets('the mask helper forbids a full number', (WidgetTester tester) async {
      await pumpForm(tester);
      expect(find.text(mountedL10n(tester).accountFormMaskHelper), findsOneWidget);
    });

    testWidgets('there is no origin, status or connect control on a create', (
      WidgetTester tester,
    ) async {
      await pumpForm(tester);
      final l10n = mountedL10n(tester);
      expect(find.text(l10n.dataOriginManuallyAdded), findsNothing);
      expect(find.text(l10n.dataOriginImportedFromStatement), findsNothing);
      expect(find.text(l10n.accountLifecycleArchived), findsNothing);
      expectNothingMatching(
        tester,
        RegExp('connect', caseSensitive: false),
        because: 'there is nothing to connect to',
      );
    });
  });

  group('the edit form', () {
    testWidgets('seeds from the stored account and sends its version', (WidgetTester tester) async {
      final repository = await pumpForm(tester, accountId: 'account-0001');
      final l10n = mountedL10n(tester);

      expect(find.text('Everyday account'), findsOneWidget);

      await tester.enterText(find.byType(TextField).first, 'Renamed account');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final edit = repository.updated.single;
      expect(edit.expectedVersion, 1);
      expect(edit.displayName, 'Renamed account');
    });

    testWidgets('the currency field is disabled and says why', (WidgetTester tester) async {
      await pumpForm(tester, accountId: 'account-0001');
      expect(find.text(mountedL10n(tester).accountFormCurrencyImmutable), findsOneWidget);
    });

    testWidgets('a lifecycle change is offered on an edit and not on a create', (
      WidgetTester tester,
    ) async {
      await pumpForm(tester, accountId: 'account-0001');
      expect(find.text(mountedL10n(tester).accountLifecycleArchived), findsOneWidget);
    });

    testInBothDirections('a version conflict is explained rather than retried silently', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final repository = ScriptedAccountsRepository(
        accounts: <FinancialAccount>[account(accountId: 'account-0001')],
        updateResult: const Failed<FinancialAccount>(
          ConflictFailure(code: 'ACCOUNT_VERSION_CONFLICT'),
        ),
      );
      await pumpForm(
        tester,
        accountId: 'account-0001',
        repository: repository,
        locale: locale,
        textScale: scale,
      );
      final l10n = mountedL10n(tester);

      await tester.enterText(find.byType(TextField).first, 'Renamed');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      expect(find.text(l10n.accountFormVersionConflict), findsOneWidget);
    }, textScales: featureTextScales);

    testWidgets('a saved edit is confirmed only after the platform stored it', (
      WidgetTester tester,
    ) async {
      await pumpForm(tester, accountId: 'account-0001');
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.accountFormSaved), findsNothing);
      await tester.enterText(find.byType(TextField).first, 'Renamed');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();
      expect(find.text(l10n.accountFormSaved), findsOneWidget);
    });
  });

  group('when the issuer catalogue cannot be read', () {
    testInBothDirections('the form still works and says the person may name one themselves', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpForm(
        tester,
        repository: ScriptedAccountsRepository(),
        locale: locale,
        textScale: scale,
      );
      final l10n = mountedL10n(tester);
      expect(find.text(l10n.accountFormIssuersUnavailable), findsOneWidget);
      expect(find.text(l10n.accountFormIssuerUnlistedOption), findsOneWidget);
      expect(find.text(l10n.accountFormIssuerCatalogueOption), findsNothing);
    }, textScales: featureTextScales);
  });
}
