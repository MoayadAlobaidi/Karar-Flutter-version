// REPOSITORIES THAT REFUSE EVERY READ WITH ONE NAMED FAILURE.
//
// The question they exist to answer is whether the client's refusal DIFFERS
// between "no such resource" and "that one is not yours". A server that answers
// 404 for both is doing the right thing, but the client must not be the place
// where the two become distinguishable either — so the same screens are driven
// with each failure and the rendered text is compared.
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/financial_accounts/domain/account_source_link.dart';
import 'package:karar_mobile/features/financial_accounts/domain/balance_snapshot.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_account.dart';
import 'package:karar_mobile/features/financial_accounts/domain/financial_accounts_repository.dart';
import 'package:karar_mobile/features/financial_accounts/domain/page.dart';
import 'package:karar_mobile/features/financial_accounts/presentation/accounts_providers.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instrument.dart';
import 'package:karar_mobile/features/payment_instruments/domain/payment_instruments_repository.dart';
import 'package:karar_mobile/features/payment_instruments/presentation/instruments_providers.dart';
import 'package:karar_mobile/features/transactions/domain/transaction.dart';
import 'package:karar_mobile/features/transactions/domain/transaction_detail.dart';
import 'package:karar_mobile/features/transactions/domain/transactions_repository.dart';
import 'package:karar_mobile/features/transactions/presentation/transactions_providers.dart';

/// Overrides that make every financial read fail with [failure].
List<Override> refusingFinancialRepositories(Failure failure) {
  final accounts = _RefusingAccountsRepository(failure);
  return <Override>[
    financialAccountsRepositoryProvider.overrideWithValue(accounts),
    issuerCatalogueRepositoryProvider.overrideWithValue(accounts),
    transactionsRepositoryProvider.overrideWithValue(_RefusingTransactionsRepository(failure)),
    paymentInstrumentsRepositoryProvider.overrideWithValue(_RefusingInstrumentsRepository(failure)),
  ];
}

final class _RefusingAccountsRepository
    implements FinancialAccountsRepository, IssuerCatalogueRepository {
  const _RefusingAccountsRepository(this._failure);

  final Failure _failure;

  @override
  Future<Result<Page<FinancialAccount>>> listOwnAccounts({int? limit, String? cursor}) async =>
      Failed<Page<FinancialAccount>>(_failure);

  @override
  Future<Result<FinancialAccount>> readOwnAccount(String accountId) async =>
      Failed<FinancialAccount>(_failure);

  @override
  Future<Result<FinancialAccount>> createManualAccount(ManualAccountDraft draft) async =>
      Failed<FinancialAccount>(_failure);

  @override
  Future<Result<FinancialAccount>> updateAccount(String accountId, AccountEdit edit) async =>
      Failed<FinancialAccount>(_failure);

  @override
  Future<Result<Page<BalanceSnapshot>>> listBalances(
    String accountId, {
    int? limit,
    String? cursor,
  }) async => Failed<Page<BalanceSnapshot>>(_failure);

  @override
  Future<Result<Page<AccountSourceLink>>> listSourceLinks(
    String accountId, {
    int? limit,
    String? cursor,
  }) async => Failed<Page<AccountSourceLink>>(_failure);

  @override
  Future<Result<Page<Issuer>>> listSelectableIssuers({int? limit, String? cursor}) async =>
      Failed<Page<Issuer>>(_failure);
}

final class _RefusingTransactionsRepository implements TransactionsRepository {
  const _RefusingTransactionsRepository(this._failure);

  final Failure _failure;

  @override
  Future<Result<Page<Transaction>>> listOwn({
    TransactionFilter filter = const TransactionFilter(),
    int? limit,
    String? cursor,
  }) async => Failed<Page<Transaction>>(_failure);

  @override
  Future<Result<TransactionDetail>> read(String transactionId) async =>
      Failed<TransactionDetail>(_failure);

  @override
  Future<Result<Transaction>> createManual(ManualTransactionDraft draft) async =>
      Failed<Transaction>(_failure);

  @override
  Future<Result<Transaction>> correct(String id, TransactionCorrection correction) async =>
      Failed<Transaction>(_failure);

  @override
  Future<Result<CategoryAssignment>> assignCategory(String id, String categoryCode) async =>
      Failed<CategoryAssignment>(_failure);

  @override
  Future<Result<List<TransactionProvenance>>> listProvenance(String id) async =>
      Failed<List<TransactionProvenance>>(_failure);

  @override
  Future<Result<TransactionDeletionOutcome>> delete(String id) async =>
      Failed<TransactionDeletionOutcome>(_failure);
}

final class _RefusingInstrumentsRepository implements PaymentInstrumentsRepository {
  const _RefusingInstrumentsRepository(this._failure);

  final Failure _failure;

  @override
  Future<Result<Page<PaymentInstrument>>> listForAccount(
    String accountId, {
    int? limit,
    String? cursor,
  }) async => Failed<Page<PaymentInstrument>>(_failure);
}
