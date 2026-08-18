// PURE DART ONLY. See lib/README.md — domain purity.
//
// The consent port and the use cases over it.
//
// `ResolveConsentOverview` is where the platform's answer, the applicable
// documents and the server-derived prerequisites become one typed state. It is
// pure and synchronous so the whole decision table is testable without a
// transport, and so no screen can reach a different conclusion from the same
// inputs.
import 'package:meta/meta.dart';

import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import 'consent_state.dart';
import 'legal_document.dart';

/// The platform's own consent status for one purpose.
@immutable
final class ConsentStatusRecord {
  const ConsentStatusRecord({
    required this.purposeRef,
    required this.state,
    required this.noticeRequired,
    required this.operatingEntityId,
    this.documentId,
    this.effectiveVersion,
    this.effectiveVersionId,
    this.grantId,
    this.grantedVersion,
    this.jurisdictionRef,
  });

  final String purposeRef;
  final ConsentStatusState state;

  /// A republication the reader must be shown, alongside an otherwise valid
  /// grant. It does not invalidate the grant and must not be rendered as
  /// though it did.
  final bool noticeRequired;

  final String operatingEntityId;
  final String? documentId;
  final String? effectiveVersion;
  final String? effectiveVersionId;
  final String? grantId;
  final String? grantedVersion;
  final String? jurisdictionRef;

  @override
  String toString() => 'ConsentStatusRecord(${state.name})';
}

/// The consent surface for one processing purpose.
@immutable
final class ConsentOverview {
  const ConsentOverview({
    required this.purposeRef,
    required this.state,
    required this.prerequisites,
    this.document,
    this.grant,
    this.noticeRequired = false,
    this.operatingEntityId,
    this.jurisdictionRef,
    this.correlationId,
  });

  final String purposeRef;
  final ConsentState state;
  final ConsentPrerequisites prerequisites;

  /// The document that governs the purpose, when one applies.
  final LegalDocument? document;

  /// The grant the platform holds, whether in force or withdrawn. Retained in
  /// the withdrawn state on purpose: withdrawal preserves history.
  final ConsentGrant? grant;

  final bool noticeRequired;
  final String? operatingEntityId;
  final String? jurisdictionRef;

  /// The platform's reference for an unavailable state, for support. Never a
  /// message, never a body, never a capability hint.
  final String? correlationId;

  /// The version an acceptance would be pinned to, or null when there is none.
  String? get acceptableVersionId => document?.effectiveVersion?.versionId;

  /// Whether the acceptance control may be enabled.
  ///
  /// Every clause is server-derived. There is no local override, no "the user
  /// probably can", and no optimistic enabling while a check is outstanding.
  bool get canAccept =>
      state.needsAcceptance && acceptableVersionId != null && prerequisites.areMet;

  /// Whether a standing grant can be withdrawn.
  bool get canWithdraw => state == ConsentState.active && grant != null;

  /// Why an acceptance is impossible, when it is. Empty when [canAccept].
  List<ConsentBlocker> get blockers =>
      state.needsAcceptance || state == ConsentState.policyNotApproved
          ? prerequisites.blockers
          : const <ConsentBlocker>[];

  @override
  String toString() => 'ConsentOverview(${state.wireName})';
}

/// Reads and records the caller's OWN consent.
abstract interface class ConsentRepository {
  Future<Result<ConsentStatusRecord>> readStatus({
    required String purposeRef,
    String? jurisdictionRef,
  });

  Future<Result<List<LegalDocument>>> listApplicableDocuments({String? jurisdictionRef});

  /// Records an acceptance of exactly [legalDocumentVersionId].
  ///
  /// The evidence reference is derived server-side from the request identity
  /// and is never supplied, held or logged by this client.
  Future<Result<ConsentGrant>> accept({
    required String legalDocumentVersionId,
    required String purposeRef,
  });

  Future<Result<ConsentWithdrawal>> withdraw({required String grantId});
}

/// Folds the platform's answers into one consent state.
@immutable
final class ResolveConsentOverview {
  const ResolveConsentOverview();

  ConsentOverview call({
    required String purposeRef,
    required ConsentStatusRecord status,
    required List<LegalDocument> documents,
    required ConsentPrerequisites prerequisites,
  }) {
    final document = _documentFor(purposeRef, status.documentId, documents);
    final grant = status.grantId == null
        ? null
        : ConsentGrant(
            grantId: status.grantId!,
            purposeRef: purposeRef,
            acceptedVersion: status.grantedVersion,
            operatingEntityId: status.operatingEntityId,
            jurisdictionRef: status.jurisdictionRef,
          );

    ConsentOverview build(ConsentState state) => ConsentOverview(
          purposeRef: purposeRef,
          state: state,
          prerequisites: prerequisites,
          document: document,
          grant: grant,
          noticeRequired: status.noticeRequired,
          operatingEntityId: status.operatingEntityId,
          jurisdictionRef: status.jurisdictionRef,
        );

    switch (status.state) {
      case ConsentStatusState.unrecognised:
        // A state this build cannot classify grants nothing and offers
        // nothing.
        return build(ConsentState.unavailable);
      case ConsentStatusState.active:
        return build(ConsentState.active);
      case ConsentStatusState.withdrawn:
        return build(ConsentState.withdrawn);
      case ConsentStatusState.noGrant:
        if (document == null) {
          // No applicable document governs the purpose. Not everything rests
          // on consent, so this is an answer rather than a gap.
          return build(ConsentState.notRequired);
        }
        if (!document.hasEffectiveVersion) {
          return build(ConsentState.legalDocumentUnavailable);
        }
        if (!prerequisites.areMet) {
          return build(ConsentState.policyNotApproved);
        }
        return build(ConsentState.consentRequired);
      case ConsentStatusState.reconsentRequired:
        if (document == null || !document.hasEffectiveVersion) {
          return build(ConsentState.legalDocumentUnavailable);
        }
        if (!prerequisites.areMet) {
          return build(ConsentState.policyNotApproved);
        }
        return build(ConsentState.reconsentRequired);
    }
  }

  /// The unavailable state, from a failure. Carries the platform's reference
  /// and nothing else: an unavailable consent surface must not become a
  /// channel for describing what the platform holds.
  ConsentOverview unavailable({
    required String purposeRef,
    required Failure failure,
    ConsentPrerequisites prerequisites = ConsentPrerequisites.none,
  }) =>
      ConsentOverview(
        purposeRef: purposeRef,
        state: ConsentState.unavailable,
        prerequisites: prerequisites,
        correlationId: failure.correlationId,
      );

  /// Matches on the document the platform named, and falls back to the one
  /// that covers the purpose. Returns null rather than guessing when neither
  /// identifies a document.
  static LegalDocument? _documentFor(
    String purposeRef,
    String? documentId,
    List<LegalDocument> documents,
  ) {
    if (documentId != null) {
      for (final document in documents) {
        if (document.documentId == documentId) {
          return document;
        }
      }
    }
    for (final document in documents) {
      if (document.covers(purposeRef)) {
        return document;
      }
    }
    return null;
  }
}

/// Records an acceptance. Success is the SERVER's answer and nothing else.
final class AcceptLegalDocument {
  const AcceptLegalDocument(this._repository);

  final ConsentRepository _repository;

  Future<Result<ConsentGrant>> call({
    required String legalDocumentVersionId,
    required String purposeRef,
  }) =>
      _repository.accept(
        legalDocumentVersionId: legalDocumentVersionId,
        purposeRef: purposeRef,
      );
}

/// Withdraws a standing grant. The record is preserved as evidence.
final class WithdrawConsent {
  const WithdrawConsent(this._repository);

  final ConsentRepository _repository;

  Future<Result<ConsentWithdrawal>> call(String grantId) =>
      _repository.withdraw(grantId: grantId);
}
