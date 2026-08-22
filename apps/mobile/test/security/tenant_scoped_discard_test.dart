// §3G — WHAT "DISCARD" HAS TO MEAN FOR EVERY REGISTERED PROVIDER.
//
// `tenant_switch_isolation_test.dart` drives the two real triggers end to end
// through the composition root, and it proves the property for the two
// providers a screen reads first. It cannot prove it for the rest: the fixture
// would have to open a detail screen, an instrument section and a category
// picker to make each family element exist.
//
// This suite goes at the same property from the other side. It builds ONE
// element of every registered tenant-scoped provider — families included, with
// arguments, which is the case a registry of bare references cannot reach — and
// asserts that the discard leaves none of them holding the previous
// organisation's answer. A provider added to the registry without a way to
// empty itself will not compile; a provider whose "empty" is not actually empty
// fails here.
//
// The two reasons are not the same operation and both are checked:
//
//   * a BINDING CHANGE empties and then re-reads, because there is a live
//     session bound to a different organisation to read under;
//   * a SESSION ENDING empties and issues NOTHING, because there is no
//     credential. A re-read here would be a request that must fail, and the
//     failure would be written into the state the next principal reads.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override, ProviderListenable, ProviderOrFamily;
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/composition/feature_surface.dart';
import 'package:karar_mobile/app/lifecycle/tenant_data_scope.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_providers.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instrument.dart';
import 'package:karar_mobile/features/payment_instruments/presentation/instruments_providers.dart';
import 'package:karar_mobile/features/transaction_categories/presentation/categories_providers.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';

import '../features/financial_accounts/support/financial_fixtures.dart';
import '../features/financial_accounts/support/financial_harness.dart';

/// The account and transaction every element in this suite is loaded for.
const String accountOfA = 'account-of-tenant-a';
const String transactionOfA = 'transaction-of-tenant-a';

/// Hands a test the `Ref` the discard needs.
///
/// The production triggers hold one already — `TenantBindingController` for a
/// switch, `startupCoordinatorProvider` for a sign-out — and both are exercised
/// end to end next door. Here the mechanism itself is under test, so the `Ref`
/// is taken directly rather than through a credential store this suite has no
/// reason to open.
late Ref containerRef;
final Provider<void> _refProbe = Provider<void>((Ref ref) => containerRef = ref);

void main() {
  late ScriptedAccountsRepository accounts;
  late ScriptedTransactionsRepository transactions;
  late ScriptedInstrumentsRepository instruments;
  late ScriptedCategoriesRepository categories;
  late ProviderContainer container;

  /// Everything the registry names, held open by a listener so that closing a
  /// screen cannot be what empties it.
  final List<ProviderSubscription<Object?>> subscriptions = <ProviderSubscription<Object?>>[];

  void listenTo(ProviderListenable<Object?> provider) =>
      subscriptions.add(container.listen(provider, (_, _) {}, fireImmediately: true));

  setUp(() {
    accounts = ScriptedAccountsRepository(
      accounts: <FinancialAccount>[account(accountId: accountOfA)],
      balances: <String, List<BalanceSnapshot>>{
        accountOfA: <BalanceSnapshot>[balance(accountId: accountOfA)],
      },
      sourceLinks: <String, List<AccountSourceLink>>{
        accountOfA: <AccountSourceLink>[sourceLink(accountId: accountOfA)],
      },
      issuers: <Issuer>[issuerOne()],
    );
    transactions = ScriptedTransactionsRepository(
      transactions: <Transaction>[
        transaction(transactionId: transactionOfA, accountId: accountOfA),
      ],
      provenanceRows: <TransactionProvenance>[provenance()],
    );
    instruments = ScriptedInstrumentsRepository(<String, List<PaymentInstrument>>{
      accountOfA: <PaymentInstrument>[instrument(instrumentId: 'instrument-of-tenant-a')],
    });
    categories = ScriptedCategoriesRepository(catalogue().entries);

    container = ProviderContainer(
      overrides: <Override>[
        ...financialOverrides(
          accounts: accounts,
          transactions: transactions,
          instruments: instruments,
          categories: categories,
        ),
        // THE real registry — the same function the composition root calls, not
        // a restatement of part of it. This used to spread
        // `financialTenantScopedProviders()` alone while claiming to be
        // "exactly as the composition root installs it": one of five
        // contributions, which is why the statement-import workstream was
        // never held to the discard discipline by this suite.
        tenantScopedDataProvider.overrideWithValue(everyTenantScopedProvider()),
      ],
    );
    container.read(_refProbe);
  });

  tearDown(() {
    for (final subscription in subscriptions) {
      subscription.close();
    }
    subscriptions.clear();
    container.dispose();
  });

  /// Loads one element of every asynchronous provider the registry names,
  /// including one of each family.
  Future<void> loadEverything() async {
    listenTo(ownAccountsProvider);
    listenTo(selectableIssuersProvider);
    listenTo(transactionListingProvider);
    listenTo(categoryCatalogueProvider);
    listenTo(accountDetailProvider(accountOfA));
    listenTo(accountBalancesProvider(accountOfA));
    listenTo(accountSourceLinksProvider(accountOfA));
    listenTo(accountInstrumentsProvider(accountOfA));
    listenTo(accountRecentTransactionsProvider(accountOfA));
    listenTo(transactionDetailProvider(transactionOfA));
    listenTo(transactionProvenanceProvider(transactionOfA));
    for (var i = 0; i < 8; i++) {
      await Future<void>.delayed(Duration.zero);
    }
  }

  /// What each provider currently exposes, by name, so a failure says WHICH one
  /// kept the previous organisation's answer.
  Map<String, Object?> exposedValues() => <String, Object?>{
    'ownAccounts': switch (container.read(ownAccountsProvider).value) {
      AccountsLoaded(:final accounts) => accounts,
      _ => const <FinancialAccount>[],
    },
    'selectableIssuers': container.read(selectableIssuersProvider).value,
    'transactionListing': switch (container.read(transactionListingProvider).value) {
      TransactionsLoaded(:final transactions) => transactions,
      _ => const <Transaction>[],
    },
    'categoryCatalogue': switch (container.read(categoryCatalogueProvider).value) {
      CategoryCatalogueLoaded(:final catalogue) => catalogue.entries,
      _ => const <Object?>[],
    },
    'accountDetail': container.read(accountDetailProvider(accountOfA)).value,
    'accountBalances': container.read(accountBalancesProvider(accountOfA)).value?.entries,
    'accountSourceLinks': container.read(accountSourceLinksProvider(accountOfA)).value,
    'accountInstruments': container.read(accountInstrumentsProvider(accountOfA)).value,
    'accountRecentTransactions': container
        .read(accountRecentTransactionsProvider(accountOfA))
        .value,
    'transactionDetail': container.read(transactionDetailProvider(transactionOfA)).value,
    'transactionProvenance': container.read(transactionProvenanceProvider(transactionOfA)).value,
  };

  /// Whether a provider is holding nothing: a null, or an empty collection.
  bool isEmptied(Object? value) => value == null || (value is Iterable && value.isEmpty);

  group('what this suite proves, and what it does not', () {
    // THE HONEST BOUNDARY OF THIS SUITE.
    //
    // The shell registers 29 tenant-scoped providers across five workstreams.
    // This suite builds 11 of them — the accounts, transactions, categories
    // and instruments surfaces, whose repositories it doubles. It does NOT
    // build statement imports, transfer matching, connections, profile or
    // consent, because it doubles none of their dependencies.
    //
    // That gap used to be invisible: the registry override spread ONE of the
    // five contributions while its comment claimed to be "exactly as the
    // composition root installs it", so a workstream could register a provider
    // and never be held to the discard discipline by anything. One did, and
    // its controller shipped holding a bank statement across a sign-out.
    //
    // The override now IS the real registry. This test states the remaining
    // gap as a number, so registering a provider without either exercising it
    // here or deliberately widening the gap fails the build.
    const int registeredProviders = 29;
    const int exercisedHere = 11;

    test('the gap between what is registered and what is exercised is stated', () {
      expect(
        everyTenantScopedProvider().length,
        registeredProviders,
        reason:
            'a tenant-scoped provider was added or removed. Either exercise '
            'it in exposedValues() — which is what actually proves its discard '
            'works — or raise this number deliberately, knowing that its '
            'discard is then unproven by this suite',
      );
      expect(
        exposedValues().length,
        exercisedHere,
        reason:
            'the set this suite builds changed; keep the two numbers above '
            'honest about each other',
      );
      expect(
        exercisedHere,
        lessThan(registeredProviders),
        reason:
            'if these are equal the suite covers everything and this test '
            'should be replaced by that stronger claim',
      );
    });
  });

  group('the discard', () {
    test('leaves every registered provider holding an answer first', () async {
      await loadEverything();

      final held = exposedValues();
      for (final MapEntry<String, Object?> entry in held.entries) {
        expect(
          isEmptied(entry.value),
          isFalse,
          reason:
              '${entry.key} never loaded, so the assertion that it is '
              'emptied below would prove nothing',
        );
      }
      expect(
        container.read(tenantDataScopeProvider).liveAnswerCount,
        held.length,
        reason:
            'every loaded element must have registered itself, or the '
            'discard cannot reach it',
      );
    });

    test('empties every one of them when the binding changes', () async {
      await loadEverything();

      discardTenantScopedData(containerRef, TenantDataDiscardReason.bindingChanged);

      for (final MapEntry<String, Object?> entry in exposedValues().entries) {
        expect(
          isEmptied(entry.value),
          isTrue,
          reason:
              '${entry.key} is still exposing the previous organisation\'s '
              'answer after the switch',
        );
      }
    });

    test('re-reads on a binding change, because there is a session to read under', () async {
      await loadEverything();
      final int before = accounts.reads.length + transactions.reads.length;

      discardTenantScopedData(containerRef, TenantDataDiscardReason.bindingChanged);
      for (var i = 0; i < 8; i++) {
        await Future<void>.delayed(Duration.zero);
      }

      expect(
        accounts.reads.length + transactions.reads.length,
        greaterThan(before),
        reason:
            'the new organisation\'s answer has to be fetched, or every '
            'screen renders an empty surface until something else asks',
      );
    });

    test('empties every one of them when the session ends', () async {
      await loadEverything();

      discardTenantScopedData(containerRef, TenantDataDiscardReason.sessionEnded);

      for (final MapEntry<String, Object?> entry in exposedValues().entries) {
        expect(
          isEmptied(entry.value),
          isTrue,
          reason:
              '${entry.key} is still exposing the ended session\'s answer, '
              'which is what the next principal to sign in would read',
        );
      }
    });

    test('issues nothing when the session ends', () async {
      await loadEverything();
      final int before = accounts.reads.length + transactions.reads.length;

      discardTenantScopedData(containerRef, TenantDataDiscardReason.sessionEnded);
      for (var i = 0; i < 8; i++) {
        await Future<void>.delayed(Duration.zero);
      }

      expect(
        accounts.reads.length + transactions.reads.length,
        before,
        reason:
            'there is no credential to read under; a request issued here '
            'can only fail, and its failure would be written into the state '
            'the next principal reads',
      );
    });

    test('moves the generation on, so a write in flight can tell', () async {
      final TenantDataScope scope = container.read(tenantDataScopeProvider);
      final int before = scope.generation;

      discardTenantScopedData(containerRef, TenantDataDiscardReason.sessionEnded);

      expect(
        scope.generation,
        isNot(before),
        reason:
            'a controller that captured the generation before its `await` '
            'has no way to know its answer is stale unless this moves',
      );
    });
  });

  group('the registry', () {
    test('names each provider exactly once', () {
      final List<ProviderOrFamily> named = <ProviderOrFamily>[
        for (final TenantScopedProvider entry in container.read(tenantScopedDataProvider))
          entry.provider,
      ];

      expect(
        named.toSet(),
        hasLength(named.length),
        reason:
            'a provider registered twice is a merge that went wrong, and '
            'the next merge is as likely to drop one as to duplicate one',
      );
    });
  });
}
