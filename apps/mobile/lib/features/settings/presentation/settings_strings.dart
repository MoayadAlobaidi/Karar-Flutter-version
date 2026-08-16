// Localized copy for settings.
//
// Language and appearance names come from the shared catalogue
// (`languageSettingTitle`, `languageSystemDefault`, `languageEnglish`,
// `languageArabic`), which already ships them. Only the keys this surface adds
// live here, and each is named in this workstream's report for migration into
// `lib/l10n/arb`.
import 'package:flutter/widgets.dart';

/// Copy for the settings surface.
@immutable
final class SettingsStrings {
  const SettingsStrings({
    required this.screenTitle,
    required this.appearanceTitle,
    required this.themeSystem,
    required this.themeLight,
    required this.themeDark,
    required this.yourAccountTitle,
    required this.profileRow,
    required this.organisationRow,
    required this.jurisdictionRow,
    required this.legalRow,
    required this.consentRow,
    required this.dangerTitle,
    required this.disableTitle,
    required this.disableDescription,
    required this.disableAction,
    required this.disableConfirmTitle,
    required this.disableConfirmMessage,
    required this.disableRecordedTitle,
    required this.disableRecordedMessage,
    required this.disableAuditWarning,
    required this.disableFailedTitle,
    required this.disableFailedMessage,
  });

  static const SettingsStrings _english = SettingsStrings(
    screenTitle: 'Settings',
    appearanceTitle: 'Appearance',
    themeSystem: 'Follow the device',
    themeLight: 'Light',
    themeDark: 'Dark',
    yourAccountTitle: 'Your account',
    profileRow: 'Profile',
    organisationRow: 'Organisation',
    jurisdictionRow: 'Jurisdiction',
    legalRow: 'Legal and operating entity',
    consentRow: 'Privacy and consent',
    dangerTitle: 'Closing your account',
    disableTitle: 'Request that your account is disabled',
    disableDescription:
        'This records your intention. Nothing is disabled or removed by the '
        'request itself, and you stay signed in.',
    disableAction: 'Request account disable',
    disableConfirmTitle: 'Record this request?',
    disableConfirmMessage:
        'Your request will be recorded against your account. Nothing is '
        'disabled or removed by recording it.',
    disableRecordedTitle: 'Your request was recorded',
    disableRecordedMessage:
        'The platform has your request. Nothing has been disabled or removed.',
    disableAuditWarning:
        'The request was recorded, but the platform could not write its audit '
        'entry. Quote this to support if you follow it up.',
    disableFailedTitle: 'Your request was not recorded',
    disableFailedMessage: 'The platform did not accept the request. Nothing changed.',
  );

  static const SettingsStrings _arabic = SettingsStrings(
    screenTitle: 'الإعدادات',
    appearanceTitle: 'المظهر',
    themeSystem: 'حسب الجهاز',
    themeLight: 'فاتح',
    themeDark: 'داكن',
    yourAccountTitle: 'حسابك',
    profileRow: 'الملف الشخصي',
    organisationRow: 'المؤسسة',
    jurisdictionRow: 'النطاق القضائي',
    legalRow: 'الشؤون القانونية والكيان المشغّل',
    consentRow: 'الخصوصية والموافقة',
    dangerTitle: 'إغلاق حسابك',
    disableTitle: 'طلب تعطيل حسابك',
    disableDescription:
        'يسجّل هذا نيتك. ولا يُعطَّل أو يُحذف شيء بموجب الطلب نفسه، وتبقى '
        'مسجّل الدخول.',
    disableAction: 'طلب تعطيل الحساب',
    disableConfirmTitle: 'هل تريد تسجيل هذا الطلب؟',
    disableConfirmMessage:
        'سيُسجَّل طلبك على حسابك. ولا يُعطَّل أو يُحذف شيء بتسجيله.',
    disableRecordedTitle: 'تم تسجيل طلبك',
    disableRecordedMessage: 'استلمت المنصة طلبك. ولم يُعطَّل أو يُحذف أي شيء.',
    disableAuditWarning:
        'سُجّل الطلب، لكن تعذّر على المنصة كتابة قيد التدقيق الخاص به. اذكر هذا '
        'للدعم إذا تابعت الأمر.',
    disableFailedTitle: 'لم يُسجَّل طلبك',
    disableFailedMessage: 'لم تقبل المنصة الطلب. ولم يتغيّر شيء.',
  );

  static SettingsStrings of(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'ar' ? _arabic : _english;

  final String screenTitle;
  final String appearanceTitle;
  final String themeSystem;
  final String themeLight;
  final String themeDark;
  final String yourAccountTitle;
  final String profileRow;
  final String organisationRow;
  final String jurisdictionRow;
  final String legalRow;
  final String consentRow;
  final String dangerTitle;
  final String disableTitle;
  final String disableDescription;
  final String disableAction;
  final String disableConfirmTitle;
  final String disableConfirmMessage;
  final String disableRecordedTitle;
  final String disableRecordedMessage;
  final String disableAuditWarning;
  final String disableFailedTitle;
  final String disableFailedMessage;
}
