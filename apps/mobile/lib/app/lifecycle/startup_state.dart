// PURE DART ONLY.
//
// THE STARTUP STATE MACHINE'S VOCABULARY.
//
// There is exactly ONE authority on what the application is doing before the
// first protected pixel: `StartupCoordinator`. Widgets do not decide. Route
// redirects do not decide. A feature does not decide. Everything reads the
// state this file defines and maps it to one deterministic destination.
//
// Every state below has:
//   * one route (see routing/startup_route_resolver.dart);
//   * one safe recovery path (see the `recovery` getter);
//   * test coverage of the transitions into and out of it.
import 'package:meta/meta.dart';

import '../../core/errors/failure.dart';
import '../../core/security/token_store.dart';
import 'bootstrap_snapshot.dart';

/// A stable identifier per state, for logging, routing tables and tests.
enum StartupStage {
  configLoading,
  configInvalid,
  localSecurityStateUnavailable,
  securityRecoveryBlocked,
  appLocked,
  unauthenticated,
  sessionRestoring,
  emailVerificationRequired,
  mfaChallengeRequired,
  tenantSelectionRequired,
  bootstrapLoading,
  bootstrapUnavailable,
  ready,
  sessionExpired,
}

/// The one action that moves a stuck state forward.
///
/// Naming the recovery in the state itself is what makes "no dead ends"
/// checkable: a test asserts every stage has one, and a screen renders it.
enum StartupRecovery {
  /// Nothing to do; the coordinator is already working.
  waitForCoordinator,

  /// Re-run the whole startup sequence.
  restart,

  /// Prove presence to the platform, then continue.
  unlockApplication,

  /// Present the sign-in flow.
  authenticate,

  /// Complete the outstanding verification step.
  completeVerification,

  /// Complete the outstanding multi-factor challenge.
  completeChallenge,

  /// Choose a tenant, or redeem an invitation when there is none to choose.
  selectTenant,

  /// Retry the bootstrap fetch.
  retryBootstrap,

  /// Re-read local security state and continue the startup sequence.
  retrySecurityState,

  /// Re-attempt the credential destruction that could not be completed.
  retrySecurityRecovery,

  /// Reinstall or rebuild with correct configuration. Not recoverable at
  /// runtime, and deliberately not disguised as though it were.
  correctBuildConfiguration,

  /// Normal operation.
  none,
}

/// What the application is doing before protected content may render.
@immutable
sealed class StartupState {
  const StartupState();

  StartupStage get stage;

  StartupRecovery get recovery;

  /// True only when session AND bootstrap have both resolved successfully.
  /// Protected content renders on this and on nothing else.
  bool get isReady => stage == StartupStage.ready;

  /// True while the coordinator is working and the UI should show progress
  /// rather than an actionable screen.
  bool get isTransient =>
      stage == StartupStage.configLoading ||
      stage == StartupStage.sessionRestoring ||
      stage == StartupStage.bootstrapLoading;

  @override
  String toString() => '${stage.name}()';
}

/// Reading and validating build configuration. The first state, always.
final class ConfigLoading extends StartupState {
  const ConfigLoading();

  @override
  StartupStage get stage => StartupStage.configLoading;

  @override
  StartupRecovery get recovery => StartupRecovery.waitForCoordinator;
}

/// Build configuration is absent or invalid. Terminal for this launch.
///
/// A production build reaching this state has failed to start, which is the
/// intended outcome: it must never silently continue against a local or
/// development endpoint.
final class ConfigInvalid extends StartupState {
  const ConfigInvalid(this.violations);

  /// Machine-readable violation identifiers. Never a configured VALUE.
  final List<String> violations;

  @override
  StartupStage get stage => StartupStage.configInvalid;

  @override
  StartupRecovery get recovery => StartupRecovery.correctBuildConfiguration;

  @override
  String toString() => 'configInvalid(${violations.join(', ')})';
}

/// LOCAL SECURITY STATE COULD NOT BE ESTABLISHED.
///
/// The store holding the application-lock choice would not answer, or answered
/// with something that is not a choice. There is therefore no way to know
/// whether this device is meant to be locked.
///
/// It is emitted BEFORE the credential is restored, and that is the whole
/// point. The alternative — the behaviour this state replaces — was to read
/// the choice as `?? false`, conclude the lock was off, restore the session
/// and render protected content, on a device whose storage had just failed.
/// A gate that cannot be evaluated has not been passed.
///
/// It has its OWN route. Sending the user to `/lock` would ask them to satisfy
/// a lock nothing established they had, and sending them to `/sign-in` would
/// invite them to authenticate into the session this state exists to withhold;
/// either would also risk oscillating against the single redirect. The
/// recovery is to re-read the store and re-run startup.
final class LocalSecurityStateUnavailable extends StartupState {
  const LocalSecurityStateUnavailable(this.failure);

  /// Why the store could not be consulted. Non-sensitive by construction, and
  /// never carries a stored value.
  final Failure failure;

  @override
  StartupStage get stage => StartupStage.localSecurityStateUnavailable;

  @override
  StartupRecovery get recovery => StartupRecovery.retrySecurityState;

  @override
  String toString() => 'localSecurityStateUnavailable(${failure.diagnosticLabel})';
}

/// A CREDENTIAL WAS GIVEN UP AND NEITHER ITS DESTRUCTION NOR ITS ABANDONMENT
/// COULD BE CONFIRMED.
///
/// Reached only for [AbandonmentNotDurable] and
/// [AbandonmentSecurityStateUnavailable]: the secure erase failed AND nothing
/// durable records that the user walked away. Every other outcome — including
/// a failed erase whose marker held — is survivable and routes to
/// [Unauthenticated].
///
/// It is NOT an ordinary sign-in. Presenting one would tell the user the
/// session was safely abandoned when the client cannot show that it was, and
/// would put a credential-restoring path one successful authentication away
/// from a store that is currently unable to record anything. No protected
/// content renders, no credential is restored, and the recovery is to retry
/// the destruction.
///
/// THE HARD BOUNDARY. This holds for the life of the process. A restart cannot
/// be defended against locally — nothing durable records the abandonment, by
/// definition — so the state does not pretend otherwise; see the in-process
/// latch in `core/security/token_store.dart`. Server-side revocation is the
/// only real remedy and is not this layer's to perform.
final class SecurityRecoveryBlocked extends StartupState {
  const SecurityRecoveryBlocked(this.outcome);

  /// What actually happened to the credential.
  final SessionAbandonmentOutcome outcome;

  @override
  StartupStage get stage => StartupStage.securityRecoveryBlocked;

  @override
  StartupRecovery get recovery => StartupRecovery.retrySecurityRecovery;

  @override
  String toString() => 'securityRecoveryBlocked(${outcome.diagnosticLabel})';
}

/// The user asked for an application lock and this process is not unlocked.
final class AppLocked extends StartupState {
  const AppLocked();

  @override
  StartupStage get stage => StartupStage.appLocked;

  @override
  StartupRecovery get recovery => StartupRecovery.unlockApplication;
}

/// Reading any stored credential.
final class SessionRestoring extends StartupState {
  const SessionRestoring();

  @override
  StartupStage get stage => StartupStage.sessionRestoring;

  @override
  StartupRecovery get recovery => StartupRecovery.waitForCoordinator;
}

/// No credential. The ordinary signed-out state.
final class Unauthenticated extends StartupState {
  const Unauthenticated({this.secureStorageUnavailable = false});

  /// True when the keystore would not do as it was asked and the client is
  /// therefore TREATING the user as signed out. Distinguished so the sign-in
  /// screen can explain why a previously working session vanished; the
  /// behaviour is identical either way, which is the fail-closed part.
  ///
  /// Set for a read that failed, and also for an ERASE that failed — the
  /// second case is the one where the credential may still be on disk, so this
  /// flag is what stops the client claiming a clean removal it cannot prove.
  final bool secureStorageUnavailable;

  @override
  StartupStage get stage => StartupStage.unauthenticated;

  @override
  StartupRecovery get recovery => StartupRecovery.authenticate;
}

/// A credential existed and is no longer usable.
final class SessionExpired extends StartupState {
  const SessionExpired(this.reason);

  final SessionEndReason reason;

  @override
  StartupStage get stage => StartupStage.sessionExpired;

  @override
  StartupRecovery get recovery => StartupRecovery.authenticate;

  @override
  String toString() => 'sessionExpired(${reason.name})';
}

/// Sign-in produced a multi-factor challenge instead of a session.
///
/// The challenge token itself is NOT held here. It is a credential; the
/// feature that received it owns it for the few minutes it lives.
final class MfaChallengeRequired extends StartupState {
  const MfaChallengeRequired();

  @override
  StartupStage get stage => StartupStage.mfaChallengeRequired;

  @override
  StartupRecovery get recovery => StartupRecovery.completeChallenge;
}

/// The account exists but its address is unverified.
final class EmailVerificationRequired extends StartupState {
  const EmailVerificationRequired();

  @override
  StartupStage get stage => StartupStage.emailVerificationRequired;

  @override
  StartupRecovery get recovery => StartupRecovery.completeVerification;
}

/// Fetching the bootstrap context.
final class BootstrapLoading extends StartupState {
  const BootstrapLoading();

  @override
  StartupStage get stage => StartupStage.bootstrapLoading;

  @override
  StartupRecovery get recovery => StartupRecovery.waitForCoordinator;
}

/// A context resolution could not be PERFORMED.
///
/// Reached for a 503 bootstrap failure, for an operating-entity read that did
/// not resolve, and for a capability set this build cannot classify. All three
/// fail closed: no protected content renders.
///
/// NOT reached for a successful resolution that had nothing to report. A 200
/// carrying an explicit RESOLVED state and an empty capability list is a
/// stated answer and reaches [Ready]; conflating the two would turn a healthy
/// account with no enabled services into an outage screen.
final class BootstrapUnavailable extends StartupState {
  const BootstrapUnavailable(this.failure);

  final Failure failure;

  /// Whether the server said a retry could change the answer. Null when it did
  /// not say, which is treated as "retry is worth offering".
  bool? get retryable => switch (failure) {
        BootstrapUnavailableFailure(:final retryable) => retryable,
        DependencyUnavailableFailure(:final retryable) => retryable,
        _ => null,
      };

  @override
  StartupStage get stage => StartupStage.bootstrapUnavailable;

  /// A retry is offered unless the server said it cannot help, in which case
  /// the only honest action is to start over.
  @override
  StartupRecovery get recovery =>
      retryable == false ? StartupRecovery.restart : StartupRecovery.retryBootstrap;

  @override
  String toString() => 'bootstrapUnavailable(${failure.diagnosticLabel})';
}

/// The session holds no tenant binding and cannot be bound automatically.
///
/// [choices] is empty when the principal has no usable membership at all; the
/// destination is the same screen, whose action is then to redeem an
/// invitation rather than to pick from a list.
final class TenantSelectionPending extends StartupState {
  const TenantSelectionPending(this.choices);

  final List<TenantOption> choices;

  bool get hasChoices => choices.isNotEmpty;

  @override
  StartupStage get stage => StartupStage.tenantSelectionRequired;

  @override
  StartupRecovery get recovery => StartupRecovery.selectTenant;

  @override
  String toString() => 'tenantSelectionRequired(${choices.length} choices)';
}

/// Session and bootstrap have both resolved. The only state in which
/// protected content may render.
final class Ready extends StartupState {
  const Ready(this.bootstrap);

  final BootstrapSnapshot bootstrap;

  @override
  StartupStage get stage => StartupStage.ready;

  @override
  StartupRecovery get recovery => StartupRecovery.none;
}
