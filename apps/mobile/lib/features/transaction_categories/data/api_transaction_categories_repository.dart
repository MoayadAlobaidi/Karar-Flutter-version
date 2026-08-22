// The category-catalogue repository, over the GENERATED client.
//
// A catalogue code is a value, not a vocabulary: the contract declares it as a
// string with a pattern, so a code this build has never seen is still a code
// and is carried through untouched. Nothing here maps it onto a closed set,
// because there is no closed set to map it onto.
import '../../../core/errors/result.dart';
import '../../../core/networking/generated/karar_api_client.dart';
import '../../../core/networking/generated/models.dart';
import '../../financial_accounts/data/contract_mapping.dart';
import '../../financial_accounts/domain/page.dart';
import '../domain/transaction_categories_repository.dart';
import '../domain/transaction_category.dart';

/// [TransactionCategoriesRepository] over the generated client.
final class ApiTransactionCategoriesRepository
    implements TransactionCategoriesRepository {
  const ApiTransactionCategoriesRepository(this._client);

  final KararApiClient _client;

  @override
  Future<Result<Page<TransactionCategory>>> listCategories({
    int? limit,
    String? cursor,
    bool? assignableOnly,
  }) =>
      guarded<Page<TransactionCategory>>('financial.categories', () async {
        final response = await _client.listFinancialCategories(
          limit: limit,
          cursor: cursor,
          assignable: assignableOnly,
        );
        return pageFrom<TransactionCategory, CategoryViewDto>(
          response.items,
          response.page,
          categoryFromDto,
        );
      });
}

/// One catalogue entry.
TransactionCategory categoryFromDto(CategoryViewDto dto) => TransactionCategory(
      code: dto.code,
      parentCode: dto.parentCode,
      labelEn: dto.labels.en,
      labelAr: dto.labels.ar,
      catalogueVersion: dto.catalogueVersion,
      assignable: dto.assignable,
      retiredAt: dto.retiredAt,
    );
