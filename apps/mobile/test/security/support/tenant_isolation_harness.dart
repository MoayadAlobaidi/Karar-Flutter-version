// A COMPOSITION ROOT THAT CAN BE MADE TO RACE.
//
// The isolation properties in §3G are about ORDER: a read issued under one
// tenant, a switch, and then the answer to the first read arriving. Nothing
// single-threaded can express that, so every repository here answers with a
// `Completer` the test holds. A test starts a read, performs the switch, and
// only then completes the first read — which is the exact interleaving a slow
// network produces on a device and which no ordinary screen test can reach.
//
// The container is the REAL one: `featureSurfaceOverrides()` supplies the real
// tenant-scoped provider registry, the real `TenantBindingController` sequences
// the switch, the real `ApiTenantBindingRepository` rotates the credential
// through the real `SessionManager`, and the real `StartupCoordinator` re-reads
// bootstrap afterwards. Only the leaves are doubles: the transport, the token
// store, the bootstrap gateway and the three financial repositories. A test
// that stubbed the controller would prove nothing about the sequence the
// controller is responsible for.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:karar_mobile/app/composition/feature_surface.dart';
import 'package:karar_mobile/app/dependency_injection/providers.dart';
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart' as bootstrap_snapshot;
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart'
    show
        BootstrapSnapshot,
        CapabilityResolutionState,
        CapabilityView,
        JurisdictionState,
        OperatingEntityState,
        OperatingEntitySummary,
        TenantOption;
import 'package:karar_mobile/app/lifecycle/startup_coordinator.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/networking/api_transport.dart';
import 'package:karar_mobile/core/security/local_security_state_store.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_accounts_repository.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_providers.dart';
import 'package:karar_mobile/features/tenant_selection/domain/tenant_binding.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/domain/transactions_repository.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';

import '../../core/support/fakes.dart';
import '../../features/platform_bootstrap/support/feature_harness.dart';

/// The two organisations every test in this suite works with.
const String tenantA = 'tenant-aaaa-0001';
const String tenantB = 'tenant-bbbb-0002';

const TenantChoice tenantBChoice = TenantChoice(
  tenantId: tenantB,
  name: 'Second Organisation',
  roleHint: 'MEMBER',
);

/// A response body for `POST /platform/tenant-binding` in its SWITCHED shape.
///
/// A switch is the interesting branch: it rotates the credential, so the
/// session the in-flight read was issued under is dead by the time its answer
/// arrives.
Map<String, Object?> switchedToTenantB({String sessionId = 'session-tenant-b'}) =>
    <String, Object?>{
      'kind': 'SWITCHED',
      'binding': <String, Object?>{
        'kind': 'BOUND',
        'tenant': <String, Object?>{
          'tenantId': tenantB,
          'name': 'Second Organisation',
          'roleHint': 'MEMBER',
        },
      },
      'tokens': <String, Object?>{
        'accessToken': 'tenant-b-access',
        'accessTokenExpiresAt': '2999-01-01T00:00:00.000Z',
        'refreshToken': 'tenant-b-refresh',
        'refreshTokenExpiresAt': '2999-01-01T00:00:00.000Z',
        'sessionId': sessionId,
      },
    };

/// A bootstrap answer bound to [tenantId], with the financial capability.
BootstrapSnapshot boundTo(String tenantId) => BootstrapSnapshot(
      userId: 'user-0001',
      emailVerified: true,
      sessionId: 'session-$tenantId',
      binding: bootstrap_snapshot.TenantBound(
        TenantOption(tenantId: tenantId, name: tenantId, roleHint: 'MEMBER'),
      ),
      jurisdictionState: JurisdictionState.verified,
      jurisdictionId: 'jurisdiction-a',
      operatingEntityState: OperatingEntityState.assigned,
      operatingEntity: const OperatingEntitySummary(
        id: 'entity-0001',
        name: 'Test Operating Entity',
        jurisdictionRef: 'jurisdiction-a',
        contactReference: 'privacy@example.invalid',
      ),
      policyPackVersion: '1.0.0',
      policyPackStatus: 'ACTIVE',
      capabilityState: CapabilityResolutionState.resolved,
      capabilities: const <CapabilityView>[
        CapabilityView(id: 'TRANSACTIONS', status: 'AVAILABLE', requirements: <String>[]),
      ],
    );

/// One page with no successor.
Page<T> _page<T>(List<T> items) => Page<T>(
      items: items,
      cursor: PageCursor(limit: 50, returned: items.length, hasMore: false, nextCursor: null),
    );

/// An accounts repository whose every read is held open until the test says
/// otherwise.
///
/// Each read parks a completer on [pending], in call order, and answers only
/// when the test completes it. That is what lets a test start a read, switch
/// tenant, and complete the read afterwards.
final class HeldAccountsRepository
    implements FinancialAccountsRepository, IssuerCatalogueRepository {
  HeldAccountsRepository();

  /// Completers for `listOwnAccounts`, in call order.
  final List<Completer<List<FinancialAccount>>> pending =
      <Completer<List<FinancialAccount>>>[];

  /// Every read this repository was asked to perform.
  final List<String> reads = <String>[];

  /// Held completers for `createManualAccount`, in call order.
  final List<Completer<Result<FinancialAccount>>> pendingCreates =
      <Completer<Result<FinancialAccount>>>[];

  @override
  Future<Result<Page<FinancialAccount>>> listOwnAccounts({int? limit, String? cursor}) async {
    reads.add('listOwnAccounts');
    final completer = Completer<List<FinancialAccount>>();
    pending.add(completer);
    final accounts = await completer.future;
    return Success<Page<FinancialAccount>>(_page<FinancialAccount>(accounts));
  }

  @override
  Future<Result<FinancialAccount>> readOwnAccount(String accountId) async {
    reads.add('readOwnAccount');
    return const Failed<FinancialAccount>(NotFoundFailure());
  }

  @override
  Future<Result<FinancialAccount>> createManualAccount(ManualAccountDraft draft) {
    reads.add('createManualAccount');
    final completer = Completer<Result<FinancialAccount>>();
    pendingCreates.add(completer);
    return completer.future;
  }

  @override
  Future<Result<FinancialAccount>> updateAccount(String accountId, AccountEdit edit) async =>
      const Failed<FinancialAccount>(NotFoundFailure());

  @override
  Future<Result<Page<BalanceSnapshot>>> listBalances(
    String accountId, {
    int? limit,
    String? cursor,
  }) async =>
      Success<Page<BalanceSnapshot>>(_page<BalanceSnapshot>(const <BalanceSnapshot>[]));

  @override
  Future<Result<Page<AccountSourceLink>>> listSourceLinks(
    String accountId, {
    int? limit,
    String? cursor,
  }) async =>
      Success<Page<AccountSourceLink>>(_page<AccountSourceLink>(const <AccountSourceLink>[]));

  @override
  Future<Result<Page<Issuer>>> listSelectableIssuers({int? limit, String? cursor}) async =>
      Success<Page<Issuer>>(_page<Issuer>(const <Issuer>[]));
}

/// A transactions repository whose listing is held open, on the same rule as
/// [HeldAccountsRepository].
final class HeldTransactionsRepository implements TransactionsRepository {
  final List<Completer<List<Transaction>>> pending = <Completer<List<Transaction>>>[];
  final List<String> reads = <String>[];

  @override
  Future<Result<Page<Transaction>>> listOwn({
    TransactionFilter filter = const TransactionFilter(),
    int? limit,
    String? cursor,
  }) async {
    reads.add('listOwn');
    final completer = Completer<List<Transaction>>();
    pending.add(completer);
    final items = await completer.future;
    return Success<Page<Transaction>>(_page<Transaction>(items));
  }

  @override
  Future<Result<TransactionDetail>> read(String transactionId) async =>
      const Failed<TransactionDetail>(NotFoundFailure());

  @override
  Future<Result<Transaction>> createManual(ManualTransactionDraft draft) async =>
      const Failed<Transaction>(NotFoundFailure());

  @override
  Future<Result<Transaction>> correct(String id, TransactionCorrection correction) async =>
      const Failed<Transaction>(NotFoundFailure());

  @override
  Future<Result<CategoryAssignment>> assignCategory(String id, String categoryCode) async =>
      const Failed<CategoryAssignment>(NotFoundFailure());

  @override
  Future<Result<List<TransactionProvenance>>> listProvenance(String id) async =>
      const Success<List<TransactionProvenance>>(<TransactionProvenance>[]);

  @override
  Future<Result<TransactionDeletionOutcome>> delete(String id) async =>
      const Failed<TransactionDeletionOutcome>(NotFoundFailure());
}

/// The composition root under test, with the leaves replaced by doubles.
final class TenantIsolationHarness {
  TenantIsolationHarness({List<Override> extraOverrides = const <Override>[]}) {
    container = ProviderContainer(
      overrides: <Override>[
        ...featureSurfaceOverrides(),
        loggerProvider.overrideWithValue(AppLogger.silent),
        keyValueStoreProvider.overrideWithValue(InMemoryKeyValueStore()),
        localSecurityStateStoreProvider
            .overrideWithValue(InMemoryLocalSecurityStateStore()),
        tokenStoreProvider.overrideWithValue(tokens),
        bootstrapGatewayProvider.overrideWithValue(bootstrap),
        // The tenant-binding call is the only request that reaches the
        // transport; every financial read goes through a held repository.
        apiTransportProvider.overrideWithValue(transport),
        rawApiTransportProvider.overrideWithValue(transport),
        financialAccountsRepositoryProvider.overrideWithValue(accounts),
        issuerCatalogueRepositoryProvider.overrideWithValue(accounts),
        transactionsRepositoryProvider.overrideWithValue(transactions),
        ...extraOverrides,
      ],
    );
  }

  final InMemoryTokenStore tokens = InMemoryTokenStore();
  final HeldAccountsRepository accounts = HeldAccountsRepository();
  final HeldTransactionsRepository transactions = HeldTransactionsRepository();

  /// Bootstrap answers: tenant A first, then tenant B for every later read.
  final FakeBootstrapGateway bootstrap = FakeBootstrapGateway(<Result<BootstrapSnapshot>>[
    Success<BootstrapSnapshot>(boundTo(tenantA)),
    Success<BootstrapSnapshot>(boundTo(tenantB)),
  ]);

  late final FakeApiTransport transport = FakeApiTransport((ApiRequest request) async {
    return ApiResponse(statusCode: 200, body: switchedToTenantB());
  });

  late final ProviderContainer container;

  SessionManager get sessions => container.read(sessionManagerProvider);

  StartupCoordinator get coordinator => container.read(startupCoordinatorProvider);

  /// Puts a live credential in hand, as a completed sign-in would.
  Future<void> signIn() async {
    await sessions.adopt(liveTokens(sessionId: 'session-tenant-a'));
  }

  void dispose() => container.dispose();
}

/// Lets every pending microtask and zero-delay future run.
Future<void> drain() async {
  for (var i = 0; i < 8; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}
