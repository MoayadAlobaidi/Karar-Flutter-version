// PURE DART ONLY. This file is imported by feature domain layers, so it must
// never gain an import of Flutter, Riverpod, GoRouter, Dio, a storage plugin,
// a generated DTO, or a JSON library.
//
// `Failure` is the single typed error currency of the application. Repository
// ports return `Result<T>` (see result.dart); nothing above the data layer
// throws for an expected outcome, and nothing above the data layer inspects an
// HTTP status code.
import 'package:meta/meta.dart';

/// The base of the typed failure taxonomy.
///
/// Sealed so that every presentation-layer `switch` over a failure is checked
/// for exhaustiveness at compile time: a new failure kind cannot be silently
/// swallowed by a default branch.
@immutable
sealed class Failure {
  const Failure({this.code, this.correlationId});

  /// Machine-readable reason supplied by the server (RFC 7807 `code`), when
  /// one was present. Never a message intended for a person, and never
  /// sensitive.
  final String? code;

  /// The request correlation identifier, for support and log join-up. Opaque
  /// and non-sensitive by construction.
  final String? correlationId;

  /// Short, non-sensitive diagnostic label. Safe to log; never contains user
  /// input, credentials, or response bodies.
  String get diagnosticLabel;

  @override
  String toString() => '$runtimeType(code: $code, correlationId: $correlationId)';
}

/// No valid session. The caller must authenticate before retrying.
final class AuthenticationRequiredFailure extends Failure {
  const AuthenticationRequiredFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'authentication_required';
}

/// The session is authenticated but the principal lacks the permission.
final class NotAuthorizedFailure extends Failure {
  const NotAuthorizedFailure({super.code, super.correlationId, this.requirement});

  /// The named requirement the server reported (permission or membership).
  /// Non-sensitive.
  final String? requirement;

  @override
  String get diagnosticLabel => 'not_authorized';
}

/// Policy or capability state forbids the operation even though the principal
/// is authenticated and otherwise permitted.
final class OperationRestrictedFailure extends Failure {
  const OperationRestrictedFailure({super.code, super.correlationId, this.restriction});

  /// The restriction identifier reported by the server. Non-sensitive.
  final String? restriction;

  @override
  String get diagnosticLabel => 'operation_restricted';
}

/// Processing requires a consent grant that does not exist or was withdrawn.
final class ConsentRequiredFailure extends Failure {
  const ConsentRequiredFailure({super.code, super.correlationId, this.purposeRef});

  final String? purposeRef;

  @override
  String get diagnosticLabel => 'consent_required';
}

/// A materially changed document version is in force; the existing grant no
/// longer permits processing until it is re-accepted.
final class ReConsentRequiredFailure extends Failure {
  const ReConsentRequiredFailure({super.code, super.correlationId, this.purposeRef});

  final String? purposeRef;

  @override
  String get diagnosticLabel => 'reconsent_required';
}

/// The session holds no tenant binding and more than one membership is
/// available, so the principal must choose.
final class TenantSelectionRequiredFailure extends Failure {
  const TenantSelectionRequiredFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'tenant_selection_required';
}

/// A context resolution could not be PERFORMED. Protected surfaces stay
/// closed until it can be.
///
/// This is NOT the same condition as a successful resolution that had nothing
/// to report. The server answers the latter with 200 and an explicit
/// `RESOLVED` state, which reaches READY with an empty capability list; only
/// this failure blocks startup.
final class BootstrapUnavailableFailure extends Failure {
  const BootstrapUnavailableFailure({super.code, super.correlationId, this.retryable});

  /// Whether the server said a retry could change the answer. Null when it
  /// did not say — absent rather than guessed, so the client offers a retry
  /// only when one is meaningful.
  final bool? retryable;

  @override
  String get diagnosticLabel => 'bootstrap_unavailable';
}

/// Capability resolution did not complete. Capability-gated surfaces fail
/// closed rather than assuming a capability is available.
final class CapabilityResolutionUnavailableFailure extends Failure {
  const CapabilityResolutionUnavailableFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'capability_resolution_unavailable';
}

/// The session was valid and is no longer: expired, revoked, or terminated by
/// refresh-token reuse detection. Local credentials have been cleared.
final class SessionExpiredFailure extends Failure {
  const SessionExpiredFailure({super.code, super.correlationId, this.reason = SessionEndReason.expired});

  final SessionEndReason reason;

  @override
  String get diagnosticLabel => 'session_expired';
}

/// Why a session ended. Drives the message shown and nothing else; every
/// value routes to the same safe destination.
enum SessionEndReason {
  /// The access and refresh chain aged out.
  expired,

  /// Refresh returned a terminal failure.
  refreshRejected,

  /// A refresh token was presented twice. The server treats this as theft.
  refreshTokenReuseDetected,

  /// The principal or another session revoked this one.
  revoked,

  /// The caller signed out.
  signedOut,
}

/// A request budget is exhausted.
final class RateLimitedFailure extends Failure {
  const RateLimitedFailure({super.code, super.correlationId, this.retryAfter});

  /// Server-advertised wait before retrying, when the response carried one.
  final Duration? retryAfter;

  @override
  String get diagnosticLabel => 'rate_limited';
}

/// A dependency the server needs is unavailable, so the request was refused
/// rather than processed on partial state. Fails closed.
final class DependencyUnavailableFailure extends Failure {
  const DependencyUnavailableFailure({super.code, super.correlationId, this.retryable});

  /// See [BootstrapUnavailableFailure.retryable].
  final bool? retryable;

  @override
  String get diagnosticLabel => 'dependency_unavailable';
}

/// The request was rejected as malformed or outside policy. Carries field
/// identifiers only, never the submitted values.
final class InvalidRequestFailure extends Failure {
  const InvalidRequestFailure({super.code, super.correlationId, this.fields = const <String>[]});

  final List<String> fields;

  @override
  String get diagnosticLabel => 'invalid_request';
}

/// The addressed resource does not exist, or is not visible to this
/// principal. The two cases are deliberately indistinguishable.
final class NotFoundFailure extends Failure {
  const NotFoundFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'not_found';
}

/// The resource changed under the caller, or the requested transition is not
/// legal from the current state.
final class ConflictFailure extends Failure {
  const ConflictFailure({super.code, super.correlationId, this.reason});

  final String? reason;

  @override
  String get diagnosticLabel => 'conflict';
}

/// No usable network path. Distinct from a timeout: nothing was sent.
final class OfflineFailure extends Failure {
  const OfflineFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'offline';
}

/// A typed timeout elapsed. The outcome of the request is unknown, so an
/// unsafe request is never retried automatically.
final class TimeoutFailure extends Failure {
  const TimeoutFailure({super.code, super.correlationId, required this.phase});

  final TimeoutPhase phase;

  @override
  String get diagnosticLabel => 'timeout_${phase.name}';
}

/// Which timeout elapsed.
enum TimeoutPhase { connect, send, receive }

/// The caller cancelled the request. Not an error condition.
final class RequestCancelledFailure extends Failure {
  const RequestCancelledFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'request_cancelled';
}

/// A token refresh succeeded while a non-idempotent request was in flight.
///
/// The request was NOT replayed: repeating an unsafe operation whose outcome
/// is unknown risks a duplicate side effect. The session is now valid, so the
/// caller may reissue the request deliberately — attach an idempotency key if
/// automatic replay is wanted.
final class UnsafeRequestNotReplayedFailure extends Failure {
  const UnsafeRequestNotReplayedFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'unsafe_request_not_replayed';
}

/// Platform secure storage could not be read or written. Treated as a closed
/// door: the application behaves as if no credential exists.
final class SecureStorageUnavailableFailure extends Failure {
  const SecureStorageUnavailableFailure({super.code, super.correlationId, required this.operation});

  final SecureStorageOperation operation;

  @override
  String get diagnosticLabel => 'secure_storage_unavailable_${operation.name}';
}

/// Which secure-storage operation failed.
enum SecureStorageOperation { read, write, delete }

/// Required build configuration is absent or invalid. A production build in
/// this state must not start.
final class ConfigurationInvalidFailure extends Failure {
  const ConfigurationInvalidFailure({super.code, super.correlationId, required this.violations});

  /// Machine-readable violation identifiers. Never contains a configured
  /// value, only the name of what was wrong.
  final List<String> violations;

  @override
  String get diagnosticLabel => 'configuration_invalid';
}

/// The response did not match the contract: an absent required field, a value
/// of the wrong shape, or a body that is not the declared media type.
final class ContractViolationFailure extends Failure {
  const ContractViolationFailure({super.code, super.correlationId, this.location});

  /// Where the violation was detected, as a path expression. Field names
  /// only, never values.
  final String? location;

  @override
  String get diagnosticLabel => 'contract_violation';
}

/// Anything the taxonomy above does not name. Carries no payload on purpose:
/// an unclassified failure must not become a channel for leaking a body.
final class UnexpectedFailure extends Failure {
  const UnexpectedFailure({super.code, super.correlationId});

  @override
  String get diagnosticLabel => 'unexpected';
}
