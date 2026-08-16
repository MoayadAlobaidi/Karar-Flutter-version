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
