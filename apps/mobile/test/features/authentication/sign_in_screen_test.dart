// The sign-in screen, in English LTR and Arabic RTL, at normal and large text
// scale, across its loading, error and validation states.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/presentation/screens/sign_in_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import 'support/identity_harness.dart';

void main() {
  testEveryDirectionAndScale('renders and reads in the locale direction',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final AppLocalizations l10n = lookupAppLocalizations(locale);

    await pumpIdentity(tester, const SignInScreen(),
        harness: harness, locale: locale, textScale: textScale);

    expect(find.text(l10n.signInTitle), findsWidgets);
    expect(find.text(l10n.signInSubtitle), findsOneWidget);
    expect(find.text(l10n.signInEmailLabel), findsOneWidget);
    expect(find.text(l10n.signInPasswordLabel), findsOneWidget);

    // Direction is derived by the framework from the locale, never passed in,
    // so this proves Arabic actually produces an RTL tree.
    expect(
      Directionality.of(tester.element(find.byType(SignInScreen))),
      locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
    );
    // A form taller than the viewport at 2x must scroll rather than clip.
    expect(tester.takeException(), isNull);
  });

  testEveryDirectionAndScale('shows the generic message for rejected credentials',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final AppLocalizations l10n = lookupAppLocalizations(locale);
    harness.transport.failWith(
      HttpMethod.post,
      '/auth/login',
      const AuthenticationRequiredFailure(),
      statusCode: 401,
    );

    await pumpIdentity(tester, const SignInScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'person@example.test');
    await enterIdentityField(tester, 1, 'correct-horse-battery');
    await tapIdentityButton(tester, l10n.signInAction);
    await tester.pumpAndSettle();

    // One message covers unknown address, wrong password, disabled account and
    // an engaged lockout — the same single answer the platform gives.
    expect(find.text(l10n.signInInvalidCredentials), findsOneWidget);
    // No diagnostic leaks into the UI.
    expect(find.textContaining('401'), findsNothing);
    expect(find.textContaining('authentication_required'), findsNothing);
  });

  testEveryDirectionAndScale('announces field errors rather than colouring them',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final AppLocalizations l10n = lookupAppLocalizations(locale);

    await pumpIdentity(tester, const SignInScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'not-an-address');
    await enterIdentityField(tester, 1, 'short');
    await tapIdentityButton(tester, l10n.signInAction);
    await tester.pumpAndSettle();

    // Status is carried by words, not by a red border alone.
    expect(find.text(l10n.emailMalformed), findsOneWidget);
    expect(find.text(l10n.passwordTooShort(8)), findsOneWidget);
    // Nothing was sent: the client stopped at its own validation.
    expect(harness.transport.requests, isEmpty);
  });

  testEveryDirectionAndScale('blocks a second submission while one is in flight',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final AppLocalizations l10n = lookupAppLocalizations(locale);
    harness.transport.on(HttpMethod.post, '/auth/login', (_) async {
      await Future<void>.delayed(const Duration(milliseconds: 50));
      return ApiResponse(
        statusCode: 200,
        body: sessionPayload(now: harness.clock.nowUtc()),
      );
    });

    await pumpIdentity(tester, const SignInScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'person@example.test');
    await enterIdentityField(tester, 1, 'correct-horse-battery');
    await tapIdentityButton(tester, l10n.signInAction);
    await tester.pump();

    // A double tap must not spend two attempts against the per-address budget.
    await tester.tap(identityButton(l10n.signInAction), warnIfMissed: false);
    await tester.pump();
    await tester.pumpAndSettle();

    expect(harness.transport.callsTo('/auth/login'), 1);
  });

  testEveryDirectionAndScale('explains a secure-storage failure at the gate',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final AppLocalizations l10n = lookupAppLocalizations(locale);

    await pumpIdentity(
      tester,
      const SignInScreen(
        startupState: Unauthenticated(secureStorageUnavailable: true),
      ),
      harness: harness,
      locale: locale,
      textScale: textScale,
    );

    expect(find.text(l10n.signInSecureStorageNotice), findsOneWidget);
  });

  testEveryDirectionAndScale('never renders the password it was given',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    harness.transport
        .onPost('/auth/login', sessionPayload(now: harness.clock.nowUtc()));
    final AppLocalizations l10n = lookupAppLocalizations(locale);

    await pumpIdentity(tester, const SignInScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'person@example.test');
    await enterIdentityField(tester, 1, 'correct-horse-battery');
    await tapIdentityButton(tester, l10n.signInAction);
    await tester.pumpAndSettle();

    // The credential must not survive in any rendered Text, and no token may
    // appear anywhere in the tree.
    for (final Text text in tester.widgetList<Text>(find.byType(Text))) {
      expect(text.data ?? '', isNot(contains('access-token-fixture')));
      expect(text.data ?? '', isNot(contains('refresh-token-fixture')));
      expect(text.data ?? '', isNot(contains('correct-horse-battery')));
    }
  });

  testWidgets('every interactive control carries a name', (WidgetTester tester) async {
    final IdentityHarness harness = IdentityHarness();
    final SemanticsHandle handle = tester.ensureSemantics();

    await pumpIdentity(tester, const SignInScreen(), harness: harness);

    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });
}
