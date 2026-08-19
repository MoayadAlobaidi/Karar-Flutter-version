// THE TRANSFER-MATCHING REPOSITORY, OVER THE GENERATED CLIENT.
//
// Requests are issued by `KararApiClient`, which is generated from
// `openapi.yaml`. No path, no query-parameter name, no body field name and no
// enumeration wire value is written by hand here: each would be a SECOND
// reading of a contract that already has one, and two readings do not fail when
// they disagree — they diverge quietly.
//
// What IS written by hand is the mapping from the generated DTOs to the domain,
// and it lives in this file and nowhere else.
//
// EVERY VOCABULARY MAPPING IS AN EXHAUSTIVE `switch` WITH NO `default` ARM. The
// day the contract gains a member, regeneration adds it to the generated enum
// and this file stops compiling until somebody decides what it means. A `Map`
// with a fallback compiles happily and answers "unrecognised" forever.
//
// ## Two contradictions are refused rather than rendered
//
// The contract states two invariants about a match, and the database enforces
// both with CHECK constraints. This client checks them AGAIN on the way in, and
// the reason is specific rather than defensive habit:
//
//   * `authoritative` is true ONLY for CONFIRMED. A response in which a
//     SUGGESTED row claims to be authoritative would render as a decision the
//     person never made. That is precisely the harm the whole module is built
//     to prevent, so it is a contract violation here rather than a rendering
//     choice;
//   * a DECIDED state carries a decision instant and a SUGGESTED one does not
//     (`transfer_matches_decision_instant_matches_state`). A CONFIRMED row with
//     no instant is what a well-meaning backfill produces, and displaying it
//     would put a date-less "you confirmed this" in front of somebody who did
//     not.
//
// Neither check invents a value. Both refuse the response and name the field
// that drifted, which is what `guarded` turns into a typed failure.
import '../../../core/errors/result.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../financial_accounts/data/contract_mapping.dart';
import '../domain/transfer_match.dart';
import '../domain/transfer_matches_repository.dart';

/// [TransferMatchesRepository] over the generated client.
final class ApiTransferMatchesRepository implements TransferMatchesRepository {
  const ApiTransferMatchesRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<TransferMatchPage>> listOwn({
    MatchStateFilter? state,
    int? limit,
    String? cursor,
  }) =>
      guarded<TransferMatchPage>('transferMatches.list', () async {
        final response = await _client.listOwnTransferMatches(
          limit: limit,
          cursor: cursor,
          state: state == null ? null : matchStateToDto(state.state),
        );
        return TransferMatchPage(
          items: List<TransferMatch>.unmodifiable(<TransferMatch>[
            for (final item in response.items) transferMatchFromDto(item),
          ]),
          hasMore: response.page.hasMore,
          nextCursor: response.page.nextCursor,
        );
      });

  @override
  Future<Result<TransferMatch>> confirm({
    required String matchId,
    required int expectedVersion,
  }) =>
      guarded<TransferMatch>(
        'transferMatches.confirm',
        () async => transferMatchFromDto(
          await _client.confirmOwnTransferMatch(
            matchId: matchId,
            body: ConfirmOwnTransferMatchRequestDto(
              expectedVersion: expectedVersion,
            ),
            idempotencyKey: decisionKey(
              verb: confirmationVerb,
              matchId: matchId,
              expectedVersion: expectedVersion,
            ),
          ),
        ),
      );

  @override
  Future<Result<TransferMatch>> reject({
    required String matchId,
    required int expectedVersion,
  }) =>
      guarded<TransferMatch>(
        'transferMatches.reject',
        () async => transferMatchFromDto(
          await _client.rejectOwnTransferMatch(
            matchId: matchId,
            body: RejectOwnTransferMatchRequestDto(
              expectedVersion: expectedVersion,
            ),
            idempotencyKey: decisionKey(
              verb: rejectionVerb,
              matchId: matchId,
              expectedVersion: expectedVersion,
            ),
          ),
        ),
      );
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/// The key one decision is replayed under.
///
/// A POST is not replayable without one — see `ApiRequest.isReplayable` — so a
/// request that fails mid-flight cannot be reissued and the person is left not
/// knowing whether their answer took effect. That is a poor outcome for a form
/// field and an unacceptable one for a decision about somebody's own money.
///
/// DERIVED rather than random, and it names three things: WHICH answer, about
/// WHICH pair, at WHICH version of it. Each part is load-bearing:
///
///   * the verb, because confirming and rejecting the same pair are two
///     different operations and a shared key would let the platform answer one
///     with the other's result;
///   * the pair, because two pairs are two decisions;
///   * the version, because answering a pair that has since changed is a
///     DIFFERENT decision from the one this key stands for — and the platform
///     is going to refuse it as a version conflict, which is the answer the
///     person needs rather than a replayed success from before the change.
///
/// Being derived is what makes it survive an app restart: the same answer,
/// retried from a fresh launch, is retried under the same key.
String decisionKey({
  required String verb,
  required String matchId,
  required int expectedVersion,
}) =>
    '$verb.$matchId.$expectedVersion';

/// The two verbs, spelled once.
const String confirmationVerb = 'confirm';
const String rejectionVerb = 'reject';

// ---------------------------------------------------------------------------
// Vocabularies, domain → contract
// ---------------------------------------------------------------------------

/// The state a listing is narrowed to.
///
/// `unrecognised` has no wire form by construction — it exists only to name a
/// value the platform sent that this build does not know — so asking to FILTER
/// by one is a client defect and is refused before a request leaves rather than
/// being sent as some nearby member.
MatchStateDto matchStateToDto(MatchState state) => switch (state) {
      MatchState.suggested => MatchStateDto.suggested,
      MatchState.confirmed => MatchStateDto.confirmed,
      MatchState.rejected => MatchStateDto.rejected,
      MatchState.unrecognised => throw unwritableVocabularyMember('state'),
    };

// ---------------------------------------------------------------------------
// Vocabularies, contract → domain
// ---------------------------------------------------------------------------

MatchState matchStateFromDto(MatchStateDto dto) => switch (dto) {
      MatchStateDto.suggested => MatchState.suggested,
      MatchStateDto.confirmed => MatchState.confirmed,
      MatchStateDto.rejected => MatchState.rejected,
      MatchStateDto.unknown => MatchState.unrecognised,
    };

SuggestionBasis suggestionBasisFromDto(SuggestionBasisDto dto) => switch (dto) {
      SuggestionBasisDto.equalAndOppositeSameCurrencyWithinWindow =>
        SuggestionBasis.equalAndOppositeSameCurrencyWithinWindow,
      SuggestionBasisDto.unknown => SuggestionBasis.unrecognised,
    };

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

/// One side of a relationship.
MatchSide matchSideFromDto(MatchSideViewDto dto) => MatchSide(
      transactionId: dto.transactionId,
      accountId: dto.accountId,
      currencyCode: dto.currency,
    );

/// One relationship, with both contract invariants checked on the way in.
TransferMatch transferMatchFromDto(TransferMatchViewDto dto) {
  final state = matchStateFromDto(dto.state);
  if (dto.authoritative != (state == MatchState.confirmed)) {
    // `authoritative` is the platform's own word for "this counts". Rendering a
    // row whose two answers disagree would mean choosing one of them, and
    // either choice shows the person something nobody said.
    throw contractViolation('TransferMatchView.authoritative');
  }
  if (_decisionInstantContradictsState(state, dto.subjectDecidedAt)) {
    throw contractViolation('TransferMatchView.subjectDecidedAt');
  }
  return TransferMatch(
    matchId: dto.matchId,
    outflow: matchSideFromDto(dto.outflow),
    inflow: matchSideFromDto(dto.inflow),
    state: state,
    authoritative: dto.authoritative,
    suggestionBasis: suggestionBasisFromDto(dto.suggestionBasis),
    suggestionWindow: dto.suggestionWindow,
    subjectDecidedAt: dto.subjectDecidedAt,
    firstSuggestedAt: dto.firstSuggestedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    version: dto.version,
  );
}

/// `(state = SUGGESTED) = (subjectDecidedAt IS NULL)`, as the database states
/// it.
///
/// A state this build does not recognise makes NO claim either way: the client
/// cannot know whether a member added after it shipped is a decided one, and
/// inventing an answer is exactly what the `unrecognised` member exists to
/// avoid.
bool _decisionInstantContradictsState(MatchState state, DateTime? decidedAt) =>
    switch (state) {
      MatchState.suggested => decidedAt != null,
      MatchState.confirmed => decidedAt == null,
      MatchState.rejected => decidedAt == null,
      MatchState.unrecognised => false,
    };
