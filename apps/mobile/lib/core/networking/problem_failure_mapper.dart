// PURE DART ONLY.
//
// The single place an HTTP status or a problem code becomes a typed failure.
// Nothing above the data layer sees a status code; nothing above the data
// layer string-matches a server message.
//
// Mapping is CODE-FIRST: the machine-readable `code` decides, and the status
// is the fallback for a response that carries no code (or a code this build
// does not yet know). That ordering means a contract addition is a one-branch
// change here and requires no change anywhere else.
import '../errors/failure.dart';
import 'problem_details.dart';

/// Maps transport outcomes onto the typed failure taxonomy.
final class ProblemFailureMapper {
  const ProblemFailureMapper();

  /// Maps a non-2xx response.
  ///
  /// The server echoes the caller's correlation id as `requestId`; when it is
  /// present it wins, because it is the value the server logged against.
  Failure map({
    required int statusCode,
    ProblemDetails? problem,
    String? correlationId,
  }) {
    final joined = problem?.requestId ?? correlationId;
    final code = problem?.code;
    if (code != null) {
      final byCode = _mapCode(code, problem: problem, correlationId: joined);
      if (byCode != null) {
        return byCode;
      }
    }
    return _mapStatus(
      statusCode,
      code: code,
      problem: problem,
      correlationId: joined,
    );
  }

  Failure? _mapCode(
    String code, {
    ProblemDetails? problem,
    String? correlationId,
  }) => switch (code) {
    ApiErrorCode.authenticationRequired => AuthenticationRequiredFailure(
      code: code,
      correlationId: correlationId,
    ),
    ApiErrorCode.sessionExpired => SessionExpiredFailure(
      code: code,
      correlationId: correlationId,
      reason: SessionEndReason.expired,
    ),
    ApiErrorCode.notAuthorized ||
    ApiErrorCode.membershipRequired => NotAuthorizedFailure(
      code: code,
      correlationId: correlationId,
      requirement: problem?.reason,
    ),
    ApiErrorCode.operationRestricted => OperationRestrictedFailure(
      code: code,
      correlationId: correlationId,
      restriction: problem?.reason,
    ),
    ApiErrorCode.consentRequired => ConsentRequiredFailure(
      code: code,
      correlationId: correlationId,
      purposeRef: problem?.reason,
    ),
    ApiErrorCode.reConsentRequired => ReConsentRequiredFailure(
      code: code,
      correlationId: correlationId,
      purposeRef: problem?.reason,
    ),
    // A tenant binding is the remedy for both codes, and the startup
    // machine routes them to the same destination.
    ApiErrorCode.tenantSelectionRequired ||
    ApiErrorCode.tenantBindingRequired => TenantSelectionRequiredFailure(
      code: code,
      correlationId: correlationId,
    ),
    // The 503 path. Distinct from a 200 whose capability list is empty:
    // that is a stated answer and reaches READY, while this blocks
    // startup and offers a retry when the server said one would help.
    ApiErrorCode.bootstrapUnavailable => BootstrapUnavailableFailure(
      code: code,
      correlationId: correlationId,
      retryable: problem?.retryable,
    ),
    ApiErrorCode.capabilityResolutionUnavailable =>
      CapabilityResolutionUnavailableFailure(
        code: code,
        correlationId: correlationId,
      ),
    ApiErrorCode.dependencyUnavailable ||
    ApiErrorCode.jurisdictionDeclarationUnavailable =>
      DependencyUnavailableFailure(
        code: code,
        correlationId: correlationId,
        retryable: problem?.retryable,
      ),
    ApiErrorCode.declarationNotPermitted => OperationRestrictedFailure(
      code: code,
      correlationId: correlationId,
      restriction: problem?.reason,
    ),
    ApiErrorCode.rateLimited => RateLimitedFailure(
      code: code,
      correlationId: correlationId,
      retryAfter: problem?.retryAfter,
    ),
    ApiErrorCode.bindingConflict ||
    ApiErrorCode.membershipRevokedConcurrently ||
    ApiErrorCode.invitationNotRedeemable ||
    ApiErrorCode.alreadyMember ||
    ApiErrorCode.invalidStatusTransition => ConflictFailure(
      code: code,
      correlationId: correlationId,
      reason: problem?.reason,
      nextOrdinal: problem?.nextOrdinal,
    ),
    ApiErrorCode.invalidTenantSelection ||
    ApiErrorCode.invalidProfileField ||
    ApiErrorCode.noApprovedFieldChanges ||
    ApiErrorCode.invalidInvitationInput ||
    ApiErrorCode.invalidJurisdictionDeclaration => InvalidRequestFailure(
      code: code,
      correlationId: correlationId,
      fields: problem?.fields ?? const <String>[],
    ),
    ApiErrorCode.invitationNotFound ||
    ApiErrorCode.profileNotFound ||
    ApiErrorCode.tenantNotFound => NotFoundFailure(
      code: code,
      correlationId: correlationId,
    ),
    // An unrecognised code falls through to status mapping. It is never
    // silently treated as success.
    _ => null,
  };

  Failure _mapStatus(
    int statusCode, {
    String? code,
    ProblemDetails? problem,
    String? correlationId,
  }) => switch (statusCode) {
    400 || 422 => InvalidRequestFailure(
      code: code,
      correlationId: correlationId,
      fields: problem?.fields ?? const <String>[],
    ),
    401 => AuthenticationRequiredFailure(
      code: code,
      correlationId: correlationId,
    ),
    403 => NotAuthorizedFailure(
      code: code,
      correlationId: correlationId,
      requirement: problem?.reason,
    ),
    404 => NotFoundFailure(code: code, correlationId: correlationId),
    409 => ConflictFailure(
      code: code,
      correlationId: correlationId,
      reason: problem?.reason,
      nextOrdinal: problem?.nextOrdinal,
    ),
    429 => RateLimitedFailure(
      code: code,
      correlationId: correlationId,
      retryAfter: problem?.retryAfter,
    ),
    // 502 and 504 are an upstream that did not answer. 503 without a code
    // is the server refusing because a dependency is down; the contract
    // uses it for exactly that, and it fails closed.
    502 || 503 || 504 => DependencyUnavailableFailure(
      code: code,
      correlationId: correlationId,
      retryable: problem?.retryable,
    ),
    _ => UnexpectedFailure(code: code, correlationId: correlationId),
  };
}
