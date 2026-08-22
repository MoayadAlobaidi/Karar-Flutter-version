// THE CONNECTIONS REPOSITORY, OVER THE GENERATED CLIENT.
//
// Requests are issued by `KararApiClient`, which is generated from
// `openapi.yaml`. No path, no query-parameter name and no enumeration wire
// value is written by hand here: each would be a SECOND reading of a contract
// that already has one, and two readings do not fail when they disagree — they
// diverge quietly.
//
// EVERY VOCABULARY MAPPING IS AN EXHAUSTIVE `switch` WITH NO `default` ARM. The
// day the contract gains a member, regeneration adds it to the generated enum
// and this file stops compiling until somebody decides what it means. A `Map`
// with a fallback compiles happily and answers "unrecognised" forever.
//
// ## Three contradictions are refused rather than rendered
//
// This surface's whole job is to be honest about what the platform can and
// cannot do, so a response that contradicts the contract's own claims is a
// typed failure here rather than a rendering decision on a screen:
//
//   * `impliesLiveInstitutionLink` is `false` for every value of every status
//     vocabulary on this surface — the contract pins the field to that single
//     value. A response saying otherwise would render as "connected to your
//     bank", which is the exact harm the whole module exists to prevent;
//   * `providerAccessStatus` has one permitted value, NOT_IMPLEMENTED. A
//     response claiming provider access would be claiming an integration that
//     does not exist anywhere in this platform;
//   * a RAIL AND ITS AVAILABILITY MUST AGREE with the one split the contract
//     states and the database enforces — EXECUTABLE for MANUAL and
//     USER_FILE_UPLOAD, NOT_IMPLEMENTED for every other rail. A bank rail
//     arriving as EXECUTABLE is drift about the one field that separates "you
//     typed this in" from "an institution sent it".
//
// None of the three invents a value. Each refuses the response and names the
// field that drifted, which `guarded` turns into a typed failure.
//
// The unrecognised arms make no claim at all: a rail or an availability this
// build does not know is not compared against anything, because a newer
// platform must not break an older client.
import '../../../core/errors/result.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../financial_accounts/data/api_financial_accounts_repository.dart'
    show connectionRailFromDto, railAvailabilityFromDto;
import '../../financial_accounts/data/contract_mapping.dart';
import '../domain/financial_connection.dart';
import '../domain/financial_connections_repository.dart';
import '../domain/rail_standing.dart';

/// [FinancialConnectionsRepository] over the generated client.
final class ApiFinancialConnectionsRepository
    implements FinancialConnectionsRepository {
  const ApiFinancialConnectionsRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<FinancialConnectionPage>> listOwn({
    ConnectionStatusFilter? status,
    int? limit,
    String? cursor,
  }) =>
      guarded<FinancialConnectionPage>('financialConnections.list', () async {
        final response = await _client.listOwnFinancialConnections(
          limit: limit,
          cursor: cursor,
          status: status == null ? null : connectionStatusToDto(status.status),
        );
        return FinancialConnectionPage(
          items: List<FinancialConnection>.unmodifiable(<FinancialConnection>[
            for (final item in response.items) financialConnectionFromDto(item),
          ]),
          hasMore: response.page.hasMore,
          nextCursor: response.page.nextCursor,
        );
      });
}

// ---------------------------------------------------------------------------
// Vocabularies, domain → contract
// ---------------------------------------------------------------------------

/// The status a listing is narrowed to.
///
/// `unrecognised` has no wire form by construction — it exists only to name a
/// value the platform sent that this build does not know — so asking to FILTER
/// by one is a client defect and is refused before a request leaves rather than
/// being sent as some nearby member.
ConnectionStatusDto connectionStatusToDto(ConnectionStatus status) =>
    switch (status) {
      ConnectionStatus.active => ConnectionStatusDto.active,
      ConnectionStatus.notConfigured => ConnectionStatusDto.notConfigured,
      ConnectionStatus.unavailable => ConnectionStatusDto.unavailable,
      ConnectionStatus.retired => ConnectionStatusDto.retired,
      ConnectionStatus.notImplemented => ConnectionStatusDto.notImplemented,
      ConnectionStatus.unrecognised => throw unwritableVocabularyMember('status'),
    };

// ---------------------------------------------------------------------------
// Vocabularies, contract → domain
// ---------------------------------------------------------------------------

/// The five lifecycle values, kept five.
///
/// NOT_CONFIGURED, UNAVAILABLE and NOT_IMPLEMENTED are three different answers.
/// Folding any pair of them together here would destroy the distinction before
/// a label ever saw it, and no screen could get it back.
ConnectionStatus connectionStatusFromDto(ConnectionStatusDto dto) => switch (dto) {
      ConnectionStatusDto.active => ConnectionStatus.active,
      ConnectionStatusDto.notConfigured => ConnectionStatus.notConfigured,
      ConnectionStatusDto.unavailable => ConnectionStatus.unavailable,
      ConnectionStatusDto.retired => ConnectionStatus.retired,
      ConnectionStatusDto.notImplemented => ConnectionStatus.notImplemented,
      ConnectionStatusDto.unknown => ConnectionStatus.unrecognised,
    };

/// The contract's single permitted provider-access value, read as a boolean.
///
/// `NOT_IMPLEMENTED` is the only member the schema allows, so the honest
/// boolean is a constant false — and `unknown` is false as well, because a
/// value this build cannot read is not evidence that anything was implemented.
bool providerAccessImplementedFromDto(
  InstitutionLinkClaimProviderAccessStatusDto dto,
) =>
    switch (dto) {
      InstitutionLinkClaimProviderAccessStatusDto.notImplemented => false,
      InstitutionLinkClaimProviderAccessStatusDto.unknown => false,
    };

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

/// One connection, with all three contract claims checked on the way in.
FinancialConnection financialConnectionFromDto(ConnectionSummaryViewDto dto) {
  if (dto.link.impliesLiveInstitutionLink) {
    // The contract pins this field to `false`. A response that flipped it is
    // asserting a live institution link, and rendering one is the single worst
    // thing this surface could do.
    throw contractViolation('ConnectionSummaryView.link.impliesLiveInstitutionLink');
  }
  if (providerAccessImplementedFromDto(dto.link.providerAccessStatus)) {
    throw contractViolation('ConnectionSummaryView.link.providerAccessStatus');
  }
  final rail = connectionRailFromDto(dto.rail);
  final availability = railAvailabilityFromDto(dto.availability);
  if (railContradictsAvailability(rail, availability)) {
    throw contractViolation('ConnectionSummaryView.availability');
  }
  return FinancialConnection(
    connectionId: dto.connectionId,
    rail: rail,
    availability: availability,
    status: connectionStatusFromDto(dto.status),
    displayLabel: dto.displayLabel,
    institutionId: dto.institutionId,
    impliesLiveInstitutionLink: dto.link.impliesLiveInstitutionLink,
    providerAccessImplemented:
        providerAccessImplementedFromDto(dto.link.providerAccessStatus),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    version: dto.version,
  );
}
