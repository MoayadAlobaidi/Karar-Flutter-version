// The subject's own profile: mapping, editing, and the disable request that
// records an intention and nothing more.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/profile/data/api_profile_repository.dart';
import 'package:karar_mobile/features/profile/domain/user_profile.dart';
import 'package:karar_mobile/features/profile/presentation/profile_providers.dart';
import 'package:karar_mobile/features/profile/presentation/profile_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../../core/support/fakes.dart';
import '../platform_bootstrap/support/feature_harness.dart';
import '../platform_bootstrap/support/fixtures.dart';

Map<String, Object?> profileBody({String status = 'ACTIVE'}) => <String, Object?>{
  'createdAt': '2026-01-01T00:00:00.000Z',
  'displayName': 'Example Person',
  'locale': 'en',
  'residencyJurisdictionRef': 'jurisdiction-a',
  'status': status,
  'tenantId': testTenantId,
  'updatedAt': '2026-02-01T00:00:00.000Z',
  'userId': testUserId,
};

ApiProfileRepository repositoryReturning(Object? body) => ApiProfileRepository(
  KararApiClient(
    FakeApiTransport((ApiRequest request) async => ApiResponse(statusCode: 200, body: body)),
  ),
);

/// A profile repository whose answers the test scripts.
final class ScriptedProfileRepository implements ProfileRepository {
  ScriptedProfileRepository({this.readResult, this.updateResult, this.disableResult});

  Result<UserProfile>? readResult;
  Result<UserProfile>? updateResult;
  Result<AccountDisableRequest>? disableResult;

  final List<ProfileChangeSet> updates = <ProfileChangeSet>[];
  int disableRequests = 0;

  @override
  Future<Result<UserProfile>> readOwn() async => readResult ?? Success<UserProfile>(userProfile());

  @override
  Future<Result<UserProfile>> updateOwn(ProfileChangeSet changes) async {
    updates.add(changes);
    return updateResult ?? Success<UserProfile>(userProfile());
  }

  @override
  Future<Result<AccountDisableRequest>> requestDisable({String? reason}) async {
    disableRequests++;
    return disableResult ??
        Success<AccountDisableRequest>(
          AccountDisableRequest(requestedAt: DateTime.utc(2026, 4), auditRecorded: true),
        );
  }
}

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(ProfileScreen)));

Future<void> pumpProfile(
  WidgetTester tester, {
  required ProfileRepository repository,
  Locale locale = const Locale('en'),
  double textScale = 1.0,
}) => pumpFeatureScreen(
  tester,
  const ProfileScreen(),
  locale: locale,
  textScale: textScale,
  overrides: <Override>[profileRepositoryProvider.overrideWithValue(repository)],
);

void main() {
  group('the repository', () {
    test('maps every account status the contract defines', () async {
      Future<AccountStatus> statusFor(String wire) async =>
          (await repositoryReturning(profileBody(status: wire)).readOwn()).valueOrNull!.status;

      expect(await statusFor('ACTIVE'), AccountStatus.active);
      expect(await statusFor('DISABLE_REQUESTED'), AccountStatus.disableRequested);
      expect(await statusFor('DELETION_REQUESTED'), AccountStatus.deletionRequested);
      expect(await statusFor('DISABLED'), AccountStatus.disabled);
      expect(await statusFor('SOMETHING_NEWER'), AccountStatus.unrecognised);
    });

    test('an empty change set is declined locally rather than sent', () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(statusCode: 200, body: profileBody()),
      );

      final result = await ApiProfileRepository(KararApiClient(transport))
          .updateOwn(const ProfileChangeSet());

      expect(result.failureOrNull, isA<InvalidRequestFailure>());
      expect(transport.requests, isEmpty);
    });

    test('sends only the approved editable fields', () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(statusCode: 200, body: profileBody()),
      );

      await ApiProfileRepository(KararApiClient(transport))
          .updateOwn(const ProfileChangeSet(displayName: 'New Name'));

      final request = transport.requests.single;
      expect(request.path, '/users/me');
      expect(request.method.wireName, 'PATCH');
      // ONLY the field that changed. This used to expect `locale` here too,
      // because the generated encoder wrote every optional key including the
      // ones the caller never set; a change set naming one field asked the
      // platform to consider both. An optional field left out of a PATCH means
      // "leave this alone", so it is now left out.
      expect((request.body! as Map<String, Object?>).keys.toSet(), <String>{'displayName'});
    });

    test('a disable request is recorded only when the platform says so', () async {
      final recorded = await repositoryReturning(<String, Object?>{
        'auditRecorded': true,
        'requestedAt': '2026-04-01T00:00:00.000Z',
        'status': 'DISABLE_REQUESTED',
      }).requestDisable();

      expect(recorded.valueOrNull?.auditRecorded, isTrue);

      final unclassified = await repositoryReturning(<String, Object?>{
        'auditRecorded': true,
        'requestedAt': '2026-04-01T00:00:00.000Z',
        'status': 'SOMETHING_NEWER',
      }).requestDisable();

      expect(unclassified.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a malformed profile becomes a typed contract violation', () async {
      final body = profileBody()..remove('userId');

      expect(
        (await repositoryReturning(body).readOwn()).failureOrNull,
        isA<ContractViolationFailure>(),
      );
    });

    test('no reason is sent with a disable request', () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'auditRecorded': true,
            'requestedAt': '2026-04-01T00:00:00.000Z',
            'status': 'DISABLE_REQUESTED',
          },
        ),
      );

      await ApiProfileRepository(KararApiClient(transport)).requestDisable();

      final body = transport.requests.single.body! as Map<String, Object?>;
      expect(body['reason'], isNull);
    });
  });

  group('the screen', () {
    testInBothDirections('renders the profile and its direction', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpProfile(
        tester,
        repository: ScriptedProfileRepository(),
        locale: locale,
        textScale: scale,
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.profileStatusActive), findsOneWidget);
      expect(find.text(testTenantId), findsOneWidget);
      expect(find.text(testUserId), findsOneWidget);
      expect(
        directionUnder(tester, find.byType(ProfileScreen)),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
    }, textScales: featureTextScales);

    testInBothDirections('shows a saved state only after the platform returns the stored profile', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final repository = ScriptedProfileRepository();

      await pumpProfile(tester, repository: repository, locale: locale, textScale: scale);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.profileSaveConfirmation), findsNothing);

      await tester.enterText(find.byType(TextField), 'Changed Name');
      await tester.tap(find.byType(KararButton).first);
      await tester.pumpAndSettle();

      expect(repository.updates.single.displayName, 'Changed Name');
      expect(find.text(l10n.profileSaveConfirmation), findsOneWidget);
    });

    testInBothDirections('a refused edit says nothing changed', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpProfile(
        tester,
        repository: ScriptedProfileRepository(
          updateResult: const Failed<UserProfile>(
            InvalidRequestFailure(code: 'INVALID_PROFILE_FIELD'),
          ),
        ),
        locale: locale,
        textScale: scale,
      );
      final l10n = mountedL10n(tester);

      await tester.enterText(find.byType(TextField), 'Changed Name');
      await tester.tap(find.byType(KararButton).first);
      await tester.pumpAndSettle();

      expect(find.text(l10n.profileSaveFailedTitle), findsOneWidget);
      expect(find.text(l10n.profileSaveConfirmation), findsNothing);
    });

    testInBothDirections(
      'a disable-requested account says the request was recorded and nothing more',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpProfile(
          tester,
          repository: ScriptedProfileRepository(
            readResult: Success<UserProfile>(userProfile(status: AccountStatus.disableRequested)),
          ),
          locale: locale,
          textScale: scale,
        );
        final l10n = mountedL10n(tester);

        expect(find.text(l10n.profileStatusDisableRequested), findsOneWidget);
        expect(find.text(l10n.profileStatusDisableRequestedNote), findsOneWidget);
      },
    );

    testInBothDirections('an unreadable profile offers a retry rather than a blank form', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpProfile(
        tester,
        repository: ScriptedProfileRepository(
          readResult: const Failed<UserProfile>(
            DependencyUnavailableFailure(code: 'DEPENDENCY_UNAVAILABLE'),
          ),
        ),
        locale: locale,
        textScale: scale,
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.profileUnavailableTitle), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    }, textScales: featureTextScales);

    testInBothDirections('renders no monetary value', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpProfile(
        tester,
        repository: ScriptedProfileRepository(),
        locale: locale,
        textScale: scale,
      );

      expectNothingMatching(
        tester,
        RegExp(r'[€£¥]|\b(QAR|USD|EUR|SAR|AED)\b'),
        because: 'no financial value belongs on the profile surface',
      );
    }, textScales: featureTextScales);

    testWidgets('announces progress while the profile loads', (WidgetTester tester) async {
      await pumpFeatureScreen(
        tester,
        const ProfileScreen(),
        settle: false,
        overrides: <Override>[
          profileRepositoryProvider.overrideWithValue(_PendingProfileRepository()),
        ],
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}

/// A repository that never answers, so the loading state stays on screen.
final class _PendingProfileRepository implements ProfileRepository {
  final Completer<Never> _never = Completer<Never>();

  @override
  Future<Result<UserProfile>> readOwn() => _never.future;

  @override
  Future<Result<UserProfile>> updateOwn(ProfileChangeSet changes) => _never.future;

  @override
  Future<Result<AccountDisableRequest>> requestDisable({String? reason}) => _never.future;
}
