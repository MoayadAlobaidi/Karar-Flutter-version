// Providers for the instruments nested under one account.
//
// The family key is the ACCOUNT id, not the instrument id: there is no listing
// of instruments across accounts, because an instrument is only meaningful
// under the account it spends from.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show AsyncNotifierProviderFamily;

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../core/errors/result.dart';
import '../data/api_payment_instruments_repository.dart';
import '../domain/payment_instrument.dart';
import '../domain/payment_instruments_repository.dart';

final Provider<PaymentInstrumentsRepository> paymentInstrumentsRepositoryProvider =
    Provider<PaymentInstrumentsRepository>(
  (Ref ref) => ApiPaymentInstrumentsRepository(ref.watch(apiClientProvider)),
);

final Provider<LoadAccountInstruments> loadAccountInstrumentsProvider =
    Provider<LoadAccountInstruments>(
  (Ref ref) => LoadAccountInstruments(ref.watch(paymentInstrumentsRepositoryProvider)),
);

/// The instruments that spend from one account.
///
/// A [TenantScopedAsyncNotifier] rather than a `FutureProvider` because a
/// `FutureProvider` cannot be emptied: `ref.invalidate` reloads and keeps the
/// previous value readable, so a card belonging to the organisation the person
/// just left would stay on screen for the whole post-switch reload. See
/// `app/lifecycle/tenant_data_scope.dart`.
final class AccountInstrumentsController
    extends TenantScopedAsyncNotifier<List<PaymentInstrument>> {
  AccountInstrumentsController(this.accountId);

  final String accountId;

  @override
  List<PaymentInstrument> get discarded => const <PaymentInstrument>[];

  @override
  Future<List<PaymentInstrument>> load() async {
    final result = await ref.watch(loadAccountInstrumentsProvider)(accountId);
    return switch (result) {
      Success<List<PaymentInstrument>>(:final value) => value,
      // An instrument listing that cannot be read is not a reason to hide the
      // account. The section renders its empty state, which says there is
      // nothing to show rather than claiming there is nothing there.
      Failed<List<PaymentInstrument>>() => const <PaymentInstrument>[],
    };
  }
}

final AsyncNotifierProviderFamily<AccountInstrumentsController,
        List<PaymentInstrument>, String> accountInstrumentsProvider =
    AsyncNotifierProvider.family<AccountInstrumentsController,
        List<PaymentInstrument>, String>(
  AccountInstrumentsController.new,
);
