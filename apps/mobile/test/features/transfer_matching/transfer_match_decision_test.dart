// THE DECISION, DRIVEN THROUGH THE PORTS.
//
// The repository is a script, so everything above it runs for real: the use
// cases and their refusals, the listing controller, the optimistic progress
// marker and the tenant-scoped discard.
//
// The properties under test are the ones a person is HARMED by if they break:
//
//   * a confirmation nobody made must never be recorded — not by rendering,
//     not by a filter change, not by a second tap, and not by a client that
//     sends a request the domain has already refused;
//   * a rejected pair must never come back as confirmed;
//   * an optimistic update must not survive a failed write, in either
//     direction: the pair must not read as confirmed, and it must not lose the
//     answer it already had;
//   * an answer issued under one organisation must never land in another's
//     listing.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/lifecycle/tenant_data_scope.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_match.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_matches_repository.dart';
import 'package:karar_mobile/features/transfer_matching/presentation/transfer_matching_providers.dart';

import 'support/transfer_matching_harness.dart';

({ProviderContainer container, ScriptedTransferMatchesRepository repository})
    listingFor({
  List<TransferMatch>? matches,
  ScriptedTransferMatchesRepository? repository,
}) {
  final scripted = repository ??
      ScriptedTransferMatchesRepository(
        matches: matches ?? <TransferMatch>[matchFixture()],
      );
  final container = ProviderContainer(
    overrides: transferMatchingOverrides(matches: scripted),
  );
  addTearDown(container.dispose);
  return (container: container, repository: scripted);
}

TransferMatchesLoaded loadedOf(ProviderContainer container) =>
    container.read(transferMatchListingProvider).value! as TransferMatchesLoaded;

TransferMatchRow rowOf(ProviderContainer container, [String matchId = matchFixtureId]) =>
    loadedOf(container)
        .rows
        .firstWhere((TransferMatchRow row) => row.match.matchId == matchId);

void main() {
  group('reading proposals writes nothing', () {
    test('building the listing issues no confirmation and no rejection', () async {
      // The whole module exists because an automatic match makes two real
      // movements disappear from a person's record without them knowing. This
      // is the client half of that guarantee.
      final harness = listingFor();

      await harness.container.read(transferMatchListingProvider.future);

      expect(harness.repository.calls, <String>['list']);
      expect(harness.repository.confirmations, isEmpty);
      expect(harness.repository.rejections, isEmpty);
    });

    test('changing the filter re-reads and still writes nothing', () async {
      final harness = listingFor();
      await harness.container.read(transferMatchListingProvider.future);

      harness.container
          .read(transferMatchFilterProvider.notifier)
          .show(MatchStateFilter.confirmed);
      await harness.container.read(transferMatchListingProvider.future);

      expect(
        harness.repository.requestedStates,
        <MatchStateFilter>[
          MatchStateFilter.awaitingDecision,
          MatchStateFilter.confirmed,
        ],
      );
      expect(harness.repository.calls, <String>['list', 'list']);
    });

    test('the surface opens on the questions still waiting for a person', () async {
      final harness = listingFor();
      await harness.container.read(transferMatchListingProvider.future);

      expect(harness.repository.requestedStates.single, MatchStateFilter.awaitingDecision);
    });
  });

  group('the optimistic update is progress, never a state change', () {
    test('an in-flight confirmation still reads as a proposal', () async {
      final gate = Completer<void>();
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
        )..gate = gate,
      );
      await harness.container.read(transferMatchListingProvider.future);

      final pending = harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);
      await Future<void>.delayed(Duration.zero);

      final row = rowOf(harness.container);
      expect(row.progress, MatchDecisionProgress.confirming);
      expect(
        row.match.state,
        MatchState.suggested,
        reason: 'the pair is still a question until the platform says otherwise',
      );
      expect(
        row.match.authoritative,
        isFalse,
        reason: 'only the platform makes a match authoritative',
      );

      gate.complete();
      await pending;
    });

    test('a failed confirmation leaves the pair exactly as it was', () async {
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
          confirmResult: const Failed<TransferMatch>(
            ConflictFailure(code: transferMatchVersionConflictCode),
          ),
        ),
      );
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);

      final row = rowOf(harness.container);
      expect(row.progress, MatchDecisionProgress.idle);
      expect(row.match.state, MatchState.suggested);
      expect(row.match.authoritative, isFalse);
      expect(row.match.version, 1, reason: 'nothing was written, so nothing moved on');
      expect(row.refusal, isA<ConflictFailure>());
      expect(row.match.isConfirmable, isTrue, reason: 'the person may try again');
    });

    test('a failed withdrawal does not un-confirm the pair on screen', () async {
      // The other direction of the same rule. A refused withdrawal must not
      // leave a person believing their confirmation is gone when it stands.
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture(state: MatchState.confirmed, version: 4)],
          rejectResult: const Failed<TransferMatch>(DependencyUnavailableFailure()),
        ),
      );
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .reject(matchFixtureId);

      final row = rowOf(harness.container);
      expect(row.match.state, MatchState.confirmed);
      expect(row.match.authoritative, isTrue);
      expect(row.refusal, isA<DependencyUnavailableFailure>());
    });

    test('a successful confirmation takes the row the PLATFORM answered with',
        () async {
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
          confirmResult: Success<TransferMatch>(
            matchFixture(state: MatchState.confirmed, version: 9),
          ),
        ),
      );
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);

      final row = rowOf(harness.container);
      expect(row.match.state, MatchState.confirmed);
      expect(row.match.authoritative, isTrue);
      expect(row.match.version, 9, reason: 'the platform states the version, not us');
      expect(row.refusal, isNull);
      expect(row.progress, MatchDecisionProgress.idle);
    });
  });

  group('a decision names the version it was made about', () {
    test('the version sent is the version of the row the person was shown',
        () async {
      final harness = listingFor(matches: <TransferMatch>[matchFixture(version: 6)]);
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);

      expect(harness.repository.confirmations.single.expectedVersion, 6);
    });

    test('a second decision uses the version the first one produced', () async {
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture(version: 1)],
          confirmResult: Success<TransferMatch>(
            matchFixture(state: MatchState.confirmed, version: 2),
          ),
        ),
      );
      await harness.container.read(transferMatchListingProvider.future);
      final notifier = harness.container.read(transferMatchListingProvider.notifier);

      await notifier.confirm(matchFixtureId);
      await notifier.reject(matchFixtureId);

      expect(
        harness.repository.rejections.single.expectedVersion,
        2,
        reason: 'a blind second write would discard the first one',
      );
    });

    test('two presses while one is in flight send ONE request', () async {
      final gate = Completer<void>();
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
        )..gate = gate,
      );
      await harness.container.read(transferMatchListingProvider.future);
      final notifier = harness.container.read(transferMatchListingProvider.notifier);

      final first = notifier.confirm(matchFixtureId);
      await Future<void>.delayed(Duration.zero);
      final second = notifier.confirm(matchFixtureId);

      gate.complete();
      await Future.wait<void>(<Future<void>>[first, second]);

      expect(harness.repository.confirmations, hasLength(1));
    });
  });

  group('a rejected pair never comes back as confirmed', () {
    test('rejecting settles the pair and removes the confirmation entirely',
        () async {
      final harness = listingFor();
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .reject(matchFixtureId);

      final row = rowOf(harness.container);
      expect(row.match.state, MatchState.rejected);
      expect(row.match.authoritative, isFalse);
      expect(
        row.match.isConfirmable,
        isFalse,
        reason: 'a rejection is terminal — the contract says so and the '
            'database enforces it',
      );
      expect(row.match.isRejectable, isFalse);
    });

    test('confirming a rejected pair issues NO request at all', () async {
      final harness = listingFor(
        matches: <TransferMatch>[matchFixture(state: MatchState.rejected)],
      );
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);

      expect(harness.repository.confirmations, isEmpty);
      expect(rowOf(harness.container).match.state, MatchState.rejected);
      expect(rowOf(harness.container).refusal, isNotNull);
    });

    test('confirming a pair in an unrecognised state issues no request', () async {
      // A state this build cannot read is not a state it may act on.
      final harness = listingFor(
        matches: <TransferMatch>[matchFixture(state: MatchState.unrecognised)],
      );
      await harness.container.read(transferMatchListingProvider.future);
      final notifier = harness.container.read(transferMatchListingProvider.notifier);

      await notifier.confirm(matchFixtureId);
      await notifier.reject(matchFixtureId);

      expect(harness.repository.confirmations, isEmpty);
      expect(harness.repository.rejections, isEmpty);
    });
  });

  group('a cross-currency pair is refused before anything is sent', () {
    test('the confirmation never leaves the device', () async {
      // The platform cannot hold a cross-currency match and holds no rate.
      // Sending the request anyway would make the platform's refusal read as
      // the person's mistake.
      final harness = listingFor(
        matches: <TransferMatch>[
          matchFixture(outflowCurrency: 'QAR', inflowCurrency: 'USD'),
        ],
      );
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);

      expect(harness.repository.confirmations, isEmpty);
      expect(harness.repository.calls, <String>['list']);
      expect(rowOf(harness.container).refusal?.code, transferMatchCrossCurrencyCode);
    });

    test('the refusal is SPECIFIC rather than a generic transition refusal',
        () async {
      // "Karar cannot pair two currencies" and "that answer is not available"
      // send a person to completely different conclusions about their own data.
      final refusal = refusalFor(
        matchFixture(outflowCurrency: 'QAR', inflowCurrency: 'USD'),
      );
      expect(refusal.code, transferMatchCrossCurrencyCode);
      expect(
        refusalFor(matchFixture(state: MatchState.rejected)).code,
        transferMatchTransitionUnavailableCode,
      );
    });

    test('keeping a cross-currency pair separate is still allowed', () async {
      // Rejecting asserts no relationship and leaves both records untouched,
      // so there is no reason to withhold it — and a pair nobody can answer
      // would sit in the list for ever.
      final harness = listingFor(
        matches: <TransferMatch>[
          matchFixture(outflowCurrency: 'QAR', inflowCurrency: 'USD'),
        ],
      );
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .reject(matchFixtureId);

      expect(harness.repository.rejections, hasLength(1));
    });
  });

  group('pagination follows the platform', () {
    test('a short page with a successor is still followed', () async {
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
          hasMore: true,
        ),
      );
      await harness.container.read(transferMatchListingProvider.future);
      expect(loadedOf(harness.container).hasMore, isTrue);

      await harness.container.read(transferMatchListingProvider.notifier).loadMore();

      expect(harness.repository.requestedCursors, <String?>[null, 'cursor-next']);
      expect(loadedOf(harness.container).rows, hasLength(2));
    });

    test('nothing is followed when the platform says there is nothing more',
        () async {
      final harness = listingFor();
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container.read(transferMatchListingProvider.notifier).loadMore();

      expect(harness.repository.calls, <String>['list']);
    });
  });

  group('one organisation at a time', () {
    test('a discard empties the listing rather than reloading it', () async {
      final harness = listingFor();
      await harness.container.read(transferMatchListingProvider.future);
      expect(loadedOf(harness.container).rows, hasLength(1));

      harness.container.read(tenantDataScopeProvider).discardHeldAnswers();

      expect(
        harness.container.read(transferMatchListingProvider).value,
        isA<TransferMatchesUnavailable>(),
        reason: 'an empty list would be a claim about the organisation the '
            'session has just left',
      );
    });

    test('every tenant-scoped provider this feature holds can empty itself', () {
      // The registry is typed: `tenantScopedAsync` accepts only a
      // `TenantScopedAsyncNotifier`. This asserts the list is not empty and
      // that the feature registered all three, so a provider added later
      // without an entry is visible as a count that did not move.
      expect(transferMatchingProviders(), hasLength(3));
    });

    test('an answer issued under the previous organisation is dropped', () async {
      // The exact production sequence: `discardTenantScopedData` EMPTIES every
      // registered provider and then INVALIDATES it, so the element is already
      // holding the new organisation's listing by the time the previous
      // organisation's write comes back.
      //
      // Riverpod REUSES the notifier instance across that invalidation — only
      // `build` re-runs — so `ref.mounted` is still true and an unguarded
      // `state = …` lands on the live element. The listing is deliberately
      // reloaded here before the answer arrives, because a test that only
      // discarded would pass on the emptied state alone and would prove
      // nothing about the guard.
      final gate = Completer<void>();
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
          confirmResult: Success<TransferMatch>(
            matchFixture(state: MatchState.confirmed, version: 2),
          ),
        )..gate = gate,
      );
      await harness.container.read(transferMatchListingProvider.future);

      final pending = harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);
      await Future<void>.delayed(Duration.zero);

      harness.container.read(tenantDataScopeProvider).discardHeldAnswers();
      harness.container.invalidate(transferMatchListingProvider);
      await harness.container.read(transferMatchListingProvider.future);
      expect(
        loadedOf(harness.container).rows.single.match.state,
        MatchState.suggested,
        reason: 'the reload must have produced a live listing, or the '
            'assertion below is vacuous',
      );

      gate.complete();
      await pending;

      expect(
        rowOf(harness.container).match.state,
        MatchState.suggested,
        reason: 'the confirmation was made under an organisation the session '
            'has left; writing it back would record it as this one\'s',
      );
      expect(rowOf(harness.container).progress, MatchDecisionProgress.idle);
    });

    test('a discard alone leaves nothing for a late answer to land on', () async {
      final gate = Completer<void>();
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          matches: <TransferMatch>[matchFixture()],
        )..gate = gate,
      );
      await harness.container.read(transferMatchListingProvider.future);

      final pending = harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);
      await Future<void>.delayed(Duration.zero);
      harness.container.read(tenantDataScopeProvider).discardHeldAnswers();
      gate.complete();
      await pending;

      expect(
        harness.container.read(transferMatchListingProvider).value,
        isA<TransferMatchesUnavailable>(),
      );
    });
  });

  group('the listing states its own failure', () {
    test('a failed read is a typed unavailable rather than an empty list', () async {
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          listFailure: const DependencyUnavailableFailure(),
        ),
      );

      final listing = await harness.container.read(transferMatchListingProvider.future);

      expect(listing, isA<TransferMatchesUnavailable>());
      expect(
        (listing as TransferMatchesUnavailable).failure,
        isA<DependencyUnavailableFailure>(),
      );
    });

    test('deciding on a listing that is not loaded does nothing', () async {
      final harness = listingFor(
        repository: ScriptedTransferMatchesRepository(
          listFailure: const DependencyUnavailableFailure(),
        ),
      );
      await harness.container.read(transferMatchListingProvider.future);

      await harness.container
          .read(transferMatchListingProvider.notifier)
          .confirm(matchFixtureId);

      expect(harness.repository.confirmations, isEmpty);
    });
  });
}
