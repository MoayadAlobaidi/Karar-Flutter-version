// PURE DART ONLY. See lib/README.md — domain purity.
//
// The catalogue port. Read-only, because the catalogue is read-only: it
// changes by reviewed migration and the contract exposes no write path.
import '../../../core/errors/result.dart';
import '../../financial_accounts/domain/page.dart';
import 'transaction_category.dart';

/// The reviewed category catalogue.
abstract interface class TransactionCategoriesRepository {
  Future<Result<Page<TransactionCategory>>> listCategories({
    int? limit,
    String? cursor,
    bool? assignableOnly,
  });
}

/// Reads the whole catalogue, following pagination to the end.
///
/// A partial catalogue is worse than none: a person searching for a category
/// that exists on page two would be told it does not exist.
final class LoadCategoryCatalogue {
  const LoadCategoryCatalogue(
    this._repository, {
    this.pageLimit = 200,
    this.maximumPages = 20,
  });

  final TransactionCategoriesRepository _repository;
  final int pageLimit;
  final int maximumPages;

  Future<Result<CategoryCatalogue>> call() async {
    final collected = <TransactionCategory>[];
    String? cursor;
    for (var page = 0; page < maximumPages; page++) {
      final result =
          await _repository.listCategories(limit: pageLimit, cursor: cursor);
      switch (result) {
        case Failed<Page<TransactionCategory>>(:final failure):
          return Failed<CategoryCatalogue>(failure);
        case Success<Page<TransactionCategory>>(:final value):
          collected.addAll(value.items);
          if (!value.cursor.hasMore || value.cursor.nextCursor == null) {
            return Success<CategoryCatalogue>(
              CategoryCatalogue(List<TransactionCategory>.unmodifiable(collected)),
            );
          }
          cursor = value.cursor.nextCursor;
      }
    }
    return Success<CategoryCatalogue>(
      CategoryCatalogue(List<TransactionCategory>.unmodifiable(collected)),
    );
  }
}
