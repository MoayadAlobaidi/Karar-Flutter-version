// The consent surface, in both reading directions and at the largest text
// scale.
//
// The load-bearing assertions:
//   * the acceptance control exists only when the platform said an acceptance
//     can be recorded — not disabled-but-visible, and not visible while a
//     prerequisite is outstanding;
//   * an accepted state appears only after the platform confirms one;
//   * withdrawal states that the earlier record is preserved;
//   * the unavailable states are explicit and carry only a reference.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/consent/domain/consent_repository.dart';
import 'package:karar_mobile/features/consent/domain/consent_state.dart';
import 'package:karar_mobile/features/consent/domain/legal_document.dart';
import 'package:karar_mobile/features/consent/presentation/consent_providers.dart';
import 'package:karar_mobile/features/consent/presentation/consent_screen.dart';
import 'package:karar_mobile/features/consent/presentation/consent_strings.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import '../platform_bootstrap/support/fixtures.dart';

/// A consent repository whose answers the test scripts.
final class ScriptedConsentRepository implements ConsentRepository {
  ScriptedConsentRepository({
    this.documents = const <LegalDocument>[],
    this.documentsFailure,
    this.status,
    this.statusFailure,
    this.acceptResult,
    this.withdrawResult,
  });

  final List<LegalDocument> documents;
  final Failure? documentsFailure;
  final ConsentStatusRecord? status;
  final Failure? statusFailure;
  Result<ConsentGrant>? acceptResult;
  Result<ConsentWithdrawal>? withdrawResult;

  int accepts = 0;
  int withdrawals = 0;
  String? acceptedVersionId;

  @override
  Future<Result<List<LegalDocument>>> listApplicableDocuments({String? jurisdictionRef}) async {
    final failure = documentsFailure;
    if (failure != null) {
      return Failed<List<LegalDocument>>(failure);
    }
    return Success<List<LegalDocument>>(documents);
  }

  @override
  Future<Result<ConsentStatusRecord>> readStatus({
    required String purposeRef,
    String? jurisdictionRef,
  }) async {
    final failure = statusFailure;
    if (failure != null) {
      return Failed<ConsentStatusRecord>(failure);
    }
    return Success<ConsentStatusRecord>(status ?? consentStatus());
  }

  @override
  Future<Result<ConsentGrant>> accept({
    required String legalDocumentVersionId,
    required String purposeRef,
  }) async {
    accepts++;
    acceptedVersionId = legalDocumentVersionId;
    return acceptResult ??
        Success<ConsentGrant>(
          ConsentGrant(
            grantId: 'grant-1',
            purposeRef: purposeRef,
            acceptedVersion: '1.0.0',
            grantedAt: DateTime.utc(2026, 3),
          ),
        );
  }

  @override
  Future<Result<ConsentWithdrawal>> withdraw({required String grantId}) async {
    withdrawals++;
    return withdrawResult ??
        Success<ConsentWithdrawal>(
          ConsentWithdrawal(grantId: grantId, withdrawnAt: DateTime.utc(2026, 3, 2)),
        );
  }
}

Future<void> pumpConsent(
  WidgetTester tester, {
  required ScriptedConsentRepository repository,
  Locale locale = const Locale('en'),
  double textScale = 1.0,
  ConsentPrerequisites prerequisites = metPrerequisites,
}) =>
    pumpFeatureScreen(
      tester,
      const ConsentScreen(),
      locale: locale,
      textScale: textScale,
      overrides: <Override>[
        consentRepositoryProvider.overrideWithValue(repository),
        consentPrerequisitesProvider.overrideWithValue(prerequisites),
      ],
    );

ConsentStrings mountedStrings(WidgetTester tester) =>
    ConsentStrings.of(tester.element(find.byType(ConsentScreen)));

void main() {
  testInBothDirections(
    'offers the acceptance control when the platform said one can be recorded',
    (WidgetTester tester, Locale locale, double scale) async {
      final repository = ScriptedConsentRepository(
        documents: <LegalDocument>[legalDocument()],
      );

      await pumpConsent(
        tester,
        repository: repository,
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.stateRequired), findsOneWidget);
      expect(find.text(strings.acceptAction), findsOneWidget);
      expect(
        directionUnder(tester, find.byType(ConsentScreen)),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'renders no acceptance control while a prerequisite is outstanding',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(
          documents: <LegalDocument>[legalDocument()],
        ),
        locale: locale,
        textScale: scale,
        prerequisites: const ConsentPrerequisites(
          jurisdictionAssigned: true,
          policyPackApproved: false,
          operatingEntityAssigned: true,
        ),
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.statePolicyNotApproved), findsOneWidget);
      expect(
        find.text(strings.acceptAction),
        findsNothing,
        reason: 'a control that cannot work is not rendered as one that might',
      );
      expect(find.text(strings.blockerPolicy), findsOneWidget);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'says a document is unpublished rather than offering nothing to read',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(
          documents: <LegalDocument>[legalDocument(published: false)],
        ),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.stateDocumentUnavailable), findsOneWidget);
      expect(find.text(strings.acceptAction), findsNothing);
    },
  );

  testInBothDirections(
    'says nothing is being asked when no document applies',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.nothingToAgreeTitle), findsOneWidget);
      expect(find.text(strings.acceptAction), findsNothing);
    },
    textScales: featureTextScales,
  );

  testWidgets('shows no accepted state before the platform confirms one',
      (WidgetTester tester) async {
    final repository = ScriptedConsentRepository(
      documents: <LegalDocument>[legalDocument()],
      acceptResult: const Failed<ConsentGrant>(
        DependencyUnavailableFailure(
          code: 'DEPENDENCY_UNAVAILABLE',
          correlationId: 'req-60',
        ),
      ),
    );

    await pumpConsent(tester, repository: repository);
    final strings = mountedStrings(tester);

    await tester.tap(find.text(strings.acceptAction));
    await tester.pumpAndSettle();

    expect(repository.accepts, 1);
    expect(repository.acceptedVersionId, testVersionId);
    expect(find.text(strings.acceptedConfirmation), findsNothing);
    expect(find.text(strings.actionFailedTitle), findsOneWidget);
    expect(find.textContaining('req-60'), findsOneWidget);
  });

  testWidgets('shows the accepted state only after the platform confirms it',
      (WidgetTester tester) async {
    final repository = ScriptedConsentRepository(
      documents: <LegalDocument>[legalDocument()],
      status: consentStatus(),
    );

    await pumpConsent(tester, repository: repository);
    final strings = mountedStrings(tester);

    await tester.tap(find.text(strings.acceptAction));
    await tester.pumpAndSettle();

    expect(repository.accepts, 1);
    expect(find.text(strings.acceptedConfirmation), findsOneWidget);
  });

  testInBothDirections(
    'offers withdrawal for an in-force grant, and says history is preserved',
    (WidgetTester tester, Locale locale, double scale) async {
      final repository = ScriptedConsentRepository(
        documents: <LegalDocument>[legalDocument()],
        status: consentStatus(
          state: ConsentStatusState.active,
          grantId: 'grant-1',
          grantedVersion: '1.0.0',
        ),
      );

      await pumpConsent(
        tester,
        repository: repository,
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.stateActive), findsOneWidget);
      expect(find.text(strings.withdrawAction), findsOneWidget);
      expect(find.text(strings.acceptAction), findsNothing);

      await tester.tap(find.text(strings.withdrawAction));
      await tester.pumpAndSettle();

      expect(repository.withdrawals, 1);
      expect(find.text(strings.withdrawnConfirmation), findsOneWidget);
      expect(find.text(strings.historyPreservedNote), findsOneWidget);
    },
  );

  testInBothDirections(
    'a re-consent explains that agreeing creates a new record',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(
          documents: <LegalDocument>[legalDocument()],
          status: consentStatus(state: ConsentStatusState.reconsentRequired),
        ),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.stateReconsentRequired), findsOneWidget);
      expect(find.text(strings.reconsentCreatesNewGrantNote), findsOneWidget);
      expect(find.text(strings.acceptAction), findsOneWidget);
    },
  );

  testInBothDirections(
    'an unavailable surface is explicit and carries only a reference',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(
          documentsFailure: const DependencyUnavailableFailure(
            code: 'DEPENDENCY_UNAVAILABLE',
            correlationId: 'req-61',
          ),
        ),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.surfaceUnavailableTitle), findsOneWidget);
      expect(find.textContaining('req-61'), findsOneWidget);
      expect(find.text(strings.acceptAction), findsNothing);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'a purpose whose status could not be read is unavailable on its own',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(
          documents: <LegalDocument>[legalDocument()],
          statusFailure: const DependencyUnavailableFailure(
            code: 'DEPENDENCY_UNAVAILABLE',
          ),
        ),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.stateUnavailable), findsOneWidget);
      expect(find.text(strings.acceptAction), findsNothing);
    },
  );

  testInBothDirections(
    'renders the safe metadata and states that the document itself is not available',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(
          documents: <LegalDocument>[legalDocument()],
        ),
        locale: locale,
        textScale: scale,
      );
      final strings = mountedStrings(tester);

      expect(find.text(strings.versionLabel), findsOneWidget);
      expect(find.text('1.0.0'), findsOneWidget);
      expect(find.text(strings.publishedByLabel), findsOneWidget);
      expect(find.text(testEntityId), findsOneWidget);
      expect(find.text(strings.actionReacceptance), findsOneWidget);
      expect(find.text(testPurposeRef), findsOneWidget);
    },
    textScales: featureTextScales,
  );

  testInBothDirections(
    'renders no monetary value and constructs no legal prose',
    (WidgetTester tester, Locale locale, double scale) async {
      await pumpConsent(
        tester,
        repository: ScriptedConsentRepository(
          documents: <LegalDocument>[legalDocument()],
        ),
        locale: locale,
        textScale: scale,
      );

      expectNothingMatching(
        tester,
        RegExp(r'[€£¥]|\b(QAR|USD|EUR|SAR|AED)\b'),
        because: 'no financial value belongs on the consent surface',
      );
      for (final claim in <String>[
        'hereby',
        'you agree that',
        'Qatar',
        'قطر',
        'PDPL',
        'GDPR',
      ]) {
        expectNothingMatching(
          tester,
          RegExp(claim, caseSensitive: false),
          because: 'legal wording is published by the platform, never composed here',
        );
      }
    },
    textScales: featureTextScales,
  );

  testWidgets('announces progress while the surface loads', (WidgetTester tester) async {
    // A repository that has not answered yet, so the loading state is the one
    // actually on screen rather than a frame that has already resolved.
    await pumpFeatureScreen(
      tester,
      const ConsentScreen(),
      settle: false,
      overrides: <Override>[
        consentRepositoryProvider.overrideWithValue(_PendingConsentRepository()),
        consentPrerequisitesProvider.overrideWithValue(metPrerequisites),
      ],
    );

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}

/// A repository that never answers, so the loading state stays on screen.
final class _PendingConsentRepository implements ConsentRepository {
  final Completer<Never> _never = Completer<Never>();

  @override
  Future<Result<List<LegalDocument>>> listApplicableDocuments({String? jurisdictionRef}) =>
      _never.future;

  @override
  Future<Result<ConsentStatusRecord>> readStatus({
    required String purposeRef,
    String? jurisdictionRef,
  }) =>
      _never.future;

  @override
  Future<Result<ConsentGrant>> accept({
    required String legalDocumentVersionId,
    required String purposeRef,
  }) =>
      _never.future;

  @override
  Future<Result<ConsentWithdrawal>> withdraw({required String grantId}) => _never.future;
}
