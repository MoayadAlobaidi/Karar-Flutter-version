// DATA LAYER — the DTO/payload boundary. Follows the worked example in
// `lib/app/lifecycle/api_bootstrap_gateway.dart`:
//
//   1. call the generated client;
//   2. catch `ApiException` and return `Failed(exception.failure)`;
//   3. ALSO catch `FormatException` and `TypeError`, so a payload the decoder
//      cannot classify becomes a typed contract violation instead of a crash;
//   4. map to a type this layer owns;
//   5. return `Success`.
//
// TOKENS STOP HERE. The session credential goes to `SessionAdoption`, which is
// the only path to platform secure storage, and the multi-factor challenge
// token to the in-memory challenge store. Neither value is returned to a
// caller, and neither is logged.
//
// IDEMPOTENCY KEYS on the authenticated, non-idempotent operations are not
// belt-and-braces: without one, a token refresh completing while such a
// request is in flight makes the request unreplayable
// (`UnsafeRequestNotReplayedFailure`) and the user sees a spurious error. With
// one, the transport replays it and the server deduplicates.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../../core/networking/timeouts.dart';
import '../../../core/networking/token_refresh_coordinator.dart';
import '../../../core/security/session_manager.dart';
import '../../../core/security/session_tokens.dart';
import '../../../core/utilities/correlation_id.dart';
import '../domain/entities/authentication_outcome.dart';
import '../domain/entities/neutral_receipt.dart';
import '../domain/repositories/authentication_repository.dart';
import '../domain/value_objects/email_address.dart';
import '../domain/value_objects/password.dart';
import 'identity_payload.dart';
import 'session_adoption.dart';

/// [AuthenticationRepository] over the generated client.
final class ApiAuthenticationRepository implements AuthenticationRepository {
  const ApiAuthenticationRepository({
    required KararApiClient client,
    required SessionManager sessions,
    required SessionAdoption adoption,
    required TokenRefreshCoordinator refreshCoordinator,
    required CorrelationIdGenerator idempotencyKeys,
  })  : _client = client,
        _sessions = sessions,
        _adoption = adoption,
        _refreshCoordinator = refreshCoordinator,
        _idempotencyKeys = idempotencyKeys;

  final KararApiClient _client;
  final SessionManager _sessions;
  final SessionAdoption _adoption;
  final TokenRefreshCoordinator _refreshCoordinator;
  final CorrelationIdGenerator _idempotencyKeys;

  @override
  Future<Result<NeutralReceipt>> register({
    required EmailAddress email,
    required Password password,
  }) async {
    try {
      // The response body is READ BY NOBODY, deliberately. The platform
      // returns the same 202 whether the address was new or already
      // registered; rendering anything it sent would hand that difference
      // back to an attacker.
      await _client.identityRegister(
        body: IdentityRegisterRequestDto(email: email.value, password: password.value),
        timeouts: TimeoutProfile.interactive,
      );
      return const Success<NeutralReceipt>(NeutralReceipt());
    } on ApiException catch (exception) {
      return Failed<NeutralReceipt>(exception.failure);
    } on FormatException {
      return const Failed<NeutralReceipt>(
        ContractViolationFailure(location: 'auth.register'),
      );
    } on TypeError {
      return const Failed<NeutralReceipt>(
        ContractViolationFailure(location: 'auth.register'),
      );
    }
  }

  @override
  Future<Result<AuthenticationOutcome>> signIn({
    required EmailAddress email,
    required Password password,
  }) async {
    try {
      // `IdentityLoginResponseDto` is a sealed union over the authenticated and
      // mfa_required branches, and the discriminator it switches on is the same
      // `status` field `_adoption.isMfaChallenge` reads. Re-encoding keeps ONE
      // classifier for the two outcomes: `SessionAdoption` owns the decision,
      // the challenge retention and the credential commit, and a second switch
      // here would be a second place for the two to disagree.
      final JsonMap payload = (await _client.identityLogin(
        body: IdentityLoginRequestDto(email: email.value, password: password.value),
        timeouts: TimeoutProfile.interactive,
      ))
          .toJson();
      if (_adoption.isMfaChallenge(payload)) {
        final IdentityPayload reader =
            IdentityPayload(payload, location: 'auth.login');
        final DateTime expiresAt = _adoption.retainChallenge(
          token: reader.string('challengeToken'),
          expiresAt: reader.instant('challengeExpiresAt'),
        );
        return Success<AuthenticationOutcome>(
          MfaChallengeIssued(expiresAt: expiresAt),
        );
      }
      final Result<SessionEstablished> established =
          await _adoption.adopt(payload, location: 'auth.login');
      return established.map<AuthenticationOutcome>(
        (SessionEstablished value) => value,
      );
    } on ApiException catch (exception) {
      return Failed<AuthenticationOutcome>(exception.failure);
    } on FormatException {
      return const Failed<AuthenticationOutcome>(
        ContractViolationFailure(location: 'auth.login'),
      );
    } on TypeError {
      return const Failed<AuthenticationOutcome>(
        ContractViolationFailure(location: 'auth.login'),
      );
    }
  }

  @override
  Future<Result<void>> signOut() async {
    Failure? serverFailure;
    try {
      await _client.identityLogout(
        idempotencyKey: _idempotencyKeys.next(),
        timeouts: TimeoutProfile.interactive,
      );
    } on ApiException catch (exception) {
      serverFailure = exception.failure;
    } on FormatException {
      serverFailure = const ContractViolationFailure(location: 'auth.logout');
    } on TypeError {
      serverFailure = const ContractViolationFailure(location: 'auth.logout');
    }

    // The local wipe runs whatever the server said. A credential the user
    // asked to be rid of must stop being usable from this device even when
    // the revoke could not be delivered.
    await _adoption.clearLocalCredentials(SessionEndReason.signedOut);

    if (serverFailure == null) {
      return const Success<void>(null);
    }
    // Reported rather than swallowed: the session may still be live
    // server-side and the user can revoke it from another device. The caller
    // signs the user out locally regardless.
    return Failed<void>(serverFailure);
  }

  @override
  Future<Result<void>> changePassword({
    required OpaqueSecret currentPassword,
    required Password newPassword,
  }) async {
    try {
      await _client.identityChangePassword(
        body: IdentityChangePasswordRequestDto(
          currentPassword: currentPassword.value,
          newPassword: newPassword.value,
        ),
        idempotencyKey: _idempotencyKeys.next(),
        timeouts: TimeoutProfile.interactive,
      );
    } on ApiException catch (exception) {
      return Failed<void>(exception.failure);
    } on FormatException {
      return const Failed<void>(ContractViolationFailure(location: 'auth.changePassword'));
    } on TypeError {
      return const Failed<void>(ContractViolationFailure(location: 'auth.changePassword'));
    }

    // The server bumped the token version, so the access token this client
    // holds is stale even though its refresh chain is still valid. Rotate now
    // rather than letting the next request discover it as a 401.
    // `refreshAfterRejection` is single-flight: when a refresh is already
    // running this joins it instead of starting a second one.
    final SessionTokens? current = _sessions.tokens;
    if (current == null) {
      return const Success<void>(null);
    }
    final Result<SessionTokens> rotated =
        await _refreshCoordinator.refreshAfterRejection(current);
    return switch (rotated) {
      // The password DID change; the refresh chain did not survive. The
      // session is over and the coordinator has already ended it. Reported
      // rather than dressed up as a plain success.
      Failed<SessionTokens>(:final failure) => Failed<void>(failure),
      Success<SessionTokens>() => const Success<void>(null),
    };
  }
}
