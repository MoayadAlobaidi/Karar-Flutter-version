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

  @override
  String get signInTitle => 'تسجيل الدخول';

  @override
  String get signInSubtitle =>
      'استخدم البريد الإلكتروني وكلمة المرور الخاصة بحسابك في كرار.';

  @override
  String get signInAction => 'تسجيل الدخول';

  @override
  String get signInEmailLabel => 'البريد الإلكتروني';

  @override
  String get signInPasswordLabel => 'كلمة المرور';

  @override
  String get signInForgotPassword => 'هل نسيت كلمة المرور؟';

  @override
  String get signInCreateAccount => 'إنشاء حساب';

  @override
  String get signInInvalidCredentials =>
      'لم يطابق البريد الإلكتروني وكلمة المرور أي حساب يمكنك الدخول إليه. تحقق منهما وحاول مرة أخرى.';

  @override
  String get signInSecureStorageNotice =>
      'تعذّر على هذا الجهاز فتح مخزنه الآمن، لذا تم تسجيل خروجك. سجّل الدخول مرة أخرى للمتابعة.';

  @override
  String get signOutAction => 'تسجيل الخروج';

  @override
  String get signOutConfirmTitle => 'تسجيل الخروج؟';

  @override
  String get signOutConfirmMessage =>
      'ستحتاج إلى بريدك الإلكتروني وكلمة المرور لتسجيل الدخول مجددًا على هذا الجهاز.';

  @override
  String get signOutIncompleteNotice =>
      'تم تسجيل خروجك على هذا الجهاز. لم نتمكن من الوصول إلى كرار لإنهاء الجلسة في كل مكان، لذا راجع جلساتك النشطة عند عودة الاتصال.';

  @override
  String get registerTitle => 'إنشاء حساب';

  @override
  String get registerSubtitle =>
      'سنرسل رمز تحقق إلى البريد الإلكتروني الذي تدخله.';

  @override
  String get registerAction => 'إنشاء الحساب';

  @override
  String get registerConfirmPasswordLabel => 'تأكيد كلمة المرور';

  @override
  String get registerPasswordHelp => '٨ أحرف على الأقل.';

  @override
  String get registerAcknowledgementTitle => 'تحقّق من بريدك الإلكتروني';

  @override
  String get registerAcknowledgementMessage =>
      'إذا كان بالإمكان تسجيل هذا العنوان، فرمز التحقق في طريقه إليك. أدخله في الشاشة التالية لإكمال إعداد حسابك.';

  @override
  String get registerBackToSignIn => 'العودة إلى تسجيل الدخول';

  @override
  String get verifyEmailTitle => 'تأكيد بريدك الإلكتروني';

  @override
  String get verifyEmailSubtitle =>
      'أدخل الرمز المكوّن من ٨ خانات الذي أرسلناه إليك. لا يظهر هذا الرمز في أي مكان آخر.';

  @override
  String get verifyEmailCodeLabel => 'رمز التحقق';

  @override
  String get verifyEmailCodeHint => '٨ خانات';

  @override
  String get verifyEmailAction => 'تأكيد';

  @override
  String get verifyEmailResendAction => 'إرسال رمز آخر';

  @override
  String get verifyEmailResendAcknowledgement =>
      'إذا كان هذا العنوان بحاجة إلى رمز، فرمز آخر في طريقه إليك.';

  @override
  String get verifyEmailInvalidCode =>
      'لم يتم التحقق من هذا الرمز. ربما انتهت صلاحيته أو استُخدم من قبل.';

  @override
  String get verifyEmailSuccess => 'تم تأكيد بريدك الإلكتروني.';

  @override
  String get forgotPasswordTitle => 'إعادة تعيين كلمة المرور';

  @override
  String get forgotPasswordSubtitle =>
      'أدخل بريدك الإلكتروني وسنرسل رابط إعادة التعيين إذا كان العنوان قادرًا على استقباله.';

  @override
  String get forgotPasswordAction => 'إرسال تعليمات إعادة التعيين';

  @override
  String get forgotPasswordAcknowledgementTitle => 'تحقّق من بريدك الإلكتروني';

  @override
  String get forgotPasswordAcknowledgementMessage =>
      'إذا كان بإمكان هذا العنوان استقبال إعادة تعيين، فالتعليمات في طريقها إليك. تنتهي صلاحية الرابط بعد ٣٠ دقيقة من إرساله.';

  @override
  String get resetPasswordTitle => 'تعيين كلمة مرور جديدة';

  @override
  String get resetPasswordSubtitle =>
      'الصق رمز إعادة التعيين من بريدك الإلكتروني، ثم اختر كلمة مرور جديدة.';

  @override
  String get resetPasswordTokenLabel => 'رمز إعادة التعيين';

  @override
  String get resetPasswordTokenHint => 'من الرسالة التي أرسلناها إليك';

  @override
  String get resetPasswordNewLabel => 'كلمة المرور الجديدة';

  @override
  String get resetPasswordAction => 'تعيين كلمة المرور';

  @override
  String get resetPasswordInvalidToken =>
      'رمز إعادة التعيين هذا غير صالح. ربما انتهت صلاحيته أو استُخدم من قبل. اطلب رمزًا جديدًا.';

  @override
  String get resetPasswordSuccessTitle => 'تم تغيير كلمة المرور';

  @override
  String get resetPasswordSuccessMessage =>
      'تم تسجيل الخروج من جميع الجلسات، على هذا الجهاز وعلى أي جهاز آخر. سجّل الدخول بكلمة المرور الجديدة.';

  @override
  String get changePasswordTitle => 'تغيير كلمة المرور';

  @override
  String get changePasswordSubtitle =>
      'تغيير كلمة المرور يسجّل الخروج من كل الأجهزة الأخرى. يبقى هذا الجهاز مسجّلًا.';

  @override
  String get changePasswordCurrentLabel => 'كلمة المرور الحالية';

  @override
  String get changePasswordNewLabel => 'كلمة المرور الجديدة';

  @override
  String get changePasswordAction => 'تغيير كلمة المرور';

  @override
  String get changePasswordIncorrectCurrent =>
      'لم يطابق ذلك كلمة المرور الحالية.';

  @override
  String get changePasswordSuccessTitle => 'تم تغيير كلمة المرور';

  @override
  String get changePasswordSuccessMessage =>
      'تم تسجيل الخروج من كل الأجهزة الأخرى.';

  @override
  String get confirmPasswordMismatch => 'كلمتا المرور غير متطابقتين.';

  @override
  String get passwordEmpty => 'أدخل كلمة مرور.';

  @override
  String passwordTooShort(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'استخدم $countString أحرف على الأقل.';
  }

  @override
  String passwordTooLong(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'استخدم $countString حرفًا كحد أقصى.';
  }

  @override
  String get emailEmpty => 'أدخل بريدك الإلكتروني.';

  @override
  String get emailMalformed => 'أدخل بريدًا إلكترونيًا كاملًا.';

  @override
  String get codeEmpty => 'أدخل الرمز.';

  @override
  String get tokenEmpty => 'أدخل رمز إعادة التعيين.';

  @override
  String get mfaSecurityTitle => 'التحقق بخطوتين';

  @override
  String get mfaEnrolTitle => 'إعداد التحقق بخطوتين';

  @override
  String get mfaEnrolIntro =>
      'يطلب التحقق بخطوتين رمزًا من تطبيق المصادقة في كل مرة تسجّل فيها الدخول.';

  @override
  String get mfaEnrolStepScan =>
      'أضف هذا المفتاح إلى تطبيق مصادقة. يظهر مرة واحدة ولا يمكن استرجاعه.';

  @override
  String get mfaEnrolStepConfirm =>
      'أدخل الرمز المكوّن من ٦ أرقام الذي يعرضه تطبيقك الآن.';

  @override
  String get mfaEnrolSecretLabel => 'مفتاح الإعداد';

  @override
  String get mfaEnrolSecretWarning =>
      'أي شخص يملك هذا المفتاح يستطيع توليد رموزك. لا تصوّره ولا تشاركه.';

  @override
  String get mfaEnrolStartAction => 'بدء الإعداد';

  @override
  String get mfaCodeLabel => 'رمز التحقق';

  @override
  String get mfaCodeHint => '٦ أرقام';

  @override
  String get mfaConfirmAction => 'تفعيل التحقق بخطوتين';

  @override
  String get mfaInvalidCode =>
      'لم يتم التحقق من هذا الرمز. راجع تطبيق المصادقة وحاول مرة أخرى.';

  @override
  String get mfaAlreadyEnrolled =>
      'التحقق بخطوتين مفعّل بالفعل على هذا الحساب.';

  @override
  String get mfaNoPendingEnrolment =>
      'لم يعد هذا الإعداد معلّقًا. ابدأ من جديد.';

  @override
  String get mfaRecoveryCodesTitle => 'رموز الاسترجاع الخاصة بك';

  @override
  String get mfaRecoveryCodesWarning =>
      'تظهر هذه الرموز مرة واحدة فقط ولن تظهر مجددًا. يسجّل كل رمز دخولك مرة واحدة إذا فقدت تطبيق المصادقة. دوّنها واحتفظ بها في مكان لا يصل إليه سواك.';

  @override
  String get mfaRecoveryCodesAcknowledge => 'حفظت هذه الرموز في مكان آمن';

  @override
  String get mfaChallengeTitle => 'أدخل رمزك';

  @override
  String get mfaChallengeSubtitle =>
      'افتح تطبيق المصادقة وأدخل الرمز المكوّن من ٦ أرقام.';

  @override
  String get mfaChallengeUseRecovery => 'استخدام رمز استرجاع بدلًا من ذلك';

  @override
  String get mfaChallengeUseTotp => 'استخدام تطبيق المصادقة بدلًا من ذلك';

  @override
  String get mfaChallengeExpired =>
      'انتهت مهلة محاولة تسجيل الدخول هذه. سجّل الدخول مجددًا للحصول على طلب رمز جديد.';

  @override
  String get mfaChallengeAbandon => 'العودة إلى تسجيل الدخول';

  @override
  String get mfaRecoveryCodeLabel => 'رمز الاسترجاع';

  @override
  String get mfaRecoveryCodeHint => 'أحد الرموز التي حفظتها';

  @override
  String get mfaRecoveryCodeSubtitle =>
      'أدخل أحد رموز الاسترجاع التي حفظتها عند تفعيل التحقق بخطوتين. يعمل كل رمز مرة واحدة.';

  @override
  String get mfaDisableTitle => 'إيقاف التحقق بخطوتين';

  @override
  String get mfaDisableWarning =>
      'سيتم إتلاف رموز الاسترجاع الخاصة بك وسيصبح حسابك محميًا بكلمة المرور وحدها.';

  @override
  String get mfaDisableAction => 'إيقاف';

  @override
  String get mfaDisableConfirmTitle => 'إيقاف التحقق بخطوتين؟';

  @override
  String get mfaDisableSuccess => 'تم إيقاف التحقق بخطوتين.';

  @override
  String get mfaNotEnrolled => 'التحقق بخطوتين غير مفعّل على هذا الحساب.';

  @override
  String get sessionsTitle => 'الجلسات النشطة';

  @override
  String get sessionsSubtitle =>
      'كل جهاز مسجّل الدخول حاليًا إلى حسابك. سجّل الخروج من أي جهاز لا تعرفه.';

  @override
  String get sessionsCurrentBadge => 'هذا الجهاز';

  @override
  String get sessionsEmptyTitle => 'لا توجد جلسات أخرى';

  @override
  String get sessionsEmptyMessage => 'هذا الجهاز هو الوحيد المسجّل دخوله.';

  @override
  String sessionsStartedAt(String time) {
    return 'سجّل الدخول $time';
  }

  @override
  String sessionsLastSeenAt(String time) {
    return 'آخر نشاط $time';
  }

  @override
  String sessionsExpiresAt(String time) {
    return 'تنتهي $time';
  }

  @override
  String get sessionsUnknownDevice => 'جهاز غير معروف';

  @override
  String get sessionsRevokeAction => 'تسجيل الخروج من هذا الجهاز';

  @override
  String get sessionsRevokeConfirmTitle => 'تسجيل الخروج من هذا الجهاز؟';

  @override
  String get sessionsRevokeConfirmMessage =>
      'سيحتاج ذلك الجهاز إلى كلمة مرور الحساب لتسجيل الدخول مجددًا.';

  @override
  String get sessionsRevokeOthersAction => 'تسجيل الخروج من كل الأجهزة الأخرى';

  @override
  String get sessionsRevokeOthersConfirmTitle =>
      'تسجيل الخروج من كل الأجهزة الأخرى؟';

  @override
  String get sessionsRevokeOthersConfirmMessage =>
      'سيتم تسجيل الخروج فورًا من كل جهاز عدا هذا الجهاز.';

  @override
  String get sessionsRevokedNotice => 'تم تسجيل الخروج من ذلك الجهاز.';

  @override
  String sessionsRevokedOthersNotice(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'تم تسجيل الخروج من الأجهزة الأخرى (العدد: $countString).';
  }

  @override
  String get sessionsRevokeUnavailable =>
      'لم تعد تلك الجلسة نشطة، لذا لم يكن هناك ما يُسجَّل الخروج منه.';

  @override
  String get appLockTitle => 'قفل التطبيق';

  @override
  String get appLockSettingsTitle => 'قفل هذا التطبيق';

  @override
  String get appLockSettingsDescription =>
      'اطلب فتح قفل جهازك قبل عرض كرار. هذا إعداد خصوصية على هذا الجهاز فقط. لا يحل محل تسجيل الدخول أبدًا، ولا يستقبل كرار بصمتك أو بيانات وجهك.';

  @override
  String get appLockToggleLabel => 'طلب فتح قفل الجهاز';

  @override
  String get appLockLockedTitle => 'كرار مقفل';

  @override
  String get appLockLockedMessage => 'افتح القفل باستخدام جهازك للمتابعة.';

  @override
  String get appLockUnlockAction => 'فتح القفل';

  @override
  String get appLockPromptReason => 'فتح قفل كرار';

  @override
  String get appLockUnavailableTitle => 'قفل التطبيق غير متاح';

  @override
  String get appLockUnavailableMessage =>
      'لا يوفّر هذا الجهاز طريقة فتح قفل يمكن لكرار استخدامها، لذا لا يمكن تفعيل قفل التطبيق. يبقى حسابك محميًا بكلمة المرور.';

  @override
  String get appLockNotEnrolledMessage =>
      'أعدّ قفل الشاشة أو بصمة الإصبع أو فتح القفل بالوجه في إعدادات جهازك، ثم فعّل هذا الخيار.';

  @override
  String get appLockCancelled => 'تم إلغاء فتح القفل.';

  @override
  String get appLockNotRecognised => 'لم يتم التعرف على ذلك. حاول مرة أخرى.';

  @override
  String get appLockLockedOut =>
      'حظر جهازك المزيد من محاولات فتح القفل. سجّل الدخول بكلمة المرور بدلًا من ذلك.';

  @override
  String get appLockSignInInstead => 'تسجيل الدخول بكلمة المرور';

  @override
  String get appLockRequiresSession => 'سجّل الدخول قبل تغيير قفل التطبيق.';

  @override
  String get sessionEndedTitle => 'تم تسجيل خروجك';

  @override
  String get sessionEndedExpired =>
      'انتهت صلاحية جلستك. سجّل الدخول مجددًا للمتابعة.';

  @override
  String get sessionEndedRevoked =>
      'تم تسجيل الخروج من هذه الجلسة من جهاز آخر. إذا لم تكن أنت، غيّر كلمة المرور بعد تسجيل الدخول.';

  @override
  String get sessionEndedReuseDetected =>
      'حفاظًا على أمانك، أنهى كرار هذه الجلسة ومسح بياناتها من هذا الجهاز، لأن رمز تسجيل دخول قُدّم مرتين. إذا لم تكن أنت السبب، غيّر كلمة المرور وراجع جلساتك النشطة فور تسجيل الدخول.';

  @override
  String get sessionEndedRefreshRejected =>
      'تعذّر على كرار تجديد هذه الجلسة، لذا تم إنهاؤها ومسح بياناتها من هذا الجهاز. سجّل الدخول مجددًا.';

  @override
  String get sessionEndedSignedOut => 'تم تسجيل خروجك.';

  @override
  String get sessionEndedAction => 'تسجيل الدخول';

  @override
  String get failureOffline =>
      'يبدو أنك غير متصل. تحقق من اتصالك وحاول مرة أخرى.';

  @override
  String get failureTimeout =>
      'استغرق ذلك وقتًا طويلًا. تحقق من اتصالك وحاول مرة أخرى.';

  @override
  String get failureRateLimited =>
      'محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.';

  @override
  String get failureServiceUnavailable =>
      'تعذّر على كرار إتمام ذلك الطلب. حاول بعد قليل.';

  @override
  String get failureInvalidRequest =>
      'راجع البيانات التي أدخلتها وحاول مرة أخرى.';

  @override
  String get failureNotPermitted => 'ليس لديك إذن للقيام بذلك.';

  @override
  String get failureNotFound => 'لم يعد ذلك متاحًا.';

  @override
  String get failureConflict => 'تغيّر ذلك بالفعل. أعد التحميل وحاول مرة أخرى.';

  @override
  String get failureSecureStorage =>
      'تعذّر على هذا الجهاز فتح مخزنه الآمن، لذا توقّف كرار بدلًا من المتابعة دون حماية بياناتك. حاول مرة أخرى.';

  @override
  String get failureCancelled => 'تم إلغاء ذلك الطلب.';

  @override
  String get failureRetrySafe => 'تم تجديد جلستك. حاول مرة أخرى.';

  @override
  String get failureSessionEnded => 'انتهت جلستك. سجّل الدخول مجددًا للمتابعة.';

  @override
  String get failureConsentRequired =>
      'هناك اتفاقية يجب مراجعتها قبل المتابعة.';

  @override
  String get failureTenantSelection => 'اختر مؤسسة قبل المتابعة.';

  @override
  String get failureConfiguration =>
      'هذه النسخة من كرار غير مهيأة بشكل صحيح ولا يمكنها المتابعة.';

  @override
  String get failureUnexpected => 'حدث خطأ ما. حاول مرة أخرى.';

  @override
  String a11yPasswordRules(int count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'كلمة المرور. $countString أحرف على الأقل.';
  }

  @override
  String a11yRecoveryCodePosition(int position, int total) {
    final intl.NumberFormat positionNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String positionString = positionNumberFormat.format(position);
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    return 'رمز الاسترجاع $positionString من $totalString';
  }

  @override
  String get a11ySensitiveScreen =>
      'معلومات حساسة. تُخفى عندما يكون كرار في الخلفية.';

  @override
  String get consentScreenTitle => 'الخصوصية والموافقة';

  @override
  String get consentScreenDescription =>
      'ما سجّلته المنصة بشأن قراراتك. المستندات ينشرها الكيان المشغّل، ولا يكتب هذا التطبيق أي صياغة منها.';

  @override
  String get consentStateNotRequired => 'لا حاجة إلى موافقة';

  @override
  String get consentStateRequired => 'موافقتك مطلوبة';

  @override
  String get consentStateReconsentRequired => 'إصدار جديد يتطلب موافقتك';

  @override
  String get consentStateActive => 'سارية';

  @override
  String get consentStateWithdrawn => 'مسحوبة';

  @override
  String get consentStateUnavailable => 'تعذّر التحقق';

  @override
  String get consentStateDocumentUnavailable => 'لا يوجد مستند منشور';

  @override
  String get consentStatePolicyNotApproved => 'لا يمكن تسجيلها بعد';

  @override
  String get consentDescribeNotRequired =>
      'لا يغطي أي مستند منشور هذا الغرض، فلا يُطلب منك شيء هنا.';

  @override
  String get consentDescribeRequired =>
      'يوجد إصدار منشور ساري المفعول ولم توافق عليه بعد.';

  @override
  String get consentDescribeReconsentRequired =>
      'يوجد إصدار جرى تغييره جوهرياً وهو ساري المفعول، ولم تعد موافقتك السابقة تغطيه.';

  @override
  String get consentDescribeActive =>
      'تحتفظ المنصة بموافقتك على الإصدار المعروض.';

  @override
  String get consentDescribeWithdrawn =>
      'لقد سحبت موافقتك، ولا تسمح المنصة بأي معالجة بموجبها.';

  @override
  String get consentDescribeUnavailable =>
      'لم تجب المنصة، لذلك لا يُعرض شيء ولا يمكن الموافقة على شيء هنا.';

  @override
  String get consentDescribeDocumentUnavailable =>
      'المستند الذي كان سينطبق ليس له إصدار منشور، فلا يوجد ما يُقرأ ولا ما يُوافَق عليه.';

  @override
  String get consentDescribePolicyNotApproved =>
      'لا يمكن للمنصة تسجيل موافقة لهذا الغرض بعد، لذلك لا يُعرض أي زر.';

  @override
  String get consentNothingToAgreeTitle => 'لا شيء ينتظر موافقتك';

  @override
  String get consentNothingToAgreeDescription =>
      'لا تدرج المنصة أي مستند ينطبق على حسابك حالياً.';

  @override
  String get consentPurposeLabel => 'الغرض';

  @override
  String get consentDocumentLabel => 'المستند';

  @override
  String get consentVersionLabel => 'الإصدار';

  @override
  String get consentEffectiveFromLabel => 'ساري من';

  @override
  String get consentPublishedByLabel => 'نشره';

  @override
  String get consentRegimeLabel => 'النظام';

  @override
  String get consentRequiredActionLabel => 'الإجراء المطلوب';

  @override
  String get consentActionReacceptance => 'مطلوبة موافقة جديدة';

  @override
  String get consentActionNotice => 'للعلم فقط';

  @override
  String get consentActionNone => 'لا يُطلب منك شيء';

  @override
  String get consentActionUnstated => 'لم تحدده المنصة';

  @override
  String get consentAcceptAction => 'الموافقة على هذا الإصدار';

  @override
  String get consentWithdrawAction => 'سحب الموافقة';

  @override
  String get consentAcceptedConfirmation => 'سجّلت المنصة موافقتك.';

  @override
  String get consentWithdrawnConfirmation => 'سجّلت المنصة سحبك للموافقة.';

  @override
  String get consentHistoryPreservedNote =>
      'يُحتفظ بالسجل السابق كدليل ولا يُحذف.';

  @override
  String get consentReconsentCreatesNewGrantNote =>
      'تنشئ الموافقة سجلاً جديداً مقابل الإصدار الجديد، ويبقى السجل السابق كما هو.';

  @override
  String get consentNoticeRequiredNote =>
      'نُشر إصدار أحدث للعلم فقط، ولا تزال موافقتك الحالية سارية.';

  @override
  String get consentBlockerJurisdiction =>
      'لم يُحدد نطاق قضائي لحسابك، لذلك لا تنطبق عليك أي سياسة بعد.';

  @override
  String get consentBlockerPolicy =>
      'لا توجد سياسة معتمدة سارية، لذلك لا يمكن للمنصة تسجيل أي موافقة.';

  @override
  String get consentBlockerEntity =>
      'لا يوجد كيان مشغّل محدد، لذلك لن تحمل الموافقة اسم أي ناشر.';

  @override
  String get consentSurfaceUnavailableTitle => 'تعذّر التحقق من الموافقة';

  @override
  String get consentSurfaceUnavailableDescription =>
      'لم تجب المنصة. ولم يتغيّر شيء بشأن ما وافقت عليه.';

  @override
  String get consentActionFailedTitle => 'لم يُسجَّل ذلك';

  @override
  String get consentActionFailedDescription =>
      'لم تسجّل المنصة التغيير، لذلك لم يطرأ أي تغيير على موافقتك.';

  @override
  String get consentGrantReferenceLabel => 'مرجع السجل';

  @override
  String get platformHomeTitle => 'حسابك';

  @override
  String get platformSectionServices => 'الخدمات';

  @override
  String get platformSectionAccount => 'الحساب والملف الشخصي';

  @override
  String get platformSectionSession => 'الأمان والجلسة';

  @override
  String get platformSectionOrganisation => 'المؤسسة';

  @override
  String get platformSectionJurisdiction => 'النطاق القضائي';

  @override
  String get platformSectionLegal => 'الشؤون القانونية والكيان المشغّل';

  @override
  String get platformSectionConsent => 'الخصوصية والموافقة';

  @override
  String get platformSectionSettings => 'الإعدادات';

  @override
  String get platformNoServicesTitle => 'لا تتوفر لك أي خدمات';

  @override
  String get platformNoServicesDescription =>
      'حسابك سليم. أكدت المنصة عدم تفعيل أي خدمة له حتى الآن، فلا يوجد ما يمكن فتحه هنا.';

  @override
  String get platformCapabilitiesUnresolvedTitle => 'تعذّر التحقق من الخدمات';

  @override
  String get platformCapabilitiesUnresolvedDescription =>
      'لم تؤكد المنصة الخدمات التي تنطبق عليك، لذلك لا تُعرض أي خدمة. لم يطرأ أي تغيير على حسابك.';

  @override
  String get platformServiceUnavailableTitle => 'الخدمة غير متاحة';

  @override
  String get platformServiceUnavailableDescription =>
      'تعذّر تحميل سياق المنصة الخاص بك، لذلك لا يُعرض شيء بدلاً من عرض ما قد يكون غير صحيح. لم يتأثر حسابك ولا بياناتك.';

  @override
  String get platformServiceUnavailableFinalDescription =>
      'تعذّر تحميل سياق المنصة الخاص بك، وأفادت المنصة بأن إعادة المحاولة الآن لن تغيّر ذلك. أغلق التطبيق وافتحه لاحقاً.';

  @override
  String get platformActionStartOver => 'البدء من جديد';

  @override
  String get platformProfileRowTitle => 'الملف الشخصي';

  @override
  String get platformProfileRowSubtitle => 'اسمك ولغتك وحالة حسابك';

  @override
  String get platformSessionActive => 'تم تسجيل الدخول على هذا الجهاز';

  @override
  String get platformSessionReferenceLabel => 'مرجع الجلسة';

  @override
  String get platformUserReferenceLabel => 'مرجع الحساب';

  @override
  String get platformOrganisationRowSubtitle => 'المؤسسة المرتبطة بهذه الجلسة';

  @override
  String get platformOrganisationUnbound => 'هذه الجلسة غير مرتبطة بأي مؤسسة';

  @override
  String get platformRoleHintLabel => 'الدور';

  @override
  String get platformJurisdictionNone => 'غير محدد';

  @override
  String get platformJurisdictionUnverified => 'مُعلَن وغير موثَّق';

  @override
  String get platformJurisdictionVerified => 'موثَّق';

  @override
  String get platformJurisdictionUnrecognised => 'غير معروف في هذا الإصدار';

  @override
  String get platformJurisdictionRowSubtitle => 'النظام الذي يحكم حسابك';

  @override
  String get platformJurisdictionScreenTitle => 'النطاق القضائي';

  @override
  String get platformJurisdictionReferenceLabel => 'مرجع النطاق القضائي';

  @override
  String get platformJurisdictionDeclareTitle => 'أعلن نطاقك القضائي';

  @override
  String get platformJurisdictionDeclareDescription =>
      'يسجّل الإعلان المكان الذي تقول إنك فيه. وهو غير موثَّق، ولا يمنح أي صلاحية إضافية بحد ذاته.';

  @override
  String get platformJurisdictionDeclareAction => 'تسجيل الإعلان';

  @override
  String get platformJurisdictionSelectionUnavailable =>
      'لم توفّر المنصة النطاقات القضائية المتاحة للاختيار، لذلك لا يمكن عرض أي منها هنا.';

  @override
  String get platformJurisdictionRecorded => 'تم تسجيل إعلانك.';

  @override
  String get platformJurisdictionAlreadyInEffect =>
      'كان ذلك النطاق القضائي سارياً بالفعل، فلم يتغيّر شيء.';

  @override
  String get platformJurisdictionRemainsUnverified =>
      'مسجَّل بإعلان منك، وغير موثَّق.';

  @override
  String get platformLegalScreenTitle => 'الشؤون القانونية';

  @override
  String get platformLegalRowSubtitle =>
      'الجهة المتعاقد معها والمستندات المنطبقة';

  @override
  String get platformOperatingEntityHeading => 'الكيان المشغّل';

  @override
  String get platformOperatingEntityNameLabel => 'الاسم القانوني المسجَّل';

  @override
  String get platformOperatingEntityJurisdictionLabel => 'مسجَّل في';

  @override
  String get platformOperatingEntityContactLabel =>
      'جهة الاتصال لحماية البيانات';

  @override
  String get platformOperatingEntityAssignedNote =>
      'هذا هو الشخص الاعتباري الذي تعاقدت معه، وفق ما سجّلته المنصة.';

  @override
  String get platformOperatingEntityUnassignedTitle =>
      'لا يوجد كيان مشغّل محدد';

  @override
  String get platformOperatingEntityUnassignedDescription =>
      'لم يُسجَّل بعد أي كيان متعاقد لحسابك.';

  @override
  String get platformOperatingEntityUnavailableTitle =>
      'تعذّرت قراءة الكيان المشغّل';

  @override
  String get platformOperatingEntityUnavailableDescription =>
      'تعذّر على المنصة تأكيد الشخص الاعتباري الذي تعاقدت معه، لذلك لا يُعرض أي كيان.';

  @override
  String get platformOperatingEntityUnrecognisedTitle =>
      'الكيان المشغّل غير معروف';

  @override
  String get platformOperatingEntityUnrecognisedDescription =>
      'أفادت المنصة بحالة لا يعرفها هذا الإصدار من التطبيق، لذلك لا يُعرض شيء.';

  @override
  String get platformPolicyPackHeading => 'السياسة الحاكمة';

  @override
  String get platformPolicyPackVersionLabel => 'الإصدار';

  @override
  String get platformPolicyPackStatusLabel => 'الحالة';

  @override
  String get platformPolicyPackAbsent => 'لا توجد سياسة سارية';

  @override
  String get platformConsentRowSubtitle => 'ما وافقت عليه وما لا يزال معلقاً';

  @override
  String get platformSettingsRowSubtitle => 'اللغة والمظهر والحساب';

  @override
  String get profileScreenTitle => 'الملف الشخصي';

  @override
  String get profileDisplayNameLabel => 'الاسم المعروض';

  @override
  String get profileDisplayNameHelper => 'الاسم الذي يظهر للأشخاص في مؤسستك.';

  @override
  String get profileLanguageLabel => 'اللغة المسجّلة في حسابك';

  @override
  String get profileAccountStatusLabel => 'حالة الحساب';

  @override
  String get profileResidencyLabel => 'مرجع الإقامة';

  @override
  String get profileOrganisationLabel => 'المؤسسة';

  @override
  String get profileAccountReferenceLabel => 'مرجع الحساب';

  @override
  String get profileMemberSinceLabel => 'تاريخ إنشاء الحساب';

  @override
  String get profileLastUpdatedLabel => 'آخر تحديث';

  @override
  String get profileStatusActive => 'نشط';

  @override
  String get profileStatusDisableRequested => 'طُلب التعطيل';

  @override
  String get profileStatusDeletionRequested => 'طُلب الحذف';

  @override
  String get profileStatusDisabled => 'معطَّل';

  @override
  String get profileStatusUnrecognised => 'غير معروفة في هذا الإصدار';

  @override
  String get profileStatusDisableRequestedNote =>
      'سُجّل طلبك. ولم يُعطَّل أو يُحذف أي شيء بموجبه حتى الآن.';

  @override
  String get profileSaveConfirmation => 'تم تحديث ملفك الشخصي.';

  @override
  String get profileSaveFailedTitle => 'لم يُحدَّث ملفك الشخصي';

  @override
  String get profileSaveFailedDescription =>
      'لم تقبل المنصة التغيير. ولم يتغيّر شيء.';

  @override
  String get profileNoChangesTitle => 'لا يوجد ما يُحفظ';

  @override
  String get profileNoChangesDescription => 'غيّر حقلاً قبل الحفظ.';

  @override
  String get profileUnavailableTitle => 'تعذّر تحميل ملفك الشخصي';

  @override
  String get profileUnavailableDescription => 'لم تجب المنصة. ولم يتغيّر شيء.';

  @override
  String get profileNotStated => 'غير محدد';

  @override
  String get settingsScreenTitle => 'الإعدادات';

  @override
  String get settingsAppearanceTitle => 'المظهر';

  @override
  String get settingsThemeSystem => 'حسب الجهاز';

  @override
  String get settingsThemeLight => 'فاتح';

  @override
  String get settingsThemeDark => 'داكن';

  @override
  String get settingsYourAccountTitle => 'حسابك';

  @override
  String get settingsProfileRow => 'الملف الشخصي';

  @override
  String get settingsOrganisationRow => 'المؤسسة';

  @override
  String get settingsJurisdictionRow => 'النطاق القضائي';

  @override
  String get settingsLegalRow => 'الشؤون القانونية والكيان المشغّل';

  @override
  String get settingsConsentRow => 'الخصوصية والموافقة';

  @override
  String get settingsDangerTitle => 'إغلاق حسابك';

  @override
  String get settingsDisableTitle => 'طلب تعطيل حسابك';

  @override
  String get settingsDisableDescription =>
      'يسجّل هذا نيتك. ولا يُعطَّل أو يُحذف شيء بموجب الطلب نفسه، وتبقى مسجّل الدخول.';

  @override
  String get settingsDisableAction => 'طلب تعطيل الحساب';

  @override
  String get settingsDisableConfirmTitle => 'هل تريد تسجيل هذا الطلب؟';

  @override
  String get settingsDisableConfirmMessage =>
      'سيُسجَّل طلبك على حسابك. ولا يُعطَّل أو يُحذف شيء بتسجيله.';

  @override
  String get settingsDisableRecordedTitle => 'تم تسجيل طلبك';

  @override
  String get settingsDisableRecordedMessage =>
      'استلمت المنصة طلبك. ولم يُعطَّل أو يُحذف أي شيء.';

  @override
  String get settingsDisableAuditWarning =>
      'سُجّل الطلب، لكن تعذّر على المنصة كتابة قيد التدقيق الخاص به. اذكر هذا للدعم إذا تابعت الأمر.';

  @override
  String get settingsDisableFailedTitle => 'لم يُسجَّل طلبك';

  @override
  String get settingsDisableFailedMessage =>
      'لم تقبل المنصة الطلب. ولم يتغيّر شيء.';

  @override
  String get tenantSelectionTitle => 'اختر مؤسسة';

  @override
  String get tenantSelectionDescription =>
      'ينتمي حسابك إلى أكثر من مؤسسة. اختر المؤسسة التي ستستخدمها في هذه الجلسة. تظهر هنا المؤسسات التي أدرجتها المنصة لك فقط.';

  @override
  String get tenantNoMembershipTitle => 'لا تنتمي إلى أي مؤسسة بعد';

  @override
  String get tenantNoMembershipDescription =>
      'حسابك سليم، لكن لم تقبله أي مؤسسة. وإلى أن يحدث ذلك تبقى هذه الجلسة غير مرتبطة ويبقى كل ما يخص المؤسسات غير متاح.';

  @override
  String get tenantOrganisationTitle => 'المؤسسة';

  @override
  String get tenantCurrentOrganisationLabel => 'المؤسسة الحالية';

  @override
  String get tenantRoleLabel => 'الدور';

  @override
  String tenantRoleValuePattern(String label, String value) {
    return '$label: $value';
  }

  @override
  String get tenantUnboundTitle => 'هذه الجلسة غير مرتبطة بأي مؤسسة';

  @override
  String get tenantUnboundDescription =>
      'لا يتوفر أي شيء يخص المؤسسات ما دامت الجلسة غير مرتبطة.';

  @override
  String get tenantSwitchHeading => 'تبديل المؤسسة';

  @override
  String get tenantSwitchDescription =>
      'يؤدي التبديل إلى إنهاء الجلسة الحالية وبدء جلسة جديدة في المؤسسة الأخرى. يُتخلّص من كل ما حُمّل للمؤسسة الحالية، ويُسجَّل دخول هذا الجهاز من جديد تلقائياً.';

  @override
  String get tenantSwitchAction => 'تبديل';

  @override
  String get tenantNoAlternativesTitle => 'لا تتوفر مؤسسة أخرى';

  @override
  String get tenantNoAlternativesDescription =>
      'لا تدرج المنصة أي عضوية أخرى لحسابك، فلا يوجد ما يمكن التبديل إليه.';

  @override
  String get tenantBoundConfirmation => 'أصبحت هذه الجلسة مرتبطة بالمؤسسة.';

  @override
  String get tenantSwitchedConfirmation =>
      'أنت الآن في المؤسسة الأخرى ضمن جلسة جديدة. وقد انتهت الجلسة السابقة.';

  @override
  String get tenantSelectionFailedTitle => 'تعذّر اختيار المؤسسة';

  @override
  String get tenantSelectionFailedDescription =>
      'رفضت المنصة الاختيار. لم يتغيّر شيء.';

  @override
  String get tenantMembershipChangedTitle => 'تغيّرت عضويتك أثناء التبديل';

  @override
  String get tenantMembershipChangedDescription =>
      'تغيّر وصولك إلى تلك المؤسسة أثناء تنفيذ التبديل، لذلك أُنهيت الجلسة بدلاً من تركها بلا عضوية. سجّل الدخول من جديد.';

  @override
  String get tenantMembershipRefusedTitle => 'تلك المؤسسة غير متاحة لك';

  @override
  String get tenantMembershipRefusedDescription =>
      'لم تقبل المنصة الاختيار. ولم يطرأ أي تغيير على جلستك.';

  @override
  String get tenantSelectSemanticPrefix => 'اختيار المؤسسة';

  @override
  String get tenantInvitationHeading => 'استخدام دعوة';

  @override
  String get tenantInvitationDescription =>
      'إذا دعتك مؤسسة، أدخل الرمز الوارد في تلك الدعوة. والدعوة نفسها هي التي تحدد المؤسسة التي تنضم إليها.';

  @override
  String get tenantInvitationFieldLabel => 'رمز الدعوة';

  @override
  String get tenantInvitationAction => 'استخدام الدعوة';

  @override
  String get tenantInvitationRedeemed =>
      'تم استخدام الدعوة. تجري إعادة التحقق من عضوياتك.';

  @override
  String get tenantInvitationFailedTitle => 'تعذّر استخدام الدعوة';

  @override
  String get tenantInvitationFailedDescription =>
      'لم يُقبل الرمز. ربما استُخدم من قبل، أو سُحب، أو صدر لحساب آخر.';
}
