// Localized copy for the platform surface.
//
// These are UI labels: section headings, state descriptions and control names.
// They are NOT legal wording, and nothing here describes a jurisdiction's
// rules, a licence, a regulatory approval, a controller or processor role, or
// a basis for processing. Legal wording is published by the platform and is
// rendered from the platform's answer alone.
//
// The catalogue is held here rather than in `lib/l10n` because the ARB source
// is owned by the design-system workstream; every key below is named in this
// workstream's report for migration into `app_en.arb` / `app_ar.arb`. The
// shape is deliberately the same as the generated catalogue's — a field per
// message, resolved once from the ambient locale — so the migration is a move
// rather than a rewrite.
import 'package:flutter/widgets.dart';

/// Copy for the authenticated platform surface.
@immutable
final class PlatformStrings {
  const PlatformStrings({
    required this.homeTitle,
    required this.sectionServices,
    required this.sectionAccount,
    required this.sectionSession,
    required this.sectionOrganisation,
    required this.sectionJurisdiction,
    required this.sectionLegal,
    required this.sectionConsent,
    required this.sectionSettings,
    required this.noServicesTitle,
    required this.noServicesDescription,
    required this.capabilitiesUnresolvedTitle,
    required this.capabilitiesUnresolvedDescription,
    required this.serviceUnavailableTitle,
    required this.serviceUnavailableDescription,
    required this.serviceUnavailableFinalDescription,
    required this.actionStartOver,
    required this.profileRowTitle,
    required this.profileRowSubtitle,
    required this.sessionActive,
    required this.sessionReferenceLabel,
    required this.userReferenceLabel,
    required this.organisationRowSubtitle,
    required this.organisationUnbound,
    required this.roleHintLabel,
    required this.jurisdictionNone,
    required this.jurisdictionUnverified,
    required this.jurisdictionVerified,
    required this.jurisdictionUnrecognised,
    required this.jurisdictionRowSubtitle,
    required this.jurisdictionScreenTitle,
    required this.jurisdictionReferenceLabel,
    required this.jurisdictionDeclareTitle,
    required this.jurisdictionDeclareDescription,
    required this.jurisdictionDeclareAction,
    required this.jurisdictionSelectionUnavailable,
    required this.jurisdictionRecorded,
    required this.jurisdictionAlreadyInEffect,
    required this.jurisdictionRemainsUnverified,
    required this.legalScreenTitle,
    required this.legalRowSubtitle,
    required this.operatingEntityHeading,
    required this.operatingEntityNameLabel,
    required this.operatingEntityJurisdictionLabel,
    required this.operatingEntityContactLabel,
    required this.operatingEntityAssignedNote,
    required this.operatingEntityUnassignedTitle,
    required this.operatingEntityUnassignedDescription,
    required this.operatingEntityUnavailableTitle,
    required this.operatingEntityUnavailableDescription,
    required this.operatingEntityUnrecognisedTitle,
    required this.operatingEntityUnrecognisedDescription,
    required this.policyPackHeading,
    required this.policyPackVersionLabel,
    required this.policyPackStatusLabel,
    required this.policyPackAbsent,
    required this.consentRowSubtitle,
    required this.settingsRowSubtitle,
  });

  static const PlatformStrings _english = PlatformStrings(
    homeTitle: 'Your account',
    sectionServices: 'Services',
    sectionAccount: 'Account and profile',
    sectionSession: 'Security and session',
    sectionOrganisation: 'Organisation',
    sectionJurisdiction: 'Jurisdiction',
    sectionLegal: 'Legal and operating entity',
    sectionConsent: 'Privacy and consent',
    sectionSettings: 'Settings',
    noServicesTitle: 'No services are available to you',
    noServicesDescription:
        'Your account is in order. The platform has confirmed that no service '
        'is enabled for it yet, so there is nothing here to open.',
    capabilitiesUnresolvedTitle: 'Services could not be checked',
    capabilitiesUnresolvedDescription:
        'The platform did not confirm which services apply to you, so none are '
        'shown. Nothing has changed on your account.',
    serviceUnavailableTitle: 'The service is unavailable',
    serviceUnavailableDescription:
        'Your platform context could not be loaded, so nothing is shown rather '
        'than something that may be wrong. Your account and your data are '
        'unaffected.',
    serviceUnavailableFinalDescription:
        'Your platform context could not be loaded, and the platform reported '
        'that trying again now will not change that. Close the application and '
        'open it again later.',
    actionStartOver: 'Start over',
    profileRowTitle: 'Profile',
    profileRowSubtitle: 'Your name, language and account status',
    sessionActive: 'Signed in on this device',
    sessionReferenceLabel: 'Session reference',
    userReferenceLabel: 'Account reference',
    organisationRowSubtitle: 'The organisation this session is bound to',
    organisationUnbound: 'This session is not bound to an organisation',
    roleHintLabel: 'Role',
    jurisdictionNone: 'Not assigned',
    jurisdictionUnverified: 'Declared, not verified',
    jurisdictionVerified: 'Verified',
    jurisdictionUnrecognised: 'Not recognised by this version',
    jurisdictionRowSubtitle: 'The regime that governs your account',
    jurisdictionScreenTitle: 'Jurisdiction',
    jurisdictionReferenceLabel: 'Jurisdiction reference',
    jurisdictionDeclareTitle: 'Declare your jurisdiction',
    jurisdictionDeclareDescription:
        'A declaration records where you say you are. It is not verified, and '
        'it grants no additional access on its own.',
    jurisdictionDeclareAction: 'Record declaration',
    jurisdictionSelectionUnavailable:
        'The platform did not supply the jurisdictions available for '
        'selection, so none can be offered here.',
    jurisdictionRecorded: 'Your declaration was recorded.',
    jurisdictionAlreadyInEffect:
        'That jurisdiction was already in effect, so nothing changed.',
    jurisdictionRemainsUnverified: 'Recorded as declared by you, and unverified.',
    legalScreenTitle: 'Legal',
    legalRowSubtitle: 'Who you contracted with, and the documents that apply',
    operatingEntityHeading: 'Operating entity',
    operatingEntityNameLabel: 'Registered legal name',
    operatingEntityJurisdictionLabel: 'Registered in',
    operatingEntityContactLabel: 'Data protection contact',
    operatingEntityAssignedNote:
        'This is the legal person you contracted with, as recorded by the '
        'platform.',
    operatingEntityUnassignedTitle: 'No operating entity is assigned',
    operatingEntityUnassignedDescription:
        'No contracting entity is recorded for your account yet.',
    operatingEntityUnavailableTitle: 'The operating entity could not be read',
    operatingEntityUnavailableDescription:
        'The platform could not confirm which legal person you contracted '
        'with, so none is shown.',
    operatingEntityUnrecognisedTitle: 'The operating entity is not recognised',
    operatingEntityUnrecognisedDescription:
        'The platform reported a state this version of the application does '
        'not recognise, so nothing is shown.',
    policyPackHeading: 'Governing policy',
    policyPackVersionLabel: 'Version',
    policyPackStatusLabel: 'Status',
    policyPackAbsent: 'None in effect',
    consentRowSubtitle: 'What you have agreed to, and what is outstanding',
    settingsRowSubtitle: 'Language, appearance and account',
  );

  static const PlatformStrings _arabic = PlatformStrings(
    homeTitle: 'حسابك',
    sectionServices: 'الخدمات',
    sectionAccount: 'الحساب والملف الشخصي',
    sectionSession: 'الأمان والجلسة',
    sectionOrganisation: 'المؤسسة',
    sectionJurisdiction: 'النطاق القضائي',
    sectionLegal: 'الشؤون القانونية والكيان المشغّل',
    sectionConsent: 'الخصوصية والموافقة',
    sectionSettings: 'الإعدادات',
    noServicesTitle: 'لا تتوفر لك أي خدمات',
    noServicesDescription:
        'حسابك سليم. أكدت المنصة عدم تفعيل أي خدمة له حتى الآن، فلا يوجد ما '
        'يمكن فتحه هنا.',
    capabilitiesUnresolvedTitle: 'تعذّر التحقق من الخدمات',
    capabilitiesUnresolvedDescription:
        'لم تؤكد المنصة الخدمات التي تنطبق عليك، لذلك لا تُعرض أي خدمة. لم '
        'يطرأ أي تغيير على حسابك.',
    serviceUnavailableTitle: 'الخدمة غير متاحة',
    serviceUnavailableDescription:
        'تعذّر تحميل سياق المنصة الخاص بك، لذلك لا يُعرض شيء بدلاً من عرض ما '
        'قد يكون غير صحيح. لم يتأثر حسابك ولا بياناتك.',
    serviceUnavailableFinalDescription:
        'تعذّر تحميل سياق المنصة الخاص بك، وأفادت المنصة بأن إعادة المحاولة '
        'الآن لن تغيّر ذلك. أغلق التطبيق وافتحه لاحقاً.',
    actionStartOver: 'البدء من جديد',
    profileRowTitle: 'الملف الشخصي',
    profileRowSubtitle: 'اسمك ولغتك وحالة حسابك',
    sessionActive: 'تم تسجيل الدخول على هذا الجهاز',
    sessionReferenceLabel: 'مرجع الجلسة',
    userReferenceLabel: 'مرجع الحساب',
    organisationRowSubtitle: 'المؤسسة المرتبطة بهذه الجلسة',
    organisationUnbound: 'هذه الجلسة غير مرتبطة بأي مؤسسة',
    roleHintLabel: 'الدور',
    jurisdictionNone: 'غير محدد',
    jurisdictionUnverified: 'مُعلَن وغير موثَّق',
    jurisdictionVerified: 'موثَّق',
    jurisdictionUnrecognised: 'غير معروف في هذا الإصدار',
    jurisdictionRowSubtitle: 'النظام الذي يحكم حسابك',
    jurisdictionScreenTitle: 'النطاق القضائي',
    jurisdictionReferenceLabel: 'مرجع النطاق القضائي',
    jurisdictionDeclareTitle: 'أعلن نطاقك القضائي',
    jurisdictionDeclareDescription:
        'يسجّل الإعلان المكان الذي تقول إنك فيه. وهو غير موثَّق، ولا يمنح أي '
        'صلاحية إضافية بحد ذاته.',
    jurisdictionDeclareAction: 'تسجيل الإعلان',
    jurisdictionSelectionUnavailable:
        'لم توفّر المنصة النطاقات القضائية المتاحة للاختيار، لذلك لا يمكن عرض '
        'أي منها هنا.',
    jurisdictionRecorded: 'تم تسجيل إعلانك.',
    jurisdictionAlreadyInEffect: 'كان ذلك النطاق القضائي سارياً بالفعل، فلم يتغيّر شيء.',
    jurisdictionRemainsUnverified: 'مسجَّل بإعلان منك، وغير موثَّق.',
    legalScreenTitle: 'الشؤون القانونية',
    legalRowSubtitle: 'الجهة المتعاقد معها والمستندات المنطبقة',
    operatingEntityHeading: 'الكيان المشغّل',
    operatingEntityNameLabel: 'الاسم القانوني المسجَّل',
    operatingEntityJurisdictionLabel: 'مسجَّل في',
    operatingEntityContactLabel: 'جهة الاتصال لحماية البيانات',
    operatingEntityAssignedNote:
        'هذا هو الشخص الاعتباري الذي تعاقدت معه، وفق ما سجّلته المنصة.',
    operatingEntityUnassignedTitle: 'لا يوجد كيان مشغّل محدد',
    operatingEntityUnassignedDescription: 'لم يُسجَّل بعد أي كيان متعاقد لحسابك.',
    operatingEntityUnavailableTitle: 'تعذّرت قراءة الكيان المشغّل',
    operatingEntityUnavailableDescription:
        'تعذّر على المنصة تأكيد الشخص الاعتباري الذي تعاقدت معه، لذلك لا يُعرض أي كيان.',
    operatingEntityUnrecognisedTitle: 'الكيان المشغّل غير معروف',
    operatingEntityUnrecognisedDescription:
        'أفادت المنصة بحالة لا يعرفها هذا الإصدار من التطبيق، لذلك لا يُعرض شيء.',
    policyPackHeading: 'السياسة الحاكمة',
    policyPackVersionLabel: 'الإصدار',
    policyPackStatusLabel: 'الحالة',
    policyPackAbsent: 'لا توجد سياسة سارية',
    consentRowSubtitle: 'ما وافقت عليه وما لا يزال معلقاً',
    settingsRowSubtitle: 'اللغة والمظهر والحساب',
  );

  /// Resolves the catalogue for the ambient locale.
  static PlatformStrings of(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'ar' ? _arabic : _english;

  final String homeTitle;
  final String sectionServices;
  final String sectionAccount;
  final String sectionSession;
  final String sectionOrganisation;
  final String sectionJurisdiction;
  final String sectionLegal;
  final String sectionConsent;
  final String sectionSettings;
  final String noServicesTitle;
  final String noServicesDescription;
  final String capabilitiesUnresolvedTitle;
  final String capabilitiesUnresolvedDescription;
  final String serviceUnavailableTitle;
  final String serviceUnavailableDescription;
  final String serviceUnavailableFinalDescription;
  final String actionStartOver;
  final String profileRowTitle;
  final String profileRowSubtitle;
  final String sessionActive;
  final String sessionReferenceLabel;
  final String userReferenceLabel;
  final String organisationRowSubtitle;
  final String organisationUnbound;
  final String roleHintLabel;
  final String jurisdictionNone;
  final String jurisdictionUnverified;
  final String jurisdictionVerified;
  final String jurisdictionUnrecognised;
  final String jurisdictionRowSubtitle;
  final String jurisdictionScreenTitle;
  final String jurisdictionReferenceLabel;
  final String jurisdictionDeclareTitle;
  final String jurisdictionDeclareDescription;
  final String jurisdictionDeclareAction;
  final String jurisdictionSelectionUnavailable;
  final String jurisdictionRecorded;
  final String jurisdictionAlreadyInEffect;
  final String jurisdictionRemainsUnverified;
  final String legalScreenTitle;
  final String legalRowSubtitle;
  final String operatingEntityHeading;
  final String operatingEntityNameLabel;
  final String operatingEntityJurisdictionLabel;
  final String operatingEntityContactLabel;
  final String operatingEntityAssignedNote;
  final String operatingEntityUnassignedTitle;
  final String operatingEntityUnassignedDescription;
  final String operatingEntityUnavailableTitle;
  final String operatingEntityUnavailableDescription;
  final String operatingEntityUnrecognisedTitle;
  final String operatingEntityUnrecognisedDescription;
  final String policyPackHeading;
  final String policyPackVersionLabel;
  final String policyPackStatusLabel;
  final String policyPackAbsent;
  final String consentRowSubtitle;
  final String settingsRowSubtitle;
}
