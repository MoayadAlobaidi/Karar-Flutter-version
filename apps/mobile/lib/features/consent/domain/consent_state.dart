// PURE DART ONLY. See lib/README.md — domain purity.
//
// CONSENT, AS A TYPED STATE.
//
// Consent is not a checkbox. It is a state the platform resolves from a
// governing jurisdiction, an approved policy pack, an operating entity, a
// published document version and the subject's own grant history. This file
// names every state that resolution can produce, including the ones in which
// nothing may be offered.
//
// Three rules are structural rather than stylistic:
//
//   * NOT every processing purpose rests on consent. `notRequired` is a real
//     answer, not an absence, and the client must not present a consent
//     control for a purpose that has no applicable document.
//   * There is NO optimistic acceptance. `canAccept` describes what the server
//     said is possible; a grant exists only once the server has confirmed one.
//   * The unavailable states are explicit. A control that cannot work is not
//     rendered as a control that might.
//
// No legal prose is constructed here, and no jurisdiction's rules are encoded
// here. The client renders what the platform published and says so.
import 'package:meta/meta.dart';

/// The resolved consent state for one processing purpose.
///
/// [wireName] is the canonical identifier so a state can be logged, asserted
/// on and compared without a second vocabulary growing beside the platform's.
enum ConsentState {
  /// No applicable document governs this purpose, so the subject is asked for
  /// nothing. Processing, if any, rests on a basis that is not consent.
  notRequired('NOT_REQUIRED'),

  /// A published version is in force and has not been accepted.
  consentRequired('REQUIRED'),

  /// A materially changed version is in force; the standing grant no longer
  /// permits processing until the new version is accepted.
  reconsentRequired('RECONSENT_REQUIRED'),

  /// A grant is in force.
  active('ACTIVE'),

  /// The subject withdrew. The grant is preserved as evidence and a later
  /// acceptance creates a NEW grant rather than reviving this one.
  withdrawn('WITHDRAWN'),

  /// Consent state could not be resolved. Fails closed.
  unavailable('UNAVAILABLE'),

  /// The document that would be accepted has no published effective version,
  /// so there is nothing to present and nothing to accept.
  legalDocumentUnavailable('LEGAL_DOCUMENT_UNAVAILABLE'),

  /// No approved policy pack governs the subject, so the platform can pin no
  /// provenance to an acceptance and will refuse to record one.
  policyNotApproved('POLICY_NOT_APPROVED');

  const ConsentState(this.wireName);

  final String wireName;

  /// Whether an acceptance is the outstanding action, before prerequisites are
  /// considered.
  bool get needsAcceptance =>
      this == ConsentState.consentRequired || this == ConsentState.reconsentRequired;
}

/// The platform-side state of `GET /consent/status`, before the client folds
/// document availability and policy approval into it.
enum ConsentStatusState {
  active,
  noGrant,
  reconsentRequired,
  withdrawn,

  /// A value this build does not recognise. Never read as permission.
  unrecognised,
}

/// A prerequisite the platform must satisfy before an acceptance can be
/// recorded at all.
enum ConsentBlocker {
  /// No governing jurisdiction is assigned, so no policy pack resolves.
  jurisdictionNotAssigned,

  /// The governing policy pack is absent or not approved.
  policyPackNotApproved,

  /// No operating entity is bound, so an acceptance would name no controller
  /// of record.
  operatingEntityNotAssigned,
}

/// The server-derived prerequisites for recording an acceptance.
///
/// Every field comes from the platform's bootstrap answer. The client computes
/// none of them and assumes none of them.
@immutable
final class ConsentPrerequisites {
  const ConsentPrerequisites({
    required this.jurisdictionAssigned,
    required this.policyPackApproved,
    required this.operatingEntityAssigned,
  });

  /// Nothing is known. Fails closed, which is the correct reading of an
  /// unresolved platform context.
  static const ConsentPrerequisites none = ConsentPrerequisites(
    jurisdictionAssigned: false,
    policyPackApproved: false,
    operatingEntityAssigned: false,
  );

  final bool jurisdictionAssigned;
  final bool policyPackApproved;
  final bool operatingEntityAssigned;

  bool get areMet => jurisdictionAssigned && policyPackApproved && operatingEntityAssigned;

  List<ConsentBlocker> get blockers => <ConsentBlocker>[
        if (!jurisdictionAssigned) ConsentBlocker.jurisdictionNotAssigned,
        if (!policyPackApproved) ConsentBlocker.policyPackNotApproved,
        if (!operatingEntityAssigned) ConsentBlocker.operatingEntityNotAssigned,
      ];

  @override
  bool operator ==(Object other) =>
      other is ConsentPrerequisites &&
      other.jurisdictionAssigned == jurisdictionAssigned &&
      other.policyPackApproved == policyPackApproved &&
      other.operatingEntityAssigned == operatingEntityAssigned;

  @override
  int get hashCode =>
      Object.hash(jurisdictionAssigned, policyPackApproved, operatingEntityAssigned);

  @override
  String toString() => 'ConsentPrerequisites(met: $areMet)';
}
