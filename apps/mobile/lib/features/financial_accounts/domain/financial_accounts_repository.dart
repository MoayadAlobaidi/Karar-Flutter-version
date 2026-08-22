// PURE DART ONLY. See lib/README.md — domain purity.
//
// The ports the accounts-and-wallets surface reads through, and the use cases
// that sequence them.
//
// There is NO delete port. The platform deliberately exposes no
// account-deletion operation: its cross-module cascade is not atomic and the
// contract for reporting a partial outcome has not been chosen. A port here
// would be a promise the platform has not made, so the client offers no
// control for it either.
//
// There is no "connect" port for the same class of reason: no issuer exposes
// an interface to this platform, so there is nothing to connect to and no
// operation that could.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import 'account_source_link.dart';
import 'balance_snapshot.dart';
import 'financial_account.dart';
import 'page.dart';

/// The caller's own accounts and wallets.
abstract interface class FinancialAccountsRepository {
  /// One page of the caller's own accounts, oldest first.
  Future<Result<Page<FinancialAccount>>> listOwnAccounts({
    int? limit,
    String? cursor,
  });

  Future<Result<FinancialAccount>> readOwnAccount(String accountId);

  Future<Result<FinancialAccount>> createManualAccount(ManualAccountDraft draft);

  Future<Result<FinancialAccount>> updateAccount(String accountId, AccountEdit edit);

  /// The figures SOURCES reported for one account, most recently true first.
  Future<Result<Page<BalanceSnapshot>>> listBalances(
    String accountId, {
    int? limit,
    String? cursor,
  });

  /// Which sources feed one account and how fresh they are.
  Future<Result<Page<AccountSourceLink>>> listSourceLinks(
    String accountId, {
    int? limit,
    String? cursor,
  });
}

/// The reviewed issuer catalogue.
abstract interface class IssuerCatalogueRepository {
  /// The issuers a NEW account may point at. A retired entry is deliberately
  /// absent here while remaining resolvable through an account that already
  /// names it.
  Future<Result<Page<Issuer>>> listSelectableIssuers({int? limit, String? cursor});
}

/// Reads every page of the caller's own accounts.
///
/// Pagination is followed to the end rather than stopping at the first page:
/// a portfolio grouped by issuer is wrong if it is grouped over a subset, and
/// a person with more accounts than one page would silently lose some.
final class LoadOwnAccounts {
  const LoadOwnAccounts(this._repository, {this.pageLimit = 100, this.maximumPages = 20});

  final FinancialAccountsRepository _repository;
  final int pageLimit;

  /// A bound on the walk, so a server that always answers `hasMore` cannot
  /// spin the client forever.
  final int maximumPages;

  Future<Result<List<FinancialAccount>>> call() async {
    final collected = <FinancialAccount>[];
    String? cursor;
    for (var page = 0; page < maximumPages; page++) {
      final result = await _repository.listOwnAccounts(limit: pageLimit, cursor: cursor);
      switch (result) {
        case Failed<Page<FinancialAccount>>(:final failure):
          return Failed<List<FinancialAccount>>(failure);
        case Success<Page<FinancialAccount>>(:final value):
          collected.addAll(value.items);
          if (!value.cursor.hasMore || value.cursor.nextCursor == null) {
            return Success<List<FinancialAccount>>(
              List<FinancialAccount>.unmodifiable(collected),
            );
          }
          cursor = value.cursor.nextCursor;
      }
    }
    return Success<List<FinancialAccount>>(
      List<FinancialAccount>.unmodifiable(collected),
    );
  }
}

/// Reads one account.
final class LoadAccount {
  const LoadAccount(this._repository);

  final FinancialAccountsRepository _repository;

  Future<Result<FinancialAccount>> call(String accountId) =>
      _repository.readOwnAccount(accountId);
}

/// Reads the source-reported balances of one account, grouped by kind.
final class LoadAccountBalances {
  const LoadAccountBalances(this._repository, {this.pageLimit = 50});

  final FinancialAccountsRepository _repository;
  final int pageLimit;

  Future<Result<BalancesByKind>> call(String accountId) async {
    final result = await _repository.listBalances(accountId, limit: pageLimit);
    return switch (result) {
      Success<Page<BalanceSnapshot>>(:final value) =>
        Success<BalancesByKind>(BalancesByKind.from(value.items)),
      Failed<Page<BalanceSnapshot>>(:final failure) => Failed<BalancesByKind>(failure),
    };
  }
}

/// Reads which sources feed one account.
final class LoadAccountSourceLinks {
  const LoadAccountSourceLinks(this._repository, {this.pageLimit = 50});

  final FinancialAccountsRepository _repository;
  final int pageLimit;

  Future<Result<List<AccountSourceLink>>> call(String accountId) async {
    final result = await _repository.listSourceLinks(accountId, limit: pageLimit);
    return switch (result) {
      Success<Page<AccountSourceLink>>(:final value) =>
        Success<List<AccountSourceLink>>(value.items),
      Failed<Page<AccountSourceLink>>(:final failure) =>
        Failed<List<AccountSourceLink>>(failure),
    };
  }
}

/// Creates one manual account.
///
/// The draft is checked locally first so a person is told which field is
/// wrong, rather than being handed a rule violation the server had to compute.
final class CreateManualAccount {
  const CreateManualAccount(this._repository);

  final FinancialAccountsRepository _repository;

  Future<Result<FinancialAccount>> call(ManualAccountDraft draft) {
    final violations = draft.violations;
    if (violations.isNotEmpty) {
      // Declined locally. `Failure` is sealed in core, so the violations
      // travel as the typed `fields` of an invalid-request failure rather
      // than as a bespoke failure type this feature would have to smuggle in.
      return Future<Result<FinancialAccount>>.value(
        Failed<FinancialAccount>(
          InvalidRequestFailure(
            code: accountRuleViolatedCode,
            fields: <String>[
              for (final violation in violations) violation.name,
            ],
          ),
        ),
      );
    }
    return _repository.createManualAccount(draft);
  }
}

/// The platform's own code for a violated account rule, reused for a locally
/// declined draft so one code covers both refusals.
const String accountRuleViolatedCode = 'ACCOUNT_RULE_VIOLATED';

/// The platform's own code for a change set that changes nothing.
const String noChangeCode = 'NO_CHANGE';

/// Applies one edit under the account's optimistic version.
final class UpdateAccount {
  const UpdateAccount(this._repository);

  final FinancialAccountsRepository _repository;

  Future<Result<FinancialAccount>> call(String accountId, AccountEdit edit) {
    if (edit.isEmpty) {
      // An edit that changes nothing is refused here rather than sent: the
      // platform refuses it too, and a round trip that can only fail is a
      // round trip a person waits through for nothing.
      return Future<Result<FinancialAccount>>.value(
        const Failed<FinancialAccount>(InvalidRequestFailure(code: noChangeCode)),
      );
    }
    return _repository.updateAccount(accountId, edit);
  }
}

/// Reads the issuers a new account may name.
final class LoadSelectableIssuers {
  const LoadSelectableIssuers(this._repository, {this.pageLimit = 200});

  final IssuerCatalogueRepository _repository;
  final int pageLimit;

  Future<Result<List<Issuer>>> call() async {
    final result = await _repository.listSelectableIssuers(limit: pageLimit);
    return switch (result) {
      Success<Page<Issuer>>(:final value) => Success<List<Issuer>>(value.items),
      Failed<Page<Issuer>>(:final failure) => Failed<List<Issuer>>(failure),
    };
  }
}
