// Localized copy for the consent surface.
//
// Every string here is INTERFACE copy: a state name, a field label, a
// description of what the platform recorded. None of it is legal wording, and
// none of it states what any jurisdiction requires. Document text is published
// by the operating entity and is rendered from the platform's answer alone.
//
// Document kinds and purpose references are NOT translated. The contract types
// both as free-form platform strings with no enumerated vocabulary, so a local
// label would be a name this client invented for something it did not define.
// They are rendered verbatim, as data.
import 'package:flutter/widgets.dart';

/// Copy for consent status, legal documents and the actions over them.
@immutable
final class ConsentStrings {
  const ConsentStrings({
    required this.screenTitle,
    required this.screenDescription,
    required this.stateNotRequired,
    required this.stateRequired,
    required this.stateReconsentRequired,
    required this.stateActive,
    required this.stateWithdrawn,
    required this.stateUnavailable,
    required this.stateDocumentUnavailable,
    required this.statePolicyNotApproved,
    required this.describeNotRequired,
    required this.describeRequired,
    required this.describeReconsentRequired,
    required this.describeActive,
    required this.describeWithdrawn,
    required this.describeUnavailable,
    required this.describeDocumentUnavailable,
    required this.describePolicyNotApproved,
    required this.nothingToAgreeTitle,
    required this.nothingToAgreeDescription,
    required this.purposeLabel,
    required this.documentLabel,
    required this.versionLabel,
    required this.effectiveFromLabel,
    required this.publishedByLabel,
    required this.regimeLabel,
    required this.requiredActionLabel,
    required this.actionReacceptance,
    required this.actionNotice,
    required this.actionNone,
    required this.actionUnstated,
    required this.acceptAction,
    required this.withdrawAction,
    required this.acceptedConfirmation,
    required this.withdrawnConfirmation,
    required this.historyPreservedNote,
    required this.reconsentCreatesNewGrantNote,
    required this.noticeRequiredNote,
    required this.blockerJurisdiction,
    required this.blockerPolicy,
    required this.blockerEntity,
    required this.surfaceUnavailableTitle,
    required this.surfaceUnavailableDescription,
    required this.actionFailedTitle,
    required this.actionFailedDescription,
    required this.grantReferenceLabel,
  });

  static const ConsentStrings _english = ConsentStrings(
    screenTitle: 'Privacy and consent',
    screenDescription:
        'What the platform has recorded about your decisions. The documents '
        'are published by the operating entity; this application writes none '
        'of their wording.',
    stateNotRequired: 'No agreement is needed',
    stateRequired: 'Your agreement is needed',
    stateReconsentRequired: 'A new version needs your agreement',
    stateActive: 'In force',
    stateWithdrawn: 'Withdrawn',
    stateUnavailable: 'Could not be checked',
    stateDocumentUnavailable: 'No document is published',
    statePolicyNotApproved: 'Cannot be recorded yet',
    describeNotRequired:
        'No published document covers this purpose, so nothing is being asked '
        'of you here.',
    describeRequired:
        'A published version is in force and you have not agreed to it yet.',
    describeReconsentRequired:
        'A materially changed version is in force. Your earlier agreement no '
        'longer covers it.',
    describeActive: 'The platform holds your agreement to the version shown.',
    describeWithdrawn:
        'You withdrew your agreement. The platform still permits nothing under '
        'it.',
    describeUnavailable:
        'The platform did not answer, so nothing is shown and nothing can be '
        'agreed to here.',
    describeDocumentUnavailable:
        'The document that would apply has no published version, so there is '
        'nothing to read and nothing to agree to.',
    describePolicyNotApproved:
        'The platform cannot record an agreement for this purpose yet, so no '
        'control is offered.',
    nothingToAgreeTitle: 'Nothing is waiting for your agreement',
    nothingToAgreeDescription:
        'The platform lists no document that applies to your account right '
        'now.',
    purposeLabel: 'Purpose',
    documentLabel: 'Document',
    versionLabel: 'Version',
    effectiveFromLabel: 'In effect from',
    publishedByLabel: 'Published by',
    regimeLabel: 'Regime',
    requiredActionLabel: 'Required action',
    actionReacceptance: 'A new agreement is required',
    actionNotice: 'For your information',
    actionNone: 'Nothing is required of you',
    actionUnstated: 'Not stated by the platform',
    acceptAction: 'Agree to this version',
    withdrawAction: 'Withdraw agreement',
    acceptedConfirmation: 'The platform recorded your agreement.',
    withdrawnConfirmation: 'The platform recorded your withdrawal.',
    historyPreservedNote:
        'The earlier record is kept as evidence and is not deleted.',
    reconsentCreatesNewGrantNote:
        'Agreeing creates a new record against the new version. The earlier '
        'record is unchanged.',
    noticeRequiredNote:
        'A newer version has been published for your information. Your existing '
        'agreement still applies.',
    blockerJurisdiction:
        'No jurisdiction is assigned to your account, so no policy resolves '
        'for you yet.',
    blockerPolicy:
        'No approved policy is in effect, so the platform can record no '
        'agreement.',
    blockerEntity:
        'No operating entity is assigned, so an agreement would name no '
        'publisher.',
    surfaceUnavailableTitle: 'Consent could not be checked',
    surfaceUnavailableDescription:
        'The platform did not answer. Nothing has changed about what you have '
        'agreed to.',
    actionFailedTitle: 'That was not recorded',
    actionFailedDescription:
        'The platform did not record the change, so nothing about your '
        'agreement has changed.',
    grantReferenceLabel: 'Record reference',
  );

  static const ConsentStrings _arabic = ConsentStrings(
    screenTitle: 'الخصوصية والموافقة',
    screenDescription:
        'ما سجّلته المنصة بشأن قراراتك. المستندات ينشرها الكيان المشغّل، ولا '
        'يكتب هذا التطبيق أي صياغة منها.',
    stateNotRequired: 'لا حاجة إلى موافقة',
    stateRequired: 'موافقتك مطلوبة',
    stateReconsentRequired: 'إصدار جديد يتطلب موافقتك',
    stateActive: 'سارية',
    stateWithdrawn: 'مسحوبة',
    stateUnavailable: 'تعذّر التحقق',
    stateDocumentUnavailable: 'لا يوجد مستند منشور',
    statePolicyNotApproved: 'لا يمكن تسجيلها بعد',
    describeNotRequired: 'لا يغطي أي مستند منشور هذا الغرض، فلا يُطلب منك شيء هنا.',
    describeRequired: 'يوجد إصدار منشور ساري المفعول ولم توافق عليه بعد.',
    describeReconsentRequired:
        'يوجد إصدار جرى تغييره جوهرياً وهو ساري المفعول، ولم تعد موافقتك '
        'السابقة تغطيه.',
    describeActive: 'تحتفظ المنصة بموافقتك على الإصدار المعروض.',
    describeWithdrawn: 'لقد سحبت موافقتك، ولا تسمح المنصة بأي معالجة بموجبها.',
    describeUnavailable:
        'لم تجب المنصة، لذلك لا يُعرض شيء ولا يمكن الموافقة على شيء هنا.',
    describeDocumentUnavailable:
        'المستند الذي كان سينطبق ليس له إصدار منشور، فلا يوجد ما يُقرأ ولا ما '
        'يُوافَق عليه.',
    describePolicyNotApproved:
        'لا يمكن للمنصة تسجيل موافقة لهذا الغرض بعد، لذلك لا يُعرض أي زر.',
    nothingToAgreeTitle: 'لا شيء ينتظر موافقتك',
    nothingToAgreeDescription: 'لا تدرج المنصة أي مستند ينطبق على حسابك حالياً.',
    purposeLabel: 'الغرض',
    documentLabel: 'المستند',
    versionLabel: 'الإصدار',
    effectiveFromLabel: 'ساري من',
    publishedByLabel: 'نشره',
    regimeLabel: 'النظام',
    requiredActionLabel: 'الإجراء المطلوب',
    actionReacceptance: 'مطلوبة موافقة جديدة',
    actionNotice: 'للعلم فقط',
    actionNone: 'لا يُطلب منك شيء',
    actionUnstated: 'لم تحدده المنصة',
    acceptAction: 'الموافقة على هذا الإصدار',
    withdrawAction: 'سحب الموافقة',
    acceptedConfirmation: 'سجّلت المنصة موافقتك.',
    withdrawnConfirmation: 'سجّلت المنصة سحبك للموافقة.',
    historyPreservedNote: 'يُحتفظ بالسجل السابق كدليل ولا يُحذف.',
    reconsentCreatesNewGrantNote:
        'تنشئ الموافقة سجلاً جديداً مقابل الإصدار الجديد، ويبقى السجل السابق '
        'كما هو.',
    noticeRequiredNote: 'نُشر إصدار أحدث للعلم فقط، ولا تزال موافقتك الحالية سارية.',
    blockerJurisdiction:
        'لم يُحدد نطاق قضائي لحسابك، لذلك لا تنطبق عليك أي سياسة بعد.',
    blockerPolicy: 'لا توجد سياسة معتمدة سارية، لذلك لا يمكن للمنصة تسجيل أي موافقة.',
    blockerEntity: 'لا يوجد كيان مشغّل محدد، لذلك لن تحمل الموافقة اسم أي ناشر.',
    surfaceUnavailableTitle: 'تعذّر التحقق من الموافقة',
    surfaceUnavailableDescription:
        'لم تجب المنصة. ولم يتغيّر شيء بشأن ما وافقت عليه.',
    actionFailedTitle: 'لم يُسجَّل ذلك',
    actionFailedDescription:
        'لم تسجّل المنصة التغيير، لذلك لم يطرأ أي تغيير على موافقتك.',
    grantReferenceLabel: 'مرجع السجل',
  );

  static ConsentStrings of(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'ar' ? _arabic : _english;

  final String screenTitle;
  final String screenDescription;
  final String stateNotRequired;
  final String stateRequired;
  final String stateReconsentRequired;
  final String stateActive;
  final String stateWithdrawn;
  final String stateUnavailable;
  final String stateDocumentUnavailable;
  final String statePolicyNotApproved;
  final String describeNotRequired;
  final String describeRequired;
  final String describeReconsentRequired;
  final String describeActive;
  final String describeWithdrawn;
  final String describeUnavailable;
  final String describeDocumentUnavailable;
  final String describePolicyNotApproved;
  final String nothingToAgreeTitle;
  final String nothingToAgreeDescription;
  final String purposeLabel;
  final String documentLabel;
  final String versionLabel;
  final String effectiveFromLabel;
  final String publishedByLabel;
  final String regimeLabel;
  final String requiredActionLabel;
  final String actionReacceptance;
  final String actionNotice;
  final String actionNone;
  final String actionUnstated;
  final String acceptAction;
  final String withdrawAction;
  final String acceptedConfirmation;
  final String withdrawnConfirmation;
  final String historyPreservedNote;
  final String reconsentCreatesNewGrantNote;
  final String noticeRequiredNote;
  final String blockerJurisdiction;
  final String blockerPolicy;
  final String blockerEntity;
  final String surfaceUnavailableTitle;
  final String surfaceUnavailableDescription;
  final String actionFailedTitle;
  final String actionFailedDescription;
  final String grantReferenceLabel;
}
