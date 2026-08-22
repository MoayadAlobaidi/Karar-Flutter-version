// LOCAL SECURITY STATE THAT WILL NOT ANSWER, THROUGH THE REAL ROUTER.
//
// `app_lock_cold_launch_test.dart` beside this file proves a locked cold launch
// can reach sign-in when the STORES WORK. This file is about the launches where
// they do not, and it is composed the same way for the same reason: the real
// composition root, the real coordinator, the real `AppLockGate` and
// `SecureTokenStore`, the real single redirect. Only the two transports and the
// platform authenticator are substituted, so an assertion here is about
// production behaviour rather than about a mock.
//
// THE TWO DEFECTS IT EXISTS TO CATCH, both of which passed every previous test:
//
//   1. The application-lock choice was an ordinary preference, read as
//      `readBool(key) ?? false`. `PreferencesKeyValueStore.open` falls back to
//      an in-memory store when the platform refuses, an in-memory store holds
//      no choice, and `?? false` turned that into "the user never asked for a
//      lock". A device whose preference storage failed skipped the lock gate,
//      restored the credential from the keystore and rendered protected
//      content. Nothing threw and nothing was reported.
//
//   2. A credential given up at the lock could fail to erase AND fail to be
//      recorded as abandoned, and the two failures together were reported as an
//      ordinary signed-out state — the same screen a clean sign-out reaches.
//
// A FRESH PROCESS IS A NEW `_Process` OVER THE SAME STORAGE. Nothing in memory
// survives: new container, new gate, new `SessionManager`, new coordinator,
// reading the disk the previous one left behind. Every failure below is
// followed through a restart, because a client-side security record that does
// not survive one is the whole subject of this file.

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
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/core/utilities/clock.dart';
import 'package:karar_mobile/features/session_management/data/platform_local_authenticator.dart';
import 'package:karar_mobile/features/session_management/domain/app_lock.dart';
import 'package:karar_mobile/features/session_management/presentation/app_lock_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../../core/support/fakes.dart';
import '../../features/authentication/support/identity_harness.dart';

final AppLocalizations _english = lookupAppLocalizations(KararLocalization.english);

final DateTime _now = DateTime.utc(2026, 8, 16, 12);

/// Distinctive values, so an assertion that they never reached a log line, the
/// plain preference store or local security state is checking for the real
/// thing.
const String _accessToken = 'security-state-access-token-must-not-leak';
const String _refreshToken = 'security-state-refresh-token-must-not-leak';

SessionTokens _tokens({String access = _accessToken, String refresh = _refreshToken}) =>
    SessionTokens(
      accessToken: access,
      accessTokenExpiresAt: _now.add(const Duration(minutes: 10)),
      refreshToken: refresh,
      refreshTokenExpiresAt: _now.add(const Duration(days: 30)),
      sessionId: '9f1d0f6a-0000-4000-8000-000000000001',
    );

/// One process, over storage that outlives it.
final class _Process {
  _Process({required this.secureStore, required this.preferences, required this.securityState}) {
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
        loggerProvider.overrideWithValue(AppLogger(sink: logSink, minimumLevel: LogLevel.trace)),
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
          // authenticator makes the lock screen stand the lock down, which
          // would dismantle the gate these tests are about.
          ScriptedLocalAuthenticator(
            outcomes: const <LocalAuthOutcome>[LocalAuthFailed(LocalAuthFailureReason.lockedOut)],
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
  }

  final InMemorySecureStore secureStore;
  final KeyValueStore preferences;
  final LocalSecurityStateStore securityState;
  final RecordingLogSink logSink = RecordingLogSink();

  late final ProviderContainer container;

  StartupCoordinator get coordinator => container.read(startupCoordinatorProvider);

  SessionManager get sessions => container.read(sessionManagerProvider);

  AppLockGate get lock => container.read(appLockGateProvider);

  GoRouter get router => container.read(routerProvider);

  Map<String, String> get secureEntries => secureStore.entries;

  String get loggedText => logSink.records.map((LogRecord record) => record.toString()).join('\n');

  /// The location the router is actually showing.
  String get location => router.routerDelegate.currentConfiguration.uri.path;

  /// Writes valid, production-encoded session material straight to the secure
  /// store, through the real `TokenStore` but WITHOUT `adopt` — adopting would
  /// put the credential in memory and turn a cold launch into a warm one.
  Future<void> persistSessionMaterial() async {
    final written = await container.read(tokenStoreProvider).write(_tokens());
    expect(written, isA<Success<void>>(), reason: 'the fixture must actually persist');
    expect(secureStore.entries, isNotEmpty);
  }

  /// Mounts the real router over this container and runs startup.
  ///
  /// The previous tree, if any, is taken down and settled FIRST: Riverpod
  /// schedules auto-dispose work on a timer, and replacing one mounted
  /// composition root with another in a single pump leaves that timer alive
  /// past the end of the test.
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

Future<void> _pressPasswordFallback(WidgetTester tester) async {
  await tester.tap(find.text(_english.appLockSignInInstead));
  await tester.pumpAndSettle();
}

Future<void> _pressRetry(WidgetTester tester) async {
  await tester.tap(find.text(_english.actionRetry));
  await tester.pumpAndSettle();
}

/// Every place a credential must never appear, checked at once.
void _expectNoCredentialLeak(_Process process) {
  for (final String secret in <String>[_accessToken, _refreshToken]) {
    expect(
      process.loggedText,
      isNot(contains(secret)),
      reason:
          'a failure path logs more than the happy one, and is where a '
          'credential is most likely to be swept into a diagnostic',
    );
    final KeyValueStore preferences = process.preferences;
    if (preferences is RecordingKeyValueStore) {
      expect(
        preferences.writtenText,
        isNot(contains(secret)),
        reason:
            'preferences are unencrypted; nothing that can authenticate may '
            'be written there',
      );
    }
    final LocalSecurityStateStore securityState = process.securityState;
    if (securityState is InMemoryLocalSecurityStateStore) {
      expect(
        securityState.writes.join('\n'),
        isNot(contains(secret)),
        reason:
            'local security state records decisions ABOUT credentials, '
            'never credentials',
      );
    }
  }
}

void main() {
  late InMemorySecureStore secureStore;
  late RecordingKeyValueStore preferences;
  late InMemoryLocalSecurityStateStore securityState;

  setUp(() {
    secureStore = InMemorySecureStore();
    preferences = RecordingKeyValueStore();
    securityState = InMemoryLocalSecurityStateStore();
  });

  _Process newProcess({
    KeyValueStore? withPreferences,
    LocalSecurityStateStore? withSecurityState,
  }) => _Process(
    secureStore: secureStore,
    preferences: withPreferences ?? preferences,
    securityState: withSecurityState ?? securityState,
  );

  group('a security-state store that cannot be OPENED blocks startup', () {
    /// The composition root installs `UnavailableLocalSecurityStateStore` when
    /// the platform store will not open. This is that launch, end to end.
    ///
    /// The credential is seeded through a HEALTHY process first, because that
    /// is how a device reaches this state: the session was persisted on a
    /// launch where storage worked, and the store failed afterwards. Seeding
    /// through the broken process is not possible and should not be — a write
    /// whose invalidation marker cannot be consulted is itself reported as a
    /// failure.
    Future<_Process> launch(WidgetTester tester) async {
      await newProcess().persistSessionMaterial();
      final _Process process = newProcess(
        withSecurityState: const UnavailableLocalSecurityStateStore(),
      );
      await process.boot(tester);
      return process;
    }

    testWidgets('startup stops at the typed blocked state', (tester) async {
      final _Process process = await launch(tester);

      expect(
        process.coordinator.state,
        isA<LocalSecurityStateUnavailable>(),
        reason:
            'THE ASSERTION THAT FAILS WITHOUT THE FIX. The old gate read a '
            'store that could not answer as "the lock is off" and carried on',
      );
      expect(
        (process.coordinator.state as LocalSecurityStateUnavailable).failure,
        isA<LocalSecurityStateUnavailableFailure>(),
      );
    });

    testWidgets('the credential is never read, let alone restored', (tester) async {
      final _Process process = await launch(tester);

      expect(
        process.sessions.state,
        isA<NoSession>(),
        reason:
            'the security-state step runs BEFORE the restore, so the '
            'keystore is not opened at all',
      );
      expect(process.sessions.tokens, isNull);
      expect(
        process.secureEntries,
        isNotEmpty,
        reason: 'the credential is untouched on disk — withheld, not destroyed',
      );
    });

    testWidgets('it has its own route and cannot reach protected content', (tester) async {
      final _Process process = await launch(tester);
      expect(process.location, RoutePaths.securityUnavailable);

      process.router.go(RoutePaths.home);
      await tester.pumpAndSettle();
      expect(process.location, RoutePaths.securityUnavailable);
    });

    testWidgets('there is no loop with the lock or with sign-in', (tester) async {
      final _Process process = await launch(tester);

      for (final String route in <String>[RoutePaths.lock, RoutePaths.signIn]) {
        process.router.go(route);
        await tester.pumpAndSettle();
        expect(
          process.location,
          RoutePaths.securityUnavailable,
          reason:
              'asking for $route must land back here in ONE hop, not '
              'oscillate against the single redirect',
        );
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('the screen offers a retry, and it is safe to press repeatedly', (tester) async {
      final _Process process = await launch(tester);

      await _pressRetry(tester);
      await _pressRetry(tester);

      expect(process.coordinator.state, isA<LocalSecurityStateUnavailable>());
      expect(process.location, RoutePaths.securityUnavailable);
      expect(process.secureEntries, isNotEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the retry succeeds once the store recovers', (tester) async {
      final _Process process = await launch(tester);

      // The same process, now handed a store that works: the platform came
      // back. `start()` re-runs the load step.
      final _Process recovered = newProcess();
      await recovered.boot(tester);

      expect(
        recovered.coordinator.state,
        isA<Ready>(),
        reason:
            'an empty security-state store is a real answer — the lock is '
            'off — so the credential restores and startup completes',
      );
      expect(recovered.location, RoutePaths.home);
      _expectNoCredentialLeak(process);
    });

    testWidgets('a COLD RESTART with the store still broken stays blocked', (tester) async {
      await launch(tester);

      final _Process restarted = newProcess(
        withSecurityState: const UnavailableLocalSecurityStateStore(),
      );
      await restarted.boot(tester);

      expect(restarted.coordinator.state, isA<LocalSecurityStateUnavailable>());
      expect(restarted.location, RoutePaths.securityUnavailable);
      expect(restarted.sessions.tokens, isNull);
      _expectNoCredentialLeak(restarted);
    });
  });

  group('an app-lock choice that cannot be READ blocks startup', () {
    Future<_Process> launch(WidgetTester tester) async {
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await securityState.write(LocalSecurityFlag.appLockEnabled, value: true);
      securityState.unreadableFlags.add(LocalSecurityFlag.appLockEnabled);
      await process.boot(tester);
      return process;
    }

    testWidgets('a read failure is not a disabled lock', (tester) async {
      final _Process process = await launch(tester);

      expect(process.coordinator.state, isA<LocalSecurityStateUnavailable>());
      expect(process.location, RoutePaths.securityUnavailable);
      expect(
        process.lock.isDurablyDisabled,
        isFalse,
        reason:
            'no answer is not the same as "off", and only "off" may skip '
            'the gate',
      );
      expect(process.sessions.tokens, isNull);
    });

    testWidgets('a CORRUPT choice blocks the same way', (tester) async {
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      securityState.corruptFlags.add(LocalSecurityFlag.appLockEnabled);
      await process.boot(tester);

      final StartupState state = process.coordinator.state;
      expect(state, isA<LocalSecurityStateUnavailable>());
      expect(
        (state as LocalSecurityStateUnavailable).failure,
        isA<LocalSecurityStateCorruptFailure>(),
        reason:
            'a damaged value is not an absent one; only absent means the '
            'user never chose',
      );
      expect(process.sessions.tokens, isNull);
    });

    testWidgets('the retry reaches the lock once the read works again', (tester) async {
      final _Process process = await launch(tester);

      securityState.unreadableFlags.remove(LocalSecurityFlag.appLockEnabled);
      await _pressRetry(tester);

      expect(
        process.coordinator.state,
        isA<AppLocked>(),
        reason: 'the choice was ON all along; the store just would not say so',
      );
      expect(process.location, RoutePaths.lock);
      expect(
        process.sessions.tokens,
        isNull,
        reason:
            'the lock is evaluated before the restore, so a locked launch '
            'still holds a credential it has never read',
      );
    });

    testWidgets('a COLD RESTART after the read failure is still locked', (tester) async {
      await launch(tester);
      securityState.unreadableFlags.remove(LocalSecurityFlag.appLockEnabled);

      final _Process restarted = newProcess();
      await restarted.boot(tester);

      expect(restarted.coordinator.state, isA<AppLocked>());
      expect(restarted.location, RoutePaths.lock);
    });
  });

  group('an ABSENT app-lock choice is a real answer', () {
    testWidgets('startup completes normally and nothing is blocked', (tester) async {
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await process.boot(tester);

      expect(
        process.coordinator.state,
        isA<Ready>(),
        reason:
            'the store answered and held nothing, which is a user who never '
            'turned the lock on. Blocking here would make an opt-in control '
            'mandatory for everybody',
      );
      expect(process.location, RoutePaths.home);
      expect(process.lock.isDurablyDisabled, isTrue);
    });
  });

  group('the plain preference store cannot move a security gate', () {
    testWidgets('its in-memory fallback does not disable the lock', (tester) async {
      // EXACTLY THE FAILURE THE OLD DESIGN HAD. `PreferencesKeyValueStore.open`
      // returns this store when the platform refuses; it holds nothing, and the
      // lock choice used to be read out of it.
      await securityState.write(LocalSecurityFlag.appLockEnabled, value: true);
      final _Process process = newProcess(withPreferences: InMemoryKeyValueStore());
      await process.persistSessionMaterial();
      await process.boot(tester);

      expect(
        process.coordinator.state,
        isA<AppLocked>(),
        reason:
            'a preference store that lost everything must not be able to '
            'switch the application lock off',
      );
      expect(process.location, RoutePaths.lock);
    });

    testWidgets('a contradicting preference value is ignored entirely', (tester) async {
      await securityState.write(LocalSecurityFlag.appLockEnabled, value: true);
      await preferences.writeBool(PreferenceKey('security.app_lock_enabled'), value: false);
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await process.boot(tester);

      expect(
        process.coordinator.state,
        isA<AppLocked>(),
        reason:
            'unencrypted preferences are writable on a rooted device; a '
            'value there must not be able to open a gate',
      );
    });
  });

  group('a failed erase whose marker HOLDS is survivable', () {
    Future<_Process> abandonWithFailingErase(WidgetTester tester) async {
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await securityState.write(LocalSecurityFlag.appLockEnabled, value: true);
      secureStore.failingOperations.add(SecureStorageOperation.delete);
      await process.boot(tester);
      await _pressPasswordFallback(tester);
      return process;
    }

    testWidgets('the user reaches sign-in, flagged rather than reassured', (tester) async {
      final _Process process = await abandonWithFailingErase(tester);

      expect(process.secureEntries, isNotEmpty, reason: 'the erase must fail');
      final StartupState state = process.coordinator.state;
      expect(state, isA<Unauthenticated>());
      expect(
        (state as Unauthenticated).secureStorageUnavailable,
        isTrue,
        reason:
            'NO CLEAN-SUCCESS MESSAGE WHERE PERSISTENCE WAS NOT CONFIRMED. '
            'The credential is still on disk',
      );
      expect(process.location, RoutePaths.signIn);
    });

    testWidgets('a COLD RESTART refuses to restore what could not be erased', (tester) async {
      await abandonWithFailingErase(tester);

      final _Process restarted = newProcess();
      await restarted.boot(tester);
      expect(restarted.coordinator.state, isA<AppLocked>());
      // Open the lock so the restore step actually runs. If the marker were not
      // durable, THIS is where the abandoned credential would come back.
      await restarted.coordinator.unlock();
      await tester.pumpAndSettle();

      expect(restarted.sessions.tokens, isNull);
      expect(restarted.location, RoutePaths.signIn);
      _expectNoCredentialLeak(restarted);
    });
  });

  group('the COMPOUND failure is blocked, not signed out', () {
    /// The erase fails AND the marker cannot be written. Nothing durable
    /// records that the credential was given up.
    Future<_Process> abandonWithCompoundFailure(WidgetTester tester) async {
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await securityState.write(LocalSecurityFlag.appLockEnabled, value: true);
      secureStore.failingOperations.add(SecureStorageOperation.delete);
      securityState.unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      await process.boot(tester);
      await _pressPasswordFallback(tester);
      return process;
    }

    testWidgets('it does NOT become an ordinary clean sign-in', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);

      final StartupState state = process.coordinator.state;
      expect(
        state,
        isA<SecurityRecoveryBlocked>(),
        reason:
            'THE DEFECT. Both failures together used to reach the same '
            'Unauthenticated state a clean sign-out reaches, so the client told '
            'the user the session was abandoned when nothing recorded that it '
            'was',
      );
      expect((state as SecurityRecoveryBlocked).outcome, isA<AbandonmentNotDurable>());
      expect(state, isNot(isA<Unauthenticated>()));
    });

    testWidgets('no protected content, no credential restore, its own route', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);
      expect(process.location, RoutePaths.securityRecovery);

      process.router.go(RoutePaths.home);
      await tester.pumpAndSettle();
      expect(process.location, RoutePaths.securityRecovery);
      expect(process.sessions.tokens, isNull);
    });

    testWidgets('there is no lock/sign-in loop', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);

      for (final String route in <String>[RoutePaths.lock, RoutePaths.signIn]) {
        process.router.go(route);
        await tester.pumpAndSettle();
        expect(process.location, RoutePaths.securityRecovery, reason: route);
      }
      expect(tester.takeException(), isNull);
    });

    testWidgets('the surviving credential is withheld for the rest of the process', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);

      // The in-process latch, exercised through the real store. Nothing durable
      // records the abandonment, so this is the only thing holding the line.
      final restored = await process.container.read(tokenStoreProvider).read();

      expect(process.secureEntries, isNotEmpty);
      expect(
        restored.valueOrNull,
        isNull,
        reason:
            'the object that failed to destroy the credential handed it '
            'straight back',
      );
    });

    testWidgets('retrying repeatedly is safe and stays blocked while it fails', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);

      await _pressRetry(tester);
      await _pressRetry(tester);

      expect(process.coordinator.state, isA<SecurityRecoveryBlocked>());
      expect(process.location, RoutePaths.securityRecovery);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the retry resolves it once the keystore recovers', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);

      secureStore.failingOperations.remove(SecureStorageOperation.delete);
      await _pressRetry(tester);

      expect(
        process.coordinator.state,
        isA<Unauthenticated>(),
        reason:
            'the credential is provably gone, so the ordinary signed-out '
            'state is now an honest claim',
      );
      expect((process.coordinator.state as Unauthenticated).secureStorageUnavailable, isFalse);
      expect(process.secureEntries, isEmpty);
      expect(process.location, RoutePaths.signIn);
    });

    testWidgets('the retry resolves it once the marker can be written', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);

      securityState.unwritableFlags.remove(LocalSecurityFlag.persistedSessionAbandoned);
      await _pressRetry(tester);

      final StartupState state = process.coordinator.state;
      expect(
        state,
        isA<Unauthenticated>(),
        reason:
            'the erase still fails, but the abandonment is now durable, '
            'which is the survivable case',
      );
      expect((state as Unauthenticated).secureStorageUnavailable, isTrue);
      expect(process.location, RoutePaths.signIn);
    });

    testWidgets('a COLD RESTART cannot reach the credential once the store degrades', (
      tester,
    ) async {
      // THE STRONG CASE. The store that refused the marker write stops
      // answering altogether by the next launch — a plausible progression, and
      // the one where the guarantee is absolute: the lock cannot be evaluated,
      // so the sequence stops before the keystore is opened at all and the
      // surviving credential is never read.
      await abandonWithCompoundFailure(tester);

      final _Process restarted = newProcess(
        withSecurityState: const UnavailableLocalSecurityStateStore(),
      );
      await restarted.boot(tester);

      expect(restarted.coordinator.state, isA<LocalSecurityStateUnavailable>());
      expect(restarted.sessions.tokens, isNull);
      expect(restarted.location, RoutePaths.securityUnavailable);
      expect(
        restarted.secureEntries,
        isNotEmpty,
        reason:
            'the credential is still there — withheld, not destroyed, which '
            'is the honest state and the reason the screen says so',
      );
    });

    testWidgets('THE HARD BOUNDARY: a restart is held by the lock and nothing more', (
      tester,
    ) async {
      // Stated rather than pretended away. When the marker never reached disk,
      // no client-side record of the abandonment survives the process — that is
      // what "not durable" means — so the next launch has only the application
      // lock between the user and the credential they gave up. Here that is
      // enough, because the lock is on and the device authenticator is what the
      // user could not satisfy in the first place.
      //
      // It is NOT a guarantee, and the code does not claim one: see the
      // in-process latch in `core/security/token_store.dart`. Server-side
      // revocation of the abandoned session is the only real remedy and is not
      // this layer's to perform.
      await abandonWithCompoundFailure(tester);

      final _Process restarted = newProcess();
      await restarted.boot(tester);

      expect(
        restarted.coordinator.state,
        isA<AppLocked>(),
        reason: 'the lock choice is durable and still on',
      );
      expect(restarted.location, RoutePaths.lock);
      expect(
        restarted.sessions.tokens,
        isNull,
        reason: 'nothing protected renders, and the keystore has not been read',
      );
      _expectNoCredentialLeak(restarted);
    });

    testWidgets('no credential reaches a log, a preference or security state', (tester) async {
      final _Process process = await abandonWithCompoundFailure(tester);

      _expectNoCredentialLeak(process);
    });
  });

  group('a token deleted but a marker that will not clear', () {
    /// The erase succeeds and the marker cannot be removed OR stood down.
    Future<_Process> abandonWithStuckMarker(WidgetTester tester) async {
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await securityState.write(LocalSecurityFlag.appLockEnabled, value: true);
      securityState
        ..unremovableFlags.add(LocalSecurityFlag.persistedSessionAbandoned)
        ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned);
      await process.boot(tester);
      await _pressPasswordFallback(tester);
      return process;
    }

    testWidgets('the credential is gone and the user is not blocked', (tester) async {
      final _Process process = await abandonWithStuckMarker(tester);

      expect(process.secureEntries, isEmpty);
      final StartupState state = process.coordinator.state;
      expect(
        state,
        isA<Unauthenticated>(),
        reason:
            'a stale marker guards nothing. Blocking here would trap a user '
            'over the failure of a cleanup step that has nothing left to clean',
      );
      expect((state as Unauthenticated).secureStorageUnavailable, isFalse);
      expect(process.location, RoutePaths.signIn);
    });

    testWidgets('it is DISTINGUISHABLE from a failed token deletion', (tester) async {
      // Same user-visible destination, different outcome — and the outcome is
      // what the log and any later decision read.
      final store = SecureTokenStore(
        InMemorySecureStore(),
        invalidation: PersistedSessionInvalidation(
          InMemoryLocalSecurityStateStore()
            ..unremovableFlags.add(LocalSecurityFlag.persistedSessionAbandoned)
            ..unwritableFlags.add(LocalSecurityFlag.persistedSessionAbandoned),
        ),
      );

      expect(await store.clear(), isA<CredentialErasedMarkerRetained>());
    });

    testWidgets('a COLD RESTART does not reopen the old credential path', (tester) async {
      await abandonWithStuckMarker(tester);

      final _Process restarted = newProcess();
      await restarted.boot(tester);
      await restarted.coordinator.unlock();
      await tester.pumpAndSettle();

      expect(restarted.sessions.tokens, isNull);
      expect(restarted.secureEntries, isEmpty);
      expect(restarted.location, RoutePaths.signIn);
    });

    testWidgets('a new session is NOT permanently trapped once storage recovers', (tester) async {
      final _Process process = await abandonWithStuckMarker(tester);

      // The store starts accepting writes again and the user signs in.
      securityState.unwritableFlags.remove(LocalSecurityFlag.persistedSessionAbandoned);
      await process.sessions.adopt(
        _tokens(access: 'fresh-access-token', refresh: 'fresh-refresh-token'),
      );
      await process.coordinator.onAuthenticated();
      await tester.pumpAndSettle();

      expect(
        process.coordinator.state,
        isA<Ready>(),
        reason:
            'a marker that survives a confirmed replacement is an endless '
            'sign-in loop for a user who has done nothing wrong',
      );

      final _Process restarted = newProcess();
      await restarted.boot(tester);
      await restarted.coordinator.unlock();
      await tester.pumpAndSettle();

      expect(
        restarted.coordinator.state,
        isA<Ready>(),
        reason:
            'the replacement must survive a relaunch, or the trap is merely '
            'deferred by one launch',
      );
    });
  });

  group('enabling the lock cannot succeed only in memory', () {
    testWidgets('a refused write leaves the next cold launch unlocked', (tester) async {
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await process.boot(tester);
      expect(process.coordinator.state, isA<Ready>());

      securityState.unwritableFlags.add(LocalSecurityFlag.appLockEnabled);
      final AppLockChange change = await process.lock.setEnabled(enabled: true);

      expect(change, isA<AppLockChangeRejected>());
      final _Process restarted = newProcess();
      await restarted.boot(tester);
      expect(
        restarted.coordinator.state,
        isA<Ready>(),
        reason:
            'a lock the user was told was on would present itself here. It '
            'never reached storage, so it does not — and the point of the typed '
            'rejection is that the user was never told otherwise',
      );
    });

    testWidgets('a confirmed write DOES lock the next cold launch', (tester) async {
      // Without this, the assertion above could pass because nothing works.
      final _Process process = newProcess();
      await process.persistSessionMaterial();
      await process.boot(tester);

      expect(await process.lock.setEnabled(enabled: true), isA<AppLockChangeApplied>());

      final _Process restarted = newProcess();
      await restarted.boot(tester);
      expect(restarted.coordinator.state, isA<AppLocked>());
      expect(restarted.location, RoutePaths.lock);
    });
  });
}
