// PURE DART ONLY. See lib/README.md — domain purity.
//
// The instruments of ONE account. There is no listing across accounts and no
// port for one: an instrument is only meaningful under the account it spends
// from, and a flat list of cards is the shape that invites someone to put a
// balance beside each one.
//
// Every payment-instrument WRITE is deliberately absent from the contract —
// its shape is unresolved — so there is no create, update or delete port here
// either.
import '../../../core/errors/result.dart';
import '../../financial_accounts/domain/page.dart';
import 'payment_instrument.dart';

/// The instruments that spend from one of the caller's own accounts.
abstract interface class PaymentInstrumentsRepository {
  Future<Result<Page<PaymentInstrument>>> listForAccount(
    String accountId, {
    int? limit,
    String? cursor,
  });
}

/// Reads the instruments nested under one account.
final class LoadAccountInstruments {
  const LoadAccountInstruments(this._repository, {this.pageLimit = 50});

  final PaymentInstrumentsRepository _repository;
  final int pageLimit;

  Future<Result<List<PaymentInstrument>>> call(String accountId) async {
    final result = await _repository.listForAccount(accountId, limit: pageLimit);
    return switch (result) {
      Success<Page<PaymentInstrument>>(:final value) =>
        Success<List<PaymentInstrument>>(value.items),
      Failed<Page<PaymentInstrument>>(:final failure) =>
        Failed<List<PaymentInstrument>>(failure),
    };
  }
}
