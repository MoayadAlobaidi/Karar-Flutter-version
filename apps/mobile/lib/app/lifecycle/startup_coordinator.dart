// PURE DART ONLY.
//
// THE ONE STARTUP AUTHORITY.
//
// Determinism is the property this type exists to provide. Given the same
// configuration, lock state, stored credential and bootstrap answer, it always
// produces the same state, in the same order, by the same route. Nothing else
// in the application may decide whether the user is signed in, whether the
// bootstrap resolved, or which screen that implies.
//
// EVALUATION ORDER, fixed:
//   1. configuration  — nothing can be attempted without a validated endpoint;
//   2. application lock — a locked device does not have its keystore read;
//   3. session restore — from platform secure storage only;
//   4. bootstrap fetch — the server's answer decides the rest.
//
// Step 2 comes before step 3, which is why a locked launch holds a credential
// it has never read. There are exactly TWO ways past it: [unlock], after the
// platform has authenticated the user, and [abandonLockedSession], which
// destroys the stored credential rather than stepping around it. Neither one
// skips a step; the second removes the thing the later steps would have found.
//
// FAIL CLOSED at every step. A keystore that will not answer is treated as no
// credential. A bootstrap that will not resolve blocks protected content. An
// operating-entity or capability state this build does not recognise blocks
// protected content. In no case does the coordinator guess.
import 'dart:async';

import '../../core/errors/failure.dart';
import '../../core/errors/result.dart';
import '../../core/logging/app_logger.dart';
import '../../core/security/app_lock.dart';
import '../../core/security/session_manager.dart';
import '../../core/utilities/clock.dart';
import '../configuration/app_configuration.dart';
import 'bootstrap_snapshot.dart';
import 'startup_state.dart';

/// Fetches the bootstrap context. Implemented over the generated API client.
abstract interface class BootstrapGateway {
  Future<Result<BootstrapSnapshot>> load();
}

/// Produces the current [StartupState].
final class StartupCoordinator {
  StartupCoordinator({
    required Result<AppConfiguration> Function() loadConfiguration,
    required AppLockGate appLock,
    required SessionManager sessionManager,
    required BootstrapGateway bootstrapGateway,
    required AppLogger logger,
    required Clock clock,
  })  : _loadConfiguration = loadConfiguration,
        _appLock = appLock,
        _sessions = sessionManager,
        _bootstrap = bootstrapGateway,
        _logger = logger.forCategory('startup'),
        _clock = clock;

  final Result<AppConfiguration> Function() _loadConfiguration;
  final AppLockGate _appLock;
  final SessionManager _sessions;
  final BootstrapGateway _bootstrap;
  final CategoryLogger _logger;
  final Clock _clock;

  final StreamController<StartupState> _states = StreamController<StartupState>.broadcast();

  StartupState _state = const ConfigLoading();
  AppConfiguration? _configuration;
  StreamSubscription<SessionEndReason>? _sessionEndSubscription;

  /// Guards against two concurrent runs interleaving their emissions.
  int _generation = 0;

  StartupState get state => _state;

  /// The validated configuration, once loaded. Null before then and whenever
  /// configuration is invalid.
  AppConfiguration? get configuration => _configuration;

  /// Emits on every state change.
  Stream<StartupState> get states => _states.stream;

  /// Runs the whole sequence. Safe to call again; a later call supersedes an
  /// earlier one rather than racing it.
  Future<void> start() async {
    final generation = ++_generation;
    _sessionEndSubscription ??= _sessions.onSessionEnded.listen(_onSessionEnded);

    _emit(const ConfigLoading(), generation);
    final configuration = _loadConfiguration();
    switch (configuration) {
      case Failed<AppConfiguration>(:final failure):
        final violations = switch (failure) {
          ConfigurationInvalidFailure(:final violations) => violations,
          _ => <String>[failure.diagnosticLabel],
        };
        _configuration = null;
        _logger.error(
          'Build configuration is invalid; the application will not start.',
          fields: <String, Object?>{'violations': violations},
        );
        _emit(ConfigInvalid(violations), generation);
        return;
      case Success<AppConfiguration>(:final value):
        _configuration = value;
        _logger.info(
          'Configuration loaded.',
          fields: <String, Object?>{
            'environment': value.environment.identifier,
            'apiHost': value.apiBaseUrl.host,
          },
        );
    }

    if (_appLock.isLocked) {
      _emit(const AppLocked(), generation);
      return;
    }

    await _restoreAndBootstrap(generation);
  }

  /// The platform authenticated the user against the application lock.
  Future<void> unlock() async {
    _appLock.markUnlocked();
    if (_configuration == null) {
      await start();
      return;
    }
    await _restoreAndBootstrap(++_generation);
  }

  /// A sign-in produced a session. Continues from the bootstrap step.
  Future<void> onAuthenticated() => _restoreAndBootstrap(++_generation);

  /// A sign-in produced a multi-factor challenge rather than a session.
  void onMfaChallengeRequired() => _emit(const MfaChallengeRequired(), ++_generation);

  /// The user abandoned the multi-factor challenge.
  void onMfaChallengeAbandoned() => _emit(const Unauthenticated(), ++_generation);

  /// The address was verified; re-read the bootstrap context.
  Future<void> onEmailVerified() => _restoreAndBootstrap(++_generation);

  /// A tenant was bound or switched; re-read the bootstrap context.
  ///
  /// A SWITCH issues brand-new tokens, so the caller must adopt them through
  /// [SessionManager] before calling this.
  Future<void> onTenantSelected() => _restoreAndBootstrap(++_generation);

  /// Retries a failed bootstrap fetch.
  Future<void> retryBootstrap() => _restoreAndBootstrap(++_generation);

  /// The user signed out. Ends the session; the session-end listener produces
  /// the resulting state.
  Future<void> signOut() => _sessions.end(SessionEndReason.signedOut);

  /// The user could not satisfy the application lock and gave up the stored
  /// session so they can authenticate with a password instead.
  ///
  /// WHY THIS IS NOT [signOut]. Look at the evaluation order at the top of
  /// this file: the lock is checked at step 2, the credential is restored at
  /// step 3. On a cold locked launch the tokens are on disk and
  /// [SessionManager] still holds `NoSession`, so `end` short-circuits, wipes
  /// nothing, and emits nothing — the button renders, responds, and leaves the
  /// user on the lock with their credential intact. A warm process (locked
  /// after backgrounding, session already adopted) hid it, because there `end`
  /// has something to end. The state the fix has to survive is the one nobody
  /// had modelled.
  ///
  /// WHAT IT DOES NOT DO, on purpose:
  ///   * it does not restore first. Reading the credential in to end it would
  ///     create the authenticated session the lock exists to prevent;
  ///   * it does not mark the lock unlocked. Nothing here proves presence, and
  ///     [AppLockGate] must go on reporting locked for this process;
  ///   * it does not turn the lock preference off. That is the user's setting,
  ///     and standing it down when the device can no longer satisfy it is
  ///     already handled where availability is known;
  ///   * it does not grant protected access. The destination is
  ///     [Unauthenticated], which routes to sign-in and nowhere else.
  ///
  /// Idempotent — a second press re-clears an empty store and re-emits the
  /// same state.
  Future<void> abandonLockedSession() async {
    final generation = ++_generation;
    final abandoned = await _sessions.abandonPersistedSession();
    if (generation != _generation) {
      return;
    }
    final erased = abandoned is Success<void>;
    if (!erased) {
      // FAIL CLOSED, and say so. The credential may still be in the keystore,
      // so the user is not told it was removed: the state carries the storage
      // flag, the sign-in screen explains it, and the store itself refuses to
      // restore what it could not erase.
      _logger.error(
        'Locked session abandoned but the credential could not be erased.',
        fields: <String, Object?>{
          'failure': abandoned.failureOrNull?.diagnosticLabel,
        },
      );
    } else {
      _logger.info(
        'Locked session abandoned; the stored credential was erased.',
        fields: <String, Object?>{'outcome': 'erased'},
      );
    }
    _emit(Unauthenticated(secureStorageUnavailable: !erased), generation);
  }

  Future<void> _restoreAndBootstrap(int generation) async {
    _emit(const SessionRestoring(), generation);

    final restored = await _sessions.restore();
    if (generation != _generation) {
      return;
    }
    switch (restored) {
      case Failed<Object?>(:final failure):
        // The keystore would not answer. Treat it as no credential: the user
        // signs in again, and nothing protected renders in the meantime.
        _logger.warning(
          'Credential store unavailable at startup; treating the session as absent.',
          fields: <String, Object?>{'failure': failure.diagnosticLabel},
        );
        _emit(const Unauthenticated(secureStorageUnavailable: true), generation);
        return;
      case Success<Object?>(:final value):
        if (value == null) {
          _emit(const Unauthenticated(), generation);
          return;
        }
    }

    final tokens = _sessions.tokens;
    if (tokens == null) {
      _emit(const Unauthenticated(), generation);
      return;
    }
    if (tokens.isRefreshTokenExpired(_clock)) {
      // The whole chain has aged out; no request could succeed. End the
      // session here rather than discovering it on the first 401.
      await _sessions.end(SessionEndReason.expired);
      if (generation != _generation) {
        return;
      }
      _emit(const SessionExpired(SessionEndReason.expired), generation);
      return;
    }

    _emit(const BootstrapLoading(), generation);
    final bootstrap = await _bootstrap.load();
    if (generation != _generation) {
      return;
    }
    switch (bootstrap) {
      case Failed<BootstrapSnapshot>(:final failure):
        _emit(_stateForBootstrapFailure(failure), generation);
      case Success<BootstrapSnapshot>(:final value):
        _emit(_stateForSnapshot(value), generation);
    }
  }

  StartupState _stateForBootstrapFailure(Failure failure) => switch (failure) {
        SessionExpiredFailure(:final reason) => SessionExpired(reason),
        AuthenticationRequiredFailure() => const SessionExpired(SessionEndReason.expired),
        TenantSelectionRequiredFailure() => const TenantSelectionPending(<TenantOption>[]),
        // Everything else — bootstrap unavailable, capability resolution
        // unavailable, dependency unavailable, offline, timeout, contract
        // violation — blocks protected content and offers a retry.
        _ => BootstrapUnavailable(failure),
      };

  StartupState _stateForSnapshot(BootstrapSnapshot snapshot) {
    if (!snapshot.emailVerified) {
      return const EmailVerificationRequired();
    }
    switch (snapshot.binding) {
      case TenantSelectionRequired(:final choices):
        return TenantSelectionPending(choices);
      case TenantUnbound():
        // No usable membership. Same destination, different action.
        return const TenantSelectionPending(<TenantOption>[]);
      case TenantBound():
        break;
    }
    if (snapshot.capabilityState != CapabilityResolutionState.resolved) {
      return const BootstrapUnavailable(CapabilityResolutionUnavailableFailure());
    }
    if (snapshot.operatingEntityState == OperatingEntityState.unavailable ||
        snapshot.operatingEntityState == OperatingEntityState.unknown) {
      // The contracting legal person could not be established. Rendering a
      // regulated surface without knowing who the counterparty is would be a
      // claim the client cannot support.
      return const BootstrapUnavailable(
        DependencyUnavailableFailure(code: 'OPERATING_ENTITY_UNAVAILABLE'),
      );
    }
    return Ready(snapshot);
  }

  void _onSessionEnded(SessionEndReason reason) {
    final generation = ++_generation;
    _emit(
      reason == SessionEndReason.signedOut
          ? const Unauthenticated()
          : SessionExpired(reason),
      generation,
    );
  }

  void _emit(StartupState next, int generation) {
    if (generation != _generation) {
      return;
    }
    _state = next;
    _logger.info('Startup state.', fields: <String, Object?>{'stage': next.stage.name});
    if (!_states.isClosed) {
      _states.add(next);
    }
  }

  Future<void> dispose() async {
    await _sessionEndSubscription?.cancel();
    _sessionEndSubscription = null;
    await _states.close();
  }
}
