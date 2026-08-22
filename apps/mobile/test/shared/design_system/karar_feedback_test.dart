import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

void main() {
  group('status badge', () {
    testInBothDirections(
      'always carries a word and an icon, never colour alone',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpKarar(
          tester,
          Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              for (final KararStatusTone tone in KararStatusTone.values)
                KararStatusBadge(label: tone.name, tone: tone),
            ],
          ),
          locale: locale,
          textScale: scale,
        );
        for (final KararStatusTone tone in KararStatusTone.values) {
          expect(find.text(tone.name), findsOneWidget);
          expect(find.byIcon(KararIcons.forTone(tone)), findsOneWidget);
        }
        expect(tester.takeException(), isNull);
      },
      textScales: testTextScales,
    );

    testInBothDirections('the badge is announced by its label', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        const KararStatusBadge(label: 'Pending', tone: KararStatusTone.warning),
        locale: locale,
      );
      expect(find.bySemanticsLabel('Pending'), findsOneWidget);
      handle.dispose();
    });
  });

  group('banner', () {
    testInBothDirections('announces itself and offers its action', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      int actions = 0;
      await pumpKarar(
        tester,
        KararBanner(
          title: 'Verification pending',
          message: 'We are still checking your details.',
          tone: KararStatusTone.info,
          actionLabel: 'Check again',
          onAction: () => actions++,
        ),
        locale: locale,
        textScale: scale,
      );
      expect(
        tester.getSemantics(find.byType(KararBanner)),
        isSemantics(isLiveRegion: true),
      );
      await tester.tap(find.text('Check again'));
      await tester.pumpAndSettle();
      expect(actions, 1);
      handle.dispose();
    }, textScales: testTextScales);

    testInBothDirections(
      'the dismiss control is named in the active language',
      (WidgetTester tester, Locale locale, double scale) async {
        final SemanticsHandle handle = tester.ensureSemantics();
        int dismissals = 0;
        await pumpKarar(
          tester,
          KararBanner(
            message: 'We are still checking your details.',
            tone: KararStatusTone.info,
            onDismiss: () => dismissals++,
          ),
          locale: locale,
        );
        final AppLocalizations l10n = AppLocalizations.of(
          tester.element(find.byType(KararBanner)),
        );
        await tester.tap(find.bySemanticsLabel(l10n.actionDismiss));
        await tester.pumpAndSettle();
        expect(dismissals, 1);
        handle.dispose();
      },
    );
  });

  group('state views', () {
    testInBothDirections('the empty state uses localized default copy', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        const KararStateView.empty(),
        locale: locale,
        textScale: scale,
      );
      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararStateView)),
      );
      expect(find.text(l10n.stateEmptyTitle), findsOneWidget);
      expect(find.text(l10n.stateEmptyDescription), findsOneWidget);
      expect(tester.takeException(), isNull);
    }, textScales: testTextScales);

    testWidgets('the Arabic empty state renders Arabic copy', (
      WidgetTester tester,
    ) async {
      await pumpKarar(
        tester,
        const KararStateView.empty(),
        locale: KararLocalization.arabic,
      );
      expect(
        find.text('لا يوجد شيء هنا بعد'),
        findsOneWidget,
        reason:
            'Proves the Arabic bundle is actually resolved, not just that the '
            'lookup returned something.',
      );
    });

    testInBothDirections(
      'the error state announces itself and offers a retry',
      (WidgetTester tester, Locale locale, double scale) async {
        final SemanticsHandle handle = tester.ensureSemantics();
        int retries = 0;
        await pumpKarar(
          tester,
          KararStateView.error(
            detail: 'Reference b7f1c2',
            onAction: () => retries++,
          ),
          locale: locale,
          textScale: scale,
        );
        final AppLocalizations l10n = AppLocalizations.of(
          tester.element(find.byType(KararStateView)),
        );
        expect(
          tester.getSemantics(find.byType(KararStateView)),
          isSemantics(isLiveRegion: true),
        );
        expect(find.text('Reference b7f1c2'), findsOneWidget);

        await tester.tap(find.text(l10n.actionRetry));
        await tester.pumpAndSettle();
        expect(retries, 1);
        handle.dispose();
      },
      textScales: testTextScales,
    );

    testInBothDirections('an error with no retry shows no action', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(tester, const KararStateView.error(), locale: locale);
      expect(find.byType(KararButton), findsNothing);
    });

    testInBothDirections('the offline state uses its own copy', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(tester, const KararStateView.offline(), locale: locale);
      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararStateView)),
      );
      expect(find.text(l10n.stateOfflineTitle), findsOneWidget);
    });
  });

  group('loading', () {
    testInBothDirections('the indicator is announced as a live region', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        const KararLoadingIndicator(),
        locale: locale,
        settle: false,
      );
      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararLoadingIndicator)),
      );
      expect(
        tester.getSemantics(find.byType(KararLoadingIndicator)),
        isSemantics(label: l10n.stateLoading, isLiveRegion: true),
        reason: 'A silent spinner is how "the app froze" becomes a ticket.',
      );
      handle.dispose();
    });

    testInBothDirections('a named subject is spoken', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        const KararLoadingView(subject: 'Karar'),
        locale: locale,
        settle: false,
      );
      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararLoadingIndicator)),
      );
      expect(
        find.bySemanticsLabel(l10n.stateLoadingWithSubject('Karar')),
        findsOneWidget,
      );
      handle.dispose();
    });

    testInBothDirections('an inline indicator stays silent', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        const KararLoadingIndicator.inline(),
        locale: locale,
        settle: false,
      );
      expect(
        find.descendant(
          of: find.byType(KararLoadingIndicator),
          matching: find.byType(ExcludeSemantics),
        ),
        findsOneWidget,
        reason: 'The parent control announces busy; the user hears it once.',
      );
      handle.dispose();
    });

    testInBothDirections('the skeleton stops pulsing when motion is reduced', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        const KararSkeletonBox(width: 120, height: 16),
        locale: locale,
        disableAnimations: true,
      );
      expect(find.byType(KararSkeletonBox), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('card', () {
    testInBothDirections('a plain card renders its content', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        const KararCard(child: KararListRow(title: 'Device security')),
        locale: locale,
        textScale: scale,
      );
      expect(find.text('Device security'), findsOneWidget);
      expect(tester.takeException(), isNull);
    }, textScales: testTextScales);

    testInBothDirections('a pressable card is a named button', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      int presses = 0;
      await pumpKarar(
        tester,
        KararCard.pressable(
          semanticLabel: 'Device security',
          onPressed: () => presses++,
          child: const SizedBox(height: 24),
        ),
        locale: locale,
      );
      expect(
        tester.getSemantics(find.byType(KararPressable)),
        isSemantics(
          label: 'Device security',
          isButton: true,
          hasTapAction: true,
        ),
      );
      await tester.tap(find.byType(KararCard));
      await tester.pumpAndSettle();
      expect(presses, 1);
      handle.dispose();
    });
  });

  group('checkbox tile', () {
    testInBothDirections(
      'reports its checked state and toggles from anywhere in the row',
      (WidgetTester tester, Locale locale, double scale) async {
        final SemanticsHandle handle = tester.ensureSemantics();
        bool value = false;
        await pumpKarar(
          tester,
          StatefulBuilder(
            builder: (BuildContext context, StateSetter setState) {
              return KararCheckboxTile(
                label: 'I have read the terms',
                value: value,
                onChanged: (bool next) => setState(() => value = next),
              );
            },
          ),
          locale: locale,
          textScale: scale,
        );
        expect(
          tester.getSemantics(find.byType(KararCheckboxTile)),
          isSemantics(isChecked: false, hasTapAction: true),
        );

        await tester.tap(find.text('I have read the terms'));
        await tester.pumpAndSettle();

        expect(
          tester.getSemantics(find.byType(KararCheckboxTile)),
          isSemantics(isChecked: true),
        );
        handle.dispose();
      },
      textScales: testTextScales,
    );

    testInBothDirections('the checkbox row meets the touch target floor', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        KararCheckboxTile(
          label: 'I have read the terms',
          value: false,
          onChanged: (_) {},
        ),
        locale: locale,
      );
      expect(
        tester.getSize(find.byType(KararCheckboxTile)).height,
        greaterThanOrEqualTo(KararSizing.standard.minTouchTarget),
      );
    });
  });
}
