// Providers for tenant binding and switching.
//
// The controller is the one place a binding attempt is sequenced, and the
// order is the point:
//
//   1. the platform is asked, with an identifier IT supplied;
//   2. on a switch the data layer has already replaced the credential, so the
//      old access context is gone before this code runs again;
//   3. every tenant-scoped provider is DISCARDED — emptied of the previous
//      organisation's answer, and only then re-read;
//   4. the startup coordinator re-reads bootstrap, which is the only authority
//      on what the new session may see.
//
// STEP 3 USED TO BE `ref.invalidate` AND THE COMMENT HERE USED TO CLAIM THAT
// "no screen can render the previous organisation's answer under the new
// binding". That claim was false. Riverpod's invalidation is a RELOAD: it
// re-runs `build` and carries the previous value forward so a screen can show
// stale-while-revalidate data, so `AsyncValue.value` went on answering with
// organisation A's accounts for the whole post-switch reload and
// `AsyncValue.when` rendered them. `test/security/tenant_switch_isolation_test.dart`
// characterises the framework behaviour, and `app/lifecycle/tenant_data_scope.dart`
// holds the discard that does what this comment now describes.
//
// Step 3 is registered rather than hardcoded: features declare their own
// tenant-scoped providers at composition time, so this file never grows an
// import of a feature it does not own.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderOrFamily;

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_tenant_binding_repository.dart';
import '../data/api_tenant_invitation_repository.dart';
import '../domain/invitation_redemption.dart';
import '../domain/tenant_binding.dart';

final Provider<TenantBindingRepository> tenantBindingRepositoryProvider =
    Provider<TenantBindingRepository>(
  (Ref ref) => ApiTenantBindingRepository(
    client: ref.watch(apiClientProvider),
    sessions: ref.watch(sessionManagerProvider),
    logger: ref.watch(loggerProvider),
  ),
);

final Provider<TenantScopedState> tenantScopedStateProvider = Provider<TenantScopedState>(
  (Ref ref) => PreferenceTenantScopedState(ref.watch(keyValueStoreProvider)),
);

final Provider<BindTenant> bindTenantProvider =
    Provider<BindTenant>((Ref ref) => BindTenant(ref.watch(tenantBindingRepositoryProvider)));

final Provider<SwitchTenant> switchTenantProvider = Provider<SwitchTenant>(
  (Ref ref) => SwitchTenant(
    repository: ref.watch(tenantBindingRepositoryProvider),
    scopedState: ref.watch(tenantScopedStateProvider),
  ),
);

/// Providers whose value belongs to one organisation, as bare references.
///
/// DERIVED, not declared: the authority is [tenantScopedDataProvider], where
/// each entry also carries the operation that discards it. Two independently
/// maintained lists would be two chances to forget one, so this one is a view
/// of that one — everything registered is named here, and nothing can be named
/// here without saying how it is discarded.
final Provider<List<ProviderOrFamily>> tenantScopedProvidersProvider =
    Provider<List<ProviderOrFamily>>(
  (Ref ref) => <ProviderOrFamily>[
    for (final TenantScopedProvider entry in ref.watch(tenantScopedDataProvider))
      entry.provider,
  ],
);

/// The state of one binding attempt.
sealed class TenantBindingUiState {
  const TenantBindingUiState();
}

final class TenantBindingIdle extends TenantBindingUiState {
  const TenantBindingIdle();
}

final class TenantBindingSubmitting extends TenantBindingUiState {
  const TenantBindingSubmitting(this.tenantId);

  final String tenantId;
}

/// The platform confirmed the binding. Nothing reaches this state optimistically.
final class TenantBindingConfirmed extends TenantBindingUiState {
  const TenantBindingConfirmed(this.outcome);

  final TenantBindingOutcome outcome;
}

final class TenantBindingRejected extends TenantBindingUiState {
  const TenantBindingRejected(this.failure);

  final Failure failure;

  /// The membership was revoked while the switch was in flight. The session
  /// was ended by the data layer; the only way forward is to sign in again.
  bool get membershipChangedConcurrently =>
      failure.code == 'MEMBERSHIP_REVOKED_CONCURRENTLY';

  /// The platform refused the target: no active membership, an inactive
  /// tenant, or an identifier it does not accept. The three are deliberately
  /// indistinguishable, and this client does not try to tell them apart.
  bool get membershipRefused =>
      failure is NotAuthorizedFailure || failure is InvalidRequestFailure;
}

/// Sequences one binding or switch.
final class TenantBindingController extends Notifier<TenantBindingUiState> {
  @override
  TenantBindingUiState build() => const TenantBindingIdle();

  /// Binds an unbound session. No token rotates, so no credential changes here.
  Future<void> bind(TenantChoice choice) =>
      _run(choice, () => ref.read(bindTenantProvider)(choice));

  /// Switches a bound session. The replacement credential is adopted by the
  /// data layer before this returns.
  Future<void> switchTo(TenantChoice choice) =>
      _run(choice, () => ref.read(switchTenantProvider)(choice));

  Future<void> _run(
    TenantChoice choice,
    Future<Result<TenantBindingOutcome>> Function() operation,
  ) async {
    if (state is TenantBindingSubmitting) {
      return;
    }
    state = TenantBindingSubmitting(choice.tenantId);
    final result = await operation();

    switch (result) {
      case Failed<TenantBindingOutcome>(:final failure):
        // A refused binding leaves the previous state exactly as it was, so
        // nothing is invalidated and nothing is refreshed.
        state = TenantBindingRejected(failure);
      case Success<TenantBindingOutcome>(:final value):
        // EMPTIED, then re-read. `ref.invalidate` alone left organisation A's
        // accounts as the value every screen read until organisation B's
        // answer arrived; see `app/lifecycle/tenant_data_scope.dart`.
        //
        // THIS WRITE IS DELIBERATELY NOT GENERATION-GUARDED, unlike every
        // tenant-scoped controller. A switch ENDS the old session before it
        // adopts the replacement (`ApiTenantBindingRepository._adopt`), so the
        // session-end discard has already moved the generation on by the time a
        // successful switch returns: a guard here would refuse every switch
        // there is. Nothing leaks by writing it — this state is the record of
        // which binding was just established, not an answer read under one.
        discardTenantScopedData(ref, TenantDataDiscardReason.bindingChanged);
        state = TenantBindingConfirmed(value);
        // The coordinator is the only authority on what the new session may
        // see; it re-reads bootstrap and moves the router.
        await ref.read(startupCoordinatorProvider).onTenantSelected();
    }
  }
}

final NotifierProvider<TenantBindingController, TenantBindingUiState>
    tenantBindingControllerProvider =
    NotifierProvider<TenantBindingController, TenantBindingUiState>(
  TenantBindingController.new,
);

// ---------------------------------------------------------------------------
// Invitation redemption
// ---------------------------------------------------------------------------

final Provider<TenantInvitationRepository> tenantInvitationRepositoryProvider =
    Provider<TenantInvitationRepository>(
  (Ref ref) => ApiTenantInvitationRepository(ref.watch(apiClientProvider)),
);

final Provider<RedeemInvitation> redeemInvitationProvider = Provider<RedeemInvitation>(
  (Ref ref) => RedeemInvitation(ref.watch(tenantInvitationRepositoryProvider)),
);

/// The state of one redemption attempt.
sealed class InvitationRedemptionUiState {
  const InvitationRedemptionUiState();
}

final class InvitationRedemptionIdle extends InvitationRedemptionUiState {
  const InvitationRedemptionIdle();
}

final class InvitationRedemptionSubmitting extends InvitationRedemptionUiState {
  const InvitationRedemptionSubmitting();
}

final class InvitationRedemptionAccepted extends InvitationRedemptionUiState {
  const InvitationRedemptionAccepted();
}

final class InvitationRedemptionRejected extends InvitationRedemptionUiState {
  const InvitationRedemptionRejected(this.failure);

  final Failure failure;
}

/// Sequences one redemption.
///
/// The token is passed straight through and is never stored on this object,
/// so a state dump cannot carry it.
final class InvitationRedemptionController extends Notifier<InvitationRedemptionUiState> {
  @override
  InvitationRedemptionUiState build() => const InvitationRedemptionIdle();

  Future<void> redeem(InvitationToken token) async {
    if (state is InvitationRedemptionSubmitting) {
      return;
    }
    // A redemption rotates no credential, so unlike a switch the generation
    // only moves here if the session ENDED while the request was in flight.
    // Without the check below, a membership accepted under a session that has
    // gone is reported as this session's and sends the coordinator to re-read
    // bootstrap with no credential to read it under.
    final TenantDataGeneration issued = ref.tenantBinding();
    state = const InvitationRedemptionSubmitting();
    final result = await ref.read(redeemInvitationProvider)(token);
    if (issued.hasEnded) {
      return;
    }
    switch (result) {
      case Failed<RedeemedMembership>(:final failure):
        state = InvitationRedemptionRejected(failure);
      case Success<RedeemedMembership>():
        state = const InvitationRedemptionAccepted();
        // A new membership changes the binding answer, so bootstrap is the
        // only thing that can say what happens next.
        await ref.read(startupCoordinatorProvider).onTenantSelected();
    }
  }
}

final NotifierProvider<InvitationRedemptionController, InvitationRedemptionUiState>
    invitationRedemptionControllerProvider =
    NotifierProvider<InvitationRedemptionController, InvitationRedemptionUiState>(
  InvitationRedemptionController.new,
);
