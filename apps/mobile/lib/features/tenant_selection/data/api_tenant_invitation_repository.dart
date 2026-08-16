// The invitation-redemption repository implementation.
//
// It logs nothing. The token is a bearer credential and the redemption's
// outcome names a tenant the principal has only just joined; neither belongs
// in a diagnostic sink.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../domain/invitation_redemption.dart';

/// [TenantInvitationRepository] over the generated client.
final class ApiTenantInvitationRepository implements TenantInvitationRepository {
  const ApiTenantInvitationRepository(this._client);

  static const String _location = 'tenancy.invitations.redeem';

  final KararApiClient _client;

  @override
  Future<Result<RedeemedMembership>> redeem(InvitationToken token) async {
    try {
      final dto = await _client.redeemTenantInvitation(
        body: RedeemTenantInvitationRequestDto(token: token.value),
      );
      return Success<RedeemedMembership>(
        RedeemedMembership(tenantId: dto.tenantId, membershipId: dto.membership.id),
      );
    } on ApiException catch (exception) {
      return Failed<RedeemedMembership>(exception.failure);
    } on FormatException {
      return const Failed<RedeemedMembership>(
        ContractViolationFailure(location: _location),
      );
    } on TypeError {
      return const Failed<RedeemedMembership>(
        ContractViolationFailure(location: _location),
      );
    }
  }
}
