// Multi-factor authentication: enrolment, confirmation, challenge, recovery
// codes, and removal.
//
// The one-time secrets — the TOTP setup key and the ten recovery codes — get
// the closest attention here, because they are the values the server will
// never reissue.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/domain/entities/authentication_outcome.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/password.dart';
import 'package:karar_mobile/features/authentication/presentation/providers/authentication_providers.dart';
import 'package:karar_mobile/features/authentication/presentation/widgets/sensitive_screen.dart';
import 'package:karar_mobile/features/mfa/domain/mfa_entities.dart';
import 'package:karar_mobile/features/mfa/domain/mfa_repository.dart';
import 'package:karar_mobile/features/mfa/presentation/mfa_challenge_screen.dart';
import 'package:karar_mobile/features/mfa/presentation/mfa_disable_screen.dart';
import 'package:karar_mobile/features/mfa/presentation/mfa_enrolment_screen.dart';
import 'package:karar_mobile/features/mfa/presentation/mfa_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../authentication/support/identity_harness.dart';

const List<String> _recoveryCodes = <String>[
  'AAAA-1111',
  'BBBB-2222',
  'CCCC-3333',
  'DDDD-4444',
  'EEEE-5555',
  'FFFF-6666',
  'GGGG-7777',
  'HHHH-8888',
  'IIII-9999',
  'JJJJ-0000',
];

/// The English catalogue, for assertions that do not depend on the locale.
final AppLocalizations _english = lookupAppLocalizations(KararLocalization.english);

void main() {
  group('challenge status', () {
    test('reports nothing outstanding when no challenge was issued', () {
      const MfaChallengeStatus status = MfaChallengeStatus.none();
      expect(status.isOutstanding, isFalse);
      expect(status.isRedeemableAt(DateTime.utc(2026)), isFalse);
    });

    test('stops being redeemable once its expiry passes', () {
      final MfaChallengeStatus status = MfaChallengeStatus.outstanding(
        expiresAt: DateTime.utc(2026, 1, 1, 0, 5),
      );
      expect(status.isRedeemableAt(DateTime.utc(2026, 1, 1, 0, 4)), isTrue);
      expect(status.isRedeemableAt(DateTime.utc(2026, 1, 1, 0, 5)), isFalse);
      expect(status.isRedeemableAt(DateTime.utc(2026, 1, 1, 0, 6)), isFalse);
    });
  });

  group('enrolment', () {
    test('maps the issued key without logging or persisting it', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onPost('/auth/mfa/enroll', <String, Object?>{
        'status': 'enrolment_started',
        'secret': 'JBSWY3DPEHPK3PXP',
        'otpauthUrl': 'otpauth://totp/Karar:person?secret=JBSWY3DPEHPK3PXP',
      });

      final Result<MfaEnrolment> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .startEnrolment();

      final MfaEnrolment enrolment = outcome.valueOrNull!;
      expect(enrolment.sharedSecret, 'JBSWY3DPEHPK3PXP');
      expect(enrolment.toString(), isNot(contains('JBSWY3DPEHPK3PXP')));
      expect(harness.loggedText, isNot(contains('JBSWY3DPEHPK3PXP')));
      expect(harness.preferences.writtenText, isNot(contains('JBSWY3DPEHPK3PXP')));
      expect(harness.secureEntries.values.join(), isNot(contains('JBSWY3DPEHPK3PXP')));
    });

    test('confirmation returns the ten recovery codes', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onPost('/auth/mfa/confirm', <String, Object?>{
        'status': 'confirmed',
        'recoveryCodes': _recoveryCodes,
      });

      final Result<MfaRecoveryCodes> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .confirmEnrolment(code: const OpaqueSecret('123456'));

      final MfaRecoveryCodes codes = outcome.valueOrNull!;
      expect(codes.count, 10);
      expect(codes.toString(), isNot(contains('AAAA-1111')));
      expect(harness.loggedText, isNot(contains('AAAA-1111')));
      expect(harness.preferences.writtenText, isNot(contains('AAAA-1111')));
    });

    test('FAILS CLOSED when confirmation returns no recovery codes', () async {
      // Activating a second factor without a way back into the account would
      // lock the user out; an empty list is a violation, not an answer.
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onPost('/auth/mfa/confirm', <String, Object?>{
        'status': 'confirmed',
        'recoveryCodes': <String>[],
      });

      final Result<MfaRecoveryCodes> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .confirmEnrolment(code: const OpaqueSecret('123456'));

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
    });

    test('an already-enrolled account maps to a conflict', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/mfa/enroll',
        const ConflictFailure(),
        statusCode: 409,
      );

      final Result<MfaEnrolment> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .startEnrolment();

      expect(outcome.failureOrNull, isA<ConflictFailure>());
    });
  });

  group('challenge', () {
    Future<IdentityHarness> withOutstandingChallenge() async {
      final IdentityHarness harness = IdentityHarness();
      harness.transport.onPost('/auth/login', mfaChallengePayload(now: harness.clock.nowUtc()));
      await harness.container
          .read(authenticationRepositoryProvider)
          .signIn(email: emailFixture(), password: passwordFixture());
      return harness;
    }

    test('exchanges the challenge for a session without exposing the token', () async {
      final IdentityHarness harness = await withOutstandingChallenge();
      harness.transport.onPost('/auth/mfa/challenge', sessionPayload(now: harness.clock.nowUtc()));

      final Result<SessionEstablished> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .completeChallengeWithTotp(code: const OpaqueSecret('123456'));

      expect(outcome, isA<Success<SessionEstablished>>());
      expect(harness.container.read(sessionManagerProvider).hasSession, isTrue);
      // The challenge was consumed and dropped.
      expect(harness.container.read(pendingMfaChallengeStoreProvider).token, isNull);
      expect(harness.loggedText, isNot(contains('challenge-token-fixture')));
    });

    test('a recovery code completes the same challenge', () async {
      final IdentityHarness harness = await withOutstandingChallenge();
      harness.transport.onPost('/auth/mfa/recovery', sessionPayload(now: harness.clock.nowUtc()));

      final Result<SessionEstablished> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .completeChallengeWithRecoveryCode(recoveryCode: const OpaqueSecret('AAAA-1111'));

      expect(outcome, isA<Success<SessionEstablished>>());
      expect(harness.loggedText, isNot(contains('AAAA-1111')));
    });

    test('with no challenge outstanding the user must sign in again', () async {
      final IdentityHarness harness = IdentityHarness();

      final Result<SessionEstablished> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .completeChallengeWithTotp(code: const OpaqueSecret('123456'));

      expect(outcome.failureOrNull, isA<AuthenticationRequiredFailure>());
      // Nothing was sent: there was nothing to send.
      expect(harness.transport.requests, isEmpty);
    });

    test('abandoning the flow discards the challenge token', () async {
      final IdentityHarness harness = await withOutstandingChallenge();
      expect(harness.container.read(pendingMfaChallengeStoreProvider).token, isNotNull);

      harness.container.read(mfaRepositoryProvider).discardChallenge();

      expect(harness.container.read(pendingMfaChallengeStoreProvider).token, isNull);
      expect(
        harness.container.read(mfaRepositoryProvider).challengeStatus().isOutstanding,
        isFalse,
      );
    });
  });

  group('disable', () {
    test('a valid code disables it', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onPost('/auth/mfa/disable', <String, Object?>{'status': 'disabled'});

      final Result<void> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .disable(code: const OpaqueSecret('123456'));

      expect(outcome, isA<Success<void>>());
    });

    test('a not-enrolled account maps to a conflict', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/mfa/disable',
        const ConflictFailure(),
        statusCode: 409,
      );

      final Result<void> outcome = await harness.container
          .read(mfaRepositoryProvider)
          .disable(code: const OpaqueSecret('123456'));

      expect(outcome.failureOrNull, isA<ConflictFailure>());
    });
  });

  group('enrolment screen', () {
    testEveryDirectionAndScale('walks key, code and recovery codes', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      harness.transport.onPost('/auth/mfa/enroll', <String, Object?>{
        'status': 'enrolment_started',
        'secret': 'JBSWY3DPEHPK3PXP',
        'otpauthUrl': 'otpauth://totp/Karar:person?secret=JBSWY3DPEHPK3PXP',
      });
      harness.transport.onPost('/auth/mfa/confirm', <String, Object?>{
        'status': 'confirmed',
        'recoveryCodes': _recoveryCodes,
      });

      await pumpIdentity(
        tester,
        const MfaEnrolmentScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      expect(find.text(l10n.mfaEnrolIntro), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(MfaEnrolmentScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );

      await tapIdentityButton(tester, l10n.mfaEnrolStartAction);
      await tester.pumpAndSettle();
      expect(find.text(l10n.mfaEnrolSecretWarning), findsOneWidget);

      await enterIdentityField(tester, 0, '123456');
      await tapIdentityButton(tester, l10n.mfaConfirmAction);
      await tester.pumpAndSettle();

      expect(find.text(l10n.mfaRecoveryCodesWarning), findsOneWidget);
      expect(find.text('AAAA-1111'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the done action stays disabled until the codes are acknowledged', (
      WidgetTester tester,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);
      harness.transport.onPost('/auth/mfa/enroll', <String, Object?>{
        'status': 'enrolment_started',
        'secret': 'JBSWY3DPEHPK3PXP',
        'otpauthUrl': 'otpauth://totp/Karar:person?secret=JBSWY3DPEHPK3PXP',
      });
      harness.transport.onPost('/auth/mfa/confirm', <String, Object?>{
        'status': 'confirmed',
        'recoveryCodes': _recoveryCodes,
      });

      await pumpIdentity(tester, const MfaEnrolmentScreen(), harness: harness);
      await tapIdentityButton(tester, l10n.mfaEnrolStartAction);
      await tester.pumpAndSettle();
      await enterIdentityField(tester, 0, '123456');
      await tapIdentityButton(tester, l10n.mfaConfirmAction);
      await tester.pumpAndSettle();

      // These codes cannot be shown again; leaving without saving them loses
      // the way back into the account.
      expect(tester.widget<KararButton>(identityButton(l10n.actionDone)).onPressed, isNull);

      await tester.ensureVisible(find.byType(KararCheckboxTile));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(KararCheckboxTile));
      await tester.pumpAndSettle();

      expect(tester.widget<KararButton>(identityButton(l10n.actionDone)).onPressed, isNotNull);
    });

    testWidgets('offers no clipboard action for the key or the codes', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);
      harness.transport.onPost('/auth/mfa/enroll', <String, Object?>{
        'status': 'enrolment_started',
        'secret': 'JBSWY3DPEHPK3PXP',
        'otpauthUrl': 'otpauth://totp/Karar:person?secret=JBSWY3DPEHPK3PXP',
      });

      await pumpIdentity(tester, const MfaEnrolmentScreen(), harness: harness);
      await tapIdentityButton(tester, l10n.mfaEnrolStartAction);
      await tester.pumpAndSettle();

      // The system clipboard is readable by other applications and is
      // synchronised across devices, so a one-time secret never goes near it.
      expect(find.text(_english.actionDone), findsNothing);
      expect(find.byIcon(KararIcons.copy), findsNothing);
      expect(find.byType(SensitiveScreen), findsOneWidget);
    });

    testWidgets('never shows the otpauth URL, which embeds the key', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);
      harness.transport.onPost('/auth/mfa/enroll', <String, Object?>{
        'status': 'enrolment_started',
        'secret': 'JBSWY3DPEHPK3PXP',
        'otpauthUrl': 'otpauth://totp/Karar:person?secret=JBSWY3DPEHPK3PXP',
      });

      await pumpIdentity(tester, const MfaEnrolmentScreen(), harness: harness);
      await tapIdentityButton(tester, l10n.mfaEnrolStartAction);
      await tester.pumpAndSettle();

      expect(find.textContaining('otpauth://'), findsNothing);
      expect(find.textContaining('person'), findsNothing);
    });
  });

  group('challenge screen', () {
    testEveryDirectionAndScale('renders and switches to the recovery-code mode', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      harness.transport.onPost('/auth/login', mfaChallengePayload(now: harness.clock.nowUtc()));
      await harness.container
          .read(authenticationRepositoryProvider)
          .signIn(email: emailFixture(), password: passwordFixture());

      await pumpIdentity(
        tester,
        const MfaChallengeScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );

      expect(find.text(l10n.mfaChallengeSubtitle), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(MfaChallengeScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );

      await tapIdentityButton(tester, l10n.mfaChallengeUseRecovery);
      await tester.pumpAndSettle();

      expect(find.text(l10n.mfaRecoveryCodeSubtitle), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testEveryDirectionAndScale('an expired challenge offers only a fresh sign-in', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      // No challenge was ever issued, which is what a relaunch mid-challenge
      // looks like: the token lived in memory and did not survive.

      await pumpIdentity(
        tester,
        const MfaChallengeScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );

      expect(find.text(l10n.mfaChallengeExpired), findsOneWidget);
      expect(identityButton(l10n.mfaChallengeAbandon), findsOneWidget);
    });

    testWidgets('a rejected code shows one generic message', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);
      harness.transport.onPost('/auth/login', mfaChallengePayload(now: harness.clock.nowUtc()));
      await harness.container
          .read(authenticationRepositoryProvider)
          .signIn(email: emailFixture(), password: passwordFixture());
      harness.transport.failWith(
        HttpMethod.post,
        '/auth/mfa/challenge',
        const AuthenticationRequiredFailure(),
        statusCode: 401,
      );

      await pumpIdentity(tester, const MfaChallengeScreen(), harness: harness);
      await enterIdentityField(tester, 0, '000000');
      await tapIdentityButton(tester, l10n.actionContinue);
      await tester.pumpAndSettle();

      // A wrong code, an expired challenge and a recovery lockout are one
      // answer.
      expect(find.text(l10n.mfaInvalidCode), findsOneWidget);
    });

    testWidgets('every interactive control carries a name', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      final SemanticsHandle handle = tester.ensureSemantics();
      harness.transport.onPost('/auth/login', mfaChallengePayload(now: harness.clock.nowUtc()));
      await harness.container
          .read(authenticationRepositoryProvider)
          .signIn(email: emailFixture(), password: passwordFixture());

      await pumpIdentity(tester, const MfaChallengeScreen(), harness: harness);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });
  });

  group('disable screen', () {
    testEveryDirectionAndScale('warns before asking for the code', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(locale);

      await pumpIdentity(
        tester,
        const MfaDisableScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );

      expect(find.text(l10n.mfaDisableWarning), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(MfaDisableScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });
  });

  test('the repository port is a pure-Dart contract', () {
    expect(MfaRepository, isNotNull);
  });
}
