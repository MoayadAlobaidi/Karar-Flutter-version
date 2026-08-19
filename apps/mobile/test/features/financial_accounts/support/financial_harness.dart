// The harness for the financial screen tests.
//
// It reuses the platform workstream's `pumpFeatureScreen`, which derives
// direction from the LOCALE rather than taking one — the only way a test can
// prove Arabic actually produces an RTL tree instead of proving the author
// remembered to ask for one.
//
// The repositories are scripted doubles. Nothing here opens a transport, a
// keystore or a preference store, and no test in this workstream constructs
// the composition root.
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:karar_mobile/app/lifecycle/bootstrap_snapshot.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_accounts_repository.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_providers.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/financial_capability.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instrument.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instruments_repository.dart';
import 'package:karar_mobile/features/payment_instruments/presentation/instruments_providers.dart';
import 'package:karar_mobile/features/transaction_categories/domain/transaction_categories_repository.dart';
import 'package:karar_mobile/features/transaction_categories/domain/transaction_category.dart';
import 'package:karar_mobile/features/transaction_categories/presentation/categories_providers.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/domain/transactions_repository.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';

import 'financial_fixtures.dart';

/// A page with no successor.
Page<T> onePage<T>(List<T> items) => Page<T>(
      items: items,
      cursor: PageCursor(
        limit: 50,
        returned: items.length,
        hasMore: false,
        nextCursor: null,
      ),
    );

/// Accounts, balances, source links and issuers, all scripted.
final class ScriptedAccountsRepository
    implements FinancialAccountsRepository, IssuerCatalogueRepository {
  ScriptedAccountsRepository({
    this.accounts = const <FinancialAccount>[],
    this.balances = const <String, List<BalanceSnapshot>>{},
    this.sourceLinks = const <String, List<AccountSourceLink>>{},
    this.issuers = const <Issuer>[],
    this.listFailure,
    this.createResult,
    this.updateResult,
  });

  List<FinancialAccount> accounts;
  Map<String, List<BalanceSnapshot>> balances;
  Map<String, List<AccountSourceLink>> sourceLinks;
  List<Issuer> issuers;
  Failure? listFailure;
  Result<FinancialAccount>? createResult;
  Result<FinancialAccount>? updateResult;

  final List<ManualAccountDraft> created = <ManualAccountDraft>[];
  final List<AccountEdit> updated = <AccountEdit>[];

  /// Every read this repository was asked to perform, so a test can assert
  /// that a refused surface issued none.
  final List<String> reads = <String>[];

  @override
  Future<Result<Page<FinancialAccount>>> listOwnAccounts({int? limit, String? cursor}) async {
    reads.add('listOwnAccounts');
    final failure = listFailure;
    if (failure != null) {
      return Failed<Page<FinancialAccount>>(failure);
    }
    return Success<Page<FinancialAccount>>(onePage<FinancialAccount>(accounts));
  }

  @override
  Future<Result<FinancialAccount>> readOwnAccount(String accountId) async {
    reads.add('readOwnAccount');
    for (final held in accounts) {
      if (held.accountId == accountId) {
        return Success<FinancialAccount>(held);
      }
    }
    return const Failed<FinancialAccount>(NotFoundFailure());
  }

  @override
  Future<Result<FinancialAccount>> createManualAccount(ManualAccountDraft draft) async {
    created.add(draft);
    return createResult ?? Success<FinancialAccount>(account(accountId: 'account-new'));
  }

  @override
  Future<Result<FinancialAccount>> updateAccount(
    String accountId,
    AccountEdit edit,
  ) async {
    updated.add(edit);
    return updateResult ?? Success<FinancialAccount>(account(accountId: accountId));
  }

  @override
  Future<Result<Page<BalanceSnapshot>>> listBalances(
    String accountId, {
    int? limit,
    String? cursor,
  }) async {
    reads.add('listBalances');
    return Success<Page<BalanceSnapshot>>(
      onePage<BalanceSnapshot>(balances[accountId] ?? const <BalanceSnapshot>[]),
    );
  }

  @override
  Future<Result<Page<AccountSourceLink>>> listSourceLinks(
    String accountId, {
    int? limit,
    String? cursor,
  }) async {
    reads.add('listSourceLinks');
    return Success<Page<AccountSourceLink>>(
      onePage<AccountSourceLink>(sourceLinks[accountId] ?? const <AccountSourceLink>[]),
    );
  }

  @override
  Future<Result<Page<Issuer>>> listSelectableIssuers({int? limit, String? cursor}) async {
    reads.add('listSelectableIssuers');
    return Success<Page<Issuer>>(onePage<Issuer>(issuers));
  }
}

/// Instruments, scripted per account.
final class ScriptedInstrumentsRepository implements PaymentInstrumentsRepository {
  ScriptedInstrumentsRepository([this.byAccount = const <String, List<PaymentInstrument>>{}]);

  Map<String, List<PaymentInstrument>> byAccount;
  final List<String> reads = <String>[];

  @override
  Future<Result<Page<PaymentInstrument>>> listForAccount(
    String accountId, {
    int? limit,
    String? cursor,
  }) async {
    reads.add(accountId);
    return Success<Page<PaymentInstrument>>(
      onePage<PaymentInstrument>(byAccount[accountId] ?? const <PaymentInstrument>[]),
    );
  }
}

/// Transactions, scripted.
final class ScriptedTransactionsRepository implements TransactionsRepository {
  ScriptedTransactionsRepository({
    this.transactions = const <Transaction>[],
    this.detail,
    this.provenanceRows = const <TransactionProvenance>[],
    this.listFailure,
    this.createResult,
    this.correctResult,
    this.assignResult,
    this.deleteResult,
    this.hasMore = false,
  });

  List<Transaction> transactions;
  TransactionDetail? detail;
  List<TransactionProvenance> provenanceRows;
  Failure? listFailure;
  Result<Transaction>? createResult;
  Result<Transaction>? correctResult;
  Result<CategoryAssignment>? assignResult;
  Result<TransactionDeletionOutcome>? deleteResult;
  bool hasMore;

  final List<TransactionFilter> filters = <TransactionFilter>[];
  final List<ManualTransactionDraft> created = <ManualTransactionDraft>[];
  final List<TransactionCorrection> corrections = <TransactionCorrection>[];
  final List<String> assignedCategories = <String>[];
  final List<String> deleted = <String>[];
  final List<String> reads = <String>[];

  @override
  Future<Result<Page<Transaction>>> listOwn({
    TransactionFilter filter = const TransactionFilter(),
    int? limit,
    String? cursor,
  }) async {
    reads.add('listOwn');
    filters.add(filter);
    final failure = listFailure;
    if (failure != null) {
      return Failed<Page<Transaction>>(failure);
    }
    return Success<Page<Transaction>>(
      Page<Transaction>(
        items: transactions,
        cursor: PageCursor(
          limit: 50,
          returned: transactions.length,
          hasMore: hasMore,
          nextCursor: hasMore ? 'cursor-next' : null,
        ),
      ),
    );
  }

  @override
  Future<Result<TransactionDetail>> read(String transactionId) async {
    reads.add('read');
    return Success<TransactionDetail>(detail ?? transactionDetail());
  }

  @override
  Future<Result<Transaction>> createManual(ManualTransactionDraft draft) async {
    created.add(draft);
    return createResult ?? Success<Transaction>(transaction());
  }

  @override
  Future<Result<Transaction>> correct(
    String transactionId,
    TransactionCorrection correction,
  ) async {
    corrections.add(correction);
    return correctResult ?? Success<Transaction>(transaction(version: 2));
  }

  @override
  Future<Result<CategoryAssignment>> assignCategory(
    String transactionId,
    String categoryCode,
  ) async {
    assignedCategories.add(categoryCode);
    return assignResult ?? Success<CategoryAssignment>(categoryAssignment());
  }

  @override
  Future<Result<List<TransactionProvenance>>> listProvenance(
    String transactionId,
  ) async {
    reads.add('listProvenance');
    return Success<List<TransactionProvenance>>(provenanceRows);
  }

  @override
  Future<Result<TransactionDeletionOutcome>> delete(String transactionId) async {
    deleted.add(transactionId);
    return deleteResult ??
        Success<TransactionDeletionOutcome>(
          TransactionDeletionOutcome(
            transactionId: transactionId,
            applied: true,
            transferMatchesDeleted: 0,
            code: null,
          ),
        );
  }
}

/// The reviewed category catalogue, scripted.
final class ScriptedCategoriesRepository implements TransactionCategoriesRepository {
  ScriptedCategoriesRepository([this.entries = const <TransactionCategory>[]]);

  List<TransactionCategory> entries;
  Failure? failure;

  @override
  Future<Result<Page<TransactionCategory>>> listCategories({
    int? limit,
    String? cursor,
    bool? assignableOnly,
  }) async {
    final held = failure;
    if (held != null) {
      return Failed<Page<TransactionCategory>>(held);
    }
    return Success<Page<TransactionCategory>>(onePage<TransactionCategory>(entries));
  }
}

/// The overrides a financial screen test installs.
///
/// [bootstrap] is the LOCAL/TEST capability answer; pass one without the
/// capability to prove the surface closes.
List<Override> financialOverrides({
  ScriptedAccountsRepository? accounts,
  ScriptedInstrumentsRepository? instruments,
  ScriptedTransactionsRepository? transactions,
  ScriptedCategoriesRepository? categories,
  BootstrapSnapshot? bootstrap,
}) =>
    <Override>[
      financialBootstrapProvider.overrideWithValue(bootstrap ?? syntheticBootstrap()),
      if (accounts != null) ...<Override>[
        financialAccountsRepositoryProvider.overrideWithValue(accounts),
        issuerCatalogueRepositoryProvider.overrideWithValue(accounts),
      ],
      if (instruments != null)
        paymentInstrumentsRepositoryProvider.overrideWithValue(instruments),
      if (transactions != null)
        transactionsRepositoryProvider.overrideWithValue(transactions),
      if (categories != null)
        transactionCategoriesRepositoryProvider.overrideWithValue(categories),
    ];
