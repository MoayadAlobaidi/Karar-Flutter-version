// The startup state machine.
//
// Every state in the contract is reached here, by the transition that produces
// it, and every state's recovery path is asserted. The coordinator is the sole
// authority on startup; if a state is reachable only through a widget, this
// file would not be able to cover it, which is the point.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/configuration/app_configuration.dart';
import 'package:karar_mobile/app/configuration/app_environment.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_coordinator.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/security/app_lock.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/core/utilities/clock.dart';

import '../../core/support/fakes.dart';

final DateTime _now = DateTime.utc(2026, 8, 16, 12);

AppConfiguration _configuration() => AppConfiguration(
      environment: AppEnvironment.local,
      apiBaseUrl: Uri.parse('http://localhost:3000'),
      appVersion: '0.0.0',
      buildNumber: '0',
      brandId: 'karar',
    );

SessionTokens _liveTokens() => SessionTokens(
      accessToken: 'access',
      accessTokenExpiresAt: _now.add(const Duration(minutes: 10)),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: _now.add(const Duration(days: 30)),
      sessionId: 'session-1',
    );

SessionTokens _deadChainTokens() => SessionTokens(
      accessToken: 'access',
      accessTokenExpiresAt: _now.subtract(const Duration(hours: 2)),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: _now.subtract(const Duration(hours: 1)),
      sessionId: 'session-1',
    );

final class _Harness {
  _Harness({
    Result<AppConfiguration>? configuration,
    List<Result<BootstrapSnapshot>>? bootstrapAnswers,
  })  : clock = FixedClock(_now),
        secureStore = InMemorySecureStore(),
        preferences = InMemoryKeyValueStore(),
        gateway = FakeBootstrapGateway(
          bootstrapAnswers ?? <Result<BootstrapSnapshot>>[Success<BootstrapSnapshot>(readySnapshot())],
        ) {
    sessions = SessionManager(
      store: SecureTokenStore(secureStore),
      logger: AppLogger.silent,
    );
    appLock = AppLockGate(preferences: preferences);
    coordinator = StartupCoordinator(
      loadConfiguration: () =>
          configuration ?? Success<AppConfiguration>(_configuration()),
      appLock: appLock,
      sessionManager: sessions,
      bootstrapGateway: gateway,
      logger: AppLogger.silent,
      clock: clock,
    );
    coordinator.states.listen(observed.add);
  }

  final FixedClock clock;
  final InMemorySecureStore secureStore;
  final InMemoryKeyValueStore preferences;
  final FakeBootstrapGateway gateway;
  final List<StartupState> observed = <StartupState>[];

  late final SessionManager sessions;
  late final AppLockGate appLock;
  late final StartupCoordinator coordinator;

  Future<void> storeSession(SessionTokens tokens) async {
    await sessions.adopt(tokens);
    // Re-read so the coordinator's restore step genuinely consults storage.
    await sessions.restore();
  }

  /// Broadcast stream events are delivered on a later microtask, so a test
  /// that asserts on the observed SEQUENCE must let them drain first.
  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<void> dispose() async {
    await coordinator.dispose();
    await sessions.dispose();
  }
}

void main() {
  group('CONFIG_LOADING and CONFIG_INVALID', () {
    test('invalid configuration stops startup before anything else is touched', () async {
      final harness = _Harness(
        configuration: const Failed<AppConfiguration>(
          ConfigurationInvalidFailure(violations: <String>['API_BASE_URL_MISSING']),
        ),
      );
      addTearDown(harness.dispose);

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<ConfigInvalid>());
      expect(
        (harness.coordinator.state as ConfigInvalid).violations,
        <String>['API_BASE_URL_MISSING'],
      );
      expect(harness.gateway.callCount, 0, reason: 'no request may be made');
      expect(harness.coordinator.configuration, isNull);
      await harness.settle();
      expect(
        harness.observed.map((StartupState state) => state.stage),
        <StartupStage>[StartupStage.configLoading, StartupStage.configInvalid],
      );
    });

    test('valid configuration is exposed and startup continues', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);

      await harness.coordinator.start();

      expect(harness.coordinator.configuration?.environment, AppEnvironment.local);
    });
  });

  group('APP_LOCKED', () {
    test('a locked application does not read the credential store', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.appLock.setEnabled(enabled: true);

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<AppLocked>());
      expect(harness.gateway.callCount, 0);
    });

    test('unlocking continues to the resolved state', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.appLock.setEnabled(enabled: true);
      await harness.storeSession(_liveTokens());
      await harness.coordinator.start();
      expect(harness.coordinator.state, isA<AppLocked>());

      await harness.coordinator.unlock();

      expect(harness.coordinator.state, isA<Ready>());
    });
  });

  group('SESSION_RESTORING and UNAUTHENTICATED', () {
    test('no stored credential produces UNAUTHENTICATED', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<Unauthenticated>());
      expect(
        (harness.coordinator.state as Unauthenticated).secureStorageUnavailable,
        isFalse,
      );
      expect(harness.gateway.callCount, 0);
      await harness.settle();
      expect(
        harness.observed.map((StartupState state) => state.stage),
        containsAllInOrder(<StartupStage>[
          StartupStage.configLoading,
          StartupStage.sessionRestoring,
          StartupStage.unauthenticated,
        ]),
      );
    });

    test('a keystore that will not answer fails CLOSED, not open', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      harness.secureStore.failWith = SecureStorageOperation.read;

      await harness.coordinator.start();

      final state = harness.coordinator.state;
      expect(state, isA<Unauthenticated>());
      expect((state as Unauthenticated).secureStorageUnavailable, isTrue);
      expect(harness.gateway.callCount, 0, reason: 'nothing protected may be fetched');
    });
  });

  group('SESSION_EXPIRED', () {
    test('an aged-out refresh chain expires the session without a request', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.storeSession(_deadChainTokens());

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<SessionExpired>());
      expect(harness.gateway.callCount, 0);
      expect(harness.secureStore.entries, isEmpty, reason: 'the credential is wiped');
    });

    test('a session ending mid-flight moves the machine to SESSION_EXPIRED', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());
      await harness.coordinator.start();
      expect(harness.coordinator.state, isA<Ready>());

      await harness.sessions.end(SessionEndReason.refreshTokenReuseDetected);
      await Future<void>.delayed(Duration.zero);

      final state = harness.coordinator.state;
      expect(state, isA<SessionExpired>());
      expect((state as SessionExpired).reason, SessionEndReason.refreshTokenReuseDetected);
    });

    test('signing out lands on UNAUTHENTICATED, not SESSION_EXPIRED', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());
      await harness.coordinator.start();

      await harness.coordinator.signOut();
      await Future<void>.delayed(Duration.zero);

      expect(harness.coordinator.state, isA<Unauthenticated>());
      expect(harness.secureStore.entries, isEmpty);
    });

    test('a bootstrap answer of authentication-required expires the session', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          const Failed<BootstrapSnapshot>(AuthenticationRequiredFailure()),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<SessionExpired>());
    });
  });

  group('MFA_CHALLENGE_REQUIRED', () {
    test('is entered on a challenge and left on abandonment', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.coordinator.start();

      harness.coordinator.onMfaChallengeRequired();
      expect(harness.coordinator.state, isA<MfaChallengeRequired>());

      harness.coordinator.onMfaChallengeAbandoned();
      expect(harness.coordinator.state, isA<Unauthenticated>());
    });

    test('completing the challenge continues to the resolved state', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.coordinator.start();
      harness.coordinator.onMfaChallengeRequired();

      await harness.sessions.adopt(_liveTokens());
      await harness.coordinator.onAuthenticated();

      expect(harness.coordinator.state, isA<Ready>());
    });
  });

  group('EMAIL_VERIFICATION_REQUIRED', () {
    test('an unverified address blocks everything downstream', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          Success<BootstrapSnapshot>(readySnapshot(emailVerified: false)),
          Success<BootstrapSnapshot>(readySnapshot()),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();
      expect(harness.coordinator.state, isA<EmailVerificationRequired>());

      await harness.coordinator.onEmailVerified();
      expect(harness.coordinator.state, isA<Ready>());
    });
  });

  group('TENANT_SELECTION_REQUIRED', () {
    test('several memberships require a choice', () async {
      const choices = <TenantOption>[
        TenantOption(tenantId: 'tenant-a', name: 'A', roleHint: 'MEMBER'),
        TenantOption(tenantId: 'tenant-b', name: 'B', roleHint: 'MEMBER'),
      ];
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          Success<BootstrapSnapshot>(
            readySnapshot(binding: const TenantSelectionRequired(choices)),
          ),
          Success<BootstrapSnapshot>(readySnapshot()),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      final state = harness.coordinator.state;
      expect(state, isA<TenantSelectionPending>());
      expect((state as TenantSelectionPending).choices, choices);
      expect(state.hasChoices, isTrue);

      await harness.coordinator.onTenantSelected();
      expect(harness.coordinator.state, isA<Ready>());
    });

    test('no usable membership lands on the same state with no choices', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          Success<BootstrapSnapshot>(readySnapshot(binding: const TenantUnbound())),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      final state = harness.coordinator.state;
      expect(state, isA<TenantSelectionPending>());
      expect((state as TenantSelectionPending).hasChoices, isFalse);
    });

    test('a tenant-binding-required failure routes to tenant selection', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          const Failed<BootstrapSnapshot>(TenantSelectionRequiredFailure()),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<TenantSelectionPending>());
    });
  });

  group('BOOTSTRAP_LOADING, BOOTSTRAP_UNAVAILABLE and READY', () {
    test('the happy path emits loading then ready, in order', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<Ready>());
      await harness.settle();
      expect(
        harness.observed.map((StartupState state) => state.stage),
        containsAllInOrder(<StartupStage>[
          StartupStage.configLoading,
          StartupStage.sessionRestoring,
          StartupStage.bootstrapLoading,
          StartupStage.ready,
        ]),
      );
    });

    test('a 503 bootstrap failure blocks protected content and offers a retry', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          const Failed<BootstrapSnapshot>(
            BootstrapUnavailableFailure(code: 'BOOTSTRAP_UNAVAILABLE', retryable: true),
          ),
          Success<BootstrapSnapshot>(readySnapshot()),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      final state = harness.coordinator.state;
      expect(state, isA<BootstrapUnavailable>());
      expect(state.isReady, isFalse);
      expect((state as BootstrapUnavailable).retryable, isTrue);
      expect(state.recovery, StartupRecovery.retryBootstrap);

      await harness.coordinator.retryBootstrap();
      expect(harness.coordinator.state, isA<Ready>());
    });

    test('a non-retryable failure offers a restart rather than a futile retry', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          const Failed<BootstrapSnapshot>(
            BootstrapUnavailableFailure(code: 'BOOTSTRAP_UNAVAILABLE', retryable: false),
          ),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      expect(harness.coordinator.state.recovery, StartupRecovery.restart);
    });

    test(
      'a resolved bootstrap with an EMPTY capability list is READY, not unavailable',
      () async {
        final harness = _Harness(
          bootstrapAnswers: <Result<BootstrapSnapshot>>[
            Success<BootstrapSnapshot>(readySnapshot()),
          ],
        );
        addTearDown(harness.dispose);
        await harness.storeSession(_liveTokens());

        await harness.coordinator.start();

        final state = harness.coordinator.state;
        expect(state, isA<Ready>());
        expect((state as Ready).bootstrap.capabilities, isEmpty);
        expect(
          state.bootstrap.capabilityState,
          CapabilityResolutionState.resolved,
          reason: 'an empty list is a stated answer, not an outage',
        );
        expect(state.bootstrap.hasCapability('anything'), isFalse);
      },
    );

    test('an unclassifiable capability state fails closed', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          Success<BootstrapSnapshot>(
            readySnapshot(capabilityState: CapabilityResolutionState.unknown),
          ),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      final state = harness.coordinator.state;
      expect(state, isA<BootstrapUnavailable>());
      expect(
        (state as BootstrapUnavailable).failure,
        isA<CapabilityResolutionUnavailableFailure>(),
      );
    });

    test('an unresolved operating entity fails closed', () async {
      for (final entityState in <OperatingEntityState>[
        OperatingEntityState.unavailable,
        OperatingEntityState.unknown,
      ]) {
        final harness = _Harness(
          bootstrapAnswers: <Result<BootstrapSnapshot>>[
            Success<BootstrapSnapshot>(readySnapshot(operatingEntityState: entityState)),
          ],
        );
        addTearDown(harness.dispose);
        await harness.storeSession(_liveTokens());

        await harness.coordinator.start();

        expect(
          harness.coordinator.state,
          isA<BootstrapUnavailable>(),
          reason: 'operating entity $entityState must not render protected content',
        );
      }
    });

    test('an unassigned operating entity is a legitimate ready state', () async {
      final harness = _Harness(
        bootstrapAnswers: <Result<BootstrapSnapshot>>[
          Success<BootstrapSnapshot>(
            readySnapshot(operatingEntityState: OperatingEntityState.unassigned),
          ),
        ],
      );
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      await harness.coordinator.start();

      expect(harness.coordinator.state, isA<Ready>());
    });

    test('offline and timeout both block protected content', () async {
      for (final failure in <Failure>[
        const OfflineFailure(),
        const TimeoutFailure(phase: TimeoutPhase.receive),
        const DependencyUnavailableFailure(),
        const ContractViolationFailure(),
      ]) {
        final harness = _Harness(
          bootstrapAnswers: <Result<BootstrapSnapshot>>[
            Failed<BootstrapSnapshot>(failure),
          ],
        );
        addTearDown(harness.dispose);
        await harness.storeSession(_liveTokens());

        await harness.coordinator.start();

        expect(
          harness.coordinator.state,
          isA<BootstrapUnavailable>(),
          reason: '${failure.diagnosticLabel} must not reach READY',
        );
      }
    });
  });

  group('invariants', () {
    test('only READY reports isReady', () {
      final states = <StartupState>[
        const ConfigLoading(),
        const ConfigInvalid(<String>['X']),
        const AppLocked(),
        const SessionRestoring(),
        const Unauthenticated(),
        const SessionExpired(SessionEndReason.expired),
        const MfaChallengeRequired(),
        const EmailVerificationRequired(),
        const BootstrapLoading(),
        const BootstrapUnavailable(BootstrapUnavailableFailure()),
        const TenantSelectionPending(<TenantOption>[]),
        Ready(readySnapshot()),
      ];

      for (final state in states) {
        expect(state.isReady, state is Ready, reason: state.stage.name);
      }
    });

    test('every stage is represented and every state declares a recovery', () {
      final states = <StartupState>[
        const ConfigLoading(),
        const ConfigInvalid(<String>['X']),
        const AppLocked(),
        const SessionRestoring(),
        const Unauthenticated(),
        const SessionExpired(SessionEndReason.expired),
        const MfaChallengeRequired(),
        const EmailVerificationRequired(),
        const BootstrapLoading(),
        const BootstrapUnavailable(BootstrapUnavailableFailure()),
        const TenantSelectionPending(<TenantOption>[]),
        Ready(readySnapshot()),
      ];

      expect(
        states.map((StartupState state) => state.stage).toSet(),
        StartupStage.values.toSet(),
        reason: 'every declared stage must be constructible',
      );
      for (final state in states) {
        expect(
          state.recovery,
          isNotNull,
          reason: '${state.stage.name} must declare a recovery path',
        );
        if (!state.isTransient && !state.isReady) {
          expect(
            state.recovery,
            isNot(StartupRecovery.waitForCoordinator),
            reason: '${state.stage.name} is actionable and must not tell the user to wait',
          );
        }
      }
    });

    test('a superseded run does not overwrite the newer one', () async {
      final harness = _Harness();
      addTearDown(harness.dispose);
      await harness.storeSession(_liveTokens());

      final first = harness.coordinator.start();
      final second = harness.coordinator.start();
      await Future.wait<void>(<Future<void>>[first, second]);

      expect(harness.coordinator.state, isA<Ready>());
    });
  });
}
