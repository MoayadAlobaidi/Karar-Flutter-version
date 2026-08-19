// TRANSACTIONS: LISTING, DETAIL, ENTRY, CORRECTION, PROVENANCE AND DELETE.
//
// The two rules with teeth on this surface:
//
//   * a manual amount is a MAGNITUDE and a DIRECTION. Nothing on the form
//     accepts a sign, and the draft the repository receives never carries one;
//   * a calendar day goes out and comes back as a day. No `DateTime` is
//     constructed for one anywhere on the path.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/financial_accounts/domain/calendar_day.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/money.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/domain/transactions_repository.dart';
import 'package:karar_mobile/features/transactions/presentation/manual_transaction_screen.dart';
import 'package:karar_mobile/features/transactions/presentation/transaction_correction_screen.dart';
import 'package:karar_mobile/features/transactions/presentation/transaction_detail_screen.dart';
import 'package:karar_mobile/features/transactions/presentation/transaction_row.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../financial_accounts/support/financial_fixtures.dart';
import '../financial_accounts/support/financial_harness.dart';
import '../platform_bootstrap/support/feature_harness.dart';

const Size wideSurface = Size(1400, 24000);
const String subjectTransactionId = 'transaction-0001';

List<Transaction> someTransactions() => <Transaction>[
      transaction(
        transactionId: 'transaction-0001',
        description: 'A movement out',
        merchant: 'Synthetic Merchant',
      ),
      transaction(
        transactionId: 'transaction-0002',
        description: 'A movement in',
        amount: money('9900'),
        direction: MoneyDirection.moneyIn,
        bookingDate: const CalendarDay(year: 2026, month: 3, day: 2),
      ),
      transaction(
        transactionId: 'transaction-0003',
        description: 'An imported movement',
        amount: money('-1500', currency: 'USD'),
        sourceKind: SourceKind.csv,
        accountId: 'account-0003',
      ),
    ];

AppLocalizations l10nOf(WidgetTester tester, Type screen) =>
    AppLocalizations.of(tester.element(find.byType(screen)));

void main() {
  group('the listing', () {
    testInBothDirections(
      'renders every transaction with its amount, direction and booking day',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const TransactionsScreen(),
          locale: locale,
          textScale: scale,
          surfaceSize: wideSurface,
          overrides: financialOverrides(
            accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
            transactions: ScriptedTransactionsRepository(
              transactions: someTransactions(),
            ),
          ),
        );
        final l10n = l10nOf(tester, TransactionsScreen);

        expect(find.byType(TransactionRow), findsNWidgets(3));
        expect(find.text('A movement out'), findsOneWidget);
        expect(find.text('Synthetic Merchant'), findsOneWidget);
        expect(find.text(l10n.directionMoneyIn), findsWidgets);
        expect(find.text(l10n.directionMoneyOut), findsWidgets);

        // The day is rendered from its own integers, in the locale's numerals.
        final formatter =
            KararFormatter.of(tester.element(find.byType(TransactionsScreen)));
        expect(find.text(formatter.applyNumerals('2026-03-01')), findsWidgets);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'two currencies are rendered as two figures and never combined',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const TransactionsScreen(),
          locale: locale,
          textScale: scale,
          surfaceSize: wideSurface,
          overrides: financialOverrides(
            accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
            transactions: ScriptedTransactionsRepository(
              transactions: someTransactions(),
            ),
          ),
        );

        final amounts = <String>[
          for (final widget in tester.allWidgets)
            if (widget is Text &&
                widget.data != null &&
                (widget.data!.contains('QAR') || widget.data!.contains('USD')) &&
                RegExp('[0-9٠-٩۰-۹]').hasMatch(widget.data!))
              widget.data!,
        ];
        expect(
          amounts,
          hasLength(3),
          reason: 'three transactions, three figures, no total:\n$amounts',
        );
      },
      textScales: featureTextScales,
    );

    testWidgets('a filter narrows the listing through the platform, not locally',
        (WidgetTester tester) async {
      final repository =
          ScriptedTransactionsRepository(transactions: someTransactions());
      await pumpFeatureScreen(
        tester,
        const TransactionsScreen(),
        surfaceSize: wideSurface,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
          transactions: repository,
        ),
      );
      final l10n = l10nOf(tester, TransactionsScreen);

      await tester.tap(find.text(l10n.directionMoneyIn).first);
      await tester.pumpAndSettle();

      expect(repository.filters.last.direction, MoneyDirection.moneyIn);
    });

    testWidgets('only the two runnable rails are offered as a source filter',
        (WidgetTester tester) async {
      await pumpFeatureScreen(
        tester,
        const TransactionsScreen(),
        surfaceSize: wideSurface,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
          transactions: ScriptedTransactionsRepository(
            transactions: someTransactions(),
          ),
        ),
      );
      final l10n = l10nOf(tester, TransactionsScreen);
      expect(find.text(l10n.dataOriginManuallyAdded), findsWidgets);
      expect(find.text(l10n.dataOriginImportedFromStatement), findsWidgets);
      // The rail the vocabulary names and nothing can produce is not a filter.
      expect(find.text(l10n.dataOriginFileImportOnly), findsNothing);
    });

    testWidgets('the platform decides whether there is another page',
        (WidgetTester tester) async {
      final repository = ScriptedTransactionsRepository(
        transactions: someTransactions(),
        hasMore: true,
      );
      await pumpFeatureScreen(
        tester,
        const TransactionsScreen(),
        surfaceSize: wideSurface,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
          transactions: repository,
        ),
      );
      final l10n = l10nOf(tester, TransactionsScreen);

      expect(find.text(l10n.transactionsLoadMoreAction), findsOneWidget);
      await tester.tap(find.text(l10n.transactionsLoadMoreAction));
      await tester.pumpAndSettle();
      expect(repository.reads.where((String read) => read == 'listOwn').length, 2);
    });

    testInBothDirections(
      'an empty listing distinguishes "none yet" from "none matching"',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const TransactionsScreen(),
          locale: locale,
          textScale: scale,
          surfaceSize: wideSurface,
          overrides: financialOverrides(
            accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
            transactions: ScriptedTransactionsRepository(),
          ),
        );
        final l10n = l10nOf(tester, TransactionsScreen);
        expect(find.text(l10n.transactionsEmptyTitle), findsOneWidget);

        await tester.tap(find.text(l10n.directionMoneyIn).first);
        await tester.pumpAndSettle();
        expect(find.text(l10n.transactionsFilteredEmptyTitle), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'a failed read is an error state with a retry',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const TransactionsScreen(),
          locale: locale,
          textScale: scale,
          surfaceSize: wideSurface,
          overrides: financialOverrides(
            accounts: ScriptedAccountsRepository(),
            transactions: ScriptedTransactionsRepository(
              listFailure: const DependencyUnavailableFailure(),
            ),
          ),
        );
        final l10n = l10nOf(tester, TransactionsScreen);
        expect(find.text(l10n.transactionsUnavailableTitle), findsOneWidget);
        expect(find.text(l10n.actionRetry), findsOneWidget);
      },
      textScales: featureTextScales,
    );
  });

  group('the detail screen', () {
    Future<void> pumpDetail(
      WidgetTester tester, {
      TransactionDetail? detail,
      List<TransactionProvenance>? provenanceRows,
      Locale locale = const Locale('en'),
      double textScale = 1.0,
      ScriptedTransactionsRepository? repository,
    }) =>
        pumpFeatureScreen(
          tester,
          const TransactionDetailScreen(transactionId: subjectTransactionId),
          locale: locale,
          textScale: textScale,
          surfaceSize: wideSurface,
          overrides: financialOverrides(
            accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
            transactions: repository ??
                ScriptedTransactionsRepository(
                  detail: detail ?? transactionDetail(),
                  provenanceRows: provenanceRows ?? <TransactionProvenance>[provenance()],
                ),
          ),
        );

    testInBothDirections(
      'renders the amount, the days and the source',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(tester, locale: locale, textScale: scale);
        final l10n = l10nOf(tester, TransactionDetailScreen);

        expect(find.text(l10n.transactionAmountLabel), findsWidgets);
        expect(find.text(l10n.transactionBookedOnLabel), findsWidgets);
        expect(find.text(l10n.directionMoneyOut), findsOneWidget);
        expect(find.text(l10n.transactionStatusPosted), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'a second currency is shown beside the booked amount and never converted',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(
          tester,
          detail: transactionDetail(
            held: transaction(originalAmount: money('-1200', currency: 'USD')),
          ),
          locale: locale,
          textScale: scale,
        );
        final l10n = l10nOf(tester, TransactionDetailScreen);
        expect(find.text(l10n.transactionOriginalAmountLabel), findsOneWidget);
        expect(find.text(l10n.transactionOriginalAmountNotice), findsOneWidget);

        final amounts = <String>[
          for (final widget in tester.allWidgets)
            if (widget is Text &&
                widget.data != null &&
                (widget.data!.contains('QAR') || widget.data!.contains('USD')) &&
                RegExp('[0-9٠-٩۰-۹]').hasMatch(widget.data!))
              widget.data!,
        ];
        // The booked amount, the original amount, and the revision snapshot.
        expect(amounts.where((String a) => a.contains('USD')), hasLength(1));
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'the history is rendered oldest first with its attribution',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(
          tester,
          detail: transactionDetail(
            divergesFromSource: true,
            revisions: <TransactionRevision>[
              TransactionRevision(
                revisionNumber: 1,
                attribution: RevisionAttribution.sourceImport,
                changedFields: const <RevisableField>[],
                values: transactionDetail().revisions.single.values,
                recordedAt: DateTime.utc(2026, 3, 2),
              ),
              TransactionRevision(
                revisionNumber: 2,
                attribution: RevisionAttribution.userInput,
                changedFields: const <RevisableField>[RevisableField.description],
                values: transactionDetail().revisions.single.values,
                recordedAt: DateTime.utc(2026, 3, 4),
              ),
            ],
          ),
          locale: locale,
          textScale: scale,
        );
        final l10n = l10nOf(tester, TransactionDetailScreen);
        final formatter =
            KararFormatter.of(tester.element(find.byType(TransactionDetailScreen)));

        expect(
          find.text(formatter.applyNumerals(l10n.transactionRevisionNumber(1))),
          findsWidgets,
        );
        expect(find.text(l10n.transactionRevisionSourceImport), findsOneWidget);
        expect(find.text(l10n.transactionRevisionUserInput), findsOneWidget);
        expect(find.text(l10n.transactionRevisionNoChangedFields), findsOneWidget);
        // Divergence is the platform's statement, rendered as such.
        expect(find.text(l10n.transactionDivergesFromSource), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'provenance names the rail, the mapping and the algorithm versions',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpDetail(tester, locale: locale, textScale: scale);
        final l10n = l10nOf(tester, TransactionDetailScreen);

        expect(find.text(l10n.provenanceImportedFromStatement), findsOneWidget);
        expect(find.text(l10n.sourceDirectionDebit), findsOneWidget);
        expect(find.text(l10n.directionMappingSourceDirectionWord), findsOneWidget);
        expect(find.text(l10n.provenanceFingerprintVersionLabel), findsOneWidget);
        expect(find.text('fingerprint-algorithm-1'), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('the active category and who decided it are shown',
        (WidgetTester tester) async {
      await pumpDetail(
        tester,
        detail: transactionDetail(activeCategory: categoryAssignment()),
      );
      final l10n = l10nOf(tester, TransactionDetailScreen);
      expect(find.text('HOUSEHOLD'), findsOneWidget);
      // Twice: once as who decided the ACTIVE assignment, and once in the
      // provenance row, which states the same fact about a revision.
      expect(find.text(l10n.transactionCategoryByUser), findsNWidgets(2));
    });

    testWidgets('no category reads as no category, never as an empty one',
        (WidgetTester tester) async {
      await pumpDetail(tester);
      expect(
        find.text(l10nOf(tester, TransactionDetailScreen).transactionCategoryNone),
        findsOneWidget,
      );
    });

    testWidgets('a delete is offered because the platform exposes one',
        (WidgetTester tester) async {
      await pumpDetail(tester);
      expect(
        find.text(l10nOf(tester, TransactionDetailScreen).transactionDeleteAction),
        findsOneWidget,
      );
    });

    testWidgets('a partial delete is reported as partial, never as done',
        (WidgetTester tester) async {
      final repository = ScriptedTransactionsRepository(
        detail: transactionDetail(),
        deleteResult: const Success<TransactionDeletionOutcome>(
          TransactionDeletionOutcome(
            transactionId: subjectTransactionId,
            applied: false,
            transferMatchesDeleted: 1,
            code: 'TRANSFER_MATCH_ERASURE_INCOMPLETE',
          ),
        ),
      );
      await pumpDetail(tester, repository: repository);
      final l10n = l10nOf(tester, TransactionDetailScreen);

      await tester.tap(find.text(l10n.transactionDeleteAction));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.transactionDeleteAction).last);
      await tester.pumpAndSettle();

      expect(find.text(l10n.transactionDeletePartial), findsOneWidget);
      expect(find.text(l10n.transactionDeleted), findsNothing);
    });
  });

  group('recording a transaction by hand', () {
    Future<ScriptedTransactionsRepository> pumpEntry(
      WidgetTester tester, {
      Locale locale = const Locale('en'),
      double textScale = 1.0,
    }) async {
      final repository = ScriptedTransactionsRepository();
      await pumpFeatureScreen(
        tester,
        const ManualTransactionScreen(),
        locale: locale,
        textScale: textScale,
        surfaceSize: wideSurface,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(
            accounts: <FinancialAccount>[
              account(accountId: 'account-0001', displayName: 'Everyday account'),
            ],
          ),
          transactions: repository,
        ),
      );
      return repository;
    }

    testInBothDirections(
      'the amount is a magnitude and the direction is chosen separately',
      (WidgetTester tester, Locale locale, double scale) async {
        final repository = await pumpEntry(tester, locale: locale, textScale: scale);
        final l10n = l10nOf(tester, ManualTransactionScreen);

        await tester.tap(find.text('Everyday account'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).at(0), '45.50');
        await tester.tap(find.text(l10n.directionMoneyIn));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).at(1), '2026-03-01');
        await tester.enterText(find.byType(TextField).at(3), 'A movement');
        await tester.tap(find.text(l10n.actionSave));
        await tester.pumpAndSettle();

        final draft = repository.created.single;
        expect(draft.entry.magnitude.minorUnits, '4550');
        expect(draft.entry.magnitude.minorUnits.startsWith('-'), isFalse);
        expect(draft.entry.direction, MoneyDirection.moneyIn);
        expect(draft.bookingDate.iso8601, '2026-03-01');
        expect(draft.violations, isEmpty);
      },
      textScales: featureTextScales,
    );

    testWidgets('a signed amount is refused rather than silently corrected',
        (WidgetTester tester) async {
      final repository = await pumpEntry(tester);
      final l10n = l10nOf(tester, ManualTransactionScreen);

      await tester.tap(find.text('Everyday account'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), '-45.50');
      await tester.enterText(find.byType(TextField).at(1), '2026-03-01');
      await tester.enterText(find.byType(TextField).at(3), 'A movement');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      expect(repository.created, isEmpty);
      expect(find.textContaining(l10n.transactionFormErrorMagnitude), findsOneWidget);
    });

    testInBothDirections(
      'a malformed day is refused with a validation summary',
      (WidgetTester tester, Locale locale, double scale) async {
        final repository = await pumpEntry(tester, locale: locale, textScale: scale);
        final l10n = l10nOf(tester, ManualTransactionScreen);

        await tester.tap(find.text('Everyday account'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField).at(0), '10');
        await tester.enterText(find.byType(TextField).at(1), '01/03/2026');
        await tester.enterText(find.byType(TextField).at(3), 'A movement');
        await tester.tap(find.text(l10n.actionSave));
        await tester.pumpAndSettle();

        expect(repository.created, isEmpty);
        expect(
          find.text(l10n.transactionFormValidationSummaryTitle),
          findsOneWidget,
        );
      },
      textScales: featureTextScales,
    );

    testWidgets('a day typed in Arabic numerals is understood',
        (WidgetTester tester) async {
      final repository = await pumpEntry(tester, locale: const Locale('ar'));
      final l10n = l10nOf(tester, ManualTransactionScreen);

      await tester.tap(find.text('Everyday account'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).at(0), '١٠٫٥٠');
      await tester.enterText(find.byType(TextField).at(1), '٢٠٢٦-٠٣-٠١');
      await tester.enterText(find.byType(TextField).at(3), 'حركة');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final draft = repository.created.single;
      expect(draft.entry.magnitude.minorUnits, '1050');
      expect(draft.bookingDate.iso8601, '2026-03-01');
    });

    testWidgets('with no accounts the form says to add one first',
        (WidgetTester tester) async {
      await pumpFeatureScreen(
        tester,
        const ManualTransactionScreen(),
        surfaceSize: wideSurface,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(),
          transactions: ScriptedTransactionsRepository(),
        ),
      );
      expect(
        find.text(l10nOf(tester, ManualTransactionScreen).transactionFormNoAccounts),
        findsOneWidget,
      );
    });
  });

  group('correcting a transaction', () {
    Future<ScriptedTransactionsRepository> pumpCorrection(
      WidgetTester tester, {
      Result<Transaction>? correctResult,
      Locale locale = const Locale('en'),
      double textScale = 1.0,
    }) async {
      final repository = ScriptedTransactionsRepository(
        detail: transactionDetail(),
        correctResult: correctResult,
      );
      await pumpFeatureScreen(
        tester,
        const TransactionCorrectionScreen(transactionId: subjectTransactionId),
        locale: locale,
        textScale: textScale,
        surfaceSize: wideSurface,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
          transactions: repository,
        ),
      );
      return repository;
    }

    testInBothDirections(
      'says that a correction is appended rather than overwriting',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpCorrection(tester, locale: locale, textScale: scale);
        expect(
          find.text(l10nOf(tester, TransactionCorrectionScreen).transactionCorrectNotice),
          findsOneWidget,
        );
      },
      textScales: featureTextScales,
    );

    testWidgets('sends the expected version and only what changed',
        (WidgetTester tester) async {
      final repository = await pumpCorrection(tester);
      final l10n = l10nOf(tester, TransactionCorrectionScreen);

      await tester.enterText(find.byType(TextField).at(2), 'A corrected description');
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final correction = repository.corrections.single;
      expect(correction.expectedVersion, 1);
      expect(correction.description, 'A corrected description');
      // The amount did not change, so neither half of it is sent.
      expect(correction.entry, isNull);
      expect(correction.bookingDate, isNull);
    });

    testWidgets('the magnitude and the direction travel together',
        (WidgetTester tester) async {
      final repository = await pumpCorrection(tester);
      final l10n = l10nOf(tester, TransactionCorrectionScreen);

      await tester.tap(find.text(l10n.directionMoneyIn));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.actionSave));
      await tester.pumpAndSettle();

      final correction = repository.corrections.single;
      expect(correction.entry, isNotNull);
      expect(correction.entry!.direction, MoneyDirection.moneyIn);
      expect(correction.entry!.magnitude.minorUnits, '4500');
    });

    testInBothDirections(
      'a version conflict is explained',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpCorrection(
          tester,
          correctResult: const Failed<Transaction>(
            ConflictFailure(code: 'TRANSACTION_VERSION_CONFLICT'),
          ),
          locale: locale,
          textScale: scale,
        );
        final l10n = l10nOf(tester, TransactionCorrectionScreen);

        await tester.enterText(find.byType(TextField).at(2), 'Changed');
        await tester.tap(find.text(l10n.actionSave));
        await tester.pumpAndSettle();

        expect(find.text(l10n.transactionVersionConflict), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('there is no control for the account, currency or source instant',
        (WidgetTester tester) async {
      await pumpCorrection(tester);
      final l10n = l10nOf(tester, TransactionCorrectionScreen);
      // The currency is shown as a read-only value and has no field.
      expect(find.text('QAR'), findsOneWidget);
      expect(find.text(l10n.transactionFormAccountLabel), findsNothing);
      expect(find.text(l10n.transactionEventOccurredLabel), findsNothing);
    });
  });

  group('the correction use case', () {
    test('declines a correction that changes nothing', () async {
      final repository = ScriptedTransactionsRepository();
      final result = await CorrectTransaction(repository)(
        subjectTransactionId,
        const TransactionCorrection(expectedVersion: 1),
      );
      expect(result.failureOrNull?.code, transactionNoChangeCode);
      expect(repository.corrections, isEmpty);
    });

    test('a manual draft with a signed magnitude is refused before it is sent',
        () async {
      final repository = ScriptedTransactionsRepository();
      final result = await RecordManualTransaction(repository)(
        ManualTransactionDraft(
          accountId: 'account-0001',
          entry: MoneyEntry(
            magnitude: money('-100'),
            direction: MoneyDirection.moneyOut,
          ),
          bookingDate: const CalendarDay(year: 2026, month: 3, day: 1),
          description: 'A movement',
        ),
      );
      expect(
        (result.failureOrNull! as InvalidRequestFailure).fields,
        contains(TransactionDraftViolation.magnitudeRequired.name),
      );
      expect(repository.created, isEmpty);
    });
  });

  group('accessibility', () {
    // The identity surfaces have asserted these guidelines since Phase 4; the
    // financial surfaces — the larger and newer half of the app — asserted
    // neither. A control a screen reader cannot name is unusable to somebody
    // who cannot see it, and a tap target below the platform minimum is
    // unusable to somebody whose hands shake.
    testWidgets('every interactive control is named and big enough', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpFeatureScreen(
        tester,
        const TransactionsScreen(),
        surfaceSize: wideSurface,
        overrides: financialOverrides(
          accounts: ScriptedAccountsRepository(accounts: wholePortfolio()),
          transactions: ScriptedTransactionsRepository(transactions: someTransactions()),
        ),
      );

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      // Measured from the render tree, because the guideline above does not
      // see this product's own pressable.
      expectEveryTapTargetLargeEnough(tester, expectAtLeast: 1);
      handle.dispose();
    });
  });

}
