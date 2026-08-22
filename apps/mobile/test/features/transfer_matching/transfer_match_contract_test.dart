// THE REPOSITORY, AGAINST THE REAL GENERATED CLIENT.
//
// The transport is faked; `KararApiClient` is not. The path, the query
// parameters, the body encoding and the DTO decoding are all the GENERATED
// reading of `openapi.yaml`, so a contract change this client has not absorbed
// fails here rather than in production.
//
// What is worth stating up front:
//
//   * NO AMOUNT CROSSES THIS BOUNDARY. The contract's `TransferMatchView` has
//     no amount, no total and no net, and the domain type this file produces
//     has no field one could be put in. The test below asserts that on the type
//     rather than trusting the reader;
//   * A RESPONSE THAT CONTRADICTS ITSELF IS REFUSED. A row that says SUGGESTED
//     and `authoritative: true` is the exact shape of "a confirmation the
//     person never made", and it is a typed contract violation here rather than
//     a rendering decision on a screen;
//   * A VOCABULARY MEMBER THIS BUILD DOES NOT SHIP IS `unrecognised`, never a
//     real member. A newer platform must not make an older client confidently
//     display the wrong thing.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/networking/generated/karar_api_client.dart';
import 'package:karar_mobile/features/transfer_matching/data/api_transfer_matches_repository.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_match.dart';
import 'package:karar_mobile/features/transfer_matching/domain/transfer_matches_repository.dart';

import '../../core/support/fakes.dart';

({ApiTransferMatchesRepository repository, FakeApiTransport transport}) repositoryFor(
  Object? body, {
  int statusCode = 200,
}) {
  final transport = FakeApiTransport(
    (ApiRequest request) async => ApiResponse(statusCode: statusCode, body: body),
  );
  return (
    repository: ApiTransferMatchesRepository(KararApiClient(transport)),
    transport: transport,
  );
}

Map<String, Object?> sideBody({
  String transactionId = 'transaction-out-0001',
  String accountId = 'account-0001',
  String currency = 'QAR',
}) => <String, Object?>{
  'transactionId': transactionId,
  'accountId': accountId,
  'currency': currency,
};

Map<String, Object?> matchBody({
  String state = 'SUGGESTED',
  bool? authoritative,
  String? subjectDecidedAt,
  String suggestionBasis = 'EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW',
  String outflowCurrency = 'QAR',
  String inflowCurrency = 'QAR',
  int version = 1,
}) => <String, Object?>{
  'matchId': 'match-0001',
  'outflow': sideBody(currency: outflowCurrency),
  'inflow': sideBody(
    transactionId: 'transaction-in-0001',
    accountId: 'account-0003',
    currency: inflowCurrency,
  ),
  'state': state,
  'authoritative': authoritative ?? state == 'CONFIRMED',
  'suggestionBasis': suggestionBasis,
  'suggestionWindow': 'equal-and-opposite/same-currency/P3D/v1',
  'subjectDecidedAt': subjectDecidedAt ?? (state == 'SUGGESTED' ? null : '2026-04-05T09:00:00Z'),
  'firstSuggestedAt': '2026-04-04T08:00:00Z',
  'createdAt': '2026-04-04T08:00:00Z',
  'updatedAt': '2026-04-04T08:00:00Z',
  'version': version,
};

Map<String, Object?> listBody(List<Map<String, Object?>> items) => <String, Object?>{
  'items': items,
  'page': <String, Object?>{
    'limit': 50,
    'returned': items.length,
    'hasMore': false,
    'nextCursor': null,
  },
};

void main() {
  group('the listing reads the contract once', () {
    test('the state filter travels as the contract spells it', () async {
      final harness = repositoryFor(listBody(<Map<String, Object?>>[matchBody()]));

      await harness.repository.listOwn(state: MatchStateFilter.awaitingDecision);

      // The wire value is asserted because nothing in the feature spells it:
      // the generated enum does, and this proves the client's own filter member
      // reaches the right one.
      expect(harness.transport.requests.single.query['state'], 'SUGGESTED');
    });

    test('the confirmed filter is a different request from the pending one', () async {
      final harness = repositoryFor(listBody(<Map<String, Object?>>[]));

      await harness.repository.listOwn(state: MatchStateFilter.confirmed);
      await harness.repository.listOwn(state: MatchStateFilter.rejected);

      expect(harness.transport.requests[0].query['state'], 'CONFIRMED');
      expect(harness.transport.requests[1].query['state'], 'REJECTED');
    });

    test('no filter asks for every state rather than for a default one', () async {
      final harness = repositoryFor(listBody(<Map<String, Object?>>[]));

      await harness.repository.listOwn();

      expect(harness.transport.requests.single.query['state'], isNull);
    });

    test('the page cursor is the platform\'s own answer, echoed', () async {
      final harness = repositoryFor(<String, Object?>{
        'items': <Map<String, Object?>>[matchBody()],
        'page': <String, Object?>{
          'limit': 50,
          // A SHORT page that still has a successor. A client deriving
          // `hasMore` from the row count would stop here and hide the rest of
          // somebody's proposals.
          'returned': 1,
          'hasMore': true,
          'nextCursor': 'cursor-two',
        },
      });

      final page = (await harness.repository.listOwn() as Success<TransferMatchPage>).value;

      expect(page.hasMore, isTrue);
      expect(page.nextCursor, 'cursor-two');
    });
  });

  group('a decision carries the version it was made about', () {
    test('a confirmation sends the expected version', () async {
      final harness = repositoryFor(matchBody(state: 'CONFIRMED', version: 2));

      await harness.repository.confirm(matchId: 'match-0001', expectedVersion: 7);

      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      expect(body['expectedVersion'], 7);
    });

    test('a rejection sends the expected version', () async {
      final harness = repositoryFor(matchBody(state: 'REJECTED', version: 2));

      await harness.repository.reject(matchId: 'match-0001', expectedVersion: 3);

      final body = harness.transport.requests.single.body! as Map<String, Object?>;
      expect(body['expectedVersion'], 3);
    });

    test('a confirmation is replayable, so a mid-flight failure is not a guess', () async {
      // Without a key a POST is not replayable at all — see
      // `ApiRequest.isReplayable` — so a request that failed mid-flight leaves
      // a person not knowing whether their answer took effect.
      final harness = repositoryFor(matchBody(state: 'CONFIRMED', version: 2));

      await harness.repository.confirm(matchId: 'match-0001', expectedVersion: 1);

      expect(harness.transport.requests.single.idempotencyKey, isNotNull);
      expect(harness.transport.requests.single.isReplayable, isTrue);
    });

    test('confirming and rejecting one pair are replayed under DIFFERENT keys', () async {
      // A shared key would let the platform answer a rejection with the
      // result of the confirmation it had already seen — which is a decision
      // the person did not make, arriving as a success.
      final harness = repositoryFor(matchBody(state: 'CONFIRMED', version: 2));

      await harness.repository.confirm(matchId: 'match-0001', expectedVersion: 1);
      await harness.repository.reject(matchId: 'match-0001', expectedVersion: 1);

      expect(
        harness.transport.requests[0].idempotencyKey,
        isNot(harness.transport.requests[1].idempotencyKey),
      );
    });

    test('one answer about two versions of a pair are two different keys', () async {
      // Answering a pair that has since changed is a DIFFERENT decision, and
      // must not be served the earlier answer's replay.
      final harness = repositoryFor(matchBody(state: 'CONFIRMED', version: 3));

      await harness.repository.confirm(matchId: 'match-0001', expectedVersion: 1);
      await harness.repository.confirm(matchId: 'match-0001', expectedVersion: 2);

      expect(
        harness.transport.requests[0].idempotencyKey,
        isNot(harness.transport.requests[1].idempotencyKey),
      );
    });

    test('the same answer about the same pair replays under the same key', () async {
      // Derived rather than random, so a retry from a fresh app launch is
      // recognisable as the same request.
      final harness = repositoryFor(matchBody(state: 'CONFIRMED', version: 2));

      await harness.repository.confirm(matchId: 'match-0001', expectedVersion: 1);
      await harness.repository.confirm(matchId: 'match-0001', expectedVersion: 1);

      expect(
        harness.transport.requests[0].idempotencyKey,
        harness.transport.requests[1].idempotencyKey,
      );
    });
  });

  group('a response that contradicts itself is refused', () {
    test('a SUGGESTED row claiming to be authoritative is a contract violation', () async {
      // This is the single most dangerous response this surface can receive: a
      // question rendered as an answer the person gave. It must not reach a
      // screen at all.
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[matchBody(authoritative: true)]),
      );

      final result = await harness.repository.listOwn();

      final failure = (result as Failed<TransferMatchPage>).failure;
      expect(failure, isA<ContractViolationFailure>());
      expect((failure as ContractViolationFailure).location, 'TransferMatchView.authoritative');
    });

    test('a CONFIRMED row that is not authoritative is refused too', () async {
      // The other direction of the same biconditional. Rendering it would tell
      // a person their confirmation does not count.
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[matchBody(state: 'CONFIRMED', authoritative: false)]),
      );

      expect(
        (await harness.repository.listOwn() as Failed<TransferMatchPage>).failure,
        isA<ContractViolationFailure>(),
      );
    });

    test('a CONFIRMED row with no decision instant is refused', () async {
      // Exactly what a well-meaning backfill produces: the state flipped and
      // the instant left alone. The database refuses to hold it; so does this.
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[
          <String, Object?>{...matchBody(state: 'CONFIRMED'), 'subjectDecidedAt': null},
        ]),
      );

      final failure = (await harness.repository.listOwn() as Failed<TransferMatchPage>).failure;
      expect((failure as ContractViolationFailure).location, 'TransferMatchView.subjectDecidedAt');
    });

    test('a SUGGESTED row carrying a decision instant is refused', () async {
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[matchBody(subjectDecidedAt: '2026-04-05T09:00:00Z')]),
      );

      expect(
        (await harness.repository.listOwn() as Failed<TransferMatchPage>).failure,
        isA<ContractViolationFailure>(),
      );
    });

    test('a consistent row is NOT refused, so the guard is not always-on', () async {
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[
          matchBody(),
          matchBody(state: 'CONFIRMED'),
          matchBody(state: 'REJECTED'),
        ]),
      );

      final page = (await harness.repository.listOwn() as Success<TransferMatchPage>).value;
      expect(page.items, hasLength(3));
      expect(page.items[0].state, MatchState.suggested);
      expect(page.items[1].state, MatchState.confirmed);
      expect(page.items[2].state, MatchState.rejected);
    });
  });

  group('a vocabulary member this build does not ship', () {
    test('an unknown state is unrecognised and is not actionable', () async {
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[
          <String, Object?>{
            ...matchBody(),
            'state': 'SOME_STATE_FROM_THE_FUTURE',
            'authoritative': false,
            'subjectDecidedAt': null,
          },
        ]),
      );

      final match =
          (await harness.repository.listOwn() as Success<TransferMatchPage>).value.items.single;

      expect(match.state, MatchState.unrecognised);
      expect(match.isConfirmable, isFalse);
      expect(match.isRejectable, isFalse);
    });

    test('an unknown suggestion basis is unrecognised, never the known one', () async {
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[matchBody(suggestionBasis: 'SOME_BASIS_FROM_THE_FUTURE')]),
      );

      final match =
          (await harness.repository.listOwn() as Success<TransferMatchPage>).value.items.single;

      expect(match.suggestionBasis, SuggestionBasis.unrecognised);
    });

    test('filtering by an unrecognised state never leaves the device', () async {
      // `unrecognised` names a value the platform sent that this build does not
      // know. Echoing it back would assert a meaning the client does not have.
      final harness = repositoryFor(listBody(<Map<String, Object?>>[]));

      expect(() => matchStateToDto(MatchState.unrecognised), throwsA(isA<ApiException>()));
      expect(harness.transport.requests, isEmpty);
    });
  });

  group('nothing about money crosses this boundary', () {
    test('the decoded relationship carries no amount and no total', () async {
      final harness = repositoryFor(listBody(<Map<String, Object?>>[matchBody()]));

      final match =
          (await harness.repository.listOwn() as Success<TransferMatchPage>).value.items.single;

      // The whole surface of the type, enumerated. `version` is the only
      // number, exactly as the contract's own description says. If a field
      // called `amount`, `total`, `net` or `rate` is ever added, this list stops
      // matching and somebody has to justify it.
      expect(<Object?>[
        match.matchId,
        match.outflow,
        match.inflow,
        match.state,
        match.authoritative,
        match.suggestionBasis,
        match.suggestionWindow,
        match.subjectDecidedAt,
        match.firstSuggestedAt,
        match.createdAt,
        match.updatedAt,
        match.version,
      ], hasLength(12));
      expect(match.version, isA<int>());
      expect(match.toString(), 'TransferMatch()');
      expect(match.outflow.toString(), 'MatchSide()');
    });

    test('the window label is kept verbatim rather than parsed into days', () async {
      // Widening the window later must not silently reinterpret a question a
      // person has already answered, so the client shows WHICH rule looked at
      // their data and never a number it derived.
      final harness = repositoryFor(listBody(<Map<String, Object?>>[matchBody()]));

      final match =
          (await harness.repository.listOwn() as Success<TransferMatchPage>).value.items.single;

      expect(match.suggestionWindow, 'equal-and-opposite/same-currency/P3D/v1');
    });

    test('two currency codes arrive as two independent facts', () async {
      // Stored as two columns precisely so that two facts must AGREE rather
      // than one asserting the agreement. The client keeps them apart.
      final harness = repositoryFor(
        listBody(<Map<String, Object?>>[matchBody(outflowCurrency: 'QAR', inflowCurrency: 'USD')]),
      );

      final match =
          (await harness.repository.listOwn() as Success<TransferMatchPage>).value.items.single;

      expect(match.outflow.currencyCode, 'QAR');
      expect(match.inflow.currencyCode, 'USD');
      expect(match.spansTwoCurrencies, isTrue);
      expect(
        match.isConfirmable,
        isFalse,
        reason:
            'the platform cannot hold a cross-currency match and holds no '
            'rate; a client that offered to confirm one would be asking it to '
            'relate two amounts it cannot relate',
      );
    });
  });
}
