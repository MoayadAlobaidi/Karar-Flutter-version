// The registration screen, and the enumeration-resistance guarantee.
//
// THE CENTRAL TEST IN THIS FILE is the one that renders the acknowledgement
// twice — once for a body describing a brand-new account, once for a body
// describing an address that is already registered — and asserts the two
// renderings are character-for-character identical. The platform deliberately
// answers both with 202 and the client must not undo that.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/presentation/localization/identity_strings.dart';
import 'package:karar_mobile/features/authentication/presentation/screens/register_screen.dart';

import 'support/identity_harness.dart';

/// Every string the widget tree renders, in order.
List<String> _renderedText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((Text text) => text.data ?? '')
    .where((String value) => value.isNotEmpty)
    .toList(growable: false);

Future<List<String>> _registerAndCapture(
  WidgetTester tester, {
  required JsonMapFixture body,
  required Locale locale,
  required double textScale,
  required IdentityStrings strings,
}) async {
  final IdentityHarness harness = IdentityHarness();
  harness.transport.onPost('/auth/register', body, statusCode: 202);

  await pumpIdentity(tester, const RegisterScreen(),
      harness: harness, locale: locale, textScale: textScale);
  await enterIdentityField(tester, 0, 'person@example.test');
  await enterIdentityField(tester, 1, 'correct-horse-battery');
  await enterIdentityField(tester, 2, 'correct-horse-battery');
  await tapIdentityButton(tester, strings.registerAction);
  await tester.pumpAndSettle();

  final List<String> rendered = _renderedText(tester);
  // Unmount before the next capture. Replacing a live tree directly leaves the
  // outgoing one's animations running into the incoming frame.
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pumpAndSettle();
  return rendered;
}

typedef JsonMapFixture = Map<String, Object?>;

void main() {
  testEveryDirectionAndScale('renders the form in the locale direction',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final IdentityStrings strings =
        locale.languageCode == 'ar' ? IdentityStrings.arabic : IdentityStrings.english;

    await pumpIdentity(tester, const RegisterScreen(),
        harness: harness, locale: locale, textScale: textScale);

    expect(find.text(strings.registerSubtitle), findsOneWidget);
    expect(find.text(strings.registerConfirmPasswordLabel), findsOneWidget);
    expect(
      Directionality.of(tester.element(find.byType(RegisterScreen))),
      locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
    );
    expect(tester.takeException(), isNull);
  });

  testEveryDirectionAndScale(
    'a new address and an already-registered address render identically',
    (WidgetTester tester, Locale locale, double textScale) async {
      final IdentityStrings strings = locale.languageCode == 'ar'
          ? IdentityStrings.arabic
          : IdentityStrings.english;

      final List<String> fresh = await _registerAndCapture(
        tester,
        body: <String, Object?>{
          'status': 'accepted',
          'detail': 'Account created. Verification code sent.',
        },
        locale: locale,
        textScale: textScale,
        strings: strings,
      );

      final List<String> existing = await _registerAndCapture(
        tester,
        body: <String, Object?>{
          'status': 'accepted',
          'detail': 'That address is already registered; we sent a sign-in reminder.',
          'alreadyRegistered': true,
          'existingAccountCreatedAt': '2024-03-01T00:00:00Z',
        },
        locale: locale,
        textScale: textScale,
        strings: strings,
      );

      // Identical, not merely similar. Any difference at all — a word, a
      // count, a timestamp — tells an attacker whether the address exists.
      expect(existing, equals(fresh));
      expect(fresh, contains(strings.registerAcknowledgementMessage));
      // Nothing the server wrote is on screen.
      expect(
        fresh.where((String value) => value.contains('already registered')),
        isEmpty,
      );
      expect(fresh.where((String value) => value.contains('2024-03-01')), isEmpty);
    },
  );

  testEveryDirectionAndScale('rejects a mismatched confirmation before sending',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final IdentityStrings strings =
        locale.languageCode == 'ar' ? IdentityStrings.arabic : IdentityStrings.english;

    await pumpIdentity(tester, const RegisterScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'person@example.test');
    await enterIdentityField(tester, 1, 'correct-horse-battery');
    await enterIdentityField(tester, 2, 'correct-horse-batteryX');
    await tapIdentityButton(tester, strings.registerAction);
    await tester.pumpAndSettle();

    expect(find.text(strings.confirmPasswordMismatch), findsOneWidget);
    expect(harness.transport.requests, isEmpty);
  });

  testEveryDirectionAndScale('surfaces a rate limit without a diagnostic',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final IdentityStrings strings =
        locale.languageCode == 'ar' ? IdentityStrings.arabic : IdentityStrings.english;
    harness.transport.failWith(
      HttpMethod.post,
      '/auth/register',
      const RateLimitedFailure(code: 'VERIFICATION_SEND_BUDGET_EXHAUSTED'),
      statusCode: 429,
    );

    await pumpIdentity(tester, const RegisterScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'person@example.test');
    await enterIdentityField(tester, 1, 'correct-horse-battery');
    await enterIdentityField(tester, 2, 'correct-horse-battery');
    await tapIdentityButton(tester, strings.registerAction);
    await tester.pumpAndSettle();

    expect(find.text(strings.failureRateLimited), findsOneWidget);
    expect(find.textContaining('BUDGET_EXHAUSTED'), findsNothing);
    expect(find.textContaining('429'), findsNothing);
  });

  testWidgets('every interactive control carries a name', (WidgetTester tester) async {
    final IdentityHarness harness = IdentityHarness();
    final SemanticsHandle handle = tester.ensureSemantics();

    await pumpIdentity(tester, const RegisterScreen(), harness: harness);

    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });
}
