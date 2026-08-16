// GENERATED FILE — do not edit by hand.
// Source of truth: lib/l10n/arb/*.arb. Regenerate with `flutter gen-l10n`.
// ignore_for_file: type=lint
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en'),
  ];

  /// Product name shown in the task switcher and the about screen.
  ///
  /// In en, this message translates to:
  /// **'Karar'**
  String get appName;

  /// Primary action that advances a multi-step flow.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get actionContinue;

  /// Action that abandons the current flow without saving.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get actionCancel;

  /// Action that accepts a destructive or irreversible dialog.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get actionConfirm;

  /// Action that commits edits in a form.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get actionSave;

  /// Action that dismisses a dialog, sheet, or banner.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get actionClose;

  /// Action that returns to the previous screen.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get actionBack;

  /// Action that moves to the next step.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get actionNext;

  /// Action that completes a flow.
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get actionDone;

  /// Action that re-runs a request that failed.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get actionRetry;

  /// Action that hides a banner without taking its offered action.
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get actionDismiss;

  /// Action that opens an item for modification.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get actionEdit;

  /// Action that detaches an item from a list.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get actionRemove;

  /// Action that sends a completed form.
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get actionSubmit;

  /// Action that reloads the current screen from the server.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get actionRefresh;

  /// Action that copies a value to the clipboard.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get actionCopy;

  /// Action that selects every item in a list.
  ///
  /// In en, this message translates to:
  /// **'Select all'**
  String get actionSelectAll;

  /// Field label marked as not required. Composed with a placeholder so the parenthetical can move or change form per language.
  ///
  /// In en, this message translates to:
  /// **'{label} (optional)'**
  String fieldOptionalSuffix(String label);

  /// Screen-reader announcement appended to a required field label.
  ///
  /// In en, this message translates to:
  /// **'Required'**
  String get fieldRequiredMarker;

  /// The visible mark next to a required field label. A key rather than a literal because not every typographic convention uses an asterisk.
  ///
  /// In en, this message translates to:
  /// **'*'**
  String get fieldRequiredIndicator;

  /// Accessibility label for the button that empties a text field.
  ///
  /// In en, this message translates to:
  /// **'Clear {label}'**
  String fieldClear(String label);

  /// Accessibility label for the control that reveals an obscured field.
  ///
  /// In en, this message translates to:
  /// **'Show {label}'**
  String fieldShowValue(String label);

  /// Accessibility label for the control that obscures a revealed field.
  ///
  /// In en, this message translates to:
  /// **'Hide {label}'**
  String fieldHideValue(String label);

  /// Character budget shown under a length-limited field.
  ///
  /// In en, this message translates to:
  /// **'{used} of {limit} characters'**
  String fieldCharacterCount(int used, int limit);

  /// Live announcement made when a field transitions into an error state.
  ///
  /// In en, this message translates to:
  /// **'{label} has an error. {message}'**
  String fieldErrorAnnouncement(String label, String message);

  /// Text label for a successful status. Status is never conveyed by colour alone.
  ///
  /// In en, this message translates to:
  /// **'Success'**
  String get statusSuccess;

  /// Text label for a warning status.
  ///
  /// In en, this message translates to:
  /// **'Warning'**
  String get statusWarning;

  /// Text label for an error status.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get statusError;

  /// Text label for an informational status.
  ///
  /// In en, this message translates to:
  /// **'Information'**
  String get statusInfo;

  /// Text label for work the platform has accepted but not finished.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get statusPending;

  /// Text label for an inactive or not-yet-begun status.
  ///
  /// In en, this message translates to:
  /// **'Not started'**
  String get statusNeutral;

  /// Accessible label announced while content is being fetched.
  ///
  /// In en, this message translates to:
  /// **'Loading'**
  String get stateLoading;

  /// Accessible label announced while a named section is being fetched.
  ///
  /// In en, this message translates to:
  /// **'Loading {subject}'**
  String stateLoadingWithSubject(String subject);

  /// Default heading for an empty list. The client shows an empty state rather than invented content.
  ///
  /// In en, this message translates to:
  /// **'Nothing here yet'**
  String get stateEmptyTitle;

  /// Default body copy for an empty list.
  ///
  /// In en, this message translates to:
  /// **'There is nothing to show on this screen right now.'**
  String get stateEmptyDescription;

  /// Default heading for a failed request.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong'**
  String get stateErrorTitle;

  /// Default body copy for a failed request.
  ///
  /// In en, this message translates to:
  /// **'We could not load this screen. Check your connection and try again.'**
  String get stateErrorDescription;

  /// Heading shown when the device has no usable network connection.
  ///
  /// In en, this message translates to:
  /// **'You are offline'**
  String get stateOfflineTitle;

  /// Body copy shown when the device has no usable network connection.
  ///
  /// In en, this message translates to:
  /// **'Reconnect to load the latest information.'**
  String get stateOfflineDescription;

  /// Support reference identifier shown under an error so a report can be traced.
  ///
  /// In en, this message translates to:
  /// **'Reference {reference}'**
  String stateErrorReference(String reference);

  /// Role announced when a modal dialog opens.
  ///
  /// In en, this message translates to:
  /// **'Dialog'**
  String get a11yDialog;

  /// Role announced when a bottom sheet opens.
  ///
  /// In en, this message translates to:
  /// **'Sheet'**
  String get a11ySheet;

  /// Role announced when an inline banner appears.
  ///
  /// In en, this message translates to:
  /// **'Notice'**
  String get a11yBanner;

  /// Accessible label for the bottom navigation bar.
  ///
  /// In en, this message translates to:
  /// **'Main navigation'**
  String get a11yNavigationBar;

  /// Position announcement for a navigation destination.
  ///
  /// In en, this message translates to:
  /// **'Tab {position} of {total}'**
  String a11yTabPosition(int position, int total);

  /// Announced on a control that is running an action and cannot be pressed again.
  ///
  /// In en, this message translates to:
  /// **'Busy'**
  String get a11yBusy;

  /// Announced on the currently selected item.
  ///
  /// In en, this message translates to:
  /// **'Selected'**
  String get a11ySelected;

  /// Accessible label for the grab handle at the top of a sheet.
  ///
  /// In en, this message translates to:
  /// **'Drag to resize'**
  String get a11yDragHandle;

  /// Spoken name of a required field. A placeholder rather than concatenation, because the separator between the two parts is not a comma in every language.
  ///
  /// In en, this message translates to:
  /// **'{label}, required'**
  String a11yFieldWithRequired(String label);

  /// Spoken name of a control that is running an action.
  ///
  /// In en, this message translates to:
  /// **'{label}, busy'**
  String a11yControlBusy(String label);

  /// Joins a row title and its supporting line into one spoken phrase.
  ///
  /// In en, this message translates to:
  /// **'{title}. {subtitle}'**
  String a11yTitleWithSubtitle(String title, String subtitle);

  /// Spoken name of a titled inline banner, combining its role and its heading.
  ///
  /// In en, this message translates to:
  /// **'{role}: {title}'**
  String a11yBannerTitled(String role, String title);

  /// Count of selected list items. Uses a plural so no language has to concatenate a number onto a noun.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No items selected} =1{1 item selected} other{{count} items selected}}'**
  String selectionCount(int count);

  /// Pager position indicator.
  ///
  /// In en, this message translates to:
  /// **'Page {page} of {total}'**
  String paginationPosition(int page, int total);

  /// Cooldown message before a rate-limited action can be repeated.
  ///
  /// In en, this message translates to:
  /// **'{seconds, plural, =1{Try again in 1 second} other{Try again in {seconds} seconds}}'**
  String retryCountdown(int seconds);

  /// Freshness stamp for server-provided content.
  ///
  /// In en, this message translates to:
  /// **'Last updated {timestamp}'**
  String lastUpdatedAt(DateTime timestamp);

  /// Title of the app language setting.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageSettingTitle;

  /// Language option that follows the device setting.
  ///
  /// In en, this message translates to:
  /// **'System default'**
  String get languageSystemDefault;

  /// Name of the English language, always written in English.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get languageEnglish;

  /// Name of the Arabic language, always written in Arabic.
  ///
  /// In en, this message translates to:
  /// **'العربية'**
  String get languageArabic;

  /// Shown above a legal document that the server supplied in a language other than the current interface language. Legal documents are never translated on the device.
  ///
  /// In en, this message translates to:
  /// **'This document is provided by Karar in {language}.'**
  String legalDocumentLanguageNotice(String language);

  /// Shown when a legal document could not be fetched. No cached or substituted text is displayed.
  ///
  /// In en, this message translates to:
  /// **'This document is not available right now.'**
  String get legalDocumentUnavailable;

  /// Heading of the sign-in screen.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInTitle;

  /// Supporting line under the sign-in heading.
  ///
  /// In en, this message translates to:
  /// **'Use the email address and password for your Karar account.'**
  String get signInSubtitle;

  /// Button that submits the sign-in form.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signInAction;

  /// Label of the email address field on the sign-in and registration forms.
  ///
  /// In en, this message translates to:
  /// **'Email address'**
  String get signInEmailLabel;

  /// Label of the password field on the sign-in form.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get signInPasswordLabel;

  /// Link from sign-in to password recovery.
  ///
  /// In en, this message translates to:
  /// **'Forgot your password?'**
  String get signInForgotPassword;

  /// Link from sign-in to registration.
  ///
  /// In en, this message translates to:
  /// **'Create an account'**
  String get signInCreateAccount;

  /// The only message shown for a refused sign-in. It answers an unknown address, a wrong password, a disabled account and an engaged lockout identically, because the platform answers all four with one generic 401. It must not be split into more specific wording: a message that distinguishes them tells an attacker which addresses are registered.
  ///
  /// In en, this message translates to:
  /// **'That email address and password did not match an account you can sign in to. Check both and try again.'**
  String get signInInvalidCredentials;

  /// Shown on the sign-in screen after the device failed to open its secure storage and the session was discarded.
  ///
  /// In en, this message translates to:
  /// **'This device could not open its secure storage, so you have been signed out. Sign in again to continue.'**
  String get signInSecureStorageNotice;

  /// Action that signs the account out on this device.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOutAction;

  /// Title of the sign-out confirmation dialog.
  ///
  /// In en, this message translates to:
  /// **'Sign out?'**
  String get signOutConfirmTitle;

  /// Body of the sign-out confirmation dialog.
  ///
  /// In en, this message translates to:
  /// **'You will need your email address and password to sign in again on this device.'**
  String get signOutConfirmMessage;

  /// Shown after a local sign-out that could not reach the platform, so other devices may still hold a session.
  ///
  /// In en, this message translates to:
  /// **'You are signed out on this device. We could not reach Karar to end the session everywhere, so review your active sessions when you are back online.'**
  String get signOutIncompleteNotice;

  /// Heading of the registration screen.
  ///
  /// In en, this message translates to:
  /// **'Create an account'**
  String get registerTitle;

  /// Supporting line under the registration heading.
  ///
  /// In en, this message translates to:
  /// **'We will email a verification code to the address you enter.'**
  String get registerSubtitle;

  /// Button that submits the registration form.
  ///
  /// In en, this message translates to:
  /// **'Create account'**
  String get registerAction;

  /// Label of the field that repeats the chosen password.
  ///
  /// In en, this message translates to:
  /// **'Confirm password'**
  String get registerConfirmPasswordLabel;

  /// Helper line under the password field on the registration form.
  ///
  /// In en, this message translates to:
  /// **'At least 8 characters.'**
  String get registerPasswordHelp;

  /// Title of the screen shown after a registration attempt.
  ///
  /// In en, this message translates to:
  /// **'Check your email'**
  String get registerAcknowledgementTitle;

  /// The only message shown after a registration attempt. It is identical for an address that can be registered and for one that is already registered, and it must stay identical to forgotPasswordAcknowledgementMessage in kind: wording that reveals whether the account exists is a security defect, not a copy improvement.
  ///
  /// In en, this message translates to:
  /// **'If that address can be registered, a verification code is on its way. Enter it on the next screen to finish setting up your account.'**
  String get registerAcknowledgementMessage;

  /// Link back to sign-in from the registration acknowledgement.
  ///
  /// In en, this message translates to:
  /// **'Back to sign in'**
  String get registerBackToSignIn;

  /// Heading of the email verification screen.
  ///
  /// In en, this message translates to:
  /// **'Verify your email'**
  String get verifyEmailTitle;

  /// Supporting line under the email verification heading. States the code length.
  ///
  /// In en, this message translates to:
  /// **'Enter the 8-character code we emailed you. It is not shown anywhere else.'**
  String get verifyEmailSubtitle;

  /// Label of the emailed verification code field.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get verifyEmailCodeLabel;

  /// Placeholder text inside the emailed verification code field.
  ///
  /// In en, this message translates to:
  /// **'8 characters'**
  String get verifyEmailCodeHint;

  /// Button that submits the emailed verification code.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get verifyEmailAction;

  /// Action that asks for another verification code.
  ///
  /// In en, this message translates to:
  /// **'Send another code'**
  String get verifyEmailResendAction;

  /// The only message shown after a resend request, for every outcome. It must not state whether the address exists or already needed a code.
  ///
  /// In en, this message translates to:
  /// **'If that address needs a code, another one is on its way.'**
  String get verifyEmailResendAcknowledgement;

  /// Shown when the emailed verification code was refused.
  ///
  /// In en, this message translates to:
  /// **'That code did not verify. It may have expired or already been used.'**
  String get verifyEmailInvalidCode;

  /// Shown once the email address has been verified.
  ///
  /// In en, this message translates to:
  /// **'Your email address is verified.'**
  String get verifyEmailSuccess;

  /// Heading of the password recovery request screen.
  ///
  /// In en, this message translates to:
  /// **'Reset your password'**
  String get forgotPasswordTitle;

  /// Supporting line under the password recovery heading.
  ///
  /// In en, this message translates to:
  /// **'Enter your email address and we will send a reset link if the address can receive one.'**
  String get forgotPasswordSubtitle;

  /// Button that requests password reset instructions.
  ///
  /// In en, this message translates to:
  /// **'Send reset instructions'**
  String get forgotPasswordAction;

  /// Title of the screen shown after a password recovery request.
  ///
  /// In en, this message translates to:
  /// **'Check your email'**
  String get forgotPasswordAcknowledgementTitle;

  /// The only message shown after a password recovery request. It is identical for a known address, an unknown one, a disabled account and one still cooling down. Wording that distinguishes them would confirm which addresses are registered.
  ///
  /// In en, this message translates to:
  /// **'If that address can receive a reset, instructions are on their way. The link expires 30 minutes after it is sent.'**
  String get forgotPasswordAcknowledgementMessage;

  /// Heading of the screen that consumes a reset token.
  ///
  /// In en, this message translates to:
  /// **'Set a new password'**
  String get resetPasswordTitle;

  /// Supporting line under the password reset heading.
  ///
  /// In en, this message translates to:
  /// **'Paste the reset token from your email, then choose a new password.'**
  String get resetPasswordSubtitle;

  /// Label of the reset token field.
  ///
  /// In en, this message translates to:
  /// **'Reset token'**
  String get resetPasswordTokenLabel;

  /// Placeholder text inside the reset token field.
  ///
  /// In en, this message translates to:
  /// **'From the email we sent you'**
  String get resetPasswordTokenHint;

  /// Label of the new password field on the password reset form.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get resetPasswordNewLabel;

  /// Button that submits the new password with the reset token.
  ///
  /// In en, this message translates to:
  /// **'Set new password'**
  String get resetPasswordAction;

  /// Shown when the reset token was refused.
  ///
  /// In en, this message translates to:
  /// **'That reset token is not valid. It may have expired or already been used. Request a new one.'**
  String get resetPasswordInvalidToken;

  /// Title shown after a password reset succeeded.
  ///
  /// In en, this message translates to:
  /// **'Password changed'**
  String get resetPasswordSuccessTitle;

  /// Body shown after a password reset succeeded. States that every session was ended.
  ///
  /// In en, this message translates to:
  /// **'Every session has been signed out, on this device and on any other. Sign in with your new password.'**
  String get resetPasswordSuccessMessage;

  /// Heading of the change-password screen.
  ///
  /// In en, this message translates to:
  /// **'Change password'**
  String get changePasswordTitle;

  /// Supporting line under the change-password heading. States which devices are signed out.
  ///
  /// In en, this message translates to:
  /// **'Changing your password signs out every other device. This one stays signed in.'**
  String get changePasswordSubtitle;

  /// Label of the current password field.
  ///
  /// In en, this message translates to:
  /// **'Current password'**
  String get changePasswordCurrentLabel;

  /// Label of the new password field on the change-password form.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get changePasswordNewLabel;

  /// Button that submits a password change.
  ///
  /// In en, this message translates to:
  /// **'Change password'**
  String get changePasswordAction;

  /// Shown when the current password did not match.
  ///
  /// In en, this message translates to:
  /// **'That did not match your current password.'**
  String get changePasswordIncorrectCurrent;

  /// Title shown after a password change succeeded.
  ///
  /// In en, this message translates to:
  /// **'Password changed'**
  String get changePasswordSuccessTitle;

  /// Body shown after a password change succeeded.
  ///
  /// In en, this message translates to:
  /// **'Every other device has been signed out.'**
  String get changePasswordSuccessMessage;

  /// Field error when the two password fields differ.
  ///
  /// In en, this message translates to:
  /// **'The two passwords do not match.'**
  String get confirmPasswordMismatch;

  /// Field error when the password field was left empty.
  ///
  /// In en, this message translates to:
  /// **'Enter a password.'**
  String get passwordEmpty;

  /// Field error when the password is shorter than the platform's minimum. The minimum is a placeholder because the platform states it; it is not fixed in the copy.
  ///
  /// In en, this message translates to:
  /// **'Use at least {count} characters.'**
  String passwordTooShort(int count);

  /// Field error when the password is longer than the platform's maximum. The maximum is a placeholder because the platform states it; it is not fixed in the copy.
  ///
  /// In en, this message translates to:
  /// **'Use no more than {count} characters.'**
  String passwordTooLong(int count);

  /// Field error when the email address field was left empty.
  ///
  /// In en, this message translates to:
  /// **'Enter your email address.'**
  String get emailEmpty;

  /// Field error when the email address is not a complete address.
  ///
  /// In en, this message translates to:
  /// **'Enter a complete email address.'**
  String get emailMalformed;

  /// Field error when a verification code field was left empty.
  ///
  /// In en, this message translates to:
  /// **'Enter the code.'**
  String get codeEmpty;

  /// Field error when the reset token field was left empty.
  ///
  /// In en, this message translates to:
  /// **'Enter the reset token.'**
  String get tokenEmpty;

  /// Name of the two-step verification feature, used as a section heading.
  ///
  /// In en, this message translates to:
  /// **'Two-step verification'**
  String get mfaSecurityTitle;

  /// Heading of the two-step verification setup screen.
  ///
  /// In en, this message translates to:
  /// **'Set up two-step verification'**
  String get mfaEnrolTitle;

  /// Explains what two-step verification will ask for after it is turned on.
  ///
  /// In en, this message translates to:
  /// **'Two-step verification asks for a code from your authenticator app each time you sign in.'**
  String get mfaEnrolIntro;

  /// Instruction for the step that hands over the setup key. States that the key is shown once.
  ///
  /// In en, this message translates to:
  /// **'Add this key to an authenticator app. It is shown once and cannot be retrieved again.'**
  String get mfaEnrolStepScan;

  /// Instruction for the step that confirms a generated code.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code your app shows now.'**
  String get mfaEnrolStepConfirm;

  /// Label of the one-time setup key shown during enrolment.
  ///
  /// In en, this message translates to:
  /// **'Setup key'**
  String get mfaEnrolSecretLabel;

  /// Warning shown beside the setup key. Security wording: it tells the reader that the key is equivalent to their codes.
  ///
  /// In en, this message translates to:
  /// **'Anyone with this key can generate your codes. Do not photograph it or share it.'**
  String get mfaEnrolSecretWarning;

  /// Button that begins two-step verification setup.
  ///
  /// In en, this message translates to:
  /// **'Begin setup'**
  String get mfaEnrolStartAction;

  /// Label of the authenticator code field.
  ///
  /// In en, this message translates to:
  /// **'Verification code'**
  String get mfaCodeLabel;

  /// Placeholder text inside the authenticator code field.
  ///
  /// In en, this message translates to:
  /// **'6 digits'**
  String get mfaCodeHint;

  /// Button that completes two-step verification setup.
  ///
  /// In en, this message translates to:
  /// **'Turn on two-step verification'**
  String get mfaConfirmAction;

  /// The only message shown for a refused authenticator code. It covers a wrong code, an expired one and a lockout without distinguishing them.
  ///
  /// In en, this message translates to:
  /// **'That code did not verify. Check your authenticator app and try again.'**
  String get mfaInvalidCode;

  /// Shown when two-step verification was already set up on the account.
  ///
  /// In en, this message translates to:
  /// **'Two-step verification is already set up on this account.'**
  String get mfaAlreadyEnrolled;

  /// Shown when the enrolment being confirmed is no longer pending.
  ///
  /// In en, this message translates to:
  /// **'That setup is no longer pending. Start again.'**
  String get mfaNoPendingEnrolment;

  /// Heading of the screen that shows the one-time recovery codes.
  ///
  /// In en, this message translates to:
  /// **'Your recovery codes'**
  String get mfaRecoveryCodesTitle;

  /// Warning shown above the recovery codes. Security wording: it states that the codes are shown once, are single-use, and must be stored by the reader.
  ///
  /// In en, this message translates to:
  /// **'These codes are shown once and never again. Each one signs you in a single time if you lose your authenticator app. Write them down and keep them somewhere only you can reach.'**
  String get mfaRecoveryCodesWarning;

  /// Checkbox the reader ticks to confirm the recovery codes have been stored.
  ///
  /// In en, this message translates to:
  /// **'I have saved these codes somewhere safe'**
  String get mfaRecoveryCodesAcknowledge;

  /// Heading of the screen that asks for a code during sign-in.
  ///
  /// In en, this message translates to:
  /// **'Enter your code'**
  String get mfaChallengeTitle;

  /// Supporting line under the two-step verification challenge heading.
  ///
  /// In en, this message translates to:
  /// **'Open your authenticator app and enter the 6-digit code.'**
  String get mfaChallengeSubtitle;

  /// Switches the challenge from an authenticator code to a recovery code.
  ///
  /// In en, this message translates to:
  /// **'Use a recovery code instead'**
  String get mfaChallengeUseRecovery;

  /// Switches the challenge from a recovery code back to an authenticator code.
  ///
  /// In en, this message translates to:
  /// **'Use your authenticator app instead'**
  String get mfaChallengeUseTotp;

  /// Shown when the sign-in attempt timed out before the code was entered.
  ///
  /// In en, this message translates to:
  /// **'This sign-in attempt timed out. Sign in again to get a new code prompt.'**
  String get mfaChallengeExpired;

  /// Link that abandons the challenge and returns to sign-in.
  ///
  /// In en, this message translates to:
  /// **'Back to sign in'**
  String get mfaChallengeAbandon;

  /// Label of the recovery code field.
  ///
  /// In en, this message translates to:
  /// **'Recovery code'**
  String get mfaRecoveryCodeLabel;

  /// Placeholder text inside the recovery code field.
  ///
  /// In en, this message translates to:
  /// **'One of the codes you saved'**
  String get mfaRecoveryCodeHint;

  /// Supporting line shown when a recovery code is being asked for.
  ///
  /// In en, this message translates to:
  /// **'Enter one of the recovery codes you saved when you turned on two-step verification. Each code works once.'**
  String get mfaRecoveryCodeSubtitle;

  /// Heading of the screen that turns two-step verification off.
  ///
  /// In en, this message translates to:
  /// **'Turn off two-step verification'**
  String get mfaDisableTitle;

  /// Warning shown before two-step verification is turned off. Security wording: it states what protection is lost.
  ///
  /// In en, this message translates to:
  /// **'Your recovery codes will be destroyed and your account will be protected by your password alone.'**
  String get mfaDisableWarning;

  /// Button that turns two-step verification off.
  ///
  /// In en, this message translates to:
  /// **'Turn off'**
  String get mfaDisableAction;

  /// Title of the dialog confirming that two-step verification is turned off.
  ///
  /// In en, this message translates to:
  /// **'Turn off two-step verification?'**
  String get mfaDisableConfirmTitle;

  /// Shown after two-step verification was turned off.
  ///
  /// In en, this message translates to:
  /// **'Two-step verification is off.'**
  String get mfaDisableSuccess;

  /// Shown when two-step verification is not set up on the account.
  ///
  /// In en, this message translates to:
  /// **'Two-step verification is not set up on this account.'**
  String get mfaNotEnrolled;

  /// Heading of the active sessions screen.
  ///
  /// In en, this message translates to:
  /// **'Active sessions'**
  String get sessionsTitle;

  /// Supporting line under the active sessions heading.
  ///
  /// In en, this message translates to:
  /// **'Every device currently signed in to your account. Sign out any you do not recognise.'**
  String get sessionsSubtitle;

  /// Marks the session belonging to the device in the reader's hand.
  ///
  /// In en, this message translates to:
  /// **'This device'**
  String get sessionsCurrentBadge;

  /// Heading shown when no other device holds a session.
  ///
  /// In en, this message translates to:
  /// **'No other sessions'**
  String get sessionsEmptyTitle;

  /// Body shown when no other device holds a session.
  ///
  /// In en, this message translates to:
  /// **'This device is the only one signed in.'**
  String get sessionsEmptyMessage;

  /// When a listed session began. The time is already formatted for the locale and is passed in as a placeholder rather than joined onto the sentence.
  ///
  /// In en, this message translates to:
  /// **'Signed in {time}'**
  String sessionsStartedAt(String time);

  /// When a listed session was last used. The time is already formatted for the locale.
  ///
  /// In en, this message translates to:
  /// **'Last active {time}'**
  String sessionsLastSeenAt(String time);

  /// When a listed session expires. The time is already formatted for the locale.
  ///
  /// In en, this message translates to:
  /// **'Expires {time}'**
  String sessionsExpiresAt(String time);

  /// Stands in for a listed session whose device the platform did not name.
  ///
  /// In en, this message translates to:
  /// **'Unrecognised device'**
  String get sessionsUnknownDevice;

  /// Action that signs out one listed device.
  ///
  /// In en, this message translates to:
  /// **'Sign out this device'**
  String get sessionsRevokeAction;

  /// Title of the dialog confirming that one device is signed out.
  ///
  /// In en, this message translates to:
  /// **'Sign out this device?'**
  String get sessionsRevokeConfirmTitle;

  /// Body of the dialog confirming that one device is signed out.
  ///
  /// In en, this message translates to:
  /// **'That device will need the account password to sign in again.'**
  String get sessionsRevokeConfirmMessage;

  /// Action that signs out every device except this one.
  ///
  /// In en, this message translates to:
  /// **'Sign out all other devices'**
  String get sessionsRevokeOthersAction;

  /// Title of the dialog confirming that every other device is signed out.
  ///
  /// In en, this message translates to:
  /// **'Sign out all other devices?'**
  String get sessionsRevokeOthersConfirmTitle;

  /// Body of the dialog confirming that every other device is signed out.
  ///
  /// In en, this message translates to:
  /// **'Every device except this one will be signed out immediately.'**
  String get sessionsRevokeOthersConfirmMessage;

  /// Shown after one device was signed out.
  ///
  /// In en, this message translates to:
  /// **'That device has been signed out.'**
  String get sessionsRevokedNotice;

  /// Shown after the other devices were signed out. The count is a placeholder so no language has to join a number onto the sentence.
  ///
  /// In en, this message translates to:
  /// **'Other devices signed out ({count}).'**
  String sessionsRevokedOthersNotice(int count);

  /// Shown when the session to sign out was already inactive.
  ///
  /// In en, this message translates to:
  /// **'That session is no longer active, so there was nothing to sign out.'**
  String get sessionsRevokeUnavailable;

  /// Name of the app lock feature, used as a screen and section heading.
  ///
  /// In en, this message translates to:
  /// **'App lock'**
  String get appLockTitle;

  /// Title of the app lock row in settings.
  ///
  /// In en, this message translates to:
  /// **'Lock this app'**
  String get appLockSettingsTitle;

  /// Explains what the app lock does. Privacy wording: it states that the lock is local to the device, never replaces signing in, and that no biometric data reaches the product.
  ///
  /// In en, this message translates to:
  /// **'Ask for your device unlock before showing Karar. This is a privacy control on this device only. It never replaces signing in, and Karar never receives your fingerprint or face data.'**
  String get appLockSettingsDescription;

  /// Label of the switch that turns the app lock on.
  ///
  /// In en, this message translates to:
  /// **'Require device unlock'**
  String get appLockToggleLabel;

  /// Heading shown while the app is locked.
  ///
  /// In en, this message translates to:
  /// **'Karar is locked'**
  String get appLockLockedTitle;

  /// Body shown while the app is locked.
  ///
  /// In en, this message translates to:
  /// **'Unlock with your device to continue.'**
  String get appLockLockedMessage;

  /// Button that starts the device unlock prompt.
  ///
  /// In en, this message translates to:
  /// **'Unlock'**
  String get appLockUnlockAction;

  /// The reason string the operating system shows inside its own unlock prompt. It names no account and no data.
  ///
  /// In en, this message translates to:
  /// **'Unlock Karar'**
  String get appLockPromptReason;

  /// Heading shown when the device offers no unlock method.
  ///
  /// In en, this message translates to:
  /// **'App lock is unavailable'**
  String get appLockUnavailableTitle;

  /// Body shown when the device offers no unlock method.
  ///
  /// In en, this message translates to:
  /// **'This device does not offer an unlock method Karar can use, so the app lock cannot be turned on. Your account stays protected by your password.'**
  String get appLockUnavailableMessage;

  /// Shown when the device supports an unlock method but none has been set up.
  ///
  /// In en, this message translates to:
  /// **'Set up a screen lock, fingerprint or face unlock in your device settings, then turn this on.'**
  String get appLockNotEnrolledMessage;

  /// Shown when the reader dismissed the device unlock prompt.
  ///
  /// In en, this message translates to:
  /// **'Unlock was cancelled.'**
  String get appLockCancelled;

  /// Shown when the device rejected the unlock attempt.
  ///
  /// In en, this message translates to:
  /// **'That was not recognised. Try again.'**
  String get appLockNotRecognised;

  /// Shown when the device blocked further unlock attempts.
  ///
  /// In en, this message translates to:
  /// **'Your device has blocked further unlock attempts. Sign in with your password instead.'**
  String get appLockLockedOut;

  /// Action that abandons the app lock and signs in with a password.
  ///
  /// In en, this message translates to:
  /// **'Sign in with your password'**
  String get appLockSignInInstead;

  /// Shown when the app lock is changed without a signed-in session.
  ///
  /// In en, this message translates to:
  /// **'Sign in before changing the app lock.'**
  String get appLockRequiresSession;

  /// Heading of the screen shown after a session ended without the reader asking.
  ///
  /// In en, this message translates to:
  /// **'You have been signed out'**
  String get sessionEndedTitle;

  /// Reason shown when the session simply expired.
  ///
  /// In en, this message translates to:
  /// **'Your session expired. Sign in again to continue.'**
  String get sessionEndedExpired;

  /// Reason shown when the session was signed out from another device.
  ///
  /// In en, this message translates to:
  /// **'This session was signed out from another device. If that was not you, change your password after signing in.'**
  String get sessionEndedRevoked;

  /// Reason shown when a sign-in token was presented twice, which the platform treats as theft. Security wording: it states what was done, and what the reader should do.
  ///
  /// In en, this message translates to:
  /// **'For your security, Karar ended this session and cleared its credentials from this device, because a sign-in token was presented twice. If you did not cause this, change your password and review your active sessions as soon as you sign in.'**
  String get sessionEndedReuseDetected;

  /// Reason shown when the session could not be renewed.
  ///
  /// In en, this message translates to:
  /// **'Karar could not renew this session, so it has been ended and its credentials cleared from this device. Sign in again.'**
  String get sessionEndedRefreshRejected;

  /// Reason shown when the reader signed out.
  ///
  /// In en, this message translates to:
  /// **'You are signed out.'**
  String get sessionEndedSignedOut;

  /// Button that returns to sign-in after a session ended.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get sessionEndedAction;

  /// Failure message when the device has no usable connection.
  ///
  /// In en, this message translates to:
  /// **'You appear to be offline. Check your connection and try again.'**
  String get failureOffline;

  /// Failure message when the platform did not answer in time.
  ///
  /// In en, this message translates to:
  /// **'That took too long to answer. Check your connection and try again.'**
  String get failureTimeout;

  /// Failure message when too many attempts were made.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Wait a little and try again.'**
  String get failureRateLimited;

  /// Failure message when the platform could not serve the request.
  ///
  /// In en, this message translates to:
  /// **'Karar could not complete that request. Try again in a moment.'**
  String get failureServiceUnavailable;

  /// Failure message when the platform rejected the submitted details. It names no field value.
  ///
  /// In en, this message translates to:
  /// **'Check the details you entered and try again.'**
  String get failureInvalidRequest;

  /// Failure message when the account may not perform the action.
  ///
  /// In en, this message translates to:
  /// **'You do not have permission to do that.'**
  String get failureNotPermitted;

  /// Failure message when the thing acted on no longer exists.
  ///
  /// In en, this message translates to:
  /// **'That is no longer available.'**
  String get failureNotFound;

  /// Failure message when the thing acted on changed underneath the request.
  ///
  /// In en, this message translates to:
  /// **'That has already changed. Reload and try again.'**
  String get failureConflict;

  /// Failure message when the device could not open its secure storage, so the request was abandoned rather than run without protecting credentials.
  ///
  /// In en, this message translates to:
  /// **'This device could not open its secure storage, so Karar stopped rather than continue without protecting your credentials. Try again.'**
  String get failureSecureStorage;

  /// Failure message when the request was cancelled before it finished.
  ///
  /// In en, this message translates to:
  /// **'That request was cancelled.'**
  String get failureCancelled;

  /// Failure message when the session was renewed and the action can be repeated.
  ///
  /// In en, this message translates to:
  /// **'Your session was renewed. Try that again.'**
  String get failureRetrySafe;

  /// Failure message when the session ended during the request.
  ///
  /// In en, this message translates to:
  /// **'Your session ended. Sign in again to continue.'**
  String get failureSessionEnded;

  /// Failure message when an agreement must be reviewed first.
  ///
  /// In en, this message translates to:
  /// **'There is an agreement to review before continuing.'**
  String get failureConsentRequired;

  /// Failure message when an organisation must be chosen first.
  ///
  /// In en, this message translates to:
  /// **'Choose an organisation before continuing.'**
  String get failureTenantSelection;

  /// Failure message when this build of the application is misconfigured.
  ///
  /// In en, this message translates to:
  /// **'This build of Karar is not configured correctly and cannot continue.'**
  String get failureConfiguration;

  /// Failure message for anything else. It carries no diagnostic, status code or field value.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Try again.'**
  String get failureUnexpected;

  /// Spoken name of the password field, including the length rule, so the rule is announced rather than only shown.
  ///
  /// In en, this message translates to:
  /// **'Password. At least {count} characters.'**
  String a11yPasswordRules(int count);

  /// Position announcement for one recovery code in the list.
  ///
  /// In en, this message translates to:
  /// **'Recovery code {position} of {total}'**
  String a11yRecoveryCodePosition(int position, int total);

  /// Announced on a screen whose contents are hidden while the application is in the background.
  ///
  /// In en, this message translates to:
  /// **'Sensitive information. Hidden when Karar is in the background.'**
  String get a11ySensitiveScreen;

  /// Heading of the privacy and consent screen.
  ///
  /// In en, this message translates to:
  /// **'Privacy and consent'**
  String get consentScreenTitle;

  /// Supporting line under the consent heading. States that the documents are published by the operating entity, not written by the application.
  ///
  /// In en, this message translates to:
  /// **'What the platform has recorded about your decisions. The documents are published by the operating entity; this application writes none of their wording.'**
  String get consentScreenDescription;

  /// Consent state: no published document covers the purpose.
  ///
  /// In en, this message translates to:
  /// **'No agreement is needed'**
  String get consentStateNotRequired;

  /// Consent state: a published version is in force and not yet agreed to.
  ///
  /// In en, this message translates to:
  /// **'Your agreement is needed'**
  String get consentStateRequired;

  /// Consent state: a materially changed version needs a new agreement.
  ///
  /// In en, this message translates to:
  /// **'A new version needs your agreement'**
  String get consentStateReconsentRequired;

  /// Consent state: the platform holds an agreement to the version shown.
  ///
  /// In en, this message translates to:
  /// **'In force'**
  String get consentStateActive;

  /// Consent state: the agreement was withdrawn.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn'**
  String get consentStateWithdrawn;

  /// Consent state: the platform did not answer.
  ///
  /// In en, this message translates to:
  /// **'Could not be checked'**
  String get consentStateUnavailable;

  /// Consent state: no version of the document is published.
  ///
  /// In en, this message translates to:
  /// **'No document is published'**
  String get consentStateDocumentUnavailable;

  /// Consent state: the platform cannot record an agreement yet.
  ///
  /// In en, this message translates to:
  /// **'Cannot be recorded yet'**
  String get consentStatePolicyNotApproved;

  /// Explains the consent state where no published document applies.
  ///
  /// In en, this message translates to:
  /// **'No published document covers this purpose, so nothing is being asked of you here.'**
  String get consentDescribeNotRequired;

  /// Explains the consent state where an agreement is outstanding.
  ///
  /// In en, this message translates to:
  /// **'A published version is in force and you have not agreed to it yet.'**
  String get consentDescribeRequired;

  /// Explains the consent state where an earlier agreement no longer covers the version in force.
  ///
  /// In en, this message translates to:
  /// **'A materially changed version is in force. Your earlier agreement no longer covers it.'**
  String get consentDescribeReconsentRequired;

  /// Explains the consent state where an agreement is held.
  ///
  /// In en, this message translates to:
  /// **'The platform holds your agreement to the version shown.'**
  String get consentDescribeActive;

  /// Explains the consent state where the agreement was withdrawn.
  ///
  /// In en, this message translates to:
  /// **'You withdrew your agreement. The platform still permits nothing under it.'**
  String get consentDescribeWithdrawn;

  /// Explains the consent state where the platform did not answer.
  ///
  /// In en, this message translates to:
  /// **'The platform did not answer, so nothing is shown and nothing can be agreed to here.'**
  String get consentDescribeUnavailable;

  /// Explains the consent state where the document has no published version.
  ///
  /// In en, this message translates to:
  /// **'The document that would apply has no published version, so there is nothing to read and nothing to agree to.'**
  String get consentDescribeDocumentUnavailable;

  /// Explains the consent state where no agreement can be recorded yet, so no control is offered.
  ///
  /// In en, this message translates to:
  /// **'The platform cannot record an agreement for this purpose yet, so no control is offered.'**
  String get consentDescribePolicyNotApproved;

  /// Heading shown when no document is waiting for agreement.
  ///
  /// In en, this message translates to:
  /// **'Nothing is waiting for your agreement'**
  String get consentNothingToAgreeTitle;

  /// Body shown when no document is waiting for agreement.
  ///
  /// In en, this message translates to:
  /// **'The platform lists no document that applies to your account right now.'**
  String get consentNothingToAgreeDescription;

  /// Label of the purpose a consent record covers.
  ///
  /// In en, this message translates to:
  /// **'Purpose'**
  String get consentPurposeLabel;

  /// Label of the document a consent record refers to.
  ///
  /// In en, this message translates to:
  /// **'Document'**
  String get consentDocumentLabel;

  /// Label of the document version a consent record refers to.
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get consentVersionLabel;

  /// Label of the date a document version took effect.
  ///
  /// In en, this message translates to:
  /// **'In effect from'**
  String get consentEffectiveFromLabel;

  /// Label of the entity that published the document.
  ///
  /// In en, this message translates to:
  /// **'Published by'**
  String get consentPublishedByLabel;

  /// Label of the regulatory regime a document belongs to.
  ///
  /// In en, this message translates to:
  /// **'Regime'**
  String get consentRegimeLabel;

  /// Label of what the platform requires of the reader.
  ///
  /// In en, this message translates to:
  /// **'Required action'**
  String get consentRequiredActionLabel;

  /// Required action: the reader must agree again.
  ///
  /// In en, this message translates to:
  /// **'A new agreement is required'**
  String get consentActionReacceptance;

  /// Required action: the reader is being informed only.
  ///
  /// In en, this message translates to:
  /// **'For your information'**
  String get consentActionNotice;

  /// Required action: nothing is asked of the reader.
  ///
  /// In en, this message translates to:
  /// **'Nothing is required of you'**
  String get consentActionNone;

  /// Required action: the platform stated none.
  ///
  /// In en, this message translates to:
  /// **'Not stated by the platform'**
  String get consentActionUnstated;

  /// Button that records agreement to the version shown.
  ///
  /// In en, this message translates to:
  /// **'Agree to this version'**
  String get consentAcceptAction;

  /// Button that records withdrawal of an agreement.
  ///
  /// In en, this message translates to:
  /// **'Withdraw agreement'**
  String get consentWithdrawAction;

  /// Shown after the platform recorded an agreement.
  ///
  /// In en, this message translates to:
  /// **'The platform recorded your agreement.'**
  String get consentAcceptedConfirmation;

  /// Shown after the platform recorded a withdrawal.
  ///
  /// In en, this message translates to:
  /// **'The platform recorded your withdrawal.'**
  String get consentWithdrawnConfirmation;

  /// States that an earlier consent record is kept as evidence.
  ///
  /// In en, this message translates to:
  /// **'The earlier record is kept as evidence and is not deleted.'**
  String get consentHistoryPreservedNote;

  /// States that agreeing again creates a new record rather than replacing the earlier one.
  ///
  /// In en, this message translates to:
  /// **'Agreeing creates a new record against the new version. The earlier record is unchanged.'**
  String get consentReconsentCreatesNewGrantNote;

  /// States that a newer version is published for information only and the existing agreement stands.
  ///
  /// In en, this message translates to:
  /// **'A newer version has been published for your information. Your existing agreement still applies.'**
  String get consentNoticeRequiredNote;

  /// Explains that no policy resolves because no jurisdiction is assigned.
  ///
  /// In en, this message translates to:
  /// **'No jurisdiction is assigned to your account, so no policy resolves for you yet.'**
  String get consentBlockerJurisdiction;

  /// Explains that no agreement can be recorded because no policy is approved.
  ///
  /// In en, this message translates to:
  /// **'No approved policy is in effect, so the platform can record no agreement.'**
  String get consentBlockerPolicy;

  /// Explains that no agreement can name a publisher because no entity is assigned.
  ///
  /// In en, this message translates to:
  /// **'No operating entity is assigned, so an agreement would name no publisher.'**
  String get consentBlockerEntity;

  /// Heading shown when consent state could not be read.
  ///
  /// In en, this message translates to:
  /// **'Consent could not be checked'**
  String get consentSurfaceUnavailableTitle;

  /// Body shown when consent state could not be read.
  ///
  /// In en, this message translates to:
  /// **'The platform did not answer. Nothing has changed about what you have agreed to.'**
  String get consentSurfaceUnavailableDescription;

  /// Heading shown when the platform did not record an agreement or withdrawal.
  ///
  /// In en, this message translates to:
  /// **'That was not recorded'**
  String get consentActionFailedTitle;

  /// Body shown when the platform did not record an agreement or withdrawal.
  ///
  /// In en, this message translates to:
  /// **'The platform did not record the change, so nothing about your agreement has changed.'**
  String get consentActionFailedDescription;

  /// Label of the reference identifying a recorded consent.
  ///
  /// In en, this message translates to:
  /// **'Record reference'**
  String get consentGrantReferenceLabel;

  /// Heading of the signed-in home screen.
  ///
  /// In en, this message translates to:
  /// **'Your account'**
  String get platformHomeTitle;

  /// Home section heading for the services available to the account.
  ///
  /// In en, this message translates to:
  /// **'Services'**
  String get platformSectionServices;

  /// Home section heading for the account and profile rows.
  ///
  /// In en, this message translates to:
  /// **'Account and profile'**
  String get platformSectionAccount;

  /// Home section heading for the security and session rows.
  ///
  /// In en, this message translates to:
  /// **'Security and session'**
  String get platformSectionSession;

  /// Home section heading for the organisation row.
  ///
  /// In en, this message translates to:
  /// **'Organisation'**
  String get platformSectionOrganisation;

  /// Home section heading for the jurisdiction row.
  ///
  /// In en, this message translates to:
  /// **'Jurisdiction'**
  String get platformSectionJurisdiction;

  /// Home section heading for the legal and operating entity row.
  ///
  /// In en, this message translates to:
  /// **'Legal and operating entity'**
  String get platformSectionLegal;

  /// Home section heading for the privacy and consent row.
  ///
  /// In en, this message translates to:
  /// **'Privacy and consent'**
  String get platformSectionConsent;

  /// Home section heading for the settings row.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get platformSectionSettings;

  /// Heading shown when the platform confirmed no service is enabled.
  ///
  /// In en, this message translates to:
  /// **'No services are available to you'**
  String get platformNoServicesTitle;

  /// Body shown when the platform confirmed no service is enabled.
  ///
  /// In en, this message translates to:
  /// **'Your account is in order. The platform has confirmed that no service is enabled for it yet, so there is nothing here to open.'**
  String get platformNoServicesDescription;

  /// Heading shown when the platform did not confirm which services apply.
  ///
  /// In en, this message translates to:
  /// **'Services could not be checked'**
  String get platformCapabilitiesUnresolvedTitle;

  /// Body shown when the platform did not confirm which services apply.
  ///
  /// In en, this message translates to:
  /// **'The platform did not confirm which services apply to you, so none are shown. Nothing has changed on your account.'**
  String get platformCapabilitiesUnresolvedDescription;

  /// Heading of the screen shown when the platform context could not be loaded.
  ///
  /// In en, this message translates to:
  /// **'The service is unavailable'**
  String get platformServiceUnavailableTitle;

  /// Body shown when the platform context could not be loaded and retrying may help.
  ///
  /// In en, this message translates to:
  /// **'Your platform context could not be loaded, so nothing is shown rather than something that may be wrong. Your account and your data are unaffected.'**
  String get platformServiceUnavailableDescription;

  /// Body shown when the platform context could not be loaded and the platform said retrying will not help.
  ///
  /// In en, this message translates to:
  /// **'Your platform context could not be loaded, and the platform reported that trying again now will not change that. Close the application and open it again later.'**
  String get platformServiceUnavailableFinalDescription;

  /// Action that restarts the loading of the platform context.
  ///
  /// In en, this message translates to:
  /// **'Start over'**
  String get platformActionStartOver;

  /// Title of the profile row on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get platformProfileRowTitle;

  /// Supporting line of the profile row on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Your name, language and account status'**
  String get platformProfileRowSubtitle;

  /// States that this device holds a signed-in session.
  ///
  /// In en, this message translates to:
  /// **'Signed in on this device'**
  String get platformSessionActive;

  /// Label of the opaque reference identifying the current session.
  ///
  /// In en, this message translates to:
  /// **'Session reference'**
  String get platformSessionReferenceLabel;

  /// Label of the opaque reference identifying the account, on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Account reference'**
  String get platformUserReferenceLabel;

  /// Supporting line of the organisation row on the home screen.
  ///
  /// In en, this message translates to:
  /// **'The organisation this session is bound to'**
  String get platformOrganisationRowSubtitle;

  /// States that the session is bound to no organisation, on the home screen.
  ///
  /// In en, this message translates to:
  /// **'This session is not bound to an organisation'**
  String get platformOrganisationUnbound;

  /// Label of the role the platform reports for the session, on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Role'**
  String get platformRoleHintLabel;

  /// Jurisdiction state: none is assigned to the account.
  ///
  /// In en, this message translates to:
  /// **'Not assigned'**
  String get platformJurisdictionNone;

  /// Jurisdiction state: declared by the reader and not verified.
  ///
  /// In en, this message translates to:
  /// **'Declared, not verified'**
  String get platformJurisdictionUnverified;

  /// Jurisdiction state: verified by the platform.
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get platformJurisdictionVerified;

  /// Jurisdiction state the platform reported that this version of the application does not know. Agrees with the word for jurisdiction, not with the word for status.
  ///
  /// In en, this message translates to:
  /// **'Not recognised by this version'**
  String get platformJurisdictionUnrecognised;

  /// Supporting line of the jurisdiction row on the home screen.
  ///
  /// In en, this message translates to:
  /// **'The regime that governs your account'**
  String get platformJurisdictionRowSubtitle;

  /// Heading of the jurisdiction screen.
  ///
  /// In en, this message translates to:
  /// **'Jurisdiction'**
  String get platformJurisdictionScreenTitle;

  /// Label of the reference identifying the assigned jurisdiction.
  ///
  /// In en, this message translates to:
  /// **'Jurisdiction reference'**
  String get platformJurisdictionReferenceLabel;

  /// Heading of the section where a jurisdiction is declared.
  ///
  /// In en, this message translates to:
  /// **'Declare your jurisdiction'**
  String get platformJurisdictionDeclareTitle;

  /// Explains what a declaration is. States that it is unverified and grants no access.
  ///
  /// In en, this message translates to:
  /// **'A declaration records where you say you are. It is not verified, and it grants no additional access on its own.'**
  String get platformJurisdictionDeclareDescription;

  /// Button that records a declared jurisdiction.
  ///
  /// In en, this message translates to:
  /// **'Record declaration'**
  String get platformJurisdictionDeclareAction;

  /// Shown when the platform supplied no jurisdictions to choose from.
  ///
  /// In en, this message translates to:
  /// **'The platform did not supply the jurisdictions available for selection, so none can be offered here.'**
  String get platformJurisdictionSelectionUnavailable;

  /// Shown after a declaration was recorded.
  ///
  /// In en, this message translates to:
  /// **'Your declaration was recorded.'**
  String get platformJurisdictionRecorded;

  /// Shown when the declared jurisdiction was already in effect.
  ///
  /// In en, this message translates to:
  /// **'That jurisdiction was already in effect, so nothing changed.'**
  String get platformJurisdictionAlreadyInEffect;

  /// States that a recorded declaration is still unverified.
  ///
  /// In en, this message translates to:
  /// **'Recorded as declared by you, and unverified.'**
  String get platformJurisdictionRemainsUnverified;

  /// Heading of the legal and operating entity screen.
  ///
  /// In en, this message translates to:
  /// **'Legal'**
  String get platformLegalScreenTitle;

  /// Supporting line of the legal row on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Who you contracted with, and the documents that apply'**
  String get platformLegalRowSubtitle;

  /// Section heading for the entity the account contracted with.
  ///
  /// In en, this message translates to:
  /// **'Operating entity'**
  String get platformOperatingEntityHeading;

  /// Label of the entity's registered legal name.
  ///
  /// In en, this message translates to:
  /// **'Registered legal name'**
  String get platformOperatingEntityNameLabel;

  /// Label of where the entity is registered.
  ///
  /// In en, this message translates to:
  /// **'Registered in'**
  String get platformOperatingEntityJurisdictionLabel;

  /// Label of the entity's data protection contact.
  ///
  /// In en, this message translates to:
  /// **'Data protection contact'**
  String get platformOperatingEntityContactLabel;

  /// States that the entity shown is the one the account contracted with.
  ///
  /// In en, this message translates to:
  /// **'This is the legal person you contracted with, as recorded by the platform.'**
  String get platformOperatingEntityAssignedNote;

  /// Heading shown when no operating entity is recorded.
  ///
  /// In en, this message translates to:
  /// **'No operating entity is assigned'**
  String get platformOperatingEntityUnassignedTitle;

  /// Body shown when no operating entity is recorded.
  ///
  /// In en, this message translates to:
  /// **'No contracting entity is recorded for your account yet.'**
  String get platformOperatingEntityUnassignedDescription;

  /// Heading shown when the operating entity could not be read.
  ///
  /// In en, this message translates to:
  /// **'The operating entity could not be read'**
  String get platformOperatingEntityUnavailableTitle;

  /// Body shown when the operating entity could not be read.
  ///
  /// In en, this message translates to:
  /// **'The platform could not confirm which legal person you contracted with, so none is shown.'**
  String get platformOperatingEntityUnavailableDescription;

  /// Heading shown when the platform reported an operating entity state this version does not know.
  ///
  /// In en, this message translates to:
  /// **'The operating entity is not recognised'**
  String get platformOperatingEntityUnrecognisedTitle;

  /// Body shown when the platform reported an operating entity state this version does not know.
  ///
  /// In en, this message translates to:
  /// **'The platform reported a state this version of the application does not recognise, so nothing is shown.'**
  String get platformOperatingEntityUnrecognisedDescription;

  /// Section heading for the policy governing the account.
  ///
  /// In en, this message translates to:
  /// **'Governing policy'**
  String get platformPolicyPackHeading;

  /// Label of the governing policy's version.
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get platformPolicyPackVersionLabel;

  /// Label of the governing policy's status.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get platformPolicyPackStatusLabel;

  /// States that no governing policy is in effect.
  ///
  /// In en, this message translates to:
  /// **'None in effect'**
  String get platformPolicyPackAbsent;

  /// Supporting line of the privacy and consent row on the home screen.
  ///
  /// In en, this message translates to:
  /// **'What you have agreed to, and what is outstanding'**
  String get platformConsentRowSubtitle;

  /// Supporting line of the settings row on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Language, appearance and account'**
  String get platformSettingsRowSubtitle;

  /// Heading of the profile screen.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileScreenTitle;

  /// Label of the editable display name field.
  ///
  /// In en, this message translates to:
  /// **'Display name'**
  String get profileDisplayNameLabel;

  /// Helper line under the display name field.
  ///
  /// In en, this message translates to:
  /// **'The name shown to people in your organisation.'**
  String get profileDisplayNameHelper;

  /// Label of the language the platform holds on the account, which is not the interface language.
  ///
  /// In en, this message translates to:
  /// **'Language recorded on your account'**
  String get profileLanguageLabel;

  /// Label of the account status the platform reports.
  ///
  /// In en, this message translates to:
  /// **'Account status'**
  String get profileAccountStatusLabel;

  /// Label of the reference identifying the recorded residency.
  ///
  /// In en, this message translates to:
  /// **'Residency reference'**
  String get profileResidencyLabel;

  /// Label of the organisation shown on the profile screen.
  ///
  /// In en, this message translates to:
  /// **'Organisation'**
  String get profileOrganisationLabel;

  /// Label of the opaque reference identifying the account, on the profile screen.
  ///
  /// In en, this message translates to:
  /// **'Account reference'**
  String get profileAccountReferenceLabel;

  /// Label of the date the account was created.
  ///
  /// In en, this message translates to:
  /// **'Account created'**
  String get profileMemberSinceLabel;

  /// Label of the date the profile was last changed.
  ///
  /// In en, this message translates to:
  /// **'Last updated'**
  String get profileLastUpdatedLabel;

  /// Account status: active.
  ///
  /// In en, this message translates to:
  /// **'Active'**
  String get profileStatusActive;

  /// Account status: a request to disable has been recorded.
  ///
  /// In en, this message translates to:
  /// **'Disable requested'**
  String get profileStatusDisableRequested;

  /// Account status: a request to delete has been recorded.
  ///
  /// In en, this message translates to:
  /// **'Deletion requested'**
  String get profileStatusDeletionRequested;

  /// Account status: disabled.
  ///
  /// In en, this message translates to:
  /// **'Disabled'**
  String get profileStatusDisabled;

  /// Account status the platform reported that this version of the application does not know. Agrees with the word for status, not with the word for jurisdiction.
  ///
  /// In en, this message translates to:
  /// **'Not recognised by this version'**
  String get profileStatusUnrecognised;

  /// States that a recorded disable request has by itself disabled and removed nothing.
  ///
  /// In en, this message translates to:
  /// **'Your request has been recorded. Nothing has been disabled or removed by it yet.'**
  String get profileStatusDisableRequestedNote;

  /// Shown after the profile was updated.
  ///
  /// In en, this message translates to:
  /// **'Your profile was updated.'**
  String get profileSaveConfirmation;

  /// Heading shown when the platform refused a profile change.
  ///
  /// In en, this message translates to:
  /// **'Your profile was not updated'**
  String get profileSaveFailedTitle;

  /// Body shown when the platform refused a profile change.
  ///
  /// In en, this message translates to:
  /// **'The platform did not accept the change. Nothing changed.'**
  String get profileSaveFailedDescription;

  /// Heading shown when saving was attempted with nothing changed.
  ///
  /// In en, this message translates to:
  /// **'Nothing to save'**
  String get profileNoChangesTitle;

  /// Body shown when saving was attempted with nothing changed.
  ///
  /// In en, this message translates to:
  /// **'Change a field before saving.'**
  String get profileNoChangesDescription;

  /// Heading shown when the profile could not be loaded.
  ///
  /// In en, this message translates to:
  /// **'Your profile could not be loaded'**
  String get profileUnavailableTitle;

  /// Body shown when the profile could not be loaded.
  ///
  /// In en, this message translates to:
  /// **'The platform did not answer. Nothing has changed.'**
  String get profileUnavailableDescription;

  /// Stands in for a profile value the platform did not state.
  ///
  /// In en, this message translates to:
  /// **'Not stated'**
  String get profileNotStated;

  /// Heading of the settings screen.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsScreenTitle;

  /// Settings section heading for the light and dark theme choice.
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsAppearanceTitle;

  /// Theme option that follows the device setting.
  ///
  /// In en, this message translates to:
  /// **'Follow the device'**
  String get settingsThemeSystem;

  /// Theme option: light.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsThemeLight;

  /// Theme option: dark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsThemeDark;

  /// Settings section heading for the rows leading to account surfaces.
  ///
  /// In en, this message translates to:
  /// **'Your account'**
  String get settingsYourAccountTitle;

  /// Settings row leading to the profile screen.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get settingsProfileRow;

  /// Settings row leading to the organisation screen.
  ///
  /// In en, this message translates to:
  /// **'Organisation'**
  String get settingsOrganisationRow;

  /// Settings row leading to the jurisdiction screen.
  ///
  /// In en, this message translates to:
  /// **'Jurisdiction'**
  String get settingsJurisdictionRow;

  /// Settings row leading to the legal and operating entity screen.
  ///
  /// In en, this message translates to:
  /// **'Legal and operating entity'**
  String get settingsLegalRow;

  /// Settings row leading to the privacy and consent screen.
  ///
  /// In en, this message translates to:
  /// **'Privacy and consent'**
  String get settingsConsentRow;

  /// Settings section heading for the account closure request.
  ///
  /// In en, this message translates to:
  /// **'Closing your account'**
  String get settingsDangerTitle;

  /// Title of the account disable request card.
  ///
  /// In en, this message translates to:
  /// **'Request that your account is disabled'**
  String get settingsDisableTitle;

  /// Explains that the request records an intention only. It must not imply that anything is disabled, removed or signed out by making it.
  ///
  /// In en, this message translates to:
  /// **'This records your intention. Nothing is disabled or removed by the request itself, and you stay signed in.'**
  String get settingsDisableDescription;

  /// Button that records a request to disable the account.
  ///
  /// In en, this message translates to:
  /// **'Request account disable'**
  String get settingsDisableAction;

  /// Title of the dialog confirming the disable request.
  ///
  /// In en, this message translates to:
  /// **'Record this request?'**
  String get settingsDisableConfirmTitle;

  /// Body of the dialog confirming the disable request.
  ///
  /// In en, this message translates to:
  /// **'Your request will be recorded against your account. Nothing is disabled or removed by recording it.'**
  String get settingsDisableConfirmMessage;

  /// Heading shown after the disable request was recorded.
  ///
  /// In en, this message translates to:
  /// **'Your request was recorded'**
  String get settingsDisableRecordedTitle;

  /// Body shown after the disable request was recorded.
  ///
  /// In en, this message translates to:
  /// **'The platform has your request. Nothing has been disabled or removed.'**
  String get settingsDisableRecordedMessage;

  /// Appended when the request was recorded but its audit entry was not written.
  ///
  /// In en, this message translates to:
  /// **'The request was recorded, but the platform could not write its audit entry. Quote this to support if you follow it up.'**
  String get settingsDisableAuditWarning;

  /// Heading shown when the platform refused the disable request.
  ///
  /// In en, this message translates to:
  /// **'Your request was not recorded'**
  String get settingsDisableFailedTitle;

  /// Body shown when the platform refused the disable request.
  ///
  /// In en, this message translates to:
  /// **'The platform did not accept the request. Nothing changed.'**
  String get settingsDisableFailedMessage;

  /// Heading of the organisation selection screen.
  ///
  /// In en, this message translates to:
  /// **'Choose an organisation'**
  String get tenantSelectionTitle;

  /// Supporting line under the organisation selection heading.
  ///
  /// In en, this message translates to:
  /// **'Your account belongs to more than one organisation. Choose the one to use for this session. Only the organisations the platform listed for you appear here.'**
  String get tenantSelectionDescription;

  /// Heading shown when the account belongs to no organisation.
  ///
  /// In en, this message translates to:
  /// **'You do not belong to an organisation yet'**
  String get tenantNoMembershipTitle;

  /// Body shown when the account belongs to no organisation.
  ///
  /// In en, this message translates to:
  /// **'Your account is in order, but no organisation has admitted it. Until one does, this session stays unbound and anything belonging to an organisation stays unavailable.'**
  String get tenantNoMembershipDescription;

  /// Heading of the organisation screen.
  ///
  /// In en, this message translates to:
  /// **'Organisation'**
  String get tenantOrganisationTitle;

  /// Label of the organisation the session is bound to.
  ///
  /// In en, this message translates to:
  /// **'Current organisation'**
  String get tenantCurrentOrganisationLabel;

  /// Label of the role the platform reports within the organisation.
  ///
  /// In en, this message translates to:
  /// **'Role'**
  String get tenantRoleLabel;

  /// Pairs the role label with the role the platform reported. A message rather than a joined string, because the separator between a label and its value is not a colon in every language.
  ///
  /// In en, this message translates to:
  /// **'{label}: {value}'**
  String tenantRoleValuePattern(String label, String value);

  /// Heading shown when the session is bound to no organisation.
  ///
  /// In en, this message translates to:
  /// **'This session is not bound to an organisation'**
  String get tenantUnboundTitle;

  /// Body shown when the session is bound to no organisation.
  ///
  /// In en, this message translates to:
  /// **'Nothing that belongs to an organisation is available while the session is unbound.'**
  String get tenantUnboundDescription;

  /// Section heading for switching to another organisation.
  ///
  /// In en, this message translates to:
  /// **'Switch organisation'**
  String get tenantSwitchHeading;

  /// Explains what switching organisation does to the current session. States that the session ends and a new one begins.
  ///
  /// In en, this message translates to:
  /// **'Switching ends the current session and starts a new one in the other organisation. Everything loaded for the current organisation is discarded, and this device is signed in again automatically.'**
  String get tenantSwitchDescription;

  /// Button that switches to another organisation.
  ///
  /// In en, this message translates to:
  /// **'Switch'**
  String get tenantSwitchAction;

  /// Heading shown when the account has no other organisation to switch to.
  ///
  /// In en, this message translates to:
  /// **'No other organisation is available'**
  String get tenantNoAlternativesTitle;

  /// Body shown when the account has no other organisation to switch to.
  ///
  /// In en, this message translates to:
  /// **'The platform lists no other membership for your account, so there is nothing to switch to.'**
  String get tenantNoAlternativesDescription;

  /// Shown after the session was bound to the chosen organisation.
  ///
  /// In en, this message translates to:
  /// **'This session is now bound to the organisation.'**
  String get tenantBoundConfirmation;

  /// Shown after a switch to another organisation completed.
  ///
  /// In en, this message translates to:
  /// **'You are now in the other organisation, in a new session. The previous session has ended.'**
  String get tenantSwitchedConfirmation;

  /// Heading shown when the platform refused the organisation selection.
  ///
  /// In en, this message translates to:
  /// **'The organisation could not be selected'**
  String get tenantSelectionFailedTitle;

  /// Body shown when the platform refused the organisation selection.
  ///
  /// In en, this message translates to:
  /// **'The platform refused the selection. Nothing changed.'**
  String get tenantSelectionFailedDescription;

  /// Heading shown when membership changed while a switch was running.
  ///
  /// In en, this message translates to:
  /// **'Your membership changed during the switch'**
  String get tenantMembershipChangedTitle;

  /// Body shown when membership changed while a switch was running.
  ///
  /// In en, this message translates to:
  /// **'Your access to that organisation changed while the switch was in progress, so the session was ended rather than left without a membership. Sign in again.'**
  String get tenantMembershipChangedDescription;

  /// Heading shown when the chosen organisation is not available to the account.
  ///
  /// In en, this message translates to:
  /// **'That organisation is not available to you'**
  String get tenantMembershipRefusedTitle;

  /// Body shown when the chosen organisation is not available to the account.
  ///
  /// In en, this message translates to:
  /// **'The platform did not accept the selection. Nothing about your session changed.'**
  String get tenantMembershipRefusedDescription;

  /// Spoken name of the control that selects one organisation from the list.
  ///
  /// In en, this message translates to:
  /// **'Select organisation'**
  String get tenantSelectSemanticPrefix;

  /// Section heading for redeeming an organisation invitation.
  ///
  /// In en, this message translates to:
  /// **'Redeem an invitation'**
  String get tenantInvitationHeading;

  /// Explains that the invitation itself decides which organisation is joined.
  ///
  /// In en, this message translates to:
  /// **'If an organisation invited you, enter the code from that invitation. The invitation itself decides which organisation you join.'**
  String get tenantInvitationDescription;

  /// Label of the invitation code field.
  ///
  /// In en, this message translates to:
  /// **'Invitation code'**
  String get tenantInvitationFieldLabel;

  /// Button that redeems an invitation code.
  ///
  /// In en, this message translates to:
  /// **'Redeem invitation'**
  String get tenantInvitationAction;

  /// Shown after an invitation was redeemed.
  ///
  /// In en, this message translates to:
  /// **'The invitation was redeemed. Your memberships are being re-checked.'**
  String get tenantInvitationRedeemed;

  /// Heading shown when an invitation could not be redeemed.
  ///
  /// In en, this message translates to:
  /// **'The invitation could not be redeemed'**
  String get tenantInvitationFailedTitle;

  /// Body shown when an invitation could not be redeemed. It lists the possible reasons without stating which one applied.
  ///
  /// In en, this message translates to:
  /// **'The code was not accepted. It may have been used already, withdrawn, or issued for a different account.'**
  String get tenantInvitationFailedDescription;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
