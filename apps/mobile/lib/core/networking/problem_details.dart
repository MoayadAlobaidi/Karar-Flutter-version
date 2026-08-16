// PURE DART ONLY.
//
// RFC 7807 problem documents. The server answers every error with
// `application/problem+json` carrying a machine-readable `code`; the client
// keys on `code` and never on prose.
//
// `detail` and `title` are parsed because the media type defines them, but
// they are SERVER-AUTHORED TEXT: they are never written to a log and never
// used to make a decision. Only `code`, `status` and `reason` drive behaviour.
import 'package:meta/meta.dart';

/// A parsed problem document.
@immutable
final class ProblemDetails {
  const ProblemDetails({
    required this.status,
    this.type,
    this.title,
    this.code,
    this.detail,
    this.reason,
    this.requestId,
    this.retryable,
    this.fields = const <String>[],
    this.retryAfter,
  });

  /// Parses a decoded JSON body. Returns null when the body is not a problem
  /// document, so the caller falls back to status-only mapping rather than
  /// inventing a code.
  static ProblemDetails? tryParse(Object? body, {required int statusCode}) {
    if (body is! Map<String, Object?>) {
      return null;
    }
    final code = body['code'];
    final type = body['type'];
    final title = body['title'];
    if (code is! String && type is! String && title is! String) {
      return null;
    }
    final declaredStatus = body['status'];
    final rawFields = body['fields'];
    final retryable = body['retryable'];
    return ProblemDetails(
      status: declaredStatus is int ? declaredStatus : statusCode,
      type: type is String ? type : null,
      title: title is String ? title : null,
      code: code is String ? code : null,
      detail: body['detail'] is String ? body['detail']! as String : null,
      reason: body['reason'] is String ? body['reason']! as String : null,
      requestId: body['requestId'] is String ? body['requestId']! as String : null,
      retryable: retryable is bool ? retryable : null,
      fields: rawFields is List
          ? <String>[
              for (final entry in rawFields)
                if (entry is String) entry,
            ]
          : const <String>[],
    );
  }

  final int status;
  final String? type;

  /// Server-authored. Do not log; do not branch on.
  final String? title;

  /// The machine-readable reason. This is the only field behaviour keys on.
  final String? code;

  /// Server-authored. Do not log; do not branch on.
  final String? detail;

  /// A finer-grained machine-readable reason where the contract defines one
  /// (permission name, redemption denial reason).
  final String? reason;

  /// The caller's own correlation id, echoed by the server so a client report
  /// joins to the server log line that holds the cause. The cause itself never
  /// crosses the edge.
  final String? requestId;

  /// Whether a retry could change the answer. Null when the server did not
  /// say; the contract states it is absent rather than guessed.
  final bool? retryable;

  /// Field identifiers a validation failure names. Identifiers only — the
  /// server never echoes submitted values and neither does this type.
  final List<String> fields;

  /// Server-advertised wait before retrying, from the `Retry-After` header.
  final Duration? retryAfter;

  ProblemDetails withRetryAfter(Duration? value) => ProblemDetails(
        status: status,
        type: type,
        title: title,
        code: code,
        detail: detail,
        reason: reason,
        requestId: requestId,
        retryable: retryable,
        fields: fields,
        retryAfter: value,
      );

  /// Safe to log: identifiers only, no server prose.
  @override
  String toString() =>
      'ProblemDetails(status: $status, code: $code, reason: $reason, retryable: $retryable)';
}

/// The machine-readable codes the client maps to typed failures.
///
/// Adding a code is a one-line change here plus one branch in
/// `ProblemFailureMapper`. The server contract is the source of truth; an
/// unknown code falls back to status-based mapping rather than being ignored.
abstract final class ApiErrorCode {
  static const String authenticationRequired = 'AUTHENTICATION_REQUIRED';
  static const String sessionExpired = 'SESSION_EXPIRED';
  static const String notAuthorized = 'NOT_AUTHORIZED';
  static const String membershipRequired = 'MEMBERSHIP_REQUIRED';
  static const String operationRestricted = 'OPERATION_RESTRICTED';
  static const String consentRequired = 'CONSENT_REQUIRED';
  static const String reConsentRequired = 'RECONSENT_REQUIRED';
  static const String tenantSelectionRequired = 'TENANT_SELECTION_REQUIRED';
  static const String bootstrapUnavailable = 'BOOTSTRAP_UNAVAILABLE';
  static const String capabilityResolutionUnavailable = 'CAPABILITY_RESOLUTION_UNAVAILABLE';
  static const String dependencyUnavailable = 'DEPENDENCY_UNAVAILABLE';
  static const String rateLimited = 'RATE_LIMITED';
  static const String bindingConflict = 'BINDING_CONFLICT';
  static const String membershipRevokedConcurrently = 'MEMBERSHIP_REVOKED_CONCURRENTLY';
  static const String invalidTenantSelection = 'INVALID_TENANT_SELECTION';
  static const String invalidProfileField = 'INVALID_PROFILE_FIELD';
  static const String noApprovedFieldChanges = 'NO_APPROVED_FIELD_CHANGES';
  static const String invalidInvitationInput = 'INVALID_INVITATION_INPUT';
  static const String invitationNotFound = 'INVITATION_NOT_FOUND';
  static const String invitationNotRedeemable = 'INVITATION_NOT_REDEEMABLE';
  static const String alreadyMember = 'ALREADY_MEMBER';
  static const String invalidStatusTransition = 'INVALID_STATUS_TRANSITION';
  static const String profileNotFound = 'PROFILE_NOT_FOUND';
  static const String tenantNotFound = 'TENANT_NOT_FOUND';

  // Jurisdiction self-declaration.
  static const String invalidJurisdictionDeclaration = 'INVALID_JURISDICTION_DECLARATION';
  static const String tenantBindingRequired = 'TENANT_BINDING_REQUIRED';
  static const String declarationNotPermitted = 'DECLARATION_NOT_PERMITTED';
  static const String jurisdictionDeclarationUnavailable =
      'JURISDICTION_DECLARATION_UNAVAILABLE';
}
