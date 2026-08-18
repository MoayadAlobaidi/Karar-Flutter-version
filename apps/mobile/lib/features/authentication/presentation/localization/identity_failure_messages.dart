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
import '../../../../l10n/karar_localization.dart';
import '../../../../shared/shared.dart';
import '../../domain/value_objects/email_address.dart';
import '../../domain/value_objects/password.dart';

/// The message for [failure] in the identity flows.
String identityFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.failureSessionEnded,
      SessionExpiredFailure() => l10n.failureSessionEnded,
      NotAuthorizedFailure() || OperationRestrictedFailure() => l10n.failureNotPermitted,
      ConsentRequiredFailure() || ReConsentRequiredFailure() => l10n.failureConsentRequired,
      TenantSelectionRequiredFailure() => l10n.failureTenantSelection,
      BootstrapUnavailableFailure() ||
      CapabilityResolutionUnavailableFailure() ||
      DependencyUnavailableFailure() =>
        l10n.failureServiceUnavailable,
      RateLimitedFailure() => l10n.failureRateLimited,
      InvalidRequestFailure() => l10n.failureInvalidRequest,
      NotFoundFailure() => l10n.failureNotFound,
      ConflictFailure() => l10n.failureConflict,
      OfflineFailure() => l10n.failureOffline,
      TimeoutFailure() => l10n.failureTimeout,
      RequestCancelledFailure() => l10n.failureCancelled,
      UnsafeRequestNotReplayedFailure() => l10n.failureRetrySafe,
      SecureStorageUnavailableFailure() => l10n.failureSecureStorage,
      // The preference store, not the keystore. The user-facing consequence is
      // the same — local state could not be written — and the existing notice
      // already says the device could not save something, so it is reused
      // rather than adding a message that says the same thing differently.
      LocalStorageUnavailableFailure() => l10n.failureSecureStorage,
      // Local SECURITY state: the application-lock choice, the abandonment
      // marker. A dedicated message, because the consequence is not "a setting
      // did not save" — it is that a protection this device is meant to apply
      // cannot be established, and the honest thing is to say so and offer the
      // retry rather than to reuse a notice about storage in general.
      LocalSecurityStateUnavailableFailure() ||
      LocalSecurityStateCorruptFailure() =>
        l10n.failureLocalSecurityState,
      ConfigurationInvalidFailure() => l10n.failureConfiguration,
      // A contract violation is a client/server mismatch. The user is told
      // something went wrong and nothing about the shape of the payload.
      ContractViolationFailure() || UnexpectedFailure() => l10n.failureUnexpected,
    };

/// The message for a failed SIGN-IN.
///
/// Sign-in overrides one arm. The platform answers unknown address, wrong
/// password, disabled account and an engaged lockout with the same generic
/// 401, and the screen must answer them the same way too — "your session
/// ended" would be both wrong and a hint that the account exists.
String signInFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.signInInvalidCredentials,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a failed multi-factor challenge or recovery-code use.
///
/// The same reasoning: one generic answer covers a wrong code, an expired
/// challenge and a recovery lockout.
String mfaChallengeFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.mfaInvalidCode,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a rejected verification code.
String verificationFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.verifyEmailInvalidCode,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a rejected reset token.
String resetTokenFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.resetPasswordInvalidToken,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a rejected current password at a password change.
String changePasswordFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.changePasswordIncorrectCurrent,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a failed MFA enrolment step.
String mfaEnrolmentFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.mfaInvalidCode,
      // The contract distinguishes "already enrolled" (enrol) from "no pending
      // enrolment" (confirm) only by which call produced it; both are 409.
      ConflictFailure() => l10n.mfaAlreadyEnrolled,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a failed MFA removal.
String mfaDisableFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      AuthenticationRequiredFailure() => l10n.mfaInvalidCode,
      ConflictFailure() => l10n.mfaNotEnrolled,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a failed session revocation.
String sessionRevocationFailureMessage(AppLocalizations l10n, Failure failure) =>
    switch (failure) {
      // A session that is not live is indistinguishable from one belonging to
      // another account, and the user is told the same thing either way.
      NotFoundFailure() => l10n.sessionsRevokeUnavailable,
      _ => identityFailureMessage(l10n, failure),
    };

/// The message for a broken email field.
String emailViolationMessage(AppLocalizations l10n, EmailViolation violation) =>
    switch (violation) {
      EmailViolation.empty => l10n.emailEmpty,
      EmailViolation.malformed => l10n.emailMalformed,
    };

/// The message for a broken password field.
///
/// Two arms carry a length, and the field's own helper text carries the same
/// number, so [formatter] is required rather than optional: a message whose
/// digits are shaped by the generated bundle and a helper line whose digits are
/// shaped by the formatter would show one policy in two alphabets.
String passwordViolationMessage(
  AppLocalizations l10n,
  PasswordViolation violation, {
  required PasswordPolicy policy,
  required KararFormatter formatter,
}) =>
    switch (violation) {
      PasswordViolation.empty => l10n.passwordEmpty,
      PasswordViolation.tooShort =>
        formatter.applyNumerals(l10n.passwordTooShort(policy.minimumLength)),
      PasswordViolation.tooLong =>
        formatter.applyNumerals(l10n.passwordTooLong(policy.maximumLength)),
    };

/// Whether the server's field list names [field].
///
/// `InvalidRequestFailure` carries field IDENTIFIERS only, never the submitted
/// values, so surfacing which field was rejected leaks nothing.
bool failureNames(Failure failure, String field) => switch (failure) {
      InvalidRequestFailure(:final fields) => fields.contains(field),
      _ => false,
    };
