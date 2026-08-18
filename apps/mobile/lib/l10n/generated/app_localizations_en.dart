// GENERATED FILE — do not edit by hand.
// Source of truth: lib/l10n/arb/*.arb. Regenerate with `flutter gen-l10n`.
// ignore_for_file: type=lint

// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Karar';

  @override
  String get actionContinue => 'Continue';

  @override
  String get actionCancel => 'Cancel';

  @override
  String get actionConfirm => 'Confirm';

  @override
  String get actionSave => 'Save';

  @override
  String get actionClose => 'Close';

  @override
  String get actionBack => 'Back';

  @override
  String get actionNext => 'Next';

  @override
  String get actionDone => 'Done';

  @override
  String get actionRetry => 'Try again';

  @override
  String get actionDismiss => 'Dismiss';

  @override
  String get actionEdit => 'Edit';

  @override
  String get actionRemove => 'Remove';

  @override
  String get actionSubmit => 'Submit';

  @override
  String get actionRefresh => 'Refresh';

  @override
  String get actionCopy => 'Copy';

  @override
  String get actionSelectAll => 'Select all';

  @override
  String fieldOptionalSuffix(String label) {
    return '$label (optional)';
  }

  @override
  String get fieldRequiredMarker => 'Required';

  @override
  String get fieldRequiredIndicator => '*';

  @override
  String fieldClear(String label) {
    return 'Clear $label';
  }

  @override
  String fieldShowValue(String label) {
    return 'Show $label';
  }

  @override
  String fieldHideValue(String label) {
    return 'Hide $label';
  }

  @override
  String fieldCharacterCount(int used, int limit) {
    final intl.NumberFormat usedNumberFormat = intl.NumberFormat.decimalPattern(
      localeName,
    );
    final String usedString = usedNumberFormat.format(used);
    final intl.NumberFormat limitNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String limitString = limitNumberFormat.format(limit);

    return '$usedString of $limitString characters';
  }

  @override
  String fieldErrorAnnouncement(String label, String message) {
    return '$label has an error. $message';
  }

  @override
  String get statusSuccess => 'Success';

  @override
  String get statusWarning => 'Warning';

  @override
  String get statusError => 'Error';

  @override
  String get statusInfo => 'Information';

  @override
  String get statusPending => 'Pending';

  @override
  String get statusNeutral => 'Not started';

  @override
  String get stateLoading => 'Loading';

  @override
  String stateLoadingWithSubject(String subject) {
    return 'Loading $subject';
  }

  @override
  String get stateEmptyTitle => 'Nothing here yet';

  @override
  String get stateEmptyDescription =>
      'There is nothing to show on this screen right now.';

  @override
  String get stateErrorTitle => 'Something went wrong';

  @override
  String get stateErrorDescription =>
      'We could not load this screen. Check your connection and try again.';

  @override
  String get stateOfflineTitle => 'You are offline';

  @override
  String get stateOfflineDescription =>
      'Reconnect to load the latest information.';

  @override
  String stateErrorReference(String reference) {
    return 'Reference $reference';
  }

  @override
  String get a11yDialog => 'Dialog';

  @override
  String get a11ySheet => 'Sheet';

  @override
  String get a11yBanner => 'Notice';

  @override
  String get a11yNavigationBar => 'Main navigation';

  @override
  String a11yTabPosition(int position, int total) {
    final intl.NumberFormat positionNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String positionString = positionNumberFormat.format(position);
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    return 'Tab $positionString of $totalString';
  }

  @override
  String get a11yBusy => 'Busy';

  @override
  String get a11ySelected => 'Selected';

  @override
  String get a11yDragHandle => 'Drag to resize';

  @override
  String a11yFieldWithRequired(String label) {
    return '$label, required';
  }

  @override
  String a11yControlBusy(String label) {
    return '$label, busy';
  }

  @override
  String a11yTitleWithSubtitle(String title, String subtitle) {
    return '$title. $subtitle';
  }

  @override
  String a11yBannerTitled(String role, String title) {
    return '$role: $title';
  }

  @override
  String selectionCount(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString items selected',
      one: '1 item selected',
      zero: 'No items selected',
    );
    return '$_temp0';
  }

  @override
  String paginationPosition(int page, int total) {
    final intl.NumberFormat pageNumberFormat = intl.NumberFormat.decimalPattern(
      localeName,
    );
    final String pageString = pageNumberFormat.format(page);
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    return 'Page $pageString of $totalString';
  }

  @override
  String retryCountdown(int seconds) {
    final intl.NumberFormat secondsNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      other: 'Try again in $secondsString seconds',
      one: 'Try again in 1 second',
    );
    return '$_temp0';
  }

  @override
  String lastUpdatedAt(DateTime timestamp) {
    final intl.DateFormat timestampDateFormat = intl.DateFormat(
      'yMMMd Hm',
      localeName,
    );
    final String timestampString = timestampDateFormat.format(timestamp);

    return 'Last updated $timestampString';
  }

  @override
  String get languageSettingTitle => 'Language';

  @override
  String get languageSystemDefault => 'System default';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageArabic => 'العربية';

  @override
  String legalDocumentLanguageNotice(String language) {
    return 'This document is provided by Karar in $language.';
  }

  @override
  String get legalDocumentUnavailable =>
      'This document is not available right now.';

  @override
  String get signInTitle => 'Sign in';

  @override
  String get signInSubtitle =>
      'Use the email address and password for your Karar account.';

  @override
  String get signInAction => 'Sign in';

  @override
  String get signInEmailLabel => 'Email address';

  @override
  String get signInPasswordLabel => 'Password';

  @override
  String get signInForgotPassword => 'Forgot your password?';

  @override
  String get signInCreateAccount => 'Create an account';

  @override
  String get signInInvalidCredentials =>
      'That email address and password did not match an account you can sign in to. Check both and try again.';

  @override
  String get signInSecureStorageNotice =>
      'This device could not open its secure storage, so you have been signed out. Sign in again to continue.';

  @override
  String get signOutAction => 'Sign out';

  @override
  String get signOutConfirmTitle => 'Sign out?';

  @override
  String get signOutConfirmMessage =>
      'You will need your email address and password to sign in again on this device.';

  @override
  String get signOutIncompleteNotice =>
      'You are signed out on this device. We could not reach Karar to end the session everywhere, so review your active sessions when you are back online.';

  @override
  String get registerTitle => 'Create an account';

  @override
  String get registerSubtitle =>
      'We will email a verification code to the address you enter.';

  @override
  String get registerAction => 'Create account';

  @override
  String get registerConfirmPasswordLabel => 'Confirm password';

  @override
  String get registerPasswordHelp => 'At least 8 characters.';

  @override
  String get registerAcknowledgementTitle => 'Check your email';

  @override
  String get registerAcknowledgementMessage =>
      'If that address can be registered, a verification code is on its way. Enter it on the next screen to finish setting up your account.';

  @override
  String get registerBackToSignIn => 'Back to sign in';

  @override
  String get verifyEmailTitle => 'Verify your email';

  @override
  String get verifyEmailSubtitle =>
      'Enter the 8-character code we emailed you. It is not shown anywhere else.';

  @override
  String get verifyEmailCodeLabel => 'Verification code';

  @override
  String get verifyEmailCodeHint => '8 characters';

  @override
  String get verifyEmailAction => 'Verify';

  @override
  String get verifyEmailResendAction => 'Send another code';

  @override
  String get verifyEmailResendAcknowledgement =>
      'If that address needs a code, another one is on its way.';

  @override
  String get verifyEmailInvalidCode =>
      'That code did not verify. It may have expired or already been used.';

  @override
  String get verifyEmailSuccess => 'Your email address is verified.';

  @override
  String get forgotPasswordTitle => 'Reset your password';

  @override
  String get forgotPasswordSubtitle =>
      'Enter your email address and we will send a reset link if the address can receive one.';

  @override
  String get forgotPasswordAction => 'Send reset instructions';

  @override
  String get forgotPasswordAcknowledgementTitle => 'Check your email';

  @override
  String get forgotPasswordAcknowledgementMessage =>
      'If that address can receive a reset, instructions are on their way. The link expires 30 minutes after it is sent.';

  @override
  String get resetPasswordTitle => 'Set a new password';

  @override
  String get resetPasswordSubtitle =>
      'Paste the reset token from your email, then choose a new password.';

  @override
  String get resetPasswordTokenLabel => 'Reset token';

  @override
  String get resetPasswordTokenHint => 'From the email we sent you';

  @override
  String get resetPasswordNewLabel => 'New password';

  @override
  String get resetPasswordAction => 'Set new password';

  @override
  String get resetPasswordInvalidToken =>
      'That reset token is not valid. It may have expired or already been used. Request a new one.';

  @override
  String get resetPasswordSuccessTitle => 'Password changed';

  @override
  String get resetPasswordSuccessMessage =>
      'Every session has been signed out, on this device and on any other. Sign in with your new password.';

  @override
  String get changePasswordTitle => 'Change password';

  @override
  String get changePasswordSubtitle =>
      'Changing your password signs out every other device. This one stays signed in.';

  @override
  String get changePasswordCurrentLabel => 'Current password';

  @override
  String get changePasswordNewLabel => 'New password';

  @override
  String get changePasswordAction => 'Change password';

  @override
  String get changePasswordIncorrectCurrent =>
      'That did not match your current password.';

  @override
  String get changePasswordSuccessTitle => 'Password changed';

  @override
  String get changePasswordSuccessMessage =>
      'Every other device has been signed out.';

  @override
  String get confirmPasswordMismatch => 'The two passwords do not match.';

  @override
  String get passwordEmpty => 'Enter a password.';

  @override
  String passwordTooShort(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'Use at least $countString characters.';
  }

  @override
  String passwordTooLong(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'Use no more than $countString characters.';
  }

  @override
  String get emailEmpty => 'Enter your email address.';

  @override
  String get emailMalformed => 'Enter a complete email address.';

  @override
  String get codeEmpty => 'Enter the code.';

  @override
  String get tokenEmpty => 'Enter the reset token.';

  @override
  String get mfaSecurityTitle => 'Two-step verification';

  @override
  String get mfaEnrolTitle => 'Set up two-step verification';

  @override
  String get mfaEnrolIntro =>
      'Two-step verification asks for a code from your authenticator app each time you sign in.';

  @override
  String get mfaEnrolStepScan =>
      'Add this key to an authenticator app. It is shown once and cannot be retrieved again.';

  @override
  String get mfaEnrolStepConfirm =>
      'Enter the 6-digit code your app shows now.';

  @override
  String get mfaEnrolSecretLabel => 'Setup key';

  @override
  String get mfaEnrolSecretWarning =>
      'Anyone with this key can generate your codes. Do not photograph it or share it.';

  @override
  String get mfaEnrolStartAction => 'Begin setup';

  @override
  String get mfaCodeLabel => 'Verification code';

  @override
  String get mfaCodeHint => '6 digits';

  @override
  String get mfaConfirmAction => 'Turn on two-step verification';

  @override
  String get mfaInvalidCode =>
      'That code did not verify. Check your authenticator app and try again.';

  @override
  String get mfaAlreadyEnrolled =>
      'Two-step verification is already set up on this account.';

  @override
  String get mfaNoPendingEnrolment =>
      'That setup is no longer pending. Start again.';

  @override
  String get mfaRecoveryCodesTitle => 'Your recovery codes';

  @override
  String get mfaRecoveryCodesWarning =>
      'These codes are shown once and never again. Each one signs you in a single time if you lose your authenticator app. Write them down and keep them somewhere only you can reach.';

  @override
  String get mfaRecoveryCodesAcknowledge =>
      'I have saved these codes somewhere safe';

  @override
  String get mfaChallengeTitle => 'Enter your code';

  @override
  String get mfaChallengeSubtitle =>
      'Open your authenticator app and enter the 6-digit code.';

  @override
  String get mfaChallengeUseRecovery => 'Use a recovery code instead';

  @override
  String get mfaChallengeUseTotp => 'Use your authenticator app instead';

  @override
  String get mfaChallengeExpired =>
      'This sign-in attempt timed out. Sign in again to get a new code prompt.';

  @override
  String get mfaChallengeAbandon => 'Back to sign in';

  @override
  String get mfaRecoveryCodeLabel => 'Recovery code';

  @override
  String get mfaRecoveryCodeHint => 'One of the codes you saved';

  @override
  String get mfaRecoveryCodeSubtitle =>
      'Enter one of the recovery codes you saved when you turned on two-step verification. Each code works once.';

  @override
  String get mfaDisableTitle => 'Turn off two-step verification';

  @override
  String get mfaDisableWarning =>
      'Your recovery codes will be destroyed and your account will be protected by your password alone.';

  @override
  String get mfaDisableAction => 'Turn off';

  @override
  String get mfaDisableConfirmTitle => 'Turn off two-step verification?';

  @override
  String get mfaDisableSuccess => 'Two-step verification is off.';

  @override
  String get mfaNotEnrolled =>
      'Two-step verification is not set up on this account.';

  @override
  String get sessionsTitle => 'Active sessions';

  @override
  String get sessionsSubtitle =>
      'Every device currently signed in to your account. Sign out any you do not recognise.';

  @override
  String get sessionsCurrentBadge => 'This device';

  @override
  String get sessionsEmptyTitle => 'No other sessions';

  @override
  String get sessionsEmptyMessage => 'This device is the only one signed in.';

  @override
  String sessionsStartedAt(String time) {
    return 'Signed in $time';
  }

  @override
  String sessionsLastSeenAt(String time) {
    return 'Last active $time';
  }

  @override
  String sessionsExpiresAt(String time) {
    return 'Expires $time';
  }

  @override
  String get sessionsUnknownDevice => 'Unrecognised device';

  @override
  String get sessionsRevokeAction => 'Sign out this device';

  @override
  String get sessionsRevokeConfirmTitle => 'Sign out this device?';

  @override
  String get sessionsRevokeConfirmMessage =>
      'That device will need the account password to sign in again.';

  @override
  String get sessionsRevokeOthersAction => 'Sign out all other devices';

  @override
  String get sessionsRevokeOthersConfirmTitle => 'Sign out all other devices?';

  @override
  String get sessionsRevokeOthersConfirmMessage =>
      'Every device except this one will be signed out immediately.';

  @override
  String get sessionsRevokedNotice => 'That device has been signed out.';

  @override
  String sessionsRevokedOthersNotice(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'Other devices signed out ($countString).';
  }

  @override
  String get sessionsRevokeUnavailable =>
      'That session is no longer active, so there was nothing to sign out.';

  @override
  String get appLockTitle => 'App lock';

  @override
  String get appLockSettingsTitle => 'Lock this app';

  @override
  String get appLockSettingsDescription =>
      'Ask for your device unlock before showing Karar. This is a privacy control on this device only. It never replaces signing in, and Karar never receives your fingerprint or face data.';

  @override
  String get appLockToggleLabel => 'Require device unlock';

  @override
  String get appLockLockedTitle => 'Karar is locked';

  @override
  String get appLockLockedMessage => 'Unlock with your device to continue.';

  @override
  String get appLockUnlockAction => 'Unlock';

  @override
  String get appLockPromptReason => 'Unlock Karar';

  @override
  String get appLockUnavailableTitle => 'App lock is unavailable';

  @override
  String get appLockUnavailableMessage =>
      'This device does not offer an unlock method Karar can use, so the app lock cannot be turned on. Your account stays protected by your password.';

  @override
  String get appLockNotEnrolledMessage =>
      'Set up a screen lock, fingerprint or face unlock in your device settings, then turn this on.';

  @override
  String get appLockCancelled => 'Unlock was cancelled.';

  @override
  String get appLockNotRecognised => 'That was not recognised. Try again.';

  @override
  String get appLockLockedOut =>
      'Your device has blocked further unlock attempts. Sign in with your password instead.';

  @override
  String get appLockSignInInstead => 'Sign in with your password';

  @override
  String get appLockRequiresSession => 'Sign in before changing the app lock.';

  @override
  String get appLockEnableNotSaved =>
      'Karar could not save the app lock on this device, so it is still off. Nothing changed. Try again.';

  @override
  String get appLockDisableNotSaved =>
      'Karar could not save that change on this device, so the app lock is still on. Try again, or use your password on the lock screen if you cannot unlock.';

  @override
  String get securityStateUnavailableTitle =>
      'Karar cannot check its security settings';

  @override
  String get securityStateUnavailableMessage =>
      'This device did not report whether your app lock is on. Karar will not open your account until it can tell, so nothing is shown for now. Try again, and restart the device if it keeps happening.';

  @override
  String get securityRecoveryBlockedTitle =>
      'That session could not be removed';

  @override
  String get securityRecoveryBlockedMessage =>
      'Karar could not delete the stored session on this device, and could not record that you gave it up. Signing in now would not make it safe, so Karar is waiting instead. Try again. If it keeps failing, sign out of this device from another one.';

  @override
  String get sessionEndedTitle => 'You have been signed out';

  @override
  String get sessionEndedExpired =>
      'Your session expired. Sign in again to continue.';

  @override
  String get sessionEndedRevoked =>
      'This session was signed out from another device. If that was not you, change your password after signing in.';

  @override
  String get sessionEndedReuseDetected =>
      'For your security, Karar ended this session and cleared its credentials from this device, because a sign-in token was presented twice. If you did not cause this, change your password and review your active sessions as soon as you sign in.';

  @override
  String get sessionEndedRefreshRejected =>
      'Karar could not renew this session, so it has been ended and its credentials cleared from this device. Sign in again.';

  @override
  String get sessionEndedSignedOut => 'You are signed out.';

  @override
  String get sessionEndedAction => 'Sign in';

  @override
  String get failureOffline =>
      'You appear to be offline. Check your connection and try again.';

  @override
  String get failureTimeout =>
      'That took too long to answer. Check your connection and try again.';

  @override
  String get failureRateLimited =>
      'Too many attempts. Wait a little and try again.';

  @override
  String get failureServiceUnavailable =>
      'Karar could not complete that request. Try again in a moment.';

  @override
  String get failureInvalidRequest =>
      'Check the details you entered and try again.';

  @override
  String get failureNotPermitted => 'You do not have permission to do that.';

  @override
  String get failureNotFound => 'That is no longer available.';

  @override
  String get failureConflict =>
      'That has already changed. Reload and try again.';

  @override
  String get failureSecureStorage =>
      'This device could not open its secure storage, so Karar stopped rather than continue without protecting your credentials. Try again.';

  @override
  String get failureLocalSecurityState =>
      'This device could not confirm its security settings, so Karar stopped rather than continue without them. Try again.';

  @override
  String get failureCancelled => 'That request was cancelled.';

  @override
  String get failureRetrySafe => 'Your session was renewed. Try that again.';

  @override
  String get failureSessionEnded =>
      'Your session ended. Sign in again to continue.';

  @override
  String get failureConsentRequired =>
      'There is an agreement to review before continuing.';

  @override
  String get failureTenantSelection =>
      'Choose an organisation before continuing.';

  @override
  String get failureConfiguration =>
      'This build of Karar is not configured correctly and cannot continue.';

  @override
  String get failureUnexpected => 'Something went wrong. Try again.';

  @override
  String a11yPasswordRules(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'Password. At least $countString characters.';
  }

  @override
  String a11yRecoveryCodePosition(int position, int total) {
    final intl.NumberFormat positionNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String positionString = positionNumberFormat.format(position);
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    return 'Recovery code $positionString of $totalString';
  }

  @override
  String get a11ySensitiveScreen =>
      'Sensitive information. Hidden when Karar is in the background.';

  @override
  String get consentScreenTitle => 'Privacy and consent';

  @override
  String get consentScreenDescription =>
      'What the platform has recorded about your decisions. The documents are published by the operating entity; this application writes none of their wording.';

  @override
  String get consentStateNotRequired => 'No agreement is needed';

  @override
  String get consentStateRequired => 'Your agreement is needed';

  @override
  String get consentStateReconsentRequired =>
      'A new version needs your agreement';

  @override
  String get consentStateActive => 'In force';

  @override
  String get consentStateWithdrawn => 'Withdrawn';

  @override
  String get consentStateUnavailable => 'Could not be checked';

  @override
  String get consentStateDocumentUnavailable => 'No document is published';

  @override
  String get consentStatePolicyNotApproved => 'Cannot be recorded yet';

  @override
  String get consentDescribeNotRequired =>
      'No published document covers this purpose, so nothing is being asked of you here.';

  @override
  String get consentDescribeRequired =>
      'A published version is in force and you have not agreed to it yet.';

  @override
  String get consentDescribeReconsentRequired =>
      'A materially changed version is in force. Your earlier agreement no longer covers it.';

  @override
  String get consentDescribeActive =>
      'The platform holds your agreement to the version shown.';

  @override
  String get consentDescribeWithdrawn =>
      'You withdrew your agreement. The platform still permits nothing under it.';

  @override
  String get consentDescribeUnavailable =>
      'The platform did not answer, so nothing is shown and nothing can be agreed to here.';

  @override
  String get consentDescribeDocumentUnavailable =>
      'The document that would apply has no published version, so there is nothing to read and nothing to agree to.';

  @override
  String get consentDescribePolicyNotApproved =>
      'The platform cannot record an agreement for this purpose yet, so no control is offered.';

  @override
  String get consentNothingToAgreeTitle =>
      'Nothing is waiting for your agreement';

  @override
  String get consentNothingToAgreeDescription =>
      'The platform lists no document that applies to your account right now.';

  @override
  String get consentPurposeLabel => 'Purpose';

  @override
  String get consentDocumentLabel => 'Document';

  @override
  String get consentVersionLabel => 'Version';

  @override
  String get consentEffectiveFromLabel => 'In effect from';

  @override
  String get consentPublishedByLabel => 'Published by';

  @override
  String get consentRegimeLabel => 'Regime';

  @override
  String get consentRequiredActionLabel => 'Required action';

  @override
  String get consentActionReacceptance => 'A new agreement is required';

  @override
  String get consentActionNotice => 'For your information';

  @override
  String get consentActionNone => 'Nothing is required of you';

  @override
  String get consentActionUnstated => 'Not stated by the platform';

  @override
  String get consentAcceptAction => 'Agree to this version';

  @override
  String get consentWithdrawAction => 'Withdraw agreement';

  @override
  String get consentAcceptedConfirmation =>
      'The platform recorded your agreement.';

  @override
  String get consentWithdrawnConfirmation =>
      'The platform recorded your withdrawal.';

  @override
  String get consentHistoryPreservedNote =>
      'The earlier record is kept as evidence and is not deleted.';

  @override
  String get consentReconsentCreatesNewGrantNote =>
      'Agreeing creates a new record against the new version. The earlier record is unchanged.';

  @override
  String get consentNoticeRequiredNote =>
      'A newer version has been published for your information. Your existing agreement still applies.';

  @override
  String get consentBlockerJurisdiction =>
      'No jurisdiction is assigned to your account, so no policy resolves for you yet.';

  @override
  String get consentBlockerPolicy =>
      'No approved policy is in effect, so the platform can record no agreement.';

  @override
  String get consentBlockerEntity =>
      'No operating entity is assigned, so an agreement would name no publisher.';

  @override
  String get consentSurfaceUnavailableTitle => 'Consent could not be checked';

  @override
  String get consentSurfaceUnavailableDescription =>
      'The platform did not answer. Nothing has changed about what you have agreed to.';

  @override
  String get consentActionFailedTitle => 'That was not recorded';

  @override
  String get consentActionFailedDescription =>
      'The platform did not record the change, so nothing about your agreement has changed.';

  @override
  String get consentGrantReferenceLabel => 'Record reference';

  @override
  String get platformHomeTitle => 'Your account';

  @override
  String get platformSectionServices => 'Services';

  @override
  String get platformSectionAccount => 'Account and profile';

  @override
  String get platformSectionSession => 'Security and session';

  @override
  String get platformSectionOrganisation => 'Organisation';

  @override
  String get platformSectionJurisdiction => 'Jurisdiction';

  @override
  String get platformSectionLegal => 'Legal and operating entity';

  @override
  String get platformSectionConsent => 'Privacy and consent';

  @override
  String get platformSectionSettings => 'Settings';

  @override
  String get platformNoServicesTitle => 'No services are available to you';

  @override
  String get platformNoServicesDescription =>
      'Your account is in order. The platform has confirmed that no service is enabled for it yet, so there is nothing here to open.';

  @override
  String get platformCapabilitiesUnresolvedTitle =>
      'Services could not be checked';

  @override
  String get platformCapabilitiesUnresolvedDescription =>
      'The platform did not confirm which services apply to you, so none are shown. Nothing has changed on your account.';

  @override
  String get platformServiceUnavailableTitle => 'The service is unavailable';

  @override
  String get platformServiceUnavailableDescription =>
      'Your platform context could not be loaded, so nothing is shown rather than something that may be wrong. Your account and your data are unaffected.';

  @override
  String get platformServiceUnavailableFinalDescription =>
      'Your platform context could not be loaded, and the platform reported that trying again now will not change that. Close the application and open it again later.';

  @override
  String get platformActionStartOver => 'Start over';

  @override
  String get platformProfileRowTitle => 'Profile';

  @override
  String get platformProfileRowSubtitle =>
      'Your name, language and account status';

  @override
  String get platformSessionActive => 'Signed in on this device';

  @override
  String get platformSessionReferenceLabel => 'Session reference';

  @override
  String get platformUserReferenceLabel => 'Account reference';

  @override
  String get platformOrganisationRowSubtitle =>
      'The organisation this session is bound to';

  @override
  String get platformOrganisationUnbound =>
      'This session is not bound to an organisation';

  @override
  String get platformRoleHintLabel => 'Role';

  @override
  String get platformJurisdictionNone => 'Not assigned';

  @override
  String get platformJurisdictionUnverified => 'Declared, not verified';

  @override
  String get platformJurisdictionVerified => 'Verified';

  @override
  String get platformJurisdictionUnrecognised =>
      'Not recognised by this version';

  @override
  String get platformJurisdictionRowSubtitle =>
      'The regime that governs your account';

  @override
  String get platformJurisdictionScreenTitle => 'Jurisdiction';

  @override
  String get platformJurisdictionReferenceLabel => 'Jurisdiction reference';

  @override
  String get platformJurisdictionDeclareTitle => 'Declare your jurisdiction';

  @override
  String get platformJurisdictionDeclareDescription =>
      'A declaration records where you say you are. It is not verified, and it grants no additional access on its own.';

  @override
  String get platformJurisdictionDeclareAction => 'Record declaration';

  @override
  String get platformJurisdictionSelectionUnavailable =>
      'The platform did not supply the jurisdictions available for selection, so none can be offered here.';

  @override
  String get platformJurisdictionRecorded => 'Your declaration was recorded.';

  @override
  String get platformJurisdictionAlreadyInEffect =>
      'That jurisdiction was already in effect, so nothing changed.';

  @override
  String get platformJurisdictionRemainsUnverified =>
      'Recorded as declared by you, and unverified.';

  @override
  String get platformLegalScreenTitle => 'Legal';

  @override
  String get platformLegalRowSubtitle =>
      'Who you contracted with, and the documents that apply';

  @override
  String get platformOperatingEntityHeading => 'Operating entity';

  @override
  String get platformOperatingEntityNameLabel => 'Registered legal name';

  @override
  String get platformOperatingEntityJurisdictionLabel => 'Registered in';

  @override
  String get platformOperatingEntityContactLabel => 'Data protection contact';

  @override
  String get platformOperatingEntityAssignedNote =>
      'This is the legal person you contracted with, as recorded by the platform.';

  @override
  String get platformOperatingEntityUnassignedTitle =>
      'No operating entity is assigned';

  @override
  String get platformOperatingEntityUnassignedDescription =>
      'No contracting entity is recorded for your account yet.';

  @override
  String get platformOperatingEntityUnavailableTitle =>
      'The operating entity could not be read';

  @override
  String get platformOperatingEntityUnavailableDescription =>
      'The platform could not confirm which legal person you contracted with, so none is shown.';

  @override
  String get platformOperatingEntityUnrecognisedTitle =>
      'The operating entity is not recognised';

  @override
  String get platformOperatingEntityUnrecognisedDescription =>
      'The platform reported a state this version of the application does not recognise, so nothing is shown.';

  @override
  String get platformPolicyPackHeading => 'Governing policy';

  @override
  String get platformPolicyPackVersionLabel => 'Version';

  @override
  String get platformPolicyPackStatusLabel => 'Status';

  @override
  String get platformPolicyPackAbsent => 'None in effect';

  @override
  String get platformConsentRowSubtitle =>
      'What you have agreed to, and what is outstanding';

  @override
  String get platformSettingsRowSubtitle => 'Language, appearance and account';

  @override
  String get profileScreenTitle => 'Profile';

  @override
  String get profileDisplayNameLabel => 'Display name';

  @override
  String get profileDisplayNameHelper =>
      'The name shown to people in your organisation.';

  @override
  String get profileLanguageLabel => 'Language recorded on your account';

  @override
  String get profileAccountStatusLabel => 'Account status';

  @override
  String get profileResidencyLabel => 'Residency reference';

  @override
  String get profileOrganisationLabel => 'Organisation';

  @override
  String get profileAccountReferenceLabel => 'Account reference';

  @override
  String get profileMemberSinceLabel => 'Account created';

  @override
  String get profileLastUpdatedLabel => 'Last updated';

  @override
  String get profileStatusActive => 'Active';

  @override
  String get profileStatusDisableRequested => 'Disable requested';

  @override
  String get profileStatusDeletionRequested => 'Deletion requested';

  @override
  String get profileStatusDisabled => 'Disabled';

  @override
  String get profileStatusUnrecognised => 'Not recognised by this version';

  @override
  String get profileStatusDisableRequestedNote =>
      'Your request has been recorded. Nothing has been disabled or removed by it yet.';

  @override
  String get profileSaveConfirmation => 'Your profile was updated.';

  @override
  String get profileSaveFailedTitle => 'Your profile was not updated';

  @override
  String get profileSaveFailedDescription =>
      'The platform did not accept the change. Nothing changed.';

  @override
  String get profileNoChangesTitle => 'Nothing to save';

  @override
  String get profileNoChangesDescription => 'Change a field before saving.';

  @override
  String get profileUnavailableTitle => 'Your profile could not be loaded';

  @override
  String get profileUnavailableDescription =>
      'The platform did not answer. Nothing has changed.';

  @override
  String get profileNotStated => 'Not stated';

  @override
  String get settingsScreenTitle => 'Settings';

  @override
  String get settingsAppearanceTitle => 'Appearance';

  @override
  String get settingsThemeSystem => 'Follow the device';

  @override
  String get settingsThemeLight => 'Light';

  @override
  String get settingsThemeDark => 'Dark';

  @override
  String get settingsYourAccountTitle => 'Your account';

  @override
  String get settingsProfileRow => 'Profile';

  @override
  String get settingsOrganisationRow => 'Organisation';

  @override
  String get settingsJurisdictionRow => 'Jurisdiction';

  @override
  String get settingsLegalRow => 'Legal and operating entity';

  @override
  String get settingsConsentRow => 'Privacy and consent';

  @override
  String get settingsDangerTitle => 'Closing your account';

  @override
  String get settingsDisableTitle => 'Request that your account is disabled';

  @override
  String get settingsDisableDescription =>
      'This records your intention. Nothing is disabled or removed by the request itself, and you stay signed in.';

  @override
  String get settingsDisableAction => 'Request account disable';

  @override
  String get settingsDisableConfirmTitle => 'Record this request?';

  @override
  String get settingsDisableConfirmMessage =>
      'Your request will be recorded against your account. Nothing is disabled or removed by recording it.';

  @override
  String get settingsDisableRecordedTitle => 'Your request was recorded';

  @override
  String get settingsDisableRecordedMessage =>
      'The platform has your request. Nothing has been disabled or removed.';

  @override
  String get settingsDisableAuditWarning =>
      'The request was recorded, but the platform could not write its audit entry. Quote this to support if you follow it up.';

  @override
  String get settingsDisableFailedTitle => 'Your request was not recorded';

  @override
  String get settingsDisableFailedMessage =>
      'The platform did not accept the request. Nothing changed.';

  @override
  String get tenantSelectionTitle => 'Choose an organisation';

  @override
  String get tenantSelectionDescription =>
      'Your account belongs to more than one organisation. Choose the one to use for this session. Only the organisations the platform listed for you appear here.';

  @override
  String get tenantNoMembershipTitle =>
      'You do not belong to an organisation yet';

  @override
  String get tenantNoMembershipDescription =>
      'Your account is in order, but no organisation has admitted it. Until one does, this session stays unbound and anything belonging to an organisation stays unavailable.';

  @override
  String get tenantOrganisationTitle => 'Organisation';

  @override
  String get tenantCurrentOrganisationLabel => 'Current organisation';

  @override
  String get tenantRoleLabel => 'Role';

  @override
  String tenantRoleValuePattern(String label, String value) {
    return '$label: $value';
  }

  @override
  String get tenantUnboundTitle =>
      'This session is not bound to an organisation';

  @override
  String get tenantUnboundDescription =>
      'Nothing that belongs to an organisation is available while the session is unbound.';

  @override
  String get tenantSwitchHeading => 'Switch organisation';

  @override
  String get tenantSwitchDescription =>
      'Switching ends the current session and starts a new one in the other organisation. Everything loaded for the current organisation is discarded, and this device is signed in again automatically.';

  @override
  String get tenantSwitchAction => 'Switch';

  @override
  String get tenantNoAlternativesTitle => 'No other organisation is available';

  @override
  String get tenantNoAlternativesDescription =>
      'The platform lists no other membership for your account, so there is nothing to switch to.';

  @override
  String get tenantBoundConfirmation =>
      'This session is now bound to the organisation.';

  @override
  String get tenantSwitchedConfirmation =>
      'You are now in the other organisation, in a new session. The previous session has ended.';

  @override
  String get tenantSelectionFailedTitle =>
      'The organisation could not be selected';

  @override
  String get tenantSelectionFailedDescription =>
      'The platform refused the selection. Nothing changed.';

  @override
  String get tenantMembershipChangedTitle =>
      'Your membership changed during the switch';

  @override
  String get tenantMembershipChangedDescription =>
      'Your access to that organisation changed while the switch was in progress, so the session was ended rather than left without a membership. Sign in again.';

  @override
  String get tenantMembershipRefusedTitle =>
      'That organisation is not available to you';

  @override
  String get tenantMembershipRefusedDescription =>
      'The platform did not accept the selection. Nothing about your session changed.';

  @override
  String get tenantSelectSemanticPrefix => 'Select organisation';

  @override
  String get tenantInvitationHeading => 'Redeem an invitation';

  @override
  String get tenantInvitationDescription =>
      'If an organisation invited you, enter the code from that invitation. The invitation itself decides which organisation you join.';

  @override
  String get tenantInvitationFieldLabel => 'Invitation code';

  @override
  String get tenantInvitationAction => 'Redeem invitation';

  @override
  String get tenantInvitationRedeemed =>
      'The invitation was redeemed. Your memberships are being re-checked.';

  @override
  String get tenantInvitationFailedTitle =>
      'The invitation could not be redeemed';

  @override
  String get tenantInvitationFailedDescription =>
      'The code was not accepted. It may have been used already, withdrawn, or issued for a different account.';
}
