// THE HARNESS FOR THE DATA-SOURCE SUITE.
//
// The repositories are scripted doubles, so everything above the ports runs for
// real: the use case, the listing controller, the labels and the widgets.
//
// TWO THINGS THIS HARNESS IS BUILT TO MAKE PROVABLE:
//
//   * WHAT WAS SENT. `calls` records every read, so a test can assert that a
//     refused deep link issued none — which is what makes the capability gate a
//     refusal rather than a hidden screen;
//   * WHAT A DISHONEST RESPONSE WOULD DO. `connectionFixture` will happily build
//     a connection whose rail and availability contradict each other, so the
//     screen can be shown one and the assertion that it STILL offers nothing is
//     a real assertion rather than an argument about the mapper.
//
// The source-link fixture is written here rather than reused from the financial
// suite because that one fixes the priority, the authority, the match basis and
// the observation, and every one of those is a thing this surface is about.
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/calendar_day.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/source_rail.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connection.dart';
import 'package:karar_mobile/features/financial_connections/domain/financial_connections_repository.dart';
import 'package:karar_mobile/features/financial_connections/presentation/connections_providers.dart';

import '../../financial_accounts/support/financial_fixtures.dart';
import '../../financial_accounts/support/financial_harness.dart';

export 'package:flutter_riverpod/misc.dart' show Override;

const String connectionFixtureId = 'connection-0001';
const String sourceLinkFixtureId = 'source-link-0001';
const String fedAccountId = 'account-0001';
const String otherAccountId = 'account-0003';

/// One connection.
///
/// The defaults describe the only shape the platform can actually produce: a
/// file-upload rail, EXECUTABLE, accepting what the person supplies, asserting
/// no live institution link. A test that wants a contradiction has to ask for
/// one, which is what makes the contradiction tests honest.
FinancialConnection connectionFixture({
  String connectionId = connectionFixtureId,
  ConnectionRail rail = ConnectionRail.userFileUpload,
  RailAvailability availability = RailAvailability.executable,
  ConnectionStatus status = ConnectionStatus.active,
  String displayLabel = 'Statements I upload',
  String? institutionId = 'institution-0001',
  bool impliesLiveInstitutionLink = false,
  bool providerAccessImplemented = false,
  int version = 1,
}) => FinancialConnection(
  connectionId: connectionId,
  rail: rail,
  availability: availability,
  status: status,
  displayLabel: displayLabel,
  institutionId: institutionId,
  impliesLiveInstitutionLink: impliesLiveInstitutionLink,
  providerAccessImplemented: providerAccessImplemented,
  createdAt: DateTime.utc(2026, 1, 4, 8),
  updatedAt: DateTime.utc(2026, 2, 9, 10),
  version: version,
);

/// One source feeding one account, with every field this surface renders under
/// the test author's control.
AccountSourceLink sourceLinkFixture({
  String sourceLinkId = sourceLinkFixtureId,
  String accountId = fedAccountId,
  String connectionId = connectionFixtureId,
  ConnectionRail rail = ConnectionRail.userFileUpload,
  RailAvailability availability = RailAvailability.executable,
  SourceAuthority sourceAuthority = SourceAuthority.authoritative,
  MatchBasis matchBasis = MatchBasis.exactExternalReference,
  SourceLinkStatus status = SourceLinkStatus.linked,
  DateTime? subjectConfirmedAt,
  int sourcePriority = 1,
  DateTime? firstObservedAt,
  DateTime? lastObservedAt,
  DateTime? lastSuccessfulImportAt,
  CalendarDayRange? historyCoverage,
  SourceDataObservationState balance = SourceDataObservationState.observed,
  SourceDataObservationState pendingTransactions = SourceDataObservationState.notProvided,
}) => AccountSourceLink(
  sourceLinkId: sourceLinkId,
  accountId: accountId,
  connectionId: connectionId,
  rail: rail,
  availability: availability,
  sourceAuthority: sourceAuthority,
  matchBasis: matchBasis,
  status: status,
  impliesLiveInstitutionLink: false,
  providerAccessImplemented: false,
  subjectConfirmedAt: subjectConfirmedAt,
  sourcePriority: sourcePriority,
  observation: SourceObservation(
    firstObservedAt: firstObservedAt ?? DateTime.utc(2026, 1, 4, 8),
    lastObservedAt: lastObservedAt ?? DateTime.utc(2026, 3, 9, 10),
    lastSuccessfulImportAt: lastSuccessfulImportAt,
  ),
  historyCoverage: historyCoverage,
  capabilities: SourceCapabilities(balance: balance, pendingTransactions: pendingTransactions),
  version: 1,
);

/// A calendar range, from two ISO days.
CalendarDayRange coverage(String start, String end) =>
    CalendarDayRange(start: CalendarDay.tryParse(start)!, end: CalendarDay.tryParse(end)!);

/// Connections, driven by a script.
final class ScriptedFinancialConnectionsRepository implements FinancialConnectionsRepository {
  ScriptedFinancialConnectionsRepository({
    this.connections = const <FinancialConnection>[],
    this.listFailure,
    this.hasMore = false,
  });

  List<FinancialConnection> connections;
  Failure? listFailure;
  bool hasMore;

  final List<ConnectionStatusFilter?> requestedStatuses = <ConnectionStatusFilter?>[];
  final List<String?> requestedCursors = <String?>[];

  /// Every call, in order, so a test can assert a refused surface issued none.
  final List<String> calls = <String>[];

  @override
  Future<Result<FinancialConnectionPage>> listOwn({
    ConnectionStatusFilter? status,
    int? limit,
    String? cursor,
  }) async {
    calls.add('list');
    requestedStatuses.add(status);
    requestedCursors.add(cursor);
    final failure = listFailure;
    if (failure != null) {
      return Failed<FinancialConnectionPage>(failure);
    }
    return Success<FinancialConnectionPage>(
      FinancialConnectionPage(
        items: connections,
        hasMore: hasMore,
        nextCursor: hasMore ? 'cursor-next' : null,
      ),
    );
  }
}

/// The portfolio the sources feed, so accounts are NAMED rather than rendered
/// as identifiers.
ScriptedAccountsRepository accountsWithSources({
  Map<String, List<AccountSourceLink>>? sourceLinks,
}) => ScriptedAccountsRepository(
  accounts: <FinancialAccount>[
    account(accountId: fedAccountId, displayName: 'Everyday account'),
    account(accountId: otherAccountId, displayName: 'Travel wallet'),
  ],
  sourceLinks:
      sourceLinks ??
      <String, List<AccountSourceLink>>{
        fedAccountId: <AccountSourceLink>[sourceLinkFixture()],
      },
);

/// The overrides a data-source test installs.
List<Override> financialConnectionOverrides({
  ScriptedFinancialConnectionsRepository? connections,
  ScriptedAccountsRepository? accounts,
  BootstrapSnapshot? bootstrap,
}) => <Override>[
  ...financialOverrides(accounts: accounts ?? accountsWithSources(), bootstrap: bootstrap),
  financialConnectionsRepositoryProvider.overrideWithValue(
    connections ?? ScriptedFinancialConnectionsRepository(),
  ),
];
