// DATA LAYER. See
// `features/authentication/data/api_authentication_repository.dart` for the
// mapping contract this file follows.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/timeouts.dart';
import '../../../core/utilities/correlation_id.dart';
import '../../authentication/data/identity_payload.dart';
import '../domain/session_directory_repository.dart';
import '../domain/user_session.dart';

/// [SessionDirectoryRepository] over the generated client.
final class ApiSessionDirectoryRepository implements SessionDirectoryRepository {
  const ApiSessionDirectoryRepository({
    required KararApiClient client,
    required CorrelationIdGenerator idempotencyKeys,
  })  : _client = client,
        _idempotencyKeys = idempotencyKeys;

  final KararApiClient _client;
  final CorrelationIdGenerator _idempotencyKeys;

  @override
  Future<Result<SessionDirectory>> list() async {
    try {
      final JsonMap payload = await _client.identityListSessions(
        timeouts: TimeoutProfile.interactive,
      );
      final IdentityPayload reader =
          IdentityPayload(payload, location: 'auth.sessions');
      return Success<SessionDirectory>(
        SessionDirectory(
          List<UserSession>.unmodifiable(<UserSession>[
            for (final IdentityPayload item in reader.objectList('sessions'))
              UserSession(
                sessionId: item.string('sessionId'),
                createdAt: item.instant('createdAt'),
                isCurrent: item.boolean('current', fallback: false),
                lastSeenAt: item.optionalInstant('lastSeenAt'),
                absoluteExpiresAt: item.optionalInstant('absoluteExpiresAt'),
                // Absent rather than invented. The server minimises this at
                // the edge and may legitimately send nothing.
                userAgentSummary: item.optionalString('userAgentSummary'),
              ),
          ]),
        ),
      );
    } on ApiException catch (exception) {
      return Failed<SessionDirectory>(exception.failure);
    } on FormatException {
      return const Failed<SessionDirectory>(
        ContractViolationFailure(location: 'auth.sessions'),
      );
    } on TypeError {
      return const Failed<SessionDirectory>(
        ContractViolationFailure(location: 'auth.sessions'),
      );
    }
  }

  @override
  Future<Result<void>> revoke({required String sessionId}) async {
    try {
      await _client.identityRevokeSession(
        sessionId: sessionId,
        timeouts: TimeoutProfile.interactive,
      );
      return const Success<void>(null);
    } on ApiException catch (exception) {
      return Failed<void>(exception.failure);
    } on FormatException {
      return const Failed<void>(
        ContractViolationFailure(location: 'auth.sessions.revoke'),
      );
    } on TypeError {
      return const Failed<void>(
        ContractViolationFailure(location: 'auth.sessions.revoke'),
      );
    }
  }

  @override
  Future<Result<int>> revokeOthers() async {
    try {
      final JsonMap payload = await _client.identityRevokeOtherSessions(
        idempotencyKey: _idempotencyKeys.next(),
        timeouts: TimeoutProfile.interactive,
      );
      final IdentityPayload reader =
          IdentityPayload(payload, location: 'auth.sessions.revokeOthers');
      // The count is stated by the server. Absent means the server did not
      // say, and zero is the only honest stand-in — the confirmation then
      // reports what it knows rather than a number this client invented.
      return Success<int>(reader.integer('revokedCount', fallback: 0));
    } on ApiException catch (exception) {
      return Failed<int>(exception.failure);
    } on FormatException {
      return const Failed<int>(
        ContractViolationFailure(location: 'auth.sessions.revokeOthers'),
      );
    } on TypeError {
      return const Failed<int>(
        ContractViolationFailure(location: 'auth.sessions.revokeOthers'),
      );
    }
  }
}
