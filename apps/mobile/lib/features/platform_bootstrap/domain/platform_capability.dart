// PURE DART ONLY. See lib/README.md — domain purity.
//
// CAPABILITY VISIBILITY, BY ALLOWLIST.
//
// The client renders exactly what the platform's client-safe view returns and
// nothing else. There is no denylist here, and there must not be one:
//
//   * a hidden capability is structurally ABSENT from the response, not
//     switched off in it (ADR-0016). The server omits it in every state, so
//     the client has nothing to filter;
//   * a name written down in order to suppress it would ship in the compiled
//     artifact, where it discloses the existence of the very thing the design
//     keeps undisclosed;
//   * a denylist protects only the names someone thought to write down, which
//     is the wrong shape for a rule that has to hold for names nobody has
//     invented yet.
//
// So the rule is positive and closed by default: an identifier is rendered
// only if this build registered a destination for it. An identifier this build
// does not recognise produces no destination, is not counted, is not
// summarised, and does not reach any state the presentation layer can read.
//
// The other rule is the one the whole surface rests on: a COMPLETED resolution
// carrying no items is a stated answer and renders as "no services"; a
// resolution that could not be performed is an outage and renders as one.
import 'package:meta/meta.dart';

/// Capability identifiers this build ships a destination for.
///
/// Empty, and correct: no product capability is implemented or deployed in
/// this build, so capability navigation resolves to no destinations. A future
/// build adds an identifier here at the same time as it adds the screen, and
/// `routeFor` throws until it does.
const Set<String> navigableCapabilityIds = <String>{};

/// The wire status that means a capability may be used.
const String capabilityStatusAvailable = 'AVAILABLE';

/// One capability as the platform reported it.
@immutable
final class PlatformCapability {
  const PlatformCapability({
    required this.id,
    required this.status,
    this.requirements = const <String>[],
  });

  final String id;

  /// The platform's own status token. Never inferred and never defaulted.
  final String status;

  /// Actionable requirement kinds. Identifiers only, never prose.
  final List<String> requirements;

  bool get isAvailable => status == capabilityStatusAvailable;

  @override
  bool operator ==(Object other) =>
      other is PlatformCapability &&
      other.id == id &&
      other.status == status &&
      _sameRequirements(other.requirements, requirements);

  @override
  int get hashCode => Object.hash(id, status, Object.hashAll(requirements));

  @override
  String toString() => 'PlatformCapability($id)';
}

bool _sameRequirements(List<String> left, List<String> right) {
  if (left.length != right.length) {
    return false;
  }
  for (var index = 0; index < left.length; index++) {
    if (left[index] != right[index]) {
      return false;
    }
  }
  return true;
}

/// A capability the build can actually navigate to.
@immutable
final class CapabilityDestination {
  const CapabilityDestination({required this.capabilityId, required this.routePath});

  final String capabilityId;
  final String routePath;

  @override
  bool operator ==(Object other) =>
      other is CapabilityDestination &&
      other.capabilityId == capabilityId &&
      other.routePath == routePath;

  @override
  int get hashCode => Object.hash(capabilityId, routePath);

  @override
  String toString() => 'CapabilityDestination($capabilityId)';
}

/// What capability-driven navigation should render.
@immutable
sealed class CapabilityNavigation {
  const CapabilityNavigation();
}

/// The platform answered. [destinations] may be empty, which is an answer and
/// not a failure.
///
/// Only registered identifiers appear. An identifier the build does not
/// recognise is absent from this value entirely — there is deliberately no
/// "unrecognised" list, because a list of them would be a channel for the
/// names it holds.
final class CapabilityNavigationResolved extends CapabilityNavigation {
  const CapabilityNavigationResolved(this.destinations);

  final List<CapabilityDestination> destinations;

  bool get hasDestinations => destinations.isNotEmpty;

  @override
  String toString() => 'CapabilityNavigationResolved(${destinations.length})';
}

/// Resolution did not complete. Nothing capability-gated may render.
final class CapabilityNavigationUnresolved extends CapabilityNavigation {
  const CapabilityNavigationUnresolved();

  @override
  String toString() => 'CapabilityNavigationUnresolved()';
}

/// Turns the platform's capability answer into navigation.
@immutable
final class CapabilityNavigationResolver {
  const CapabilityNavigationResolver({this.navigable = navigableCapabilityIds});

  /// The identifiers this build registered a destination for. Membership is
  /// the ONLY thing that makes a capability renderable.
  final Set<String> navigable;

  /// Whether this build can render [capabilityId] at all.
  bool isNavigable(String capabilityId) => navigable.contains(capabilityId);

  CapabilityNavigation resolve({
    required bool resolutionCompleted,
    required List<PlatformCapability> capabilities,
  }) {
    if (!resolutionCompleted) {
      return const CapabilityNavigationUnresolved();
    }
    final destinations = <CapabilityDestination>[];
    for (final capability in capabilities) {
      if (!capability.isAvailable || !isNavigable(capability.id)) {
        // Unregistered, or not available. Either way it produces nothing, and
        // nothing downstream learns it was in the response.
        continue;
      }
      destinations.add(
        CapabilityDestination(
          capabilityId: capability.id,
          routePath: routeFor(capability.id),
        ),
      );
    }
    return CapabilityNavigationResolved(List<CapabilityDestination>.unmodifiable(destinations));
  }

  /// The route for a navigable capability.
  ///
  /// Unreachable while [navigable] is empty; it throws rather than inventing a
  /// path, so registering an identifier without a screen fails loudly instead
  /// of rendering a row that leads nowhere.
  String routeFor(String capabilityId) =>
      throw StateError('No destination is registered for capability $capabilityId.');
}
