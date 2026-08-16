// Localized copy for the profile surface.
//
// Every key here is named in this workstream's report for migration into
// `lib/l10n/arb`.
import 'package:flutter/widgets.dart';

/// Copy for the subject's own profile.
@immutable
final class ProfileStrings {
  const ProfileStrings({
    required this.screenTitle,
    required this.displayNameLabel,
    required this.displayNameHelper,
    required this.languageLabel,
    required this.accountStatusLabel,
    required this.residencyLabel,
    required this.organisationLabel,
    required this.accountReferenceLabel,
    required this.memberSinceLabel,
    required this.lastUpdatedLabel,
    required this.statusActive,
    required this.statusDisableRequested,
    required this.statusDeletionRequested,
    required this.statusDisabled,
    required this.statusUnrecognised,
    required this.statusDisableRequestedNote,
    required this.saveConfirmation,
    required this.saveFailedTitle,
    required this.saveFailedDescription,
    required this.noChangesTitle,
    required this.noChangesDescription,
    required this.unavailableTitle,
    required this.unavailableDescription,
    required this.notStated,
  });

  static const ProfileStrings _english = ProfileStrings(
    screenTitle: 'Profile',
    displayNameLabel: 'Display name',
    displayNameHelper: 'The name shown to people in your organisation.',
    languageLabel: 'Language recorded on your account',
    accountStatusLabel: 'Account status',
    residencyLabel: 'Residency reference',
    organisationLabel: 'Organisation',
    accountReferenceLabel: 'Account reference',
    memberSinceLabel: 'Account created',
    lastUpdatedLabel: 'Last updated',
    statusActive: 'Active',
    statusDisableRequested: 'Disable requested',
    statusDeletionRequested: 'Deletion requested',
    statusDisabled: 'Disabled',
    statusUnrecognised: 'Not recognised by this version',
    statusDisableRequestedNote:
        'Your request has been recorded. Nothing has been disabled or removed '
        'by it yet.',
    saveConfirmation: 'Your profile was updated.',
    saveFailedTitle: 'Your profile was not updated',
    saveFailedDescription: 'The platform did not accept the change. Nothing changed.',
    noChangesTitle: 'Nothing to save',
    noChangesDescription: 'Change a field before saving.',
    unavailableTitle: 'Your profile could not be loaded',
    unavailableDescription: 'The platform did not answer. Nothing has changed.',
    notStated: 'Not stated',
  );

  static const ProfileStrings _arabic = ProfileStrings(
    screenTitle: 'الملف الشخصي',
    displayNameLabel: 'الاسم المعروض',
    displayNameHelper: 'الاسم الذي يظهر للأشخاص في مؤسستك.',
    languageLabel: 'اللغة المسجّلة في حسابك',
    accountStatusLabel: 'حالة الحساب',
    residencyLabel: 'مرجع الإقامة',
    organisationLabel: 'المؤسسة',
    accountReferenceLabel: 'مرجع الحساب',
    memberSinceLabel: 'تاريخ إنشاء الحساب',
    lastUpdatedLabel: 'آخر تحديث',
    statusActive: 'نشط',
    statusDisableRequested: 'طُلب التعطيل',
    statusDeletionRequested: 'طُلب الحذف',
    statusDisabled: 'معطَّل',
    statusUnrecognised: 'غير معروفة في هذا الإصدار',
    statusDisableRequestedNote:
        'سُجّل طلبك. ولم يُعطَّل أو يُحذف أي شيء بموجبه حتى الآن.',
    saveConfirmation: 'تم تحديث ملفك الشخصي.',
    saveFailedTitle: 'لم يُحدَّث ملفك الشخصي',
    saveFailedDescription: 'لم تقبل المنصة التغيير. ولم يتغيّر شيء.',
    noChangesTitle: 'لا يوجد ما يُحفظ',
    noChangesDescription: 'غيّر حقلاً قبل الحفظ.',
    unavailableTitle: 'تعذّر تحميل ملفك الشخصي',
    unavailableDescription: 'لم تجب المنصة. ولم يتغيّر شيء.',
    notStated: 'غير محدد',
  );

  static ProfileStrings of(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'ar' ? _arabic : _english;

  final String screenTitle;
  final String displayNameLabel;
  final String displayNameHelper;
  final String languageLabel;
  final String accountStatusLabel;
  final String residencyLabel;
  final String organisationLabel;
  final String accountReferenceLabel;
  final String memberSinceLabel;
  final String lastUpdatedLabel;
  final String statusActive;
  final String statusDisableRequested;
  final String statusDeletionRequested;
  final String statusDisabled;
  final String statusUnrecognised;
  final String statusDisableRequestedNote;
  final String saveConfirmation;
  final String saveFailedTitle;
  final String saveFailedDescription;
  final String noChangesTitle;
  final String noChangesDescription;
  final String unavailableTitle;
  final String unavailableDescription;
  final String notStated;
}
