// §11 — ONE PERSON, SEVERAL INSTITUTIONS, THE WHOLE STACK.
//
// Every other test in this suite doubles something that matters. The
// repository tests double the transport, so a mapper that disagrees with its
// repository passes both. The screen tests double the repository, so a screen
// that reads a field nothing populates passes too. This file doubles the
// SOCKET and nothing else: real providers, real use cases, real repositories,
// real hand-written mappers, the real generated `KararApiClient`, the real
// generated DTO decoders, the real `DioApiTransport` with its interceptors,
// the real `SessionManager` and the real `StartupCoordinator`.
//
// The person it follows holds money in several places at once, which is the
// shape this phase exists to support: two accounts at one bank in two
// different currencies, a card account at an exchange house, a wallet at a
// fintech with two cards spending from it, and an account at an issuer the
// reviewed catalogue does not hold. They list transactions, follow the
// platform's own cursor to a second page, open one in detail, and import a CSV
// somebody else wrote — one of whose rows the platform refuses, and three of
// whose cells are hostile on purpose.
//
// WHAT THIS FILE MAY NOT ASSERT, and does not:
//
//   * no net worth, no cross-currency total, no FX conversion, no budget, no
//     score, no forecast. Multi-currency here means held side by side and
//     shown separately, and the portfolio assertion is the negative one: the
//     figures on screen are EXACTLY the ones sources reported, so any total
//     whatever it is called is one string too many;
//   * no amount is ever parsed to a number. Money is compared as the exact
//     minor-unit characters it travelled as.
//
// Every scripted response body and every request body the client sends is
// validated against `packages/api-contracts/openapi/openapi.yaml` as it
// crosses the socket — see `support/synthetic_platform.dart`. A body that the
// server could not send fails this suite rather than passing it.
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_portfolio.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/money.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_and_wallets_screen.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_providers.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_capability.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instrument.dart';
import 'package:karar_mobile/features/payment_instruments/presentation/instruments_providers.dart';
import 'package:karar_mobile/features/statement_imports/domain/column_mapping.dart';
import 'package:karar_mobile/features/statement_imports/domain/import_lifecycle.dart';
import 'package:karar_mobile/features/statement_imports/domain/row_issue.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_import.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_import_screen.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_imports_providers.dart';
import 'package:karar_mobile/features/statement_imports/presentation/untrusted_cell_text.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';

import 'support/contract.dart';
import 'support/journey_harness.dart';
import 'support/synthetic_platform.dart';
import 'support/synthetic_world.dart';

/// Anything that reads as a monetary figure: a run of digits in any script
/// with an optional grouping and decimal separator.
final RegExp moneyShaped = RegExp(r'[0-9٠-٩۰-۹][0-9٠-٩۰-۹.,٫٬  ]*[0-9٠-٩۰-۹]');

FinancialAccount _account(List<FinancialAccount> all, String id) =>
    all.firstWhere((FinancialAccount held) => held.accountId == id);

Future<List<FinancialAccount>> _portfolio(JourneyHarness harness) async {
  final view = await harness.container.read(ownAccountsProvider.future);
  return (view as AccountsLoaded).accounts;
}

void main() {
  group('signing in, through the real startup sequence', () {
    test('bootstrap is fetched with the credential and opens the surface',
        () async {
      final harness = await JourneyHarness.begin();

      final bootstrap = harness.platform.requestFor('GET', '/platform/bootstrap');
      expect(
        bootstrap.headers['authorization'],
        'Bearer SYNTHETIC-ACCESS-TOKEN-DO-NOT-LOG',
        reason: 'the generated client reaches the platform through the '
            'authenticated transport, which is what attaches the credential',
      );
      expect(
        harness.container.read(financialSurfaceEnabledProvider),
        isTrue,
        reason: 'the capability gate is derived from the bootstrap answer that '
            'actually arrived, not from a fixture',
      );
    });

    test('a bootstrap that withholds the capability closes the surface',
        () async {
      final harness = await JourneyHarness.begin(
        world: (SyntheticPlatform platform) {
          installSyntheticWorld(platform);
          // Replaces the bootstrap answer only. Everything else stays, so the
          // gate is the only thing that could differ.
          platform.answer(
            'GET',
            '/platform/bootstrap',
            200,
            bootstrapContext(transactionsCapabilityStatus: 'UNAVAILABLE'),
          );
        },
      );

      expect(
        harness.container.read(financialSurfaceEnabledProvider),
        isFalse,
        reason: 'the gate reads the answer that arrived. Fail closed is the '
            'whole point of deriving it rather than assuming it.',
      );
    });
  });

  group('the portfolio, across several institutions at once', () {
    test('every account at every issuer arrives, mapped from the wire',
        () async {
      final harness = await JourneyHarness.begin();
      final accounts = await _portfolio(harness);

      expect(accounts, hasLength(5));

      final current = _account(accounts, currentAccountId);
      expect(current.displayName, currentAccountName);
      expect(current.accountType, AccountType.current);
      expect(current.nature, AccountNature.asset);
      expect(current.origin, AccountOrigin.manual);
      expect(current.currency.code, 'QAR');
      expect(current.currency.exponent, 2);
      expect(current.mask.value, '**4417');
      expect(
        (current.issuer as IssuerFromCatalogue).issuer.displayNameEn,
        harbourBankNameEn,
      );
      expect(
        (current.issuer as IssuerFromCatalogue).issuer.kind,
        IssuerKind.bank,
      );

      // A second currency at the SAME issuer. Two accounts, never merged.
      final savings = _account(accounts, savingsUsdAccountId);
      expect(savings.currency.code, 'USD');
      expect(
        (savings.issuer as IssuerFromCatalogue).issuer.issuerId,
        harbourBankId,
      );

      // A liability at a second issuer, imported from a statement.
      final card = _account(accounts, cardAccountId);
      expect(card.nature, AccountNature.liability);
      expect(card.accountType, AccountType.creditCard);
      expect(card.origin, AccountOrigin.csv);
      expect(
        (card.issuer as IssuerFromCatalogue).issuer.kind,
        IssuerKind.exchangeHouse,
      );

      // A wallet at a third issuer, with its subtype.
      final wallet = _account(accounts, walletAccountId);
      expect(wallet.accountType, AccountType.wallet);
      expect(wallet.walletKind, WalletKind.mobileMoney);
      expect(
        (wallet.issuer as IssuerFromCatalogue).issuer.kind,
        IssuerKind.fintechWallet,
      );

      // An issuer the catalogue does not hold, named by the person.
      final unlisted = _account(accounts, unlistedIssuerAccountId);
      expect((unlisted.issuer as IssuerUnlisted).label, cornerSarrafaLabel);
      expect(unlisted.mask.value, isNull);
    });

    test('no account, at any issuer, claims a live institution link', () async {
      final harness = await JourneyHarness.begin();
      for (final account in await _portfolio(harness)) {
        expect(account.link.impliesLiveInstitutionLink, isFalse);
        expect(account.link.providerAccessImplemented, isFalse);
      }
    });

    test('two currencies are held side by side, and the client never adds them',
        () async {
      final harness = await JourneyHarness.begin();
      final accounts = await _portfolio(harness);
      final portfolio = AccountPortfolio.from(
        accounts,
        filter: const PortfolioFilter(),
        grouping: PortfolioGrouping.currency,
      );

      expect(portfolio.currencies, <String>['QAR', 'USD']);
      // Grouping by currency keeps ACCOUNTS apart; there is nowhere in the
      // grouped shape for a figure at all, which is what makes a total
      // impossible rather than merely absent.
      expect(portfolio.groups, hasLength(2));
      for (final group in portfolio.groups) {
        expect(group.accounts, isNotEmpty);
      }
    });

    test('the figures sources reported arrive as exact characters, per account',
        () async {
      final harness = await JourneyHarness.begin();

      final onCurrent =
          await harness.container.read(accountBalancesProvider(currentAccountId).future);
      final booked = onCurrent.entries
          .firstWhere((BalanceKindGroup group) => group.kind == BalanceKind.booked);
      final available = onCurrent.entries
          .firstWhere((BalanceKindGroup group) => group.kind == BalanceKind.available);
      expect(booked.mostRecent.amount.minorUnits, '1250075');
      expect(booked.mostRecent.amount.currency, 'QAR');
      expect(booked.mostRecent.amount.exponent, 2);
      expect(available.mostRecent.amount.minorUnits, '1180075');

      final onSavings = await harness.container
          .read(accountBalancesProvider(savingsUsdAccountId).future);
      expect(onSavings.entries.single.mostRecent.amount.currency, 'USD');
      expect(onSavings.entries.single.mostRecent.amount.minorUnits, '900000');

      // A liability's reported figure is negative on the wire and stays the
      // characters it arrived as.
      final onCard =
          await harness.container.read(accountBalancesProvider(cardAccountId).future);
      expect(onCard.entries.single.mostRecent.amount.minorUnits, '-48250');
      expect(onCard.entries.single.mostRecent.amount.isNegative, isTrue);
      expect(onCard.entries.single.kind, BalanceKind.outstanding);
    });

    test('the card account names the file that feeds it, on the one rail that runs',
        () async {
      final harness = await JourneyHarness.begin();
      final links = await harness.container
          .read(accountSourceLinksProvider(cardAccountId).future);

      expect(links, hasLength(1));
      final link = links.single;
      expect(link.rail, ConnectionRail.userFileUpload);
      expect(link.availability, RailAvailability.executable);
      expect(link.status, SourceLinkStatus.linked);
      expect(link.matchBasis, MatchBasis.exactExternalReference);
      expect(link.impliesLiveInstitutionLink, isFalse);
      expect(link.providerAccessImplemented, isFalse);
      expect(link.capabilities.balance, SourceDataObservationState.observed);
      expect(
        link.capabilities.pendingTransactions,
        SourceDataObservationState.notProvided,
      );
      // A calendar range, never an instant.
      expect(link.historyCoverage!.start.iso8601, '2026-06-01');
      expect(link.historyCoverage!.end.iso8601, '2026-07-31');
    });

    test('two cards spend from one wallet, and neither carries a figure',
        () async {
      final harness = await JourneyHarness.begin();
      final instruments = await harness.container
          .read(accountInstrumentsProvider(walletAccountId).future);

      expect(instruments, hasLength(2));
      expect(
        instruments.map((PaymentInstrument card) => card.accountId).toSet(),
        <String>{walletAccountId},
        reason: 'both cards point at the ONE balance-bearing account',
      );
      expect(instruments.first.instrumentType, InstrumentType.virtualCard);
      expect(instruments.first.status, InstrumentStatus.active);
      expect(instruments.first.spendable, isTrue);
      expect(instruments.last.status, InstrumentStatus.suspended);
      expect(instruments.last.spendable, isFalse);
      expect(instruments.first.mask.value, '**1204');
      for (final card in instruments) {
        expect(card.impliesLiveIssuerLink, isFalse);
      }

      // The account that holds the balance is the wallet, not either card.
      final walletBalances = await harness.container
          .read(accountBalancesProvider(walletAccountId).future);
      expect(walletBalances.entries.single.mostRecent.amount.minorUnits, '32500');
    });

    test('an account with no instruments answers an empty list, not a failure',
        () async {
      final harness = await JourneyHarness.begin();
      expect(
        await harness.container
            .read(accountInstrumentsProvider(currentAccountId).future),
        isEmpty,
      );
    });
  });

  group('transactions, listed, paged and read', () {
    test('the first page arrives with the amounts and directions as stated',
        () async {
      final harness = await JourneyHarness.begin();
      final listing =
          await harness.container.read(transactionListingProvider.future);
      final loaded = listing as TransactionsLoaded;

      expect(loaded.transactions, hasLength(2));
      expect(loaded.hasMore, isTrue);

      final grocery = loaded.transactions.first;
      expect(grocery.transactionId, groceryTransactionId);
      expect(grocery.amount.minorUnits, '-4500');
      expect(grocery.amount.currency, 'QAR');
      expect(grocery.direction, MoneyDirection.moneyOut);
      expect(grocery.merchant, groceryMerchant);
      expect(grocery.sourceKind, SourceKind.manual);
      expect(grocery.status, TransactionStatus.posted);
      // Calendar days stay days. An instant here would move the line across a
      // month boundary for a reader at another offset.
      expect(grocery.bookingDate.iso8601, '2026-07-18');
      expect(grocery.valueDate!.iso8601, '2026-07-19');
      expect(grocery.eventOccurredAt, isNull);

      final tram = loaded.transactions.last;
      expect(tram.accountId, walletAccountId);
      expect(tram.amount.minorUnits, '-350');
    });

    test('the second page is asked for with the platform\'s own cursor, unaltered',
        () async {
      final harness = await JourneyHarness.begin();
      await harness.container.read(transactionListingProvider.future);
      await harness.container.read(transactionListingProvider.notifier).loadMore();

      final issued = harness.platform.requestsFor('GET', '/financial/transactions');
      expect(issued, hasLength(2));
      expect(
        issued.first.query.containsKey('cursor'),
        isFalse,
        reason: 'the first page is asked for without one',
      );
      expect(
        issued.last.query['cursor'],
        transactionsNextCursor,
        reason: 'the cursor is opaque. Re-encoding, trimming or decoding it '
            'asks the platform for a position it did not name.',
      );
      // And it survives the trip onto the wire, percent-encoding included.
      expect(
        Uri.decodeQueryComponent(
          issued.last.uri.query
              .split('&')
              .firstWhere((String pair) => pair.startsWith('cursor='))
              .substring('cursor='.length),
        ),
        transactionsNextCursor,
      );

      final listing =
          harness.container.read(transactionListingProvider).value! as TransactionsLoaded;
      expect(
        listing.transactions.map((Transaction row) => row.transactionId),
        <String>[groceryTransactionId, tramTransactionId, salaryTransactionId],
        reason: 'pages accumulate in order; the second does not replace the first',
      );
      expect(listing.hasMore, isFalse);
    });

    test('an amount the source stated in another currency travels beside the '
        'booked one, and nothing converts either', () async {
      final harness = await JourneyHarness.begin();
      await harness.container.read(transactionListingProvider.future);
      await harness.container.read(transactionListingProvider.notifier).loadMore();

      final listing =
          harness.container.read(transactionListingProvider).value! as TransactionsLoaded;
      final received = listing.transactions
          .firstWhere((Transaction row) => row.transactionId == salaryTransactionId);

      expect(received.direction, MoneyDirection.moneyIn);
      expect(received.amount.minorUnits, '150000');
      expect(received.amount.currency, 'USD');
      expect(received.originalAmount!.minorUnits, '546000');
      expect(received.originalAmount!.currency, 'QAR');
      // Two exact figures in two currencies. No rate, no product, no sum: the
      // client carries what the source said and states nothing about the
      // relationship between them.
    });

    test('one transaction opens with its history and the person\'s own category',
        () async {
      final harness = await JourneyHarness.begin();
      final detail = (await harness.container
          .read(transactionDetailProvider(groceryTransactionId).future))!;

      expect(detail.transaction.version, 2);
      expect(detail.divergesFromSource, isTrue);
      expect(detail.revisions, hasLength(2));
      expect(detail.revisions.first.attribution, RevisionAttribution.sourceImport);
      expect(detail.revisions.first.changedFields, isEmpty);
      expect(detail.revisions.last.attribution, RevisionAttribution.userInput);
      expect(
        detail.revisions.last.changedFields,
        <RevisableField>[RevisableField.merchant],
        reason: 'the revisable-field vocabulary is lower-camel on the wire and '
            'a mapper that upper-cased it would decode to unrecognised',
      );
      expect(detail.revisions.first.values.merchant, isNull);
      expect(detail.revisions.last.values.merchant, groceryMerchant);
      expect(detail.revisions.last.values.amount.minorUnits, '-4500');

      final category = detail.activeCategory!;
      expect(category.categoryCode, 'HOUSEHOLD.GROCERIES');
      expect(category.assignmentSource, AssignmentSource.user);
      expect(category.status, AssignmentStatus.active);
      // There is no confidence and no score in this platform; a person's own
      // choice carries no rule version.
      expect(category.ruleVersion, isNull);
    });

    test('the account detail read narrows by account through the store', () async {
      final harness = await JourneyHarness.begin();
      final rows = await harness.container
          .read(accountRecentTransactionsProvider(walletAccountId).future);

      expect(rows.map((Transaction row) => row.transactionId),
          <String>[tramTransactionId]);
      expect(
        harness.platform
            .requestsFor('GET', '/financial/transactions')
            .single
            .query['accountId'],
        walletAccountId,
      );
    });
  });

  group('importing a statement somebody else wrote', () {
    test('the whole lifecycle, including a row the platform refuses', () async {
      final harness = await JourneyHarness.begin();
      final flow = harness.container.read(statementImportFlowProvider.notifier);

      await flow.chooseSource();
      expect(harness.container.read(statementImportFlowProvider),
          isA<ImportFlowSourceReady>());

      await flow.upload(accountId: cardAccountId);
      final mapping = harness.container.read(statementImportFlowProvider)
          as ImportFlowMapping;
      expect(mapping.snapshot.state, ImportLifecycleState.sourceStored);
      expect(mapping.snapshot.hasStoredSource, isTrue);
      expect(mapping.snapshot.version, 2);

      await flow.parse(
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: SignedAmountMapping(
            amountColumn: 2,
            signFrame: AmountSignFrame.accountHolder,
          ),
          hasHeaderRow: true,
          currencyColumn: 3,
        ),
        statedBalance: const StatedStatementBalance(
          minorUnits: '-48250',
          kind: StatementBalanceKind.closing,
          currencyCode: 'QAR',
        ),
      );
      final review = harness.container.read(statementImportFlowProvider)
          as ImportFlowAwaitingReview;
      expect(review.snapshot.state, ImportLifecycleState.reviewRequired);
      expect(review.snapshot.reconciliation, ReconciliationOutcome.matched);
      expect(review.snapshot.counts.rowCount, 3);
      expect(review.snapshot.counts.validRowCount, 2);
      expect(review.snapshot.counts.invalidRowCount, 1);
      expect(review.snapshot.counts.probableDuplicateCount, 0);
      expect(review.snapshot.version, 3);
      expect(review.snapshot.canCommit, isTrue);

      final preview = (await harness.container
              .read(statementImportPreviewProvider(statementImportId).future))
          as ImportPreviewLoaded;
      expect(preview.preview.rowIssues, hasLength(1));
      expect(preview.preview.rowIssues.single.rowNumber, 3);
      expect(preview.preview.rowIssues.single.field, StatementField.amount);
      expect(
        preview.preview.rowIssues.single.reason,
        RowIssueReason.unreadableAmount,
      );
      expect(preview.preview.isTruncated, isFalse);

      await flow.commit();
      final committed = harness.container.read(statementImportFlowProvider)
          as ImportFlowCommitted;
      expect(committed.receipt.committedTransactionCount, 2);
      expect(committed.receipt.alreadyCommitted, isFalse);
      expect(committed.receipt.transactionIds, hasLength(2));

      // The sequence the contract states, in order, and nothing else.
      expect(
        harness.platform.requests
            .where((RecordedRequest request) =>
                request.template?.startsWith('/financial/statement-imports') ??
                false)
            .map((RecordedRequest request) =>
                '${request.method} ${request.template}'),
        <String>[
          'POST /financial/statement-imports',
          'POST /financial/statement-imports/{importId}/source',
          'POST /financial/statement-imports/{importId}/parse',
          'GET /financial/statement-imports/{importId}/preview',
          'POST /financial/statement-imports/{importId}/commit',
        ],
      );
    });

    test('the chosen file reaches the socket byte-identical, under text/csv',
        () async {
      final harness = await JourneyHarness.begin();
      final flow = harness.container.read(statementImportFlowProvider.notifier);
      await flow.chooseSource();
      await flow.upload(accountId: cardAccountId);

      final upload = harness.platform
          .requestFor('POST', '/financial/statement-imports/{importId}/source');
      expect(
        upload.rawBody,
        same(syntheticStatementBytes),
        reason: 'the bytes are carried by IDENTITY from the picker to the '
            'socket. A copy would still compare equal today and would hide a '
            'normalisation somebody adds tomorrow.',
      );
      expect(upload.contentType, 'text/csv');
      expect(
        upload.jsonBody,
        isNull,
        reason: 'the file is a raw body, not a JSON string',
      );
      // A retry of an upload must be the same upload.
      expect(upload.headers['idempotency-key'], statementImportId);
    });

    test('the mapping the person stated goes out in the contract\'s own '
        'vocabulary, by column index', () async {
      final harness = await JourneyHarness.begin();
      final flow = harness.container.read(statementImportFlowProvider.notifier);
      await flow.chooseSource();
      await flow.upload(accountId: cardAccountId);
      await flow.parse(
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: SignedAmountMapping(
            amountColumn: 2,
            signFrame: AmountSignFrame.bankLedger,
          ),
          hasHeaderRow: true,
          currencyColumn: 3,
          dateOrder: StatementDateOrder.iso,
        ),
      );

      final body = harness.platform
          .requestFor('POST', '/financial/statement-imports/{importId}/parse')
          .jsonObject;
      final mapping = body['mapping']! as Map<String, Object?>;
      expect(mapping['bookingDateColumn'], 0);
      expect(mapping['descriptionColumn'], 1);
      expect(mapping['currencyColumn'], 3);
      expect(mapping['hasHeaderRow'], isTrue);
      expect(mapping['dateOrder'], 'ISO');
      expect(
        mapping['amount'],
        <String, Object?>{
          'kind': 'SIGNED',
          'amountColumn': 2,
          'signFrame': 'BANK_LEDGER',
        },
        reason: 'the sign frame decides whether every payment in the file is a '
            'payment or income. It travels in the contract\'s upper-snake '
            'vocabulary, and a client that sent its own spelling would be '
            'refused — or worse, defaulted.',
      );
      // Nothing from the file goes out with the mapping.
      expect(mapping.containsKey('headerNames'), isFalse);
    });

    test('the commit carries the version from the last WRITE, not from a read',
        () async {
      final harness = await JourneyHarness.begin();
      final flow = harness.container.read(statementImportFlowProvider.notifier);
      await flow.chooseSource();
      await flow.upload(accountId: cardAccountId);
      await flow.parse(
        mapping: const StatementColumnMapping(
          bookingDateColumn: 0,
          descriptionColumn: 1,
          amount: SignedAmountMapping(
            amountColumn: 2,
            signFrame: AmountSignFrame.accountHolder,
          ),
          hasHeaderRow: true,
          currencyColumn: 3,
        ),
      );
      await harness.container
          .read(statementImportPreviewProvider(statementImportId).future);
      await flow.commit();

      final commit = harness.platform
          .requestFor('POST', '/financial/statement-imports/{importId}/commit');
      expect(
        commit.jsonObject,
        <String, Object?>{'expectedVersion': 3},
        reason: 'the parse response carried version 3; the preview read carries '
            'no version at all, and a commit that used the upload\'s 2 would '
            'apply a decision taken against a different parse',
      );
      expect(commit.headers['idempotency-key'], statementImportId);
    });
  });

  group('the portfolio on screen, over the same real stack', () {
    testWidgets('every institution and both currencies are shown, separately',
        (WidgetTester tester) async {
      final harness = await JourneyHarness.beginFor(tester);
      await harness.pump(tester, const AccountsAndWalletsScreen());

      expect(find.byType(AccountSummaryCard), findsNWidgets(5));
      for (final name in <String>[
        currentAccountName,
        savingsAccountName,
        cardAccountName,
        walletAccountName,
        unlistedAccountName,
      ]) {
        expect(find.text(name), findsOneWidget, reason: '$name is missing');
      }
      for (final issuer in <String>[
        harbourBankNameEn,
        meridianNameEn,
        lanternNameEn,
        cornerSarrafaLabel,
      ]) {
        expect(find.text(issuer), findsWidgets, reason: '$issuer is missing');
      }
      expect(find.text('QAR'), findsWidgets);
      expect(find.text('USD'), findsWidgets);
    });

    testWidgets('THE MONEY ON SCREEN IS EXACTLY WHAT THE SOURCES REPORTED',
        (WidgetTester tester) async {
      final harness = await JourneyHarness.beginFor(tester);
      await harness.pump(tester, const AccountsAndWalletsScreen());

      // Every string carrying a currency code, which is how this client
      // renders an amount. A cross-currency total, a per-issuer subtotal, a
      // net position or a net worth would each be one more than the five the
      // sources reported.
      final amounts = <String>[
        for (final rendered in renderedStrings(tester))
          if ((rendered.contains('QAR') || rendered.contains('USD')) &&
              moneyShaped.hasMatch(rendered))
            rendered,
      ];

      expect(
        amounts,
        hasLength(5),
        reason: 'five figures were reported over the wire — booked and '
            'available on the current account, one on the dollar savings, one '
            'outstanding on the card and one on the wallet. Anything else here '
            'is a figure this client computed:\n$amounts',
      );
      expect(
        amounts.where((String amount) => amount.contains('USD')),
        hasLength(1),
      );
      expect(
        amounts.where((String amount) => amount.contains('QAR')),
        hasLength(4),
      );
    });

    testWidgets('nothing longer than a mask reaches the screen',
        (WidgetTester tester) async {
      final harness = await JourneyHarness.beginFor(tester);
      await harness.pump(tester, const AccountsAndWalletsScreen());

      expect(find.text('**4417'), findsWidgets);
      for (final rendered in renderedStrings(tester)) {
        final digits = rendered.replaceAll(RegExp('[^0-9]'), '');
        expect(
          digits.length,
          lessThan(9),
          reason: '"$rendered" renders a run of digits that could be an '
              'account number, a card number or an identifier',
        );
      }
    });
  });

  group('the import on screen, and the cells somebody else wrote', () {
    testWidgets('the account chooser offers the accounts the platform returned',
        (WidgetTester tester) async {
      final harness = await JourneyHarness.beginFor(tester);
      await harness.offFrame(
        tester,
        harness.container.read(statementImportFlowProvider.notifier).chooseSource,
      );
      await harness.pump(tester, const StatementImportScreen());

      // A closed dropdown builds no menu, so the chooser's contents are read
      // off the widget rather than off the screen. What matters is that they
      // came from the portfolio the platform returned, not from a fixture.
      final chooser = tester.widget<DropdownButton<String>>(
        find.byType(DropdownButton<String>),
      );
      expect(
        chooser.items!.map((DropdownMenuItem<String> item) => item.value),
        containsAll(<String>[
          currentAccountId,
          savingsUsdAccountId,
          cardAccountId,
          walletAccountId,
          unlistedIssuerAccountId,
        ]),
      );
      expect(
        chooser.items!
            .map((DropdownMenuItem<String> item) => (item.child as Text).data),
        containsAll(<String>[
          currentAccountName,
          cardAccountName,
          walletAccountName,
        ]),
      );
    });

    testWidgets('an adversarial cell renders as its own characters, and inertly',
        (WidgetTester tester) async {
      final harness = await JourneyHarness.beginFor(tester);
      final flow = harness.container.read(statementImportFlowProvider.notifier);
      await harness.offFrame(tester, () async {
        await flow.chooseSource();
        await flow.upload(accountId: cardAccountId);
      });
      await harness.pump(tester, const StatementImportScreen());

      // The mapping step is the one place statement content is shown, so the
      // grid must be on screen for this assertion to mean anything.
      expect(find.byType(UntrustedCellText), findsWidgets);

      for (final hostile in <String>[
        adversarialFormulaCell,
        adversarialInstructionCell,
        adversarialLinkCell,
      ]) {
        expect(
          find.text(hostile),
          findsWidgets,
          reason: 'the cell must render exactly as the file wrote it. '
              'Escaping it, prefixing it, trimming it or linkifying it would '
              'show a person something their bank did not write.',
        );
      }

      // Nothing this feature built can act on a tap, and no span carries a
      // recognizer that could follow the link in a merchant name.
      expect(
        find.descendant(
          of: find.byType(UntrustedCellText),
          matching: find.byType(GestureDetector),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(UntrustedCellText),
          matching: find.byType(InkWell),
        ),
        findsNothing,
      );
      for (final richText in tester.widgetList<RichText>(
        find.descendant(
          of: find.byType(UntrustedCellText),
          matching: find.byType(RichText),
        ),
      )) {
        expect(_recognizersIn(richText.text), isEmpty);
      }
    });

    testWidgets('the review surface reports counts and reasons, never a cell',
        (WidgetTester tester) async {
      final harness = await JourneyHarness.beginFor(tester);
      final flow = harness.container.read(statementImportFlowProvider.notifier);
      await harness.offFrame(tester, () async {
        await flow.chooseSource();
        await flow.upload(accountId: cardAccountId);
        await flow.parse(
          mapping: const StatementColumnMapping(
            bookingDateColumn: 0,
            descriptionColumn: 1,
            amount: SignedAmountMapping(
              amountColumn: 2,
              signFrame: AmountSignFrame.accountHolder,
            ),
            hasHeaderRow: true,
            currencyColumn: 3,
          ),
        );
      });
      await harness.pump(tester, const StatementImportScreen());

      // Nothing from the file is echoed back by the platform, so nothing from
      // the file can be on this screen.
      final rendered = renderedStrings(tester).join('\n');
      for (final hostile in <String>[
        adversarialFormulaCell,
        adversarialInstructionCell,
        adversarialLinkCell,
        'synthetic-attacker.invalid',
      ]) {
        expect(
          rendered,
          isNot(contains(hostile)),
          reason: 'the review surface carries counts and reason codes. A cell '
              'here would mean the platform echoed staged content back.',
        );
      }
      expect(find.byType(UntrustedCellText), findsNothing);
    });
  });

  group('what the journey refuses to find', () {
    test('no request anywhere names a subject or a tenant', () async {
      final harness = await JourneyHarness.begin();
      await _walkTheWholeSurface(harness);

      for (final request in harness.platform.requests) {
        for (final name in request.query.keys) {
          expect(
            name.toLowerCase(),
            isNot(anyOf('userid', 'tenantid', 'subjectid')),
            reason: '${request.method} ${request.path} names a subject',
          );
        }
        final body = request.jsonBody;
        if (body is Map<String, Object?>) {
          for (final key in body.keys) {
            expect(key.toLowerCase(), isNot(anyOf('userid', 'tenantid')));
          }
        }
        expect(
          request.path,
          isNot(contains(syntheticUserId)),
          reason: 'the subject comes from the session binding, never a path',
        );
        expect(request.path, isNot(contains(syntheticTenantId)));
      }
    });

    test('no credential and nothing from the statement reaches a log record',
        () async {
      final harness = await JourneyHarness.begin();
      await _walkTheWholeSurface(harness);

      expect(harness.logSink.records, isNotEmpty);
      final logged = harness.renderedLog;
      for (final secret in <String>[
        'SYNTHETIC-ACCESS-TOKEN-DO-NOT-LOG',
        'SYNTHETIC-REFRESH-TOKEN-DO-NOT-LOG',
        'Bearer',
        adversarialFormulaCell,
        adversarialInstructionCell,
        adversarialLinkCell,
        groceryMerchant,
        '1250075',
      ]) {
        expect(
          logged,
          isNot(contains(secret)),
          reason: '"$secret" reached a log record',
        );
      }
      for (final record in harness.logSink.records) {
        expect(record.fields.containsKey('headers'), isFalse);
        expect(record.fields.containsKey('body'), isFalse);
      }
    });

    test('every request the journey issued is one the contract declares',
        () async {
      final harness = await JourneyHarness.begin();
      await _walkTheWholeSurface(harness);

      // `template` is null exactly when the contract declares no such path,
      // and the platform records a violation for it too. Asserted here as
      // well because it is the property, not a side effect.
      for (final request in harness.platform.requests) {
        expect(
          request.template,
          isNotNull,
          reason: '${request.method} ${request.path} is not in the contract',
        );
      }
      expect(harness.platform.contractViolations, isEmpty);
    });
  });
  group('the check that keeps this journey honest', () {
    // A journey whose scripted bodies are not checked proves nothing about
    // production: it would pass against a payload the server never sends, and
    // the passing would read as assurance. The check that prevents that is
    // itself code, so it is itself tested — otherwise a change that quietly
    // stopped it biting would show up as everything continuing to pass.
    late ContractDocument contract;
    late ContractNode accountsPage;

    setUp(() {
      contract = ContractDocument.load();
      accountsPage = contract.responseSchema('/financial/accounts', 'GET', 200)!;
    });

    Map<String, Object?> pageOf(Map<String, Object?> account) =>
        <String, Object?>{
          'items': <Map<String, Object?>>[account],
          'page': <String, Object?>{
            'limit': 50,
            'returned': 1,
            'hasMore': false,
            'nextCursor': null,
          },
        };

    Map<String, Object?> anAccount() =>
        Map<String, Object?>.from(syntheticPortfolio.first);

    test('the body the journey actually serves satisfies the contract', () {
      expect(
        contract.violations(accountsPage, pageOf(anAccount())),
        isEmpty,
      );
    });

    test('a required field left out is reported', () {
      final broken = anAccount()..remove('mask');
      expect(
        contract.violations(accountsPage, pageOf(broken)),
        contains(contains('required property "mask" is absent')),
      );
    });

    test('a vocabulary member the contract does not declare is reported', () {
      final broken = anAccount()..['accountType'] = 'Current';
      expect(
        contract.violations(accountsPage, pageOf(broken)),
        contains(contains('is not a member of the contract vocabulary')),
        reason: 'a value in the wrong case is the defect this suite exists to '
            'catch, and it has to be caught in the fixture too',
      );
    });

    test('an instant where the contract says a day, and the reverse, are '
        'reported', () {
      final asDay = anAccount()..['createdAt'] = '2026-01-05';
      expect(
        contract.violations(accountsPage, pageOf(asDay)),
        contains(contains('is not an instant with an explicit offset')),
      );

      final transactions =
          contract.responseSchema('/financial/transactions', 'GET', 200)!;
      final asInstant = Map<String, Object?>.from(transactionsPageOne.first)
        ..['bookingDate'] = '2026-07-18T00:00:00Z';
      expect(
        contract.violations(transactions, <String, Object?>{
          'items': <Map<String, Object?>>[asInstant],
          'page': <String, Object?>{
            'limit': 50,
            'returned': 1,
            'hasMore': false,
            'nextCursor': null,
          },
        }),
        contains(contains('is not a calendar day')),
      );
    });

    test('a field the closed object does not declare is reported', () {
      // The account row carries NO balance, by contract. A server that grew
      // one would be a second figure free to disagree with the balances route.
      final broken = anAccount()..['balance'] = '1250075';
      expect(
        contract.violations(accountsPage, pageOf(broken)),
        contains(contains('is not declared, and the contract closes')),
      );
    });

    test('a REQUEST the client could not legitimately send is reported', () {
      final parse = contract.requestSchema(
        '/financial/statement-imports/{importId}/parse',
        'POST',
      )!;
      final body = <String, Object?>{
        'mapping': <String, Object?>{
          'bookingDateColumn': 0,
          'descriptionColumn': 1,
          'hasHeaderRow': true,
          'statedCurrency': 'QAR',
          'amount': <String, Object?>{
            'kind': 'SIGNED',
            'amountColumn': 2,
            // The client's own spelling rather than the contract's.
            'signFrame': 'accountHolder',
          },
        },
      };
      expect(contract.violations(parse, body), isNotEmpty);

      body['mapping'] = <String, Object?>{
        ...body['mapping']! as Map<String, Object?>,
        'amount': <String, Object?>{
          'kind': 'SIGNED',
          'amountColumn': 2,
          'signFrame': 'ACCOUNT_HOLDER',
        },
      };
      expect(contract.violations(parse, body), isEmpty);
    });
  });
}

/// Reads every surface the journey covers, so the negative assertions have
/// something to be negative about.
Future<void> _walkTheWholeSurface(JourneyHarness harness) async {
  final container = harness.container;
  await container.read(ownAccountsProvider.future);
  await container.read(accountBalancesProvider(currentAccountId).future);
  await container.read(accountSourceLinksProvider(cardAccountId).future);
  await container.read(accountInstrumentsProvider(walletAccountId).future);
  await container.read(transactionListingProvider.future);
  await container.read(transactionListingProvider.notifier).loadMore();
  await container.read(transactionDetailProvider(groceryTransactionId).future);

  final flow = container.read(statementImportFlowProvider.notifier);
  await flow.chooseSource();
  await flow.upload(accountId: cardAccountId);
  await flow.parse(
    mapping: const StatementColumnMapping(
      bookingDateColumn: 0,
      descriptionColumn: 1,
      amount: SignedAmountMapping(
        amountColumn: 2,
        signFrame: AmountSignFrame.accountHolder,
      ),
      hasHeaderRow: true,
      currencyColumn: 3,
    ),
  );
  await container.read(statementImportPreviewProvider(statementImportId).future);
  await flow.commit();
}

/// Every gesture recognizer reachable in a span tree.
List<GestureRecognizer> _recognizersIn(InlineSpan span) {
  final found = <GestureRecognizer>[];
  span.visitChildren((InlineSpan child) {
    if (child is TextSpan && child.recognizer != null) {
      found.add(child.recognizer!);
    }
    return true;
  });
  return found;
}
