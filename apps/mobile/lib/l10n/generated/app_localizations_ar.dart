// GENERATED FILE — do not edit by hand.
// Source of truth: lib/l10n/arb/*.arb. Regenerate with `flutter gen-l10n`.
// ignore_for_file: type=lint

// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appName => 'قرار';

  @override
  String get actionContinue => 'متابعة';

  @override
  String get actionCancel => 'إلغاء';

  @override
  String get actionConfirm => 'تأكيد';

  @override
  String get actionSave => 'حفظ';

  @override
  String get actionClose => 'إغلاق';

  @override
  String get actionBack => 'رجوع';

  @override
  String get actionNext => 'التالي';

  @override
  String get actionDone => 'تم';

  @override
  String get actionRetry => 'إعادة المحاولة';

  @override
  String get actionDismiss => 'تجاهل';

  @override
  String get actionEdit => 'تعديل';

  @override
  String get actionRemove => 'إزالة';

  @override
  String get actionSubmit => 'إرسال';

  @override
  String get actionRefresh => 'تحديث';

  @override
  String get actionCopy => 'نسخ';

  @override
  String get actionSelectAll => 'تحديد الكل';

  @override
  String fieldOptionalSuffix(String label) {
    return '$label (اختياري)';
  }

  @override
  String get fieldRequiredMarker => 'مطلوب';

  @override
  String get fieldRequiredIndicator => '*';

  @override
  String fieldClear(String label) {
    return 'مسح $label';
  }

  @override
  String fieldShowValue(String label) {
    return 'إظهار $label';
  }

  @override
  String fieldHideValue(String label) {
    return 'إخفاء $label';
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

    return '$usedString من $limitString حرفًا';
  }

  @override
  String fieldErrorAnnouncement(String label, String message) {
    return 'يوجد خطأ في $label. $message';
  }

  @override
  String get statusSuccess => 'ناجح';

  @override
  String get statusWarning => 'تحذير';

  @override
  String get statusError => 'خطأ';

  @override
  String get statusInfo => 'معلومة';

  @override
  String get statusPending => 'قيد المعالجة';

  @override
  String get statusNeutral => 'لم يبدأ';

  @override
  String get stateLoading => 'جارٍ التحميل';

  @override
  String stateLoadingWithSubject(String subject) {
    return 'جارٍ تحميل $subject';
  }

  @override
  String get stateEmptyTitle => 'لا يوجد شيء هنا بعد';

  @override
  String get stateEmptyDescription =>
      'لا يوجد ما يمكن عرضه في هذه الشاشة حاليًا.';

  @override
  String get stateErrorTitle => 'حدث خطأ ما';

  @override
  String get stateErrorDescription =>
      'تعذر تحميل هذه الشاشة. تحقق من اتصالك ثم أعد المحاولة.';

  @override
  String get stateOfflineTitle => 'أنت غير متصل بالإنترنت';

  @override
  String get stateOfflineDescription => 'أعد الاتصال لتحميل أحدث المعلومات.';

  @override
  String stateErrorReference(String reference) {
    return 'الرقم المرجعي $reference';
  }

  @override
  String get a11yDialog => 'مربع حوار';

  @override
  String get a11ySheet => 'لوحة سفلية';

  @override
  String get a11yBanner => 'تنبيه';

  @override
  String get a11yNavigationBar => 'التنقل الرئيسي';

  @override
  String a11yTabPosition(int position, int total) {
    final intl.NumberFormat positionNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String positionString = positionNumberFormat.format(position);
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    return 'علامة التبويب $positionString من $totalString';
  }

  @override
  String get a11yBusy => 'قيد التنفيذ';

  @override
  String get a11ySelected => 'محدد';

  @override
  String get a11yDragHandle => 'اسحب لتغيير الحجم';

  @override
  String a11yFieldWithRequired(String label) {
    return '$label، مطلوب';
  }

  @override
  String a11yControlBusy(String label) {
    return '$label، قيد التنفيذ';
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
      other: 'تم تحديد $countString عنصر',
      many: 'تم تحديد $countString عنصرًا',
      few: 'تم تحديد $countString عناصر',
      two: 'تم تحديد عنصرين',
      one: 'تم تحديد عنصر واحد',
      zero: 'لم يتم تحديد أي عنصر',
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

    return 'الصفحة $pageString من $totalString';
  }

  @override
  String retryCountdown(int seconds) {
    final intl.NumberFormat secondsNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      other: 'أعد المحاولة بعد $secondsString ثانية',
      many: 'أعد المحاولة بعد $secondsString ثانية',
      few: 'أعد المحاولة بعد $secondsString ثوان',
      two: 'أعد المحاولة بعد ثانيتين',
      one: 'أعد المحاولة بعد ثانية واحدة',
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

    return 'آخر تحديث $timestampString';
  }

  @override
  String get languageSettingTitle => 'اللغة';

  @override
  String get languageSystemDefault => 'لغة النظام';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageArabic => 'العربية';

  @override
  String legalDocumentLanguageNotice(String language) {
    return 'هذا المستند مقدم من قرار باللغة $language.';
  }

  @override
  String get legalDocumentUnavailable => 'هذا المستند غير متاح حاليا.';
}
