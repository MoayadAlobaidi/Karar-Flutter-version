// The consent decision table, and the mapping that feeds it.
//
// Every typed state is reachable and every one is asserted, including the
// three that mean "nothing can be offered here". The rule that matters most is
// `canAccept`: it is true only when the platform's own prerequisites hold, and
// nothing in the client may widen it.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/consent/data/api_consent_repository.dart';
import 'package:karar_mobile/features/consent/domain/consent_repository.dart';
import 'package:karar_mobile/features/consent/domain/consent_state.dart';
import 'package:karar_mobile/features/consent/domain/legal_document.dart';

import '../../core/support/fakes.dart';
import '../platform_bootstrap/support/fixtures.dart';

const ResolveConsentOverview resolve = ResolveConsentOverview();

ConsentOverview overviewFor({
  ConsentStatusState state = ConsentStatusState.noGrant,
  List<LegalDocument>? documents,
  ConsentPrerequisites prerequisites = metPrerequisites,
  bool noticeRequired = false,
  String? grantId,
  String? documentId = testDocumentId,
}) => resolve(
  purposeRef: testPurposeRef,
  status: consentStatus(
    state: state,
    noticeRequired: noticeRequired,
    grantId: grantId,
    documentId: documentId,
  ),
  documents: documents ?? <LegalDocument>[legalDocument()],
  prerequisites: prerequisites,
);

ApiConsentRepository repositoryReturning(Object? body) => ApiConsentRepository(
  KararApiClient(
    FakeApiTransport((ApiRequest request) async => ApiResponse(statusCode: 200, body: body)),
  ),
);

void main() {
  group('the decision table', () {
    test('an in-force grant is ACTIVE and offers withdrawal', () {
      final overview = overviewFor(state: ConsentStatusState.active, grantId: 'grant-1');

      expect(overview.state, ConsentState.active);
      expect(overview.canAccept, isFalse);
      expect(overview.canWithdraw, isTrue);
      expect(overview.grant?.grantId, 'grant-1');
    });

    test('a withdrawal keeps the grant on the overview as history', () {
      final overview = overviewFor(state: ConsentStatusState.withdrawn, grantId: 'grant-1');

      expect(overview.state, ConsentState.withdrawn);
      expect(overview.canAccept, isFalse);
      expect(overview.canWithdraw, isFalse);
      expect(
        overview.grant?.grantId,
        'grant-1',
        reason: 'withdrawal preserves the record rather than erasing it',
      );
    });

    test('no grant against a published version is REQUIRED and can be accepted', () {
      final overview = overviewFor();

      expect(overview.state, ConsentState.consentRequired);
      expect(overview.canAccept, isTrue);
      expect(overview.acceptableVersionId, testVersionId);
      expect(overview.blockers, isEmpty);
    });

    test('a materially changed version is RECONSENT_REQUIRED and can be accepted', () {
      final overview = overviewFor(state: ConsentStatusState.reconsentRequired);

      expect(overview.state, ConsentState.reconsentRequired);
      expect(overview.canAccept, isTrue);
    });

    test('no applicable document at all is NOT_REQUIRED, not a gap', () {
      final overview = overviewFor(documents: const <LegalDocument>[], documentId: null);

      expect(overview.state, ConsentState.notRequired);
      expect(overview.canAccept, isFalse);
      expect(overview.document, isNull);
    });

    test('a document with nothing published is LEGAL_DOCUMENT_UNAVAILABLE', () {
      final overview = overviewFor(documents: <LegalDocument>[legalDocument(published: false)]);

      expect(overview.state, ConsentState.legalDocumentUnavailable);
      expect(overview.canAccept, isFalse);
      expect(overview.acceptableVersionId, isNull);
    });

    test('an unapproved policy is POLICY_NOT_APPROVED, and names why', () {
      final overview = overviewFor(
        prerequisites: const ConsentPrerequisites(
          jurisdictionAssigned: true,
          policyPackApproved: false,
          operatingEntityAssigned: true,
        ),
      );

      expect(overview.state, ConsentState.policyNotApproved);
      expect(overview.canAccept, isFalse);
      expect(overview.blockers, contains(ConsentBlocker.policyPackNotApproved));
    });

    test('no jurisdiction also blocks acceptance, and says which prerequisite failed', () {
      final overview = overviewFor(
        prerequisites: const ConsentPrerequisites(
          jurisdictionAssigned: false,
          policyPackApproved: true,
          operatingEntityAssigned: true,
        ),
      );

      expect(overview.state, ConsentState.policyNotApproved);
      expect(overview.blockers, contains(ConsentBlocker.jurisdictionNotAssigned));
    });

    test('no operating entity blocks acceptance', () {
      final overview = overviewFor(
        prerequisites: const ConsentPrerequisites(
          jurisdictionAssigned: true,
          policyPackApproved: true,
          operatingEntityAssigned: false,
        ),
      );

      expect(overview.state, ConsentState.policyNotApproved);
      expect(overview.blockers, contains(ConsentBlocker.operatingEntityNotAssigned));
    });

    test('a reconsent with unmet prerequisites also refuses to offer a control', () {
      final overview = overviewFor(
        state: ConsentStatusState.reconsentRequired,
        prerequisites: ConsentPrerequisites.none,
      );

      expect(overview.state, ConsentState.policyNotApproved);
      expect(overview.canAccept, isFalse);
    });

    test('a state this build cannot classify is UNAVAILABLE and grants nothing', () {
      final overview = overviewFor(state: ConsentStatusState.unrecognised);

      expect(overview.state, ConsentState.unavailable);
      expect(overview.canAccept, isFalse);
      expect(overview.canWithdraw, isFalse);
    });

    test('a failed read is UNAVAILABLE, carrying only the platform reference', () {
      final overview = resolve.unavailable(
        purposeRef: testPurposeRef,
        failure: const DependencyUnavailableFailure(
          code: 'DEPENDENCY_UNAVAILABLE',
          correlationId: 'req-50',
        ),
      );

      expect(overview.state, ConsentState.unavailable);
      expect(overview.correlationId, 'req-50');
      expect(overview.document, isNull);
      expect(overview.grant, isNull);
      expect(overview.canAccept, isFalse);
    });

    test('a notice alongside an in-force grant does not invalidate it', () {
      final overview = overviewFor(
        state: ConsentStatusState.active,
        grantId: 'grant-1',
        noticeRequired: true,
      );

      expect(overview.state, ConsentState.active);
      expect(overview.noticeRequired, isTrue);
      expect(overview.canWithdraw, isTrue);
    });

    test('the document is matched by the identifier the platform named', () {
      final overview = overviewFor(
        documents: <LegalDocument>[
          legalDocument(purposeRefs: const <String>['purpose:other']),
        ],
      );

      expect(overview.document?.documentId, testDocumentId);
    });

    test('every typed state carries its canonical wire name', () {
      expect(ConsentState.notRequired.wireName, 'NOT_REQUIRED');
      expect(ConsentState.consentRequired.wireName, 'REQUIRED');
      expect(ConsentState.reconsentRequired.wireName, 'RECONSENT_REQUIRED');
      expect(ConsentState.active.wireName, 'ACTIVE');
      expect(ConsentState.withdrawn.wireName, 'WITHDRAWN');
      expect(ConsentState.unavailable.wireName, 'UNAVAILABLE');
      expect(ConsentState.legalDocumentUnavailable.wireName, 'LEGAL_DOCUMENT_UNAVAILABLE');
      expect(ConsentState.policyNotApproved.wireName, 'POLICY_NOT_APPROVED');
    });

    test('nothing is known until the platform says so', () {
      expect(ConsentPrerequisites.none.areMet, isFalse);
      expect(ConsentPrerequisites.none.blockers.length, 3);
    });
  });

  group('the repository', () {
    test('maps every consent status the contract defines', () async {
      Future<ConsentStatusState> stateFor(String wire) async {
        final result = await repositoryReturning(<String, Object?>{
          'state': wire,
          'noticeRequired': false,
          'operatingEntityId': testEntityId,
          'purposeRef': testPurposeRef,
        }).readStatus(purposeRef: testPurposeRef);
        return result.valueOrNull!.state;
      }

      expect(await stateFor('ACTIVE'), ConsentStatusState.active);
      expect(await stateFor('NO_GRANT'), ConsentStatusState.noGrant);
      expect(await stateFor('RECONSENT_REQUIRED'), ConsentStatusState.reconsentRequired);
      expect(await stateFor('WITHDRAWN'), ConsentStatusState.withdrawn);
      expect(await stateFor('SOMETHING_NEWER'), ConsentStatusState.unrecognised);
    });

    // The listing no longer carries `storageRef` at all: the contract dropped
    // it and set `additionalProperties: false`, and the text is now read
    // through `/consent/documents/{documentId}/content`. The locator is kept in
    // this ONE fixture on purpose — a field the contract forbids is exactly
    // what a misbehaving or rolled-back server would send, and the point of the
    // assertion is that the client would still not put it on a screen.
    test('maps a document to its safe metadata and nothing else', () async {
      final result = await repositoryReturning(<String, Object?>{
        'documents': <Object?>[
          <String, Object?>{
            'documentId': testDocumentId,
            'entityId': testEntityId,
            'jurisdictionRef': 'jurisdiction-a',
            'kind': 'LOCAL_SEED_SYNTHETIC_NOTICE',
            'purposeRefs': <Object?>[testPurposeRef],
            'effectiveVersion': <String, Object?>{
              'classification': 'MATERIAL_REACCEPTANCE_REQUIRED',
              'contentHash': 'sha256-abc',
              'effectiveAt': '2026-01-01T00:00:00.000Z',
              'storageRef': 'internal://locator',
              'version': '1.0.0',
              'versionId': testVersionId,
            },
          },
        ],
      }).listApplicableDocuments();

      final document = result.valueOrNull!.single;
      expect(document.kind, 'LOCAL_SEED_SYNTHETIC_NOTICE');
      expect(document.effectiveVersion?.versionId, testVersionId);
      expect(document.effectiveVersion?.action, LegalDocumentAction.reacceptanceRequired);
      // Neither the locator nor the content hash is modelled, so neither can
      // reach a screen — including the locator the contract no longer defines.
      expect(document.toString(), isNot(contains('internal://locator')));
      expect(document.toString(), isNot(contains('sha256-abc')));
    });

    test('an unclassified version says so rather than implying no action', () async {
      final result = await repositoryReturning(<String, Object?>{
        'documents': <Object?>[
          <String, Object?>{
            'documentId': testDocumentId,
            'entityId': testEntityId,
            'jurisdictionRef': 'jurisdiction-a',
            'kind': 'NOTICE',
            'purposeRefs': <Object?>[testPurposeRef],
            'effectiveVersion': <String, Object?>{
              'classification': 'SOMETHING_NEWER',
              'contentHash': 'h',
              'version': '1.0.0',
              'versionId': testVersionId,
            },
          },
        ],
      }).listApplicableDocuments();

      expect(result.valueOrNull!.single.effectiveVersion?.action, LegalDocumentAction.unstated);
    });

    test('a document with no published version has nothing to accept', () async {
      final result = await repositoryReturning(<String, Object?>{
        'documents': <Object?>[
          <String, Object?>{
            'documentId': testDocumentId,
            'entityId': testEntityId,
            'jurisdictionRef': 'jurisdiction-a',
            'kind': 'NOTICE',
            'purposeRefs': <Object?>[testPurposeRef],
          },
        ],
      }).listApplicableDocuments();

      expect(result.valueOrNull!.single.hasEffectiveVersion, isFalse);
    });

    test('an acceptance is a grant only when the platform says ACTIVE', () async {
      final accepted = await repositoryReturning(<String, Object?>{
        'consentVersion': '1.0.0',
        'grantId': 'grant-1',
        'grantedAt': '2026-03-01T00:00:00.000Z',
        'jurisdictionRef': 'jurisdiction-a',
        'legalDocumentVersionId': testVersionId,
        'operatingEntityId': testEntityId,
        'purposeRef': testPurposeRef,
        'status': 'ACTIVE',
      }).accept(legalDocumentVersionId: testVersionId, purposeRef: testPurposeRef);

      expect(accepted.valueOrNull?.grantId, 'grant-1');
      expect(accepted.valueOrNull?.acceptedVersion, '1.0.0');

      final unclassified = await repositoryReturning(<String, Object?>{
        'consentVersion': '1.0.0',
        'grantId': 'grant-1',
        'grantedAt': '2026-03-01T00:00:00.000Z',
        'jurisdictionRef': 'jurisdiction-a',
        'legalDocumentVersionId': testVersionId,
        'operatingEntityId': testEntityId,
        'purposeRef': testPurposeRef,
        'status': 'SOMETHING_NEWER',
      }).accept(legalDocumentVersionId: testVersionId, purposeRef: testPurposeRef);

      expect(
        unclassified.failureOrNull,
        isA<ContractViolationFailure>(),
        reason: 'a status the client cannot read must not be reported as a grant',
      );
    });

    test('a withdrawal is recorded only when the platform says WITHDRAWN', () async {
      final withdrawn = await repositoryReturning(<String, Object?>{
        'grantId': 'grant-1',
        'status': 'WITHDRAWN',
        'withdrawnAt': '2026-03-02T00:00:00.000Z',
      }).withdraw(grantId: 'grant-1');

      expect(withdrawn.valueOrNull?.grantId, 'grant-1');

      final unclassified = await repositoryReturning(<String, Object?>{
        'grantId': 'grant-1',
        'status': 'SOMETHING_NEWER',
        'withdrawnAt': '2026-03-02T00:00:00.000Z',
      }).withdraw(grantId: 'grant-1');

      expect(unclassified.failureOrNull, isA<ContractViolationFailure>());
    });

    test('a malformed payload becomes a typed contract violation', () async {
      final result = await repositoryReturning(<String, Object?>{'state': 'ACTIVE'})
          .readStatus(purposeRef: testPurposeRef);

      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });

    test('the acceptance request carries the version and the purpose, and no evidence', () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async => ApiResponse(
          statusCode: 200,
          body: <String, Object?>{
            'consentVersion': '1.0.0',
            'grantId': 'grant-1',
            'grantedAt': '2026-03-01T00:00:00.000Z',
            'jurisdictionRef': 'jurisdiction-a',
            'legalDocumentVersionId': testVersionId,
            'operatingEntityId': testEntityId,
            'purposeRef': testPurposeRef,
            'status': 'ACTIVE',
          },
        ),
      );

      await ApiConsentRepository(KararApiClient(transport))
          .accept(legalDocumentVersionId: testVersionId, purposeRef: testPurposeRef);

      final request = transport.requests.single;
      expect(request.path, '/consent/acceptances');
      expect(request.method.wireName, 'POST');
      final body = request.body! as Map<String, Object?>;
      expect(body.keys.toSet(), <String>{
        'legalDocumentVersionId',
        'purposeRef',
      }, reason: 'the evidence reference is derived server-side, never supplied');
    });
  });
}
