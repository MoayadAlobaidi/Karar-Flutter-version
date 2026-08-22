import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

void main() {
  group('directional icons', () {
    test('every directional icon mirrors itself under RTL', () {
      for (final IconData icon in KararIcons.directional) {
        expect(
          icon.matchTextDirection,
          isTrue,
          reason:
              'A forward arrow that keeps pointing right in Arabic sends the '
              'user the wrong way. Only icons the framework mirrors belong in '
              'KararIcons.directional.',
        );
      }
    });

    testInBothDirections('a mirrored icon reports the resolved direction', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(tester, const Icon(KararIcons.navigateNext), locale: locale);
      final RichText rendered = tester.widget(
        find.descendant(of: find.byType(Icon), matching: find.byType(RichText)),
      );
      expect(
        rendered.textDirection,
        locale == KararLocalization.arabic ? TextDirection.rtl : TextDirection.ltr,
      );
    });
  });

  group('app bar', () {
    testInBothDirections('renders the title and a named back control', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      int backs = 0;
      await pumpKarar(
        tester,
        KararAppBar(title: 'Settings', onBack: () => backs++),
        locale: locale,
        textScale: scale,
      );
      final AppLocalizations l10n = AppLocalizations.of(tester.element(find.byType(KararAppBar)));
      expect(find.text('Settings'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel(l10n.actionBack));
      await tester.pumpAndSettle();
      expect(backs, 1);
    }, textScales: testTextScales);

    testInBothDirections('the back control sits at the start of the bar', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        SizedBox(
          width: 400,
          child: KararAppBar(title: 'Settings', onBack: () {}),
        ),
        locale: locale,
      );
      final double back = tester.getCenter(find.byType(KararIconButton)).dx;
      final double title = tester.getCenter(find.text('Settings')).dx;
      if (locale == KararLocalization.arabic) {
        expect(back, greaterThan(title));
      } else {
        expect(back, lessThan(title));
      }
    });

    testInBothDirections('the title is a heading', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(tester, const KararAppBar(title: 'Settings'), locale: locale);
      expect(tester.getSemantics(find.text('Settings')), isSemantics(isHeader: true));
      handle.dispose();
    });
  });

  group('navigation bar', () {
    const List<KararNavigationDestination> destinations = <KararNavigationDestination>[
      KararNavigationDestination(icon: Icons.home_outlined, label: 'Home'),
      KararNavigationDestination(icon: Icons.settings_outlined, label: 'Settings'),
    ];

    testInBothDirections('renders a label for every destination', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        KararNavigationBar(
          destinations: destinations,
          selectedIndex: 0,
          onDestinationSelected: (_) {},
        ),
        locale: locale,
        textScale: scale,
      );
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Settings'), findsOneWidget);
      expect(tester.takeException(), isNull);
    }, textScales: testTextScales);

    testInBothDirections('the first destination sits at the start', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        SizedBox(
          width: 400,
          child: KararNavigationBar(
            destinations: destinations,
            selectedIndex: 0,
            onDestinationSelected: (_) {},
          ),
        ),
        locale: locale,
      );
      final double first = tester.getCenter(find.text('Home')).dx;
      final double second = tester.getCenter(find.text('Settings')).dx;
      if (locale == KararLocalization.arabic) {
        expect(
          first,
          greaterThan(second),
          reason: 'Reading order runs right to left, and so does the bar.',
        );
      } else {
        expect(first, lessThan(second));
      }
    });

    testInBothDirections('the selected destination is announced and positioned', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        KararNavigationBar(
          destinations: destinations,
          selectedIndex: 1,
          onDestinationSelected: (_) {},
        ),
        locale: locale,
      );
      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararNavigationBar)),
      );
      expect(
        tester.getSemantics(find.bySemanticsLabel('Settings')),
        isSemantics(
          isSelected: true,
          isButton: true,
          hasTapAction: true,
          hint: l10n.a11yTabPosition(2, 2),
        ),
      );
      handle.dispose();
    });

    testInBothDirections('selecting a destination reports its index', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      int? selected;
      await pumpKarar(
        tester,
        KararNavigationBar(
          destinations: destinations,
          selectedIndex: 0,
          onDestinationSelected: (int index) => selected = index,
        ),
        locale: locale,
      );
      await tester.tap(find.text('Settings'));
      await tester.pumpAndSettle();
      expect(selected, 1);
    });
  });

  group('list row', () {
    testInBothDirections('renders title and subtitle and keeps the chevron at the end', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        SizedBox(
          width: 400,
          child: KararListRow(
            title: 'Language',
            subtitle: 'English',
            leadingIcon: KararIcons.language,
            onPressed: () {},
          ),
        ),
        locale: locale,
        textScale: scale,
      );
      expect(find.text('Language'), findsOneWidget);
      expect(find.text('English'), findsOneWidget);

      final double leading = tester.getCenter(find.byIcon(KararIcons.language)).dx;
      final double chevron = tester.getCenter(find.byIcon(KararIcons.navigateNext)).dx;
      if (locale == KararLocalization.arabic) {
        expect(leading, greaterThan(chevron));
      } else {
        expect(leading, lessThan(chevron));
      }
    }, textScales: testTextScales);

    testInBothDirections('a pressable row is announced with both lines', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        KararListRow(title: 'Language', subtitle: 'English', onPressed: () {}),
        locale: locale,
      );
      final AppLocalizations l10n = AppLocalizations.of(tester.element(find.byType(KararListRow)));
      expect(
        tester.getSemantics(find.byType(KararPressable)),
        isSemantics(
          label: l10n.a11yTitleWithSubtitle('Language', 'English'),
          isButton: true,
          hasTapAction: true,
        ),
      );
      handle.dispose();
    });

    testInBothDirections('a row with no action has no chevron', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(tester, const KararListRow(title: 'Version'), locale: locale);
      expect(find.byIcon(KararIcons.navigateNext), findsNothing);
    });
  });
}
