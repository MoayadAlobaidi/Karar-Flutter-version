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
  String get appName => 'كرار';

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
    return 'هذا المستند مقدم من كرار باللغة $language.';
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
  String get registerPasswordHelp => '8 أحرف على الأقل.';

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
      'أدخل الرمز المكوّن من 8 خانات الذي أرسلناه إليك. لا يظهر هذا الرمز في أي مكان آخر.';

  @override
  String get verifyEmailCodeLabel => 'رمز التحقق';

  @override
  String get verifyEmailCodeHint => '8 خانات';

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
      'إذا كان بإمكان هذا العنوان استقبال إعادة تعيين، فالتعليمات في طريقها إليك. تنتهي صلاحية الرابط بعد 30 دقيقة من إرساله.';

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
      'أدخل الرمز المكوّن من 6 أرقام الذي يعرضه تطبيقك الآن.';

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
  String get mfaCodeHint => '6 أرقام';

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
      'افتح تطبيق المصادقة وأدخل الرمز المكوّن من 6 أرقام.';

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
  String get appLockEnableNotSaved =>
      'تعذّر على كرار حفظ قفل التطبيق على هذا الجهاز، لذا ما زال معطّلًا. لم يتغيّر شيء. حاول مرة أخرى.';

  @override
  String get appLockDisableNotSaved =>
      'تعذّر على كرار حفظ هذا التغيير على هذا الجهاز، لذا ما زال قفل التطبيق مفعّلًا. حاول مرة أخرى، أو استخدم كلمة المرور في شاشة القفل إذا تعذّر عليك فتحه.';

  @override
  String get securityStateUnavailableTitle =>
      'لا يستطيع كرار التحقق من إعدادات الأمان';

  @override
  String get securityStateUnavailableMessage =>
      'لم يُبلّغ هذا الجهاز عمّا إذا كان قفل التطبيق مفعّلًا. لن يفتح كرار حسابك قبل أن يتأكد، لذا لا يُعرض شيء الآن. حاول مرة أخرى، وأعد تشغيل الجهاز إذا تكرّر ذلك.';

  @override
  String get securityRecoveryBlockedTitle => 'تعذّرت إزالة تلك الجلسة';

  @override
  String get securityRecoveryBlockedMessage =>
      'تعذّر على كرار حذف الجلسة المخزّنة على هذا الجهاز، وتعذّر عليه تسجيل أنك تخليت عنها. تسجيل الدخول الآن لن يجعلها آمنة، لذا ينتظر كرار بدلًا من ذلك. حاول مرة أخرى. وإذا استمر الفشل، سجّل الخروج من هذا الجهاز عبر جهاز آخر.';

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
  String get failureLocalSecurityState =>
      'تعذّر على هذا الجهاز تأكيد إعدادات الأمان، لذا توقّف كرار بدلًا من المتابعة دونها. حاول مرة أخرى.';

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

  @override
  String get financialHomeTabHome => 'الرئيسية';

  @override
  String get financialHomeTabAccounts => 'الحسابات';

  @override
  String get financialUnavailableTitle => 'غير متاح';

  @override
  String get financialUnavailableDescription =>
      'هذا الجزء من كرار غير متاح لحسابك.';

  @override
  String get financialUnavailableAction => 'العودة';

  @override
  String get accountsScreenTitle => 'الحسابات والمحافظ';

  @override
  String get accountsEmptyTitle => 'لا توجد حسابات بعد';

  @override
  String get accountsEmptyDescription => 'أضف حسابًا يدويًا لتبدأ في متابعته.';

  @override
  String get accountsFilteredEmptyTitle => 'لا يوجد ما يطابق عوامل التصفية هذه';

  @override
  String get accountsFilteredEmptyDescription =>
      'أزل عوامل التصفية لعرض كل ما لديك.';

  @override
  String get accountsUnavailableTitle => 'تعذّر تحميل الحسابات';

  @override
  String get accountsUnavailableDescription =>
      'تعذّر على كرار قراءة حساباتك في الوقت الحالي.';

  @override
  String get accountsGroupByLabel => 'التجميع حسب';

  @override
  String get accountsFiltersLabel => 'عوامل التصفية';

  @override
  String get accountsFiltersClear => 'مسح عوامل التصفية';

  @override
  String financialFiltersActiveCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عامل تصفية',
      many: '$count عامل تصفية',
      few: '$count عوامل تصفية',
      two: 'عاملا تصفية',
      one: 'عامل تصفية واحد',
      zero: 'لا توجد عوامل تصفية',
    );
    return '$_temp0';
  }

  @override
  String get accountsAddManualAction => 'إضافة حساب يدويًا';

  @override
  String get accountsPerCurrencyNoticeTitle => 'معروضة لكل عملة على حدة';

  @override
  String get accountsPerCurrencyNoticeDescription =>
      'يفصل كرار بين كل عملة وأخرى. فهو لا يحوّل بين العملات ولا يجمعها معًا.';

  @override
  String get accountsFilterAllOption => 'الكل';

  @override
  String get groupByIssuer => 'الجهة المُصدِرة';

  @override
  String get groupByIssuerKind => 'نوع الجهة المُصدِرة';

  @override
  String get groupByAccountType => 'نوع الحساب';

  @override
  String get groupByWalletKind => 'نوع المحفظة';

  @override
  String get groupByNature => 'الطبيعة';

  @override
  String get groupByCurrency => 'العملة';

  @override
  String get groupByLifecycle => 'الحالة';

  @override
  String get groupByOrigin => 'المصدر';

  @override
  String get accountTypeCurrent => 'حساب جارٍ';

  @override
  String get accountTypeSavings => 'حساب توفير';

  @override
  String get accountTypeCreditCard => 'حساب بطاقة ائتمان';

  @override
  String get accountTypeCash => 'نقد';

  @override
  String get accountTypeWallet => 'محفظة';

  @override
  String get accountTypeOther => 'أخرى';

  @override
  String get accountTypeUnrecognised => 'نوع غير معروف';

  @override
  String get walletKindMobileMoney => 'أموال عبر الهاتف';

  @override
  String get walletKindEMoney => 'نقود إلكترونية';

  @override
  String get walletKindPrepaid => 'مدفوعة مسبقًا';

  @override
  String get walletKindPayroll => 'رواتب';

  @override
  String get walletKindSuperApp => 'تطبيق شامل';

  @override
  String get walletKindOther => 'محفظة أخرى';

  @override
  String get walletKindUnrecognised => 'نوع محفظة غير معروف';

  @override
  String get walletKindNone => 'ليست محفظة';

  @override
  String get accountNatureAsset => 'أصل';

  @override
  String get accountNatureLiability => 'التزام';

  @override
  String get accountNatureNotStated => 'غير محدَّدة';

  @override
  String get accountNatureUnrecognised => 'طبيعة غير معروفة';

  @override
  String get accountLifecycleActive => 'نشط';

  @override
  String get accountLifecycleArchived => 'مؤرشف';

  @override
  String get accountLifecycleClosed => 'مغلق';

  @override
  String get accountLifecycleUnrecognised => 'حالة غير معروفة';

  @override
  String get issuerKindBank => 'بنك';

  @override
  String get issuerKindEMoneyIssuer => 'مُصدِر نقود إلكترونية';

  @override
  String get issuerKindMobileMoneyOperator => 'مشغّل أموال عبر الهاتف';

  @override
  String get issuerKindTelcoFinancialServices => 'خدمات مالية من مشغّل اتصالات';

  @override
  String get issuerKindPaymentInstitution => 'مؤسسة دفع';

  @override
  String get issuerKindFintechWallet => 'محفظة تقنية مالية';

  @override
  String get issuerKindCardIssuer => 'مُصدِر بطاقات';

  @override
  String get issuerKindExchangeHouse => 'شركة صرافة';

  @override
  String get issuerKindOther => 'مؤسسة أخرى';

  @override
  String get issuerKindUnrecognised => 'نوع جهة غير معروف';

  @override
  String get issuerKindNone => 'لم تُذكر جهة مُصدِرة';

  @override
  String get issuerNotStated => 'لم تُذكر جهة مُصدِرة';

  @override
  String get issuerUnlistedHint => 'أدخلتها بنفسك';

  @override
  String get issuerRetiredHint => 'لم تعد متاحة للاختيار';

  @override
  String get accountMaskLabel => 'الرقم المرجعي';

  @override
  String get accountMaskAbsent => 'غير متوفر';

  @override
  String get accountMaskWithheld => 'محجوب';

  @override
  String get accountMaskNeverFullNumber =>
      'لا يعرض كرار أبدًا رقم حساب أو بطاقة أو آيبان كاملًا.';

  @override
  String get balancesSectionTitle => 'الأرصدة كما أبلغت بها المصادر';

  @override
  String get balancesEmptyTitle => 'لم يُبلَّغ عن أي رصيد';

  @override
  String get balancesEmptyDescription =>
      'لم يُبلغ أي مصدر عن رقم لهذا الحساب حتى الآن.';

  @override
  String get balancesNoTotalNotice =>
      'كل رقم هو ما أبلغ به مصدر واحد، للنوع الذي أبلغ عنه. ولا يجمع كرار هذه الأرقام معًا.';

  @override
  String get balanceKindBooked => 'المُقيَّد';

  @override
  String get balanceKindAvailable => 'المتاح';

  @override
  String get balanceKindCurrent => 'الحالي';

  @override
  String get balanceKindOutstanding => 'المستحق';

  @override
  String get balanceKindCreditLimit => 'حد الائتمان';

  @override
  String get balanceKindOtherSourceReported => 'نوع آخر أبلغ عنه المصدر';

  @override
  String get balanceKindUnrecognised => 'نوع غير معروف';

  @override
  String balanceAsOfLabel(String when) {
    return 'صحيح حتى $when';
  }

  @override
  String balanceCapturedLabel(String when) {
    return 'سجّله كرار في $when';
  }

  @override
  String get balanceOlderReportsLabel => 'بلاغات أقدم';

  @override
  String get dataOriginManuallyAdded => 'أُضيف يدويًا';

  @override
  String get dataOriginImportedFromStatement => 'مستورَد من كشف حساب';

  @override
  String get dataOriginFileImportOnly => 'استيراد ملفات فقط';

  @override
  String get dataOriginNotStated => 'المصدر غير محدَّد';

  @override
  String get sourceSectionTitle => 'من أين تأتي هذه البيانات';

  @override
  String get sourceLastSynchronisedLabel => 'آخر مزامنة';

  @override
  String get sourceNeverImportedTitle => 'لم يكتمل أي استيراد بعد';

  @override
  String get sourceNoneObservedTitle => 'لا يوجد مصدر يغذّي هذا الحساب';

  @override
  String get sourceNoLiveLinkNotice =>
      'لا يملك كرار أي ارتباط مباشر بأي بنك أو محفظة أو مُصدِر بطاقات. ولا تصل البيانات إلا عندما تُدخلها بنفسك أو تستورد ملفًا.';

  @override
  String get sourceStatusPendingConfirmation => 'بانتظار تأكيدك';

  @override
  String get sourceStatusAttached => 'مرتبط بهذا الحساب';

  @override
  String get sourceStatusDeclined => 'مرفوض';

  @override
  String get sourceStatusDormant => 'خامل';

  @override
  String get sourceStatusUnrecognised => 'حالة غير معروفة';

  @override
  String get sourceAuthorityAuthoritative => 'مرجعي';

  @override
  String get sourceAuthoritySupplemental => 'مكمّل';

  @override
  String get sourceAuthorityUnverified => 'غير متحقَّق منه';

  @override
  String get sourceAuthorityUnrecognised => 'الأهمية غير معروفة';

  @override
  String get sourceCoverageLabel => 'الأيام المشمولة';

  @override
  String sourceCoverageRange(String end, String start) {
    return 'من $start إلى $end';
  }

  @override
  String get sourceCoverageNone => 'لم يُقدَّم شيء بعد';

  @override
  String get sourceBalanceObservationLabel => 'الأرصدة المرصودة';

  @override
  String get sourcePendingObservationLabel => 'المعاملات المعلّقة المرصودة';

  @override
  String get sourceObservationObserved => 'مرصود';

  @override
  String get sourceObservationNotObserved => 'غير مرصود';

  @override
  String get sourceObservationNotProvided => 'لم يُقدَّم إطلاقًا';

  @override
  String get sourceObservationUnrecognised => 'غير معروف';

  @override
  String get instrumentsSectionTitle => 'ما الذي ينفق من هذا الحساب';

  @override
  String get instrumentsEmptyTitle => 'لا توجد بطاقات أو هويات دفع';

  @override
  String get instrumentsNoBalanceNotice =>
      'لا تحمل البطاقة رصيدًا خاصًا بها. الرصيد يخص الحساب أعلاه.';

  @override
  String instrumentsCountLabel(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count أداة',
      many: '$count أداة',
      few: '$count أدوات',
      two: 'أداتان',
      one: 'أداة واحدة',
      zero: 'لا توجد أدوات',
    );
    return '$_temp0';
  }

  @override
  String get instrumentTypePhysicalCard => 'بطاقة فعلية';

  @override
  String get instrumentTypeVirtualCard => 'بطاقة افتراضية';

  @override
  String get instrumentTypePrepaidCard => 'بطاقة مدفوعة مسبقًا';

  @override
  String get instrumentTypeTokenizedCard => 'بطاقة مرمَّزة';

  @override
  String get instrumentTypeQrPaymentIdentity => 'هوية دفع بالرمز';

  @override
  String get instrumentTypeOther => 'أداة أخرى';

  @override
  String get instrumentTypeUnrecognised => 'نوع غير معروف';

  @override
  String get instrumentStatusActive => 'نشطة';

  @override
  String get instrumentStatusSuspended => 'موقوفة';

  @override
  String get instrumentStatusExpired => 'منتهية';

  @override
  String get instrumentStatusCancelled => 'ملغاة';

  @override
  String get instrumentStatusUnrecognised => 'حالة غير معروفة';

  @override
  String get instrumentSpendable => 'يمكن استخدامها للإنفاق';

  @override
  String get instrumentNotSpendable => 'لا يمكن استخدامها للإنفاق';

  @override
  String get accountDetailTitle => 'الحساب';

  @override
  String get accountDetailIdentitySection => 'التفاصيل';

  @override
  String get accountDetailEditAction => 'تعديل الحساب';

  @override
  String get accountDetailRecentTransactions => 'أحدث المعاملات';

  @override
  String get accountDetailSeeAllTransactions => 'عرض كل المعاملات';

  @override
  String get accountDetailUnavailableTitle => 'تعذّر تحميل الحساب';

  @override
  String get accountDetailUnavailableDescription =>
      'تعذّر على كرار قراءة هذا الحساب في الوقت الحالي.';

  @override
  String get accountCurrencyLabel => 'العملة';

  @override
  String get accountTypeFieldLabel => 'النوع';

  @override
  String get accountWalletKindFieldLabel => 'نوع المحفظة';

  @override
  String get accountNatureFieldLabel => 'الطبيعة';

  @override
  String get accountLifecycleFieldLabel => 'الحالة';

  @override
  String get accountIssuerFieldLabel => 'الجهة المُصدِرة';

  @override
  String get accountSourceFieldLabel => 'المصدر';

  @override
  String get accountCreatedLabel => 'أُضيف';

  @override
  String get accountUpdatedLabel => 'آخر تعديل';

  @override
  String get accountFormCreateTitle => 'إضافة حساب';

  @override
  String get accountFormEditTitle => 'تعديل الحساب';

  @override
  String get accountFormDisplayNameLabel => 'الاسم';

  @override
  String get accountFormDisplayNameHelper => 'أنت وحدك من يرى هذا الاسم.';

  @override
  String get accountFormTypeLabel => 'النوع';

  @override
  String get accountFormWalletKindLabel => 'نوع المحفظة';

  @override
  String get accountFormWalletKindHelper => 'المحفظة وحدها لها نوع محفظة.';

  @override
  String get accountFormNatureLabel => 'الطبيعة';

  @override
  String get accountFormCurrencyLabel => 'العملة';

  @override
  String get accountFormCurrencyHelper => 'رمز من ثلاثة أحرف، مثل QAR.';

  @override
  String get accountFormMaskLabel => 'الرقم المرجعي';

  @override
  String get accountFormMaskHelper =>
      'نهاية قصيرة مقنّعة فقط. ولا تُدخل أبدًا رقم حساب أو بطاقة أو آيبان كاملًا.';

  @override
  String get accountFormIssuerLabel => 'الجهة المُصدِرة';

  @override
  String get accountFormIssuerCatalogueOption => 'اختيار جهة مُراجَعة';

  @override
  String get accountFormIssuerUnlistedOption => 'إدخال جهة بنفسك';

  @override
  String get accountFormIssuerNoneOption => 'بدون جهة مُصدِرة';

  @override
  String get accountFormIssuerUnlistedLabel => 'اسم الجهة المُصدِرة';

  @override
  String get accountFormIssuersUnavailable =>
      'تعذّر تحميل قائمة الجهات المُراجَعة. ما زال بإمكانك إدخال جهة بنفسك.';

  @override
  String get accountFormValidationSummaryTitle => 'راجع هذه الحقول';

  @override
  String get accountFormErrorDisplayName => 'أدخل اسمًا لهذا الحساب.';

  @override
  String get accountFormErrorCurrency => 'أدخل رمز عملة من ثلاثة أحرف.';

  @override
  String get accountFormErrorWalletKindRequired => 'اختر نوع المحفظة.';

  @override
  String get accountFormErrorWalletKindNotAllowed =>
      'المحفظة وحدها لها نوع محفظة.';

  @override
  String get accountFormErrorIssuerNamedTwice =>
      'اختر جهة مُراجَعة أو أدخل واحدة، وليس الاثنين معًا.';

  @override
  String get accountFormSaved => 'تم الحفظ.';

  @override
  String get accountFormVersionConflict =>
      'تغيّر هذا الحساب أثناء تعديلك له. أعد تحميله ثم حاول مجددًا.';

  @override
  String get accountFormNoChange => 'لم يتغيّر شيء بعد.';

  @override
  String get accountFormRejected => 'تعذّر على كرار حفظ هذا الحساب.';

  @override
  String get accountFormCurrencyImmutable =>
      'لا يمكن تغيير العملة بعد أن يحتوي الحساب على سجلات.';

  @override
  String get transactionsScreenTitle => 'المعاملات';

  @override
  String get transactionsEmptyTitle => 'لا توجد معاملات بعد';

  @override
  String get transactionsEmptyDescription => 'سجّل معاملة لتبدأ في المتابعة.';

  @override
  String get transactionsFilteredEmptyTitle =>
      'لا يوجد ما يطابق عوامل التصفية هذه';

  @override
  String get transactionsFilteredEmptyDescription =>
      'أزل عوامل التصفية لعرض كل ما هو مسجَّل.';

  @override
  String get transactionsUnavailableTitle => 'تعذّر تحميل المعاملات';

  @override
  String get transactionsUnavailableDescription =>
      'تعذّر على كرار قراءة معاملاتك في الوقت الحالي.';

  @override
  String get transactionsLoadMoreAction => 'تحميل المزيد';

  @override
  String get transactionsAddManualAction => 'تسجيل معاملة';

  @override
  String get transactionDetailTitle => 'المعاملة';

  @override
  String get transactionDetailUnavailableTitle => 'تعذّر تحميل المعاملة';

  @override
  String get transactionDetailUnavailableDescription =>
      'تعذّر على كرار قراءة هذه المعاملة في الوقت الحالي.';

  @override
  String get transactionAmountLabel => 'المبلغ';

  @override
  String get transactionOriginalAmountLabel => 'كما ذكره المصدر';

  @override
  String get transactionOriginalAmountNotice =>
      'استخدم المصدر عملة مختلفة. يعرض كرار كليهما ولا يحوّل أيًّا منهما.';

  @override
  String get transactionBookedOnLabel => 'قُيِّدت في';

  @override
  String get transactionValueDateLabel => 'تاريخ القيمة';

  @override
  String get transactionEventOccurredLabel => 'الطابع الزمني للمصدر';

  @override
  String get transactionSourceTimezoneLabel => 'المنطقة الزمنية للمصدر';

  @override
  String get transactionDescriptionLabel => 'الوصف';

  @override
  String get transactionMerchantLabel => 'التاجر';

  @override
  String get transactionNoteLabel => 'ملاحظة';

  @override
  String get transactionAccountLabel => 'الحساب';

  @override
  String get transactionStatusPosted => 'مُرحَّلة';

  @override
  String get transactionStatusVoided => 'ملغاة';

  @override
  String get transactionStatusUnrecognised => 'حالة غير معروفة';

  @override
  String get directionMoneyIn => 'مبلغ وارد';

  @override
  String get directionMoneyOut => 'مبلغ صادر';

  @override
  String get directionUnrecognised => 'اتجاه غير معروف';

  @override
  String get transactionCategoryLabel => 'الفئة';

  @override
  String get transactionCategoryNone => 'بدون فئة';

  @override
  String get transactionCategoryChangeAction => 'اختيار فئة';

  @override
  String get transactionCategoryByUser => 'اخترتها بنفسك';

  @override
  String get transactionCategoryByRule => 'حدّدتها قاعدة';

  @override
  String get transactionCategoryBySourceUnrecognised => 'مصدر غير معروف';

  @override
  String get transactionCategoryRuleVersionLabel => 'إصدار القاعدة';

  @override
  String get transactionRevisionsTitle => 'السجل';

  @override
  String transactionRevisionNumber(int number) {
    return 'المراجعة $number';
  }

  @override
  String get transactionRevisionSourceImport => 'من كشف حساب مستورَد';

  @override
  String get transactionRevisionManualEntry => 'أُدخلت يدويًا';

  @override
  String get transactionRevisionUserInput => 'صحّحتها بنفسك';

  @override
  String get transactionRevisionUnrecognised => 'أصل غير معروف';

  @override
  String transactionRevisionChangedFields(String fields) {
    return 'المتغيّر: $fields';
  }

  @override
  String get transactionRevisionNoChangedFields => 'كما سُجِّلت في الأصل';

  @override
  String get transactionDivergesFromSource =>
      'لقد صحّحت قيمة قدّمها المصدر. وتبقى قيم المصدر نفسها محفوظة في السجل.';

  @override
  String get revisableFieldAmount => 'المبلغ';

  @override
  String get revisableFieldBookingDate => 'تاريخ القيد';

  @override
  String get revisableFieldValueDate => 'تاريخ القيمة';

  @override
  String get revisableFieldMerchant => 'التاجر';

  @override
  String get revisableFieldDescription => 'الوصف';

  @override
  String get revisableFieldNote => 'الملاحظة';

  @override
  String get revisableFieldStatus => 'الحالة';

  @override
  String get revisableFieldUnrecognised => 'حقل غير معروف';

  @override
  String get transactionProvenanceTitle => 'مصدر البيانات';

  @override
  String get transactionProvenanceUnavailable => 'تعذّر تحميل مصدر البيانات';

  @override
  String get provenanceImportedFromStatement => 'جاءت من ملف كشف حساب';

  @override
  String get provenanceNotImportedFromStatement => 'لم تأتِ من ملف كشف حساب';

  @override
  String get provenanceSourceDirectionLabel => 'الاتجاه كما ذكره المصدر';

  @override
  String get sourceDirectionDebit => 'مدين';

  @override
  String get sourceDirectionCredit => 'دائن';

  @override
  String get sourceDirectionNotStated => 'غير مذكور';

  @override
  String get sourceDirectionUnrecognised => 'غير معروف';

  @override
  String get provenanceDirectionMappingLabel => 'كيف تحدّد الاتجاه';

  @override
  String get directionMappingManualEntry => 'أُدخل يدويًا';

  @override
  String get directionMappingSourceDirectionWord => 'من صياغة المصدر نفسه';

  @override
  String get directionMappingSourceSignedAmount => 'من إشارة المصدر';

  @override
  String get directionMappingSourceSignedAmountInverted =>
      'من إشارة المصدر بعد عكسها';

  @override
  String get directionMappingUnrecognised => 'غير معروف';

  @override
  String get provenanceVersionsLabel => 'إصدارات المعالجة';

  @override
  String get provenanceParserVersionLabel => 'المحلّل';

  @override
  String get provenanceMappingVersionLabel => 'التعيين';

  @override
  String get provenanceNormalizationVersionLabel => 'التوحيد';

  @override
  String get provenanceFingerprintVersionLabel => 'فحص التكرار';

  @override
  String get transactionCorrectAction => 'تصحيح هذه المعاملة';

  @override
  String get transactionCorrectTitle => 'تصحيح المعاملة';

  @override
  String get transactionCorrectNotice =>
      'يُضاف التصحيح إلى السجل. ولا يُستبدل أي شيء.';

  @override
  String get transactionCorrectionSaved => 'تم تسجيل التصحيح.';

  @override
  String get transactionVersionConflict =>
      'تغيّرت هذه المعاملة أثناء تعديلك لها. أعد تحميلها ثم حاول مجددًا.';

  @override
  String get transactionNoChange => 'لم يتغيّر شيء بعد.';

  @override
  String get transactionRejected => 'تعذّر على كرار حفظ هذه المعاملة.';

  @override
  String get transactionDeleteAction => 'حذف المعاملة';

  @override
  String get transactionDeleteConfirmTitle => 'حذف هذه المعاملة؟';

  @override
  String get transactionDeleteConfirmMessage =>
      'ستُحذف المعاملة وأي مطابقات تحويل تشير إليها.';

  @override
  String get transactionDeleted => 'تم الحذف.';

  @override
  String get transactionDeletePartial =>
      'اكتمل جزء فقط من هذا الحذف. وقد تبقى بعض السجلات المرتبطة.';

  @override
  String get transactionFormCreateTitle => 'تسجيل معاملة';

  @override
  String get transactionFormAccountLabel => 'الحساب';

  @override
  String get transactionFormMagnitudeLabel => 'المبلغ';

  @override
  String get transactionFormMagnitudeHelper =>
      'مبلغ موجب بعملة الحساب. واختر أدناه إن كان واردًا أم صادرًا.';

  @override
  String get transactionFormDirectionLabel => 'الاتجاه';

  @override
  String get transactionFormBookingDateLabel => 'تاريخ القيد';

  @override
  String get transactionFormValueDateLabel => 'تاريخ القيمة';

  @override
  String get transactionFormDayHelper => 'يوم تقويمي بالصيغة YYYY-MM-DD.';

  @override
  String get transactionFormDescriptionLabel => 'الوصف';

  @override
  String get transactionFormMerchantLabel => 'التاجر';

  @override
  String get transactionFormNoteLabel => 'ملاحظة';

  @override
  String get transactionFormOptionalHelper => 'اختياري.';

  @override
  String get transactionFormValidationSummaryTitle => 'راجع هذه الحقول';

  @override
  String get transactionFormErrorAccount => 'اختر حسابًا.';

  @override
  String get transactionFormErrorDescription => 'أدخل وصفًا.';

  @override
  String get transactionFormErrorDirection =>
      'اختر إن كان المبلغ واردًا أم صادرًا.';

  @override
  String get transactionFormErrorMagnitude => 'أدخل مبلغًا موجبًا.';

  @override
  String get transactionFormErrorBookingDate =>
      'أدخل يوم القيد بالصيغة YYYY-MM-DD.';

  @override
  String get transactionFormErrorValueDate =>
      'أدخل تاريخ القيمة بالصيغة YYYY-MM-DD أو اتركه فارغًا.';

  @override
  String get transactionFormSaved => 'تم التسجيل.';

  @override
  String get transactionFormNoAccounts => 'أضف حسابًا قبل تسجيل معاملة.';

  @override
  String get transactionFiltersTitle => 'عوامل التصفية';

  @override
  String get transactionFilterDirectionLabel => 'الاتجاه';

  @override
  String get transactionFilterStatusLabel => 'الحالة';

  @override
  String get transactionFilterCurrencyLabel => 'العملة';

  @override
  String get transactionFilterSourceLabel => 'المصدر';

  @override
  String get transactionFilterAccountLabel => 'الحساب';

  @override
  String get categoryPickerTitle => 'اختيار فئة';

  @override
  String get categorySearchLabel => 'البحث في الفئات';

  @override
  String get categoriesEmptyTitle => 'لا توجد فئات متاحة';

  @override
  String get categoriesEmptyDescription =>
      'لا يوفّر الفهرس المُراجَع أي خيار في الوقت الحالي.';

  @override
  String get categoriesUnavailableTitle => 'تعذّر تحميل الفئات';

  @override
  String get categoriesUnavailableDescription =>
      'تعذّر على كرار قراءة فهرس الفئات في الوقت الحالي.';

  @override
  String get categoryRetiredHint => 'لم تعد متاحة';

  @override
  String get categoryAssigned => 'تم حفظ الفئة.';

  @override
  String get categoryAssignmentWins => 'اختيارك الخاص قائم بالفعل.';

  @override
  String get categoryUnknown => 'هذه الفئة غير متاحة.';

  @override
  String get categoryCatalogueVersionLabel => 'إصدار الفهرس';

  @override
  String a11yFinancialAmount(String amount, String direction) {
    return '$amount، $direction';
  }

  @override
  String a11yAccountSummary(String currency, String name, String type) {
    return '$name، $type، $currency';
  }

  @override
  String a11yBalanceSummary(String amount, String asOf, String kind) {
    return '$kind، $amount، $asOf';
  }

  @override
  String a11yInstrumentSummary(String label, String status, String type) {
    return '$label، $type، $status';
  }

  @override
  String get statementImportTitle => 'استيراد كشف حساب';

  @override
  String get statementImportStartTitle => 'اختر حساباً وملفاً';

  @override
  String get statementImportMappingTitle => 'طابق الأعمدة';

  @override
  String get statementImportReviewTitle => 'راجع قبل الاستيراد';

  @override
  String get statementImportRailExplanation =>
      'يستورد كرار كشوف الحساب التي ترفعها بنفسك. لا يتصل بمصرفك، ولا يطلب أبداً كلمة مرور مصرفية أو رمزاً سرياً أو رمزاً لمرة واحدة.';

  @override
  String get statementImportAccountLabel => 'الحساب الذي سيُستورد إليه';

  @override
  String get statementImportAccountHelper =>
      'تختار الحساب قبل قراءة الملف. لا شيء في الملف يمكنه تغيير وجهة صفوفه.';

  @override
  String get statementImportNoAccounts =>
      'تحتاج إلى حساب قبل أن تتمكن من استيراد كشف.';

  @override
  String get statementImportChooseFile => 'اختر ملف CSV';

  @override
  String get statementImportChooseFileSemantics =>
      'اختر ملف كشف حساب بصيغة CSV من جهازك';

  @override
  String statementImportFileRules(int megabytes) {
    final intl.NumberFormat megabytesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String megabytesString = megabytesNumberFormat.format(megabytes);

    return 'ملفات CSV فقط، حتى $megabytesString ميغابايت.';
  }

  @override
  String get statementImportFileChosen => 'الملف جاهز للرفع';

  @override
  String get statementImportActionUpload => 'ارفع وتابع';

  @override
  String get statementImportPickerUnavailableTitle =>
      'هذه النسخة لا تستطيع فتح منتقي الملفات';

  @override
  String get statementImportPickerUnavailableDetail =>
      'بقية الاستيراد جاهزة. عند إضافة اختيار الملفات سيطلب الملف الذي تختاره وحده، ولن يطلب الوصول إلى مساحة التخزين.';

  @override
  String get statementImportPickerUnreadable =>
      'تعذّرت قراءة هذا الملف من جهازك.';

  @override
  String get statementImportSourceEmpty => 'هذا الملف فارغ.';

  @override
  String statementImportSourceTooLarge(int megabytes) {
    final intl.NumberFormat megabytesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String megabytesString = megabytesNumberFormat.format(megabytes);

    return 'هذا الملف أكبر من $megabytesString ميغابايت التي يقبلها هذا الاستيراد.';
  }

  @override
  String get statementImportSampleInvalidEncoding =>
      'هذا الملف ليس نصاً صالحاً بترميز UTF-8. يرفضه كرار بدلاً من استبدال المحارف التالفة، لأن ذلك يغيّر ما كتبه مصرفك.';

  @override
  String get statementImportSampleMalformedQuoting =>
      'توجد قيمة بين علامتي اقتباس لم تُغلق في هذا الملف، لذا لا يمكن عدّ أعمدته بشكل موثوق.';

  @override
  String get statementImportSampleTooManyColumns =>
      'أحد السطور في هذا الملف يحتوي أعمدة أكثر مما يقبله هذا الاستيراد.';

  @override
  String get statementImportMappingIntro =>
      'أخبر كرار بما يحتويه كل عمود. لا شيء يُخمَّن، لأن التخمين الخاطئ يحرّك أموالاً.';

  @override
  String get statementImportHeaderRowLabel => 'الصف الأول هو صف عناوين';

  @override
  String get statementImportHeaderRowHelper =>
      'يُذكر ولا يُكتشف. صف العناوين الذي يُعامل كبيانات يصبح معاملة مرفوضة.';

  @override
  String statementImportColumnNumber(int number) {
    final intl.NumberFormat numberNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String numberString = numberNumberFormat.format(number);

    return 'العمود $numberString';
  }

  @override
  String get statementImportColumnNotMapped => 'غير مرتبط';

  @override
  String get statementImportPreviewCaption =>
      'الصفوف الأولى من ملفك، معروضة كنص عادي.';

  @override
  String get statementImportPreviewInertNote =>
      'تُعرض القيم كما وردت في ملفك تماماً. ولا يعاملها كرار أبداً كتعليمات.';

  @override
  String get statementImportFieldBookingDate => 'تاريخ القيد';

  @override
  String get statementImportFieldValueDate => 'تاريخ الاستحقاق';

  @override
  String get statementImportFieldEventOccurredAt => 'الوقت الدقيق';

  @override
  String get statementImportFieldSourceTimezone => 'المنطقة الزمنية';

  @override
  String get statementImportFieldAmount => 'المبلغ';

  @override
  String get statementImportFieldDebitAmount => 'مدين';

  @override
  String get statementImportFieldCreditAmount => 'دائن';

  @override
  String get statementImportFieldCurrency => 'العملة';

  @override
  String get statementImportFieldDescription => 'الوصف';

  @override
  String get statementImportFieldMerchant => 'التاجر';

  @override
  String get statementImportFieldSourceBalance => 'الرصيد';

  @override
  String get statementImportFieldSourceReference => 'المرجع';

  @override
  String get statementImportFieldInstrumentMask =>
      'آخر أرقام البطاقة أو الحساب';

  @override
  String get statementImportFieldAccountIdentifier => 'معرّف الحساب';

  @override
  String get statementImportFieldRow => 'الصف بأكمله';

  @override
  String get statementImportFieldUnrecognised => 'حقل لا تعرفه هذه النسخة';

  @override
  String get statementImportAccountIdentifierHelper =>
      'يُستخدم فقط لملاحظة أن الملف يغطي أكثر من حساب، كي يرفض الاستيراد بدلاً من خلطها.';

  @override
  String get statementImportAmountShapeLabel => 'كيف يُكتب المبلغ؟';

  @override
  String get statementImportAmountShapeSigned => 'عمود واحد بإشارة';

  @override
  String get statementImportAmountShapeDebitCredit =>
      'عمودان منفصلان للمدين والدائن';

  @override
  String get statementImportSignFrameLabel => 'من وجهة نظر مَن كُتبت الإشارات؟';

  @override
  String get statementImportSignFrameAccountHolder =>
      'وجهة نظري، فما أنفقه يظهر بالسالب';

  @override
  String get statementImportSignFrameBankLedger =>
      'دفتر المصرف، فالإيداع قيد دائن';

  @override
  String get statementImportSignFrameHelper =>
      'لا يوجد خيار افتراضي. قراءة الإشارات بالمقلوب تحوّل كل دفعة في الملف إلى دخل.';

  @override
  String get statementImportDateOrderLabel => 'كيف تُكتب التواريخ الملتبسة؟';

  @override
  String get statementImportDateOrderNotStated => 'غير محدد';

  @override
  String get statementImportDateOrderIso => 'السنة أولاً، مثل 2026-04-03';

  @override
  String get statementImportDateOrderDayFirst =>
      'اليوم أولاً، فتعني 03/04 الثالث من أبريل';

  @override
  String get statementImportDateOrderMonthFirst =>
      'الشهر أولاً، فتعني 03/04 الرابع من مارس';

  @override
  String get statementImportDateOrderHelper =>
      'إذا لم تحدد واحداً، يرفض كرار الصفوف التي لا يستطيع قراءتها دون تخمين بدلاً من اختيار قراءة نيابةً عنك.';

  @override
  String get statementImportCurrencySourceLabel => 'من أين تأتي العملة؟';

  @override
  String get statementImportCurrencyFromColumn => 'عمود في الملف';

  @override
  String get statementImportCurrencyStatedForFile => 'الملف كله بعملة واحدة';

  @override
  String get statementImportStatedCurrencyLabel => 'عملة الملف';

  @override
  String get statementImportCurrencyHelper =>
      'أحدهما لا كلاهما. مصدران لعملة واحدة قد يتعارضان، وحلّ التعارض يعني الاختيار نيابةً عنك.';

  @override
  String get statementImportBalanceKindLabel => 'ماذا يحتوي عمود الرصيد؟';

  @override
  String get statementImportBalanceKindRunning => 'الرصيد الجاري';

  @override
  String get statementImportBalanceKindLedger => 'رصيد الدفتر';

  @override
  String get statementImportBalanceKindAvailable => 'الرصيد المتاح';

  @override
  String get statementImportBalanceKindClosing => 'الرصيد الختامي';

  @override
  String get statementImportStatedBalanceLabel => 'الرصيد الذي يذكره الكشف';

  @override
  String get statementImportStatedBalanceHelper =>
      'اختياري. يُستخدم فقط للتحقق من أن الصفوف متسقة. ولا يُحفظ أبداً كرصيد لحسابك.';

  @override
  String get statementImportStatedBalanceKindLabel => 'أي رصيد هو؟';

  @override
  String get statementImportStatedBalanceOpening => 'افتتاحي';

  @override
  String get statementImportStatedBalanceClosing => 'ختامي';

  @override
  String get statementImportStatedBalanceLedger => 'دفتري';

  @override
  String get statementImportStatedBalanceAvailable => 'متاح';

  @override
  String get statementImportStatedBalanceInvalid =>
      'أدخل الرصيد بالأرقام، وبعدد المنازل العشرية التي تستخدمها هذه العملة على الأكثر.';

  @override
  String get statementImportMappingColumnIndexInvalid =>
      'أحد الأعمدة المختارة غير موجود في هذا الملف.';

  @override
  String get statementImportMappingColumnUsedTwice =>
      'عمود واحد مرتبط بحقلين. لا يمكن للعمود أن يكون حقيقتين في آن واحد.';

  @override
  String get statementImportMappingCurrencyNotDetermined =>
      'لا يوجد عمود عملة ولا عملة محددة. عملة حسابك ليست جواباً، لأن ذلك يضع على كل صف عملة لم يخترها أحد.';

  @override
  String get statementImportMappingCurrencyDoublyDetermined =>
      'يوجد عمود عملة وعملة محددة معاً. وقد يتعارضان.';

  @override
  String get statementImportMappingBalanceKindNotStated =>
      'عمود الرصيد يحتاج إلى تحديد نوعه. الجاري والدفتري والمتاح ثلاثة أرقام مختلفة.';

  @override
  String get statementImportMappingTimezoneWithoutInstant =>
      'عمود المنطقة الزمنية يحتاج إلى عمود وقت دقيق ليفسّره.';

  @override
  String get statementImportActionParse => 'اقرأ الملف';

  @override
  String get statementImportCountsTitle => 'ما احتواه الملف';

  @override
  String get statementImportCountRows => 'الصفوف';

  @override
  String get statementImportCountValid => 'جاهزة للاستيراد';

  @override
  String get statementImportCountInvalid => 'مرفوضة';

  @override
  String get statementImportCountExactDuplicates => 'مستوردة سابقاً';

  @override
  String get statementImportCountProbableDuplicates => 'تكرارات محتملة';

  @override
  String get statementImportProbableDuplicatesNote =>
      'لا يبحث كرار عن التكرارات المحتملة، لذا تبقى هذه القيمة صفراً دائماً.';

  @override
  String get statementImportReconciliationTitle => 'هل الكشف متسق؟';

  @override
  String get statementImportReconciliationMatched =>
      'الصفوف تطابق الرصيد الذي يذكره الكشف.';

  @override
  String get statementImportReconciliationMismatched =>
      'الصفوف لا تطابق الرصيد الذي يذكره الكشف.';

  @override
  String get statementImportReconciliationNotAvailable =>
      'لم يذكر الكشف رصيداً، لذا لم تتم أي مقارنة.';

  @override
  String get statementImportReconciliationUnrecognised =>
      'لا تعرف هذه النسخة نتيجة المطابقة.';

  @override
  String get statementImportReconciliationBlocksCommit =>
      'الاستيراد متوقف ما دام هناك اختلاف. استيراد كشف غير متسق يكتب سجلات لا يمكن الوثوق بها.';

  @override
  String get statementImportRowIssuesTitle => 'الصفوف المرفوضة';

  @override
  String get statementImportRowIssuesNone => 'لم يُرفض أي صف.';

  @override
  String statementImportRowNumber(int number) {
    final intl.NumberFormat numberNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String numberString = numberNumberFormat.format(number);

    return 'الصف $numberString';
  }

  @override
  String statementImportIssuesTruncated(int shown, int total) {
    final intl.NumberFormat shownNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String shownString = shownNumberFormat.format(shown);
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    return 'يُعرض $shownString من $totalString صفاً مرفوضاً.';
  }

  @override
  String get statementImportNoValuesShown =>
      'لا يعرض كرار هنا أي قيم من ملفك. افتح ملفك عند أرقام الصفوف هذه لرؤيتها.';

  @override
  String get statementImportRemedyStateAConvention =>
      'حدّد العُرف ثم اقرأ الملف من جديد.';

  @override
  String get statementImportRemedyCorrectTheMapping =>
      'صحّح أي عمود يحتوي ماذا.';

  @override
  String get statementImportRemedyCorrectTheFile =>
      'صدّر الكشف من مصرفك مرة أخرى.';

  @override
  String get statementImportRemedyRespectABound =>
      'هذا السطر يتجاوز حداً يفرضه هذا الاستيراد.';

  @override
  String get statementImportRemedyUnknown =>
      'لا تعرف هذه النسخة ما تقترحه هنا.';

  @override
  String get statementImportReasonRequiredFieldMissing =>
      'حقل مطلوب كان فارغاً.';

  @override
  String get statementImportReasonUnreadableAmount =>
      'المبلغ ليس رقماً يستطيع كرار قراءته.';

  @override
  String get statementImportReasonAmbiguousDecimalSeparator =>
      'يمكن قراءة الفاصل العشري بطريقتين، ولم تُحدَّد أي منهما.';

  @override
  String get statementImportReasonAmbiguousDateOrder =>
      'يمكن قراءة التاريخ بطريقتين، ولم تُحدَّد أي منهما.';

  @override
  String get statementImportReasonUnreadableDate =>
      'التاريخ ليس بصيغة يقبلها كرار.';

  @override
  String get statementImportReasonUnreadableInstant =>
      'الوقت الدقيق ليس وقتاً يستطيع كرار قراءته.';

  @override
  String get statementImportReasonUnknownTimezone =>
      'المنطقة الزمنية ليست من المناطق التي تعرفها هذه المنصة.';

  @override
  String get statementImportReasonUnknownCurrency =>
      'العملة ليست من العملات التي تدعمها هذه المنصة.';

  @override
  String get statementImportReasonCurrencyMismatch =>
      'عملة هذا الصف ليست عملة الحساب، ولا شيء هنا يحوّل بينهما.';

  @override
  String get statementImportReasonAmbiguousDirection =>
      'لم يستطع كرار تحديد ما إذا كان هذا الصف دخلاً أم إنفاقاً.';

  @override
  String get statementImportReasonDebitAndCreditBothPresent =>
      'عمودا المدين والدائن حملا قيمة معاً.';

  @override
  String get statementImportReasonDebitAndCreditBothAbsent =>
      'عمودا المدين والدائن كانا فارغين معاً.';

  @override
  String get statementImportReasonFieldTooLarge =>
      'أحد الحقول أكبر مما يقبله هذا الاستيراد.';

  @override
  String get statementImportReasonTooManyColumns =>
      'هذا الصف يحتوي أعمدة أكثر مما يقبله هذا الاستيراد.';

  @override
  String get statementImportReasonColumnCountMismatch =>
      'عدد أعمدة هذا الصف يختلف عن صف العناوين.';

  @override
  String get statementImportReasonInvalidEncoding =>
      'هذا الصف ليس نصاً صالحاً بترميز UTF-8.';

  @override
  String get statementImportReasonMalformedQuoting =>
      'قيمة بين علامتي اقتباس في هذا الصف لم تُغلق.';

  @override
  String get statementImportReasonAmountExceedsRange =>
      'المبلغ أكبر من أن يُحفظ بدقة.';

  @override
  String get statementImportReasonDecimalPlacesExceedCurrency =>
      'المبلغ يحتوي منازل عشرية أكثر مما تستخدمه عملته.';

  @override
  String get statementImportReasonUnrecognised =>
      'لا تعرف هذه النسخة سبب رفض هذا الصف.';

  @override
  String get statementImportRefusalSourceTooLarge =>
      'الملف أكبر مما يقبله هذا الاستيراد.';

  @override
  String get statementImportRefusalTooManyRows =>
      'الملف يحتوي صفوفاً أكثر مما يقبله هذا الاستيراد.';

  @override
  String get statementImportRefusalTooManyColumns =>
      'الملف يحتوي أعمدة أكثر مما يقبله هذا الاستيراد.';

  @override
  String get statementImportRefusalFieldTooLarge =>
      'أحد الحقول في الملف أكبر مما يقبله هذا الاستيراد.';

  @override
  String get statementImportRefusalBufferedRowsExceeded =>
      'احتاج الملف إلى الاحتفاظ بصفوف أكثر مما يسمح به هذا الاستيراد دفعة واحدة.';

  @override
  String get statementImportRefusalBufferedBytesExceeded =>
      'احتاج الملف إلى ذاكرة أكبر مما يسمح به هذا الاستيراد دفعة واحدة.';

  @override
  String get statementImportRefusalDeadlineExceeded =>
      'استغرقت قراءة الملف وقتاً أطول مما يسمح به هذا الاستيراد.';

  @override
  String get statementImportRefusalCancelled => 'أُلغيت قراءة الملف.';

  @override
  String get statementImportRefusalTooManyErrors =>
      'رُفض عدد كبير من الصفوف بحيث تعذّر متابعة قراءة الملف.';

  @override
  String get statementImportRefusalUnsupportedMediaType =>
      'لم يُرسل الملف بصيغة CSV.';

  @override
  String get statementImportRefusalInvalidEncoding =>
      'الملف ليس نصاً صالحاً بترميز UTF-8.';

  @override
  String get statementImportRefusalBinaryContent => 'الملف ليس نصاً.';

  @override
  String get statementImportRefusalSpreadsheetContent =>
      'الملف جدول بيانات. صدّره بصيغة CSV وحاول مجدداً.';

  @override
  String get statementImportRefusalCompressedContent =>
      'الملف مضغوط. فُكّ ضغطه وارفع ملف CSV الذي بداخله.';

  @override
  String get statementImportRefusalMalformedQuoting =>
      'قيمة بين علامتي اقتباس في الملف لم تُغلق.';

  @override
  String get statementImportRefusalEmptySource => 'الملف فارغ.';

  @override
  String get statementImportRefusalNoHeaderRow =>
      'قُرئ الملف على أن له صف عناوين، وهو لا يحتوي عليه.';

  @override
  String get statementImportRefusalMappingAmbiguous =>
      'الأعمدة كما رُبطت تترك أموراً كثيرة غير محددة لقراءة الملف.';

  @override
  String get statementImportRefusalMultipleAccountsInSource =>
      'الملف يغطي أكثر من حساب. يرفضه كرار بدلاً من خلطها في الحساب الذي اخترته.';

  @override
  String get statementImportRefusalCurrencyMismatch =>
      'عملة الملف ليست عملة الحساب، ولا شيء هنا يحوّل بينهما.';

  @override
  String get statementImportRefusalReconciliationMismatch =>
      'الصفوف لا تتفق مع الرصيد الذي يذكره الكشف.';

  @override
  String get statementImportRefusalSourceAlreadyImported =>
      'سبق أن استوردت هذا الملف نفسه.';

  @override
  String get statementImportRefusalSourceIntegrityFailed =>
      'الملف المخزّن لم يعد مطابقاً لما رُفع، لذا لم تتم قراءته.';

  @override
  String get statementImportRefusalSourceUnreadable =>
      'تعذّرت قراءة الملف المخزّن.';

  @override
  String get statementImportRefusalUnrecognised =>
      'لا تعرف هذه النسخة سبب رفض هذا الاستيراد.';

  @override
  String get statementImportStateDraft => 'لم يبدأ';

  @override
  String get statementImportStateSourceStored => 'تم رفع الملف';

  @override
  String get statementImportStateParsing => 'جارٍ قراءة الملف';

  @override
  String get statementImportStateReviewRequired => 'بانتظار أن تقرر';

  @override
  String get statementImportStateCommitting => 'جارٍ الاستيراد';

  @override
  String get statementImportStateCommitted => 'تم الاستيراد';

  @override
  String get statementImportStateRejected => 'مُلغى';

  @override
  String get statementImportStateFailed => 'مرفوض';

  @override
  String get statementImportStateDuplicate => 'مستورد سابقاً';

  @override
  String get statementImportStateErased => 'مُمحى';

  @override
  String get statementImportStateUnrecognised => 'حالة لا تعرفها هذه النسخة';

  @override
  String get statementImportActionCommit => 'استورد هذه المعاملات';

  @override
  String get statementImportActionDiscard => 'ألغِ هذا الاستيراد';

  @override
  String get statementImportUploadingStatus => 'جارٍ رفع ملفك';

  @override
  String get statementImportParsingStatus => 'جارٍ قراءة ملفك';

  @override
  String get statementImportCommittingStatus => 'جارٍ استيراد معاملاتك';

  @override
  String get statementImportCommittedTitle => 'تم استيراد الكشف';

  @override
  String get statementImportCommittedCount => 'المعاملات المضافة';

  @override
  String get statementImportAlreadyCommitted =>
      'سبق استيراد هذا الكشف. لم يُضف شيء مرة ثانية.';

  @override
  String get statementImportDiscardedTitle => 'أُلغي الاستيراد';

  @override
  String get statementImportDiscardedDetail =>
      'الملف والصفوف التي هيّأها اختفت. المعاملات المستوردة منه سابقاً لا تتأثر.';

  @override
  String get statementImportUnavailableTitle => 'تعذّر عرض هذا الاستيراد';

  @override
  String get statementImportUnavailableDescription =>
      'تعذّر على كرار الوصول إلى المنصة. لم يتغير شيء.';

  @override
  String get statementImportRefusedTitle => 'رُفض هذا الملف';

  @override
  String get statementImportHeaderRowYes => 'نعم، الصف الأول عناوين';

  @override
  String get statementImportHeaderRowNo => 'لا، الصف الأول معاملة';
}
