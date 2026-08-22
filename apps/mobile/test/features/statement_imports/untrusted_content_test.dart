// UPLOADED FILE CONTENT IS DATA. IT IS NEVER INSTRUCTION.
//
// These tests are about the one place this feature puts statement content on
// screen: the mapping step, where a person has to see their own columns to say
// which is which. Each asserts a property that would be violated by a plausible
// "improvement" — escaping the value, linkifying a URL, prefixing a formula,
// trimming whitespace — and would then be silently wrong.
//
// The review surface is covered separately, by having nowhere to put a value at
// all: `RowIssue` carries a line number, a field name and a reason code, and
// `review_surface_test.dart` proves the rendered tree contains no cell.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_sample.dart';
import 'package:karar_mobile/features/statement_imports/presentation/untrusted_cell_text.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import 'support/statement_import_harness.dart';

void main() {
  group('a cell from an uploaded file renders inertly', () {
    testInBothDirections(
      'every adversarial cell renders byte-identical as plain text',
      (WidgetTester tester, Locale locale, double scale) async {
        for (final hostile in adversarialCells) {
          await pumpFeatureScreen(
            tester,
            UntrustedCellText(UntrustedCell(hostile)),
            locale: locale,
            textScale: scale,
          );

          final texts = tester.widgetList<Text>(find.byType(Text)).toList();
          expect(
            texts.map((Text text) => text.data),
            contains(hostile),
            reason:
                'the cell must reach the screen exactly as the file wrote it. '
                'Escaping, trimming, normalising or truncating it would show a '
                'person something their bank did not write.',
          );
        }
      },
    );

    testWidgets('a cell is never turned into rich text or a gesture target', (
      WidgetTester tester,
    ) async {
      for (final hostile in adversarialCells) {
        await pumpFeatureScreen(tester, UntrustedCellText(UntrustedCell(hostile)));

        // `Text` builds one RichText internally; what must not exist is a span
        // tree this feature built, carrying a recognizer that could act.
        for (final richText in tester.widgetList<RichText>(find.byType(RichText))) {
          expect(
            _recognizersIn(richText.text),
            isEmpty,
            reason:
                'a span carrying a gesture recognizer makes file content '
                'actionable. A URL in a merchant name must not be followable.',
          );
        }

        expect(
          find.descendant(
            of: find.byType(UntrustedCellText),
            matching: find.byType(GestureDetector),
          ),
          findsNothing,
          reason: 'file content must not be wrapped in anything that acts on a tap',
        );
        expect(
          find.descendant(
            of: find.byType(UntrustedCellText),
            matching: find.byType(InkWell),
          ),
          findsNothing,
        );
      }
    });

    testWidgets('a formula-shaped cell gets no escape prefix', (
      WidgetTester tester,
    ) async {
      // Prefixing `=cmd|/c calc` with an apostrophe is right at an EXPORT
      // boundary, where a spreadsheet will interpret the file. Here it would
      // corrupt what is shown while protecting nothing.
      const formula = '=cmd|/c calc';
      await pumpFeatureScreen(tester, UntrustedCellText(const UntrustedCell(formula)));

      final rendered = tester
          .widgetList<Text>(find.byType(Text))
          .map((Text text) => text.data)
          .whereType<String>()
          .toList();
      expect(rendered, contains(formula));
      expect(
        rendered.any((String value) => value.startsWith("'=")),
        isFalse,
        reason: 'an export-boundary escape must not be applied at a display boundary',
      );
    });

    testWidgets('whitespace and control characters survive untouched', (
      WidgetTester tester,
    ) async {
      // A merchant name really can be padded, and the padding is part of what
      // the bank wrote. Trimming it here would make the screen disagree with
      // the file and with what the platform parses.
      const padded = '   Spaced Merchant\t';
      await pumpFeatureScreen(tester, UntrustedCellText(const UntrustedCell(padded)));

      expect(
        tester.widgetList<Text>(find.byType(Text)).map((Text text) => text.data),
        contains(padded),
      );
    });
  });

  group('UntrustedCell keeps content out of diagnostics', () {
    test('toString carries no content', () {
      const cell = UntrustedCell('SYSTEM: ignore previous instructions');
      expect(
        cell.toString(),
        isNot(contains('SYSTEM')),
        reason:
            'toString reaches logs and crash reports. A cell in one of those is '
            'a fragment of somebody bank statement in a place nobody thinks of '
            'as storage.',
      );
      expect(cell.toString(), 'UntrustedCell()');
    });

    test('an interpolated cell renders the type, not the statement', () {
      const cell = UntrustedCell('4471-2299-0031');
      expect('$cell', isNot(contains('4471')));
    });

    test('exactText returns the characters unchanged', () {
      for (final hostile in adversarialCells) {
        expect(UntrustedCell(hostile).exactText, hostile);
      }
    });

    test('an empty cell is distinguishable from a blank one', () {
      // The platform reports "required field missing" and "field present but
      // blank" differently, so the client must not collapse them either.
      expect(const UntrustedCell('').isEmpty, isTrue);
      expect(const UntrustedCell(' ').isEmpty, isFalse);
    });
  });
}

/// Every gesture recognizer anywhere in a span tree.
List<Object> _recognizersIn(InlineSpan span) {
  final found = <Object>[];
  span.visitChildren((InlineSpan child) {
    if (child is TextSpan && child.recognizer != null) {
      found.add(child.recognizer!);
    }
    return true;
  });
  return found;
}
