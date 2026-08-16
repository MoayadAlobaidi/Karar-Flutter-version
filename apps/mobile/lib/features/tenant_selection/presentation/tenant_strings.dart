// Localized copy for the tenancy surface.
//
// "Organisation" is the word shown to a person; "tenant" is the platform's own
// term and stays inside the contract. Every key here is named in this
// workstream's report for migration into `lib/l10n/arb`.
import 'package:flutter/widgets.dart';

/// Copy for tenant selection and switching.
@immutable
final class TenantStrings {
  const TenantStrings({
    required this.selectionTitle,
    required this.selectionDescription,
    required this.noMembershipTitle,
    required this.noMembershipDescription,
    required this.organisationTitle,
    required this.currentOrganisationLabel,
    required this.roleLabel,
    required this.roleValuePattern,
    required this.unboundTitle,
    required this.unboundDescription,
    required this.switchHeading,
    required this.switchDescription,
    required this.switchAction,
    required this.noAlternativesTitle,
    required this.noAlternativesDescription,
    required this.boundConfirmation,
    required this.switchedConfirmation,
    required this.selectionFailedTitle,
    required this.selectionFailedDescription,
    required this.membershipChangedTitle,
    required this.membershipChangedDescription,
    required this.membershipRefusedTitle,
    required this.membershipRefusedDescription,
    required this.selectSemanticPrefix,
    required this.invitationHeading,
    required this.invitationDescription,
    required this.invitationFieldLabel,
    required this.invitationAction,
    required this.invitationRedeemed,
    required this.invitationFailedTitle,
    required this.invitationFailedDescription,
  });

  static const TenantStrings _english = TenantStrings(
    selectionTitle: 'Choose an organisation',
    selectionDescription:
        'Your account belongs to more than one organisation. Choose the one to '
        'use for this session. Only the organisations the platform listed for '
        'you appear here.',
    noMembershipTitle: 'You do not belong to an organisation yet',
    noMembershipDescription:
        'Your account is in order, but no organisation has admitted it. Until '
        'one does, this session stays unbound and anything belonging to an '
        'organisation stays unavailable.',
    organisationTitle: 'Organisation',
    currentOrganisationLabel: 'Current organisation',
    roleLabel: 'Role',
    roleValuePattern: '{label}: {value}',
    unboundTitle: 'This session is not bound to an organisation',
    unboundDescription:
        'Nothing that belongs to an organisation is available while the '
        'session is unbound.',
    switchHeading: 'Switch organisation',
    switchDescription:
        'Switching ends the current session and starts a new one in the other '
        'organisation. Everything loaded for the current organisation is '
        'discarded, and this device is signed in again automatically.',
    switchAction: 'Switch',
    noAlternativesTitle: 'No other organisation is available',
    noAlternativesDescription:
        'The platform lists no other membership for your account, so there is '
        'nothing to switch to.',
    boundConfirmation: 'This session is now bound to the organisation.',
    switchedConfirmation:
        'You are now in the other organisation, in a new session. The previous '
        'session has ended.',
    selectionFailedTitle: 'The organisation could not be selected',
    selectionFailedDescription: 'The platform refused the selection. Nothing changed.',
    membershipChangedTitle: 'Your membership changed during the switch',
    membershipChangedDescription:
        'Your access to that organisation changed while the switch was in '
        'progress, so the session was ended rather than left without a '
        'membership. Sign in again.',
    membershipRefusedTitle: 'That organisation is not available to you',
    membershipRefusedDescription:
        'The platform did not accept the selection. Nothing about your session '
        'changed.',
    selectSemanticPrefix: 'Select organisation',
    invitationHeading: 'Redeem an invitation',
    invitationDescription:
        'If an organisation invited you, enter the code from that invitation. '
        'The invitation itself decides which organisation you join.',
    invitationFieldLabel: 'Invitation code',
    invitationAction: 'Redeem invitation',
    invitationRedeemed:
        'The invitation was redeemed. Your memberships are being re-checked.',
    invitationFailedTitle: 'The invitation could not be redeemed',
    invitationFailedDescription:
        'The code was not accepted. It may have been used already, withdrawn, '
        'or issued for a different account.',
  );

  static const TenantStrings _arabic = TenantStrings(
    selectionTitle: 'اختر مؤسسة',
    selectionDescription:
        'ينتمي حسابك إلى أكثر من مؤسسة. اختر المؤسسة التي ستستخدمها في هذه '
        'الجلسة. تظهر هنا المؤسسات التي أدرجتها المنصة لك فقط.',
    noMembershipTitle: 'لا تنتمي إلى أي مؤسسة بعد',
    noMembershipDescription:
        'حسابك سليم، لكن لم تقبله أي مؤسسة. وإلى أن يحدث ذلك تبقى هذه الجلسة '
        'غير مرتبطة ويبقى كل ما يخص المؤسسات غير متاح.',
    organisationTitle: 'المؤسسة',
    currentOrganisationLabel: 'المؤسسة الحالية',
    roleLabel: 'الدور',
    roleValuePattern: '{label}: {value}',
    unboundTitle: 'هذه الجلسة غير مرتبطة بأي مؤسسة',
    unboundDescription: 'لا يتوفر أي شيء يخص المؤسسات ما دامت الجلسة غير مرتبطة.',
    switchHeading: 'تبديل المؤسسة',
    switchDescription:
        'يؤدي التبديل إلى إنهاء الجلسة الحالية وبدء جلسة جديدة في المؤسسة '
        'الأخرى. يُتخلّص من كل ما حُمّل للمؤسسة الحالية، ويُسجَّل دخول هذا '
        'الجهاز من جديد تلقائياً.',
    switchAction: 'تبديل',
    noAlternativesTitle: 'لا تتوفر مؤسسة أخرى',
    noAlternativesDescription:
        'لا تدرج المنصة أي عضوية أخرى لحسابك، فلا يوجد ما يمكن التبديل إليه.',
    boundConfirmation: 'أصبحت هذه الجلسة مرتبطة بالمؤسسة.',
    switchedConfirmation:
        'أنت الآن في المؤسسة الأخرى ضمن جلسة جديدة. وقد انتهت الجلسة السابقة.',
    selectionFailedTitle: 'تعذّر اختيار المؤسسة',
    selectionFailedDescription: 'رفضت المنصة الاختيار. لم يتغيّر شيء.',
    membershipChangedTitle: 'تغيّرت عضويتك أثناء التبديل',
    membershipChangedDescription:
        'تغيّر وصولك إلى تلك المؤسسة أثناء تنفيذ التبديل، لذلك أُنهيت الجلسة '
        'بدلاً من تركها بلا عضوية. سجّل الدخول من جديد.',
    membershipRefusedTitle: 'تلك المؤسسة غير متاحة لك',
    membershipRefusedDescription:
        'لم تقبل المنصة الاختيار. ولم يطرأ أي تغيير على جلستك.',
    selectSemanticPrefix: 'اختيار المؤسسة',
    invitationHeading: 'استخدام دعوة',
    invitationDescription:
        'إذا دعتك مؤسسة، أدخل الرمز الوارد في تلك الدعوة. والدعوة نفسها هي '
        'التي تحدد المؤسسة التي تنضم إليها.',
    invitationFieldLabel: 'رمز الدعوة',
    invitationAction: 'استخدام الدعوة',
    invitationRedeemed: 'تم استخدام الدعوة. تجري إعادة التحقق من عضوياتك.',
    invitationFailedTitle: 'تعذّر استخدام الدعوة',
    invitationFailedDescription:
        'لم يُقبل الرمز. ربما استُخدم من قبل، أو سُحب، أو صدر لحساب آخر.',
  );

  static TenantStrings of(BuildContext context) =>
      Localizations.localeOf(context).languageCode == 'ar' ? _arabic : _english;

  final String selectionTitle;
  final String selectionDescription;
  final String noMembershipTitle;
  final String noMembershipDescription;
  final String organisationTitle;
  final String currentOrganisationLabel;
  final String roleLabel;

  /// The pattern that pairs the role label with the platform's role value.
  ///
  /// Held in the catalogue rather than composed in a widget so the separator
  /// is a translator's decision, exactly as it would be as an ARB placeholder
  /// message.
  final String roleValuePattern;

  /// The role label paired with [role].
  String roleWithValue(String role) =>
      roleValuePattern.replaceFirst('{label}', roleLabel).replaceFirst('{value}', role);
  final String unboundTitle;
  final String unboundDescription;
  final String switchHeading;
  final String switchDescription;
  final String switchAction;
  final String noAlternativesTitle;
  final String noAlternativesDescription;
  final String boundConfirmation;
  final String switchedConfirmation;
  final String selectionFailedTitle;
  final String selectionFailedDescription;
  final String membershipChangedTitle;
  final String membershipChangedDescription;
  final String membershipRefusedTitle;
  final String membershipRefusedDescription;
  final String selectSemanticPrefix;
  final String invitationHeading;
  final String invitationDescription;
  final String invitationFieldLabel;
  final String invitationAction;
  final String invitationRedeemed;
  final String invitationFailedTitle;
  final String invitationFailedDescription;
}
