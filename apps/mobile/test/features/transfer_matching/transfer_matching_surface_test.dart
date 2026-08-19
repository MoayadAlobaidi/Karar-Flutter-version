// THE SURFACE, ON SCREEN, IN BOTH DIRECTIONS.
//
// Four properties are proved here rather than argued for:
//
//   1. THE ANSWER CONTROLS LIVE INSIDE THE EVIDENCE. A collapsed card carries
//      no "yes, one movement" at all, so a person cannot confirm a pairing
//      without the two movements in front of them. The confirmation is also
//      withheld while either movement is unreadable — the refusal to answer
//      about something you cannot see is a rule, not a hope.
//
//   2. NOTHING IS SUMMED, NETTED OR CONVERTED. The amounts are chosen so that
//      both mistakes are visible as strings: two sides of 1,234.56 net to 0.00
//      and total 2,469.12. Neither may appear anywhere on the screen, in either
//      currency arrangement.
//
//   3. A PROPOSAL NEVER READS AS APPLIED. The badge says "Proposed" and the
//      card says nothing has changed, until the platform answers otherwise.
//
//   4. ARABIC IS FIRST-CLASS. The tree is RTL because the LOCALE is Arabic —
//      the direction is derived by the framework rather than passed in, which
//      is the only way a test proves the application produces it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_match.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_matches_repository.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_matches_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import 'support/transfer_matching_harness.dart';

/// Tall enough for the whole card, both movement panels and the answers, at
/// the text scale each test asks for. A lazy list only builds what fits, and a
/// control below the fold would be absent from the tree — which would make an
/// assertion that it is missing pass for the wrong reason.
const Size tallSurface = Size(1200, 6000);

/// Two sides of the same magnitude with opposite signs — which is what the
/// platform's rule means by equal and opposite.
const String outflowMinorUnits = '-123456';
const String inflowMinorUnits = '123456';

/// The two strings that must never appear: the net, and the total.
const String nettedFragment = '0.00';
const String totalledFragment = '469.12';

/// Each side's own figure, which must appear exactly as the sources reported.
const String sideFragment = '234.56';

List<String> renderedStrings(WidgetTester tester) => <String>[
      for (final widget in tester.allWidgets)
        if (widget is Text && widget.data != null) widget.data!,
    ];

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(TransferMatchesScreen)));

Future<
    ({
      ScriptedTransferMatchesRepository matches,
      ScriptedMovementsRepository movements,
    })> pumpSurface(
  WidgetTester tester, {
  List<TransferMatch>? held,
  ScriptedTransferMatchesRepository? repository,
  ScriptedMovementsRepository? movements,
  Locale locale = KararLocalization.english,
  double textScale = 1.0,
}) async {
  final scriptedMatches = repository ??
      ScriptedTransferMatchesRepository(
        matches: held ?? <TransferMatch>[matchFixture()],
      );
  final scriptedMovements = movements ??
      movementsFixture(
        outflowMinorUnits: outflowMinorUnits,
        inflowMinorUnits: inflowMinorUnits,
      );
  await pumpFeatureScreen(
    tester,
    const TransferMatchesScreen(),
    overrides: transferMatchingOverrides(
      matches: scriptedMatches,
      movements: scriptedMovements,
    ),
    locale: locale,
    textScale: textScale,
    surfaceSize: tallSurface,
  );
  return (matches: scriptedMatches, movements: scriptedMovements);
}

Future<void> openMovements(WidgetTester tester) async {
  await tester.tap(find.text(mountedL10n(tester).transferMatchActionOpenMovements));
  await tester.pumpAndSettle();
}

void main() {
  group('a proposal is a question, not a decision', () {
    testWidgets('the card says nothing has changed and reads as proposed',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchStateSuggested), findsOneWidget);
      expect(find.text(l10n.transferMatchNothingChangedNote), findsOneWidget);
      expect(find.text(l10n.transferMatchStateConfirmed), findsNothing);
    });

    testWidgets('the basis is shown and no score is offered',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchBasisEqualAndOpposite), findsOneWidget);
      expect(find.text(l10n.transferMatchNoScoreNote), findsOneWidget);
      // The version label of the rule, verbatim, so a person can tell which
      // rule looked at their data.
      expect(find.text(shippedWindowLabel), findsOneWidget);
    });

    testWidgets('the two accounts are NAMED, never rendered as identifiers',
        (WidgetTester tester) async {
      await pumpSurface(tester);

      expect(find.text('Everyday account'), findsOneWidget);
      expect(find.text('Travel wallet'), findsOneWidget);
      for (final rendered in renderedStrings(tester)) {
        expect(rendered.contains(outflowAccountId), isFalse);
        expect(rendered.contains(inflowAccountId), isFalse);
        expect(rendered.contains(matchFixtureId), isFalse);
        expect(rendered.contains(outflowTransactionId), isFalse);
      }
    });
  });

  group('the answer controls live inside the evidence', () {
    testWidgets('a collapsed card offers no confirmation at all',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchActionConfirm), findsNothing);
      expect(find.text(l10n.transferMatchActionOpenMovements), findsOneWidget);
      expect(find.text(l10n.transferMatchOpenToAnswerNote), findsOneWidget);
    });

    testWidgets('a collapsed card reads no transaction, so a page costs one call',
        (WidgetTester tester) async {
      final harness = await pumpSurface(tester);

      expect(harness.movements.reads, isEmpty);
    });

    testWidgets('opening the movements reads both and offers the confirmation',
        (WidgetTester tester) async {
      final harness = await pumpSurface(tester);
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      expect(
        harness.movements.reads,
        <String>[outflowTransactionId, inflowTransactionId],
      );
      expect(find.text(l10n.transferMatchActionConfirm), findsOneWidget);
      expect(find.text(l10n.transferMatchActionReject), findsOneWidget);
    });

    testWidgets('an unreadable movement withholds the confirmation and says why',
        (WidgetTester tester) async {
      await pumpSurface(
        tester,
        movements: movementsFixture(
          outflowMinorUnits: outflowMinorUnits,
          inflowMinorUnits: inflowMinorUnits,
          unreadable: <String>{inflowTransactionId},
        ),
      );
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchMovementUnavailable), findsOneWidget);
      expect(
        find.text(l10n.transferMatchActionConfirm),
        findsNothing,
        reason: 'answering "these are one movement" about something nobody can '
            'see is exactly the trust this surface exists not to ask for',
      );
      expect(
        find.text(l10n.transferMatchActionReject),
        findsOneWidget,
        reason: 'keeping two records separate asserts nothing and leaves both '
            'exactly as they are',
      );
    });
  });

  group('nothing is summed, netted or converted', () {
    testWidgets('the two sides render as two amounts and no third figure',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      await openMovements(tester);

      final rendered = renderedStrings(tester);
      expect(
        rendered.where((String text) => text.contains(sideFragment)),
        hasLength(2),
        reason: 'exactly the two figures the sources reported',
      );
      for (final text in rendered) {
        expect(
          text.contains(totalledFragment),
          isFalse,
          reason: 'a total of the two sides appeared: $text',
        );
        expect(
          text.contains(nettedFragment),
          isFalse,
          reason: 'the two sides were netted off: $text',
        );
      }
    });

    testWidgets('a cross-currency pair shows two currencies and refuses to pair',
        (WidgetTester tester) async {
      await pumpSurface(
        tester,
        held: <TransferMatch>[
          matchFixture(outflowCurrency: 'QAR', inflowCurrency: 'USD'),
        ],
        movements: movementsFixture(
          outflowMinorUnits: outflowMinorUnits,
          inflowMinorUnits: inflowMinorUnits,
          outflowCurrency: 'QAR',
          inflowCurrency: 'USD',
        ),
      );
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchCrossCurrencyDetail), findsOneWidget);
      expect(find.text(l10n.transferMatchActionConfirm), findsNothing);

      final rendered = renderedStrings(tester);
      expect(rendered.any((String text) => text.contains('QAR')), isTrue);
      expect(rendered.any((String text) => text.contains('USD')), isTrue);
      for (final text in rendered) {
        expect(text.contains(totalledFragment), isFalse);
        expect(text.contains(nettedFragment), isFalse);
      }
    });
  });

  group('the decision is the person\'s', () {
    testWidgets('rendering the surface records no answer',
        (WidgetTester tester) async {
      final harness = await pumpSurface(tester);
      await openMovements(tester);

      expect(harness.matches.calls, <String>['list']);
    });

    testWidgets('confirming sends exactly one confirmation, once pressed',
        (WidgetTester tester) async {
      final harness = await pumpSurface(tester);
      await openMovements(tester);

      await tester.tap(find.text(mountedL10n(tester).transferMatchActionConfirm));
      await tester.pumpAndSettle();

      expect(harness.matches.confirmations, hasLength(1));
      expect(harness.matches.confirmations.single.expectedVersion, 1);
      expect(
        find.text(mountedL10n(tester).transferMatchStateConfirmed),
        findsOneWidget,
      );
    });

    testWidgets('a refused confirmation leaves the pair reading as proposed',
        (WidgetTester tester) async {
      await pumpSurface(
        tester,
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
          confirmResult: const Failed<TransferMatch>(
            ConflictFailure(code: transferMatchVersionConflictCode),
          ),
        ),
      );
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      await tester.tap(find.text(l10n.transferMatchActionConfirm));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transferMatchStateSuggested), findsOneWidget);
      expect(find.text(l10n.transferMatchStateConfirmed), findsNothing);
      expect(find.text(l10n.transferMatchNothingChangedNote), findsOneWidget);
      expect(
        find.text(l10n.transferMatchRefusalConflict),
        findsOneWidget,
        reason: 'a specific refusal, not "something went wrong"',
      );
    });

    testWidgets('keeping a pair separate is asked for once, and can be cancelled',
        (WidgetTester tester) async {
      final harness = await pumpSurface(tester);
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      await tester.tap(find.text(l10n.transferMatchActionReject));
      await tester.pumpAndSettle();
      expect(find.text(l10n.transferMatchRejectDialogMessage), findsOneWidget);

      await tester.tap(find.text(l10n.actionCancel));
      await tester.pumpAndSettle();

      expect(harness.matches.rejections, isEmpty);
      expect(find.text(l10n.transferMatchStateSuggested), findsOneWidget);
    });

    testWidgets('a confirmed pair offers a withdrawal and no second confirmation',
        (WidgetTester tester) async {
      await pumpSurface(
        tester,
        held: <TransferMatch>[matchFixture(state: MatchState.confirmed, version: 2)],
      );
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchActionWithdraw), findsOneWidget);
      expect(find.text(l10n.transferMatchActionConfirm), findsNothing);
      expect(find.text(l10n.transferMatchConfirmedNote), findsOneWidget);

      await tester.tap(find.text(l10n.transferMatchActionWithdraw));
      await tester.pumpAndSettle();
      expect(
        find.text(l10n.transferMatchWithdrawDialogMessage),
        findsOneWidget,
        reason: 'withdrawing is terminal: the pair can never be confirmed again',
      );
    });

    testWidgets('a pair kept separate offers no answer at all',
        (WidgetTester tester) async {
      await pumpSurface(
        tester,
        held: <TransferMatch>[matchFixture(state: MatchState.rejected, version: 2)],
      );
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchActionConfirm), findsNothing);
      expect(find.text(l10n.transferMatchActionReject), findsNothing);
      expect(find.text(l10n.transferMatchActionWithdraw), findsNothing);
      expect(find.text(l10n.transferMatchRejectedNote), findsOneWidget);
    });
  });

  group('Arabic is first-class', () {
    testWidgets('the tree is right to left because the LOCALE is Arabic',
        (WidgetTester tester) async {
      await pumpSurface(tester, locale: KararLocalization.arabic);

      expect(
        Directionality.of(tester.element(find.byType(TransferMatchesScreen))),
        TextDirection.rtl,
      );
    });

    testWidgets('the Arabic catalogue is what is rendered',
        (WidgetTester tester) async {
      await pumpSurface(tester, locale: KararLocalization.arabic);
      final l10n = mountedL10n(tester);

      expect(l10n.localeName, 'ar');
      expect(find.text(l10n.transferMatchesScreenTitle), findsOneWidget);
      expect(find.text(l10n.transferMatchNothingChangedNote), findsOneWidget);
      expect(find.text(l10n.transferMatchStateSuggested), findsOneWidget);
      // The English sentence must not survive into the Arabic tree.
      expect(find.text('Nothing has changed. This is a question, not a decision.'),
          findsNothing);
    });

    testWidgets('the whole answer flow works in Arabic',
        (WidgetTester tester) async {
      final harness = await pumpSurface(tester, locale: KararLocalization.arabic);
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchActionConfirm), findsOneWidget);
      await tester.tap(find.text(l10n.transferMatchActionConfirm));
      await tester.pumpAndSettle();

      expect(harness.matches.confirmations, hasLength(1));
      expect(find.text(l10n.transferMatchStateConfirmed), findsOneWidget);
    });

    testWidgets('nothing is summed in Arabic either', (WidgetTester tester) async {
      await pumpSurface(tester, locale: KararLocalization.arabic);
      await openMovements(tester);

      for (final text in renderedStrings(tester)) {
        expect(text.contains(totalledFragment), isFalse);
        expect(text.contains(nettedFragment), isFalse);
      }
    });
  });

  group('the surface is usable without sight and at twice the text size', () {
    testWidgets('every answer control carries its own semantic label',
        (WidgetTester tester) async {
      await pumpSurface(tester);
      await openMovements(tester);
      final l10n = mountedL10n(tester);
      final handle = tester.ensureSemantics();

      expect(
        find.bySemanticsLabel(l10n.transferMatchActionConfirm),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel(l10n.transferMatchActionReject), findsOneWidget);
      // The state is carried by the WORD, not by the colour of the badge.
      // The badge's own node merges into the card's, so the assertion is that
      // the WORD reaches the semantics tree — not that it stands alone.
      expect(
        find.bySemanticsLabel(RegExp(l10n.transferMatchStateSuggested)),
        findsWidgets,
      );

      handle.dispose();
    });

    testWidgets('the flow still works at twice the text scale',
        (WidgetTester tester) async {
      final harness = await pumpSurface(tester, textScale: 2.0);
      await openMovements(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchActionConfirm), findsOneWidget);
      await tester.tap(find.text(l10n.transferMatchActionConfirm));
      await tester.pumpAndSettle();

      expect(harness.matches.confirmations, hasLength(1));
    });

    testWidgets('an empty listing says WHICH kind of empty it is',
        (WidgetTester tester) async {
      await pumpSurface(tester, held: <TransferMatch>[]);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.transferMatchesEmptyAwaitingTitle), findsOneWidget);
      expect(find.text(l10n.transferMatchesEmptyConfirmedTitle), findsNothing);
    });
  });

  group('accessibility', () {
    // The identity surfaces have asserted these guidelines since Phase 4; the
    // financial surfaces — the larger and newer half of the app — asserted
    // neither. A control a screen reader cannot name is unusable to somebody
    // who cannot see it, and a tap target below the platform minimum is
    // unusable to somebody whose hands shake.
    testWidgets('every interactive control is named and big enough', (WidgetTester tester) async {
      final SemanticsHandle handle = tester.ensureSemantics();

      await pumpSurface(tester);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      // Measured from the render tree, because the guideline above does not
      // see this product's own pressable.
      expectEveryTapTargetLargeEnough(tester);
      handle.dispose();
    });
  });

}
