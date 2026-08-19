// The category-catalogue repository.
import '../../../core/errors/result.dart';
import '../../../core/networking/api_transport.dart';
import '../../financial_accounts/data/financial_gateway.dart';
import '../../financial_accounts/data/financial_wire.dart';
import '../../financial_accounts/domain/page.dart';
import '../domain/transaction_categories_repository.dart';
import '../domain/transaction_category.dart';

/// [TransactionCategoriesRepository] over the shared transport.
final class ApiTransactionCategoriesRepository
    implements TransactionCategoriesRepository {
  const ApiTransactionCategoriesRepository(this._gateway);

  final FinancialGateway _gateway;

  @override
  Future<Result<Page<TransactionCategory>>> listCategories({
    int? limit,
    String? cursor,
    bool? assignableOnly,
  }) =>
      guarded<Page<TransactionCategory>>(
        'financial.categories',
        () async => decodePage<TransactionCategory>(
          await _gateway.get(
            FinancialPaths.categories,
            query: <String, Object?>{
              'limit': limit,
              'cursor': cursor,
              'assignable': assignableOnly,
            },
            location: 'financial.categories',
          ),
          'financial.categories',
          decodeCategory,
        ),
      );
}

/// One catalogue entry.
TransactionCategory decodeCategory(JsonMap json) {
  const at = 'CategoryView';
  final labels = json.object('labels', at);
  return TransactionCategory(
    code: json.string('code', at),
    parentCode: json.stringOrNull('parentCode', at),
    labelEn: labels.string('en', '$at.labels'),
    labelAr: labels.string('ar', '$at.labels'),
    catalogueVersion: json.string('catalogueVersion', at),
    assignable: json.boolean('assignable', at),
    retiredAt: json.instantOrNull('retiredAt', at),
  );
}
