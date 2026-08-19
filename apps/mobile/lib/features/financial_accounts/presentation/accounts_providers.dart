// Providers for the accounts-and-wallets surface.
//
// Everything here is TENANT-SCOPED: an account belongs to one organisation and
// is invalid the moment the session's binding changes. The composition root
// registers these so a tenant switch discards them; a financial provider that
// survived a switch would show one organisation's money under another.
//
// No widget in this feature performs a request. A screen reads a provider, the
// provider reads a use case, the use case reads a repository, and only the
// repository touches the transport.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_financial_accounts_repository.dart';
import '../data/financial_gateway.dart';
import '../domain/account_portfolio.dart';
import '../domain/account_source_link.dart';
import '../domain/balance_snapshot.dart';
import '../domain/financial_account.dart';
import '../domain/financial_accounts_repository.dart';

/// The one gateway every financial repository issues requests through.
final Provider<FinancialGateway> financialGatewayProvider = Provider<FinancialGateway>(
  (Ref ref) => FinancialGateway(ref.watch(apiTransportProvider)),
);

final Provider<FinancialAccountsRepository> financialAccountsRepositoryProvider =
    Provider<FinancialAccountsRepository>(
  (Ref ref) => ApiFinancialAccountsRepository(ref.watch(financialGatewayProvider)),
);

final Provider<IssuerCatalogueRepository> issuerCatalogueRepositoryProvider =
    Provider<IssuerCatalogueRepository>(
  (Ref ref) => ApiFinancialAccountsRepository(ref.watch(financialGatewayProvider)),
);

final Provider<LoadOwnAccounts> loadOwnAccountsProvider = Provider<LoadOwnAccounts>(
  (Ref ref) => LoadOwnAccounts(ref.watch(financialAccountsRepositoryProvider)),
);

final Provider<LoadAccount> loadAccountProvider = Provider<LoadAccount>(
  (Ref ref) => LoadAccount(ref.watch(financialAccountsRepositoryProvider)),
);

final Provider<LoadAccountBalances> loadAccountBalancesProvider =
    Provider<LoadAccountBalances>(
  (Ref ref) => LoadAccountBalances(ref.watch(financialAccountsRepositoryProvider)),
);

final Provider<LoadAccountSourceLinks> loadAccountSourceLinksProvider =
    Provider<LoadAccountSourceLinks>(
  (Ref ref) => LoadAccountSourceLinks(ref.watch(financialAccountsRepositoryProvider)),
);

final Provider<CreateManualAccount> createManualAccountProvider =
    Provider<CreateManualAccount>(
  (Ref ref) => CreateManualAccount(ref.watch(financialAccountsRepositoryProvider)),
);

final Provider<UpdateAccount> updateAccountProvider = Provider<UpdateAccount>(
  (Ref ref) => UpdateAccount(ref.watch(financialAccountsRepositoryProvider)),
);

final Provider<LoadSelectableIssuers> loadSelectableIssuersProvider =
    Provider<LoadSelectableIssuers>(
  (Ref ref) => LoadSelectableIssuers(ref.watch(issuerCatalogueRepositoryProvider)),
);

/// The accounts the platform returned, or the typed failure that prevented it.
sealed class AccountsView {
  const AccountsView();
}

final class AccountsLoaded extends AccountsView {
  const AccountsLoaded(this.accounts);

  final List<FinancialAccount> accounts;
}

final class AccountsUnavailable extends AccountsView {
  const AccountsUnavailable(this.failure);

  final Failure failure;
}

/// Every account the principal owns.
final class OwnAccountsController extends AsyncNotifier<AccountsView> {
  @override
  Future<AccountsView> build() async {
    final result = await ref.watch(loadOwnAccountsProvider)();
    return switch (result) {
      Success<List<FinancialAccount>>(:final value) => AccountsLoaded(value),
      Failed<List<FinancialAccount>>(:final failure) => AccountsUnavailable(failure),
    };
  }

  Future<void> refresh() async {
    state = const AsyncLoading<AccountsView>();
    state = await AsyncValue.guard<AccountsView>(build);
  }
}

final AsyncNotifierProvider<OwnAccountsController, AccountsView> ownAccountsProvider =
    AsyncNotifierProvider<OwnAccountsController, AccountsView>(
  OwnAccountsController.new,
);

/// How the portfolio is currently arranged and narrowed.
///
/// It holds a grouping and a filter and NOTHING ELSE — in particular no
/// figure, so there is nowhere here for a total to be cached.
final class PortfolioArrangement {
  const PortfolioArrangement({
    this.grouping = PortfolioGrouping.issuer,
    this.filter = const PortfolioFilter(),
  });

  final PortfolioGrouping grouping;
  final PortfolioFilter filter;

  PortfolioArrangement copyWith({
    PortfolioGrouping? grouping,
    PortfolioFilter? filter,
  }) =>
      PortfolioArrangement(
        grouping: grouping ?? this.grouping,
        filter: filter ?? this.filter,
      );
}

/// Drives the grouping and filtering controls.
final class PortfolioArrangementController extends Notifier<PortfolioArrangement> {
  @override
  PortfolioArrangement build() => const PortfolioArrangement();

  void groupBy(PortfolioGrouping grouping) =>
      state = state.copyWith(grouping: grouping);

  void applyFilter(PortfolioFilter filter) => state = state.copyWith(filter: filter);

  void clearFilters() =>
      state = state.copyWith(filter: const PortfolioFilter());
}

final NotifierProvider<PortfolioArrangementController, PortfolioArrangement>
    portfolioArrangementProvider =
    NotifierProvider<PortfolioArrangementController, PortfolioArrangement>(
  PortfolioArrangementController.new,
);

/// The portfolio as the screen renders it: grouped, filtered, never totalled.
final Provider<AccountPortfolio?> portfolioProvider = Provider<AccountPortfolio?>(
  (Ref ref) {
    final view = ref.watch(ownAccountsProvider).value;
    if (view is! AccountsLoaded) {
      return null;
    }
    final arrangement = ref.watch(portfolioArrangementProvider);
    return AccountPortfolio.from(
      view.accounts,
      filter: arrangement.filter,
      grouping: arrangement.grouping,
    );
  },
);

/// One account, read fresh so a detail screen reached by deep link does not
/// depend on the listing having been loaded first.
///
/// The typed failure travels through the error branch as [AccountReadFailure],
/// so a screen switches on the failure taxonomy rather than on a message.
final accountDetailProvider = FutureProvider.family<FinancialAccount, String>(
  (Ref ref, String accountId) async {
    final result = await ref.watch(loadAccountProvider)(accountId);
    return switch (result) {
      Success<FinancialAccount>(:final value) => value,
      Failed<FinancialAccount>(:final failure) => throw AccountReadFailure(failure),
    };
  },
);

/// Carries a typed failure through `AsyncValue.error`.
///
/// The failure taxonomy is the client's whole error vocabulary; wrapping it
/// keeps the screen switching on the typed failure rather than on a message.
final class AccountReadFailure implements Exception {
  const AccountReadFailure(this.failure);

  final Failure failure;

  /// Names the failure type only. A financial read failure must not carry an
  /// account reference into a crash dump or a framework error.
  @override
  String toString() => 'AccountReadFailure(${failure.diagnosticLabel})';
}

/// The figures sources reported for one account, grouped by kind.
final accountBalancesProvider = FutureProvider.family<BalancesByKind, String>(
  (Ref ref, String accountId) async {
    final result = await ref.watch(loadAccountBalancesProvider)(accountId);
    return switch (result) {
      Success<BalancesByKind>(:final value) => value,
      Failed<BalancesByKind>(:final failure) => throw AccountReadFailure(failure),
    };
  },
);

/// Which sources feed one account.
final accountSourceLinksProvider =
    FutureProvider.family<List<AccountSourceLink>, String>(
  (Ref ref, String accountId) async {
    final result = await ref.watch(loadAccountSourceLinksProvider)(accountId);
    return switch (result) {
      Success<List<AccountSourceLink>>(:final value) => value,
      Failed<List<AccountSourceLink>>(:final failure) =>
        throw AccountReadFailure(failure),
    };
  },
);

/// The issuers a new account may name.
///
/// A catalogue that cannot be read is not a blocked form: the person can still
/// name an issuer themselves, so this answers with nothing rather than failing
/// the whole screen.
final FutureProvider<List<Issuer>> selectableIssuersProvider =
    FutureProvider<List<Issuer>>((Ref ref) async {
  final result = await ref.watch(loadSelectableIssuersProvider)();
  return switch (result) {
    Success<List<Issuer>>(:final value) => value,
    Failed<List<Issuer>>() => const <Issuer>[],
  };
});

/// The state of one account create or edit.
sealed class AccountFormState {
  const AccountFormState();
}

final class AccountFormIdle extends AccountFormState {
  const AccountFormIdle();
}

final class AccountFormSubmitting extends AccountFormState {
  const AccountFormSubmitting();
}

final class AccountFormSaved extends AccountFormState {
  const AccountFormSaved(this.account);

  final FinancialAccount account;
}

final class AccountFormRejected extends AccountFormState {
  const AccountFormRejected(this.failure);

  final Failure failure;

  /// The client or the platform found a rule violation. The named fields are
  /// [AccountDraftViolation] names.
  List<String> get violatedFields =>
      failure is InvalidRequestFailure ? (failure as InvalidRequestFailure).fields : const <String>[];

  bool get isVersionConflict => failure is ConflictFailure;

  bool get isNoChange => failure.code == noChangeCode;
}

/// Sequences one create or edit.
final class AccountFormController extends Notifier<AccountFormState> {
  @override
  AccountFormState build() => const AccountFormIdle();

  Future<void> create(ManualAccountDraft draft) async {
    if (state is AccountFormSubmitting) {
      return;
    }
    state = const AccountFormSubmitting();
    final result = await ref.read(createManualAccountProvider)(draft);
    await _settle(result);
  }

  Future<void> update(String accountId, AccountEdit edit) async {
    if (state is AccountFormSubmitting) {
      return;
    }
    state = const AccountFormSubmitting();
    final result = await ref.read(updateAccountProvider)(accountId, edit);
    await _settle(result);
    if (result is Success<FinancialAccount>) {
      ref.invalidate(accountDetailProvider(accountId));
    }
  }

  void reset() => state = const AccountFormIdle();

  Future<void> _settle(Result<FinancialAccount> result) async {
    switch (result) {
      case Failed<FinancialAccount>(:final failure):
        state = AccountFormRejected(failure);
      case Success<FinancialAccount>(:final value):
        state = AccountFormSaved(value);
        await ref.read(ownAccountsProvider.notifier).refresh();
    }
  }
}

final NotifierProvider<AccountFormController, AccountFormState>
    accountFormControllerProvider =
    NotifierProvider<AccountFormController, AccountFormState>(
  AccountFormController.new,
);
