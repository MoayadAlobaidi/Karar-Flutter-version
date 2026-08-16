// THE COMPOSITION ROOT'S FEATURE SURFACE.
//
// Two workstreams contribute startup-gate screens, routes and tenant-scoped
// providers, and both express their contribution as Riverpod overrides. An
// override REPLACES a provider's value rather than adding to it, so applying
// both sets independently would mean the second silently discards the first.
// This file is the single place they are merged, and the only place that
// knows both exist.
//
// Precedence is explicit rather than positional: identity owns the
// authentication gates, the platform surface owns tenant selection and
// bootstrap-unavailable, and the two sets are disjoint by construction — the
// test beside this file fails if they ever overlap, rather than letting one
// quietly win.

import 'package:flutter_riverpod/misc.dart' show Override;

import '../../features/authentication/presentation/routes/identity_module.dart';
import '../../features/platform_bootstrap/presentation/platform_feature_registration.dart';

/// Every feature contribution the shell mounts, merged into one override list.
///
/// `platformSurfaceOverrides` takes the identity contributions as its
/// `additional*` inputs, so exactly one override per provider is produced and
/// the merge happens inside the function that owns the provider's shape.
List<Override> featureSurfaceOverrides() => platformSurfaceOverrides(
      additionalRoutes: identityRoutes(),
      additionalStartupScreens: identityStartupScreens(),
    );
