// THE REVIEWED CATEGORY CATALOGUE.
//
// Non-personal reference data, read-only, identical for every principal. What
// this surface must NOT offer, and cannot:
//
//   * a free-text category — a subject's own label never becomes a catalogue
//     row, so there is no field for one;
//   * a suggestion, a confidence or a score — none exists in the platform, and
//     a client that invented one would be presenting a guess as a fact;
//   * a retired entry as a choice — `assignable` is stated by the platform and
//     is never derived from `retiredAt`.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart' as financial;
import 'package:karar_mobile/features/transaction_categories/data/api_transaction_categories_repository.dart';
import 'package:karar_mobile/features/transaction_categories/domain/transaction_categories_repository.dart';
import 'package:karar_mobile/features/transaction_categories/domain/transaction_category.dart';
import 'package:karar_mobile/features/transaction_categories/presentation/category_picker_screen.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../../core/support/fakes.dart';
import '../financial_accounts/support/financial_fixtures.dart';
import '../financial_accounts/support/financial_harness.dart';
import '../platform_bootstrap/support/feature_harness.dart';

const Size wideSurface = Size(1400, 24000);
const String subjectTransactionId = 'transaction-0001';

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(CategoryPickerScreen)));

Future<ScriptedTransactionsRepository> pumpPicker(
  WidgetTester tester, {
  List<TransactionCategory>? entries,
  Result<CategoryAssignment>? assignResult,
  Locale locale = const Locale('en'),
  double textScale = 1.0,
}) async {
  final transactions = ScriptedTransactionsRepository(
    detail: transactionDetail(),
    assignResult: assignResult,
  );
  await pumpFeatureScreen(
    tester,
    const CategoryPickerScreen(transactionId: subjectTransactionId),
    locale: locale,
    textScale: textScale,
    surfaceSize: wideSurface,
    overrides: financialOverrides(
      accounts: ScriptedAccountsRepository(),
      transactions: transactions,
      categories: ScriptedCategoriesRepository(entries ?? catalogue().entries),
    ),
  );
  return transactions;
}

void main() {
  group('the catalogue', () {
    test('states which entries may be chosen rather than deriving it', () {
      final held = catalogue();
      expect(held.assignable.map((TransactionCategory e) => e.code), <String>[
        'HOUSEHOLD',
        'HOUSEHOLD.UTILITIES',
      ]);
      // Retired but still resolvable, so an existing assignment stays
      // readable.
      expect(held.lookup('RETIRED_ENTRY'), isNotNull);
    });

    test('depth comes from the dotted code, at most three levels', () {
      expect(catalogue().lookup('HOUSEHOLD')!.depth, 0);
      expect(catalogue().lookup('HOUSEHOLD.UTILITIES')!.depth, 1);
    });

    test('search matches a code or either language label', () {
      final held = catalogue();
      expect(held.search('util'), hasLength(1));
      expect(held.search('المرافق'), hasLength(1));
      expect(held.search('HOUSEHOLD'), hasLength(2));
      expect(held.search('nothing-like-this'), isEmpty);
      // A retired entry is never a search result.
      expect(held.search('Retired'), isEmpty);
    });

    test('an unknown code resolves to nothing rather than to a guess', () {
      expect(catalogue().lookup('NOT_IN_THE_CATALOGUE'), isNull);
    });
  });

  group('the repository', () {
    test('decodes the contract, including a retired entry', () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'items': <Object?>[
              <String, Object?>{
                'code': 'HOUSEHOLD',
                'parentCode': null,
                'labels': <String, Object?>{'en': 'Household', 'ar': 'المنزل'},
                'catalogueVersion': 'catalogue-1',
                'assignable': true,
                'retiredAt': null,
              },
              <String, Object?>{
                'code': 'OLD_ENTRY',
                'parentCode': null,
                'labels': <String, Object?>{'en': 'Old entry', 'ar': 'مدخل قديم'},
                'catalogueVersion': 'catalogue-1',
                'assignable': false,
                'retiredAt': '2026-01-01T00:00:00.000Z',
              },
            ],
            'page': <String, Object?>{
              'limit': 200,
              'returned': 2,
              'hasMore': false,
              'nextCursor': null,
            },
          },
        ),
      );

      final result = await ApiTransactionCategoriesRepository(
        KararApiClient(transport),
      ).listCategories();

      final items = (result as Success<financial.Page<TransactionCategory>>).value.items;
      expect(items, hasLength(2));
      expect(items.first.labelAr, 'المنزل');
      expect(items.last.assignable, isFalse);
      expect(items.last.retiredAt, DateTime.utc(2026));
      expect(transport.requests.single.path, '/financial/categories');
    });

    test('the whole catalogue is read, following the cursor', () async {
      var call = 0;
      final transport = FakeApiTransport((ApiRequest request) async {
        call++;
        return ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'items': <Object?>[
              <String, Object?>{
                'code': 'ENTRY_$call',
                'parentCode': null,
                'labels': <String, Object?>{'en': 'Entry $call', 'ar': 'مدخل'},
                'catalogueVersion': 'catalogue-1',
                'assignable': true,
                'retiredAt': null,
              },
            ],
            'page': <String, Object?>{
              'limit': 1,
              'returned': 1,
              'hasMore': call < 2,
              'nextCursor': call < 2 ? 'cursor-$call' : null,
            },
          },
        );
      });

      final result = await LoadCategoryCatalogue(
        ApiTransactionCategoriesRepository(KararApiClient(transport)),
      )();

      expect((result as Success<CategoryCatalogue>).value.entries, hasLength(2));
    });
  });

  group('the picker', () {
    testInBothDirections(
      'offers the assignable entries in the reading language',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPicker(tester, locale: locale, textScale: scale);
        final isArabic = locale.languageCode == 'ar';

        expect(find.text(isArabic ? 'المنزل' : 'Household'), findsOneWidget);
        expect(find.text(isArabic ? 'المرافق' : 'Utilities'), findsOneWidget);
        // The retired entry is not offered.
        expect(find.text(isArabic ? 'مدخل متقاعد' : 'Retired entry'), findsNothing);
      },
      textScales: featureTextScales,
    );

    testWidgets('choosing an entry sends its code and nothing else',
        (WidgetTester tester) async {
      final transactions = await pumpPicker(tester);

      await tester.tap(find.text('Utilities'));
      await tester.pumpAndSettle();

      expect(transactions.assignedCategories, <String>['HOUSEHOLD.UTILITIES']);
      expect(find.text(mountedL10n(tester).categoryAssigned), findsOneWidget);
    });

    testWidgets('searching narrows the list locally', (WidgetTester tester) async {
      await pumpPicker(tester);
      await tester.enterText(find.byType(TextField).first, 'util');
      await tester.pumpAndSettle();

      expect(find.text('Utilities'), findsOneWidget);
      expect(find.text('Household'), findsNothing);
    });

    testInBothDirections(
      'a decision the person already made is not replaced silently',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPicker(
          tester,
          assignResult: const Failed<CategoryAssignment>(
            ConflictFailure(code: 'USER_ASSIGNMENT_WINS'),
          ),
          locale: locale,
          textScale: scale,
        );

        await tester.tap(find.text(locale.languageCode == 'ar' ? 'المرافق' : 'Utilities'));
        await tester.pumpAndSettle();

        expect(find.text(mountedL10n(tester).categoryAssignmentWins), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('an unknown code is refused with its own message',
        (WidgetTester tester) async {
      await pumpPicker(
        tester,
        assignResult: const Failed<CategoryAssignment>(
          NotFoundFailure(code: 'CATEGORY_UNKNOWN'),
        ),
      );

      await tester.tap(find.text('Utilities'));
      await tester.pumpAndSettle();

      expect(find.text(mountedL10n(tester).categoryUnknown), findsOneWidget);
    });

    testInBothDirections(
      'an empty catalogue says so rather than showing a blank list',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpPicker(
          tester,
          entries: const <TransactionCategory>[],
          locale: locale,
          textScale: scale,
        );
        expect(find.text(mountedL10n(tester).categoriesEmptyTitle), findsOneWidget);
      },
      textScales: featureTextScales,
    );

    testWidgets('there is no free-text category field and no score anywhere',
        (WidgetTester tester) async {
      await pumpPicker(tester);
      // One field only: the search box.
      expect(find.byType(TextField), findsOneWidget);
      for (final widget in tester.allWidgets) {
        if (widget is Text && widget.data != null) {
          expect(widget.data!.toLowerCase(), isNot(contains('confidence')));
          expect(widget.data!.toLowerCase(), isNot(contains('suggested')));
          expect(widget.data!.toLowerCase(), isNot(contains('score')));
        }
      }
    });

    testWidgets('the catalogue version is shown so an assignment is traceable',
        (WidgetTester tester) async {
      await pumpPicker(tester);
      expect(find.text('catalogue-1'), findsOneWidget);
    });
  });

  group('accessibility', () {
    // Four of the seven financial features asserted these; three did not, and
    // this is one of the three. A control a screen reader cannot name is
    // unusable to somebody who cannot see it, and one below the platform
    // minimum is unusable to somebody whose hands shake.
    testWidgets('every interactive control is named and big enough', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpPicker(tester);

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
