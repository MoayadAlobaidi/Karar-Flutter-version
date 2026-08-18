// THE DTO-TO-APPLICATION MAPPING BOUNDARY.
//
// This file is the worked example every feature repository implementation
// follows:
//
//   1. call the generated client;
//   2. catch `ApiException` and return `Failed(exception.failure)`;
//   3. ALSO catch `FormatException` and `TypeError` — a payload the generated
//      decoder cannot classify (an unknown union discriminator, a field of the
//      wrong type) must become a typed ContractViolation, never an uncaught
//      exception. A server that adds a union branch must degrade the client,
//      not crash it;
//   4. map the generated DTO to a type this layer owns, exhaustively;
//   5. return `Success(mappedValue)`.
//
// The generated DTO does not escape this file. Nothing above it imports
// `core/networking/generated`. Regenerating the client therefore breaks at
// most the mappers, and never a screen or a use case.
//
// Unknown enumeration values are mapped to an explicit `unknown` and NOT to a
// convenient default. The startup coordinator then fails closed on them; a
// mapper that guessed would defeat that.
import '../../core/errors/failure.dart';
import '../../core/errors/result.dart';
import '../../core/networking/api_transport.dart';
import '../../core/networking/generated/karar_api_client.dart';
import '../../core/networking/generated/models.dart';
import '../../core/networking/timeouts.dart';
import 'bootstrap_snapshot.dart';
import 'startup_coordinator.dart';

/// [BootstrapGateway] over the generated client.
final class ApiBootstrapGateway implements BootstrapGateway {
  const ApiBootstrapGateway(this._client);

  final KararApiClient _client;

  @override
  Future<Result<BootstrapSnapshot>> load() async {
    try {
      final dto = await _client.getPlatformBootstrap(timeouts: TimeoutProfile.startup);
      return Success<BootstrapSnapshot>(_toSnapshot(dto));
    } on ApiException catch (exception) {
      return Failed<BootstrapSnapshot>(exception.failure);
    } on FormatException {
      // An unknown union discriminator. The location names the field, never
      // the value the server sent.
      return const Failed<BootstrapSnapshot>(
        ContractViolationFailure(location: 'platform.bootstrap'),
      );
    } on TypeError {
      // A field of an unexpected type. Same treatment: fail closed.
      return const Failed<BootstrapSnapshot>(
        ContractViolationFailure(location: 'platform.bootstrap'),
      );
    }
  }

  static BootstrapSnapshot _toSnapshot(BootstrapContextDto dto) => BootstrapSnapshot(
        userId: dto.user.userId,
        emailVerified: dto.user.emailVerified,
        sessionId: dto.session.sessionId,
        binding: _toBinding(dto.binding),
        jurisdictionState: switch (dto.jurisdiction.state) {
          BootstrapContextJurisdictionStateDto.none => JurisdictionState.none,
          BootstrapContextJurisdictionStateDto.unverified => JurisdictionState.unverified,
          BootstrapContextJurisdictionStateDto.verified => JurisdictionState.verified,
          BootstrapContextJurisdictionStateDto.unknown => JurisdictionState.unknown,
        },
        jurisdictionId: dto.jurisdiction.jurisdictionId,
        operatingEntityState: switch (dto.operatingEntity.state) {
          OperatingEntityStateStateDto.assigned => OperatingEntityState.assigned,
          OperatingEntityStateStateDto.unassigned => OperatingEntityState.unassigned,
          OperatingEntityStateStateDto.unavailable => OperatingEntityState.unavailable,
          OperatingEntityStateStateDto.unknown => OperatingEntityState.unknown,
        },
        operatingEntity: _toOperatingEntity(dto.operatingEntity.entity),
        policyPackVersion: dto.policyPack?.version,
        policyPackStatus: dto.policyPack?.status,
        capabilityState: switch (dto.capabilities.state) {
          CapabilitiesSectionStateDto.resolved => CapabilityResolutionState.resolved,
          CapabilitiesSectionStateDto.unknown => CapabilityResolutionState.unknown,
        },
        capabilities: <CapabilityView>[
          for (final item in dto.capabilities.items)
            CapabilityView(
              id: item.id,
              status: item.status,
              requirements: <String>[
                for (final requirement in item.requirements) requirement.kind,
              ],
            ),
        ],
      );

  static TenantBinding _toBinding(BindingStateDto dto) => switch (dto) {
        BindingStateUnboundDto() => const TenantUnbound(),
        BindingStateBoundDto(:final tenant) => TenantBound(_toTenantOption(tenant)),
        BindingStateTenantSelectionRequiredDto(:final choices) => TenantSelectionRequired(
            <TenantOption>[for (final choice in choices) _toTenantOption(choice)],
          ),
      };

  static TenantOption _toTenantOption(TenantChoiceDto dto) =>
      TenantOption(tenantId: dto.tenantId, name: dto.name, roleHint: dto.roleHint);

  static OperatingEntitySummary? _toOperatingEntity(OperatingEntitySummaryDto? dto) {
    if (dto == null) {
      return null;
    }
    return OperatingEntitySummary(
      id: dto.id,
      name: dto.name,
      jurisdictionRef: dto.jurisdictionRef,
      contactReference: dto.contactReference,
    );
  }
}
