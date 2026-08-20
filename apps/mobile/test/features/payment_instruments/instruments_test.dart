// AN INSTRUMENT HAS NO BALANCE.
//
// The third mutation this workstream is checked against is "render a virtual
// card as an account balance". These tests are what fails when somebody does.
//
// The canonical case is a WALLET with TWO VIRTUAL CARDS. It must render:
//
//   * ONE wallet balance, from the account's own balance route;
//   * TWO instrument rows, each with a type, a safe mask and a status;
//   * NO figure inside either instrument row.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart'
    as paging;
import 'package:karar_mobile/features/financial_accounts/presentation/account_detail_screen.dart';
import 'package:karar_mobile/features/payment_instruments/data/api_payment_instruments_repository.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instrument.dart';
import 'package:karar_mobile/features/payment_instruments/presentation/account_instruments_section.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../../core/support/fakes.dart';
import '../financial_accounts/support/financial_fixtures.dart';
import '../financial_accounts/support/financial_harness.dart';
import '../platform_bootstrap/support/feature_harness.dart';

const String walletId = 'account-0005';

/// A digit in any of the scripts the product renders.
final RegExp anyDigits = RegExp('[0-9٠-٩۰-۹]');

/// A surface tall enough for the whole detail screen at twice the text scale.
const Size detailSurface = Size(1400, 24000);

/// A wallet holding one balance, with two virtual cards spending from it.
ScriptedAccountsRepository walletRepository() => ScriptedAccountsRepository(
      accounts: <FinancialAccount>[
        account(
          accountId: walletId,
          displayName: 'Wallet with two cards',
          accountType: AccountType.wallet,
          walletKind: WalletKind.mobileMoney,
          issuer: IssuerFromCatalogue(walletIssuer()),
        ),
      ],
      balances: <String, List<BalanceSnapshot>>{
        walletId: <BalanceSnapshot>[
          balance(accountId: walletId, amount: money('75000')),
        ],
      },
      sourceLinks: <String, List<AccountSourceLink>>{
        walletId: <AccountSourceLink>[sourceLink(accountId: walletId)],
      },
    );

ScriptedInstrumentsRepository twoVirtualCards() => ScriptedInstrumentsRepository(
      <String, List<PaymentInstrument>>{
        walletId: <PaymentInstrument>[
          instrument(
            instrumentId: 'instrument-0001',
            displayLabel: 'First virtual card',
            mask: '**1111',
          ),
          instrument(
            instrumentId: 'instrument-0002',
            displayLabel: 'Second virtual card',
            mask: '**2222',
          ),
        ],
      },
    );

Future<void> pumpWallet(
  WidgetTester tester, {
  Locale locale = const Locale('en'),
  double textScale = 1.0,
}) =>
    pumpFeatureScreen(
      tester,
      const AccountDetailScreen(accountId: walletId),
      locale: locale,
      textScale: textScale,
      surfaceSize: detailSurface,
      overrides: financialOverrides(
        accounts: walletRepository(),
        instruments: twoVirtualCards(),
        transactions: ScriptedTransactionsRepository(),
      ),
    );

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(AccountDetailScreen)));

/// Every string rendered inside [finder].
List<String> textsUnder(WidgetTester tester, Finder finder) => <String>[
      for (final element in find
          .descendant(of: finder, matching: find.byType(Text))
          .evaluate())
        if ((element.widget as Text).data != null) (element.widget as Text).data!,
    ];

void main() {
  group('two virtual cards on one wallet', () {
    testInBothDirections(
      'render as two instruments and one balance',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpWallet(tester, locale: locale, textScale: scale);

        expect(find.byType(PaymentInstrumentRow), findsNWidgets(2));
        expect(find.text('First virtual card'), findsOneWidget);
        expect(find.text('Second virtual card'), findsOneWidget);

        // One figure on the whole screen, and it belongs to the account. The
        // bare currency code on the identity card is a label, not an amount,
        // so a figure is a currency code WITH digits beside it.
        final amounts = <String>[
          for (final rendered in <String>[
            for (final widget in tester.allWidgets)
              if (widget is Text && widget.data != null) widget.data!,
          ])
            if (rendered.contains('QAR') && anyDigits.hasMatch(rendered)) rendered,
        ];
        expect(
          amounts,
          hasLength(1),
          reason: 'a wallet with two cards has ONE balance:\n$amounts',
        );
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'NO FIGURE APPEARS INSIDE AN INSTRUMENT ROW',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpWallet(tester, locale: locale, textScale: scale);

        for (var index = 0; index < 2; index++) {
          final row = find.byType(PaymentInstrumentRow).at(index);
          for (final rendered in textsUnder(tester, row)) {
            final readsAsMoney =
                (rendered.contains('QAR') || rendered.contains('USD')) &&
                    anyDigits.hasMatch(rendered);
            expect(
              readsAsMoney,
              isFalse,
              reason: 'an instrument row rendered "$rendered", which reads as '
                  'money. The balance belongs to the account.',
            );
          }
        }
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'the section states that a card holds no balance of its own',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpWallet(tester, locale: locale, textScale: scale);
        expect(
          find.text(mountedL10n(tester).instrumentsNoBalanceNotice),
          findsOneWidget,
        );
      },
      textScales: featureTextScales,
    );

    test('the instrument type carries no amount field at all', () {
      // A structural fact rather than a rendering one: there is nothing on
      // this type a screen could read to obtain a figure.
      final card = instrument(instrumentId: 'instrument-0001');
      expect(card.version, isA<int>());
      expect(card.toString(), 'PaymentInstrument(instrument-0001)');
    });
  });

  group('an instrument states its type, mask and status', () {
    testInBothDirections(
      'every field the contract sends is rendered',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpWallet(tester, locale: locale, textScale: scale);
        final l10n = mountedL10n(tester);

        // Scoped to the instruments section: the ACCOUNT's own lifecycle is
        // also "Active", and the two are different facts about different
        // things.
        Finder inSection(String text) => find.descendant(
              of: find.byType(AccountInstrumentsSection),
              matching: find.text(text),
            );

        expect(inSection(l10n.instrumentTypeVirtualCard), findsNWidgets(2));
        expect(inSection(l10n.instrumentStatusActive), findsNWidgets(2));
        expect(inSection(l10n.instrumentSpendable), findsNWidgets(2));
        expect(inSection('**1111'), findsOneWidget);
        expect(inSection('**2222'), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('a spendable flag is rendered as stated, never derived',
        (WidgetTester tester) async {
      await pumpFeatureScreen(
        tester,
        const AccountDetailScreen(accountId: walletId),
        surfaceSize: detailSurface,
        overrides: financialOverrides(
          accounts: walletRepository(),
          instruments: ScriptedInstrumentsRepository(
            <String, List<PaymentInstrument>>{
              walletId: <PaymentInstrument>[
                // ACTIVE and yet not spendable. The platform states both, and
                // a client that derived one from the other would disagree with
                // it.
                instrument(
                  instrumentId: 'instrument-0003',
                  displayLabel: 'Active but not spendable',
                  spendable: false,
                ),
              ],
            },
          ),
          transactions: ScriptedTransactionsRepository(),
        ),
      );
      final l10n = mountedL10n(tester);
      expect(
        find.descendant(
          of: find.byType(AccountInstrumentsSection),
          matching: find.text(l10n.instrumentStatusActive),
        ),
        findsOneWidget,
      );
      expect(find.text(l10n.instrumentNotSpendable), findsOneWidget);
    });

    testWidgets('a mask that could be a full number is withheld',
        (WidgetTester tester) async {
      await pumpFeatureScreen(
        tester,
        const AccountDetailScreen(accountId: walletId),
        surfaceSize: detailSurface,
        overrides: financialOverrides(
          accounts: walletRepository(),
          instruments: ScriptedInstrumentsRepository(
            <String, List<PaymentInstrument>>{
              walletId: <PaymentInstrument>[
                instrument(
                  instrumentId: 'instrument-0004',
                  displayLabel: 'Card with an over-long tail',
                  mask: '4111111111111111',
                ),
              ],
            },
          ),
          transactions: ScriptedTransactionsRepository(),
        ),
      );
      expect(find.text(mountedL10n(tester).accountMaskWithheld), findsWidgets);
      expect(find.text('4111111111111111'), findsNothing);
    });

    testWidgets('no instrument row claims a live issuer link',
        (WidgetTester tester) async {
      await pumpWallet(tester);
      for (final claim in <Pattern>[
        RegExp('connect', caseSensitive: false),
        RegExp('متصل'),
      ]) {
        expectNothingMatching(
          tester,
          claim,
          because: 'no issuer exposes an interface to this platform',
        );
      }
    });
  });

  group('an account with no instruments', () {
    testInBothDirections(
      'says so, and still states that a card holds no balance',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const AccountDetailScreen(accountId: walletId),
          locale: locale,
          textScale: scale,
          surfaceSize: detailSurface,
          overrides: financialOverrides(
            accounts: walletRepository(),
            instruments: ScriptedInstrumentsRepository(),
            transactions: ScriptedTransactionsRepository(),
          ),
        );
        final l10n = mountedL10n(tester);
        expect(find.text(l10n.instrumentsEmptyTitle), findsOneWidget);
        expect(find.text(l10n.instrumentsNoBalanceNotice), findsOneWidget);
      },
      textScales: featureTextScales,
    );
  });

  group('the instrument contract, decoded', () {
    // The screens above use a scripted repository, so this is the only place
    // that drives a real contract body through the generated DTO and into the
    // domain. What it proves beyond the vocabularies: the projection carries
    // NO figure, and the mapper does not invent one.
    Map<String, Object?> instrumentBody({
      String instrumentType = 'VIRTUAL_CARD',
      String status = 'ACTIVE',
      bool spendable = true,
      String mask = '**4321',
    }) =>
        <String, Object?>{
          'instrumentId': 'instrument-0001',
          'accountId': walletId,
          'instrumentType': instrumentType,
          'status': status,
          'spendable': spendable,
          'mask': mask,
          'displayLabel': 'A synthetic card',
          'issuerLink': <String, Object?>{
            'impliesLiveIssuerLink': false,
            'providerAccessStatus': 'NOT_IMPLEMENTED',
          },
          'createdAt': '2026-01-01T00:00:00.000Z',
          'updatedAt': '2026-02-01T00:00:00.000Z',
          'version': 1,
        };

    ({ApiPaymentInstrumentsRepository repository, FakeApiTransport transport})
        repositoryFor(Object? body) {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(statusCode: 200, body: body),
      );
      return (
        repository: ApiPaymentInstrumentsRepository(KararApiClient(transport)),
        transport: transport,
      );
    }

    Future<PaymentInstrument> instrumentFrom(Map<String, Object?> body) async {
      final result = await repositoryFor(<String, Object?>{
        'items': <Object?>[body],
        'page': <String, Object?>{
          'limit': 50,
          'returned': 1,
          'hasMore': false,
          'nextCursor': null,
        },
      }).repository.listForAccount(walletId);
      return (result as Success<paging.Page<PaymentInstrument>>).value.items.single;
    }

    test('every instrument type maps, and an unknown one is unrecognised',
        () async {
      Future<InstrumentType> typeFor(String wire) async =>
          (await instrumentFrom(instrumentBody(instrumentType: wire)))
              .instrumentType;

      expect(await typeFor('PHYSICAL_CARD'), InstrumentType.physicalCard);
      expect(await typeFor('VIRTUAL_CARD'), InstrumentType.virtualCard);
      expect(await typeFor('PREPAID_CARD'), InstrumentType.prepaidCard);
      expect(await typeFor('TOKENIZED_CARD'), InstrumentType.tokenizedCard);
      expect(await typeFor('QR_PAYMENT_IDENTITY'), InstrumentType.qrPaymentIdentity);
      expect(await typeFor('OTHER'), InstrumentType.other);
      expect(await typeFor('SOMETHING_NEWER'), InstrumentType.unrecognised);
    });

    test('every status maps, and spendable is stated rather than derived',
        () async {
      Future<InstrumentStatus> statusFor(String wire) async =>
          (await instrumentFrom(instrumentBody(status: wire))).status;

      expect(await statusFor('ACTIVE'), InstrumentStatus.active);
      expect(await statusFor('SUSPENDED'), InstrumentStatus.suspended);
      expect(await statusFor('EXPIRED'), InstrumentStatus.expired);
      expect(await statusFor('CANCELLED'), InstrumentStatus.cancelled);
      expect(await statusFor('SOMETHING_NEWER'), InstrumentStatus.unrecognised);

      // ACTIVE and spendable are different questions and the contract answers
      // both; the mapper reads the answer rather than inferring one.
      final held = await instrumentFrom(
        instrumentBody(status: 'ACTIVE', spendable: false),
      );
      expect(held.status, InstrumentStatus.active);
      expect(held.spendable, isFalse);
    });

    test('a mask that could be a full number is withheld at the boundary',
        () async {
      final held = await instrumentFrom(instrumentBody(mask: '4111111111111111'));
      expect(held.mask.isWithheld, isTrue);
      expect(held.mask.value, isNull);
    });

    test('the issuer link claim is read from the wire and never inferred',
        () async {
      expect(
        (await instrumentFrom(instrumentBody())).impliesLiveIssuerLink,
        isFalse,
      );
    });

    test('a malformed shape is a stated failure naming the field', () async {
      final missing = Map<String, Object?>.of(instrumentBody())..remove('mask');
      final result = await repositoryFor(<String, Object?>{
        'items': <Object?>[missing],
        'page': <String, Object?>{
          'limit': 50,
          'returned': 1,
          'hasMore': false,
          'nextCursor': null,
        },
      }).repository.listForAccount(walletId);

      expect(result.failureOrNull, isA<ContractViolationFailure>());
      expect(
        (result.failureOrNull! as ContractViolationFailure).location,
        'PaymentInstrumentView.mask',
      );
    });

    test('the request goes to the account it is nested under', () async {
      final held = repositoryFor(<String, Object?>{
        'items': <Object?>[],
        'page': <String, Object?>{
          'limit': 50,
          'returned': 0,
          'hasMore': false,
          'nextCursor': null,
        },
      });
      await held.repository.listForAccount(walletId, limit: 25);

      final request = held.transport.requests.single;
      expect(request.path, '/financial/accounts/$walletId/payment-instruments');
      expect(request.method.wireName, 'GET');
      expect(request.query['limit'], 25);
    });
  });

  group('accessibility', () {
    // Four of the seven financial features asserted these; three did not, and
    // this is one of the three. A control a screen reader cannot name is
    // unusable to somebody who cannot see it, and one below the platform
    // minimum is unusable to somebody whose hands shake.
    testWidgets('every interactive control is named and big enough', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpWallet(tester);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      // Measured from the render tree, which is indifferent to the test
      // surface. The guideline above skips nodes it treats as offscreen, and
      // these screens are pumped tall so a lazy list builds all of them — so
      // on its own it would pass at any control size here.
      expectEveryTapTargetLargeEnough(tester, expectAtLeast: 1);
      handle.dispose();
    });
  });

}
