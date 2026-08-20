// THE REAL STACK, ON A SYNTHETIC SOCKET.
//
// The container this builds is the application's own composition root. Seven
// providers are overridden and NOT ONE OF THEM IS A REPOSITORY, A MAPPER, A
// USE CASE OR A CONTROLLER:
//
//   * `dioProvider`      — the real `buildDio`, with a scripted adapter in
//                          place of a socket. This is the substitution the
//                          whole suite rests on;
//   * `secureStoreProvider`, `localSecurityStateStoreProvider`,
//     `keyValueStoreProvider` — the platform channels a `flutter_test` process
//                          has no implementation for. Each is replaced by the
//                          in-memory implementation this codebase already
//                          ships for tests;
//   * `configurationResultProvider` — build configuration arrives by
//                          `--dart-define`, which a test process does not
//                          have;
//   * `loggerProvider`   — a recording sink, so the journey can assert that
//                          nothing from a person's statement or credential
//                          reached a log record. Silent is the default, and a
//                          silent logger cannot be checked;
//   * `statementSourcePickerProvider` — the device document picker. The real
//                          adapter is the system document picker over a
//                          platform channel, which exists only on Android and
//                          iOS; on the host this suite runs on the provider
//                          installs the port that reports itself unavailable,
//                          so without a fake there is no step above it to
//                          exercise at all. The feature documents exactly this
//                          substitution.
//
// Everything else — `apiTransportProvider`, `tokenRefreshCoordinatorProvider`,
// `apiClientProvider`, `sessionManagerProvider`, `startupCoordinatorProvider`,
// every financial repository, every mapper, every provider — is the one the
// application composes at launch.
//
// The journey signs in the way the application does: a credential is adopted
// into the real `SessionManager`, and the real `StartupCoordinator` is run. It
// loads the lock choice, restores the credential from the store, calls
// `GET /platform/bootstrap` through the generated client, and resolves the
// capability the financial surface is gated on. Nothing about that is stubbed,
// so a capability gate that opened without an answer would be visible here.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/configuration/app_configuration.dart';
import 'package:karar_mobile/app/configuration/app_environment.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/startup_state.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/dio_api_transport.dart';
import 'package:karar_mobile/core/networking/timeouts.dart';
import 'package:karar_mobile/core/security/local_security_state_store.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_source_picker.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_imports_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../../features/statement_imports/support/statement_import_harness.dart';
import 'synthetic_platform.dart';
import 'synthetic_world.dart';

/// The base URL the journey's requests are addressed to. Reserved TLD, so a
/// misconfigured test cannot reach anything real.
final Uri syntheticApiBaseUrl = Uri.parse('https://synthetic-api.invalid');

/// A credential valid for the whole of a journey.
///
/// It is a string that could not be mistaken for a real token, and the journey
/// asserts it never reaches a log record.
SessionTokens syntheticCredential() => SessionTokens(
      accessToken: 'SYNTHETIC-ACCESS-TOKEN-DO-NOT-LOG',
      accessTokenExpiresAt: DateTime.utc(2099),
      refreshToken: 'SYNTHETIC-REFRESH-TOKEN-DO-NOT-LOG',
      refreshTokenExpiresAt: DateTime.utc(2099),
      sessionId: syntheticSessionId,
    );

/// The application, wired to a synthetic socket.
final class JourneyHarness {
  JourneyHarness._();

  /// Builds the container, installs the world, signs in and runs startup.
  static Future<JourneyHarness> begin({
    void Function(SyntheticPlatform platform)? world,
  }) async {
    final harness = JourneyHarness._();
    (world ?? installSyntheticWorld)(harness.platform);
    await harness._signIn();
    return harness;
  }

  /// The same, for a widget test.
  ///
  /// INSIDE `testWidgets` THE BODY RUNS UNDER A FAKE CLOCK whose microtask
  /// queue only drains when a frame is pumped. A round trip issued before the
  /// first pump — which is what signing in is — would therefore never
  /// complete, and the test would hang rather than fail. `runAsync` puts it
  /// back on the real event loop. Everything the journey drives BY HAND before
  /// or between pumps goes through [offFrame] for the same reason; the reads a
  /// SCREEN issues need none of this, because they resolve while it is being
  /// pumped.
  static Future<JourneyHarness> beginFor(
    WidgetTester tester, {
    void Function(SyntheticPlatform platform)? world,
  }) async {
    final harness = JourneyHarness._();
    (world ?? installSyntheticWorld)(harness.platform);
    await tester.runAsync(harness._signIn);
    return harness;
  }

  /// Runs [action] on the real event loop. See [beginFor].
  Future<void> offFrame(WidgetTester tester, Future<void> Function() action) =>
      tester.runAsync(action);

  final SyntheticPlatform platform = SyntheticPlatform();
  final InMemorySecureStore secureStore = InMemorySecureStore();
  final InMemoryLocalSecurityStateStore securityState =
      InMemoryLocalSecurityStateStore();
  final InMemoryKeyValueStore preferences = InMemoryKeyValueStore();
  final RecordingLogSink logSink = RecordingLogSink();

  late final Dio _dio = buildDio(
    baseUrl: syntheticApiBaseUrl,
    defaultTimeouts: TimeoutProfile.standard,
  )..httpClientAdapter = platform.adapter;

  /// The application's own composition root.
  late final ProviderContainer container = () {
    final built = ProviderContainer(overrides: overrides);
    addTearDown(built.dispose);
    return built;
  }();

  /// The seven substitutions, and nothing else. See the file header.
  late final List<Override> overrides = <Override>[
    configurationResultProvider.overrideWithValue(
      Success<AppConfiguration>(
        AppConfiguration(
          environment: AppEnvironment.dev,
          apiBaseUrl: syntheticApiBaseUrl,
          appVersion: '0.0.0',
          buildNumber: '0',
          brandId: 'synthetic',
        ),
      ),
    ),
    dioProvider.overrideWithValue(_dio),
    secureStoreProvider.overrideWithValue(secureStore),
    localSecurityStateStoreProvider.overrideWithValue(securityState),
    keyValueStoreProvider.overrideWithValue(preferences),
    loggerProvider.overrideWithValue(
      AppLogger(sink: logSink, minimumLevel: LogLevel.trace),
    ),
    // The document picker is a DEVICE capability. On the host this suite runs
    // on there is no native half, so `UnavailableStatementSourcePicker` is what
    // the provider installs and it reports itself unavailable. Overriding the
    // port is the only way any step above it runs at all, and the feature's own
    // documentation says so. No journey here reaches a device picker.
    // It hands over the bytes BY IDENTITY, which is what lets the journey prove
    // the file reaches the socket unaltered.
    statementSourcePickerProvider.overrideWithValue(picker),
  ];

  /// The picker, holding the synthetic statement by identity.
  final FakeStatementSourcePicker picker = FakeStatementSourcePicker(
    PickerOutcomeChosen(
      PickedStatementSource(
        bytes: syntheticStatementBytes,
        declaredMediaType: 'text/csv',
      ),
    ),
  );

  /// Adopts a credential and runs the real startup sequence.
  Future<void> _signIn() async {
    final sessions = container.read(sessionManagerProvider);
    // Reading the coordinator before the credential is adopted is what the
    // application does: it exists for the whole session lifecycle.
    final coordinator = container.read(startupCoordinatorProvider);
    await sessions.adopt(syntheticCredential());
    await coordinator.start();
    expect(
      coordinator.state,
      isA<Ready>(),
      reason: 'the journey could not sign in through the real startup '
          'sequence; every later assertion would be about the wrong state',
    );
  }

  /// Every string any log record rendered, for the leak assertions.
  String get renderedLog =>
      logSink.records.map((LogRecord record) => record.toString()).join('\n');

  /// Mounts [screen] against THIS container, in the product theme and the
  /// product localization delegates.
  ///
  /// `UncontrolledProviderScope` rather than a fresh `ProviderScope`: the
  /// journey has one container, it is already signed in, and a second one
  /// would be a second application that happens to share a socket.
  /// [frames] rather than `pumpAndSettle`, deliberately. Two of the states
  /// this journey passes through hold a perpetual animation — the loading
  /// indicator each balance block shows while its read is in flight — and
  /// `pumpAndSettle` waits for one that will not stop until the read lands,
  /// on a surface large enough to hold the whole portfolio. Pumping a fixed
  /// number of frames advances the same microtasks without depending on the
  /// tree ever going still.
  Future<void> pump(
    WidgetTester tester,
    Widget screen, {
    Locale locale = KararLocalization.english,
    Size surfaceSize = const Size(1200, 8000),
    int frames = 24,
  }) async {
    await tester.binding.setSurfaceSize(surfaceSize);
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final router = GoRouter(
      initialLocation: '/host',
      routes: <RouteBase>[
        GoRoute(
          path: '/',
          builder: (BuildContext context, GoRouterState _) =>
              const SizedBox.shrink(),
        ),
        GoRoute(
          path: '/host',
          builder: (BuildContext context, GoRouterState _) => screen,
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: router,
          locale: locale,
          localizationsDelegates: KararLocalization.localizationsDelegates,
          supportedLocales: KararLocalization.supportedLocales,
          localeResolutionCallback: KararLocalization.resolve,
          theme: KararTheme.light(locale: locale),
          builder: (BuildContext context, Widget? child) =>
              KararThemeScope(child: child ?? const SizedBox.shrink()),
        ),
      ),
    );

    for (var frame = 0; frame < frames; frame++) {
      await tester.pump(const Duration(milliseconds: 16));
    }
  }
}

/// Every string the widget tree actually rendered.
List<String> renderedStrings(WidgetTester tester) => <String>[
      for (final widget in tester.allWidgets)
        if (widget is Text && widget.data != null) widget.data!,
    ];
