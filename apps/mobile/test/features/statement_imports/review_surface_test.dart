// THE REVIEW SURFACE: EVERY REFUSAL SAYS WHAT IT IS.
//
// The rules under test:
//
//   * a typed import refusal renders its OWN sentence. Not "something went
//     wrong", and not the sentence belonging to a different code;
//   * a refused row renders its line number, its field and its reason, and
//     carries no value out of the file — proven end to end, by putting a
//     merchant string on the wire and watching it fail to reach the screen;
//   * a truncated report says how many failures it is not showing;
//   * Arabic lays out right to left.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/statement_imports/data/api_statement_imports_repository.dart';
import 'package:karar_mobile/features/statement_imports/domain/import_lifecycle.dart';
import 'package:karar_mobile/features/statement_imports/domain/row_issue.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_import.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_import_labels.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_import_review_screen.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_import_review_widgets.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_imports_providers.dart';
import 'package:karar_mobile/l10n/generated/app_localizations.dart';

import '../../core/support/fakes.dart';
import '../platform_bootstrap/support/feature_harness.dart';
import 'support/statement_import_harness.dart';

const String reviewImportId = '11111111-1111-4111-8111-111111111111';

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(StatementImportReviewScreen)));

List<String> renderedStrings(WidgetTester tester) => <String>[
      for (final widget in tester.allWidgets)
        if (widget is Text && widget.data != null) widget.data!,
    ];

Future<void> pumpReview(
  WidgetTester tester, {
  required StatementImportPreview preview,
  Locale locale = const Locale('en'),
  double textScale = 1.0,
}) =>
    pumpFeatureScreen(
      tester,
      const StatementImportReviewScreen(importId: reviewImportId),
      locale: locale,
      textScale: textScale,
      overrides: statementImportOverrides(
        repository: ScriptedStatementImportsRepository(
          previewResult: Success<StatementImportPreview>(preview),
        ),
      ),
    );

void main() {
  group('a typed refusal gets its own sentence', () {
    testWidgets('a spreadsheet refusal names the spreadsheet remedy', (
      WidgetTester tester,
    ) async {
      await pumpReview(
        tester,
        preview: previewFixture(
          refusal: ImportRefusal.spreadsheetContent,
          state: ImportLifecycleState.failed,
        ),
      );
      final l10n = mountedL10n(tester);

      expect(
        renderedStrings(tester),
        contains(l10n.statementImportRefusalSpreadsheetContent),
      );
      // The neighbouring code must NOT be what a person is shown.
      expect(
        renderedStrings(tester),
        isNot(contains(l10n.statementImportRefusalSourceTooLarge)),
      );
    });

    testWidgets('a size refusal names the size, not a generic failure', (
      WidgetTester tester,
    ) async {
      await pumpReview(
        tester,
        preview: previewFixture(
          refusal: ImportRefusal.sourceTooLarge,
          state: ImportLifecycleState.failed,
        ),
      );
      final l10n = mountedL10n(tester);
      expect(
        renderedStrings(tester),
        contains(l10n.statementImportRefusalSourceTooLarge),
      );
      expect(
        renderedStrings(tester),
        isNot(contains(l10n.statementImportUnavailableDescription)),
        reason: 'a refusal is the platform saying no for a stated reason; it '
            'must never be presented as a failure to reach the platform',
      );
    });

    testWidgets('every refusal code has a distinct, non-empty sentence', (
      WidgetTester tester,
    ) async {
      // A code that shared a sentence with another would send a person to the
      // wrong remedy, which is the whole reason the vocabulary is typed.
      await pumpReview(tester, preview: previewFixture());
      final l10n = mountedL10n(tester);

      final sentences = <String>{};
      for (final refusal in ImportRefusal.values) {
        final sentence = importRefusalMessage(refusal, l10n);
        expect(sentence.trim(), isNotEmpty, reason: '$refusal has no sentence');
        expect(
          sentences.add(sentence),
          isTrue,
          reason: '$refusal shares its sentence with another code',
        );
      }
      expect(sentences.length, ImportRefusal.values.length);
    });

    testWidgets('every row reason has a distinct, non-empty sentence', (
      WidgetTester tester,
    ) async {
      await pumpReview(tester, preview: previewFixture());
      final l10n = mountedL10n(tester);

      final sentences = <String>{};
      for (final reason in RowIssueReason.values) {
        final sentence = rowReasonMessage(reason, l10n);
        expect(sentence.trim(), isNotEmpty, reason: '$reason has no sentence');
        expect(
          sentences.add(sentence),
          isTrue,
          reason: '$reason shares its sentence with another reason',
        );
      }
    });

    testWidgets('an unrecognised code says so rather than blaming the file', (
      WidgetTester tester,
    ) async {
      await pumpReview(
        tester,
        preview: previewFixture(
          refusal: ImportRefusal.unrecognised,
          state: ImportLifecycleState.failed,
        ),
      );
      final l10n = mountedL10n(tester);
      expect(
        renderedStrings(tester),
        contains(l10n.statementImportRefusalUnrecognised),
      );
    });
  });

  group('a refused row shows a line, a field and a reason', () {
    testWidgets('the line number, field and reason all reach the screen', (
      WidgetTester tester,
    ) async {
      await pumpReview(
        tester,
        preview: previewFixture(
          issues: const <RowIssue>[
            RowIssue(
              rowNumber: 14,
              field: StatementField.amount,
              reason: RowIssueReason.ambiguousDecimalSeparator,
            ),
          ],
        ),
      );
      final l10n = mountedL10n(tester);
      final rendered = renderedStrings(tester);

      expect(rendered, contains(l10n.statementImportFieldAmount));
      expect(
        rendered,
        contains(l10n.statementImportReasonAmbiguousDecimalSeparator),
      );
      // The remedy for an unstated convention is to state it, not to edit the
      // bank export.
      expect(rendered, contains(l10n.statementImportRemedyStateAConvention));
      expect(rendered.any((String value) => value.contains('14')), isTrue);
    });

    testWidgets('the surface says it shows no values from the file', (
      WidgetTester tester,
    ) async {
      await pumpReview(
        tester,
        preview: previewFixture(
          issues: const <RowIssue>[
            RowIssue(
              rowNumber: 2,
              field: StatementField.bookingDate,
              reason: RowIssueReason.ambiguousDateOrder,
            ),
          ],
        ),
      );
      expect(
        renderedStrings(tester),
        contains(mountedL10n(tester).statementImportNoValuesShown),
      );
    });

    testWidgets('a truncated report says how many it is not showing', (
      WidgetTester tester,
    ) async {
      await pumpReview(
        tester,
        preview: previewFixture(
          issues: const <RowIssue>[
            RowIssue(
              rowNumber: 1,
              field: StatementField.row,
              reason: RowIssueReason.columnCountMismatch,
            ),
          ],
          totalErrorCount: 900,
        ),
      );
      final rendered = renderedStrings(tester);
      expect(
        rendered.any((String value) => value.contains('900')),
        isTrue,
        reason: 'the real total must travel with the page, so a truncated '
            'report cannot read as a complete one',
      );
    });

    testWidgets('no refused rows says so plainly', (WidgetTester tester) async {
      await pumpReview(tester, preview: previewFixture());
      expect(
        renderedStrings(tester),
        contains(mountedL10n(tester).statementImportRowIssuesNone),
      );
    });
  });

  group('no value from the file reaches the review surface', () {
    testWidgets('a merchant string on the wire never renders', (
      WidgetTester tester,
    ) async {
      // The contract carries no cell on this boundary. This drives the REAL
      // client over a transport that (wrongly) attaches one, and proves the
      // client has nowhere to put it: `RowIssue` has three fields.
      const merchant = 'ACME UNTRUSTED MERCHANT 4471';
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'importId': reviewImportId,
            'accountId': '22222222-2222-4222-8222-222222222222',
            'connectionId': null,
            'state': 'REVIEW_REQUIRED',
            'hasStoredSource': true,
            'counts': <String, Object?>{
              'rowCount': 3,
              'validRowCount': 2,
              'invalidRowCount': 1,
              'exactDuplicateCount': 0,
              'probableDuplicateCount': 0,
              'committedTransactionCount': 0,
            },
            'reconciliationStatus': 'NOT_AVAILABLE',
            'versions': null,
            'refusalCode': null,
            'awaitsDecision': true,
            'reportedErrorCount': 1,
            'totalErrorCount': 1,
            'rowErrors': <Map<String, Object?>>[
              <String, Object?>{
                'rowNumber': 7,
                'safeField': 'MERCHANT',
                'reasonCode': 'FIELD_TOO_LARGE',
                // Not in the contract. If the client ever grew a field for it,
                // this is where it would start rendering.
                'rawValue': merchant,
                'detail': merchant,
              },
            ],
            'page': <String, Object?>{
              'limit': 50,
              'returned': 1,
              'hasMore': false,
              'nextCursor': null,
            },
          },
        ),
      );

      await pumpFeatureScreen(
        tester,
        const StatementImportReviewScreen(importId: reviewImportId),
        overrides: <Override>[
          statementImportsRepositoryProvider.overrideWithValue(
            ApiStatementImportsRepository(KararApiClient(transport)),
          ),
        ],
      );

      expectNothingMatching(
        tester,
        merchant,
        because: 'the preview boundary carries no cell, and the client must '
            'have nowhere to put one even when the wire supplies it',
      );
      // The refusal itself still reaches the person.
      expect(
        renderedStrings(tester),
        contains(mountedL10n(tester).statementImportReasonFieldTooLarge),
      );
    });
  });

  group('the surface is bilingual and lays out by locale', () {
    testInBothDirections(
      'the review surface renders in the direction of its locale',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpReview(
          tester,
          preview: previewFixture(
            issues: const <RowIssue>[
              RowIssue(
                rowNumber: 3,
                field: StatementField.currency,
                reason: RowIssueReason.unknownCurrency,
              ),
            ],
          ),
          locale: locale,
          textScale: scale,
        );

        final direction = directionUnder(tester, find.byType(RowIssueTile).first);
        expect(
          direction,
          locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
          reason: 'direction is derived from the locale, never passed in',
        );
      },
      textScales: featureTextScales,
    );

    testWidgets('Arabic renders Arabic copy, not the English fallback', (
      WidgetTester tester,
    ) async {
      await pumpReview(
        tester,
        preview: previewFixture(
          refusal: ImportRefusal.multipleAccountsInSource,
          state: ImportLifecycleState.failed,
        ),
        locale: const Locale('ar'),
      );
      final l10n = mountedL10n(tester);
      final arabic = l10n.statementImportRefusalMultipleAccountsInSource;

      expect(renderedStrings(tester), contains(arabic));
      expect(
        arabic,
        isNot('The file covers more than one account. Karar refuses it rather '
            'than mixing them into the account you chose.'),
        reason: 'the Arabic catalogue must carry a real translation',
      );
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

      await pumpReview(tester, preview: previewFixture());

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      // Measured from the render tree, because the guideline above does not
      // see this product's own pressable.
      expectEveryTapTargetLargeEnough(tester, expectAtLeast: 0);
      handle.dispose();
    });
  });

}
