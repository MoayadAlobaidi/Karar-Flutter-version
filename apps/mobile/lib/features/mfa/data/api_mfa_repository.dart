// DATA LAYER. See
// `features/authentication/data/api_authentication_repository.dart` for the
// mapping contract this file follows.
//
// The challenge token is read from the in-memory store and sent; it is never
// returned to a caller, never persisted and never logged. The enrolment secret
// and the recovery codes are returned exactly once by the server, are mapped
// straight into domain types that redact themselves, and are not written
// anywhere by this layer.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../../core/networking/timeouts.dart';
import '../../../core/utilities/correlation_id.dart';
import '../../authentication/data/identity_payload.dart';
import '../../authentication/data/pending_mfa_challenge_store.dart';
import '../../authentication/data/session_adoption.dart';
import '../../authentication/domain/entities/authentication_outcome.dart';
import '../../authentication/domain/value_objects/password.dart';
import '../domain/mfa_entities.dart';
import '../domain/mfa_repository.dart';

/// [MfaRepository] over the generated client.
final class ApiMfaRepository implements MfaRepository {
  const ApiMfaRepository({
    required KararApiClient client,
    required PendingMfaChallengeStore challenges,
    required SessionAdoption adoption,
    required CorrelationIdGenerator idempotencyKeys,
  })  : _client = client,
        _challenges = challenges,
        _adoption = adoption,
        _idempotencyKeys = idempotencyKeys;

  final KararApiClient _client;
  final PendingMfaChallengeStore _challenges;
  final SessionAdoption _adoption;
  final CorrelationIdGenerator _idempotencyKeys;

  @override
  MfaChallengeStatus challengeStatus() => _challenges.status;

  @override
  void discardChallenge() => _challenges.discard();

  @override
  Future<Result<MfaEnrolment>> startEnrolment() async {
    try {
      final JsonMap payload = (await _client.identityMfaEnroll(
        idempotencyKey: _idempotencyKeys.next(),
        timeouts: TimeoutProfile.interactive,
      ))
          .toJson();
      final IdentityPayload reader =
          IdentityPayload(payload, location: 'auth.mfa.enroll');
      return Success<MfaEnrolment>(
        MfaEnrolment(
          sharedSecret: reader.string('secret'),
          otpauthUrl: reader.string('otpauthUrl'),
        ),
      );
    } on ApiException catch (exception) {
      return Failed<MfaEnrolment>(exception.failure);
    } on FormatException {
      return const Failed<MfaEnrolment>(
        ContractViolationFailure(location: 'auth.mfa.enroll'),
      );
    } on TypeError {
      return const Failed<MfaEnrolment>(
        ContractViolationFailure(location: 'auth.mfa.enroll'),
      );
    }
  }

  @override
  Future<Result<MfaRecoveryCodes>> confirmEnrolment({
    required OpaqueSecret code,
  }) async {
    try {
      final JsonMap payload = (await _client.identityMfaConfirm(
        body: IdentityMfaConfirmRequestDto(code: code.trimmed),
        idempotencyKey: _idempotencyKeys.next(),
        timeouts: TimeoutProfile.interactive,
      ))
          .toJson();
      final IdentityPayload reader =
          IdentityPayload(payload, location: 'auth.mfa.confirm');
      final List<String> codes = reader.stringList('recoveryCodes');
      if (codes.isEmpty) {
        // Confirmation without codes would leave the user with a second
        // factor and no way back into the account. Fail closed rather than
        // render an empty list as though it were the answer.
        return const Failed<MfaRecoveryCodes>(
          ContractViolationFailure(location: 'auth.mfa.confirm.recoveryCodes'),
        );
      }
      return Success<MfaRecoveryCodes>(
        MfaRecoveryCodes(List<String>.unmodifiable(codes)),
      );
    } on ApiException catch (exception) {
      return Failed<MfaRecoveryCodes>(exception.failure);
    } on FormatException {
      return const Failed<MfaRecoveryCodes>(
        ContractViolationFailure(location: 'auth.mfa.confirm'),
      );
    } on TypeError {
      return const Failed<MfaRecoveryCodes>(
        ContractViolationFailure(location: 'auth.mfa.confirm'),
      );
    }
  }

  @override
  Future<Result<SessionEstablished>> completeChallengeWithTotp({
    required OpaqueSecret code,
  }) async {
    final String? challengeToken = _challenges.token;
    if (challengeToken == null) {
      // The challenge is gone — expired, redeemed, or dropped by a relaunch.
      // There is nothing to complete and the user signs in again.
      return const Failed<SessionEstablished>(AuthenticationRequiredFailure());
    }
    try {
      final JsonMap payload = (await _client.identityMfaChallenge(
        body: IdentityMfaChallengeRequestDto(
          challengeToken: challengeToken,
          code: code.trimmed,
        ),
        timeouts: TimeoutProfile.interactive,
      ))
          .toJson();
      return await _adoption.adopt(payload, location: 'auth.mfa.challenge');
    } on ApiException catch (exception) {
      return Failed<SessionEstablished>(exception.failure);
    } on FormatException {
      return const Failed<SessionEstablished>(
        ContractViolationFailure(location: 'auth.mfa.challenge'),
      );
    } on TypeError {
      return const Failed<SessionEstablished>(
        ContractViolationFailure(location: 'auth.mfa.challenge'),
      );
    }
  }

  @override
  Future<Result<SessionEstablished>> completeChallengeWithRecoveryCode({
    required OpaqueSecret recoveryCode,
  }) async {
    final String? challengeToken = _challenges.token;
    if (challengeToken == null) {
      return const Failed<SessionEstablished>(AuthenticationRequiredFailure());
    }
    try {
      final JsonMap payload = (await _client.identityMfaRecovery(
        body: IdentityMfaRecoveryRequestDto(
          challengeToken: challengeToken,
          recoveryCode: recoveryCode.trimmed,
        ),
        timeouts: TimeoutProfile.interactive,
      ))
          .toJson();
      return await _adoption.adopt(payload, location: 'auth.mfa.recovery');
    } on ApiException catch (exception) {
      return Failed<SessionEstablished>(exception.failure);
    } on FormatException {
      return const Failed<SessionEstablished>(
        ContractViolationFailure(location: 'auth.mfa.recovery'),
      );
    } on TypeError {
      return const Failed<SessionEstablished>(
        ContractViolationFailure(location: 'auth.mfa.recovery'),
      );
    }
  }

  @override
  Future<Result<void>> disable({required OpaqueSecret code}) async {
    try {
      await _client.identityMfaDisable(
        body: IdentityMfaDisableRequestDto(code: code.trimmed),
        idempotencyKey: _idempotencyKeys.next(),
        timeouts: TimeoutProfile.interactive,
      );
      return const Success<void>(null);
    } on ApiException catch (exception) {
      return Failed<void>(exception.failure);
    } on FormatException {
      return const Failed<void>(ContractViolationFailure(location: 'auth.mfa.disable'));
    } on TypeError {
      return const Failed<void>(ContractViolationFailure(location: 'auth.mfa.disable'));
    }
  }
}
