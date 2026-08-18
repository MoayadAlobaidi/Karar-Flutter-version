// The repository implementation for jurisdiction self-declaration.
//
// It follows the mapping pattern in lib/README.md: call the generated client,
// convert `ApiException` to its typed failure, and convert `FormatException`
// and `TypeError` to a contract violation so a server that adds a union branch
// or changes a field type degrades this client instead of crashing it.
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../domain/jurisdiction_declaration.dart';

/// [JurisdictionRepository] over the generated client.
final class ApiJurisdictionRepository implements JurisdictionRepository {
  const ApiJurisdictionRepository(this._client);

  static const String _location = 'jurisdiction.selfDeclaration';

  final KararApiClient _client;

  @override
  Future<Result<JurisdictionDeclaration>> declareOwn(JurisdictionReference reference) async {
    try {
      final dto = await _client.declareOwnJurisdiction(
        body: DeclareOwnJurisdictionRequestDto(jurisdictionId: reference.id),
      );
      return Success<JurisdictionDeclaration>(_toDeclaration(dto));
    } on ApiException catch (exception) {
      return Failed<JurisdictionDeclaration>(exception.failure);
    } on FormatException {
      return const Failed<JurisdictionDeclaration>(
        ContractViolationFailure(location: _location),
      );
    } on TypeError {
      return const Failed<JurisdictionDeclaration>(
        ContractViolationFailure(location: _location),
      );
    }
  }

  static JurisdictionDeclaration _toDeclaration(DeclaredJurisdictionDto dto) =>
      JurisdictionDeclaration(
        jurisdictionId: dto.jurisdictionId,
        recorded: dto.recorded,
        source: switch (dto.source) {
          DeclaredJurisdictionSourceDto.userDeclared =>
            JurisdictionDeclarationSource.userDeclared,
          DeclaredJurisdictionSourceDto.unknown =>
            JurisdictionDeclarationSource.unrecognised,
        },
        verification: switch (dto.state) {
          DeclaredJurisdictionStateDto.unverified =>
            JurisdictionDeclarationVerification.unverified,
          DeclaredJurisdictionStateDto.unknown =>
            JurisdictionDeclarationVerification.unrecognised,
        },
        effectiveFrom: dto.effectiveFrom,
      );
}
