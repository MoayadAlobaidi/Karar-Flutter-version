// A COLD LOCKED LAUNCH, THROUGH THE REAL ROUTER — AND WHAT HAPPENS WHEN THE
// KEYSTORE WILL NOT ERASE.
//
// `app_lock_recovery_test.dart` beside this file proves the password fallback
// works on a WARM process, and it does that honestly: it calls the harness's
// sign-in fixture, which ADOPTS a credential into `SessionManager` before the
// lock engages. That is a real situation — the application was signed in, went
// to the background for long enough, and re-locked — and the fixture models it
// correctly.
//
// It is not the situation the user is in when they launch a locked app.
//
// Startup's evaluation order is configuration, then application lock, then
// session restore. The lock is checked BEFORE the keystore is read, on purpose:
// a locked device does not have its credential store opened. So on a genuine
// cold launch the tokens are on disk, `SessionManager` holds `NoSession`, and
// startup stops at `AppLocked` having read nothing. `SessionManager.end` —
// which `signOut` calls, and which the fallback used to call — short-circuits
// on `NoSession`. It wiped nothing and emitted nothing. The button rendered,
// enabled, responded to a tap, and left the user on the lock with their
// credential exactly where it was.
//
// Both tests pass with the warm fixture. Only this one fails without the fix,
// because only this one starts from the state the user actually starts from:
// material written straight to the secure store, nothing adopted, nothing
// restored.
//
// The second half of the file covers the case where the erase itself FAILS.
// See `core/security/token_store.dart` for the fail-closed semantics and for
// the plain statement of what they still do not protect against.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/composition/feature_surface.dart';
import 'package:karar_mobile/app/configuration/app_configuration.dart';
import 'package:karar_mobile/app/configuration/app_environment.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_coordinator.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/app/routing/route_paths.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/security/app_lock.dart';
import 'package:karar_mobile/core/security/local_security_state_store.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/utilities/clock.dart';
import 'package:karar_mobile/features/session_management/data/platform_local_authenticator.dart';
import 'package:karar_mobile/features/session_management/domain/app_lock.dart';
import 'package:karar_mobile/features/session_management/presentation/app_lock_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../../core/support/fakes.dart';
import '../../features/authentication/support/identity_harness.dart';

final AppLocalizations _english = lookupAppLocalizations(KararLocalization.english);

final DateTime _now = DateTime.utc(2026, 8, 16, 12);

/// Distinctive values, so an assertion that they never reached a log line or
/// the plain preference store is checking for the real thing.
const String _accessToken = 'cold-launch-access-token-must-not-leak';
const String _refreshToken = 'cold-launch-refresh-token-must-not-leak';

SessionTokens _tokens({String access = _accessToken, String refresh = _refreshToken}) =>
    SessionTokens(
      accessToken: access,
      accessTokenExpiresAt: _now.add(const Duration(minutes: 10)),
      refreshToken: refresh,
      refreshTokenExpiresAt: _now.add(const Duration(days: 30)),
      sessionId: '9f1d0f6a-0000-4000-8000-000000000001',
    );

/// One process, over storage that outlives it.
///
/// The point of the type is that it can be built TWICE over the same
/// [InMemorySecureStore] and the same preferences: the second construction is
/// a relaunch, with a brand-new container, a brand-new `SessionManager` and a
/// brand-new coordinator reading the disk the first one left behind. Nothing
/// in-memory survives, which is exactly the property a cold-launch claim needs.
final class _Launch {
  _Launch({
    required this.secureStore,
    required this.preferences,
    required this.securityState,
  }) {
    container = ProviderContainer(
      overrides: <Override>[
        ...featureSurfaceOverrides(),
        configurationResultProvider.overrideWithValue(
          Success<AppConfiguration>(
            AppConfiguration(
              environment: AppEnvironment.local,
              // Never contacted: both transports are substituted, so
              // `dioProvider` is never read and no socket is opened.
              apiBaseUrl: Uri.parse('http://localhost:8080'),
              appVersion: '1.0.0',
              buildNumber: '1',
              brandId: 'karar',
            ),
          ),
        ),
        keyValueStoreProvider.overrideWithValue(preferences),
        localSecurityStateStoreProvider.overrideWithValue(securityState),
        secureStoreProvider.overrideWithValue(secureStore),
        loggerProvider.overrideWithValue(
          AppLogger(sink: logSink, minimumLevel: LogLevel.trace),
        ),
        clockProvider.overrideWithValue(FixedClock(_now)),
        apiTransportProvider.overrideWithValue(ScriptedIdentityTransport()),
        rawApiTransportProvider.overrideWithValue(ScriptedIdentityTransport()),
        bootstrapGatewayProvider.overrideWithValue(
          FakeBootstrapGateway(<Result<BootstrapSnapshot>>[
            Success<BootstrapSnapshot>(readySnapshot()),
          ]),
        ),
        localAuthenticatorProvider.overrideWithValue(
          // Enrolled hardware that refuses to open — a biometric lockout. It
          // matters that availability stays `available`: an UNAVAILABLE
          // authenticator makes the lock screen stand the lock down and mark
          // the process unlocked, which would quietly dismantle the very gate
          // these tests are about.
          ScriptedLocalAuthenticator(
            outcomes: const <LocalAuthOutcome>[
              LocalAuthFailed(LocalAuthFailureReason.lockedOut),
            ],
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
  }

  final InMemorySecureStore secureStore;
  final RecordingKeyValueStore preferences;

  /// Durable local security state: the lock choice and the abandonment marker.
  /// It outlives a `_Launch` exactly as the on-device store outlives a process.
  final InMemoryLocalSecurityStateStore securityState;

  final RecordingLogSink logSink = RecordingLogSink();

  late final ProviderContainer container;

  StartupCoordinator get coordinator => container.read(startupCoordinatorProvider);

  SessionManager get sessions => container.read(sessionManagerProvider);

  AppLockGate get lock => container.read(appLockGateProvider);

  GoRouter get router => container.read(routerProvider);

  Map<String, String> get secureEntries => secureStore.entries;

  String get loggedText =>
      logSink.records.map((LogRecord record) => record.toString()).join('\n');

  /// Writes valid, production-encoded session material straight to the secure
  /// store.
  ///
  /// Through the real `TokenStore`, so the key and the encoding are the ones
  /// the application actually reads back — but WITHOUT `adopt`, because adopting
  /// would put the credential in memory and turn this into the warm case the
  /// other file already covers.
  Future<void> persistSessionMaterial() async {
    final written = await container.read(tokenStoreProvider).write(_tokens());
    expect(written, isA<Success<void>>(), reason: 'the fixture must actually persist');
    expect(
      secureStore.entries,
      isNotEmpty,
      reason: 'the credential must be on disk, or the cold case is not set up',
    );
  }

  Future<void> enableLock() =>
      securityState.write(LocalSecurityFlag.appLockEnabled, value: true);

  /// Mounts the real router over this container and runs startup.
  ///
  /// The previous tree, if any, is taken down and settled FIRST. Riverpod
  /// schedules its auto-dispose work on a timer when a consumer unmounts, and
  /// replacing one mounted composition root with another in a single pump
  /// leaves that timer alive past the end of the test — which the framework
  /// reports as a pending timer rather than as anything to do with the
  /// behaviour under test.
  Future<void> boot(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: router,
          locale: KararLocalization.english,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: KararLocalization.supportedLocales,
        ),
      ),
    );
    await coordinator.start();
    await tester.pumpAndSettle();
  }
}

/// The location the router is actually showing.
String _locationOf(GoRouter router) =>
    router.routerDelegate.currentConfiguration.uri.path;

Future<void> _pressPasswordFallback(WidgetTester tester) async {
  await tester.tap(find.text(_english.appLockSignInInstead));
  await tester.pumpAndSettle();
}

void main() {
  group('a COLD locked launch can still reach sign-in', () {
    late InMemorySecureStore secureStore;
    late RecordingKeyValueStore preferences;
    late InMemoryLocalSecurityStateStore securityState;
    late _Launch launch;

    setUp(() {
      secureStore = InMemorySecureStore();
      preferences = RecordingKeyValueStore();
      securityState = InMemoryLocalSecurityStateStore();
    });

    /// Brings the application up as a locked cold launch does: material on
    /// disk, the lock preference on, nothing in memory.
    Future<void> coldLaunch(WidgetTester tester) async {
      launch = _Launch(
        secureStore: secureStore,
        preferences: preferences,
        securityState: securityState,
      );
      await launch.persistSessionMaterial();
      await launch.enableLock();
      await launch.boot(tester);
    }

    testWidgets('the fixture is genuinely cold, and it locks', (
      WidgetTester tester,
    ) async {
      await coldLaunch(tester);

      expect(
        launch.coordinator.state,
        isA<AppLocked>(),
        reason: 'the lock must actually engage, or nothing below proves anything',
      );
      expect(
        launch.sessions.state,
        isA<NoSession>(),
        reason: 'THE WHOLE POINT: nothing has been adopted or restored. A test '
            'that finds an ActiveSession here is modelling a warm process and '
            'will pass against the defect',
      );
      expect(launch.secureEntries, isNotEmpty);
      expect(_locationOf(launch.router), RoutePaths.lock);
    });

    testWidgets('pressing the password fallback erases the stored session', (
      WidgetTester tester,
    ) async {
      await coldLaunch(tester);

      await _pressPasswordFallback(tester);

      // THE ASSERTION THAT FAILS WITHOUT THE FIX. `signOut` reaches
      // `SessionManager.end`, which returns immediately because no session was
      // ever adopted, so the credential stays exactly where it was.
      expect(
        launch.secureEntries,
        isEmpty,
        reason: 'the credential the user gave up is still in secure storage; a '
            'lock that can be walked away from without destroying the session '
            'behind it is not a lock',
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('the startup state leaves AppLocked for Unauthenticated', (
      WidgetTester tester,
    ) async {
      await coldLaunch(tester);

      await _pressPasswordFallback(tester);

      final StartupState state = launch.coordinator.state;
      expect(
        state,
        isA<Unauthenticated>(),
        reason: 'still AppLocked means the press emitted no transition at all, '
            'which is what a no-op `end` on a cold launch produces',
      );
      expect(
        (state as Unauthenticated).secureStorageUnavailable,
        isFalse,
        reason: 'the erase succeeded, so the user must not be told storage failed',
      );
    });

    testWidgets('the router lands on sign-in and refuses the protected root', (
      WidgetTester tester,
    ) async {
      await coldLaunch(tester);

      await _pressPasswordFallback(tester);
      expect(
        _locationOf(launch.router),
        RoutePaths.signIn,
        reason: 'staying on ${RoutePaths.lock} means the redirect returned the '
            'user to the lock, which is the trap this file exists for',
      );

      // Ask for the protected root directly. Abandoning a session must never
      // be a way INTO one.
      launch.router.go(RoutePaths.home);
      await tester.pumpAndSettle();
      expect(
        _locationOf(launch.router),
        RoutePaths.signIn,
        reason: 'an unauthenticated caller reached the protected root',
      );
    });

    testWidgets('the lock is abandoned, never unlocked', (
      WidgetTester tester,
    ) async {
      await coldLaunch(tester);

      await _pressPasswordFallback(tester);

      expect(
        launch.lock.isLocked,
        isTrue,
        reason: 'the fallback proves nothing to the device, so the gate must '
            'still report locked. Marking it unlocked would turn "I cannot open '
            'this" into a way of opening it',
      );
      expect(
        launch.lock.isEnabled,
        isTrue,
        reason: "the user's lock preference is theirs; giving up one session "
            'does not switch their security setting off',
      );
    });

    testWidgets('pressing it twice is harmless', (WidgetTester tester) async {
      await coldLaunch(tester);

      await _pressPasswordFallback(tester);
      // The button is gone from the tree by now — the router moved on — so the
      // second press is made against the coordinator, which is where the
      // idempotency has to hold anyway.
      await launch.coordinator.abandonLockedSession();
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(launch.coordinator.state, isA<Unauthenticated>());
      expect(launch.secureEntries, isEmpty);
      expect(_locationOf(launch.router), RoutePaths.signIn);
    });

    testWidgets('a RELAUNCH does not restore the abandoned credential', (
      WidgetTester tester,
    ) async {
      await coldLaunch(tester);
      await _pressPasswordFallback(tester);

      // A brand-new composition root over the SAME storage: new container, new
      // SessionManager, new coordinator, nothing carried over in memory.
      final _Launch relaunched = _Launch(
        secureStore: secureStore,
        preferences: preferences,
        securityState: securityState,
      );
      await relaunched.boot(tester);

      expect(
        relaunched.coordinator.state,
        isA<AppLocked>(),
        reason: 'the lock preference is durable and the relaunch is still locked',
      );

      // Open the lock this time, so the restore step actually runs. If the old
      // credential were still on disk, THIS is where it would come back.
      await relaunched.coordinator.unlock();
      await tester.pumpAndSettle();

      expect(
        relaunched.sessions.tokens,
        isNull,
        reason: 'the abandoned credential was restored on the next launch',
      );
      expect(relaunched.coordinator.state, isA<Unauthenticated>());
      expect(relaunched.secureEntries, isEmpty);
    });

    testWidgets('no token material reaches the log or plain preferences', (
      WidgetTester tester,
    ) async {
      await coldLaunch(tester);

      await _pressPasswordFallback(tester);

      for (final String secret in <String>[_accessToken, _refreshToken]) {
        expect(
          launch.loggedText,
          isNot(contains(secret)),
          reason: 'the security event describing the abandonment must carry no '
              'credential',
        );
        expect(
          preferences.writtenText,
          isNot(contains(secret)),
          reason: 'preferences are unencrypted; nothing that can authenticate '
              'may be written there, marker or not',
        );
      }
    });
  });

  group('a keystore that will not ERASE fails closed', () {
    late InMemorySecureStore secureStore;
    late RecordingKeyValueStore preferences;
    late InMemoryLocalSecurityStateStore securityState;
    late _Launch launch;

    setUp(() {
      secureStore = InMemorySecureStore();
      preferences = RecordingKeyValueStore();
      securityState = InMemoryLocalSecurityStateStore();
    });

    /// A cold locked launch on a store that reads and writes normally but
    /// refuses every delete.
    ///
    /// Only the delete fails, deliberately. A store that also refused reads
    /// would hide the surviving credential and the test would prove nothing
    /// about what happens to it.
    Future<void> coldLaunchWithUneraseableStore(WidgetTester tester) async {
      launch = _Launch(
        secureStore: secureStore,
        preferences: preferences,
        securityState: securityState,
      );
      await launch.persistSessionMaterial();
      await launch.enableLock();
      secureStore.failingOperations.add(SecureStorageOperation.delete);
      await launch.boot(tester);
    }

    testWidgets('the user is not told the session was removed', (
      WidgetTester tester,
    ) async {
      await coldLaunchWithUneraseableStore(tester);

      await _pressPasswordFallback(tester);

      expect(
        launch.secureEntries,
        isNotEmpty,
        reason: 'the fixture must actually fail the erase, or this proves nothing',
      );
      final StartupState state = launch.coordinator.state;
      expect(state, isA<Unauthenticated>());
      expect(
        (state as Unauthenticated).secureStorageUnavailable,
        isTrue,
        reason: 'the credential is still on disk. Reporting an ordinary clean '
            'sign-out would be the client claiming something it did not do',
      );
    });

    testWidgets('nothing protected becomes reachable, and there is no loop', (
      WidgetTester tester,
    ) async {
      await coldLaunchWithUneraseableStore(tester);

      await _pressPasswordFallback(tester);
      expect(_locationOf(launch.router), RoutePaths.signIn);

      launch.router.go(RoutePaths.home);
      await tester.pumpAndSettle();
      expect(
        _locationOf(launch.router),
        RoutePaths.signIn,
        reason: 'a failed erase must not leave protected content reachable',
      );

      // A second press, and a settle long enough for any redirect to fight
      // back. The failure mode being excluded is the state oscillating between
      // the lock and sign-in while the erase keeps failing.
      await launch.coordinator.abandonLockedSession();
      await tester.pumpAndSettle();
      expect(_locationOf(launch.router), RoutePaths.signIn);
      expect(launch.coordinator.state, isA<Unauthenticated>());
      expect(tester.takeException(), isNull);
    });

    testWidgets('a later cold start does not restore what could not be erased', (
      WidgetTester tester,
    ) async {
      await coldLaunchWithUneraseableStore(tester);
      await _pressPasswordFallback(tester);
      expect(launch.secureEntries, isNotEmpty);

      // Relaunch, still unable to delete, and this time get past the lock so
      // the restore step runs against the surviving entry.
      final _Launch relaunched = _Launch(
        secureStore: secureStore,
        preferences: preferences,
        securityState: securityState,
      );
      await relaunched.boot(tester);
      await relaunched.coordinator.unlock();
      await tester.pumpAndSettle();

      expect(
        relaunched.sessions.tokens,
        isNull,
        reason: 'the credential the user abandoned came back. It is still in the '
            'keystore because the platform would not erase it, so the durable '
            'marker is the only thing standing between the user and a session '
            'they explicitly gave up',
      );
      final StartupState state = relaunched.coordinator.state;
      expect(state, isA<Unauthenticated>());
      expect((state as Unauthenticated).secureStorageUnavailable, isTrue);
      expect(_locationOf(relaunched.router), RoutePaths.signIn);
    });

    testWidgets('the erase completes as soon as the store recovers', (
      WidgetTester tester,
    ) async {
      await coldLaunchWithUneraseableStore(tester);
      await _pressPasswordFallback(tester);
      expect(launch.secureEntries, isNotEmpty);

      // The keystore starts answering again — a device rebooted, an enclave
      // migration finished. The retry lives in the read path, so it happens on
      // the next restore rather than needing the user to do anything.
      secureStore.failingOperations.remove(SecureStorageOperation.delete);
      final _Launch relaunched = _Launch(
        secureStore: secureStore,
        preferences: preferences,
        securityState: securityState,
      );
      await relaunched.boot(tester);
      await relaunched.coordinator.unlock();
      await tester.pumpAndSettle();

      expect(
        relaunched.secureEntries,
        isEmpty,
        reason: 'the abandoned credential must be erased at the first opportunity',
      );
      final StartupState state = relaunched.coordinator.state;
      expect(state, isA<Unauthenticated>());
      expect(
        (state as Unauthenticated).secureStorageUnavailable,
        isFalse,
        reason: 'the storage is working again and the credential is gone, so '
            'there is nothing left to warn about',
      );
    });

    testWidgets('signing in again still works', (WidgetTester tester) async {
      await coldLaunchWithUneraseableStore(tester);
      await _pressPasswordFallback(tester);

      // The user does the thing the fallback sent them to do. Writes still
      // work — only deletes were failing — so the new credential lands on disk
      // and supersedes the one that could not be removed.
      await launch.sessions.adopt(
        _tokens(access: 'fresh-access-token', refresh: 'fresh-refresh-token'),
      );
      await launch.coordinator.onAuthenticated();
      await tester.pumpAndSettle();

      expect(
        launch.coordinator.state,
        isA<Ready>(),
        reason: 'the fail-closed marker must not lock a user out of the account '
            'they just proved they own; a marker that survives a successful '
            'sign-in would be an endless sign-in loop',
      );
      expect(_locationOf(launch.router), RoutePaths.home);
    });

    testWidgets('no token material reaches the log or plain preferences', (
      WidgetTester tester,
    ) async {
      await coldLaunchWithUneraseableStore(tester);

      await _pressPasswordFallback(tester);

      for (final String secret in <String>[_accessToken, _refreshToken]) {
        expect(
          launch.loggedText,
          isNot(contains(secret)),
          reason: 'the failure path logs more than the happy one, and is where a '
              'credential is most likely to be swept into a diagnostic',
        );
        expect(
          preferences.writtenText,
          isNot(contains(secret)),
          reason: 'the invalidation marker records an INTENT. A copy of the '
              'credential in unencrypted preferences would be a worse leak than '
              'the failed erase it is compensating for',
        );
      }
    });
  });
}
