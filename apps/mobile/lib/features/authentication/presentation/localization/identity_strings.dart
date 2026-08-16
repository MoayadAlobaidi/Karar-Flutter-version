// THE IDENTITY BOUNDED CONTEXT'S PRESENTATION VOCABULARY.
//
// WHY THIS FILE EXISTS, AND WHEN IT SHOULD STOP EXISTING.
//
// User-facing text belongs in `lib/l10n/arb`, reached through `context.l10n`.
// That directory is owned by another workstream and its catalogue currently
// carries the shared vocabulary only — actions, states, accessibility roles —
// with no identity messages. Rather than block on it, or edit a file this
// workstream does not own, the identity copy lives here in both shipped
// languages with the same discipline the ARB gate enforces: every message
// exists in English AND Arabic, placeholders match across both, and no screen
// contains a literal.
//
// MIGRATION: every field below is a candidate ARB key. When the catalogue
// gains them this file is deleted and the screens read `context.l10n`
// instead. The key names are listed in the workstream report so the move is
// mechanical.
//
// The five identity features — authentication, email_verification,
// password_recovery, mfa, session_management — share this one catalogue. It
// lives under `authentication` because sign-in is the context's entry point;
// the dependency runs one way, satellites to kernel.
//
// COPY RULES THAT ARE NOT STYLE:
//   * The registration, resend-verification and forgot-password
//     acknowledgements never state whether an account exists. They are the
//     same sentence for every outcome, in both languages.
//   * No failure message contains a server diagnostic, a status code, a field
//     value, or an address.
//   * No message states or implies a monetary amount, balance or account.
import 'package:flutter/widgets.dart';

import '../../../../l10n/karar_localization.dart';

/// The identity copy, in one shipped language.
@immutable
final class IdentityStrings {
  const IdentityStrings._({
    required this.languageCode,
    required this.signInTitle,
    required this.signInSubtitle,
    required this.signInAction,
    required this.signInEmailLabel,
    required this.signInPasswordLabel,
    required this.signInForgotPassword,
    required this.signInCreateAccount,
    required this.signInInvalidCredentials,
    required this.signInSecureStorageNotice,
    required this.signOutAction,
    required this.signOutConfirmTitle,
    required this.signOutConfirmMessage,
    required this.signOutIncompleteNotice,
    required this.registerTitle,
    required this.registerSubtitle,
    required this.registerAction,
    required this.registerConfirmPasswordLabel,
    required this.registerPasswordHelp,
    required this.registerAcknowledgementTitle,
    required this.registerAcknowledgementMessage,
    required this.registerBackToSignIn,
    required this.verifyEmailTitle,
    required this.verifyEmailSubtitle,
    required this.verifyEmailCodeLabel,
    required this.verifyEmailCodeHint,
    required this.verifyEmailAction,
    required this.verifyEmailResendAction,
    required this.verifyEmailResendAcknowledgement,
    required this.verifyEmailInvalidCode,
    required this.verifyEmailSuccess,
    required this.forgotPasswordTitle,
    required this.forgotPasswordSubtitle,
    required this.forgotPasswordAction,
    required this.forgotPasswordAcknowledgementTitle,
    required this.forgotPasswordAcknowledgementMessage,
    required this.resetPasswordTitle,
    required this.resetPasswordSubtitle,
    required this.resetPasswordTokenLabel,
    required this.resetPasswordTokenHint,
    required this.resetPasswordNewLabel,
    required this.resetPasswordAction,
    required this.resetPasswordInvalidToken,
    required this.resetPasswordSuccessTitle,
    required this.resetPasswordSuccessMessage,
    required this.changePasswordTitle,
    required this.changePasswordSubtitle,
    required this.changePasswordCurrentLabel,
    required this.changePasswordNewLabel,
    required this.changePasswordAction,
    required this.changePasswordIncorrectCurrent,
    required this.changePasswordSuccessTitle,
    required this.changePasswordSuccessMessage,
    required this.confirmPasswordMismatch,
    required this.passwordEmpty,
    required this.passwordTooShort,
    required this.passwordTooLong,
    required this.emailEmpty,
    required this.emailMalformed,
    required this.codeEmpty,
    required this.tokenEmpty,
    required this.mfaSecurityTitle,
    required this.mfaEnrolTitle,
    required this.mfaEnrolIntro,
    required this.mfaEnrolStepScan,
    required this.mfaEnrolStepConfirm,
    required this.mfaEnrolSecretLabel,
    required this.mfaEnrolSecretWarning,
    required this.mfaEnrolStartAction,
    required this.mfaCodeLabel,
    required this.mfaCodeHint,
    required this.mfaConfirmAction,
    required this.mfaInvalidCode,
    required this.mfaAlreadyEnrolled,
    required this.mfaNoPendingEnrolment,
    required this.mfaRecoveryCodesTitle,
    required this.mfaRecoveryCodesWarning,
    required this.mfaRecoveryCodesAcknowledge,
    required this.mfaRecoveryCodesDone,
    required this.mfaChallengeTitle,
    required this.mfaChallengeSubtitle,
    required this.mfaChallengeAction,
    required this.mfaChallengeUseRecovery,
    required this.mfaChallengeUseTotp,
    required this.mfaChallengeExpired,
    required this.mfaChallengeAbandon,
    required this.mfaRecoveryCodeLabel,
    required this.mfaRecoveryCodeHint,
    required this.mfaRecoveryCodeSubtitle,
    required this.mfaDisableTitle,
    required this.mfaDisableWarning,
    required this.mfaDisableAction,
    required this.mfaDisableConfirmTitle,
    required this.mfaDisableSuccess,
    required this.mfaNotEnrolled,
    required this.sessionsTitle,
    required this.sessionsSubtitle,
    required this.sessionsCurrentBadge,
    required this.sessionsEmptyTitle,
    required this.sessionsEmptyMessage,
    required this.sessionsStartedAt,
    required this.sessionsLastSeenAt,
    required this.sessionsExpiresAt,
    required this.sessionsUnknownDevice,
    required this.sessionsRevokeAction,
    required this.sessionsRevokeConfirmTitle,
    required this.sessionsRevokeConfirmMessage,
    required this.sessionsRevokeOthersAction,
    required this.sessionsRevokeOthersConfirmTitle,
    required this.sessionsRevokeOthersConfirmMessage,
    required this.sessionsRevokedNotice,
    required this.sessionsRevokedOthersNotice,
    required this.sessionsRevokeUnavailable,
    required this.appLockTitle,
    required this.appLockSettingsTitle,
    required this.appLockSettingsDescription,
    required this.appLockToggleLabel,
    required this.appLockLockedTitle,
    required this.appLockLockedMessage,
    required this.appLockUnlockAction,
    required this.appLockPromptReason,
    required this.appLockUnavailableTitle,
    required this.appLockUnavailableMessage,
    required this.appLockNotEnrolledMessage,
    required this.appLockCancelled,
    required this.appLockNotRecognised,
    required this.appLockLockedOut,
    required this.appLockSignInInstead,
    required this.appLockRequiresSession,
    required this.sessionEndedTitle,
    required this.sessionEndedExpired,
    required this.sessionEndedRevoked,
    required this.sessionEndedReuseDetected,
    required this.sessionEndedRefreshRejected,
    required this.sessionEndedSignedOut,
    required this.sessionEndedAction,
    required this.failureOffline,
    required this.failureTimeout,
    required this.failureRateLimited,
    required this.failureServiceUnavailable,
    required this.failureInvalidRequest,
    required this.failureNotPermitted,
    required this.failureNotFound,
    required this.failureConflict,
    required this.failureSecureStorage,
    required this.failureCancelled,
    required this.failureRetrySafe,
    required this.failureSessionEnded,
    required this.failureConsentRequired,
    required this.failureTenantSelection,
    required this.failureConfiguration,
    required this.failureUnexpected,
    required this.a11yPasswordRules,
    required this.a11yRecoveryCodePosition,
    required this.a11ySensitiveScreen,
  });

  /// The language this instance carries, so a caller can assert on it.
  final String languageCode;

  final String signInTitle;
  final String signInSubtitle;
  final String signInAction;
  final String signInEmailLabel;
  final String signInPasswordLabel;
  final String signInForgotPassword;
  final String signInCreateAccount;

  /// ONE message for unknown address, wrong password, disabled account and an
  /// engaged lockout — matching the single generic 401 the platform returns.
  final String signInInvalidCredentials;

  final String signInSecureStorageNotice;
  final String signOutAction;
  final String signOutConfirmTitle;
  final String signOutConfirmMessage;
  final String signOutIncompleteNotice;

  final String registerTitle;
  final String registerSubtitle;
  final String registerAction;
  final String registerConfirmPasswordLabel;
  final String registerPasswordHelp;

  /// Shown for a NEW address and for one ALREADY REGISTERED, without
  /// variation. See the file header.
  final String registerAcknowledgementTitle;
  final String registerAcknowledgementMessage;
  final String registerBackToSignIn;

  final String verifyEmailTitle;
  final String verifyEmailSubtitle;
  final String verifyEmailCodeLabel;
  final String verifyEmailCodeHint;
  final String verifyEmailAction;
  final String verifyEmailResendAction;

  /// Shown for every resend outcome without variation.
  final String verifyEmailResendAcknowledgement;
  final String verifyEmailInvalidCode;
  final String verifyEmailSuccess;

  final String forgotPasswordTitle;
  final String forgotPasswordSubtitle;
  final String forgotPasswordAction;

  /// Shown for every recovery outcome without variation.
  final String forgotPasswordAcknowledgementTitle;
  final String forgotPasswordAcknowledgementMessage;

  final String resetPasswordTitle;
  final String resetPasswordSubtitle;
  final String resetPasswordTokenLabel;
  final String resetPasswordTokenHint;
  final String resetPasswordNewLabel;
  final String resetPasswordAction;
  final String resetPasswordInvalidToken;
  final String resetPasswordSuccessTitle;
  final String resetPasswordSuccessMessage;

  final String changePasswordTitle;
  final String changePasswordSubtitle;
  final String changePasswordCurrentLabel;
  final String changePasswordNewLabel;
  final String changePasswordAction;
  final String changePasswordIncorrectCurrent;
  final String changePasswordSuccessTitle;
  final String changePasswordSuccessMessage;

  final String confirmPasswordMismatch;
  final String passwordEmpty;

  /// Carries `{count}`.
  final String passwordTooShort;

  /// Carries `{count}`.
  final String passwordTooLong;
  final String emailEmpty;
  final String emailMalformed;
  final String codeEmpty;
  final String tokenEmpty;

  final String mfaSecurityTitle;
  final String mfaEnrolTitle;
  final String mfaEnrolIntro;
  final String mfaEnrolStepScan;
  final String mfaEnrolStepConfirm;
  final String mfaEnrolSecretLabel;
  final String mfaEnrolSecretWarning;
  final String mfaEnrolStartAction;
  final String mfaCodeLabel;
  final String mfaCodeHint;
  final String mfaConfirmAction;
  final String mfaInvalidCode;
  final String mfaAlreadyEnrolled;
  final String mfaNoPendingEnrolment;

  final String mfaRecoveryCodesTitle;
  final String mfaRecoveryCodesWarning;
  final String mfaRecoveryCodesAcknowledge;
  final String mfaRecoveryCodesDone;

  final String mfaChallengeTitle;
  final String mfaChallengeSubtitle;
  final String mfaChallengeAction;
  final String mfaChallengeUseRecovery;
  final String mfaChallengeUseTotp;
  final String mfaChallengeExpired;
  final String mfaChallengeAbandon;
  final String mfaRecoveryCodeLabel;
  final String mfaRecoveryCodeHint;
  final String mfaRecoveryCodeSubtitle;

  final String mfaDisableTitle;
  final String mfaDisableWarning;
  final String mfaDisableAction;
  final String mfaDisableConfirmTitle;
  final String mfaDisableSuccess;
  final String mfaNotEnrolled;

  final String sessionsTitle;
  final String sessionsSubtitle;
  final String sessionsCurrentBadge;
  final String sessionsEmptyTitle;
  final String sessionsEmptyMessage;

  /// Carries `{time}`.
  final String sessionsStartedAt;

  /// Carries `{time}`.
  final String sessionsLastSeenAt;

  /// Carries `{time}`.
  final String sessionsExpiresAt;
  final String sessionsUnknownDevice;
  final String sessionsRevokeAction;
  final String sessionsRevokeConfirmTitle;
  final String sessionsRevokeConfirmMessage;
  final String sessionsRevokeOthersAction;
  final String sessionsRevokeOthersConfirmTitle;
  final String sessionsRevokeOthersConfirmMessage;
  final String sessionsRevokedNotice;

  /// Carries `{count}`.
  final String sessionsRevokedOthersNotice;
  final String sessionsRevokeUnavailable;

  final String appLockTitle;
  final String appLockSettingsTitle;
  final String appLockSettingsDescription;
  final String appLockToggleLabel;
  final String appLockLockedTitle;
  final String appLockLockedMessage;
  final String appLockUnlockAction;

  /// The sentence the PLATFORM shows in its own prompt. It names no account.
  final String appLockPromptReason;
  final String appLockUnavailableTitle;
  final String appLockUnavailableMessage;
  final String appLockNotEnrolledMessage;
  final String appLockCancelled;
  final String appLockNotRecognised;
  final String appLockLockedOut;
  final String appLockSignInInstead;
  final String appLockRequiresSession;

  final String sessionEndedTitle;
  final String sessionEndedExpired;
  final String sessionEndedRevoked;

  /// The security-guidance message. Reuse detection means a refresh token was
  /// presented twice, which the platform treats as theft.
  final String sessionEndedReuseDetected;
  final String sessionEndedRefreshRejected;
  final String sessionEndedSignedOut;
  final String sessionEndedAction;

  final String failureOffline;
  final String failureTimeout;
  final String failureRateLimited;
  final String failureServiceUnavailable;
  final String failureInvalidRequest;
  final String failureNotPermitted;
  final String failureNotFound;
  final String failureConflict;
  final String failureSecureStorage;
  final String failureCancelled;
  final String failureRetrySafe;
  final String failureSessionEnded;
  final String failureConsentRequired;
  final String failureTenantSelection;
  final String failureConfiguration;
  final String failureUnexpected;

  /// Carries `{count}`.
  final String a11yPasswordRules;

  /// Carries `{position}` and `{total}`.
  final String a11yRecoveryCodePosition;
  final String a11ySensitiveScreen;

  /// The catalogue for the active locale.
  ///
  /// Resolution matches `KararLocalization.resolve`: language subtag only,
  /// with English as the deterministic fallback.
  static IdentityStrings of(BuildContext context) {
    final Locale? locale = Localizations.maybeLocaleOf(context);
    return locale != null && locale.languageCode == KararLocalization.arabic.languageCode
        ? arabic
        : english;
  }

  /// Substitutes `{name}` in [template].
  static String _fill(String template, Map<String, String> values) {
    String filled = template;
    for (final MapEntry<String, String> entry in values.entries) {
      filled = filled.replaceAll('{${entry.key}}', entry.value);
    }
    return filled;
  }

  String passwordTooShortFor(int minimum) =>
      _fill(passwordTooShort, <String, String>{'count': '$minimum'});

  String passwordTooLongFor(int maximum) =>
      _fill(passwordTooLong, <String, String>{'count': '$maximum'});

  String passwordRulesFor(int minimum) =>
      _fill(a11yPasswordRules, <String, String>{'count': '$minimum'});

  String sessionStartedAt(String time) =>
      _fill(sessionsStartedAt, <String, String>{'time': time});

  String sessionLastSeenAt(String time) =>
      _fill(sessionsLastSeenAt, <String, String>{'time': time});

  String sessionExpiresAt(String time) =>
      _fill(sessionsExpiresAt, <String, String>{'time': time});

  String revokedOthersNotice(String count) =>
      _fill(sessionsRevokedOthersNotice, <String, String>{'count': count});

  String recoveryCodePosition({required String position, required String total}) =>
      _fill(a11yRecoveryCodePosition, <String, String>{
        'position': position,
        'total': total,
      });

  static const IdentityStrings english = IdentityStrings._(
    languageCode: 'en',
    signInTitle: 'Sign in',
    signInSubtitle: 'Use the email address and password for your Karar account.',
    signInAction: 'Sign in',
    signInEmailLabel: 'Email address',
    signInPasswordLabel: 'Password',
    signInForgotPassword: 'Forgot your password?',
    signInCreateAccount: 'Create an account',
    signInInvalidCredentials:
        'That email address and password did not match an account you can sign in to. '
        'Check both and try again.',
    signInSecureStorageNotice:
        'This device could not open its secure storage, so you have been signed out. '
        'Sign in again to continue.',
    signOutAction: 'Sign out',
    signOutConfirmTitle: 'Sign out?',
    signOutConfirmMessage:
        'You will need your email address and password to sign in again on this device.',
    signOutIncompleteNotice:
        'You are signed out on this device. We could not reach Karar to end the session '
        'everywhere, so review your active sessions when you are back online.',
    registerTitle: 'Create an account',
    registerSubtitle: 'We will email a verification code to the address you enter.',
    registerAction: 'Create account',
    registerConfirmPasswordLabel: 'Confirm password',
    registerPasswordHelp: 'At least 8 characters.',
    registerAcknowledgementTitle: 'Check your email',
    // Identical for a new address and one already registered. Changing this to
    // say anything about the account is a security regression, not a copy
    // improvement.
    registerAcknowledgementMessage:
        'If that address can be registered, a verification code is on its way. '
        'Enter it on the next screen to finish setting up your account.',
    registerBackToSignIn: 'Back to sign in',
    verifyEmailTitle: 'Verify your email',
    verifyEmailSubtitle:
        'Enter the 8-character code we emailed you. It is not shown anywhere else.',
    verifyEmailCodeLabel: 'Verification code',
    verifyEmailCodeHint: '8 characters',
    verifyEmailAction: 'Verify',
    verifyEmailResendAction: 'Send another code',
    verifyEmailResendAcknowledgement:
        'If that address needs a code, another one is on its way.',
    verifyEmailInvalidCode:
        'That code did not verify. It may have expired or already been used.',
    verifyEmailSuccess: 'Your email address is verified.',
    forgotPasswordTitle: 'Reset your password',
    forgotPasswordSubtitle:
        'Enter your email address and we will send a reset link if the address can '
        'receive one.',
    forgotPasswordAction: 'Send reset instructions',
    forgotPasswordAcknowledgementTitle: 'Check your email',
    // Identical for existing, unknown, disabled and cooling-down addresses.
    forgotPasswordAcknowledgementMessage:
        'If that address can receive a reset, instructions are on their way. '
        'The link expires 30 minutes after it is sent.',
    resetPasswordTitle: 'Set a new password',
    resetPasswordSubtitle:
        'Paste the reset token from your email, then choose a new password.',
    resetPasswordTokenLabel: 'Reset token',
    resetPasswordTokenHint: 'From the email we sent you',
    resetPasswordNewLabel: 'New password',
    resetPasswordAction: 'Set new password',
    resetPasswordInvalidToken:
        'That reset token is not valid. It may have expired or already been used. '
        'Request a new one.',
    resetPasswordSuccessTitle: 'Password changed',
    resetPasswordSuccessMessage:
        'Every session has been signed out, on this device and on any other. '
        'Sign in with your new password.',
    changePasswordTitle: 'Change password',
    changePasswordSubtitle:
        'Changing your password signs out every other device. This one stays signed in.',
    changePasswordCurrentLabel: 'Current password',
    changePasswordNewLabel: 'New password',
    changePasswordAction: 'Change password',
    changePasswordIncorrectCurrent:
        'That did not match your current password.',
    changePasswordSuccessTitle: 'Password changed',
    changePasswordSuccessMessage: 'Every other device has been signed out.',
    confirmPasswordMismatch: 'The two passwords do not match.',
    passwordEmpty: 'Enter a password.',
    passwordTooShort: 'Use at least {count} characters.',
    passwordTooLong: 'Use no more than {count} characters.',
    emailEmpty: 'Enter your email address.',
    emailMalformed: 'Enter a complete email address.',
    codeEmpty: 'Enter the code.',
    tokenEmpty: 'Enter the reset token.',
    mfaSecurityTitle: 'Two-step verification',
    mfaEnrolTitle: 'Set up two-step verification',
    mfaEnrolIntro:
        'Two-step verification asks for a code from your authenticator app each time '
        'you sign in.',
    mfaEnrolStepScan:
        'Add this key to an authenticator app. It is shown once and cannot be '
        'retrieved again.',
    mfaEnrolStepConfirm: 'Enter the 6-digit code your app shows now.',
    mfaEnrolSecretLabel: 'Setup key',
    mfaEnrolSecretWarning:
        'Anyone with this key can generate your codes. Do not photograph it or share it.',
    mfaEnrolStartAction: 'Begin setup',
    mfaCodeLabel: 'Verification code',
    mfaCodeHint: '6 digits',
    mfaConfirmAction: 'Turn on two-step verification',
    mfaInvalidCode: 'That code did not verify. Check your authenticator app and try again.',
    mfaAlreadyEnrolled: 'Two-step verification is already set up on this account.',
    mfaNoPendingEnrolment: 'That setup is no longer pending. Start again.',
    mfaRecoveryCodesTitle: 'Your recovery codes',
    mfaRecoveryCodesWarning:
        'These codes are shown once and never again. Each one signs you in a single '
        'time if you lose your authenticator app. Write them down and keep them '
        'somewhere only you can reach.',
    mfaRecoveryCodesAcknowledge: 'I have saved these codes somewhere safe',
    mfaRecoveryCodesDone: 'Done',
    mfaChallengeTitle: 'Enter your code',
    mfaChallengeSubtitle: 'Open your authenticator app and enter the 6-digit code.',
    mfaChallengeAction: 'Continue',
    mfaChallengeUseRecovery: 'Use a recovery code instead',
    mfaChallengeUseTotp: 'Use your authenticator app instead',
    mfaChallengeExpired:
        'This sign-in attempt timed out. Sign in again to get a new code prompt.',
    mfaChallengeAbandon: 'Back to sign in',
    mfaRecoveryCodeLabel: 'Recovery code',
    mfaRecoveryCodeHint: 'One of the codes you saved',
    mfaRecoveryCodeSubtitle:
        'Enter one of the recovery codes you saved when you turned on two-step '
        'verification. Each code works once.',
    mfaDisableTitle: 'Turn off two-step verification',
    mfaDisableWarning:
        'Your recovery codes will be destroyed and your account will be protected by '
        'your password alone.',
    mfaDisableAction: 'Turn off',
    mfaDisableConfirmTitle: 'Turn off two-step verification?',
    mfaDisableSuccess: 'Two-step verification is off.',
    mfaNotEnrolled: 'Two-step verification is not set up on this account.',
    sessionsTitle: 'Active sessions',
    sessionsSubtitle:
        'Every device currently signed in to your account. Sign out any you do not '
        'recognise.',
    sessionsCurrentBadge: 'This device',
    sessionsEmptyTitle: 'No other sessions',
    sessionsEmptyMessage: 'This device is the only one signed in.',
    sessionsStartedAt: 'Signed in {time}',
    sessionsLastSeenAt: 'Last active {time}',
    sessionsExpiresAt: 'Expires {time}',
    sessionsUnknownDevice: 'Unrecognised device',
    sessionsRevokeAction: 'Sign out this device',
    sessionsRevokeConfirmTitle: 'Sign out this device?',
    sessionsRevokeConfirmMessage:
        'That device will need the account password to sign in again.',
    sessionsRevokeOthersAction: 'Sign out all other devices',
    sessionsRevokeOthersConfirmTitle: 'Sign out all other devices?',
    sessionsRevokeOthersConfirmMessage:
        'Every device except this one will be signed out immediately.',
    sessionsRevokedNotice: 'That device has been signed out.',
    sessionsRevokedOthersNotice: 'Other devices signed out ({count}).',
    sessionsRevokeUnavailable:
        'That session is no longer active, so there was nothing to sign out.',
    appLockTitle: 'App lock',
    appLockSettingsTitle: 'Lock this app',
    appLockSettingsDescription:
        'Ask for your device unlock before showing Karar. This is a privacy control '
        'on this device only. It never replaces signing in, and Karar never receives '
        'your fingerprint or face data.',
    appLockToggleLabel: 'Require device unlock',
    appLockLockedTitle: 'Karar is locked',
    appLockLockedMessage: 'Unlock with your device to continue.',
    appLockUnlockAction: 'Unlock',
    appLockPromptReason: 'Unlock Karar',
    appLockUnavailableTitle: 'App lock is unavailable',
    appLockUnavailableMessage:
        'This device does not offer an unlock method Karar can use, so the app lock '
        'cannot be turned on. Your account stays protected by your password.',
    appLockNotEnrolledMessage:
        'Set up a screen lock, fingerprint or face unlock in your device settings, '
        'then turn this on.',
    appLockCancelled: 'Unlock was cancelled.',
    appLockNotRecognised: 'That was not recognised. Try again.',
    appLockLockedOut:
        'Your device has blocked further unlock attempts. Sign in with your password '
        'instead.',
    appLockSignInInstead: 'Sign in with your password',
    appLockRequiresSession: 'Sign in before changing the app lock.',
    sessionEndedTitle: 'You have been signed out',
    sessionEndedExpired: 'Your session expired. Sign in again to continue.',
    sessionEndedRevoked:
        'This session was signed out from another device. If that was not you, change '
        'your password after signing in.',
    sessionEndedReuseDetected:
        'For your security, Karar ended this session and cleared its credentials from '
        'this device, because a sign-in token was presented twice. If you did not '
        'cause this, change your password and review your active sessions as soon as '
        'you sign in.',
    sessionEndedRefreshRejected:
        'Karar could not renew this session, so it has been ended and its credentials '
        'cleared from this device. Sign in again.',
    sessionEndedSignedOut: 'You are signed out.',
    sessionEndedAction: 'Sign in',
    failureOffline: 'You appear to be offline. Check your connection and try again.',
    failureTimeout:
        'That took too long to answer. Check your connection and try again.',
    failureRateLimited: 'Too many attempts. Wait a little and try again.',
    failureServiceUnavailable:
        'Karar could not complete that request. Try again in a moment.',
    failureInvalidRequest: 'Check the details you entered and try again.',
    failureNotPermitted: 'You do not have permission to do that.',
    failureNotFound: 'That is no longer available.',
    failureConflict: 'That has already changed. Reload and try again.',
    failureSecureStorage:
        'This device could not open its secure storage, so Karar stopped rather than '
        'continue without protecting your credentials. Try again.',
    failureCancelled: 'That request was cancelled.',
    failureRetrySafe: 'Your session was renewed. Try that again.',
    failureSessionEnded: 'Your session ended. Sign in again to continue.',
    failureConsentRequired: 'There is an agreement to review before continuing.',
    failureTenantSelection: 'Choose an organisation before continuing.',
    failureConfiguration:
        'This build of Karar is not configured correctly and cannot continue.',
    failureUnexpected: 'Something went wrong. Try again.',
    a11yPasswordRules: 'Password. At least {count} characters.',
    a11yRecoveryCodePosition: 'Recovery code {position} of {total}',
    a11ySensitiveScreen: 'Sensitive information. Hidden when Karar is in the background.',
  );

  static const IdentityStrings arabic = IdentityStrings._(
    languageCode: 'ar',
    signInTitle: 'تسجيل الدخول',
    signInSubtitle: 'استخدم البريد الإلكتروني وكلمة المرور الخاصة بحسابك في كرار.',
    signInAction: 'تسجيل الدخول',
    signInEmailLabel: 'البريد الإلكتروني',
    signInPasswordLabel: 'كلمة المرور',
    signInForgotPassword: 'هل نسيت كلمة المرور؟',
    signInCreateAccount: 'إنشاء حساب',
    signInInvalidCredentials:
        'لم يطابق البريد الإلكتروني وكلمة المرور أي حساب يمكنك الدخول إليه. '
        'تحقق منهما وحاول مرة أخرى.',
    signInSecureStorageNotice:
        'تعذّر على هذا الجهاز فتح مخزنه الآمن، لذا تم تسجيل خروجك. '
        'سجّل الدخول مرة أخرى للمتابعة.',
    signOutAction: 'تسجيل الخروج',
    signOutConfirmTitle: 'تسجيل الخروج؟',
    signOutConfirmMessage:
        'ستحتاج إلى بريدك الإلكتروني وكلمة المرور لتسجيل الدخول مجددًا على هذا الجهاز.',
    signOutIncompleteNotice:
        'تم تسجيل خروجك على هذا الجهاز. لم نتمكن من الوصول إلى كرار لإنهاء الجلسة في '
        'كل مكان، لذا راجع جلساتك النشطة عند عودة الاتصال.',
    registerTitle: 'إنشاء حساب',
    registerSubtitle: 'سنرسل رمز تحقق إلى البريد الإلكتروني الذي تدخله.',
    registerAction: 'إنشاء الحساب',
    registerConfirmPasswordLabel: 'تأكيد كلمة المرور',
    registerPasswordHelp: '٨ أحرف على الأقل.',
    registerAcknowledgementTitle: 'تحقّق من بريدك الإلكتروني',
    registerAcknowledgementMessage:
        'إذا كان بالإمكان تسجيل هذا العنوان، فرمز التحقق في طريقه إليك. '
        'أدخله في الشاشة التالية لإكمال إعداد حسابك.',
    registerBackToSignIn: 'العودة إلى تسجيل الدخول',
    verifyEmailTitle: 'تأكيد بريدك الإلكتروني',
    verifyEmailSubtitle:
        'أدخل الرمز المكوّن من ٨ خانات الذي أرسلناه إليك. لا يظهر هذا الرمز في أي مكان آخر.',
    verifyEmailCodeLabel: 'رمز التحقق',
    verifyEmailCodeHint: '٨ خانات',
    verifyEmailAction: 'تأكيد',
    verifyEmailResendAction: 'إرسال رمز آخر',
    verifyEmailResendAcknowledgement:
        'إذا كان هذا العنوان بحاجة إلى رمز، فرمز آخر في طريقه إليك.',
    verifyEmailInvalidCode:
        'لم يتم التحقق من هذا الرمز. ربما انتهت صلاحيته أو استُخدم من قبل.',
    verifyEmailSuccess: 'تم تأكيد بريدك الإلكتروني.',
    forgotPasswordTitle: 'إعادة تعيين كلمة المرور',
    forgotPasswordSubtitle:
        'أدخل بريدك الإلكتروني وسنرسل رابط إعادة التعيين إذا كان العنوان قادرًا على '
        'استقباله.',
    forgotPasswordAction: 'إرسال تعليمات إعادة التعيين',
    forgotPasswordAcknowledgementTitle: 'تحقّق من بريدك الإلكتروني',
    forgotPasswordAcknowledgementMessage:
        'إذا كان بإمكان هذا العنوان استقبال إعادة تعيين، فالتعليمات في طريقها إليك. '
        'تنتهي صلاحية الرابط بعد ٣٠ دقيقة من إرساله.',
    resetPasswordTitle: 'تعيين كلمة مرور جديدة',
    resetPasswordSubtitle:
        'الصق رمز إعادة التعيين من بريدك الإلكتروني، ثم اختر كلمة مرور جديدة.',
    resetPasswordTokenLabel: 'رمز إعادة التعيين',
    resetPasswordTokenHint: 'من الرسالة التي أرسلناها إليك',
    resetPasswordNewLabel: 'كلمة المرور الجديدة',
    resetPasswordAction: 'تعيين كلمة المرور',
    resetPasswordInvalidToken:
        'رمز إعادة التعيين هذا غير صالح. ربما انتهت صلاحيته أو استُخدم من قبل. '
        'اطلب رمزًا جديدًا.',
    resetPasswordSuccessTitle: 'تم تغيير كلمة المرور',
    resetPasswordSuccessMessage:
        'تم تسجيل الخروج من جميع الجلسات، على هذا الجهاز وعلى أي جهاز آخر. '
        'سجّل الدخول بكلمة المرور الجديدة.',
    changePasswordTitle: 'تغيير كلمة المرور',
    changePasswordSubtitle:
        'تغيير كلمة المرور يسجّل الخروج من كل الأجهزة الأخرى. يبقى هذا الجهاز مسجّلًا.',
    changePasswordCurrentLabel: 'كلمة المرور الحالية',
    changePasswordNewLabel: 'كلمة المرور الجديدة',
    changePasswordAction: 'تغيير كلمة المرور',
    changePasswordIncorrectCurrent: 'لم يطابق ذلك كلمة المرور الحالية.',
    changePasswordSuccessTitle: 'تم تغيير كلمة المرور',
    changePasswordSuccessMessage: 'تم تسجيل الخروج من كل الأجهزة الأخرى.',
    confirmPasswordMismatch: 'كلمتا المرور غير متطابقتين.',
    passwordEmpty: 'أدخل كلمة مرور.',
    passwordTooShort: 'استخدم {count} أحرف على الأقل.',
    passwordTooLong: 'استخدم {count} حرفًا كحد أقصى.',
    emailEmpty: 'أدخل بريدك الإلكتروني.',
    emailMalformed: 'أدخل بريدًا إلكترونيًا كاملًا.',
    codeEmpty: 'أدخل الرمز.',
    tokenEmpty: 'أدخل رمز إعادة التعيين.',
    mfaSecurityTitle: 'التحقق بخطوتين',
    mfaEnrolTitle: 'إعداد التحقق بخطوتين',
    mfaEnrolIntro:
        'يطلب التحقق بخطوتين رمزًا من تطبيق المصادقة في كل مرة تسجّل فيها الدخول.',
    mfaEnrolStepScan:
        'أضف هذا المفتاح إلى تطبيق مصادقة. يظهر مرة واحدة ولا يمكن استرجاعه.',
    mfaEnrolStepConfirm: 'أدخل الرمز المكوّن من ٦ أرقام الذي يعرضه تطبيقك الآن.',
    mfaEnrolSecretLabel: 'مفتاح الإعداد',
    mfaEnrolSecretWarning:
        'أي شخص يملك هذا المفتاح يستطيع توليد رموزك. لا تصوّره ولا تشاركه.',
    mfaEnrolStartAction: 'بدء الإعداد',
    mfaCodeLabel: 'رمز التحقق',
    mfaCodeHint: '٦ أرقام',
    mfaConfirmAction: 'تفعيل التحقق بخطوتين',
    mfaInvalidCode: 'لم يتم التحقق من هذا الرمز. راجع تطبيق المصادقة وحاول مرة أخرى.',
    mfaAlreadyEnrolled: 'التحقق بخطوتين مفعّل بالفعل على هذا الحساب.',
    mfaNoPendingEnrolment: 'لم يعد هذا الإعداد معلّقًا. ابدأ من جديد.',
    mfaRecoveryCodesTitle: 'رموز الاسترجاع الخاصة بك',
    mfaRecoveryCodesWarning:
        'تظهر هذه الرموز مرة واحدة فقط ولن تظهر مجددًا. يسجّل كل رمز دخولك مرة واحدة '
        'إذا فقدت تطبيق المصادقة. دوّنها واحتفظ بها في مكان لا يصل إليه سواك.',
    mfaRecoveryCodesAcknowledge: 'حفظت هذه الرموز في مكان آمن',
    mfaRecoveryCodesDone: 'تم',
    mfaChallengeTitle: 'أدخل رمزك',
    mfaChallengeSubtitle: 'افتح تطبيق المصادقة وأدخل الرمز المكوّن من ٦ أرقام.',
    mfaChallengeAction: 'متابعة',
    mfaChallengeUseRecovery: 'استخدام رمز استرجاع بدلًا من ذلك',
    mfaChallengeUseTotp: 'استخدام تطبيق المصادقة بدلًا من ذلك',
    mfaChallengeExpired:
        'انتهت مهلة محاولة تسجيل الدخول هذه. سجّل الدخول مجددًا للحصول على طلب رمز جديد.',
    mfaChallengeAbandon: 'العودة إلى تسجيل الدخول',
    mfaRecoveryCodeLabel: 'رمز الاسترجاع',
    mfaRecoveryCodeHint: 'أحد الرموز التي حفظتها',
    mfaRecoveryCodeSubtitle:
        'أدخل أحد رموز الاسترجاع التي حفظتها عند تفعيل التحقق بخطوتين. '
        'يعمل كل رمز مرة واحدة.',
    mfaDisableTitle: 'إيقاف التحقق بخطوتين',
    mfaDisableWarning:
        'سيتم إتلاف رموز الاسترجاع الخاصة بك وسيصبح حسابك محميًا بكلمة المرور وحدها.',
    mfaDisableAction: 'إيقاف',
    mfaDisableConfirmTitle: 'إيقاف التحقق بخطوتين؟',
    mfaDisableSuccess: 'تم إيقاف التحقق بخطوتين.',
    mfaNotEnrolled: 'التحقق بخطوتين غير مفعّل على هذا الحساب.',
    sessionsTitle: 'الجلسات النشطة',
    sessionsSubtitle:
        'كل جهاز مسجّل الدخول حاليًا إلى حسابك. سجّل الخروج من أي جهاز لا تعرفه.',
    sessionsCurrentBadge: 'هذا الجهاز',
    sessionsEmptyTitle: 'لا توجد جلسات أخرى',
    sessionsEmptyMessage: 'هذا الجهاز هو الوحيد المسجّل دخوله.',
    sessionsStartedAt: 'سجّل الدخول {time}',
    sessionsLastSeenAt: 'آخر نشاط {time}',
    sessionsExpiresAt: 'تنتهي {time}',
    sessionsUnknownDevice: 'جهاز غير معروف',
    sessionsRevokeAction: 'تسجيل الخروج من هذا الجهاز',
    sessionsRevokeConfirmTitle: 'تسجيل الخروج من هذا الجهاز؟',
    sessionsRevokeConfirmMessage:
        'سيحتاج ذلك الجهاز إلى كلمة مرور الحساب لتسجيل الدخول مجددًا.',
    sessionsRevokeOthersAction: 'تسجيل الخروج من كل الأجهزة الأخرى',
    sessionsRevokeOthersConfirmTitle: 'تسجيل الخروج من كل الأجهزة الأخرى؟',
    sessionsRevokeOthersConfirmMessage:
        'سيتم تسجيل الخروج فورًا من كل جهاز عدا هذا الجهاز.',
    sessionsRevokedNotice: 'تم تسجيل الخروج من ذلك الجهاز.',
    sessionsRevokedOthersNotice: 'تم تسجيل الخروج من الأجهزة الأخرى (العدد: {count}).',
    sessionsRevokeUnavailable:
        'لم تعد تلك الجلسة نشطة، لذا لم يكن هناك ما يُسجَّل الخروج منه.',
    appLockTitle: 'قفل التطبيق',
    appLockSettingsTitle: 'قفل هذا التطبيق',
    appLockSettingsDescription:
        'اطلب فتح قفل جهازك قبل عرض كرار. هذا إعداد خصوصية على هذا الجهاز فقط. '
        'لا يحل محل تسجيل الدخول أبدًا، ولا يستقبل كرار بصمتك أو بيانات وجهك.',
    appLockToggleLabel: 'طلب فتح قفل الجهاز',
    appLockLockedTitle: 'كرار مقفل',
    appLockLockedMessage: 'افتح القفل باستخدام جهازك للمتابعة.',
    appLockUnlockAction: 'فتح القفل',
    appLockPromptReason: 'فتح قفل كرار',
    appLockUnavailableTitle: 'قفل التطبيق غير متاح',
    appLockUnavailableMessage:
        'لا يوفّر هذا الجهاز طريقة فتح قفل يمكن لكرار استخدامها، لذا لا يمكن تفعيل '
        'قفل التطبيق. يبقى حسابك محميًا بكلمة المرور.',
    appLockNotEnrolledMessage:
        'أعدّ قفل الشاشة أو بصمة الإصبع أو فتح القفل بالوجه في إعدادات جهازك، '
        'ثم فعّل هذا الخيار.',
    appLockCancelled: 'تم إلغاء فتح القفل.',
    appLockNotRecognised: 'لم يتم التعرف على ذلك. حاول مرة أخرى.',
    appLockLockedOut:
        'حظر جهازك المزيد من محاولات فتح القفل. سجّل الدخول بكلمة المرور بدلًا من ذلك.',
    appLockSignInInstead: 'تسجيل الدخول بكلمة المرور',
    appLockRequiresSession: 'سجّل الدخول قبل تغيير قفل التطبيق.',
    sessionEndedTitle: 'تم تسجيل خروجك',
    sessionEndedExpired: 'انتهت صلاحية جلستك. سجّل الدخول مجددًا للمتابعة.',
    sessionEndedRevoked:
        'تم تسجيل الخروج من هذه الجلسة من جهاز آخر. إذا لم تكن أنت، غيّر كلمة المرور '
        'بعد تسجيل الدخول.',
    sessionEndedReuseDetected:
        'حفاظًا على أمانك، أنهى كرار هذه الجلسة ومسح بياناتها من هذا الجهاز، لأن رمز '
        'تسجيل دخول قُدّم مرتين. إذا لم تكن أنت السبب، غيّر كلمة المرور وراجع جلساتك '
        'النشطة فور تسجيل الدخول.',
    sessionEndedRefreshRejected:
        'تعذّر على كرار تجديد هذه الجلسة، لذا تم إنهاؤها ومسح بياناتها من هذا الجهاز. '
        'سجّل الدخول مجددًا.',
    sessionEndedSignedOut: 'تم تسجيل خروجك.',
    sessionEndedAction: 'تسجيل الدخول',
    failureOffline: 'يبدو أنك غير متصل. تحقق من اتصالك وحاول مرة أخرى.',
    failureTimeout: 'استغرق ذلك وقتًا طويلًا. تحقق من اتصالك وحاول مرة أخرى.',
    failureRateLimited: 'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.',
    failureServiceUnavailable: 'تعذّر على كرار إتمام ذلك الطلب. حاول بعد قليل.',
    failureInvalidRequest: 'راجع البيانات التي أدخلتها وحاول مرة أخرى.',
    failureNotPermitted: 'ليس لديك إذن للقيام بذلك.',
    failureNotFound: 'لم يعد ذلك متاحًا.',
    failureConflict: 'تغيّر ذلك بالفعل. أعد التحميل وحاول مرة أخرى.',
    failureSecureStorage:
        'تعذّر على هذا الجهاز فتح مخزنه الآمن، لذا توقّف كرار بدلًا من المتابعة دون '
        'حماية بياناتك. حاول مرة أخرى.',
    failureCancelled: 'تم إلغاء ذلك الطلب.',
    failureRetrySafe: 'تم تجديد جلستك. حاول مرة أخرى.',
    failureSessionEnded: 'انتهت جلستك. سجّل الدخول مجددًا للمتابعة.',
    failureConsentRequired: 'هناك اتفاقية يجب مراجعتها قبل المتابعة.',
    failureTenantSelection: 'اختر مؤسسة قبل المتابعة.',
    failureConfiguration: 'هذه النسخة من كرار غير مهيأة بشكل صحيح ولا يمكنها المتابعة.',
    failureUnexpected: 'حدث خطأ ما. حاول مرة أخرى.',
    a11yPasswordRules: 'كلمة المرور. {count} أحرف على الأقل.',
    a11yRecoveryCodePosition: 'رمز الاسترجاع {position} من {total}',
    a11ySensitiveScreen: 'معلومات حساسة. تُخفى عندما يكون كرار في الخلفية.',
  );
}
