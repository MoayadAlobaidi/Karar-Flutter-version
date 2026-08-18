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
//   1. configuration    — nothing can be attempted without a validated endpoint;
//   2. security state   — LOAD the durable application-lock choice;
//   3. application lock — a locked device does not have its keystore read;
//   4. session restore  — from platform secure storage only;
//   5. bootstrap fetch  — the server's answer decides the rest.
//
// STEP 2 IS AN EXPLICIT STEP AND IT IS NEW. The lock choice used to be read
// inline at step 3, synchronously, out of the ordinary preference store, as
// `readBool(key) ?? false`. That store falls back to memory when the platform
// refuses to open it, an in-memory store holds no choice, and `?? false` turned
// the missing answer into "the user never asked for a lock" — so a device whose
// preference storage failed skipped the lock gate, restored the credential and
// rendered protected content. Loading the choice as its own step, from a store
// that reports UNAVAILABLE instead of inventing an answer, is what makes the
// difference visible: no answer produces LOCAL_SECURITY_STATE_UNAVAILABLE, and
// the sequence stops there having read no credential at all.
//
// Step 3 comes before step 4, which is why a locked launch holds a credential
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
import '../../core/security/token_store.dart';
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
  StreamSubscription<SessionEnded>? _sessionEndSubscription;

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

    // STEP 2. Establish the durable lock choice before anything opens the
    // keystore. A store that cannot answer stops the sequence here.
    final AppLockChoice choice = await _appLock.load();
    if (generation != _generation) {
      return;
    }
    switch (choice) {
      case AppLockChoiceUnavailable(:final failure):
        _logger.error(
          'Local security state could not be established; no security gate can '
          'be evaluated and startup stops here.',
          fields: <String, Object?>{'failure': failure.diagnosticLabel},
        );
        _emit(LocalSecurityStateUnavailable(failure), generation);
        return;
      case AppLockChoiceNotLoaded():
        // `load` never returns this. Handled rather than asserted away, so a
        // future change that forgets to load fails CLOSED instead of falling
        // through to the restore below.
        _emit(
          const LocalSecurityStateUnavailable(
            LocalSecurityStateUnavailableFailure(
              operation: LocalSecurityStateOperation.read,
            ),
          ),
          generation,
        );
        return;
      case AppLockChoiceKnown():
        break;
    }

    // STEP 3.
    if (_appLock.isLocked) {
      _emit(const AppLocked(), generation);
      return;
    }

    await _restoreAndBootstrap(generation);
  }

  /// The platform authenticated the user against the application lock.
  ///
  /// Re-runs the whole sequence when configuration was never loaded, and also
  /// when the lock CHOICE is not durably known — an unlock proves presence, it
  /// does not establish what the security state says, and continuing straight
  /// to the restore would skip step 2 on exactly the launch where it matters.
  Future<void> unlock() async {
    _appLock.markUnlocked();
    if (_configuration == null || !_appLock.isChoiceKnown) {
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
  /// the resulting state from the typed outcome the ending carried.
  Future<void> signOut() async {
    await _sessions.end(SessionEndReason.signedOut);
  }

  /// Re-attempts a credential destruction that could not be completed.
  ///
  /// The recovery for [SecurityRecoveryBlocked]. It repeats the same operation
  /// rather than doing something weaker: the blocked state exists because the
  /// erase and the abandonment record both failed, and the only thing that
  /// resolves it is one of them succeeding. A store that has recovered
  /// finishes the job here; one that has not leaves the state exactly where it
  /// was, which is the honest answer and is not a loop.
  Future<void> retrySecurityRecovery() => abandonLockedSession();

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
    final SessionAbandonmentOutcome abandoned =
        await _sessions.abandonPersistedSession();
    if (generation != _generation) {
      return;
    }
    _emit(_stateForAbandonment(abandoned), generation);
  }

  /// The destination for one abandonment outcome.
  ///
  /// Three destinations for five outcomes, and the grouping is the whole
  /// fail-closed rule:
  ///
  ///   * the credential is GONE — an ordinary signed-out state. The claim is
  ///     true, so it is made;
  ///   * the credential SURVIVED but a durable marker refuses it — signed out,
  ///     flagged. The user is not told it was removed, because it was not, and
  ///     the store will refuse to restore it on every later launch;
  ///   * neither could be confirmed — BLOCKED. Not a sign-in screen: offering
  ///     one would present the abandonment as complete, and would put a
  ///     credential-writing path one authentication away from a store that
  ///     currently cannot record anything.
  StartupState _stateForAbandonment(SessionAbandonmentOutcome outcome) =>
      switch (outcome) {
        CredentialErased() || CredentialErasedMarkerRetained() =>
          const Unauthenticated(),
        CredentialPersistedButDurablyInvalidated() =>
          const Unauthenticated(secureStorageUnavailable: true),
        AbandonmentNotDurable() || AbandonmentSecurityStateUnavailable() =>
          SecurityRecoveryBlocked(outcome),
      };

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

  void _onSessionEnded(SessionEnded event) {
    final generation = ++_generation;
    if (event.reason != SessionEndReason.signedOut) {
      // A session that ENDED under it — expiry, revocation, refresh-token reuse
      // — routes by reason. The credential is worthless either way, so a failed
      // erase does not change the destination.
      _emit(SessionExpired(event.reason), generation);
      return;
    }
    // A deliberate sign-out is a claim about what happened to the credential,
    // so it routes by OUTCOME. Emitting a clean `Unauthenticated` after an
    // erase that failed and an abandonment that was never recorded would be the
    // client asserting something it cannot show.
    _emit(_stateForAbandonment(event.outcome), generation);
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
