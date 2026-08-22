// The tenancy screens, in both reading directions and at the largest text
// scale.
//
// The load-bearing assertion is negative: there is no way to originate a
// tenant identifier from this surface. No text field takes one, no route
// parameter supplies one, and every row carries an identifier the platform
// itself listed.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart' show BootstrapSnapshot;
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/problem_details.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/features/tenant_selection/domain/invitation_redemption.dart';
import 'package:karar_mobile/features/tenant_selection/domain/tenant_binding.dart';
import 'package:karar_mobile/features/tenant_selection/presentation/organisation_screen.dart';
import 'package:karar_mobile/features/tenant_selection/presentation/tenant_providers.dart';
import 'package:karar_mobile/features/tenant_selection/presentation/tenant_selection_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../../core/support/fakes.dart';
import '../platform_bootstrap/support/feature_harness.dart';
import '../platform_bootstrap/support/fixtures.dart';

/// A binding repository whose answer the test scripts.
final class ScriptedBindingRepository implements TenantBindingRepository {
  ScriptedBindingRepository(this._answer);

  final Result<TenantBindingOutcome> _answer;

  final List<String> boundTenantIds = <String>[];

  @override
  Future<Result<TenantBindingOutcome>> bind(String tenantId) async {
    boundTenantIds.add(tenantId);
    return _answer;
  }
}

/// An invitation repository whose answer the test scripts.
final class ScriptedInvitationRepository implements TenantInvitationRepository {
  ScriptedInvitationRepository(this._answer);

  final Result<RedeemedMembership> _answer;

  final List<String> tokens = <String>[];

  @override
  Future<Result<RedeemedMembership>> redeem(InvitationToken token) async {
    tokens.add(token.value);
    return _answer;
  }
}

/// A coordinator wired to in-memory doubles, holding a live credential, so
/// `onTenantSelected` really reaches the bootstrap step instead of stopping at
/// "no session".
Future<({FakeBootstrapGateway gateway, List<Override> overrides})> coordinatorHarness() async {
  final store = InMemoryTokenStore();
  final sessions = SessionManager(store: store, logger: AppLogger.silent);
  await sessions.adopt(liveTokens());
  final gateway = FakeBootstrapGateway(<Result<BootstrapSnapshot>>[
    Success<BootstrapSnapshot>(readySnapshot()),
  ]);
  final coordinator = buildTestCoordinator(sessionManager: sessions, gateway: gateway);
  addTearDown(coordinator.dispose);
  addTearDown(sessions.dispose);
  return (
    gateway: gateway,
    overrides: <Override>[startupCoordinatorProvider.overrideWithValue(coordinator)],
  );
}

AppLocalizations selectionStrings(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(TenantSelectionScreen)));

AppLocalizations organisationStrings(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(OrganisationScreen)));

void main() {
  group('the selection gate', () {
    testInBothDirections('lists only the memberships the platform returned', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFeatureScreen(
        tester,
        const TenantSelectionScreen(choices: twoTenantChoices),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          tenantBindingRepositoryProvider.overrideWithValue(
            ScriptedBindingRepository(
              Success<TenantBindingOutcome>(TenantBound(twoTenantChoices.first)),
            ),
          ),
          ...(await coordinatorHarness()).overrides,
        ],
      );

      expect(find.text('First Organisation'), findsOneWidget);
      expect(find.text('Second Organisation'), findsOneWidget);
      expect(
        find.byType(TextField),
        findsNothing,
        reason: 'no field may originate a tenant identifier',
      );
      expect(
        directionUnder(tester, find.byType(TenantSelectionScreen)),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
    }, textScales: featureTextScales);

    testInBothDirections('binds only an identifier the platform listed', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      final repository = ScriptedBindingRepository(
        Success<TenantBindingOutcome>(TenantBound(twoTenantChoices.last)),
      );

      await pumpFeatureScreen(
        tester,
        const TenantSelectionScreen(choices: twoTenantChoices),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          tenantBindingRepositoryProvider.overrideWithValue(repository),
          ...(await coordinatorHarness()).overrides,
        ],
      );

      await tester.tap(find.text('Second Organisation'));
      await tester.pumpAndSettle();

      expect(repository.boundTenantIds, <String>['tenant-0002']);
    });

    testWidgets('binds a single membership without asking', (WidgetTester tester) async {
      final repository = ScriptedBindingRepository(
        Success<TenantBindingOutcome>(TenantBound(twoTenantChoices.first)),
      );
      final harness = await coordinatorHarness();

      // The single-membership case renders a perpetual progress indicator
      // while it binds, so the tree never settles; pump frames instead.
      await pumpFeatureScreen(
        tester,
        TenantSelectionScreen(choices: <TenantChoice>[twoTenantChoices.first]),
        settle: false,
        overrides: <Override>[
          tenantBindingRepositoryProvider.overrideWithValue(repository),
          ...harness.overrides,
        ],
      );
      for (var frame = 0; frame < 5; frame++) {
        await tester.pump(const Duration(milliseconds: 10));
      }

      expect(repository.boundTenantIds, <String>['tenant-0001']);
      expect(
        harness.gateway.callCount,
        greaterThan(0),
        reason: 'the coordinator re-reads bootstrap after the bind',
      );
    });

    testInBothDirections(
      'shows an honest no-membership state with an invitation as its one action',
      (WidgetTester tester, Locale locale, double scale) async {
        await pumpFeatureScreen(
          tester,
          const TenantSelectionScreen(choices: <TenantChoice>[]),
          locale: locale,
          textScale: scale,
          overrides: <Override>[
            tenantInvitationRepositoryProvider.overrideWithValue(
              ScriptedInvitationRepository(
                const Success<RedeemedMembership>(
                  RedeemedMembership(tenantId: 'tenant-0003', membershipId: 'm-1'),
                ),
              ),
            ),
            ...(await coordinatorHarness()).overrides,
          ],
        );
        final l10n = selectionStrings(tester);

        expect(find.text(l10n.tenantNoMembershipTitle), findsOneWidget);
        expect(find.text(l10n.tenantNoMembershipDescription), findsOneWidget);
        expect(find.text(l10n.tenantInvitationHeading), findsOneWidget);
        expect(find.text('First Organisation'), findsNothing);
      },
      textScales: featureTextScales,
    );

    testWidgets('redeems the code the invitee entered, and nothing else', (
      WidgetTester tester,
    ) async {
      final repository = ScriptedInvitationRepository(
        const Success<RedeemedMembership>(
          RedeemedMembership(tenantId: 'tenant-0003', membershipId: 'm-1'),
        ),
      );
      final harness = await coordinatorHarness();

      await pumpFeatureScreen(
        tester,
        const TenantSelectionScreen(choices: <TenantChoice>[]),
        overrides: <Override>[
          tenantInvitationRepositoryProvider.overrideWithValue(repository),
          ...harness.overrides,
        ],
      );
      final l10n = selectionStrings(tester);

      await tester.enterText(find.byType(TextField), 'invitation-code');
      await tester.tap(find.text(l10n.tenantInvitationAction));
      await tester.pumpAndSettle();

      expect(repository.tokens, <String>['invitation-code']);
      expect(find.text(l10n.tenantInvitationRedeemed), findsOneWidget);
      expect(harness.gateway.callCount, greaterThan(0));
    });

    testWidgets('a blank code is not sent', (WidgetTester tester) async {
      final repository = ScriptedInvitationRepository(
        const Success<RedeemedMembership>(
          RedeemedMembership(tenantId: 'tenant-0003', membershipId: 'm-1'),
        ),
      );

      await pumpFeatureScreen(
        tester,
        const TenantSelectionScreen(choices: <TenantChoice>[]),
        overrides: <Override>[
          tenantInvitationRepositoryProvider.overrideWithValue(repository),
          ...(await coordinatorHarness()).overrides,
        ],
      );
      final l10n = selectionStrings(tester);

      await tester.tap(find.text(l10n.tenantInvitationAction));
      await tester.pumpAndSettle();

      expect(repository.tokens, isEmpty);
    });

    testInBothDirections('a refused selection says nothing changed', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFeatureScreen(
        tester,
        const TenantSelectionScreen(choices: twoTenantChoices),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          tenantBindingRepositoryProvider.overrideWithValue(
            ScriptedBindingRepository(
              const Failed<TenantBindingOutcome>(
                NotAuthorizedFailure(code: ApiErrorCode.membershipRequired),
              ),
            ),
          ),
          ...(await coordinatorHarness()).overrides,
        ],
      );
      final l10n = selectionStrings(tester);

      await tester.tap(find.text('Second Organisation'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.tenantMembershipRefusedTitle), findsOneWidget);
    });

    testInBothDirections('a concurrent membership change explains that the session ended', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFeatureScreen(
        tester,
        const TenantSelectionScreen(choices: twoTenantChoices),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          tenantBindingRepositoryProvider.overrideWithValue(
            ScriptedBindingRepository(
              const Failed<TenantBindingOutcome>(
                ConflictFailure(code: ApiErrorCode.membershipRevokedConcurrently),
              ),
            ),
          ),
          ...(await coordinatorHarness()).overrides,
        ],
      );
      final l10n = selectionStrings(tester);

      await tester.tap(find.text('Second Organisation'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.tenantMembershipChangedTitle), findsOneWidget);
    });
  });

  group('the organisation surface', () {
    testInBothDirections('shows the bound organisation and no way to type another', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFeatureScreen(
        tester,
        const OrganisationScreen(),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          tenantBindingViewProvider.overrideWithValue(
            TenantBindingView(current: twoTenantChoices.first),
          ),
          ...(await coordinatorHarness()).overrides,
        ],
      );
      final l10n = organisationStrings(tester);

      expect(find.text('First Organisation'), findsOneWidget);
      expect(find.text(l10n.tenantCurrentOrganisationLabel), findsOneWidget);
      expect(find.text(l10n.tenantNoAlternativesTitle), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(
        directionUnder(tester, find.byType(OrganisationScreen)),
        locale.languageCode == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      );
    }, textScales: featureTextScales);

    testInBothDirections('names the unbound state rather than showing an empty organisation', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFeatureScreen(
        tester,
        const OrganisationScreen(),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          tenantBindingViewProvider.overrideWithValue(const TenantBindingView()),
          ...(await coordinatorHarness()).overrides,
        ],
      );
      final l10n = organisationStrings(tester);

      expect(find.text(l10n.tenantUnboundTitle), findsOneWidget);
    });

    testWidgets('a switch discards tenant-scoped state and re-reads bootstrap', (
      WidgetTester tester,
    ) async {
      final repository = ScriptedBindingRepository(
        Success<TenantBindingOutcome>(
          TenantSwitched(tenant: twoTenantChoices.last, sessionId: 'session-0002'),
        ),
      );
      final scopedState = _RecordingScopedState();
      final harness = await coordinatorHarness();

      await pumpFeatureScreen(
        tester,
        const OrganisationScreen(),
        overrides: <Override>[
          tenantBindingViewProvider.overrideWithValue(
            TenantBindingView(
              current: twoTenantChoices.first,
              alternatives: <TenantChoice>[twoTenantChoices.last],
            ),
          ),
          tenantBindingRepositoryProvider.overrideWithValue(repository),
          tenantScopedStateProvider.overrideWithValue(scopedState),
          ...harness.overrides,
        ],
      );
      final l10n = organisationStrings(tester);

      await tester.tap(find.text('Second Organisation'));
      await tester.pumpAndSettle();

      expect(scopedState.discards, 1);
      expect(repository.boundTenantIds, <String>['tenant-0002']);
      expect(harness.gateway.callCount, greaterThan(0));
      expect(find.text(l10n.tenantSwitchedConfirmation), findsOneWidget);
    });

    testInBothDirections('renders no monetary value', (
      WidgetTester tester,
      Locale locale,
      double scale,
    ) async {
      await pumpFeatureScreen(
        tester,
        const OrganisationScreen(),
        locale: locale,
        textScale: scale,
        overrides: <Override>[
          tenantBindingViewProvider.overrideWithValue(
            TenantBindingView(current: twoTenantChoices.first),
          ),
          ...(await coordinatorHarness()).overrides,
        ],
      );

      expectNothingMatching(
        tester,
        RegExp(r'[€£¥]|\b(QAR|USD|EUR|SAR|AED)\b'),
        because: 'no financial value belongs on the organisation surface',
      );
    });

    testWidgets('shows progress rather than an error before the binding arrives', (
      WidgetTester tester,
    ) async {
      await pumpFeatureScreen(
        tester,
        const OrganisationScreen(),
        settle: false,
        overrides: <Override>[
          tenantBindingViewProvider.overrideWithValue(null),
          ...(await coordinatorHarness()).overrides,
        ],
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}

final class _RecordingScopedState implements TenantScopedState {
  int discards = 0;

  @override
  Future<void> discard() async {
    discards++;
  }
}
