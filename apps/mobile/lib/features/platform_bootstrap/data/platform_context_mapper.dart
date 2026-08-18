// The mapping boundary between the shell's bootstrap answer and this
// feature's domain.
//
// `BootstrapSnapshot` is the shell's published view of `GET /platform/bootstrap`
// (see app/lifecycle/api_bootstrap_gateway.dart, which owns the DTO decode).
// This mapper is the second and last hop: it converts that view into types the
// feature owns, so a change to either side is absorbed in one file.
//
// The distinction this mapper exists to preserve:
//
//   * `RESOLVED` with an empty item list is a STATED answer. It maps to
//     `CapabilityNavigationResolved` with no destinations, which the surface
//     renders as "no services are available to you".
//   * A capability state this build cannot classify maps to
//     `CapabilityNavigationUnresolved`, which renders nothing capability-gated
//     at all. The startup coordinator has already refused to reach READY in
//     that case; the mapper does not soften it on the way through.
//
// A 503 never reaches this mapper. It is a typed failure that stops at the
// startup coordinator and produces the service-unavailable surface instead.
import '../../../app/lifecycle/bootstrap_snapshot.dart';
import '../domain/platform_capability.dart';
import '../domain/platform_context.dart';

/// Maps the shell's bootstrap snapshot onto [PlatformContext].
final class PlatformContextMapper {
  const PlatformContextMapper({this.resolver = const CapabilityNavigationResolver()});

  final CapabilityNavigationResolver resolver;

  PlatformContext toContext(BootstrapSnapshot snapshot) {
    final capabilities = <PlatformCapability>[
      for (final capability in snapshot.capabilities)
        PlatformCapability(
          id: capability.id,
          status: capability.status,
          requirements: List<String>.unmodifiable(capability.requirements),
        ),
    ];

    return PlatformContext(
      userId: snapshot.userId,
      sessionId: snapshot.sessionId,
      emailVerified: snapshot.emailVerified,
      tenant: _toTenantContext(snapshot.binding),
      jurisdiction: JurisdictionStatus(
        state: switch (snapshot.jurisdictionState) {
          JurisdictionState.none => PlatformJurisdictionState.none,
          JurisdictionState.unverified => PlatformJurisdictionState.unverified,
          JurisdictionState.verified => PlatformJurisdictionState.verified,
          JurisdictionState.unknown => PlatformJurisdictionState.unrecognised,
        },
        jurisdictionId: snapshot.jurisdictionId,
      ),
      operatingEntity: _toOperatingEntity(
        snapshot.operatingEntityState,
        snapshot.operatingEntity,
      ),
      policyPack: PolicyPackStatus(
        version: snapshot.policyPackVersion,
        status: snapshot.policyPackStatus,
      ),
      navigation: resolver.resolve(
        resolutionCompleted:
            snapshot.capabilityState == CapabilityResolutionState.resolved,
        capabilities: capabilities,
      ),
    );
  }

  static TenantContext _toTenantContext(TenantBinding binding) => switch (binding) {
        TenantBound(:final tenant) => TenantContextBound(_toOption(tenant)),
        TenantUnbound() => const TenantContextUnbound(),
        TenantSelectionRequired(:final choices) => TenantContextSelectionRequired(
            List<TenantMembershipOption>.unmodifiable(
              <TenantMembershipOption>[for (final choice in choices) _toOption(choice)],
            ),
          ),
      };

  static TenantMembershipOption _toOption(TenantOption option) => TenantMembershipOption(
        tenantId: option.tenantId,
        name: option.name,
        roleHint: option.roleHint,
      );

  /// An ASSIGNED state without an entity is a contradiction the client refuses
  /// to paper over: it is treated as unavailable rather than rendered as an
  /// assigned entity with a blank name.
  static OperatingEntityContext _toOperatingEntity(
    OperatingEntityState state,
    OperatingEntitySummary? summary,
  ) =>
      switch (state) {
        OperatingEntityState.assigned => summary == null
            ? const OperatingEntityUnavailable()
            : OperatingEntityAssigned(
                OperatingEntityDetails(
                  id: summary.id,
                  name: summary.name,
                  jurisdictionRef: summary.jurisdictionRef,
                  contactReference: summary.contactReference,
                ),
              ),
        OperatingEntityState.unassigned => const OperatingEntityUnassigned(),
        OperatingEntityState.unavailable => const OperatingEntityUnavailable(),
        OperatingEntityState.unknown => const OperatingEntityUnrecognised(),
      };
}
