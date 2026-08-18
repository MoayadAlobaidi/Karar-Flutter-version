// THE COMPOSITION ROOT'S FEATURE SURFACE.
//
// Three workstreams contribute startup-gate screens, routes and tenant-scoped
// providers, and each expresses its contribution as Riverpod overrides. An
// override REPLACES a provider's value rather than adding to it, so applying
// the sets independently would mean the last one silently discards the rest.
// This file is the single place they are merged, and the only place that
// knows all three exist.
//
// Precedence is explicit rather than positional: identity owns the
// authentication gates, the platform surface owns tenant selection and
// bootstrap-unavailable, session management owns the two security-state gates,
// and the sets are disjoint by construction — the test beside this file fails
// if they ever overlap, rather than letting one quietly win.

import 'package:flutter_riverpod/misc.dart' show Override;

import '../../features/authentication/presentation/routes/identity_module.dart';
import '../../features/platform_bootstrap/presentation/platform_feature_registration.dart';
import '../../features/session_management/presentation/security_state_screens.dart';
import '../../shared/design_system/theme/karar_theme.dart';
import '../dependency_injection/providers.dart';
import '../lifecycle/startup_state.dart';
import '../routing/app_router.dart';

/// Every feature contribution the shell mounts, merged into one override list.
///
/// `platformSurfaceOverrides` takes the other workstreams' contributions as its
/// `additional*` inputs, so exactly one override per provider is produced and
/// the merge happens inside the function that owns the provider's shape.
///
/// The session-management gates are merged here rather than added to either of
/// the other two registration files: the two security-state stages belong to
/// the workstream that owns the states behind them, and neither identity nor
/// the platform surface has any reason to know they exist. The three sets are
/// disjoint, which the test beside this file asserts rather than assumes.
List<Override> featureSurfaceOverrides() => <Override>[
      ...platformSurfaceOverrides(
        additionalRoutes: identityRoutes(),
        additionalStartupScreens: <StartupStage, StartupScreenBuilder>{
          ...identityStartupScreens(),
          ...securityStateStartupScreens(),
        },
      ),
      ...themeOverrides(),
    ];

/// Installs the design system's themes on the shell.
///
/// THE THEME EXISTED AND WAS NEVER INSTALLED. `KararTheme` documents itself as
/// "the ThemeData the application shell installs on MaterialApp", and
/// `lightThemeProvider` documents itself as "null falls back to the framework
/// default; the design-system workstream overrides it". Both were true
/// statements about intent and neither was true of the running application: no
/// override existed, so `MaterialApp` received null and every framework widget
/// outside the Karar component set rendered against Flutter's default palette.
///
/// It was invisible because the component library resolves its tokens from
/// context rather than from `ThemeData`, so the screens built out of Karar
/// components looked correct. What did not was everything else the framework
/// draws for us: text selection handles, the Material date and time pickers,
/// scrollbar thumbs, the default `TextStyle` behind an unstyled `Text`.
///
/// The locale is deliberately not threaded through here. `KararTheme` takes one
/// to pick a font stack, and the shell's locale is not known at composition
/// time; resolving it per-locale belongs with the widget that observes
/// `Localizations`, and is left for whoever needs the Arabic font stack to
/// differ from the Latin one.
List<Override> themeOverrides() => <Override>[
      lightThemeProvider.overrideWithValue(KararTheme.light()),
      darkThemeProvider.overrideWithValue(KararTheme.dark()),
    ];
