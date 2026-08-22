// THE SOURCES FEEDING ONE ACCOUNT, ON SCREEN.
//
// The tests here are about the three sentences a person would misread if the
// screen were careless:
//
//   1. A COVERAGE RANGE IS NOT A FRESHNESS DATE. The fixture is the exact trap:
//      supplied data covering up to the end of September, and NOTHING has ever
//      landed. The screen must say nothing has arrived, and the sentence that
//      would claim an arrival must not appear at all — asserted by deriving the
//      sentence's own prefix from the catalogue, so it holds in both languages
//      without a translated string being hard-coded here;
//
//   2. BEING SEEN IS NOT RECEIVING. `lastObservedAt` is recent in the same
//      fixture, and it is rendered under its own label with its own
//      explanation rather than as "last updated";
//
//   3. PRIORITY IS ECHOED, NOT DECIDED. The order is the platform's and the
//      rank is shown beside it. When two sources claim one rank the screen says
//      the precedence is undecided instead of choosing.
//
// And the standing rules of the whole feature: no credential field, no confirm
// or decline control, and Arabic first-class.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/financial_connections/presentation/account_sources_screen.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../platform_bootstrap/support/feature_harness.dart';
import 'support/financial_connections_harness.dart';

const Size tallSurface = Size(1200, 9000);

/// The instant the fixture claims data landed at, when it claims one.
final DateTime landedAt = DateTime.utc(2026, 2, 14, 9, 30);

List<String> renderedStrings(WidgetTester tester) => <String>[
  for (final widget in tester.allWidgets)
    if (widget is Text && widget.data != null) widget.data!,
];

AppLocalizations mountedL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(AccountSourcesScreen)));

/// A character no catalogue contains, so the split below lands exactly where
/// the placeholder was.
///
/// Written as an ESCAPE rather than as the character itself: a literal NUL in
/// a source file is invisible to a reviewer, and this constant is the only
/// thing standing between the assertion below and a prefix so short that
/// nothing could ever violate it.
const String instantSentinel = '\u0000';

/// The fixed part of the arrival sentence, derived from the catalogue rather
/// than typed here, so the assertion holds in Arabic without a translated
/// string being pinned into this file.
String arrivalSentencePrefix(AppLocalizations l10n) =>
    l10n.sourceArrivalYouSupplied(instantSentinel).split(instantSentinel).first;

Future<void> pumpSources(
  WidgetTester tester, {
  List<AccountSourceLink>? links,
  Locale locale = KararLocalization.english,
  double textScale = 1.0,
}) => pumpFeatureScreen(
  tester,
  const AccountSourcesScreen(accountId: fedAccountId),
  overrides: financialConnectionOverrides(
    accounts: accountsWithSources(
      sourceLinks: <String, List<AccountSourceLink>>{
        fedAccountId: links ?? <AccountSourceLink>[sourceLinkFixture()],
      },
    ),
  ),
  locale: locale,
  textScale: textScale,
  surfaceSize: tallSurface,
);

void main() {
  group('a coverage range is never a freshness guarantee', () {
    testWidgets('data covering up to September, with nothing ever arrived, '
        'says nothing has arrived', (WidgetTester tester) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(
            historyCoverage: coverage('2026-01-01', '2026-09-30'),
            lastObservedAt: DateTime.utc(2026, 9, 30, 18),
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.sourceArrivalNone), findsOneWidget);
      for (final text in renderedStrings(tester)) {
        expect(
          text.contains(arrivalSentencePrefix(l10n)),
          isFalse,
          reason: 'a coverage end date became an arrival claim: $text',
        );
      }
    });

    testWidgets('the coverage row carries the sentence that limits it', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(historyCoverage: coverage('2026-01-01', '2026-09-30')),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.sourceCoverageLabel), findsOneWidget);
      expect(find.text(l10n.accountSourcesCoverageNote), findsOneWidget);
      expect(find.text(l10n.sourceCoverageRange('2026-01-01', '2026-09-30')), findsOneWidget);
    });

    testWidgets('nothing supplied at all is stated rather than left blank', (
      WidgetTester tester,
    ) async {
      await pumpSources(tester);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.sourceCoverageNone), findsOneWidget);
      expect(find.text(l10n.accountSourcesCoverageNote), findsOneWidget);
    });
  });

  group('being seen is not receiving', () {
    testWidgets('the last recorded activity has its own label and its own note', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(lastObservedAt: DateTime.utc(2026, 9, 30, 18)),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.accountSourcesLastRecordedLabel), findsOneWidget);
      expect(find.text(l10n.accountSourcesLastRecordedNote), findsOneWidget);
      expect(find.text(l10n.accountSourcesFirstRecordedLabel), findsOneWidget);
      expect(find.text(l10n.sourceArrivalNone), findsOneWidget);
    });

    testWidgets('an import that did land is stated as something YOU supplied', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[sourceLinkFixture(lastSuccessfulImportAt: landedAt)],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.sourceArrivalNone), findsNothing);
      expect(find.textContaining(arrivalSentencePrefix(l10n)), findsOneWidget);
      expect(find.text(l10n.accountSourcesArrivalNote), findsOneWidget);
    });
  });

  group('priority is echoed, never decided here', () {
    testWidgets('sources render in the order given, each with its own rank', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(sourceLinkId: 'source-link-strong', sourcePriority: 1),
          sourceLinkFixture(
            sourceLinkId: 'source-link-weaker',
            sourcePriority: 4,
            rail: ConnectionRail.manual,
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.accountSourcesCardHeading(1)), findsOneWidget);
      expect(find.text(l10n.accountSourcesCardHeading(2)), findsOneWidget);
      expect(find.text(l10n.accountSourcesPriorityValue(1)), findsOneWidget);
      expect(find.text(l10n.accountSourcesPriorityValue(4)), findsOneWidget);
      expect(find.text(l10n.accountSourcesPriorityNote), findsOneWidget);
      expect(find.text(l10n.accountSourcesPriorityAmbiguous), findsNothing);

      // The stronger source is ABOVE the weaker one, which is what "strongest
      // first" means to a person reading down the page.
      final strong = tester.getTopLeft(find.text(l10n.accountSourcesPriorityValue(1)));
      final weaker = tester.getTopLeft(find.text(l10n.accountSourcesPriorityValue(4)));
      expect(strong.dy, lessThan(weaker.dy));
    });

    testWidgets('two sources claiming one rank say the precedence is undecided', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(sourceLinkId: 'source-link-a', sourcePriority: 2),
          sourceLinkFixture(
            sourceLinkId: 'source-link-b',
            sourcePriority: 2,
            rail: ConnectionRail.manual,
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.accountSourcesPriorityAmbiguous), findsOneWidget);
    });
  });

  group('what a source can do is what was SEEN', () {
    testWidgets('never offered and not seen are two different answers', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(
            balance: SourceDataObservationState.notObserved,
            pendingTransactions: SourceDataObservationState.notProvided,
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.sourceObservationNotObserved), findsOneWidget);
      expect(find.text(l10n.sourceObservationNotProvided), findsOneWidget);
      expect(find.text(l10n.accountSourcesCapabilitiesNote), findsOneWidget);
    });

    testWidgets('no confidence figure is offered for a probable match', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[sourceLinkFixture(matchBasis: MatchBasis.probable)],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.sourceMatchBasisProbable), findsOneWidget);
      expect(find.text(l10n.accountSourcesNoScoreNote), findsOneWidget);
      for (final text in renderedStrings(tester)) {
        expect(text.contains('%'), isFalse, reason: 'a score appeared: $text');
      }
    });
  });

  group('nothing here asks a person to connect or to confirm', () {
    testWidgets('there is no editable text and no button on the source cards', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(
            status: SourceLinkStatus.pendingConfirmation,
            matchBasis: MatchBasis.probable,
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      // A pending link is exactly where a confirm/decline pair would be added.
      // The contract has no operation for either on this surface.
      expect(find.text(l10n.accountSourcesConfirmedPending), findsOneWidget);
      expect(find.byType(EditableText), findsNothing);
      expect(find.byType(KararTextField), findsNothing);
      expect(find.byType(KararButton), findsNothing);
    });

    testWidgets('a bank rail on a source link still reads as never built', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        links: <AccountSourceLink>[
          sourceLinkFixture(
            rail: ConnectionRail.openFinanceApi,
            // The financial workstream's mapper does not check this pair, so a
            // drifting response reaches the screen. It changes nothing.
            availability: RailAvailability.executable,
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.railStandingNotBuilt), findsOneWidget);
      expect(find.text(l10n.railStandingBadgeNotBuilt), findsOneWidget);
      expect(find.byType(KararButton), findsNothing);
    });

    testWidgets('an account with no source says so rather than offering one', (
      WidgetTester tester,
    ) async {
      await pumpSources(tester, links: const <AccountSourceLink>[]);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.accountSourcesEmptyTitle), findsOneWidget);
      expect(find.text(l10n.accountSourcesEmptyDescription), findsOneWidget);
      expect(find.byType(EditableText), findsNothing);
    });
  });

  group('Arabic is first-class', () {
    testWidgets('the tree is right to left because the LOCALE is Arabic', (
      WidgetTester tester,
    ) async {
      await pumpSources(tester, locale: KararLocalization.arabic);

      expect(
        Directionality.of(tester.element(find.byType(AccountSourcesScreen))),
        TextDirection.rtl,
      );
    });

    testWidgets('the coverage range is not a freshness claim in Arabic either', (
      WidgetTester tester,
    ) async {
      await pumpSources(
        tester,
        locale: KararLocalization.arabic,
        links: <AccountSourceLink>[
          sourceLinkFixture(
            historyCoverage: coverage('2026-01-01', '2026-09-30'),
            lastObservedAt: DateTime.utc(2026, 9, 30, 18),
          ),
        ],
      );
      final l10n = mountedL10n(tester);

      expect(l10n.localeName, 'ar');
      expect(find.text(l10n.sourceArrivalNone), findsOneWidget);
      for (final text in renderedStrings(tester)) {
        expect(text.contains(arrivalSentencePrefix(l10n)), isFalse, reason: text);
      }
      expect(find.text(l10n.accountSourcesCoverageNote), findsOneWidget);
    });
  });

  group('the screen is usable without sight and at twice the text size', () {
    testWidgets('each source is announced with its position', (WidgetTester tester) async {
      await pumpSources(tester);
      final l10n = mountedL10n(tester);
      final handle = tester.ensureSemantics();

      expect(find.text(l10n.accountSourcesCardHeading(1)), findsOneWidget);
      expect(
        tester.getSemantics(find.text(l10n.accountSourcesCardHeading(1))).flagsCollection.isHeader,
        isTrue,
      );
      handle.dispose();
    });

    testWidgets('nothing is lost at twice the text size', (WidgetTester tester) async {
      await pumpSources(tester, textScale: 2.0);
      final l10n = mountedL10n(tester);

      expect(find.text(l10n.accountSourcesArrivalNote), findsOneWidget);
      expect(find.text(l10n.accountSourcesCoverageNote), findsOneWidget);
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

      await pumpSources(tester);

      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      // Measured from the render tree, which is indifferent to the test
      // surface. The guideline above skips nodes it treats as offscreen, and
      // these screens are pumped tall so a lazy list builds all of them — so
      // on its own it would pass at any control size here.
      expectEveryTapTargetLargeEnough(tester, expectAtLeast: 1);
      handle.dispose();
    });
  });
}
