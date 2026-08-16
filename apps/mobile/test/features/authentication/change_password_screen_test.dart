// The change-password screen, including the sensitive-content cover.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/presentation/localization/identity_strings.dart';
import 'package:karar_mobile/features/authentication/presentation/screens/change_password_screen.dart';
import 'package:karar_mobile/features/authentication/presentation/widgets/sensitive_screen.dart';

import 'support/identity_harness.dart';

void main() {
  testEveryDirectionAndScale('renders the form in the locale direction',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    await harness.signInFixture();
    final IdentityStrings strings =
        locale.languageCode == 'ar' ? IdentityStrings.arabic : IdentityStrings.english;

    await pumpIdentity(tester, const ChangePasswordScreen(),
        harness: harness, locale: locale, textScale: textScale);

    expect(find.text(strings.changePasswordSubtitle), findsOneWidget);
    expect(find.text(strings.changePasswordCurrentLabel), findsOneWidget);
    expect(find.text(strings.changePasswordNewLabel), findsOneWidget);
    expect(
      Directionality.of(tester.element(find.byType(ChangePasswordScreen))),
      locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
    );
    expect(tester.takeException(), isNull);
  });

  testEveryDirectionAndScale('confirms the change and states what it did',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    await harness.signInFixture();
    final IdentityStrings strings =
        locale.languageCode == 'ar' ? IdentityStrings.arabic : IdentityStrings.english;
    harness.transport
        .onPost('/auth/change-password', <String, Object?>{'status': 'changed'});
    harness.refreshTransport
        .onPost('/auth/refresh', refreshPayload(now: harness.clock.nowUtc()));

    await pumpIdentity(tester, const ChangePasswordScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'old-password');
    await enterIdentityField(tester, 1, 'brand-new-password');
    await enterIdentityField(tester, 2, 'brand-new-password');
    await tapIdentityButton(tester, strings.changePasswordAction);
    await tester.pumpAndSettle();

    expect(find.text(strings.changePasswordSuccessMessage), findsOneWidget);
    // The access token was rotated, because the server bumped the token
    // version.
    expect(harness.refreshTransport.callsTo('/auth/refresh'), 1);
  });

  testEveryDirectionAndScale('reports an incorrect current password generically',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    await harness.signInFixture();
    final IdentityStrings strings =
        locale.languageCode == 'ar' ? IdentityStrings.arabic : IdentityStrings.english;
    harness.transport.failWith(
      HttpMethod.post,
      '/auth/change-password',
      const AuthenticationRequiredFailure(),
      statusCode: 401,
    );

    await pumpIdentity(tester, const ChangePasswordScreen(),
        harness: harness, locale: locale, textScale: textScale);
    await enterIdentityField(tester, 0, 'wrong-password');
    await enterIdentityField(tester, 1, 'brand-new-password');
    await enterIdentityField(tester, 2, 'brand-new-password');
    await tapIdentityButton(tester, strings.changePasswordAction);
    await tester.pumpAndSettle();

    expect(find.text(strings.changePasswordIncorrectCurrent), findsOneWidget);
  });

  testWidgets('neither password appears anywhere in the rendered tree',
      (WidgetTester tester) async {
    final IdentityHarness harness = IdentityHarness();
    await harness.signInFixture();
    harness.transport
        .onPost('/auth/change-password', <String, Object?>{'status': 'changed'});
    harness.refreshTransport
        .onPost('/auth/refresh', refreshPayload(now: harness.clock.nowUtc()));

    await pumpIdentity(tester, const ChangePasswordScreen(), harness: harness);
    await enterIdentityField(tester, 0, 'old-password');
    await enterIdentityField(tester, 1, 'brand-new-password');
    await enterIdentityField(tester, 2, 'brand-new-password');
    await tapIdentityButton(tester, IdentityStrings.english.changePasswordAction);
    await tester.pumpAndSettle();

    for (final Text text in tester.widgetList<Text>(find.byType(Text))) {
      expect(text.data ?? '', isNot(contains('old-password')));
      expect(text.data ?? '', isNot(contains('brand-new-password')));
    }
    expect(harness.preferences.writtenText, isNot(contains('brand-new-password')));
    expect(harness.loggedText, isNot(contains('brand-new-password')));
  });

  testWidgets('is wrapped in the sensitive-content cover', (WidgetTester tester) async {
    final IdentityHarness harness = IdentityHarness();
    await harness.signInFixture();

    await pumpIdentity(tester, const ChangePasswordScreen(), harness: harness);

    expect(find.byType(SensitiveScreen), findsOneWidget);
  });

  testWidgets('every interactive control carries a name', (WidgetTester tester) async {
    final IdentityHarness harness = IdentityHarness();
    await harness.signInFixture();
    final SemanticsHandle handle = tester.ensureSemantics();

    await pumpIdentity(tester, const ChangePasswordScreen(), harness: harness);

    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });
}
