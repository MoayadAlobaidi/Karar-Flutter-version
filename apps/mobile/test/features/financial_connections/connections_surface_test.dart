// THE SURFACE, ON SCREEN, IN BOTH DIRECTIONS.
//
// Four properties are proved here rather than argued for:
//
//   1. NO UNIMPLEMENTED RAIL RENDERS AN AFFORDANCE. The whole section that
//      names the eleven rails this platform never built is asserted, over the
//      REAL TREE, to contain no button, no tappable region, no editable text
//      and no disabled control. A disabled control is still a promise; this
//      asserts there is not even one of those.
//
//   2. NO CREDENTIAL FIELD EXISTS ANYWHERE ON THE SURFACE. There is no
//      `EditableText` in the tree at all, in either language, in the loaded,
//      empty, expanded and failed states.
//
//   3. A DISHONEST RESPONSE CHANGES NOTHING. A connection whose rail is a bank
//      interface and whose availability claims EXECUTABLE — the exact shape the
//      repository refuses — is rendered directly into the screen here, past the
//      repository, and the screen STILL says the rail was never built and still
//      offers nothing. The honesty is in the derivation, not only in the guard.
//
//   4. ARABIC IS FIRST-CLASS. The tree is RTL because the LOCALE is Arabic —
//      the direction is derived by the framework rather than passed in, which
//      is the only way a test proves the application produces it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connection.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connections_repository.dart';
import 'package:karar_mobile/features/financial_connections/domain/rail_standing.dart';
import 'package:karar_mobile/features/financial_connections/presentation/connection_labels.dart';
import 'package:karar_mobile/features/financial_connections/presentation/connections_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../financial_accounts/support/financial_harness.dart';
import '../platform_bootstrap/support/feature_harness.dart';
import 'support/financial_connections_harness.dart';

/// Tall enough for the introduction, the connections, the accounts and both
/// rail sections at the text scale each test asks for. A lazy list only builds
/// what fits, and a control below the fold would be absent from the tree —
/// which would make an assertion that it is missing pass for the wrong reason.
const Size tallSurface = Size(1200, 14000);

/// Widget types that offer a person something to do. If one of these appears
/// beside a rail that does not exist, the screen is making a promise.
bool isInteractive(Widget widget) =>
    widget is KararButton ||
    widget is ButtonStyleButton ||
    widget is InkWell ||
    widget is InkResponse ||
    widget is GestureDetector ||
    widget is EditableText ||
    widget is Switch ||
    widget is Checkbox ||
    widget is Radio<Object?>;

List<String> renderedStrings(WidgetTester tester) => <String>[
      for (final widget in tester.allWidgets)
        if (widget is Text && widget.data != null) widget.data!,
    ];

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(DataSourcesScreen)));

Future<ScriptedFinancialConnectionsRepository> pumpSurface(
  WidgetTester tester, {
  List<FinancialConnection>? held,
  ScriptedFinancialConnectionsRepository? repository,
  ScriptedAccountsRepository? accounts,
  Locale locale = KararLocalization.english,
  double textScale = 1.0,
}) async {
  final scripted = repository ??
      ScriptedFinancialConnectionsRepository(
        connections: held ?? <FinancialConnection>[connectionFixture()],
      );
  await pumpFeatureScreen(
    tester,
    const DataSourcesScreen(),
    overrides: financialConnectionOverrides(
      connections: scripted,
      accounts: accounts,
    ),
    locale: locale,
    textScale: textScale,
    surfaceSize: tallSurface,
  );
  return scripted;
}

void main() {
  group('no unimplemented rail offers anything', () {
    testWidgets('the whole unbuilt-rail section contains no interactive widget',
        (WidgetTester tester) async {
      await pumpSurface(tester);

      final section = find.byKey(unbuiltRailsSectionKey);
      expect(section, findsOneWidget);

      final offenders = <String>[
        for (final element in find
            .descendant(of: section, matching: find.byWidgetPredicate(isInteractive))
            .evaluate())
          element.widget.runtimeType.toString(),
      ];
      expect(
        offenders,
        isEmpty,
        reason: 'an affordance beside a rail that does not exist is a promise '
            'nobody made. A DISABLED control is one too — it says "later". '
            'Found: ${offenders.join(', ')}',
      );
    });

    testWidgets('every rail this platform never built is named and refused',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      final l10n = mountedL10n(tester);

      final unbuilt = <ConnectionRail>[
        for (final rail in declaredRails())
          if (!standingIsSuppliedBySubject(standingOfRail(rail))) rail,
      ];
      expect(unbuilt, hasLength(11));
      for (final rail in unbuilt) {
        expect(
          find.text(connectionRailLabel(rail, l10n)),
          findsOneWidget,
          reason: '$rail must be NAMED: a person cannot check a claim about '
              'something the product will not mention',
        );
      }
      // One sentence, said once per rail, and it is the never-built one.
      expect(
        find.text(l10n.railStandingNotBuilt),
        findsNWidgets(unbuilt.length),
      );
      expect(find.text(l10n.dataSourcesRailsExplanation), findsOneWidget);
    });

    testWidgets('the two rails that exist are named as things YOU do',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      final l10n = mountedL10n(tester);

      final section = find.byKey(builtRailsSectionKey);
      expect(
        find.descendant(
          of: section,
          matching: find.text(connectionRailLabel(ConnectionRail.manual, l10n)),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: section,
          matching:
              find.text(connectionRailLabel(ConnectionRail.userFileUpload, l10n)),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(of: section, matching: find.text(l10n.railStandingNotBuilt)),
        findsNothing,
      );
    });
  });

  group('a response that claims a capability changes nothing on screen', () {
    testWidgets('a bank interface claiming EXECUTABLE still reads as not built',
        (WidgetTester tester) async {
      // Past the repository on purpose. The repository refuses this response;
      // this asserts the SCREEN would not be fooled even if it did not.
      await pumpSurface(
        tester,
        held: <FinancialConnection>[
          connectionFixture(
            rail: ConnectionRail.directBankOrWalletApi,
            availability: RailAvailability.executable,
            status: ConnectionStatus.active,
            displayLabel: 'My bank',
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      // Eleven never-built sentences come from the rail catalogue below. The
      // TWELFTH is this connection card: the screen derived the standing from
      // the RAIL and ignored the availability claim entirely. A screen that
      // trusted `availability` would render eleven, not twelve.
      expect(
        find.text(l10n.railStandingNotBuilt),
        findsNWidgets(12),
        reason: 'the standing is derived from the RAIL, so an availability '
            'field cannot grant a capability',
      );
      expect(find.text('My bank'), findsOneWidget);
      expect(
        find.text(connectionRailLabel(ConnectionRail.directBankOrWalletApi, l10n)),
        findsNWidgets(2),
        reason: 'once on the connection card, once in the rail catalogue',
      );
    });
  });

  group('the three unavailable reasons stay three', () {
    testWidgets('each connection states its own reason, and no two share one',
        (WidgetTester tester) async {
      await pumpSurface(
        tester,
        held: <FinancialConnection>[
          connectionFixture(
            connectionId: 'connection-not-configured',
            rail: ConnectionRail.manual,
            status: ConnectionStatus.notConfigured,
            displayLabel: 'Not set up',
          ),
          connectionFixture(
            connectionId: 'connection-unavailable',
            rail: ConnectionRail.manual,
            status: ConnectionStatus.unavailable,
            displayLabel: 'Off right now',
          ),
          connectionFixture(
            connectionId: 'connection-not-implemented',
            rail: ConnectionRail.pdfStatement,
            availability: RailAvailability.notImplemented,
            status: ConnectionStatus.notImplemented,
            displayLabel: 'Never built',
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(
        find.text(connectionStatusLabel(ConnectionStatus.notConfigured, l10n)),
        findsOneWidget,
      );
      expect(
        find.text(connectionStatusLabel(ConnectionStatus.unavailable, l10n)),
        findsOneWidget,
      );
      expect(
        find.text(connectionStatusLabel(ConnectionStatus.notImplemented, l10n)),
        findsWidgets,
      );
    });
  });

  group('no credential field exists', () {
    testWidgets('there is no editable text anywhere, in any state',
        (WidgetTester tester) async {
      for (final held in <List<FinancialConnection>>[
        <FinancialConnection>[connectionFixture()],
        const <FinancialConnection>[],
      ]) {
        await pumpSurface(tester, held: held);
        expect(
          find.byType(EditableText),
          findsNothing,
          reason: 'no field of any kind belongs on this surface, and a '
              'credential field belongs nowhere in this product',
        );
        expect(find.byType(KararTextField), findsNothing);
      }
    });

    testWidgets('there is none once a connection is opened either',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      await tester.tap(find.text(mountedL10n(tester).connectionShowDetailAction));
      await tester.pumpAndSettle();

      expect(find.byType(EditableText), findsNothing);
      expect(find.byType(KararTextField), findsNothing);
    });

    testWidgets('there is none when the listing failed', (WidgetTester tester) async {
      await pumpSurface(
        tester,
        repository: ScriptedFinancialConnectionsRepository(
          listFailure: const DependencyUnavailableFailure(),
        ),
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.dataSourcesUnavailableTitle), findsOneWidget);
      expect(find.byType(EditableText), findsNothing);
      // The refusal must not become an invitation to set something up.
      expect(find.text(l10n.railStandingNotBuilt), findsWidgets);
    });
  });

  group('no date on this screen is a freshness claim', () {
    testWidgets('the record-changed date carries the sentence that limits it',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      await tester.tap(find.text(mountedL10n(tester).connectionShowDetailAction));
      await tester.pumpAndSettle();
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.connectionRecordChangedLabel), findsOneWidget);
      expect(find.text(l10n.connectionRecordChangedNote), findsOneWidget);
      // There is no arrival claim on this screen at all; it belongs beside the
      // source it describes.
      expect(find.text(l10n.accountSourcesArrivalNote), findsNothing);
    });
  });

  group('the surface reads and never writes', () {
    testWidgets('rendering a page of connections issues only reads',
        (WidgetTester tester) async {
      final repository = await pumpSurface(tester);
      expect(repository.calls, <String>['list']);
    });

    testWidgets('a filter narrows the read rather than the rendered list',
        (WidgetTester tester) async {
      final repository = await pumpSurface(tester);
      final l10n = mountedL10n(tester);

      await tester.tap(find.text(l10n.dataSourcesFilterNotImplemented));
      await tester.pumpAndSettle();

      expect(repository.requestedStatuses.last,
          ConnectionStatusFilter.notImplemented);
    });
  });

  group('Arabic is first-class', () {
    testWidgets('the tree is right to left because the LOCALE is Arabic',
        (WidgetTester tester) async {
      await pumpSurface(tester, locale: KararLocalization.arabic);

      expect(
        Directionality.of(tester.element(find.byType(DataSourcesScreen))),
        TextDirection.rtl,
      );
    });

    testWidgets('the Arabic catalogue is what is rendered',
        (WidgetTester tester) async {
      await pumpSurface(tester, locale: KararLocalization.arabic);
      final l10n = mountedL10n(tester);

      expect(l10n.localeName, 'ar');
      expect(find.text(l10n.dataSourcesScreenTitle), findsOneWidget);
      expect(find.text(l10n.dataSourcesCredentialNote), findsOneWidget);
      expect(find.text(l10n.railStandingNotBuilt), findsWidgets);
      // The English sentence must not survive into the Arabic tree.
      for (final text in renderedStrings(tester)) {
        expect(
          text.contains('Karar has not built this'),
          isFalse,
          reason: 'the English sentence leaked into the Arabic tree: $text',
        );
      }
    });

    testWidgets('no unimplemented rail offers anything in Arabic either',
        (WidgetTester tester) async {
      await pumpSurface(tester, locale: KararLocalization.arabic);

      expect(
        find.descendant(
          of: find.byKey(unbuiltRailsSectionKey),
          matching: find.byWidgetPredicate(isInteractive),
        ),
        findsNothing,
      );
      expect(find.byType(EditableText), findsNothing);
    });
  });

  group('the surface is usable without sight and at twice the text size', () {
    testWidgets('every rail card is one labelled node rather than loose strings',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      final l10n = mountedL10n(tester);
      final handle = tester.ensureSemantics();

      expect(
        find.bySemanticsLabel(
          l10n.a11yTitleWithSubtitle(
            connectionRailLabel(ConnectionRail.deviceSignal, l10n),
            l10n.railStandingBadgeNotBuilt,
          ),
        ),
        findsOneWidget,
      );
      handle.dispose();
    });

    testWidgets('the detail control names the connection it belongs to',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      final l10n = mountedL10n(tester);
      final handle = tester.ensureSemantics();

      expect(
        find.bySemanticsLabel(
          l10n.a11yTitleWithSubtitle(
            l10n.connectionShowDetailAction,
            'Statements I upload',
          ),
        ),
        findsOneWidget,
        reason: 'a column of identical "Show details" buttons is unusable '
            'without sight',
      );
      handle.dispose();
    });

    testWidgets('nothing is clipped or lost at twice the text size',
        (WidgetTester tester) async {
      await pumpSurface(tester, textScale: 2.0);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.dataSourcesCredentialNote), findsOneWidget);
      expect(find.text(l10n.railStandingNotBuilt), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });

  group('accessibility', () {
    // Four of the seven financial features asserted these; three did not, and
    // this is one of the three. A control a screen reader cannot name is
    // unusable to somebody who cannot see it, and one below the platform
    // minimum is unusable to somebody whose hands shake.
    testWidgets('every interactive control is named and big enough', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpSurface(tester);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      // Measured from the render tree: the guideline above does not see this
      // product's own pressable, so it alone would pass at any size.
      expectEveryTapTargetLargeEnough(tester, expectAtLeast: 1);
      handle.dispose();
    });
  });

}
