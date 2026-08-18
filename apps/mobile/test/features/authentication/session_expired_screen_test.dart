// The SESSION_EXPIRED gate — the security-guidance state.
//
// Every reason routes to the same action and the same safe destination. What
// differs is the guidance, and refresh-token REUSE is the case that has to say
// more than "something went wrong": the platform treats a token presented
// twice as theft.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/features/authentication/presentation/screens/session_expired_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import 'support/identity_harness.dart';

void main() {
  testEveryDirectionAndScale('names theft plainly when a token was reused',
      (WidgetTester tester, Locale locale, double textScale) async {
    final IdentityHarness harness = IdentityHarness();
    final AppLocalizations l10n = lookupAppLocalizations(locale);

    await pumpIdentity(
      tester,
      const SessionExpiredScreen(
        state: SessionExpired(SessionEndReason.refreshTokenReuseDetected),
      ),
      harness: harness,
      locale: locale,
      textScale: textScale,
    );

    expect(find.text(l10n.sessionEndedReuseDetected), findsOneWidget);
    expect(find.text(l10n.sessionEndedTitle), findsWidgets);
    expect(
      Directionality.of(tester.element(find.byType(SessionExpiredScreen))),
      locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('each reason has its own guidance and the same one action',
      (WidgetTester tester) async {
    final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);
    final Map<SessionEndReason, String> expected = <SessionEndReason, String>{
      SessionEndReason.expired: l10n.sessionEndedExpired,
      SessionEndReason.revoked: l10n.sessionEndedRevoked,
      SessionEndReason.refreshRejected: l10n.sessionEndedRefreshRejected,
      SessionEndReason.refreshTokenReuseDetected: l10n.sessionEndedReuseDetected,
      SessionEndReason.signedOut: l10n.sessionEndedSignedOut,
    };

    for (final MapEntry<SessionEndReason, String> entry in expected.entries) {
      final IdentityHarness harness = IdentityHarness();
      await pumpIdentity(
        tester,
        SessionExpiredScreen(state: SessionExpired(entry.key)),
        harness: harness,
      );

      expect(find.text(entry.value), findsOneWidget, reason: entry.key.name);
      // Every reason ends at the same safe destination.
      expect(identityButton(l10n.sessionEndedAction), findsOneWidget);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
  });

  testWidgets('the credential has already been cleared before this screen renders',
      (WidgetTester tester) async {
    final IdentityHarness harness = IdentityHarness();
    await harness.signInFixture();
    // Ending the session is what produces this state, and it wipes as it goes.
    await harness.container.read(sessionManagerProvider).end(
          SessionEndReason.refreshTokenReuseDetected,
        );

    await pumpIdentity(
      tester,
      const SessionExpiredScreen(
        state: SessionExpired(SessionEndReason.refreshTokenReuseDetected),
      ),
      harness: harness,
    );

    expect(harness.secureEntries, isEmpty);
    for (final Text text in tester.widgetList<Text>(find.byType(Text))) {
      expect(text.data ?? '', isNot(contains('access-token-fixture')));
      expect(text.data ?? '', isNot(contains('refresh-token-fixture')));
    }
  });

  testWidgets('every interactive control carries a name', (WidgetTester tester) async {
    final IdentityHarness harness = IdentityHarness();
    final SemanticsHandle handle = tester.ensureSemantics();

    await pumpIdentity(
      tester,
      const SessionExpiredScreen(state: SessionExpired(SessionEndReason.expired)),
      harness: harness,
    );

    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });
}
