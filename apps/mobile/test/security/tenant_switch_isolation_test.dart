// §3G — TENANT SWITCH, SIGN-OUT, AND THE ANSWER THAT ARRIVES TOO LATE.
//
// The danger is ORDER, not wiring: a read issued while the session was bound to
// organisation A, a switch to organisation B, and then A's answer being read —
// or A's cached answer still being served — under B. Nothing single-threaded
// expresses that, so every financial read in this suite is held on a
// `Completer` the test resolves by hand, after the switch.
//
// The container is the REAL one. `featureSurfaceOverrides()` supplies the real
// tenant-scoped registry, the real `TenantBindingController` sequences the
// switch, the real `ApiTenantBindingRepository` rotates the credential through
// the real `SessionManager`, and the real `StartupCoordinator` re-reads
// bootstrap. Only the leaves are doubles. A test that stubbed the controller
// would prove nothing about the sequence the controller is responsible for.
//
// THREE WRITE PATHS EXIST AND THEY DO NOT BEHAVE THE SAME:
//
//   * a provider's own `build()` — Riverpod cancels the pending future when the
//     element is invalidated, so a late answer is dropped by the framework.
//     This one HOLDS, and `the framework drops a build() answer …` proves it;
//   * the CACHED value — `ref.invalidate` marks an async provider stale, it
//     does not empty it. `AsyncValue.value` keeps returning the previous
//     organisation's data for the whole reload window;
//   * a hand-written `state = …` after an `await`, in `AsyncNotifier.refresh`
//     or in a plain `Notifier` method. Riverpod REUSES the notifier instance
//     across an invalidation — only `build()` re-runs — so `ref.mounted` is
//     still true and the stale write lands on the live element.
//
// SIGN-OUT is the second half. A tenant switch at least attempts a discard;
// nothing attempts one when the session ends, and the container outlives the
// session by design — one `ProviderContainer` per process, see
// `app/bootstrap/app_bootstrap.dart`.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/security/session_manager.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_and_wallets_screen.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_providers.dart';
import 'package:karar_mobile/features/tenant_selection/presentation/tenant_providers.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';
import 'package:karar_mobile/l10n/karar_localization.dart';
import 'package:karar_mobile/shared/shared.dart';

import '../features/financial_accounts/support/financial_fixtures.dart';
import 'support/tenant_isolation_harness.dart';

/// A display name that could only have come from organisation A. It is what a
/// rendering assertion looks for, so it must appear nowhere else.
const String nameOfA = 'Organisation A payroll';
const String nameOfB = 'Organisation B payroll';

FinancialAccount accountOfA() =>
    account(accountId: 'account-of-tenant-a', displayName: nameOfA);

FinancialAccount accountOfB() =>
    account(accountId: 'account-of-tenant-b', displayName: nameOfB);

/// The transaction identifiers a listing is currently exposing.
List<String> idsOf(AsyncValue<TransactionListing> value) => switch (value.value) {
      TransactionsLoaded(:final transactions) =>
        transactions.map((Transaction held) => held.transactionId).toList(),
      _ => const <String>[],
    };

/// The account identifiers a portfolio view is currently exposing.
List<String> idsIn(AsyncValue<AccountsView> value) => switch (value.value) {
      AccountsLoaded(:final accounts) =>
        accounts.map((FinancialAccount held) => held.accountId).toList(),
      _ => const <String>[],
    };

/// A provider with nothing but a future the test controls, used to characterise
/// what the framework's own discard primitive does.
final class _Probe extends AsyncNotifier<String> {
  static final List<Completer<String>> pending = <Completer<String>>[];

  @override
  Future<String> build() {
    final completer = Completer<String>();
    pending.add(completer);
    return completer.future;
  }
}

final AsyncNotifierProvider<_Probe, String> _probeProvider =
    AsyncNotifierProvider<_Probe, String>(_Probe.new);

void main() {
  group('what `ref.invalidate` actually does to an async provider', () {
    // NOT a security property — a characterisation, and the reason the registry
    // above cannot deliver what it documents. `tenant_providers.dart` says the
    // invalidation means "no screen can render the previous organisation's
    // answer under the new binding". Riverpod's invalidation is a RELOAD: it
    // re-runs `build` and carries the previous value forward so a screen can
    // show stale-while-revalidate data. `AsyncValue.value` therefore keeps
    // answering with the old organisation's data until the new read lands, and
    // `AsyncValue.when` renders it, because `skipLoadingOnRefresh` defaults to
    // true.
    //
    // If a Riverpod upgrade ever changes this, this test fails and the fix for
    // the tenant switch may become unnecessary. Until then it is the root cause.
    test('leaves the previous value readable while the reload is in flight', () async {
      _Probe.pending.clear();
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final subscription =
          container.listen(_probeProvider, (_, _) {}, fireImmediately: true);
      addTearDown(subscription.close);

      _Probe.pending.first.complete('ORGANISATION_A');
      await drain();
      expect(container.read(_probeProvider).value, 'ORGANISATION_A');

      container.invalidate(_probeProvider);
      container.read(_probeProvider);
      await drain();

      expect(
        container.read(_probeProvider).isLoading,
        isTrue,
        reason: 'the reload must be in flight, or nothing is being characterised',
      );
      expect(
        container.read(_probeProvider).value,
        'ORGANISATION_A',
        reason: 'if this ever stops holding, `ref.invalidate` has become an '
            'erase and the tenant switch may already be safe',
      );
    });
  });

  group('a tenant switch', () {
    late TenantIsolationHarness harness;

    setUp(() => harness = TenantIsolationHarness());
    tearDown(() => harness.dispose());

    /// Yields to the event loop. Inside `testWidgets` the loop is driven by
    /// the tester, so a widget test passes its own pump instead: a plain
    /// `Future.delayed` there never completes.
    Future<void> switchToB({Future<void> Function()? settle}) async {
      await harness.container
          .read(tenantBindingControllerProvider.notifier)
          .switchTo(tenantBChoice);
      await (settle ?? drain)();
    }

    /// Signs in, loads organisation A's portfolio, and leaves it settled.
    Future<ProviderSubscription<AsyncValue<AccountsView>>> loadPortfolioOfA({
      Future<void> Function()? settle,
    }) async {
      final tick = settle ?? drain;
      await harness.signIn();
      final subscription =
          harness.container.listen(ownAccountsProvider, (_, _) {}, fireImmediately: true);
      await tick();
      harness.accounts.pending.first.complete(<FinancialAccount>[accountOfA()]);
      await tick();
      expect(
        idsIn(harness.container.read(ownAccountsProvider)),
        <String>['account-of-tenant-a'],
        reason: 'the first load must actually produce organisation A data, or '
            'nothing below is testing a leak',
      );
      return subscription;
    }

    test('the fixture performs a real switch and rotates the credential', () async {
      final subscription = await loadPortfolioOfA();
      addTearDown(subscription.close);

      await switchToB();

      expect(
        harness.container.read(tenantBindingControllerProvider),
        isA<TenantBindingConfirmed>(),
        reason: 'the switch must succeed, or the race is never set up',
      );
      expect(
        harness.sessions.tokens?.accessToken,
        'tenant-b-access',
        reason: 'a switch adopts the replacement credential; without that the '
            'session is still organisation A and no boundary is crossed',
      );
      expect(
        harness.accounts.reads.where((String read) => read == 'listOwnAccounts').length,
        greaterThanOrEqualTo(2),
        reason: 'the switch must force a re-read, or the registry is not wired',
      );
    });

    test(
      'organisation A\'s portfolio is not readable once the switch has returned',
      () async {
        final subscription = await loadPortfolioOfA();
        addTearDown(subscription.close);

        await switchToB();

        // Organisation B's read is in flight. This is the whole window a slow
        // network opens, and the question is what the provider yields during it.
        expect(
          idsIn(harness.container.read(ownAccountsProvider)),
          isNot(contains('account-of-tenant-a')),
          reason: 'the switch has completed and organisation A\'s portfolio is '
              'still the value every screen reads',
        );
      },
    );

    testWidgets(
      'organisation A\'s accounts are not on screen once the switch has returned',
      (WidgetTester tester) async {
        Future<void> pumpDrain() async {
          for (var i = 0; i < 8; i++) {
            await tester.pump(Duration.zero);
          }
        }

        final subscription = await loadPortfolioOfA(settle: pumpDrain);
        addTearDown(subscription.close);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: harness.container,
            child: MaterialApp(
              locale: KararLocalization.english,
              localizationsDelegates: KararLocalization.localizationsDelegates,
              supportedLocales: KararLocalization.supportedLocales,
              theme: KararTheme.light(),
              builder: (BuildContext context, Widget? child) =>
                  KararThemeScope(child: child ?? const SizedBox.shrink()),
              home: const AccountsAndWalletsScreen(),
            ),
          ),
        );
        await tester.pump();
        expect(
          find.text(nameOfA),
          findsOneWidget,
          reason: 'the screen must be showing organisation A first, or the '
              'assertion below proves nothing',
        );

        await switchToB(settle: pumpDrain);
        await tester.pump();

        expect(
          find.text(nameOfA),
          findsNothing,
          reason: 'organisation A\'s account is rendered under organisation B '
              'for the whole of the post-switch reload',
        );
      },
    );

    test(
      'the framework drops a build() answer issued before the switch',
      () async {
        // The property that HOLDS. `ownAccountsProvider.build()` is started
        // here and never allowed to settle before the switch; Riverpod cancels
        // the pending future on invalidation, so the answer is discarded rather
        // than becoming organisation B's state.
        await harness.signIn();
        final subscription = harness.container
            .listen(ownAccountsProvider, (_, _) {}, fireImmediately: true);
        addTearDown(subscription.close);
        await drain();
        final stale = harness.accounts.pending.first;

        await switchToB();

        stale.complete(<FinancialAccount>[accountOfA()]);
        await drain();
        harness.accounts.pending.last.complete(<FinancialAccount>[accountOfB()]);
        await drain();

        expect(
          idsIn(harness.container.read(ownAccountsProvider)),
          <String>['account-of-tenant-b'],
          reason: 'a build() answer from before the switch was adopted',
        );
      },
    );

    test(
      'a listing refresh issued under A does not overwrite B once it resolves',
      () async {
        final subscription = await loadPortfolioOfA();
        addTearDown(subscription.close);

        // A refresh under organisation A. Its answer is still in flight.
        final refreshing =
            harness.container.read(ownAccountsProvider.notifier).refresh();
        await drain();
        final int inFlight = harness.accounts.pending.length - 1;

        await switchToB();

        // Settle organisation B first, so the assertion below distinguishes a
        // leak from a load that has simply not finished.
        harness.accounts.pending.last.complete(<FinancialAccount>[accountOfB()]);
        await drain();
        expect(
          idsIn(harness.container.read(ownAccountsProvider)),
          <String>['account-of-tenant-b'],
        );

        harness.accounts.pending[inFlight].complete(<FinancialAccount>[accountOfA()]);
        await refreshing;
        await drain();

        expect(
          idsIn(harness.container.read(ownAccountsProvider)),
          isNot(contains('account-of-tenant-a')),
          reason: 'organisation A\'s portfolio replaced organisation B\'s in '
              'the state B\'s screens read',
        );
      },
    );

    test(
      'a transaction listing refresh issued under A does not overwrite B',
      () async {
        await harness.signIn();
        final subscription = harness.container
            .listen(transactionListingProvider, (_, _) {}, fireImmediately: true);
        addTearDown(subscription.close);
        await drain();
        harness.transactions.pending.first.complete(<Transaction>[
          transaction(transactionId: 'transaction-of-tenant-a'),
        ]);
        await drain();

        final refreshing =
            harness.container.read(transactionListingProvider.notifier).refresh();
        await drain();
        final int inFlight = harness.transactions.pending.length - 1;

        await switchToB();

        harness.transactions.pending.last.complete(<Transaction>[
          transaction(transactionId: 'transaction-of-tenant-b'),
        ]);
        await drain();

        harness.transactions.pending[inFlight].complete(<Transaction>[
          transaction(transactionId: 'transaction-of-tenant-a'),
        ]);
        await refreshing;
        await drain();

        expect(
          idsOf(harness.container.read(transactionListingProvider)),
          isNot(contains('transaction-of-tenant-a')),
          reason: 'organisation A\'s transactions replaced organisation B\'s',
        );
      },
    );

    test(
      'an account create confirmed under A does not settle into B\'s form',
      () async {
        await harness.signIn();
        final subscription = harness.container
            .listen(accountFormControllerProvider, (_, _) {}, fireImmediately: true);
        addTearDown(subscription.close);

        final creating =
            harness.container.read(accountFormControllerProvider.notifier).create(
                  const ManualAccountDraft(
                    displayName: 'A new account',
                    accountType: AccountType.current,
                    currencyCode: 'QAR',
                  ),
                );
        await drain();
        expect(
          harness.accounts.pendingCreates,
          hasLength(1),
          reason: 'the create must be in flight, or there is no race to run',
        );

        await switchToB();

        harness.accounts.pendingCreates.first
            .complete(Success<FinancialAccount>(accountOfA()));
        await drain();
        // The controller refreshes the portfolio after a successful write and
        // parks further reads; answer them so the create can finish.
        for (final held in harness.accounts.pending) {
          if (!held.isCompleted) {
            held.complete(<FinancialAccount>[accountOfB()]);
          }
        }
        await creating;
        await drain();

        expect(
          harness.container.read(accountFormControllerProvider),
          isNot(isA<AccountFormSaved>()),
          reason: 'a write confirmed under organisation A surfaced as a saved '
              'account on organisation B\'s form',
        );
      },
    );
  });

  group('a sign-out', () {
    late TenantIsolationHarness harness;

    setUp(() => harness = TenantIsolationHarness());
    tearDown(() => harness.dispose());

    test('leaves no financial listing behind for the next session', () async {
      await harness.signIn();
      final subscription =
          harness.container.listen(ownAccountsProvider, (_, _) {}, fireImmediately: true);
      await drain();
      harness.accounts.pending.first.complete(<FinancialAccount>[accountOfA()]);
      await drain();
      expect(
        idsIn(harness.container.read(ownAccountsProvider)),
        <String>['account-of-tenant-a'],
        reason: 'the fixture must load real data, or nothing is being cleared',
      );

      await harness.coordinator.signOut();
      await drain();
      expect(
        harness.sessions.state,
        isA<NoSession>(),
        reason: 'the sign-out must actually end the session',
      );

      // The screens have gone; the container has not. This is what the next
      // principal's first read of the portfolio returns.
      subscription.close();

      expect(
        idsIn(harness.container.read(ownAccountsProvider)),
        isNot(contains('account-of-tenant-a')),
        reason: 'the previous session\'s portfolio is still cached in the '
            'process-wide container and is served to whoever signs in next',
      );
    });

    test('leaves no transaction listing behind for the next session', () async {
      await harness.signIn();
      final subscription = harness.container
          .listen(transactionListingProvider, (_, _) {}, fireImmediately: true);
      await drain();
      harness.transactions.pending.first.complete(<Transaction>[
        transaction(transactionId: 'transaction-of-tenant-a'),
      ]);
      await drain();

      await harness.coordinator.signOut();
      await drain();
      subscription.close();

      expect(
        idsOf(harness.container.read(transactionListingProvider)),
        isNot(contains('transaction-of-tenant-a')),
        reason: 'the previous session\'s transactions survived the sign-out',
      );
    });

    test('a read issued before the sign-out does not land after it', () async {
      await harness.signIn();
      final subscription =
          harness.container.listen(ownAccountsProvider, (_, _) {}, fireImmediately: true);
      addTearDown(subscription.close);
      await drain();
      harness.accounts.pending.first.complete(<FinancialAccount>[accountOfA()]);
      await drain();

      final refreshing = harness.container.read(ownAccountsProvider.notifier).refresh();
      await drain();

      await harness.coordinator.signOut();
      await drain();

      harness.accounts.pending.last.complete(<FinancialAccount>[accountOfA()]);
      await refreshing;
      await drain();

      expect(
        idsIn(harness.container.read(ownAccountsProvider)),
        isNot(contains('account-of-tenant-a')),
        reason: 'an answer to a request issued under the ended session was '
            'written into state after the session ended',
      );
    });
  });

  group('the tenant-scoped registry', () {
    test('names every provider that can hold one organisation\'s answer', () {
      final harness = TenantIsolationHarness();
      addTearDown(harness.dispose);
      final registered = harness.container.read(tenantScopedProvidersProvider).toSet();

      // Named individually rather than derived, so adding a provider to the
      // financial surface without registering it fails HERE rather than in
      // production. Each of these holds, or derives from, an answer that is
      // valid only under one binding.
      for (final provider in <Object>[
        ownAccountsProvider,
        accountDetailProvider,
        accountBalancesProvider,
        accountSourceLinksProvider,
        accountFormControllerProvider,
        transactionListingProvider,
        transactionDetailProvider,
        transactionProvenanceProvider,
        accountRecentTransactionsProvider,
        transactionWriteControllerProvider,
      ]) {
        expect(
          registered,
          contains(provider),
          reason: 'a tenant-scoped provider missing from the registry survives '
              'a switch untouched',
        );
      }
    });
  });
}
