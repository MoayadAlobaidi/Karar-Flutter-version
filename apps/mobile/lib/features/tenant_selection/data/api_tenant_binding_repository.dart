// The repository implementation for `POST /platform/tenant-binding`.
//
// The switch branch is the delicate one. The server has already revoked the
// calling session and its refresh families by the time it answers, so the
// credential this process holds is dead. The order below is chosen so that no
// window exists in which a dead credential is still the stored one:
//
//   1. decode the response, which is where a contract change would surface;
//   2. END the current session, which wipes the dead credential from memory
//      and from secure storage;
//   3. ADOPT the replacement, which writes it to secure storage.
//
// A failure at step 3 leaves no credential at all, which is the safe side of
// the trade: the principal signs in again rather than continuing under a token
// the server no longer honours.
//
// A concurrent membership revocation answers 409 MEMBERSHIP_REVOKED_CONCURRENTLY.
// The replacement session is revoked server-side too, so the local session is
// ended here as well: a session is never left bound without a membership.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/logging/app_logger.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../../core/networking/problem_details.dart';
import '../../../core/security/session_manager.dart';
import '../../../core/security/session_tokens.dart';
import '../../../core/storage/key_value_store.dart';
import '../domain/tenant_binding.dart';

/// [TenantBindingRepository] over the generated client.
final class ApiTenantBindingRepository implements TenantBindingRepository {
  ApiTenantBindingRepository({
    required KararApiClient client,
    required SessionManager sessions,
    required AppLogger logger,
  })  : _client = client,
        _sessions = sessions,
        _logger = logger.forCategory('tenancy');

  static const String _location = 'platform.tenantBinding';

  final KararApiClient _client;
  final SessionManager _sessions;
  final CategoryLogger _logger;

  @override
  Future<Result<TenantBindingOutcome>> bind(String tenantId) async {
    final SetPlatformTenantBindingResponseDto response;
    try {
      response = await _client.setPlatformTenantBinding(
        body: SetPlatformTenantBindingRequestDto(tenantId: tenantId),
      );
    } on ApiException catch (exception) {
      await _endSessionIfMembershipRevoked(exception.failure);
      return Failed<TenantBindingOutcome>(exception.failure);
    } on FormatException {
      return const Failed<TenantBindingOutcome>(
        ContractViolationFailure(location: _location),
      );
    } on TypeError {
      return const Failed<TenantBindingOutcome>(
        ContractViolationFailure(location: _location),
      );
    }

    switch (response) {
      case SetPlatformTenantBindingResponseBoundDto(:final binding):
        final choice = _boundTenantOf(binding);
        if (choice == null) {
          // The server said BOUND without naming the tenant. Refusing is safer
          // than rendering a binding whose subject is unknown.
          return const Failed<TenantBindingOutcome>(
            ContractViolationFailure(location: '$_location.binding'),
          );
        }
        return Success<TenantBindingOutcome>(TenantBound(choice));

      case SetPlatformTenantBindingResponseSwitchedDto(:final binding, :final tokens):
        final choice = _boundTenantOf(binding);
        if (choice == null) {
          // The old credential is already dead server-side, so the session
          // cannot be left as it is even though the response was unusable.
          await _sessions.end(SessionEndReason.revoked);
          return const Failed<TenantBindingOutcome>(
            ContractViolationFailure(location: '$_location.binding'),
          );
        }
        final adopted = await _adopt(tokens);
        if (adopted is Failed<void>) {
          return Failed<TenantBindingOutcome>(adopted.failure);
        }
        return Success<TenantBindingOutcome>(
          TenantSwitched(tenant: choice, sessionId: tokens.sessionId),
        );
    }
  }

  /// Replaces the stored credential with the one the switch issued.
  Future<Result<void>> _adopt(SetPlatformTenantBindingResponseSwitchedTokensDto tokens) async {
    await _sessions.end(SessionEndReason.revoked);
    final stored = await _sessions.adopt(
      SessionTokens(
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshToken: tokens.refreshToken,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        sessionId: tokens.sessionId,
      ),
    );
    if (stored is Failed<void>) {
      // The credential exists in memory but not on disk. Say so without
      // naming it; the session survives this launch only.
      _logger.warning(
        'The replacement session could not be persisted after a tenant switch.',
        fields: <String, Object?>{'sessionId': tokens.sessionId},
      );
    }
    return const Success<void>(null);
  }

  Future<void> _endSessionIfMembershipRevoked(Failure failure) async {
    if (failure.code == ApiErrorCode.membershipRevokedConcurrently) {
      _logger.warning(
        'The target membership was revoked during the switch; ending the session.',
      );
      await _sessions.end(SessionEndReason.revoked);
    }
  }

  static TenantChoice? _boundTenantOf(BindingStateDto binding) => switch (binding) {
        BindingStateBoundDto(:final tenant) => TenantChoice(
            tenantId: tenant.tenantId,
            name: tenant.name,
            roleHint: tenant.roleHint,
          ),
        BindingStateUnboundDto() => null,
        BindingStateTenantSelectionRequiredDto() => null,
      };
}

/// Preference keys that belong to one tenant.
///
/// Empty today: this build stores no tenant-scoped preference. A feature that
/// adds one registers it here, or it will survive a switch and be read under
/// the wrong tenant.
const List<String> tenantScopedPreferenceKeyNames = <String>[];

/// [TenantScopedState] over non-sensitive preference storage.
final class PreferenceTenantScopedState implements TenantScopedState {
  const PreferenceTenantScopedState(this._store);

  final KeyValueStore _store;

  @override
  Future<void> discard() async {
    for (final name in tenantScopedPreferenceKeyNames) {
      await _store.remove(PreferenceKey(name));
    }
  }
}
