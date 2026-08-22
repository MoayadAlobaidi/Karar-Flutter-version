// Jurisdiction status, and the self-declaration that records but verifies
// nothing.
//
// The rule under test is that a successful declaration can never be read as a
// verification: the platform states the resulting state as a field, and this
// client keeps it as a field rather than collapsing it into a boolean that
// would quietly become "verified" the first time someone refactored it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/platform_bootstrap/data/api_jurisdiction_repository.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/jurisdiction_declaration.dart';
import 'package:karar_mobile/features/platform_bootstrap/domain/platform_context.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/jurisdiction_screen.dart';
import 'package:karar_mobile/features/platform_bootstrap/presentation/platform_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../../core/support/fakes.dart';
import 'support/feature_harness.dart';
import 'support/fixtures.dart';

Map<String, Object?> declarationBody({
  bool recorded = true,
  String source = 'USER_DECLARED',
  String state = 'UNVERIFIED',
}) =>
    <String, Object?>{
      'effectiveFrom': '2026-01-01T00:00:00.000Z',
      'jurisdictionId': 'jurisdiction-a',
      'recorded': recorded,
      'source': source,
      'state': state,
    };

ApiJurisdictionRepository repositoryReturning(Object? body, {int statusCode = 200}) =>
    ApiJurisdictionRepository(
      KararApiClient(
        FakeApiTransport(
          (ApiRequest request) async => ApiResponse(statusCode: statusCode, body: body),
        ),
      ),
    );

/// A repository whose answer the test scripts.
final class ScriptedJurisdictionRepository implements JurisdictionRepository {
  ScriptedJurisdictionRepository(this._answer);

  final Result<JurisdictionDeclaration> _answer;

  int calls = 0;
  JurisdictionReference? lastReference;

  @override
  Future<Result<JurisdictionDeclaration>> declareOwn(JurisdictionReference reference) async {
    calls++;
    lastReference = reference;
    return _answer;
  }
}

JurisdictionDeclaration declaration({bool recorded = true}) => JurisdictionDeclaration(
      jurisdictionId: 'jurisdiction-a',
      recorded: recorded,
      source: JurisdictionDeclarationSource.userDeclared,
      verification: JurisdictionDeclarationVerification.unverified,
      effectiveFrom: DateTime.utc(2026),
    );

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(JurisdictionScreen)));

void main() {
  group('the repository', () {
    test('maps a recorded declaration and keeps it unverified', () async {
      final result = await repositoryReturning(declarationBody()).declareOwn(
        const JurisdictionReference(id: 'jurisdiction-a'),
      );

      final value = result.valueOrNull;
      expect(value, isNotNull);
      expect(value!.recorded, isTrue);
      expect(value.source, JurisdictionDeclarationSource.userDeclared);
      expect(value.verification, JurisdictionDeclarationVerification.unverified);
      expect(value.isVerified, isFalse);
    });

    test('reports a re-declaration as not recorded rather than as a change', () async {
      final result = await repositoryReturning(declarationBody(recorded: false))
          .declareOwn(const JurisdictionReference(id: 'jurisdiction-a'));

      expect(result.valueOrNull?.recorded, isFalse);
    });

    test('an unrecognised source or state is unrecognised, never verified', () async {
      final result = await repositoryReturning(
        declarationBody(source: 'SOMETHING_NEWER', state: 'SOMETHING_NEWER'),
      ).declareOwn(const JurisdictionReference(id: 'jurisdiction-a'));

      final value = result.valueOrNull!;
      expect(value.source, JurisdictionDeclarationSource.unrecognised);
      expect(value.verification, JurisdictionDeclarationVerification.unrecognised);
      expect(value.isVerified, isFalse);
    });

    test('a malformed payload becomes a typed contract violation', () async {
      final body = declarationBody()..remove('jurisdictionId');
      final result = await repositoryReturning(body).declareOwn(
        const JurisdictionReference(id: 'jurisdiction-a'),
      );

      expect(result.failureOrNull, isA<ContractViolationFailure>());
    });

    test('sends the documented request', () async {
      final transport = FakeApiTransport(
        (ApiRequest request) async =>
            ApiResponse(statusCode: 200, body: declarationBody()),
      );
      await ApiJurisdictionRepository(KararApiClient(transport))
          .declareOwn(const JurisdictionReference(id: 'jurisdiction-a'));

      final request = transport.requests.single;
      expect(request.path, '/jurisdiction/self-declaration');
      expect(request.method.wireName, 'POST');
      expect(request.requiresAuthentication, isTrue);
    });
  });

  group('the screen', () {
    testInBothDirections(
      'renders the status and its direction',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const JurisdictionScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(platformContext()),
          ],
        );
        final l10n = mountedL10n(tester);

        expect(find.text(l10n.platformJurisdictionVerified), findsOneWidget);
        expect(find.text('jurisdiction-a'), findsOneWidget);
        expect(
          directionUnder(tester, find.byType(JurisdictionScreen)),
          locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        );
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'names an unassigned jurisdiction rather than leaving it blank',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const JurisdictionScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(
              platformContext(
                jurisdiction: const JurisdictionStatus(
                  state: PlatformJurisdictionState.none,
                ),
              ),
            ),
          ],
        );
        final l10n = mountedL10n(tester);

        expect(find.text(l10n.platformJurisdictionNone), findsOneWidget);
      },
    );

    testInBothDirections(
      'offers no control when the platform supplied no selectable references',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const JurisdictionScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(platformContext()),
          ],
        );
        final l10n = mountedL10n(tester);

        expect(find.text(l10n.platformJurisdictionSelectionUnavailable), findsOneWidget);
        expect(find.text(l10n.platformJurisdictionDeclareAction), findsNothing);
        expect(
          find.byType(TextField),
          findsNothing,
          reason: 'a free-text field would invite an identifier the register may not hold',
        );
      },
      textScales: featureTextScales,
    );

    testInBothDirections(
      'records a declaration only after the platform confirms it',
      (WidgetTester tester, Locale locale, double scale) async {
        final repository = ScriptedJurisdictionRepository(
          Success<JurisdictionDeclaration>(declaration()),
        );

        await pumpFeatureScreen(
          tester,
          const JurisdictionScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(platformContext()),
            jurisdictionRepositoryProvider.overrideWithValue(repository),
            jurisdictionReferenceOptionsProvider.overrideWithValue(
              const <JurisdictionReference>[JurisdictionReference(id: 'jurisdiction-a')],
            ),
          ],
        );
        final l10n = mountedL10n(tester);

        expect(find.text(l10n.platformJurisdictionRecorded), findsNothing);

        await tester.tap(find.byType(KararCheckboxTile));
        await tester.pumpAndSettle();
        await tester.tap(find.text(l10n.platformJurisdictionDeclareAction));
        await tester.pumpAndSettle();

        expect(repository.calls, 1);
        expect(repository.lastReference?.id, 'jurisdiction-a');
        expect(find.text(l10n.platformJurisdictionRecorded), findsOneWidget);
        expect(find.text(l10n.platformJurisdictionRemainsUnverified), findsOneWidget);
      },
    );

    testInBothDirections(
      'says nothing changed when the jurisdiction was already in effect',
      (WidgetTester tester, Locale locale, double scale) async {
        final repository = ScriptedJurisdictionRepository(
          Success<JurisdictionDeclaration>(declaration(recorded: false)),
        );

        await pumpFeatureScreen(
          tester,
          const JurisdictionScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(platformContext()),
            jurisdictionRepositoryProvider.overrideWithValue(repository),
            jurisdictionReferenceOptionsProvider.overrideWithValue(
              const <JurisdictionReference>[JurisdictionReference(id: 'jurisdiction-a')],
            ),
          ],
        );
        final l10n = mountedL10n(tester);

        await tester.tap(find.byType(KararCheckboxTile));
        await tester.pumpAndSettle();
        await tester.tap(find.text(l10n.platformJurisdictionDeclareAction));
        await tester.pumpAndSettle();

        expect(find.text(l10n.platformJurisdictionAlreadyInEffect), findsOneWidget);
        expect(find.text(l10n.platformJurisdictionRecorded), findsNothing);
      },
    );

    testInBothDirections(
      'shows only the platform reference when a declaration fails',
      (WidgetTester tester, Locale locale, double scale) async {
        final repository = ScriptedJurisdictionRepository(
          const Failed<JurisdictionDeclaration>(
            DependencyUnavailableFailure(
              code: 'JURISDICTION_DECLARATION_UNAVAILABLE',
              correlationId: 'req-77',
            ),
          ),
        );

        await pumpFeatureScreen(
          tester,
          const JurisdictionScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(platformContext()),
            jurisdictionRepositoryProvider.overrideWithValue(repository),
            jurisdictionReferenceOptionsProvider.overrideWithValue(
              const <JurisdictionReference>[JurisdictionReference(id: 'jurisdiction-a')],
            ),
          ],
        );
        final l10n = mountedL10n(tester);

        await tester.tap(find.byType(KararCheckboxTile));
        await tester.pumpAndSettle();
        await tester.tap(find.text(l10n.platformJurisdictionDeclareAction));
        await tester.pumpAndSettle();

        expect(find.textContaining('req-77'), findsOneWidget);
        expect(find.text(l10n.platformJurisdictionRecorded), findsNothing);
      },
    );

    testInBothDirections(
      'encodes no jurisdiction rules and no monetary value',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const JurisdictionScreen(),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            platformContextProvider.overrideWithValue(platformContext()),
          ],
        );

        for (final claim in <String>['Qatar', 'قطر', 'QFC', 'QFCRA', 'PDPL']) {
          expectNothingMatching(
            tester,
            RegExp(claim, caseSensitive: false),
            because: 'no jurisdiction is named or its rules encoded in the client',
          );
        }
        expectNothingMatching(
          tester,
          RegExp(r'[\$€£¥]'),
          because: 'no financial value belongs on the jurisdiction surface',
        );
      },
    );
  });
}
