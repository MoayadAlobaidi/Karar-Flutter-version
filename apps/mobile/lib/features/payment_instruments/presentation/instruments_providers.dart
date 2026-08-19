// Providers for the instruments nested under one account.
//
// The family key is the ACCOUNT id, not the instrument id: there is no listing
// of instruments across accounts, because an instrument is only meaningful
// under the account it spends from.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/result.dart';
import '../../financial_accounts/presentation/accounts_providers.dart';
import '../data/api_payment_instruments_repository.dart';
import '../domain/payment_instrument.dart';
import '../domain/payment_instruments_repository.dart';

final Provider<PaymentInstrumentsRepository> paymentInstrumentsRepositoryProvider =
    Provider<PaymentInstrumentsRepository>(
  (Ref ref) => ApiPaymentInstrumentsRepository(ref.watch(financialGatewayProvider)),
);

final Provider<LoadAccountInstruments> loadAccountInstrumentsProvider =
    Provider<LoadAccountInstruments>(
  (Ref ref) => LoadAccountInstruments(ref.watch(paymentInstrumentsRepositoryProvider)),
);

/// The instruments that spend from one account.
final accountInstrumentsProvider =
    FutureProvider.family<List<PaymentInstrument>, String>(
  (Ref ref, String accountId) async {
    final result = await ref.watch(loadAccountInstrumentsProvider)(accountId);
    return switch (result) {
      Success<List<PaymentInstrument>>(:final value) => value,
      // An instrument listing that cannot be read is not a reason to hide the
      // account. The section renders its empty state, which says there is
      // nothing to show rather than claiming there is nothing there.
      Failed<List<PaymentInstrument>>() => const <PaymentInstrument>[],
    };
  },
);
