// Providers for the accounts-and-wallets surface.
//
// Everything here is TENANT-SCOPED: an account belongs to one organisation and
// is invalid the moment the session's binding changes. The composition root
// registers these so a tenant switch discards them; a financial provider that
// survived a switch would show one organisation's money under another.
//
// Every asynchronous read here is a [TenantScopedAsyncNotifier] rather than a
// `FutureProvider`, because only a notifier can EMPTY itself and `ref.invalidate`
// reloads rather than empties — see `app/lifecycle/tenant_data_scope.dart`. The
// two detail reads answer with null once discarded; their screens render the
// loading state for it, because a discarded read is one that is about to be
// re-issued or one whose session has ended, and in neither case is there
// anything to show.
//
// No widget in this feature performs a request. A screen reads a provider, the
// provider reads a use case, the use case reads a repository, and only the
// repository touches the transport.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show AsyncNotifierProviderFamily;

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_financial_accounts_repository.dart';
import '../domain/account_portfolio.dart';
import '../domain/account_source_link.dart';
import '../domain/balance_snapshot.dart';
import '../domain/financial_account.dart';
import '../domain/financial_accounts_repository.dart';

// The financial repositories issue their requests through `apiClientProvider`,
// the composition root's generated client. There is no financial client of its
// own: a second one would be a second place for a timeout, an interceptor or a
// credential to be configured differently, and the financial surface is the
// last one where two answers would be acceptable.

final Provider<FinancialAccountsRepository> financialAccountsRepositoryProvider =
    Provider<FinancialAccountsRepository>(
  (Ref ref) => ApiFinancialAccountsRepository(ref.watch(apiClientProvider)),
);

final Provider<IssuerCatalogueRepository> issuerCatalogueRepositoryProvider =
    Provider<IssuerCatalogueRepository>(
  (Ref ref) => ApiFinancialAccountsRepository(ref.watch(apiClientProvider)),
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
final class OwnAccountsController extends TenantScopedAsyncNotifier<AccountsView> {
  /// No organisation's portfolio is held. Deliberately not `AccountsLoaded([])`:
  /// an empty list is a claim that the organisation owns no accounts, and this
  /// state is the absence of an answer, not an answer of absence.
  @override
  AccountsView get discarded => const AccountsUnavailable(SessionChangedFailure());

  @override
  Future<AccountsView> load() async {
    final result = await ref.watch(loadOwnAccountsProvider)();
    return switch (result) {
      Success<List<FinancialAccount>>(:final value) => AccountsLoaded(value),
      Failed<List<FinancialAccount>>(:final failure) => AccountsUnavailable(failure),
    };
  }

  Future<void> refresh() async {
    final TenantDataGeneration issued = binding;
    state = const AsyncLoading<AccountsView>();
    final AsyncValue<AccountsView> answer =
        await AsyncValue.guard<AccountsView>(load);
    if (issued.hasEnded) {
      // The portfolio this read asked for belongs to an organisation the
      // session has left, or to a session that has ended. Riverpod reuses the
      // notifier across an invalidation, so without this the write lands on the
      // LIVE element and replaces the new organisation's accounts with the
      // previous one's.
      return;
    }
    state = answer;
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
///
/// The value is NULLABLE because null is what "no organisation's account is
/// held here" looks like, and writing a fresh `AsyncData` is the only thing
/// that erases a cached answer. Without a value meaning nothing, the previous
/// organisation's account stays readable through the whole post-switch reload.
final class AccountDetailController extends TenantScopedAsyncNotifier<FinancialAccount?> {
  AccountDetailController(this.accountId);

  final String accountId;

  @override
  FinancialAccount? get discarded => null;

  @override
  Future<FinancialAccount?> load() async {
    final result = await ref.watch(loadAccountProvider)(accountId);
    return switch (result) {
      Success<FinancialAccount>(:final value) => value,
      Failed<FinancialAccount>(:final failure) => throw AccountReadFailure(failure),
    };
  }
}

final AsyncNotifierProviderFamily<AccountDetailController, FinancialAccount?, String>
    accountDetailProvider =
    AsyncNotifierProvider.family<AccountDetailController, FinancialAccount?, String>(
  AccountDetailController.new,
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
final class AccountBalancesController extends TenantScopedAsyncNotifier<BalancesByKind> {
  AccountBalancesController(this.accountId);

  final String accountId;

  /// No figures at all. A balance is the single most disclosive thing on this
  /// surface, so it is the one that must not survive a change of organisation.
  @override
  BalancesByKind get discarded => const BalancesByKind(<BalanceKindGroup>[]);

  @override
  Future<BalancesByKind> load() async {
    final result = await ref.watch(loadAccountBalancesProvider)(accountId);
    return switch (result) {
      Success<BalancesByKind>(:final value) => value,
      Failed<BalancesByKind>(:final failure) => throw AccountReadFailure(failure),
    };
  }
}

final AsyncNotifierProviderFamily<AccountBalancesController, BalancesByKind, String>
    accountBalancesProvider =
    AsyncNotifierProvider.family<AccountBalancesController, BalancesByKind, String>(
  AccountBalancesController.new,
);

/// Which sources feed one account.
final class AccountSourceLinksController
    extends TenantScopedAsyncNotifier<List<AccountSourceLink>> {
  AccountSourceLinksController(this.accountId);

  final String accountId;

  @override
  List<AccountSourceLink> get discarded => const <AccountSourceLink>[];

  @override
  Future<List<AccountSourceLink>> load() async {
    final result = await ref.watch(loadAccountSourceLinksProvider)(accountId);
    return switch (result) {
      Success<List<AccountSourceLink>>(:final value) => value,
      Failed<List<AccountSourceLink>>(:final failure) =>
        throw AccountReadFailure(failure),
    };
  }
}

final AsyncNotifierProviderFamily<AccountSourceLinksController,
        List<AccountSourceLink>, String> accountSourceLinksProvider =
    AsyncNotifierProvider.family<AccountSourceLinksController, List<AccountSourceLink>,
        String>(
  AccountSourceLinksController.new,
);

/// The issuers a new account may name.
///
/// A catalogue that cannot be read is not a blocked form: the person can still
/// name an issuer themselves, so this answers with nothing rather than failing
/// the whole screen.
final class SelectableIssuersController extends TenantScopedAsyncNotifier<List<Issuer>> {
  @override
  List<Issuer> get discarded => const <Issuer>[];

  @override
  Future<List<Issuer>> load() async {
    final result = await ref.watch(loadSelectableIssuersProvider)();
    return switch (result) {
      Success<List<Issuer>>(:final value) => value,
      Failed<List<Issuer>>() => const <Issuer>[],
    };
  }
}

final AsyncNotifierProvider<SelectableIssuersController, List<Issuer>>
    selectableIssuersProvider =
    AsyncNotifierProvider<SelectableIssuersController, List<Issuer>>(
  SelectableIssuersController.new,
);

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
///
/// EVERY WRITE THAT FOLLOWS AN `await` IS GUARDED. Riverpod reuses this
/// notifier instance across an invalidation — only `build` re-runs — so
/// `ref.mounted` is still true after the tenant-scoped discard and an unguarded
/// `state = AccountFormSaved(…)` reports an account created under the PREVIOUS
/// organisation as saved on the new organisation's form.
final class AccountFormController extends Notifier<AccountFormState> {
  @override
  AccountFormState build() => const AccountFormIdle();

  /// The binding this controller is currently acting for.
  TenantDataGeneration get binding => ref.tenantBinding();

  Future<void> create(ManualAccountDraft draft) async {
    if (state is AccountFormSubmitting) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = const AccountFormSubmitting();
    final result = await ref.read(createManualAccountProvider)(draft);
    if (issued.hasEnded) {
      return;
    }
    await _settle(result);
  }

  Future<void> update(String accountId, AccountEdit edit) async {
    if (state is AccountFormSubmitting) {
      return;
    }
    final TenantDataGeneration issued = binding;
    state = const AccountFormSubmitting();
    final result = await ref.read(updateAccountProvider)(accountId, edit);
    if (issued.hasEnded) {
      return;
    }
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
