// A LAUNCH THAT DEEP LINKS CAN BE POINTED AT.
//
// The router here is the application's own — `routerProvider` over
// `featureSurfaceOverrides()` — driven by the real `StartupCoordinator`. The
// capability answer is therefore DERIVED from bootstrap through
// `financialBootstrapProvider` rather than injected, which is the difference
// between proving that a deep link is authorised and proving that a test
// remembered to say it was not.
//
// Only the leaves are doubles: the transport, the secure store, the preference
// stores, the bootstrap gateway and the financial repositories. No socket is
// opened and no keystore is touched.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:karar_mobile/app/composition/feature_surface.dart';
import 'package:karar_mobile/app/configuration/app_configuration.dart';
import 'package:karar_mobile/app/configuration/app_environment.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/app/lifecycle/startup_coordinator.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/security/local_security_state_store.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/core/utilities/clock.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_providers.dart';
import 'package:karar_mobile/features/payment_instruments/presentation/instruments_providers.dart';
import 'package:karar_mobile/features/transaction_categories/presentation/categories_providers.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../../core/support/fakes.dart';
import '../../features/financial_accounts/support/financial_harness.dart';

final DateTime launchInstant = DateTime.utc(2026, 8, 19, 9);

/// Session material valid for the whole of a test.
SessionTokens launchTokens() => SessionTokens(
      accessToken: 'deep-link-access',
      accessTokenExpiresAt: launchInstant.add(const Duration(hours: 1)),
      refreshToken: 'deep-link-refresh',
      refreshTokenExpiresAt: launchInstant.add(const Duration(days: 30)),
      sessionId: '9f1d0f6a-0000-4000-8000-0000000000aa',
    );

/// One process, with the real router and the real startup coordinator.
final class DeepLinkLaunch {
  /// [financialRepositories] REPLACES the scripted repositories rather than
  /// adding to them: Riverpod rejects a provider overridden twice in one
  /// container, so a test that needs different repository behaviour supplies
  /// the whole set.
  DeepLinkLaunch({
    required List<Result<BootstrapSnapshot>> bootstrapAnswers,
    List<Override>? financialRepositories,
    List<Override> extraOverrides = const <Override>[],
  }) : bootstrap = FakeBootstrapGateway(bootstrapAnswers) {
    container = ProviderContainer(
      overrides: <Override>[
        ...featureSurfaceOverrides(),
        configurationResultProvider.overrideWithValue(
          Success<AppConfiguration>(
            AppConfiguration(
              environment: AppEnvironment.local,
              // Never contacted: both transports are substituted, so
              // `dioProvider` is never read and no socket is opened.
              apiBaseUrl: Uri.parse('http://localhost:8080'),
              appVersion: '1.0.0',
              buildNumber: '1',
              brandId: 'karar',
            ),
          ),
        ),
        loggerProvider.overrideWithValue(AppLogger.silent),
        keyValueStoreProvider.overrideWithValue(InMemoryKeyValueStore()),
        localSecurityStateStoreProvider.overrideWithValue(securityState),
        secureStoreProvider.overrideWithValue(secureStore),
        clockProvider.overrideWithValue(FixedClock(launchInstant)),
        apiTransportProvider.overrideWithValue(transport),
        rawApiTransportProvider.overrideWithValue(transport),
        bootstrapGatewayProvider.overrideWithValue(bootstrap),
        ...?financialRepositories,
        if (financialRepositories == null) ...<Override>[
          financialAccountsRepositoryProvider.overrideWithValue(accounts),
          issuerCatalogueRepositoryProvider.overrideWithValue(accounts),
          transactionsRepositoryProvider.overrideWithValue(transactions),
          paymentInstrumentsRepositoryProvider.overrideWithValue(instruments),
        ],
        transactionCategoriesRepositoryProvider.overrideWithValue(categories),
        ...extraOverrides,
      ],
    );
    addTearDown(container.dispose);
  }

  final InMemorySecureStore secureStore = InMemorySecureStore();
  final InMemoryLocalSecurityStateStore securityState =
      InMemoryLocalSecurityStateStore();
  final FakeBootstrapGateway bootstrap;

  final ScriptedAccountsRepository accounts = ScriptedAccountsRepository();
  final ScriptedTransactionsRepository transactions = ScriptedTransactionsRepository();
  final ScriptedInstrumentsRepository instruments = ScriptedInstrumentsRepository();
  final ScriptedCategoriesRepository categories = ScriptedCategoriesRepository();

  /// Records every request that reached the transport, so a refused deep link
  /// can be shown to have issued none.
  final FakeApiTransport transport = FakeApiTransport(
    (ApiRequest request) async => throw ApiException(
      const DependencyUnavailableFailure(code: 'NOT_SCRIPTED'),
    ),
  );

  late final ProviderContainer container;

  StartupCoordinator get coordinator => container.read(startupCoordinatorProvider);

  GoRouter get router => container.read(routerProvider);

  /// Every financial read any repository was asked for.
  List<String> get financialReads => <String>[
        ...accounts.reads,
        ...transactions.reads,
        ...instruments.reads,
      ];

  /// Puts a credential on disk, as a completed sign-in would have left one.
  Future<void> persistSession() async {
    final written = await container.read(tokenStoreProvider).write(launchTokens());
    expect(written, isA<Success<void>>(), reason: 'the fixture must persist');
  }

  /// Turns the application lock on, durably.
  Future<void> enableLock() =>
      securityState.write(LocalSecurityFlag.appLockEnabled, value: true);

  /// Mounts the real router and runs startup to completion.
  Future<void> boot(WidgetTester tester) async {
    await tester.binding.setSurfaceSize(const Size(1000, 3000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp.router(
          routerConfig: router,
          locale: KararLocalization.english,
          localizationsDelegates: KararLocalization.localizationsDelegates,
          supportedLocales: KararLocalization.supportedLocales,
          localeResolutionCallback: KararLocalization.resolve,
          theme: KararTheme.light(),
          builder: (BuildContext context, Widget? child) =>
              KararThemeScope(child: child ?? const SizedBox.shrink()),
        ),
      ),
    );
    await coordinator.start();
    await tester.pumpAndSettle();
  }

  /// Follows a deep link, exactly as an external link would.
  Future<void> follow(WidgetTester tester, String location) async {
    router.go(location);
    await tester.pumpAndSettle();
  }

  /// The path the router settled on.
  String get location => router.routerDelegate.currentConfiguration.uri.path;
}
