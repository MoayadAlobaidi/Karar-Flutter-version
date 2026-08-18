// THE STARTUP SEQUENCE.
//
// Order matters and is fixed:
//   1. bind the framework;
//   2. install error handlers, so a failure during the rest of this sequence
//      is reported rather than lost;
//   3. load and VALIDATE build configuration — a failure here becomes a
//      CONFIG_INVALID state, not a crash and not a fallback endpoint;
//   4. open non-sensitive preference storage;
//   5. open durable local SECURITY state — separately, and with no fallback:
//      a failure here becomes a LOCAL_SECURITY_STATE_UNAVAILABLE state rather
//      than an invented answer about whether the application lock is on;
//   6. build the composition root;
//   7. start the coordinator and run the shell.
//
// The application ALWAYS reaches a rendered state, including when
// configuration is invalid: a deterministic error screen is a better failure
// than a white rectangle, and it still reaches no protected content.
//
// No analytics, crash-reporting, advertising or fingerprinting SDK is
// installed here, or anywhere else. Errors go to the redacting logger.
import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// `Override` is exported from the misc library rather than the root one.
import 'package:flutter_riverpod/misc.dart' show Override;

import '../../core/errors/result.dart';
import '../../core/logging/app_logger.dart';
import '../../core/storage/preferences_key_value_store.dart';
import '../../core/storage/preferences_local_security_state_store.dart';
import '../../features/session_management/presentation/app_lock_providers.dart';
import '../configuration/app_configuration.dart';
import '../dependency_injection/providers.dart';
import '../lifecycle/startup_coordinator.dart';
import 'karar_app.dart';

/// Boots the application.
///
/// [overrides] lets an integration test or a feature workstream substitute
/// providers without touching this file.
Future<void> bootstrapKararApp({List<Override> overrides = const <Override>[]}) async {
  await runZonedGuarded<Future<void>>(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      final configuration = loadCompiledConfiguration();
      final logger = buildLogger(configuration);
      installErrorHandlers(logger);

      final preferences = await PreferencesKeyValueStore.open(logger: logger);
      // Opened as its own step, through its own port. The preference store
      // above may quietly degrade to memory when the platform refuses, because
      // losing a theme costs a tap; this one reports the failure, because
      // losing the lock choice would open a gate.
      final securityState =
          await PreferencesLocalSecurityStateStore.open(logger: logger);

      final container = ProviderContainer(
        overrides: <Override>[
          configurationResultProvider.overrideWithValue(configuration),
          keyValueStoreProvider.overrideWithValue(preferences),
          localSecurityStateStoreProvider.overrideWithValue(securityState),
          loggerProvider.overrideWithValue(logger),
          ...overrides,
        ],
      );

      // Reading the coordinator constructs it and, with it, the whole
      // dependency graph the shell needs before its first frame.
      final coordinator = container.read(startupCoordinatorProvider);
      unawaited(coordinator.start());

      // The app-lock watcher must observe the whole process: the app is most
      // often backgrounded from protected content, so no individual screen is
      // reliably mounted at that moment. Installing it on the container rather
      // than in the tree is what makes the lock apply everywhere.
      container.read(appLockBackgroundWatcherProvider).attach();

      runApp(
        UncontrolledProviderScope(
          container: container,
          child: const KararApp(),
        ),
      );
    },
    (Object error, StackTrace stackTrace) {
      // Last resort. The logger may not exist yet, so this uses the silent
      // default rather than risking a second failure inside the handler.
      AppLogger.silent.log(
        LogLevel.error,
        'bootstrap',
        'Unhandled error escaped the application zone.',
        error: error,
        stackTrace: stackTrace,
      );
    },
  );
}

/// Chooses a diagnostics sink for the resolved configuration.
///
/// PRODUCTION is silent: the client emits no diagnostics, to any sink, in a
/// customer build. An invalid configuration is also treated as production for
/// this purpose — an unknown build is the one least safe to make chatty.
AppLogger buildLogger(Result<AppConfiguration> configuration) {
  final isProduction = switch (configuration) {
    Success<AppConfiguration>(:final value) => value.isProduction,
    Failed<AppConfiguration>() => true,
  };
  if (isProduction) {
    return const AppLogger(sink: NoopLogSink(), minimumLevel: LogLevel.error);
  }
  return const AppLogger(
    sink: DeveloperLogSink(),
    minimumLevel: kDebugMode ? LogLevel.debug : LogLevel.info,
  );
}

/// Routes framework and platform errors to [logger].
///
/// The error's TYPE is recorded, never its message: a framework error message
/// routinely embeds the value that caused it.
void installErrorHandlers(AppLogger logger) {
  final log = logger.forCategory('bootstrap');
  FlutterError.onError = (FlutterErrorDetails details) {
    log.error(
      'Framework error.',
      fields: <String, Object?>{'library': details.library},
      error: details.exception,
      stackTrace: details.stack,
    );
  };
  PlatformDispatcher.instance.onError = (Object error, StackTrace stackTrace) {
    log.error('Platform error.', error: error, stackTrace: stackTrace);
    // Returning true marks the error handled; the zone handler above is the
    // fallback for anything raised before this point.
    return true;
  };
}

/// Runs the coordinator to completion once, for a test or a warm restart.
Future<void> startCoordinator(StartupCoordinator coordinator) => coordinator.start();
