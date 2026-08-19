// THE COMPOSITION ROOT'S FEATURE SURFACE.
//
// Four workstreams contribute startup-gate screens, routes, a home surface and
// tenant-scoped providers, and each expresses its contribution as Riverpod
// overrides. An override REPLACES a provider's value rather than adding to it,
// and Riverpod 3 throws outright on a provider overridden twice in one
// container — so applying the sets independently is not merely lossy, it does
// not start. This file is the single place they are merged, and the only place
// that knows all four exist.
//
// Precedence is explicit rather than positional: identity owns the
// authentication gates, the platform surface owns tenant selection and
// bootstrap-unavailable, session management owns the two security-state gates,
// and the sets are disjoint by construction — the test beside this file fails
// if they ever overlap, rather than letting one quietly win.
//
// WHY THE FOUR OVERRIDES ARE ASSEMBLED HERE rather than through
// `platformSurfaceOverrides`. That helper emits all four of them, including the
// home-screen builder, and takes the other workstreams' ROUTES and GATES as
// inputs but not their home surface. The financial workstream wraps the
// platform home rather than replacing it, so it needs the builder slot; adding
// a second `homeScreenBuilderProvider` override alongside the helper's would
// be the duplicate Riverpod rejects. The platform workstream's own pieces are
// still used — `platformFeatureRoutes`, `platformStartupScreens`,
// `platformTenantScopedProviders` and `buildPlatformHomeScreen` are its public
// contributions, and every one of them is merged below.

import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:go_router/go_router.dart';

import '../../features/authentication/presentation/routes/identity_module.dart';
import '../../features/financial_accounts/presentation/financial_feature_registration.dart';
import '../../features/financial_accounts/presentation/financial_home_shell.dart';
import '../../features/platform_bootstrap/presentation/platform_feature_registration.dart';
import '../../features/session_management/presentation/security_state_screens.dart';
import '../../features/statement_imports/presentation/statement_import_feature_registration.dart';
import '../../features/transfer_matching/presentation/transfer_matching_feature_registration.dart';
import '../../shared/design_system/theme/karar_theme.dart';
import '../dependency_injection/providers.dart';
import '../lifecycle/startup_state.dart';
import '../lifecycle/tenant_data_scope.dart';
import '../routing/app_router.dart';

/// Every feature contribution the shell mounts, merged into one override list.
///
/// The session-management gates are merged here rather than added to either of
/// the other registration files: the two security-state stages belong to the
/// workstream that owns the states behind them, and neither identity nor the
/// platform surface has any reason to know they exist. The sets are disjoint,
/// which the test beside this file asserts rather than assumes.
List<Override> featureSurfaceOverrides() => <Override>[
      featureRoutesProvider.overrideWithValue(<RouteBase>[
        ...platformFeatureRoutes(),
        ...identityRoutes(),
        // Contributed unconditionally, and gated inside every builder. The
        // route table is read once when the router is built, so making its
        // shape depend on a runtime capability would rebuild the router — and
        // reset navigation — the moment bootstrap resolved. The gate decides
        // per build instead, before any financial screen is constructed.
        ...financialFeatureRoutes(),
        // Mounted beside the financial routes and gated the same way, but
        // under its own location prefix: the architecture rule that keeps
        // contract paths out of the application tree allows exactly one file
        // to spell `/financial…`, and a second exemption would be a second
        // place a contract path could hide.
        ...statementImportRoutes(),
        ...transferMatchingRoutes(),
      ]),
      startupScreenOverridesProvider.overrideWithValue(
        <StartupStage, StartupScreenBuilder>{
          ...platformStartupScreens(),
          ...identityStartupScreens(),
          ...securityStateStartupScreens(),
        },
      ),
      // The financial shell WRAPS the platform home: without the capability it
      // returns `buildPlatformHomeScreen` unchanged, so the surface a person
      // without it sees is the platform home and nothing else.
      homeScreenBuilderProvider.overrideWithValue(buildFinancialHomeShell),
      tenantScopedDataProvider.overrideWithValue(<TenantScopedProvider>[
        ...platformTenantScopedProviders(),
        ...financialTenantScopedProviders(),
        ...statementImportFeatureTenantScopedProviders(),
        ...transferMatchingTenantScopedProviders(),
      ]),
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
