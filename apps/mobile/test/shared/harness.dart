import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

/// The locales every component is proven in. Adding a language here makes the
/// whole component suite run against it.
const List<Locale> testLocales = <Locale>[KararLocalization.english, KararLocalization.arabic];

/// Normal, and the largest scale the platform accessibility settings offer.
const List<double> testTextScales = <double>[1.0, 2.0];

/// Mounts [child] inside the real shell wiring: the product theme, the product
/// localization delegates, and the theme scope that re-resolves typography for
/// the active locale.
///
/// Direction is never passed in. It is derived from [locale] by the framework,
/// which is the only way a test can prove that Arabic actually produces an RTL
/// tree rather than that the test author remembered to ask for one.
Future<void> pumpKarar(
  WidgetTester tester,
  Widget child, {
  Locale locale = KararLocalization.english,
  double textScale = 1.0,
  Brightness brightness = Brightness.light,
  bool disableAnimations = false,
  bool settle = true,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      localizationsDelegates: KararLocalization.localizationsDelegates,
      supportedLocales: KararLocalization.supportedLocales,
      localeResolutionCallback: KararLocalization.resolve,
      theme: brightness == Brightness.dark
          ? KararTheme.dark(locale: locale)
          : KararTheme.light(locale: locale),
      builder: (BuildContext context, Widget? child) {
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
            disableAnimations: disableAnimations,
          ),
          child: KararThemeScope(child: child),
        );
      },
      home: Scaffold(body: Center(child: child)),
    ),
  );
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    // A widget with a perpetual animation — a spinner, a skeleton — never
    // settles. Two frames are enough for the localization delegates to load.
    await tester.pump();
    await tester.pump();
  }
}

/// Declares one test per shipped locale, and per text scale when more than one
/// is requested.
void testInBothDirections(
  String description,
  Future<void> Function(WidgetTester tester, Locale locale, double textScale) body, {
  List<double> textScales = const <double>[1.0],
}) {
  for (final Locale locale in testLocales) {
    for (final double scale in textScales) {
      final String suffix = textScales.length == 1
          ? locale.languageCode
          : '${locale.languageCode} @${scale}x';
      testWidgets('$description [$suffix]', (WidgetTester tester) async {
        await body(tester, locale, scale);
      });
    }
  }
}

/// The text direction the framework resolved for the subtree under [finder].
TextDirection directionOf(WidgetTester tester, Finder finder) {
  return Directionality.of(tester.element(finder));
}
