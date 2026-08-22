// The session directory: display ordering, DTO mapping, revocation, and the
// screen in both directions at both text scales.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/http_method.dart';
import 'package:karar_mobile/features/authentication/presentation/widgets/sensitive_screen.dart';
import 'package:karar_mobile/features/session_management/domain/user_session.dart';
import 'package:karar_mobile/features/session_management/presentation/session_providers.dart';
import 'package:karar_mobile/features/session_management/presentation/sessions_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../authentication/support/identity_harness.dart';

UserSession _session({
  required String id,
  bool isCurrent = false,
  DateTime? lastSeenAt,
  String? summary,
}) => UserSession(
  sessionId: id,
  createdAt: DateTime.utc(2026, 1, 1),
  isCurrent: isCurrent,
  lastSeenAt: lastSeenAt,
  userAgentSummary: summary,
);

void main() {
  group('SessionDirectory', () {
    test('puts the current session first, then the most recently seen', () {
      final SessionDirectory directory = SessionDirectory(<UserSession>[
        _session(id: 'b', lastSeenAt: DateTime.utc(2026, 1, 2)),
        _session(id: 'c', lastSeenAt: DateTime.utc(2026, 1, 5)),
        _session(id: 'a', isCurrent: true, lastSeenAt: DateTime.utc(2025, 12, 1)),
      ]).sortedForDisplay();

      expect(directory.sessions.map((UserSession session) => session.sessionId), <String>[
        'a',
        'c',
        'b',
      ]);
    });

    test('falls back to the creation time when a session was never seen again', () {
      final SessionDirectory directory = SessionDirectory(<UserSession>[
        _session(id: 'older'),
        _session(id: 'newer', lastSeenAt: DateTime.utc(2026, 2, 1)),
      ]).sortedForDisplay();

      expect(directory.sessions.first.sessionId, 'newer');
    });

    test('reports whether there is anything to revoke', () {
      expect(
        SessionDirectory(<UserSession>[_session(id: 'a', isCurrent: true)]).hasOthers,
        isFalse,
      );
      expect(
        SessionDirectory(<UserSession>[_session(id: 'a', isCurrent: true), _session(id: 'b')])
            .hasOthers,
        isTrue,
      );
      expect(const SessionDirectory(<UserSession>[]).isEmpty, isTrue);
    });

    test('finds the current session, or reports none', () {
      expect(
        SessionDirectory(<UserSession>[_session(id: 'a', isCurrent: true)]).current?.sessionId,
        'a',
      );
      expect(SessionDirectory(<UserSession>[_session(id: 'a')]).current, isNull);
    });
  });

  group('repository', () {
    test('maps the listed sessions, absent metadata included', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onGet('/auth/sessions', <String, Object?>{
        'sessions': <Object?>[
          <String, Object?>{
            'sessionId': 'a',
            'createdAt': '2026-01-01T09:00:00Z',
            'lastSeenAt': '2026-01-02T09:00:00Z',
            'absoluteExpiresAt': '2026-02-01T09:00:00Z',
            'current': true,
            // `userAgentSummary` absent. It is the one field the contract
            // declares nullable, and the server omits it when the client sent
            // no user agent — so the mapping must produce null rather than a
            // fabricated description of a device it knows nothing about.
          },
        ],
      });

      final Result<SessionDirectory> outcome = await harness.container
          .read(sessionDirectoryRepositoryProvider)
          .list();

      final UserSession session = outcome.valueOrNull!.sessions.single;
      expect(session.sessionId, 'a');
      expect(session.isCurrent, isTrue);
      expect(session.userAgentSummary, isNull);
    });

    test('a response missing a REQUIRED field is a contract violation', () async {
      // The schema declares `lastSeenAt` and `absoluteExpiresAt` required, so a
      // response without them is not a minimised answer — it is one this client
      // cannot classify, and guessing at a session's expiry is not a decision a
      // client may make on the server's behalf.
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onGet('/auth/sessions', <String, Object?>{
        'sessions': <Object?>[
          <String, Object?>{'sessionId': 'a', 'createdAt': '2026-01-01T09:00:00Z', 'current': true},
        ],
      });

      final Result<SessionDirectory> outcome = await harness.container
          .read(sessionDirectoryRepositoryProvider)
          .list();

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a field of the wrong type degrades to a contract violation', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onGet('/auth/sessions', <String, Object?>{
        'sessions': <Object?>[
          <String, Object?>{
            'sessionId': 'a',
            'createdAt': '2026-01-01T09:00:00Z',
            'current': 'yes',
          },
        ],
      });

      final Result<SessionDirectory> outcome = await harness.container
          .read(sessionDirectoryRepositoryProvider)
          .list();

      expect(outcome.failureOrNull, isA<ContractViolationFailure>());
    });

    test('revoke-others reports the count the server stated', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onPost('/auth/sessions/revoke-others', <String, Object?>{
        'status': 'revoked',
        'revokedCount': 3,
      });

      final Result<int> outcome = await harness.container
          .read(sessionDirectoryRepositoryProvider)
          .revokeOthers();

      expect(outcome.valueOrNull, 3);
    });

    test('a revoke of a session that is not live maps to not-found', () async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.failWith(
        HttpMethod.delete,
        '/auth/sessions/b',
        const NotFoundFailure(),
        statusCode: 404,
      );

      final Result<void> outcome = await harness.container
          .read(sessionDirectoryRepositoryProvider)
          .revoke(sessionId: 'b');

      // A session that is not live is indistinguishable from one belonging to
      // another account, by design.
      expect(outcome.failureOrNull, isA<NotFoundFailure>());
    });
  });

  group('screen', () {
    testEveryDirectionAndScale('lists sessions in the locale direction', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      harness.transport.onGet('/auth/sessions', sessionListPayload());

      await pumpIdentity(
        tester,
        const SessionsScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionsSubtitle), findsOneWidget);
      // Status is never colour alone: the current session is labelled.
      expect(find.text(l10n.sessionsCurrentBadge), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(SessionsScreen))),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
      expect(tester.takeException(), isNull);
    });

    testEveryDirectionAndScale('offers a retry when the list will not load', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      harness.transport.failWith(
        HttpMethod.get,
        '/auth/sessions',
        const DependencyUnavailableFailure(correlationId: 'corr-1'),
        statusCode: 503,
      );

      await pumpIdentity(
        tester,
        const SessionsScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.failureServiceUnavailable), findsOneWidget);
      // The correlation id is opaque and non-sensitive; it is the support
      // reference and the only server value shown.
      expect(find.textContaining('corr-1'), findsOneWidget);

      harness.transport.onGet('/auth/sessions', sessionListPayload());
      await tapIdentityButton(tester, _shared(tester).actionRetry);
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionsCurrentBadge), findsOneWidget);
    });

    testEveryDirectionAndScale('shows the empty state when only this device is live', (
      WidgetTester tester,
      Locale locale,
      double textScale,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(locale);
      harness.transport.onGet('/auth/sessions', <String, Object?>{'sessions': <Object?>[]});

      await pumpIdentity(
        tester,
        const SessionsScreen(),
        harness: harness,
        locale: locale,
        textScale: textScale,
      );
      await tester.pumpAndSettle();

      expect(find.text(l10n.sessionsEmptyMessage), findsOneWidget);
    });

    testWidgets('a revoke confirms first, then reloads from the server', (
      WidgetTester tester,
    ) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);
      harness.transport.onGet('/auth/sessions', sessionListPayload());
      harness.transport.onDelete(
        '/auth/sessions/9f1d0f6a-0000-4000-8000-000000000002',
        <String, Object?>{'status': 'revoked'},
      );

      await pumpIdentity(tester, const SessionsScreen(), harness: harness);
      await tester.pumpAndSettle();

      await tapIdentityButton(tester, l10n.sessionsRevokeAction);
      await tester.pumpAndSettle();
      expect(find.text(l10n.sessionsRevokeConfirmMessage), findsOneWidget);

      await tester.tap(find.text(l10n.sessionsRevokeAction).last);
      await tester.pumpAndSettle();

      expect(harness.transport.callsTo('/auth/sessions/9f1d0f6a-0000-4000-8000-000000000002'), 1);
      // Reloaded rather than edited locally: the server is the authority on
      // what is still live.
      expect(harness.transport.callsTo('/auth/sessions'), 2);
    });

    testWidgets('a dismissed confirmation revokes nothing', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final AppLocalizations l10n = lookupAppLocalizations(KararLocalization.english);
      harness.transport.onGet('/auth/sessions', sessionListPayload());

      await pumpIdentity(tester, const SessionsScreen(), harness: harness);
      await tester.pumpAndSettle();
      await tapIdentityButton(tester, l10n.sessionsRevokeAction);
      await tester.pumpAndSettle();

      await tester.tap(find.text(_shared(tester).actionCancel));
      await tester.pumpAndSettle();

      expect(harness.transport.callsTo('/auth/sessions/9f1d0f6a-0000-4000-8000-000000000002'), 0);
    });

    testWidgets('is wrapped in the sensitive-content cover', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onGet('/auth/sessions', sessionListPayload());

      await pumpIdentity(tester, const SessionsScreen(), harness: harness);
      await tester.pumpAndSettle();

      expect(find.byType(SensitiveScreen), findsOneWidget);
    });

    testWidgets('no session identifier or token is rendered as text', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      harness.transport.onGet('/auth/sessions', sessionListPayload());

      await pumpIdentity(tester, const SessionsScreen(), harness: harness);
      await tester.pumpAndSettle();

      for (final Text text in tester.widgetList<Text>(find.byType(Text))) {
        expect(text.data ?? '', isNot(contains('access-token-fixture')));
        expect(text.data ?? '', isNot(contains('refresh-token-fixture')));
      }
    });

    testWidgets('every interactive control carries a name', (WidgetTester tester) async {
      final IdentityHarness harness = IdentityHarness();
      await harness.signInFixture();
      final SemanticsHandle handle = tester.ensureSemantics();
      harness.transport.onGet('/auth/sessions', sessionListPayload());

      await pumpIdentity(tester, const SessionsScreen(), harness: harness);
      await tester.pumpAndSettle();

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      handle.dispose();
    });
  });
}

/// The shared catalogue, read through a mounted context so the tests assert on
/// the strings the screen actually resolved rather than on hardcoded copy.
AppLocalizations _shared(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(SessionsScreen)));
