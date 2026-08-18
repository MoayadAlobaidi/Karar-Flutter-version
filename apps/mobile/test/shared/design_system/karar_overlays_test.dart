import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../harness.dart';

void main() {
  group('dialog', () {
    testInBothDirections('presents its copy and both actions', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      int confirmations = 0;
      await pumpKarar(
        tester,
        _DialogOpener(
          builder: (BuildContext context) => KararDialog(
            title: 'Sign out',
            message: 'You will need to sign in again on this device.',
            confirmLabel: AppLocalizations.of(context).actionConfirm,
            cancelLabel: AppLocalizations.of(context).actionCancel,
            onConfirm: () => confirmations++,
          ),
        ),
        locale: locale,
        textScale: scale,
      );
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararDialog)),
      );
      expect(find.text('Sign out'), findsOneWidget);
      expect(find.text(l10n.actionConfirm), findsOneWidget);
      expect(find.text(l10n.actionCancel), findsOneWidget);

      await tester.tap(find.text(l10n.actionConfirm));
      await tester.pumpAndSettle();
      expect(confirmations, 1);
      expect(tester.takeException(), isNull);
    }, textScales: testTextScales);

    testInBothDirections('names itself as a route so the modal is announced', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        _DialogOpener(
          builder: (BuildContext context) => KararDialog(
            title: 'Sign out',
            message: 'You will need to sign in again on this device.',
            confirmLabel: AppLocalizations.of(context).actionConfirm,
            onConfirm: () {},
          ),
        ),
        locale: locale,
      );
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararDialog)),
      );
      expect(
        tester.getSemantics(find.byType(KararDialog)),
        isSemantics(label: l10n.a11yDialog, namesRoute: true),
      );
      handle.dispose();
    });

    testWidgets('the actions stack instead of truncating at large text', (
      WidgetTester tester,
    ) async {
      Widget dialog(BuildContext context) => KararDialog(
        title: 'Sign out',
        message: 'You will need to sign in again on this device.',
        confirmLabel: AppLocalizations.of(context).actionConfirm,
        cancelLabel: AppLocalizations.of(context).actionCancel,
        onConfirm: () {},
      );

      await pumpKarar(tester, _DialogOpener(builder: dialog));
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();
      expect(
        tester.getCenter(find.text('Confirm')).dy,
        tester.getCenter(find.text('Cancel')).dy,
        reason: 'At normal text the two actions share a row.',
      );
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      await pumpKarar(tester, _DialogOpener(builder: dialog), textScale: 2);
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      expect(
        tester.getCenter(find.text('Confirm')).dy,
        lessThan(tester.getCenter(find.text('Cancel')).dy),
        reason:
            'At large text the two actions cannot share a row, so they stack '
            'rather than clip, with the confirming action still first.',
      );
      expect(tester.takeException(), isNull);
    });
  });

  group('bottom sheet', () {
    testInBothDirections('always offers a named close control', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        _SheetOpener(
          builder: (BuildContext context) => const KararBottomSheet(
            title: 'Language',
            child: KararListRow(title: 'English'),
          ),
        ),
        locale: locale,
        textScale: scale,
      );
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararBottomSheet)),
      );
      expect(find.text('Language'), findsOneWidget);

      await tester.tap(find.bySemanticsLabel(l10n.actionClose));
      await tester.pumpAndSettle();
      expect(
        find.byType(KararBottomSheet),
        findsNothing,
        reason:
            'A sheet that can only be dismissed by dragging is unreachable '
            'to a switch-control or screen-reader user.',
      );
    }, textScales: testTextScales);

    testInBothDirections('the sheet is announced as a modal route', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpKarar(
        tester,
        _SheetOpener(
          builder: (BuildContext context) => const KararBottomSheet(
            title: 'Language',
            child: KararListRow(title: 'English'),
          ),
        ),
        locale: locale,
      );
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      final AppLocalizations l10n = AppLocalizations.of(
        tester.element(find.byType(KararBottomSheet)),
      );
      expect(
        tester.getSemantics(find.byType(KararBottomSheet)),
        isSemantics(label: l10n.a11ySheet, namesRoute: true),
      );
      handle.dispose();
    });

    testInBothDirections('the sheet title sits at the start of the header', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpKarar(
        tester,
        _SheetOpener(
          builder: (BuildContext context) => const KararBottomSheet(
            title: 'Language',
            child: KararListRow(title: 'English'),
          ),
        ),
        locale: locale,
      );
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      final double title = tester.getCenter(find.text('Language')).dx;
      final double close = tester.getCenter(find.byType(KararIconButton)).dx;
      if (locale == KararLocalization.arabic) {
        expect(title, greaterThan(close));
      } else {
        expect(title, lessThan(close));
      }
    });
  });
}

class _DialogOpener extends StatelessWidget {
  const _DialogOpener({required this.builder});

  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: () =>
          showKararDialog<void>(context: context, builder: builder),
      child: const SizedBox(width: 80, height: 24),
    );
  }
}

class _SheetOpener extends StatelessWidget {
  const _SheetOpener({required this.builder});

  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: () =>
          showKararBottomSheet<void>(context: context, builder: builder),
      child: const SizedBox(width: 80, height: 24),
    );
  }
}
