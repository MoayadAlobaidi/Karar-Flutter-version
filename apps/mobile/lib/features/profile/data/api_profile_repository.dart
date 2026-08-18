// The profile repository implementation.
//
// The mapping pattern is the one in lib/README.md. Nothing here logs a field
// value: a display name is personal data and a locale is close enough to a
// device fingerprint that neither belongs in a diagnostic sink.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../domain/user_profile.dart';

/// [ProfileRepository] over the generated client.
final class ApiProfileRepository implements ProfileRepository {
  const ApiProfileRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<UserProfile>> readOwn() async {
    try {
      return Success<UserProfile>(_toProfile(await _client.getOwnUserProfile()));
    } on ApiException catch (exception) {
      return Failed<UserProfile>(exception.failure);
    } on FormatException {
      return const Failed<UserProfile>(ContractViolationFailure(location: 'users.me'));
    } on TypeError {
      return const Failed<UserProfile>(ContractViolationFailure(location: 'users.me'));
    }
  }

  @override
  Future<Result<UserProfile>> updateOwn(ProfileChangeSet changes) async {
    if (changes.isEmpty) {
      // The platform refuses an empty change set. Declining locally spares the
      // subject a round trip that can only fail.
      return const Failed<UserProfile>(
        InvalidRequestFailure(code: 'NO_APPROVED_FIELD_CHANGES'),
      );
    }
    try {
      final dto = await _client.updateOwnUserProfile(
        body: UpdateOwnUserProfileRequestDto(
          displayName: changes.displayName,
          locale: changes.locale,
        ),
      );
      return Success<UserProfile>(_toProfile(dto));
    } on ApiException catch (exception) {
      return Failed<UserProfile>(exception.failure);
    } on FormatException {
      return const Failed<UserProfile>(ContractViolationFailure(location: 'users.me'));
    } on TypeError {
      return const Failed<UserProfile>(ContractViolationFailure(location: 'users.me'));
    }
  }

  @override
  Future<Result<AccountDisableRequest>> requestDisable({String? reason}) async {
    try {
      final dto = await _client.requestOwnAccountDisable(
        body: RequestOwnAccountDisableRequestDto(reason: reason),
      );
      if (dto.status != RequestOwnAccountDisableResponseStatusDto.disableRequested) {
        return const Failed<AccountDisableRequest>(
          ContractViolationFailure(location: 'users.me.disableRequest.status'),
        );
      }
      return Success<AccountDisableRequest>(
        AccountDisableRequest(
          requestedAt: dto.requestedAt,
          auditRecorded: dto.auditRecorded,
        ),
      );
    } on ApiException catch (exception) {
      return Failed<AccountDisableRequest>(exception.failure);
    } on FormatException {
      return const Failed<AccountDisableRequest>(
        ContractViolationFailure(location: 'users.me.disableRequest'),
      );
    } on TypeError {
      return const Failed<AccountDisableRequest>(
        ContractViolationFailure(location: 'users.me.disableRequest'),
      );
    }
  }

  static UserProfile _toProfile(UserProfileDto dto) => UserProfile(
        userId: dto.userId,
        tenantId: dto.tenantId,
        displayName: dto.displayName,
        locale: dto.locale,
        status: switch (dto.status) {
          UserProfileStatusDto.active => AccountStatus.active,
          UserProfileStatusDto.disableRequested => AccountStatus.disableRequested,
          UserProfileStatusDto.deletionRequested => AccountStatus.deletionRequested,
          UserProfileStatusDto.disabled => AccountStatus.disabled,
          UserProfileStatusDto.unknown => AccountStatus.unrecognised,
        },
        residencyJurisdictionRef: dto.residencyJurisdictionRef,
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
      );
}
