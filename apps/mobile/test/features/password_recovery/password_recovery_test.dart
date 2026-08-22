// Password recovery: request-reset enumeration resistance, reset-token
// handling, and the credential wipe a completed reset requires.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/domain/entities/neutral_receipt.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/email_address.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/password.dart';
import 'package:karar_mobile/features/authentication/presentation/widgets/sensitive_screen.dart';
import 'package:karar_mobile/features/password_recovery/presentation/forgot_password_screen.dart';
import 'package:karar_mobile/features/password_recovery/presentation/password_recovery_providers.dart';
import 'package:karar_mobile/features/password_recovery/presentation/reset_password_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../authentication/support/identity_harness.dart';

EmailAddress _email() => (EmailAddress.parse('person@example.test') as EmailAccepted).email;

Password _password([String value = 'brand-new-password']) =>
    (const PasswordPolicy().parse(value) as PasswordAccepted).password;

List<String> _renderedText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((Text text) => text.data ?? '')
    .where((String value) => value.isNotEmpty)
    .toList(growable: false);

void main() {
  group('request reset', () {
    test('every outcome produces the same value', () async {
      final List<Result<NeutralReceipt>> outcomes = <Result<NeutralReceipt>>[];
      for (final Map<String, Object?> body in <Map<String, Object?>>[
        <String, Object?>{'status': 'accepted', 'detail': 'Instructions sent.'},
        <String, Object?>{'status': 'accepted', 'detail': 'No such account.'},
        <String, Object?>{'status': 'accepted', 'detail': 'Cooling down.', 'cooldownSeconds': 60},
      ]) {
        final IdentityHarness harness = IdentityHarness();
        harness.transport.onPost('/auth/forgot-password', body, statusCode: 202);
        outcomes.add(
          await harness.container
              .read(passwordRecoveryRepositoryProvider)
              .requestReset(email: _email()),
        );
      }

      expect(outcomes.toSet(), hasLength(1));
    });

    test('a rate limit is reported as a typed failure', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/forgot-password',
        const RateLimitedFailure(),
        statusCode: 429,
      );

      final Result<NeutralReceipt> outcome = await harness.container
          .read(passwordRecoveryRepositoryProvider)
          .requestReset(email: _email());

      expect(outcome.failureOrNull, isA<RateLimitedFailure>());
    });
  });

  group('reset password', () {
    test('a completed reset wipes the local credential', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onPost('/auth/reset-password', <String, Object?>{'status': 'reset'});

      final Result<void> outcome = await harness.container
          .read(passwordRecoveryRepositoryProvider)
          .resetPassword(
            token: const OpaqueSecret('reset-token-fixture'),
            newPassword: _password(),
          );

      expect(outcome, isA<Success<void>>());
      // The server revoked EVERY session, including this device's. Presenting
      // a superseded refresh token afterwards is what the platform treats as
      // theft, so the client must not keep it.
      expect(harness.container.read(sessionManagerProvider).hasSession, isFalse);
      expect(harness.secureEntries, isEmpty);
    });

    test('an invalid token is reported and no credential is wiped', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/reset-password',
        const AuthenticationRequiredFailure(),
        statusCode: 401,
      );

      final Result<void> outcome = await harness.container
          .read(passwordRecoveryRepositoryProvider)
          .resetPassword(token: const OpaqueSecret('stale-token'), newPassword: _password());

      expect(outcome.failureOrNull, isA<AuthenticationRequiredFailure>());
      expect(
        harness.container.read(sessionManagerProvider).hasSession,
        isTrue,
        reason: 'a reset that did not happen must not end an unrelated session',
      );
    });

    test('the reset token and the new password never reach a log or preferences', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport.onPost('/auth/reset-password', <String, Object?>{'status': 'reset'});

      await harness.container
          .read(passwordRecoveryRepositoryProvider)
          .resetPassword(
            token: const OpaqueSecret('reset-token-fixture'),
            newPassword: _password('brand-new-password'),
          );

      expect(harness.loggedText, isNot(contains('reset-token-fixture')));
      expect(harness.loggedText, isNot(contains('brand-new-password')));
      expect(harness.preferences.writtenText, isNot(contains('reset-token-fixture')));
      expect(harness.preferences.writtenText, isNot(contains('brand-new-password')));
    });

    test('an unclassifiable payload degrades to a contract violation', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport.on(HttpMethod.post, '/auth/reset-password', (_) async => throw TypeError());

      final Result<void> outcome = await harness.container
          .read(passwordRecoveryRepositoryProvider)
          .resetPassword(
            token: const OpaqueSecret('reset-token-fixture'),
            newPassword: _password(),
          );

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
    });
  });

  group('forgot-password screen', () {
    testEveryDirectionAndScale('renders in the locale direction', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(locale);

      await pumpIdentity(
        tester,
        const ForgotPasswordScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );

      expect(find.text(l10n.forgotPasswordSubtitle), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(ForgotPasswordScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testEveryDirectionAndScale('a known and an unknown address render identically', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      final List<List<String>> renderings = <List<String>>[];

      for (final Map<String, Object?> body in <Map<String, Object?>>[
        <String, Object?>{'status': 'accepted', 'detail': 'Reset link sent.'},
        <String, Object?>{
          'status': 'accepted',
          'detail': 'No account for that address.',
          'accountExists': false,
        },
      ]) {
        final IdentityHarness harness = IdentityHarness();
        harness.transport.onPost('/auth/forgot-password', body, statusCode: 202);

        await pumpIdentity(
          tester,
          const ForgotPasswordScreen(),
          harness: harness,
          locale: locale,
          textScale: textScale,
        );
        await enterIdentityField(tester, 0, 'person@example.test');
        await tapIdentityButton(tester, l10n.forgotPasswordAction);
        await tester.pumpAndSettle();

        renderings.add(_renderedText(tester));
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      }

      expect(renderings[1], equals(renderings[0]));
      expect(renderings[0], contains(l10n.forgotPasswordAcknowledgementMessage));
      expect(renderings[0].where((String value) => value.contains('No account')), isEmpty);
    });
  });

  group('reset-password screen', () {
    testEveryDirectionAndScale('renders in the locale direction', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(locale);

      await pumpIdentity(
        tester,
        const ResetPasswordScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );

      expect(find.text(l10n.resetPasswordTokenLabel), findsOneWidget);
      expect(find.text(l10n.resetPasswordNewLabel), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(ResetPasswordScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('is wrapped in the sensitive-content cover', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();

      await pumpIdentity(tester, const ResetPasswordScreen(), harness: harness);

      expect(find.byType(SensitiveScreen), findsOneWidget);
    });

    testWidgets('a token from the link is prefilled but never rendered as text', (
      WidgetTester tester,
    ) async {
      final IdentityHarness harness = IdentityHarness();

      await pumpIdentity(
        tester,
        const ResetPasswordScreen(initialToken: 'reset-token-fixture'),
        harness: harness,
      );

      // The value is in the field's controller, ready to submit.
      expect(
        tester.widget<TextField>(find.byType(TextField).first).controller!.text,
        'reset-token-fixture',
      );
      // It is not rendered anywhere as a label, heading or message.
      for (final Text text in tester.widgetList<Text>(find.byType(Text))) {
        expect(text.data ?? '', isNot(contains('reset-token-fixture')));
      }
    });

    testEveryDirectionAndScale('states that every session ended, on success', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      harness.transport.onPost('/auth/reset-password', <String, Object?>{'status': 'reset'});

      await pumpIdentity(
        tester,
        const ResetPasswordScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      await enterIdentityField(tester, 0, 'reset-token-fixture');
      await enterIdentityField(tester, 1, 'brand-new-password');
      await enterIdentityField(tester, 2, 'brand-new-password');
      await tapIdentityButton(tester, l10n.resetPasswordAction);
      await tester.pumpAndSettle();

      expect(find.text(l10n.resetPasswordSuccessMessage), findsOneWidget);
    });

    testWidgets('every interactive control carries a name', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpIdentity(tester, const ResetPasswordScreen(), harness: harness);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });
  });
}
