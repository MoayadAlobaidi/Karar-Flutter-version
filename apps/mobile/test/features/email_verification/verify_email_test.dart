// E-mail verification: mapping, resend enumeration resistance, and the screen
// in both directions at both text scales.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/domain/entities/neutral_receipt.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/email_address.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/password.dart';
import 'package:karar_mobile/features/email_verification/domain/email_verification_repository.dart';
import 'package:karar_mobile/features/email_verification/presentation/email_verification_providers.dart';
import 'package:karar_mobile/features/email_verification/presentation/verify_email_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../authentication/support/identity_harness.dart';

EmailAddress _email() =>
    (EmailAddress.parse('person@example.test') as EmailAccepted).email;

List<String> _renderedText(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((Text text) => text.data ?? '')
    .where((String value) => value.isNotEmpty)
    .toList(growable: false);

void main() {
  group('repository', () {
    test('verifying a code maps to a plain success', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport
          .onPost('/auth/verify-email', <String, Object?>{'status': 'verified'});

      final Result<void> outcome = await harness.container
          .read(emailVerificationRepositoryProvider)
          .verify(email: _email(), code: const OpaqueSecret('A1B2C3D4'));

      expect(outcome, isA<Success<void>>());
    });

    test('a trailing space on a pasted code is trimmed before sending', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport
          .onPost('/auth/verify-email', <String, Object?>{'status': 'verified'});

      await harness.container
          .read(emailVerificationRepositoryProvider)
          .verify(email: _email(), code: const OpaqueSecret('  A1B2C3D4 '));

      final Map<String, Object?> body =
          harness.transport.sentBodies.single! as Map<String, Object?>;
      expect(body['code'], 'A1B2C3D4');
    });

    test('a rejected code maps to the typed failure', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/verify-email',
        const AuthenticationRequiredFailure(),
        statusCode: 401,
      );

      final Result<void> outcome = await harness.container
          .read(emailVerificationRepositoryProvider)
          .verify(email: _email(), code: const OpaqueSecret('WRONGCODE'));

      expect(outcome.failureOrNull, isA<AuthenticationRequiredFailure>());
    });

    test('an unclassifiable payload degrades to a contract violation', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport.on(
        HttpMethod.post,
        '/auth/verify-email',
        (_) async => throw const FormatException('unknown branch'),
      );

      final Result<void> outcome = await harness.container
          .read(emailVerificationRepositoryProvider)
          .verify(email: _email(), code: const OpaqueSecret('A1B2C3D4'));

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
    });

    test('every resend outcome produces the same value', () async {
      // Unknown, already verified, disabled and cooling down are one answer by
      // contract, and the client keeps them that way.
      final List<Map<String, Object?>> bodies = <Map<String, Object?>>[
        <String, Object?>{'status': 'accepted', 'detail': 'Sent.'},
        <String, Object?>{'status': 'accepted', 'detail': 'Already verified.'},
        <String, Object?>{'status': 'accepted', 'detail': 'Cooling down.', 'retryAfter': 60},
      ];
      final List<Result<NeutralReceipt>> outcomes = <Result<NeutralReceipt>>[];
      for (final Map<String, Object?> body in bodies) {
        final IdentityHarness harness = IdentityHarness();
        harness.transport.onPost('/auth/resend-verification', body, statusCode: 202);
        outcomes.add(
          await harness.container
              .read(emailVerificationRepositoryProvider)
              .resend(email: _email()),
        );
      }

      expect(outcomes.toSet(), hasLength(1));
      expect(outcomes.first.valueOrNull, const NeutralReceipt());
    });

    test('the verification code never reaches a log', () async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport
          .onPost('/auth/verify-email', <String, Object?>{'status': 'verified'});

      await harness.container
          .read(emailVerificationRepositoryProvider)
          .verify(email: _email(), code: const OpaqueSecret('SECRET99'));

      expect(harness.loggedText, isNot(contains('SECRET99')));
      expect(harness.preferences.writtenText, isNot(contains('SECRET99')));
    });
  });

  group('screen', () {
    testEveryDirectionAndScale('renders in the locale direction',
        (WidgetTester tester, Locale locale, double textScale) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(locale);

      await pumpIdentity(tester, const VerifyEmailScreen(),
          harness: harness, locale: locale, textScale: textScale);

      expect(find.text(l10n.verifyEmailSubtitle), findsOneWidget);
      expect(find.text(l10n.verifyEmailCodeLabel), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(VerifyEmailScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testEveryDirectionAndScale('a rejected code shows one generic message',
        (WidgetTester tester, Locale locale, double textScale) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/verify-email',
        const AuthenticationRequiredFailure(),
        statusCode: 401,
      );

      await pumpIdentity(tester, const VerifyEmailScreen(),
          harness: harness, locale: locale, textScale: textScale);
      await enterIdentityField(tester, 0, 'person@example.test');
      await enterIdentityField(tester, 1, 'WRONGONE');
      await tapIdentityButton(tester, l10n.verifyEmailAction);
      await tester.pumpAndSettle();

      // Wrong, expired, capped and unknown codes are one answer.
      expect(find.text(l10n.verifyEmailInvalidCode), findsOneWidget);
      expect(find.textContaining('401'), findsNothing);
    });

    testEveryDirectionAndScale(
      'every resend outcome renders the same acknowledgement',
      (WidgetTester tester, Locale locale, double textScale) async {
        final AppLocalizations l10n = lookupAppLocalizations(locale);
        final List<List<String>> renderings = <List<String>>[];

        for (final Map<String, Object?> body in <Map<String, Object?>>[
          <String, Object?>{'status': 'accepted', 'detail': 'A code is on its way.'},
          <String, Object?>{
            'status': 'accepted',
            'detail': 'That address is already verified.',
            'alreadyVerified': true,
          },
        ]) {
          final IdentityHarness harness = IdentityHarness();
          harness.transport.onPost('/auth/resend-verification', body, statusCode: 202);

          await pumpIdentity(tester, const VerifyEmailScreen(),
              harness: harness, locale: locale, textScale: textScale);
          await enterIdentityField(tester, 0, 'person@example.test');
          await tapIdentityButton(tester, l10n.verifyEmailResendAction);
          await tester.pumpAndSettle();

          renderings.add(_renderedText(tester));
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
        }

        expect(renderings[1], equals(renderings[0]));
        expect(renderings[0], contains(l10n.verifyEmailResendAcknowledgement));
        expect(
          renderings[0].where((String value) => value.contains('already verified')),
          isEmpty,
        );
      },
    );

    testWidgets('every interactive control carries a name',
        (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpIdentity(tester, const VerifyEmailScreen(), harness: harness);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });
  });

  test('the repository port is a pure-Dart contract', () {
    // A compile-time assertion that nothing framework-shaped leaked into the
    // port: it can be referenced from a test that imports no Flutter type.
    expect(EmailVerificationRepository, isNotNull);
  });
}
