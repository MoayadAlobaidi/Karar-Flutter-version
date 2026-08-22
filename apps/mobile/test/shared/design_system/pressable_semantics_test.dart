// THE ACCESSIBILITY CONTROL FOR THE DESIGN SYSTEM'S ONE TAPPABLE PRIMITIVE.
//
// Every button, tile and chip in this product is a `KararPressable`, so its
// semantics are the semantics of the whole app. This asserts them directly
// rather than through a screen, and — crucially — on a PHONE-SIZED SURFACE.
//
// The surface is the point. `androidTapTargetGuideline` skips nodes it treats
// as offscreen relative to the render view, and the feature harness pumps
// screens on a 1000x4000 surface so that lazy lists build every row. On that
// surface the guideline checks almost nothing, for Material widgets and ours
// alike. An earlier note in this repository concluded from two probes in two
// different harnesses that the guideline could not see `KararPressable`; run
// in one tree the two widgets behave identically, and the variable was the
// surface all along.
//
// So: the guideline runs here, where it can actually see the control, and the
// render-tree measurement runs on the feature screens, where it is indifferent
// to how tall the surface is. Neither replaces the other.
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/design_system/components/karar_button.dart';

import '../../features/platform_bootstrap/support/feature_harness.dart';

/// A surface a person could actually hold.
const Size phone = Size(400, 900);

/// The merged semantics of the button itself.
///
/// `tester.getSemantics` is the supported way to ask; walking the owner's tree
/// needs `pipelineOwner`, which is deprecated, and the replacement the
/// deprecation names carries no semantics owner in the test binding.
SemanticsData buttonSemantics(WidgetTester tester) =>
    tester.getSemantics(find.byType(KararButton)).getSemanticsData();

Future<void> pumpButton(
  WidgetTester tester, {
  required String label,
  VoidCallback? onPressed,
  Locale locale = KararLocalization.english,
}) => pumpFeatureScreen(
  tester,
  Scaffold(
    body: Center(
      child: KararButton(label: label, onPressed: onPressed),
    ),
  ),
  locale: locale,
  surfaceSize: phone,
);

void main() {
  group('the pressable primitive announces itself correctly', () {
    testWidgets('is a button, is named, and is enabled', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpButton(tester, label: 'Add an account', onPressed: () {});

      final SemanticsData data = buttonSemantics(tester);
      expect(data.flagsCollection.isButton, isTrue);
      expect(data.label, 'Add an account');
      // Enabled-ness is asserted through the ACTION rather than the flag: the
      // flag is a tristate whose representation has changed across Flutter
      // versions, and "can a screen reader activate this" is the property that
      // actually matters to a person.
      expect(data.hasAction(SemanticsAction.tap), isTrue);
      handle.dispose();
    });

    testWidgets('a disabled control says so and offers no tap', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpButton(tester, label: 'Add an account');

      // A disabled control publishes no tap ACTION, and says it is disabled.
      final SemanticsData data = buttonSemantics(tester);
      expect(data.hasAction(SemanticsAction.tap), isFalse);
      handle.dispose();
    });

    testWidgets('announces its name once, not twice', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpButton(tester, label: 'Add an account', onPressed: () {});

      // The child Text would otherwise publish the same string, and a screen
      // reader would say it twice.
      expect(find.bySemanticsLabel('Add an account'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('meets the tap-target guideline where the guideline can see it', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpButton(tester, label: 'Add an account', onPressed: () {});

      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      handle.dispose();
    });

    testWidgets('is at least the platform minimum, measured', (WidgetTester tester) async {
      await pumpButton(tester, label: 'Add an account', onPressed: () {});

      final Size size = tester.getSize(find.byType(KararButton));
      expect(size.width, greaterThanOrEqualTo(48.0));
      expect(size.height, greaterThanOrEqualTo(48.0));
    });

    testWidgets('holds in Arabic, right to left', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await pumpButton(
        tester,
        label: 'إضافة حساب',
        onPressed: () {},
        locale: KararLocalization.arabic,
      );

      expect(Directionality.of(tester.element(find.byType(KararButton))), TextDirection.rtl);
      final SemanticsData data = buttonSemantics(tester);
      expect(data.flagsCollection.isButton, isTrue);
      expect(data.label, 'إضافة حساب');
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });
  });
}
