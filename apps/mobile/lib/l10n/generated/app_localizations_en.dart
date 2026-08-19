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

  @override
  String get financialHomeTabHome => 'Home';

  @override
  String get financialHomeTabAccounts => 'Accounts';

  @override
  String get financialUnavailableTitle => 'Not available';

  @override
  String get financialUnavailableDescription =>
      'This part of Karar is not available for your account.';

  @override
  String get financialUnavailableAction => 'Go back';

  @override
  String get accountsScreenTitle => 'Accounts & Wallets';

  @override
  String get accountsEmptyTitle => 'No accounts yet';

  @override
  String get accountsEmptyDescription =>
      'Add an account by hand to start keeping track of it.';

  @override
  String get accountsFilteredEmptyTitle => 'Nothing matches these filters';

  @override
  String get accountsFilteredEmptyDescription =>
      'Clear the filters to see everything you hold.';

  @override
  String get accountsUnavailableTitle => 'Accounts could not be loaded';

  @override
  String get accountsUnavailableDescription =>
      'Karar could not read your accounts just now.';

  @override
  String get accountsGroupByLabel => 'Group by';

  @override
  String get accountsFiltersLabel => 'Filters';

  @override
  String get accountsFiltersClear => 'Clear filters';

  @override
  String financialFiltersActiveCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count filters applied',
      one: '1 filter applied',
      zero: 'No filters applied',
    );
    return '$_temp0';
  }

  @override
  String get accountsAddManualAction => 'Add an account by hand';

  @override
  String get accountsPerCurrencyNoticeTitle => 'Shown per currency';

  @override
  String get accountsPerCurrencyNoticeDescription =>
      'Karar keeps each currency separate. It does not convert between currencies and does not add them together.';

  @override
  String get accountsFilterAllOption => 'All';

  @override
  String get groupByIssuer => 'Issuer';

  @override
  String get groupByIssuerKind => 'Issuer kind';

  @override
  String get groupByAccountType => 'Account type';

  @override
  String get groupByWalletKind => 'Wallet kind';

  @override
  String get groupByNature => 'Nature';

  @override
  String get groupByCurrency => 'Currency';

  @override
  String get groupByLifecycle => 'Status';

  @override
  String get groupByOrigin => 'Source';

  @override
  String get accountTypeCurrent => 'Current account';

  @override
  String get accountTypeSavings => 'Savings account';

  @override
  String get accountTypeCreditCard => 'Credit card account';

  @override
  String get accountTypeCash => 'Cash';

  @override
  String get accountTypeWallet => 'Wallet';

  @override
  String get accountTypeOther => 'Other';

  @override
  String get accountTypeUnrecognised => 'Type not recognised';

  @override
  String get walletKindMobileMoney => 'Mobile money';

  @override
  String get walletKindEMoney => 'Electronic money';

  @override
  String get walletKindPrepaid => 'Prepaid';

  @override
  String get walletKindPayroll => 'Payroll';

  @override
  String get walletKindSuperApp => 'Super app';

  @override
  String get walletKindOther => 'Other wallet';

  @override
  String get walletKindUnrecognised => 'Wallet kind not recognised';

  @override
  String get walletKindNone => 'Not a wallet';

  @override
  String get accountNatureAsset => 'Asset';

  @override
  String get accountNatureLiability => 'Liability';

  @override
  String get accountNatureNotStated => 'Not stated';

  @override
  String get accountNatureUnrecognised => 'Nature not recognised';

  @override
  String get accountLifecycleActive => 'Active';

  @override
  String get accountLifecycleArchived => 'Archived';

  @override
  String get accountLifecycleClosed => 'Closed';

  @override
  String get accountLifecycleUnrecognised => 'Status not recognised';

  @override
  String get issuerKindBank => 'Bank';

  @override
  String get issuerKindEMoneyIssuer => 'Electronic money issuer';

  @override
  String get issuerKindMobileMoneyOperator => 'Mobile money operator';

  @override
  String get issuerKindTelcoFinancialServices => 'Telecom financial services';

  @override
  String get issuerKindPaymentInstitution => 'Payment institution';

  @override
  String get issuerKindFintechWallet => 'Fintech wallet';

  @override
  String get issuerKindCardIssuer => 'Card issuer';

  @override
  String get issuerKindExchangeHouse => 'Exchange house';

  @override
  String get issuerKindOther => 'Other institution';

  @override
  String get issuerKindUnrecognised => 'Issuer kind not recognised';

  @override
  String get issuerKindNone => 'No issuer named';

  @override
  String get issuerNotStated => 'No issuer named';

  @override
  String get issuerUnlistedHint => 'Named by you';

  @override
  String get issuerRetiredHint => 'No longer offered';

  @override
  String get accountMaskLabel => 'Reference';

  @override
  String get accountMaskAbsent => 'Not provided';

  @override
  String get accountMaskWithheld => 'Withheld';

  @override
  String get accountMaskNeverFullNumber =>
      'Karar never shows a full account, card or IBAN number.';

  @override
  String get balancesSectionTitle => 'Balances reported by sources';

  @override
  String get balancesEmptyTitle => 'No balance reported';

  @override
  String get balancesEmptyDescription =>
      'No source has reported a figure for this account yet.';

  @override
  String get balancesNoTotalNotice =>
      'Each figure is what one source reported, for the kind it reported. Karar does not add them together.';

  @override
  String get balanceKindBooked => 'Booked';

  @override
  String get balanceKindAvailable => 'Available';

  @override
  String get balanceKindCurrent => 'Current';

  @override
  String get balanceKindOutstanding => 'Outstanding';

  @override
  String get balanceKindCreditLimit => 'Credit limit';

  @override
  String get balanceKindOtherSourceReported => 'Other kind reported';

  @override
  String get balanceKindUnrecognised => 'Kind not recognised';

  @override
  String balanceAsOfLabel(String when) {
    return 'True as of $when';
  }

  @override
  String balanceCapturedLabel(String when) {
    return 'Recorded by Karar on $when';
  }

  @override
  String get balanceOlderReportsLabel => 'Earlier reports';

  @override
  String get dataOriginManuallyAdded => 'Manually added';

  @override
  String get dataOriginImportedFromStatement => 'Imported from statement';

  @override
  String get dataOriginFileImportOnly => 'File import only';

  @override
  String get dataOriginNotStated => 'Source not stated';

  @override
  String get sourceSectionTitle => 'Where this data comes from';

  @override
  String get sourceLastSynchronisedLabel => 'Data last arrived';

  @override
  String get sourceNeverImportedTitle => 'No import has completed yet';

  @override
  String get sourceNoneObservedTitle => 'No source feeds this account';

  @override
  String get sourceNoLiveLinkNotice =>
      'Karar has no live link to any bank, wallet or card issuer. Data arrives only when you enter it or import a file.';

  @override
  String get sourceStatusPendingConfirmation => 'Awaiting your confirmation';

  @override
  String get sourceStatusAttached => 'Attached to this account';

  @override
  String get sourceStatusDeclined => 'Declined';

  @override
  String get sourceStatusDormant => 'Dormant';

  @override
  String get sourceStatusUnrecognised => 'Status not recognised';

  @override
  String get sourceAuthorityAuthoritative => 'Authoritative';

  @override
  String get sourceAuthoritySupplemental => 'Supplemental';

  @override
  String get sourceAuthorityUnverified => 'Unverified';

  @override
  String get sourceAuthorityUnrecognised => 'Weight not recognised';

  @override
  String get sourceCoverageLabel => 'Days covered';

  @override
  String sourceCoverageRange(String start, String end) {
    return '$start to $end';
  }

  @override
  String get sourceCoverageNone => 'Nothing supplied yet';

  @override
  String get sourceBalanceObservationLabel => 'Balances seen';

  @override
  String get sourcePendingObservationLabel => 'Pending transactions seen';

  @override
  String get sourceObservationObserved => 'Seen';

  @override
  String get sourceObservationNotObserved => 'Not seen';

  @override
  String get sourceObservationNotProvided => 'Never offered';

  @override
  String get sourceObservationUnrecognised => 'Not recognised';

  @override
  String get instrumentsSectionTitle => 'What spends from this account';

  @override
  String get instrumentsEmptyTitle => 'No cards or payment identities';

  @override
  String get instrumentsNoBalanceNotice =>
      'A card holds no balance of its own. The balance belongs to the account above.';

  @override
  String instrumentsCountLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count instruments',
      one: '1 instrument',
      zero: 'No instruments',
    );
    return '$_temp0';
  }

  @override
  String get instrumentTypePhysicalCard => 'Physical card';

  @override
  String get instrumentTypeVirtualCard => 'Virtual card';

  @override
  String get instrumentTypePrepaidCard => 'Prepaid card';

  @override
  String get instrumentTypeTokenizedCard => 'Tokenized card';

  @override
  String get instrumentTypeQrPaymentIdentity => 'QR payment identity';

  @override
  String get instrumentTypeOther => 'Other instrument';

  @override
  String get instrumentTypeUnrecognised => 'Type not recognised';

  @override
  String get instrumentStatusActive => 'Active';

  @override
  String get instrumentStatusSuspended => 'Suspended';

  @override
  String get instrumentStatusExpired => 'Expired';

  @override
  String get instrumentStatusCancelled => 'Cancelled';

  @override
  String get instrumentStatusUnrecognised => 'Status not recognised';

  @override
  String get instrumentSpendable => 'Can be used to spend';

  @override
  String get instrumentNotSpendable => 'Cannot be used to spend';

  @override
  String get accountDetailTitle => 'Account';

  @override
  String get accountDetailIdentitySection => 'Details';

  @override
  String get accountDetailEditAction => 'Edit account';

  @override
  String get accountDetailRecentTransactions => 'Recent transactions';

  @override
  String get accountDetailSeeAllTransactions => 'See all transactions';

  @override
  String get accountDetailUnavailableTitle => 'Account could not be loaded';

  @override
  String get accountDetailUnavailableDescription =>
      'Karar could not read this account just now.';

  @override
  String get accountCurrencyLabel => 'Currency';

  @override
  String get accountTypeFieldLabel => 'Type';

  @override
  String get accountWalletKindFieldLabel => 'Wallet kind';

  @override
  String get accountNatureFieldLabel => 'Nature';

  @override
  String get accountLifecycleFieldLabel => 'Status';

  @override
  String get accountIssuerFieldLabel => 'Issuer';

  @override
  String get accountSourceFieldLabel => 'Source';

  @override
  String get accountCreatedLabel => 'Added';

  @override
  String get accountUpdatedLabel => 'Last changed';

  @override
  String get accountFormCreateTitle => 'Add an account';

  @override
  String get accountFormEditTitle => 'Edit account';

  @override
  String get accountFormDisplayNameLabel => 'Name';

  @override
  String get accountFormDisplayNameHelper => 'Only you see this name.';

  @override
  String get accountFormTypeLabel => 'Type';

  @override
  String get accountFormWalletKindLabel => 'Wallet kind';

  @override
  String get accountFormWalletKindHelper => 'Only a wallet has a wallet kind.';

  @override
  String get accountFormNatureLabel => 'Nature';

  @override
  String get accountFormCurrencyLabel => 'Currency';

  @override
  String get accountFormCurrencyHelper => 'A three-letter code, such as QAR.';

  @override
  String get accountFormMaskLabel => 'Reference';

  @override
  String get accountFormMaskHelper =>
      'A short masked tail only. Never a full account, card or IBAN number.';

  @override
  String get accountFormIssuerLabel => 'Issuer';

  @override
  String get accountFormIssuerCatalogueOption => 'Choose a reviewed issuer';

  @override
  String get accountFormIssuerUnlistedOption => 'Name an issuer yourself';

  @override
  String get accountFormIssuerNoneOption => 'No issuer';

  @override
  String get accountFormIssuerUnlistedLabel => 'Issuer name';

  @override
  String get accountFormIssuersUnavailable =>
      'The reviewed issuer list could not be loaded. You can still name an issuer yourself.';

  @override
  String get accountFormValidationSummaryTitle => 'Check these fields';

  @override
  String get accountFormErrorDisplayName => 'Enter a name for this account.';

  @override
  String get accountFormErrorCurrency => 'Enter a three-letter currency code.';

  @override
  String get accountFormErrorWalletKindRequired => 'Choose a wallet kind.';

  @override
  String get accountFormErrorWalletKindNotAllowed =>
      'Only a wallet has a wallet kind.';

  @override
  String get accountFormErrorIssuerNamedTwice =>
      'Choose a reviewed issuer or type one, not both.';

  @override
  String get accountFormSaved => 'Saved.';

  @override
  String get accountFormVersionConflict =>
      'This account changed while you were editing it. Reload it and try again.';

  @override
  String get accountFormNoChange => 'Nothing has changed yet.';

  @override
  String get accountFormRejected => 'Karar could not save this account.';

  @override
  String get accountFormCurrencyImmutable =>
      'The currency cannot be changed once an account holds records.';

  @override
  String get transactionsScreenTitle => 'Transactions';

  @override
  String get transactionsEmptyTitle => 'No transactions yet';

  @override
  String get transactionsEmptyDescription =>
      'Record a transaction to start keeping track.';

  @override
  String get transactionsFilteredEmptyTitle => 'Nothing matches these filters';

  @override
  String get transactionsFilteredEmptyDescription =>
      'Clear the filters to see everything recorded.';

  @override
  String get transactionsUnavailableTitle => 'Transactions could not be loaded';

  @override
  String get transactionsUnavailableDescription =>
      'Karar could not read your transactions just now.';

  @override
  String get transactionsLoadMoreAction => 'Load more';

  @override
  String get transactionsAddManualAction => 'Record a transaction';

  @override
  String get transactionDetailTitle => 'Transaction';

  @override
  String get transactionDetailUnavailableTitle =>
      'Transaction could not be loaded';

  @override
  String get transactionDetailUnavailableDescription =>
      'Karar could not read this transaction just now.';

  @override
  String get transactionAmountLabel => 'Amount';

  @override
  String get transactionOriginalAmountLabel => 'As the source stated it';

  @override
  String get transactionOriginalAmountNotice =>
      'The source used a different currency. Karar shows both and converts neither.';

  @override
  String get transactionBookedOnLabel => 'Booked on';

  @override
  String get transactionValueDateLabel => 'Value date';

  @override
  String get transactionEventOccurredLabel => 'Source timestamp';

  @override
  String get transactionSourceTimezoneLabel => 'Source time zone';

  @override
  String get transactionDescriptionLabel => 'Description';

  @override
  String get transactionMerchantLabel => 'Merchant';

  @override
  String get transactionNoteLabel => 'Note';

  @override
  String get transactionAccountLabel => 'Account';

  @override
  String get transactionStatusPosted => 'Posted';

  @override
  String get transactionStatusVoided => 'Voided';

  @override
  String get transactionStatusUnrecognised => 'Status not recognised';

  @override
  String get directionMoneyIn => 'Money in';

  @override
  String get directionMoneyOut => 'Money out';

  @override
  String get directionUnrecognised => 'Direction not recognised';

  @override
  String get transactionCategoryLabel => 'Category';

  @override
  String get transactionCategoryNone => 'No category';

  @override
  String get transactionCategoryChangeAction => 'Choose a category';

  @override
  String get transactionCategoryByUser => 'Chosen by you';

  @override
  String get transactionCategoryByRule => 'Set by a rule';

  @override
  String get transactionCategoryBySourceUnrecognised => 'Source not recognised';

  @override
  String get transactionCategoryRuleVersionLabel => 'Rule version';

  @override
  String get transactionRevisionsTitle => 'History';

  @override
  String transactionRevisionNumber(int number) {
    return 'Revision $number';
  }

  @override
  String get transactionRevisionSourceImport => 'From an imported statement';

  @override
  String get transactionRevisionManualEntry => 'Entered by hand';

  @override
  String get transactionRevisionUserInput => 'Corrected by you';

  @override
  String get transactionRevisionUnrecognised => 'Origin not recognised';

  @override
  String transactionRevisionChangedFields(String fields) {
    return 'Changed: $fields';
  }

  @override
  String get transactionRevisionNoChangedFields => 'Originally recorded';

  @override
  String get transactionDivergesFromSource =>
      'You have corrected a value the source supplied. The values from the source are kept in the history.';

  @override
  String get revisableFieldAmount => 'amount';

  @override
  String get revisableFieldBookingDate => 'booking date';

  @override
  String get revisableFieldValueDate => 'value date';

  @override
  String get revisableFieldMerchant => 'merchant';

  @override
  String get revisableFieldDescription => 'description';

  @override
  String get revisableFieldNote => 'note';

  @override
  String get revisableFieldStatus => 'status';

  @override
  String get revisableFieldUnrecognised => 'a field not recognised';

  @override
  String get transactionProvenanceTitle => 'Provenance';

  @override
  String get transactionProvenanceUnavailable =>
      'Provenance could not be loaded';

  @override
  String get provenanceImportedFromStatement => 'Came from a statement file';

  @override
  String get provenanceNotImportedFromStatement =>
      'Did not come from a statement file';

  @override
  String get provenanceSourceDirectionLabel => 'Direction the source stated';

  @override
  String get sourceDirectionDebit => 'Debit';

  @override
  String get sourceDirectionCredit => 'Credit';

  @override
  String get sourceDirectionNotStated => 'Not stated';

  @override
  String get sourceDirectionUnrecognised => 'Not recognised';

  @override
  String get provenanceDirectionMappingLabel => 'How the direction was decided';

  @override
  String get directionMappingManualEntry => 'Entered by hand';

  @override
  String get directionMappingSourceDirectionWord =>
      'From the wording used by the source';

  @override
  String get directionMappingSourceSignedAmount =>
      'From the sign used by the source';

  @override
  String get directionMappingSourceSignedAmountInverted =>
      'From the sign used by the source, inverted';

  @override
  String get directionMappingUnrecognised => 'Not recognised';

  @override
  String get provenanceVersionsLabel => 'Processing versions';

  @override
  String get provenanceParserVersionLabel => 'Parser';

  @override
  String get provenanceMappingVersionLabel => 'Mapping';

  @override
  String get provenanceNormalizationVersionLabel => 'Normalization';

  @override
  String get provenanceFingerprintVersionLabel => 'Duplicate check';

  @override
  String get transactionCorrectAction => 'Correct this transaction';

  @override
  String get transactionCorrectTitle => 'Correct transaction';

  @override
  String get transactionCorrectNotice =>
      'A correction is added to the history. Nothing is overwritten.';

  @override
  String get transactionCorrectionSaved => 'Correction recorded.';

  @override
  String get transactionVersionConflict =>
      'This transaction changed while you were editing it. Reload it and try again.';

  @override
  String get transactionNoChange => 'Nothing has changed yet.';

  @override
  String get transactionRejected => 'Karar could not save this transaction.';

  @override
  String get transactionDeleteAction => 'Delete transaction';

  @override
  String get transactionDeleteConfirmTitle => 'Delete this transaction?';

  @override
  String get transactionDeleteConfirmMessage =>
      'The transaction and any transfer matches naming it will be removed.';

  @override
  String get transactionDeleted => 'Deleted.';

  @override
  String get transactionDeletePartial =>
      'Only part of this deletion completed. Some related records may remain.';

  @override
  String get transactionFormCreateTitle => 'Record a transaction';

  @override
  String get transactionFormAccountLabel => 'Account';

  @override
  String get transactionFormMagnitudeLabel => 'Amount';

  @override
  String get transactionFormMagnitudeHelper =>
      'A positive amount, in the currency of the account. Choose below whether it came in or went out.';

  @override
  String get transactionFormDirectionLabel => 'Direction';

  @override
  String get transactionFormBookingDateLabel => 'Booked on';

  @override
  String get transactionFormValueDateLabel => 'Value date';

  @override
  String get transactionFormDayHelper => 'A calendar day, as YYYY-MM-DD.';

  @override
  String get transactionFormDescriptionLabel => 'Description';

  @override
  String get transactionFormMerchantLabel => 'Merchant';

  @override
  String get transactionFormNoteLabel => 'Note';

  @override
  String get transactionFormOptionalHelper => 'Optional.';

  @override
  String get transactionFormValidationSummaryTitle => 'Check these fields';

  @override
  String get transactionFormErrorAccount => 'Choose an account.';

  @override
  String get transactionFormErrorDescription => 'Enter a description.';

  @override
  String get transactionFormErrorDirection =>
      'Choose whether money came in or went out.';

  @override
  String get transactionFormErrorMagnitude => 'Enter a positive amount.';

  @override
  String get transactionFormErrorBookingDate =>
      'Enter the day it was booked, as YYYY-MM-DD.';

  @override
  String get transactionFormErrorValueDate =>
      'Enter the value date as YYYY-MM-DD, or leave it empty.';

  @override
  String get transactionFormSaved => 'Recorded.';

  @override
  String get transactionFormNoAccounts =>
      'Add an account before recording a transaction.';

  @override
  String get transactionFiltersTitle => 'Filters';

  @override
  String get transactionFilterDirectionLabel => 'Direction';

  @override
  String get transactionFilterStatusLabel => 'Status';

  @override
  String get transactionFilterCurrencyLabel => 'Currency';

  @override
  String get transactionFilterSourceLabel => 'Source';

  @override
  String get transactionFilterAccountLabel => 'Account';

  @override
  String get categoryPickerTitle => 'Choose a category';

  @override
  String get categorySearchLabel => 'Search categories';

  @override
  String get categoriesEmptyTitle => 'No categories available';

  @override
  String get categoriesEmptyDescription =>
      'The reviewed catalogue offers nothing to choose right now.';

  @override
  String get categoriesUnavailableTitle => 'Categories could not be loaded';

  @override
  String get categoriesUnavailableDescription =>
      'Karar could not read the category catalogue just now.';

  @override
  String get categoryRetiredHint => 'No longer offered';

  @override
  String get categoryAssigned => 'Category saved.';

  @override
  String get categoryAssignmentWins => 'Your own choice already stands.';

  @override
  String get categoryUnknown => 'That category is not available.';

  @override
  String get categoryCatalogueVersionLabel => 'Catalogue version';

  @override
  String a11yFinancialAmount(String amount, String direction) {
    return '$amount, $direction';
  }

  @override
  String a11yAccountSummary(String name, String type, String currency) {
    return '$name, $type, $currency';
  }

  @override
  String a11yBalanceSummary(String kind, String amount, String asOf) {
    return '$kind, $amount, $asOf';
  }

  @override
  String a11yInstrumentSummary(String label, String type, String status) {
    return '$label, $type, $status';
  }

  @override
  String get statementImportTitle => 'Import a statement';

  @override
  String get statementImportStartTitle => 'Choose an account and a file';

  @override
  String get statementImportMappingTitle => 'Match the columns';

  @override
  String get statementImportReviewTitle => 'Review before importing';

  @override
  String get statementImportRailExplanation =>
      'Karar imports statements you upload yourself. It does not connect to your bank, and it never asks for a banking password, PIN or one-time code.';

  @override
  String get statementImportAccountLabel => 'Account to import into';

  @override
  String get statementImportAccountHelper =>
      'You choose the account before the file is read. Nothing in the file can change where its rows land.';

  @override
  String get statementImportNoAccounts =>
      'You need an account before you can import a statement.';

  @override
  String get statementImportChooseFile => 'Choose a CSV file';

  @override
  String get statementImportChooseFileSemantics =>
      'Choose a CSV statement file from your device';

  @override
  String statementImportFileRules(int megabytes) {
    final intl.NumberFormat megabytesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String megabytesString = megabytesNumberFormat.format(megabytes);

    return 'CSV only, up to $megabytesString MB.';
  }

  @override
  String get statementImportFileChosen => 'File ready to upload';

  @override
  String get statementImportActionUpload => 'Upload and continue';

  @override
  String get statementImportPickerUnavailableTitle =>
      'This build cannot open a file picker';

  @override
  String get statementImportPickerUnavailableDetail =>
      'The rest of the import is ready. When file selection is added it will ask only for the one file you pick, never for access to your storage.';

  @override
  String get statementImportPickerUnreadable =>
      'That file could not be read from your device.';

  @override
  String get statementImportSourceEmpty => 'That file is empty.';

  @override
  String statementImportSourceTooLarge(int megabytes) {
    final intl.NumberFormat megabytesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String megabytesString = megabytesNumberFormat.format(megabytes);

    return 'That file is larger than the $megabytesString MB this import accepts.';
  }

  @override
  String get statementImportSampleInvalidEncoding =>
      'That file is not valid UTF-8 text. Karar refuses it rather than replacing the damaged characters, which would alter what your bank wrote.';

  @override
  String get statementImportSampleMalformedQuoting =>
      'A quoted value in that file is never closed, so its columns cannot be counted reliably.';

  @override
  String get statementImportSampleTooManyColumns =>
      'A line in that file has more columns than this import accepts.';

  @override
  String get statementImportMappingIntro =>
      'Tell Karar what each column holds. Nothing is guessed, because a wrong guess moves money.';

  @override
  String get statementImportHeaderRowLabel => 'The first row is a heading row';

  @override
  String get statementImportHeaderRowHelper =>
      'Stated, never detected. A heading row treated as data becomes a refused transaction.';

  @override
  String statementImportColumnNumber(int number) {
    final intl.NumberFormat numberNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String numberString = numberNumberFormat.format(number);

    return 'Column $numberString';
  }

  @override
  String get statementImportColumnNotMapped => 'Not mapped';

  @override
  String get statementImportPreviewCaption =>
      'The first rows of your file, shown as plain text.';

  @override
  String get statementImportPreviewInertNote =>
      'Values appear exactly as your file contains them. Karar never treats them as instructions.';

  @override
  String get statementImportFieldBookingDate => 'Booking date';

  @override
  String get statementImportFieldValueDate => 'Value date';

  @override
  String get statementImportFieldEventOccurredAt => 'Exact time';

  @override
  String get statementImportFieldSourceTimezone => 'Time zone';

  @override
  String get statementImportFieldAmount => 'Amount';

  @override
  String get statementImportFieldDebitAmount => 'Debit';

  @override
  String get statementImportFieldCreditAmount => 'Credit';

  @override
  String get statementImportFieldCurrency => 'Currency';

  @override
  String get statementImportFieldDescription => 'Description';

  @override
  String get statementImportFieldMerchant => 'Merchant';

  @override
  String get statementImportFieldSourceBalance => 'Balance';

  @override
  String get statementImportFieldSourceReference => 'Reference';

  @override
  String get statementImportFieldInstrumentMask => 'Card or account tail';

  @override
  String get statementImportFieldAccountIdentifier => 'Account identifier';

  @override
  String get statementImportFieldRow => 'Whole row';

  @override
  String get statementImportFieldUnrecognised =>
      'A field this version does not recognise';

  @override
  String get statementImportAccountIdentifierHelper =>
      'Used only to notice that a file covers more than one account, so the import can refuse instead of mixing them.';

  @override
  String get statementImportAmountShapeLabel => 'How is the amount written?';

  @override
  String get statementImportAmountShapeSigned => 'One column, with a sign';

  @override
  String get statementImportAmountShapeDebitCredit =>
      'Separate debit and credit columns';

  @override
  String get statementImportSignFrameLabel =>
      'Whose point of view do the signs use?';

  @override
  String get statementImportSignFrameAccountHolder =>
      'Mine, so money I spend is negative';

  @override
  String get statementImportSignFrameBankLedger =>
      'The bank ledger, so a deposit is a credit';

  @override
  String get statementImportSignFrameHelper =>
      'There is no default. Reading the signs the wrong way turns every payment in the file into income.';

  @override
  String get statementImportDateOrderLabel =>
      'How are ambiguous dates written?';

  @override
  String get statementImportDateOrderNotStated => 'Not stated';

  @override
  String get statementImportDateOrderIso => 'Year first, as in 2026-04-03';

  @override
  String get statementImportDateOrderDayFirst =>
      'Day first, so 03/04 is 3 April';

  @override
  String get statementImportDateOrderMonthFirst =>
      'Month first, so 03/04 is 4 March';

  @override
  String get statementImportDateOrderHelper =>
      'If you do not state one, Karar refuses the rows it cannot read without guessing rather than picking a reading for you.';

  @override
  String get statementImportCurrencySourceLabel =>
      'Where does the currency come from?';

  @override
  String get statementImportCurrencyFromColumn => 'A column in the file';

  @override
  String get statementImportCurrencyStatedForFile =>
      'The whole file is in one currency';

  @override
  String get statementImportStatedCurrencyLabel => 'Currency of the file';

  @override
  String get statementImportCurrencyHelper =>
      'One or the other, never both. Two sources for one currency can disagree, and resolving that would mean choosing on your behalf.';

  @override
  String get statementImportBalanceKindLabel =>
      'What does the balance column hold?';

  @override
  String get statementImportBalanceKindRunning => 'Running balance';

  @override
  String get statementImportBalanceKindLedger => 'Ledger balance';

  @override
  String get statementImportBalanceKindAvailable => 'Available balance';

  @override
  String get statementImportBalanceKindClosing => 'Closing balance';

  @override
  String get statementImportStatedBalanceLabel =>
      'Balance the statement states';

  @override
  String get statementImportStatedBalanceHelper =>
      'Optional. Used only to check that the rows add up. It is never saved as a balance of your account.';

  @override
  String get statementImportStatedBalanceKindLabel => 'Which balance is it?';

  @override
  String get statementImportStatedBalanceOpening => 'Opening';

  @override
  String get statementImportStatedBalanceClosing => 'Closing';

  @override
  String get statementImportStatedBalanceLedger => 'Ledger';

  @override
  String get statementImportStatedBalanceAvailable => 'Available';

  @override
  String get statementImportStatedBalanceInvalid =>
      'Enter the balance as digits, with at most the decimal places this currency uses.';

  @override
  String get statementImportMappingColumnIndexInvalid =>
      'A chosen column is not in this file.';

  @override
  String get statementImportMappingColumnUsedTwice =>
      'One column is matched to two fields. A column cannot be two facts at once.';

  @override
  String get statementImportMappingCurrencyNotDetermined =>
      'No currency column and no stated currency. The currency of your account is not an answer, because it would put a currency nobody chose on every row.';

  @override
  String get statementImportMappingCurrencyDoublyDetermined =>
      'Both a currency column and a stated currency. The two can disagree.';

  @override
  String get statementImportMappingBalanceKindNotStated =>
      'A balance column needs its kind stated. Running, ledger and available are three different numbers.';

  @override
  String get statementImportMappingTimezoneWithoutInstant =>
      'A time zone column needs an exact-time column to interpret.';

  @override
  String get statementImportActionParse => 'Read the file';

  @override
  String get statementImportCountsTitle => 'What the file contained';

  @override
  String get statementImportCountRows => 'Rows';

  @override
  String get statementImportCountValid => 'Ready to import';

  @override
  String get statementImportCountInvalid => 'Refused';

  @override
  String get statementImportCountExactDuplicates => 'Already imported';

  @override
  String get statementImportCountProbableDuplicates => 'Possible duplicates';

  @override
  String get statementImportProbableDuplicatesNote =>
      'Karar does not look for possible duplicates, so this is always zero.';

  @override
  String get statementImportReconciliationTitle => 'Does the statement add up?';

  @override
  String get statementImportReconciliationMatched =>
      'The rows match the balance the statement states.';

  @override
  String get statementImportReconciliationMismatched =>
      'The rows do not match the balance the statement states.';

  @override
  String get statementImportReconciliationNotAvailable =>
      'The statement stated no balance, so nothing was compared.';

  @override
  String get statementImportReconciliationUnrecognised =>
      'This version does not recognise the reconciliation result.';

  @override
  String get statementImportReconciliationBlocksCommit =>
      'Importing is blocked while they disagree. Importing a statement that does not add up would write records nobody can trust.';

  @override
  String get statementImportRowIssuesTitle => 'Refused rows';

  @override
  String get statementImportRowIssuesNone => 'No row was refused.';

  @override
  String statementImportRowNumber(int number) {
    final intl.NumberFormat numberNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String numberString = numberNumberFormat.format(number);

    return 'Row $numberString';
  }

  @override
  String statementImportIssuesTruncated(int shown, int total) {
    final intl.NumberFormat shownNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String shownString = shownNumberFormat.format(shown);
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    return 'Showing $shownString of $totalString refused rows.';
  }

  @override
  String get statementImportNoValuesShown =>
      'Karar does not show values from your file here. Open your own file at these row numbers to see them.';

  @override
  String get statementImportRemedyStateAConvention =>
      'State the convention and read the file again.';

  @override
  String get statementImportRemedyCorrectTheMapping =>
      'Correct which column holds what.';

  @override
  String get statementImportRemedyCorrectTheFile =>
      'Export the statement from your bank again.';

  @override
  String get statementImportRemedyRespectABound =>
      'This line is past a limit this import enforces.';

  @override
  String get statementImportRemedyUnknown =>
      'This version does not know what to suggest here.';

  @override
  String get statementImportReasonRequiredFieldMissing =>
      'A required field was empty.';

  @override
  String get statementImportReasonUnreadableAmount =>
      'The amount is not a number Karar can read.';

  @override
  String get statementImportReasonAmbiguousDecimalSeparator =>
      'The decimal separator could be read two ways, and neither was stated.';

  @override
  String get statementImportReasonAmbiguousDateOrder =>
      'The date could be read two ways, and neither was stated.';

  @override
  String get statementImportReasonUnreadableDate =>
      'The date is not in a shape Karar accepts.';

  @override
  String get statementImportReasonUnreadableInstant =>
      'The exact time is not a time Karar can read.';

  @override
  String get statementImportReasonUnknownTimezone =>
      'The time zone is not one this platform knows.';

  @override
  String get statementImportReasonUnknownCurrency =>
      'The currency is not one this platform supports.';

  @override
  String get statementImportReasonCurrencyMismatch =>
      'The currency of this row is not the currency of the account, and nothing here converts between them.';

  @override
  String get statementImportReasonAmbiguousDirection =>
      'Karar could not tell whether this row is money in or money out.';

  @override
  String get statementImportReasonDebitAndCreditBothPresent =>
      'The debit and credit columns both carried a value.';

  @override
  String get statementImportReasonDebitAndCreditBothAbsent =>
      'The debit and credit columns were both empty.';

  @override
  String get statementImportReasonFieldTooLarge =>
      'A field is larger than this import accepts.';

  @override
  String get statementImportReasonTooManyColumns =>
      'This row has more columns than this import accepts.';

  @override
  String get statementImportReasonColumnCountMismatch =>
      'This row has a different number of columns from the heading row.';

  @override
  String get statementImportReasonInvalidEncoding =>
      'This row is not valid UTF-8 text.';

  @override
  String get statementImportReasonMalformedQuoting =>
      'A quoted value in this row is never closed.';

  @override
  String get statementImportReasonAmountExceedsRange =>
      'The amount is too large to hold exactly.';

  @override
  String get statementImportReasonDecimalPlacesExceedCurrency =>
      'The amount has more decimal places than its currency uses.';

  @override
  String get statementImportReasonUnrecognised =>
      'This version does not recognise the reason this row was refused.';

  @override
  String get statementImportRefusalSourceTooLarge =>
      'The file is larger than this import accepts.';

  @override
  String get statementImportRefusalTooManyRows =>
      'The file has more rows than this import accepts.';

  @override
  String get statementImportRefusalTooManyColumns =>
      'The file has more columns than this import accepts.';

  @override
  String get statementImportRefusalFieldTooLarge =>
      'One field in the file is larger than this import accepts.';

  @override
  String get statementImportRefusalBufferedRowsExceeded =>
      'The file needed more rows held at once than this import allows.';

  @override
  String get statementImportRefusalBufferedBytesExceeded =>
      'The file needed more memory held at once than this import allows.';

  @override
  String get statementImportRefusalDeadlineExceeded =>
      'Reading the file took longer than this import allows.';

  @override
  String get statementImportRefusalCancelled =>
      'Reading the file was cancelled.';

  @override
  String get statementImportRefusalTooManyErrors =>
      'Too many rows were refused for the file to be read any further.';

  @override
  String get statementImportRefusalUnsupportedMediaType =>
      'The file was not sent as CSV.';

  @override
  String get statementImportRefusalInvalidEncoding =>
      'The file is not valid UTF-8 text.';

  @override
  String get statementImportRefusalBinaryContent => 'The file is not text.';

  @override
  String get statementImportRefusalSpreadsheetContent =>
      'The file is a spreadsheet. Export it as CSV and try again.';

  @override
  String get statementImportRefusalCompressedContent =>
      'The file is compressed. Extract it and upload the CSV inside.';

  @override
  String get statementImportRefusalMalformedQuoting =>
      'A quoted value in the file is never closed.';

  @override
  String get statementImportRefusalEmptySource => 'The file is empty.';

  @override
  String get statementImportRefusalNoHeaderRow =>
      'The file was read as having a heading row, and it has none.';

  @override
  String get statementImportRefusalMappingAmbiguous =>
      'The columns as matched leave too much unstated to read the file.';

  @override
  String get statementImportRefusalMultipleAccountsInSource =>
      'The file covers more than one account. Karar refuses it rather than mixing them into the account you chose.';

  @override
  String get statementImportRefusalCurrencyMismatch =>
      'The currency of the file is not the currency of the account, and nothing here converts between them.';

  @override
  String get statementImportRefusalReconciliationMismatch =>
      'The rows do not add up to the balance the statement states.';

  @override
  String get statementImportRefusalSourceAlreadyImported =>
      'You have already imported this exact file.';

  @override
  String get statementImportRefusalSourceIntegrityFailed =>
      'The stored file no longer matches what was uploaded, so it was not read.';

  @override
  String get statementImportRefusalSourceUnreadable =>
      'The stored file could not be read.';

  @override
  String get statementImportRefusalUnrecognised =>
      'This version does not recognise the reason this import was refused.';

  @override
  String get statementImportStateDraft => 'Not started';

  @override
  String get statementImportStateSourceStored => 'File uploaded';

  @override
  String get statementImportStateParsing => 'Reading the file';

  @override
  String get statementImportStateReviewRequired => 'Waiting for your decision';

  @override
  String get statementImportStateCommitting => 'Importing';

  @override
  String get statementImportStateCommitted => 'Imported';

  @override
  String get statementImportStateRejected => 'Discarded';

  @override
  String get statementImportStateFailed => 'Refused';

  @override
  String get statementImportStateDuplicate => 'Already imported';

  @override
  String get statementImportStateErased => 'Erased';

  @override
  String get statementImportStateUnrecognised =>
      'A state this version does not recognise';

  @override
  String get statementImportActionCommit => 'Import these transactions';

  @override
  String get statementImportActionDiscard => 'Discard this import';

  @override
  String get statementImportUploadingStatus => 'Uploading your file';

  @override
  String get statementImportParsingStatus => 'Reading your file';

  @override
  String get statementImportCommittingStatus => 'Importing your transactions';

  @override
  String get statementImportCommittedTitle => 'Statement imported';

  @override
  String get statementImportCommittedCount => 'Transactions added';

  @override
  String get statementImportAlreadyCommitted =>
      'This statement was already imported. Nothing was added a second time.';

  @override
  String get statementImportDiscardedTitle => 'Import discarded';

  @override
  String get statementImportDiscardedDetail =>
      'The file and the rows it staged are gone. Transactions already imported from it are not affected.';

  @override
  String get statementImportUnavailableTitle => 'This import cannot be shown';

  @override
  String get statementImportUnavailableDescription =>
      'Karar could not reach the platform. Nothing was changed.';

  @override
  String get statementImportRefusedTitle => 'This file was refused';

  @override
  String get statementImportHeaderRowYes => 'Yes, the first row is a heading';

  @override
  String get statementImportHeaderRowNo => 'No, the first row is a transaction';

  @override
  String get transferMatchesScreenTitle =>
      'Transfers between your own accounts';

  @override
  String get transferMatchesIntro =>
      'Moving money between two accounts you own is one movement recorded twice — once leaving, once arriving. Karar proposes the pairs it found. Nothing changes until you answer.';

  @override
  String get transferMatchesFilterLabel => 'Show';

  @override
  String get transferMatchesFilterAwaiting => 'Waiting for you';

  @override
  String get transferMatchesFilterConfirmed => 'You confirmed';

  @override
  String get transferMatchesFilterRejected => 'You kept separate';

  @override
  String get transferMatchStateSuggested => 'Proposed';

  @override
  String get transferMatchStateConfirmed => 'Confirmed by you';

  @override
  String get transferMatchStateRejected => 'Kept separate';

  @override
  String get transferMatchStateUnrecognised =>
      'A state this version does not know';

  @override
  String get transferMatchNothingChangedNote =>
      'Nothing has changed. This is a question, not a decision.';

  @override
  String get transferMatchConfirmedNote =>
      'You confirmed this pair, so Karar counts the two entries as one movement.';

  @override
  String get transferMatchRejectedNote =>
      'The two entries keep counting separately, and this pair will not be proposed again.';

  @override
  String get transferMatchUnrecognisedNote =>
      'This version of Karar cannot act on this pair. Update the app to answer it.';

  @override
  String get transferMatchBasisHeading => 'Why this pair was proposed';

  @override
  String get transferMatchBasisEqualAndOpposite =>
      'The two amounts are exactly equal and opposite, they are in the same currency, and they were booked within the window of the rule below.';

  @override
  String get transferMatchBasisUnrecognised =>
      'This version of Karar does not know the rule that proposed this pair.';

  @override
  String get transferMatchRuleLabel => 'Rule that proposed it';

  @override
  String get transferMatchNoScoreNote =>
      'Karar does not score a pair. It either meets the rule or it is not proposed at all.';

  @override
  String get transferMatchOutflowHeading => 'Money left this account';

  @override
  String get transferMatchInflowHeading => 'Money arrived in this account';

  @override
  String get transferMatchAccountLabel => 'Account';

  @override
  String get transferMatchCurrencyLabel => 'Currency';

  @override
  String get transferMatchAmountLabel => 'Amount';

  @override
  String get transferMatchBookedLabel => 'Booked';

  @override
  String get transferMatchDescriptionLabel => 'Description';

  @override
  String get transferMatchProposedAtLabel => 'Proposed on';

  @override
  String get transferMatchDecidedAtLabel => 'You answered on';

  @override
  String get transferMatchAccountNotNamed => 'Account name unavailable';

  @override
  String get transferMatchActionOpenMovements => 'Show both movements';

  @override
  String get transferMatchActionHideMovements => 'Hide both movements';

  @override
  String get transferMatchActionConfirm => 'Yes, one movement';

  @override
  String get transferMatchActionReject => 'No, two separate movements';

  @override
  String get transferMatchActionWithdraw => 'Withdraw my confirmation';

  @override
  String get transferMatchConfirmingStatus => 'Recording your confirmation';

  @override
  String get transferMatchRejectingStatus => 'Recording your answer';

  @override
  String get transferMatchOpenToAnswerNote => 'Open both movements to answer.';

  @override
  String get transferMatchRejectDialogTitle => 'Keep these two separate?';

  @override
  String get transferMatchRejectDialogMessage =>
      'Both entries stay exactly as they are and keep counting separately. Karar will not propose this pair again.';

  @override
  String get transferMatchWithdrawDialogTitle => 'Withdraw your confirmation?';

  @override
  String get transferMatchWithdrawDialogMessage =>
      'The two entries go back to counting separately. Karar will not propose this pair again, and you cannot confirm it later.';

  @override
  String get transferMatchCrossCurrencyTitle => 'Two different currencies';

  @override
  String get transferMatchCrossCurrencyDetail =>
      'These two movements are held in different currencies. Karar holds no exchange rate and never relates an amount in one currency to an amount in another, so this pair cannot be confirmed here.';

  @override
  String get transferMatchesEmptyAwaitingTitle => 'Nothing waiting for you';

  @override
  String get transferMatchesEmptyAwaitingDescription =>
      'Karar has not proposed any transfers between your own accounts.';

  @override
  String get transferMatchesEmptyConfirmedTitle =>
      'You have not confirmed a pair yet';

  @override
  String get transferMatchesEmptyConfirmedDescription =>
      'Pairs you confirm are kept here.';

  @override
  String get transferMatchesEmptyRejectedTitle =>
      'You have not kept a pair separate yet';

  @override
  String get transferMatchesEmptyRejectedDescription =>
      'Pairs you keep separate are remembered here, so Karar does not ask about them again.';

  @override
  String get transferMatchesUnavailableTitle =>
      'Proposed transfers cannot be shown';

  @override
  String get transferMatchesUnavailableDescription =>
      'Karar could not reach the platform. Nothing was changed.';

  @override
  String get transferMatchRefusalConflict =>
      'This pair changed while it was on your screen. Reload it and answer again.';

  @override
  String get transferMatchRefusalGone =>
      'This pair is no longer here. Nothing was changed.';

  @override
  String get transferMatchRefusalNotAvailable =>
      'That answer is no longer available for this pair.';

  @override
  String get transferMatchRefusalCrossCurrency =>
      'Karar cannot pair two movements in different currencies.';

  @override
  String get transferMatchRefusalGeneric =>
      'Your answer was not recorded. Nothing was changed.';

  @override
  String get transferMatchMovementUnavailable =>
      'This movement could not be loaded. Answer only when you can see both.';

  @override
  String get transferMatchMovementsLoading => 'Loading both movements';

  @override
  String get transferMatchesLoadMore => 'Show more pairs';

  @override
  String get transferMatchesLoadingMore => 'Loading more pairs';

  @override
  String get dataSourcesScreenTitle => 'Where your data comes from';

  @override
  String get dataSourcesIntro =>
      'Everything in Karar is here because you put it here. Karar does not connect to any bank, wallet or card issuer, and it holds no credential for any of them.';

  @override
  String get dataSourcesNoLiveLinkTitle => 'No link to any institution';

  @override
  String get dataSourcesCredentialNote =>
      'Karar never asks for a password, PIN, mPIN, one-time code, recovery code or card number, and stores none of them.';

  @override
  String get dataSourcesConnectionsHeading => 'Your data sources';

  @override
  String get dataSourcesFilterLabel => 'Show';

  @override
  String get dataSourcesFilterAll => 'All';

  @override
  String get dataSourcesFilterAccepting => 'Accepting what you supply';

  @override
  String get dataSourcesFilterNotConfigured => 'Not set up';

  @override
  String get dataSourcesFilterUnavailable => 'Not usable now';

  @override
  String get dataSourcesFilterRetired => 'Finished with';

  @override
  String get dataSourcesFilterNotImplemented => 'Never built';

  @override
  String get dataSourcesEmptyTitle => 'No data sources yet';

  @override
  String get dataSourcesEmptyDescription =>
      'Nothing has been recorded about how your data arrives. Add an account by hand or import a statement file, and a source will appear here.';

  @override
  String get dataSourcesFilteredEmptyTitle => 'Nothing matches this filter';

  @override
  String get dataSourcesFilteredEmptyDescription =>
      'Choose “All” to see every data source you hold.';

  @override
  String get dataSourcesUnavailableTitle =>
      'Your data sources could not be read';

  @override
  String get dataSourcesUnavailableDescription =>
      'Karar could not read where your data comes from just now. Nothing about your data has changed.';

  @override
  String get dataSourcesLoadMore => 'Show more data sources';

  @override
  String get dataSourcesLoadingMore => 'Loading more data sources';

  @override
  String get connectionLabelFieldLabel => 'Your name for this';

  @override
  String get connectionRailFieldLabel => 'How data arrives';

  @override
  String get connectionStatusFieldLabel => 'State of this record';

  @override
  String get connectionAvailabilityFieldLabel =>
      'Can Karar run this way of receiving data';

  @override
  String get connectionAddedAtLabel => 'Added';

  @override
  String get connectionRecordChangedLabel => 'This record last changed';

  @override
  String get connectionRecordChangedNote =>
      'That is when the record itself changed. It is not when data arrived, and it is not a check with any institution.';

  @override
  String get connectionShowDetailAction => 'Show details';

  @override
  String get connectionHideDetailAction => 'Hide details';

  @override
  String get connectionRailManual => 'Typed in by you';

  @override
  String get connectionRailUserFileUpload => 'A file you upload';

  @override
  String get connectionRailOpenFinanceApi => 'Open finance interface';

  @override
  String get connectionRailDirectBankOrWalletApi =>
      'Direct bank or wallet interface';

  @override
  String get connectionRailLicensedAggregatorApi =>
      'Licensed aggregator interface';

  @override
  String get connectionRailHostToHostSftp => 'Host-to-host file transfer';

  @override
  String get connectionRailIso20022File => 'ISO 20022 file';

  @override
  String get connectionRailSwiftMtFile => 'SWIFT MT file';

  @override
  String get connectionRailOfxQfxFile => 'OFX or QFX file';

  @override
  String get connectionRailQifFile => 'QIF file';

  @override
  String get connectionRailPdfStatement => 'PDF statement';

  @override
  String get connectionRailSecureEmailStatement => 'Statement by secure email';

  @override
  String get connectionRailDeviceSignal => 'Signal from this device';

  @override
  String get connectionRailUnrecognised =>
      'A way of receiving data this version does not know';

  @override
  String get railStandingBadgeYouEnterIt => 'You enter it';

  @override
  String get railStandingBadgeYouUploadIt => 'You upload it';

  @override
  String get railStandingBadgeNotBuilt => 'Not built';

  @override
  String get railStandingBadgeUnknown => 'Unknown to this version';

  @override
  String get railStandingYouEnterIt =>
      'You type this in yourself. Karar records exactly what you enter and nothing else.';

  @override
  String get railStandingYouUploadIt =>
      'You upload a file and Karar reads it. You choose the file, and Karar reads nothing you have not given it.';

  @override
  String get railStandingNotBuilt =>
      'Karar has not built this. It is not switched off and it is not scheduled: there is no code for it, nothing to set up, and nothing to wait for.';

  @override
  String get railStandingUnknown =>
      'This version of Karar does not know this way of receiving data and will not describe it.';

  @override
  String get railAvailabilityExecutable => 'Yes';

  @override
  String get railAvailabilityNotImplemented => 'No, Karar has never built it';

  @override
  String get railAvailabilityUnrecognised =>
      'An answer this version of Karar does not know';

  @override
  String get connectionStatusAcceptsWhatYouSupply => 'Accepts what you supply';

  @override
  String get connectionStatusNotConfigured =>
      'Nothing has been set up on this yet';

  @override
  String get connectionStatusUnavailable =>
      'Set up, and not usable at the moment';

  @override
  String get connectionStatusRetired =>
      'You are finished with this. What it already supplied stays readable.';

  @override
  String get connectionStatusNotImplemented =>
      'The way of receiving data this names was never built';

  @override
  String get connectionStatusUnrecognised =>
      'A state this version of Karar does not know';

  @override
  String get dataSourcesBuiltRailsHeading =>
      'The only two ways data reaches Karar';

  @override
  String get dataSourcesRailsHeading =>
      'Ways of receiving data Karar has not built';

  @override
  String get dataSourcesRailsExplanation =>
      'These are named so Karar can describe the world accurately. None of them exists here: there is no code for any of them, nothing to set up, and nothing to wait for. Naming one is not a plan to build it.';

  @override
  String get dataSourcesAccountsHeading => 'Which sources feed each account';

  @override
  String get dataSourcesAccountsEmpty =>
      'You hold no accounts yet, so nothing feeds anything.';

  @override
  String get dataSourcesAccountsUnavailable =>
      'Your accounts could not be read just now, so they cannot be listed here.';

  @override
  String get dataSourcesOpenAccountSourcesAction => 'Where its data comes from';

  @override
  String dataSourcesOpenAccountSourcesA11y(String account) {
    return 'Where the data for $account comes from';
  }

  @override
  String get accountSourcesScreenTitle => 'Sources feeding this account';

  @override
  String get accountSourcesIntro =>
      'Every source below is something you supplied. Karar does not contact your bank, wallet or card issuer, so no date here is a check with anyone.';

  @override
  String get accountSourcesEmptyTitle => 'No source feeds this account';

  @override
  String get accountSourcesEmptyDescription =>
      'Nothing has been attached to this account yet. Enter figures by hand or import a statement file, and the source will appear here.';

  @override
  String get accountSourcesUnavailableTitle => 'Sources could not be read';

  @override
  String get accountSourcesUnavailableDescription =>
      'Karar could not read the sources for this account just now.';

  @override
  String accountSourcesCardHeading(int position) {
    return 'Source $position';
  }

  @override
  String get accountSourcesPriorityLabel => 'Priority stated by Karar';

  @override
  String accountSourcesPriorityValue(int priority) {
    return 'Rank $priority';
  }

  @override
  String get accountSourcesPriorityNote =>
      'Sources are listed in the order Karar stated, strongest first. A smaller rank is a stronger source.';

  @override
  String get accountSourcesPriorityAmbiguous =>
      'Two of these sources claim the same rank, so which one takes precedence is not decided. Karar will not choose one for you.';

  @override
  String sourceArrivalYouSupplied(String instant) {
    return 'You last supplied data through this source on $instant.';
  }

  @override
  String get sourceArrivalNone =>
      'Nothing has arrived through this source yet.';

  @override
  String get accountSourcesArrivalNote =>
      'Karar does not contact your bank, so this is a record of what you did, not a check with anyone.';

  @override
  String get accountSourcesFirstRecordedLabel => 'First recorded';

  @override
  String get accountSourcesLastRecordedLabel => 'Last recorded activity';

  @override
  String get accountSourcesLastRecordedNote =>
      'Karar last recorded something about this source then. Recording is not receiving: an upload that failed to read moves this date too.';

  @override
  String get accountSourcesCoverageNote =>
      'This is the range of dates the supplied data itself covers. It is not a freshness date and says nothing about what happened after it.';

  @override
  String get accountSourcesConfirmedLabel => 'You confirmed this source';

  @override
  String get accountSourcesConfirmedPending => 'Waiting for you to confirm';

  @override
  String get accountSourcesMatchLabel => 'Why this source was attached';

  @override
  String get sourceMatchBasisExact => 'The reference matched exactly';

  @override
  String get sourceMatchBasisProbable =>
      'A probable match, waiting for you to say';

  @override
  String get sourceMatchBasisUnrecognised =>
      'A reason this version of Karar does not know';

  @override
  String get accountSourcesNoScoreNote =>
      'Karar gives a source no confidence score. Either the reference matched exactly, or you are asked.';

  @override
  String get accountSourcesCapabilitiesHeading =>
      'What this source was seen to supply';

  @override
  String get accountSourcesCapabilitiesNote =>
      'Seen, not supported. A thing nobody looked for is not the same answer as a thing looked for and absent.';

  @override
  String get dataSourcesRefusalGone =>
      'This is no longer there. Nothing about your data changed.';

  @override
  String get dataSourcesRefusalOffline =>
      'Karar could not reach the network. Nothing about your data changed.';

  @override
  String get dataSourcesRefusalGeneric =>
      'This could not be read just now. Nothing about your data changed.';

  @override
  String get sourceAuthorityFieldLabel => 'How much weight this source carries';
}
