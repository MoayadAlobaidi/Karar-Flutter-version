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
}
