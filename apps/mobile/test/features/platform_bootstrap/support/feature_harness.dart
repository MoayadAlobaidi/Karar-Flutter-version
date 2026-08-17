// The harness for this workstream's screen and provider tests.
//
// It lives under `platform_bootstrap` because that feature owns the composition
// of the surface; the sibling feature suites import it from here rather than
// each growing a copy that can drift.
//
// Two rules the harness enforces on every test that uses it:
//   * direction is never passed in. It is derived by the framework from the
//     locale, which is the only way a test proves that Arabic actually
//     produces an RTL tree;
//   * the provider graph is never built from the composition root. A screen
//     test overrides the leaf providers it needs, so no test can accidentally
//     open a transport, a keystore or a preference store.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/configuration/app_configuration.dart';
import 'package:karar_mobile/app/lifecycle/startup_coordinator.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/security/app_lock.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/core/utilities/clock.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

/// Re-exported so a screen test declares its overrides without importing the
/// Riverpod misc library by hand.
export 'package:flutter_riverpod/misc.dart' show Override;

/// The locales every screen in this workstream is proven in.
const List<Locale> featureLocales = <Locale>[
  KararLocalization.english,
  KararLocalization.arabic,
];

/// Normal, and the largest scale the platform accessibility settings offer.
const List<double> featureTextScales = <double>[1.0, 2.0];

/// The route the screen under test is mounted at.
const String hostRoute = '/host';

/// Mounts [screen] inside the product theme, the product localization
/// delegates and a router, so `context.pop()` and `context.go()` resolve.
/// A surface tall enough that a full page renders without scrolling.
///
/// A lazy list only builds what fits, so on the default 800x600 surface a
/// section below the fold would be absent from the tree and a test asserting
/// on it would fail for a reason that has nothing to do with the code. At the
/// 2x text scale the same page is roughly twice as tall again, which is what
/// this height allows for.
const Size featureSurfaceSize = Size(1000, 4000);

Future<void> pumpFeatureScreen(
  WidgetTester tester,
  Widget screen, {
  List<Override> overrides = const <Override>[],
  Locale locale = KararLocalization.english,
  double textScale = 1.0,
  bool settle = true,
  Size surfaceSize = featureSurfaceSize,
}) async {
  await tester.binding.setSurfaceSize(surfaceSize);
  addTearDown(() => tester.binding.setSurfaceSize(null));

  final router = GoRouter(
    initialLocation: hostRoute,
    routes: <RouteBase>[
      GoRoute(
        path: '/',
        builder: (BuildContext context, GoRouterState _) => const SizedBox.shrink(),
      ),
      GoRoute(path: hostRoute, builder: (BuildContext context, GoRouterState _) => screen),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: overrides,
      child: MaterialApp.router(
        routerConfig: router,
        locale: locale,
        localizationsDelegates: KararLocalization.localizationsDelegates,
        supportedLocales: KararLocalization.supportedLocales,
        localeResolutionCallback: KararLocalization.resolve,
        theme: KararTheme.light(locale: locale),
        builder: (BuildContext context, Widget? child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(textScale),
          ),
          child: KararThemeScope(child: child ?? const SizedBox.shrink()),
        ),
      ),
    ),
  );

  if (settle) {
    await tester.pumpAndSettle();
  } else {
    // A perpetual animation — a spinner — never settles. Two frames are enough
    // for the localization delegates to load.
    await tester.pump();
    await tester.pump();
  }
}

/// Declares one test per shipped locale, and per text scale when more than one
/// is requested.
void testInBothDirections(
  String description,
  Future<void> Function(WidgetTester tester, Locale locale, double textScale) body, {
  List<double> textScales = const <double>[1.0],
}) {
  for (final locale in featureLocales) {
    for (final scale in textScales) {
      final suffix = textScales.length == 1
          ? locale.languageCode
          : '${locale.languageCode} @${scale}x';
      testWidgets('$description [$suffix]', (WidgetTester tester) async {
        await body(tester, locale, scale);
      });
    }
  }
}

/// The direction the framework resolved for the subtree under [finder].
TextDirection directionUnder(WidgetTester tester, Finder finder) =>
    Directionality.of(tester.element(finder));

/// Asserts that no widget in the tree renders a semantics node or text whose
/// content matches [pattern].
void expectNothingMatching(WidgetTester tester, Pattern pattern, {required String because}) {
  final offenders = <String>[];
  for (final widget in tester.allWidgets) {
    if (widget is Text) {
      final data = widget.data;
      if (data != null && data.contains(pattern)) {
        offenders.add(data);
      }
    }
    if (widget is Semantics) {
      final label = widget.properties.label;
      if (label != null && label.contains(pattern)) {
        offenders.add(label);
      }
    }
  }
  expect(offenders, isEmpty, reason: because);
}

/// A token store held in memory. Nothing here touches a keystore.
final class InMemoryTokenStore implements TokenStore {
  SessionTokens? _tokens;

  SessionTokens? get tokens => _tokens;

  int writes = 0;
  int clears = 0;

  @override
  Future<Result<SessionTokens?>> read() async => Success<SessionTokens?>(_tokens);

  @override
  Future<Result<void>> write(SessionTokens tokens) async {
    writes++;
    _tokens = tokens;
    return const Success<void>(null);
  }

  @override
  Future<Result<void>> clear() async {
    clears++;
    _tokens = null;
    return const Success<void>(null);
  }

  /// This fake always succeeds, so the abandonment is trivially recorded.
  @override
  bool get abandonmentIsRecorded => true;
}

/// A real startup coordinator wired to in-memory doubles.
///
/// `StartupCoordinator` is final, so it cannot be subclassed and must not be:
/// a test that stubbed it would stop proving that a tenant change actually
/// re-reads bootstrap. This builds the real one and lets the fake gateway
/// count the re-reads.
StartupCoordinator buildTestCoordinator({
  required SessionManager sessionManager,
  required BootstrapGateway gateway,
}) =>
    StartupCoordinator(
      loadConfiguration: () => const Failed<AppConfiguration>(
        ConfigurationInvalidFailure(violations: <String>[]),
      ),
      appLock: AppLockGate(preferences: InMemoryKeyValueStore()),
      sessionManager: sessionManager,
      bootstrapGateway: gateway,
      logger: AppLogger.silent,
      clock: const SystemClock(),
    );

/// A session credential that is valid for the whole of a test.
SessionTokens liveTokens({String sessionId = 'session-1'}) => SessionTokens(
      accessToken: 'access',
      accessTokenExpiresAt: DateTime.utc(2999),
      refreshToken: 'refresh',
      refreshTokenExpiresAt: DateTime.utc(2999),
      sessionId: sessionId,
    );

/// Yields to the event loop so scheduled futures complete.
Future<void> settleMicrotasks() => Future<void>.delayed(Duration.zero);
