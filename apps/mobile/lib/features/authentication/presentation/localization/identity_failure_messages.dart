// FAILURE -> MESSAGE, FOR THE IDENTITY CONTEXT.
//
// The switch is exhaustive over the sealed `Failure` hierarchy, so a new
// failure kind will not compile until it has been given a message here. That
// is the point: an unhandled failure must not fall through to a default that
// says nothing useful, or worse, says something wrong.
//
// WHAT NEVER REACHES A SCREEN: `failure.code`, `failure.diagnosticLabel`, an
// RFC 7807 `detail`, a status code, a field VALUE, or any address. The
// correlation identifier is the one exception — it is opaque and non-sensitive
// by construction, and is shown only as a support reference through the shared
// `stateErrorReference` string.
import '../../../../core/errors/failure.dart';
import '../../domain/value_objects/email_address.dart';
import '../../domain/value_objects/password.dart';
import 'identity_strings.dart';

/// The message for [failure] in the identity flows.
String identityFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.failureSessionEnded,
      SessionExpiredFailure() => strings.failureSessionEnded,
      NotAuthorizedFailure() || OperationRestrictedFailure() => strings.failureNotPermitted,
      ConsentRequiredFailure() || ReConsentRequiredFailure() => strings.failureConsentRequired,
      TenantSelectionRequiredFailure() => strings.failureTenantSelection,
      BootstrapUnavailableFailure() ||
      CapabilityResolutionUnavailableFailure() ||
      DependencyUnavailableFailure() =>
        strings.failureServiceUnavailable,
      RateLimitedFailure() => strings.failureRateLimited,
      InvalidRequestFailure() => strings.failureInvalidRequest,
      NotFoundFailure() => strings.failureNotFound,
      ConflictFailure() => strings.failureConflict,
      OfflineFailure() => strings.failureOffline,
      TimeoutFailure() => strings.failureTimeout,
      RequestCancelledFailure() => strings.failureCancelled,
      UnsafeRequestNotReplayedFailure() => strings.failureRetrySafe,
      SecureStorageUnavailableFailure() => strings.failureSecureStorage,
      ConfigurationInvalidFailure() => strings.failureConfiguration,
      // A contract violation is a client/server mismatch. The user is told
      // something went wrong and nothing about the shape of the payload.
      ContractViolationFailure() || UnexpectedFailure() => strings.failureUnexpected,
    };

/// The message for a failed SIGN-IN.
///
/// Sign-in overrides one arm. The platform answers unknown address, wrong
/// password, disabled account and an engaged lockout with the same generic
/// 401, and the screen must answer them the same way too — "your session
/// ended" would be both wrong and a hint that the account exists.
String signInFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.signInInvalidCredentials,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a failed multi-factor challenge or recovery-code use.
///
/// The same reasoning: one generic answer covers a wrong code, an expired
/// challenge and a recovery lockout.
String mfaChallengeFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.mfaInvalidCode,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a rejected verification code.
String verificationFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.verifyEmailInvalidCode,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a rejected reset token.
String resetTokenFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.resetPasswordInvalidToken,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a rejected current password at a password change.
String changePasswordFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.changePasswordIncorrectCurrent,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a failed MFA enrolment step.
String mfaEnrolmentFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.mfaInvalidCode,
      // The contract distinguishes "already enrolled" (enrol) from "no pending
      // enrolment" (confirm) only by which call produced it; both are 409.
      ConflictFailure() => strings.mfaAlreadyEnrolled,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a failed MFA removal.
String mfaDisableFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => strings.mfaInvalidCode,
      ConflictFailure() => strings.mfaNotEnrolled,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a failed session revocation.
String sessionRevocationFailureMessage(IdentityStrings strings, Failure failure) =>
    switch (failure) {
      // A session that is not live is indistinguishable from one belonging to
      // another account, and the user is told the same thing either way.
      NotFoundFailure() => strings.sessionsRevokeUnavailable,
      _ => identityFailureMessage(strings, failure),
    };

/// The message for a broken email field.
String emailViolationMessage(IdentityStrings strings, EmailViolation violation) =>
    switch (violation) {
      EmailViolation.empty => strings.emailEmpty,
      EmailViolation.malformed => strings.emailMalformed,
    };

/// The message for a broken password field.
String passwordViolationMessage(
  IdentityStrings strings,
  PasswordViolation violation, {
  required PasswordPolicy policy,
}) =>
    switch (violation) {
      PasswordViolation.empty => strings.passwordEmpty,
      PasswordViolation.tooShort => strings.passwordTooShortFor(policy.minimumLength),
      PasswordViolation.tooLong => strings.passwordTooLongFor(policy.maximumLength),
    };

/// Whether the server's field list names [field].
///
/// `InvalidRequestFailure` carries field IDENTIFIERS only, never the submitted
/// values, so surfacing which field was rejected leaks nothing.
bool failureNames(Failure failure, String field) => switch (failure) {
      InvalidRequestFailure(:final fields) => fields.contains(field),
      _ => false,
    };
