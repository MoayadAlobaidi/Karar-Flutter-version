// The consent repository implementation.
//
// NOTHING IN THIS FILE LOGS. Consent evidence, and anything an observer could
// use to reconstruct it, must not reach a diagnostic sink; the simplest way to
// hold that rule is to give this file no logger at all.
//
// The mapping pattern is the one in lib/README.md: `ApiException` becomes its
// typed failure, and `FormatException` and `TypeError` become a contract
// violation so a server that changes a shape degrades this client rather than
// crashing it.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../domain/consent_repository.dart';
import '../domain/consent_state.dart';
import '../domain/legal_document.dart';

/// [ConsentRepository] over the generated client.
final class ApiConsentRepository implements ConsentRepository {
  const ApiConsentRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<ConsentStatusRecord>> readStatus({
    required String purposeRef,
    String? jurisdictionRef,
  }) async {
    try {
      final dto = await _client.readOwnConsentStatus(
        purposeRef: purposeRef,
        jurisdictionRef: jurisdictionRef,
      );
      return Success<ConsentStatusRecord>(_toStatus(dto));
    } on ApiException catch (exception) {
      return Failed<ConsentStatusRecord>(exception.failure);
    } on FormatException {
      return const Failed<ConsentStatusRecord>(
        ContractViolationFailure(location: 'consent.status'),
      );
    } on TypeError {
      return const Failed<ConsentStatusRecord>(
        ContractViolationFailure(location: 'consent.status'),
      );
    }
  }

  @override
  Future<Result<List<LegalDocument>>> listApplicableDocuments({
    String? jurisdictionRef,
  }) async {
    try {
      final dto = await _client.listApplicableConsentDocuments(
        jurisdictionRef: jurisdictionRef,
      );
      return Success<List<LegalDocument>>(
        List<LegalDocument>.unmodifiable(
          <LegalDocument>[for (final item in dto.documents) _toDocument(item)],
        ),
      );
    } on ApiException catch (exception) {
      return Failed<List<LegalDocument>>(exception.failure);
    } on FormatException {
      return const Failed<List<LegalDocument>>(
        ContractViolationFailure(location: 'consent.documents'),
      );
    } on TypeError {
      return const Failed<List<LegalDocument>>(
        ContractViolationFailure(location: 'consent.documents'),
      );
    }
  }

  @override
  Future<Result<ConsentGrant>> accept({
    required String legalDocumentVersionId,
    required String purposeRef,
  }) async {
    try {
      final dto = await _client.recordOwnConsentAcceptance(
        body: RecordOwnConsentAcceptanceRequestDto(
          legalDocumentVersionId: legalDocumentVersionId,
          purposeRef: purposeRef,
        ),
      );
      if (dto.status != RecordOwnConsentAcceptanceResponseStatusDto.active) {
        // The platform answered with a status this build cannot read as a
        // grant. Refusing is the only honest outcome; reporting success would
        // tell the subject a decision was recorded that may not have been.
        return const Failed<ConsentGrant>(
          ContractViolationFailure(location: 'consent.acceptance.status'),
        );
      }
      return Success<ConsentGrant>(
        ConsentGrant(
          grantId: dto.grantId,
          purposeRef: dto.purposeRef,
          acceptedVersion: dto.consentVersion,
          grantedAt: dto.grantedAt,
          operatingEntityId: dto.operatingEntityId,
          jurisdictionRef: dto.jurisdictionRef,
        ),
      );
    } on ApiException catch (exception) {
      return Failed<ConsentGrant>(exception.failure);
    } on FormatException {
      return const Failed<ConsentGrant>(
        ContractViolationFailure(location: 'consent.acceptance'),
      );
    } on TypeError {
      return const Failed<ConsentGrant>(
        ContractViolationFailure(location: 'consent.acceptance'),
      );
    }
  }

  @override
  Future<Result<ConsentWithdrawal>> withdraw({required String grantId}) async {
    try {
      final dto = await _client.withdrawOwnConsent(
        body: WithdrawOwnConsentRequestDto(grantId: grantId),
      );
      if (dto.status != WithdrawOwnConsentResponseStatusDto.withdrawn) {
        return const Failed<ConsentWithdrawal>(
          ContractViolationFailure(location: 'consent.withdrawal.status'),
        );
      }
      return Success<ConsentWithdrawal>(
        ConsentWithdrawal(grantId: dto.grantId, withdrawnAt: dto.withdrawnAt),
      );
    } on ApiException catch (exception) {
      return Failed<ConsentWithdrawal>(exception.failure);
    } on FormatException {
      return const Failed<ConsentWithdrawal>(
        ContractViolationFailure(location: 'consent.withdrawal'),
      );
    } on TypeError {
      return const Failed<ConsentWithdrawal>(
        ContractViolationFailure(location: 'consent.withdrawal'),
      );
    }
  }

  static ConsentStatusRecord _toStatus(ReadOwnConsentStatusResponseDto dto) =>
      ConsentStatusRecord(
        purposeRef: dto.purposeRef,
        state: switch (dto.state) {
          ReadOwnConsentStatusResponseStateDto.active => ConsentStatusState.active,
          ReadOwnConsentStatusResponseStateDto.noGrant => ConsentStatusState.noGrant,
          ReadOwnConsentStatusResponseStateDto.reconsentRequired =>
            ConsentStatusState.reconsentRequired,
          ReadOwnConsentStatusResponseStateDto.withdrawn => ConsentStatusState.withdrawn,
          ReadOwnConsentStatusResponseStateDto.unknown => ConsentStatusState.unrecognised,
        },
        noticeRequired: dto.noticeRequired,
        operatingEntityId: dto.operatingEntityId,
        documentId: dto.documentId,
        effectiveVersion: dto.effectiveVersion,
        effectiveVersionId: dto.effectiveVersionId,
        grantId: dto.grantId,
        grantedVersion: dto.grantedVersion,
        jurisdictionRef: dto.jurisdictionRef,
      );

  static LegalDocument _toDocument(
    ListApplicableConsentDocumentsResponseDocumentsItemDto dto,
  ) =>
      LegalDocument(
        documentId: dto.documentId,
        kind: dto.kind,
        entityId: dto.entityId,
        jurisdictionRef: dto.jurisdictionRef,
        purposeRefs: List<String>.unmodifiable(dto.purposeRefs),
        effectiveVersion: _toVersion(dto.effectiveVersion),
      );

  static LegalDocumentVersion? _toVersion(
    ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionDto? dto,
  ) {
    if (dto == null) {
      return null;
    }
    return LegalDocumentVersion(
      versionId: dto.versionId,
      version: dto.version,
      effectiveAt: dto.effectiveAt,
      action: switch (dto.classification) {
        ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto
              .materialReacceptanceRequired =>
          LegalDocumentAction.reacceptanceRequired,
        ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto
              .noticeRequired =>
          LegalDocumentAction.noticeRequired,
        ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto
              .noUserActionRequired =>
          LegalDocumentAction.noUserActionRequired,
        ListApplicableConsentDocumentsResponseDocumentsItemEffectiveVersionClassificationDto
              .unknown ||
        null =>
          LegalDocumentAction.unstated,
      },
    );
  }
}
