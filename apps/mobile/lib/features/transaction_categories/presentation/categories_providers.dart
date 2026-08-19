// Providers for the reviewed category catalogue.
//
// The catalogue is non-personal reference data, identical for every principal,
// so it is read once and searched locally rather than round-tripped per
// keystroke.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_transaction_categories_repository.dart';
import '../domain/transaction_categories_repository.dart';
import '../domain/transaction_category.dart';

final Provider<TransactionCategoriesRepository> transactionCategoriesRepositoryProvider =
    Provider<TransactionCategoriesRepository>(
  (Ref ref) => ApiTransactionCategoriesRepository(ref.watch(apiClientProvider)),
);

final Provider<LoadCategoryCatalogue> loadCategoryCatalogueProvider =
    Provider<LoadCategoryCatalogue>(
  (Ref ref) => LoadCategoryCatalogue(ref.watch(transactionCategoriesRepositoryProvider)),
);

/// The catalogue, or the typed failure that prevented it.
sealed class CategoryCatalogueView {
  const CategoryCatalogueView();
}

final class CategoryCatalogueLoaded extends CategoryCatalogueView {
  const CategoryCatalogueLoaded(this.catalogue);

  final CategoryCatalogue catalogue;
}

final class CategoryCatalogueUnavailable extends CategoryCatalogueView {
  const CategoryCatalogueUnavailable(this.failure);

  final Failure failure;
}

final AsyncNotifierProvider<CategoryCatalogueController, CategoryCatalogueView>
    categoryCatalogueProvider =
    AsyncNotifierProvider<CategoryCatalogueController, CategoryCatalogueView>(
  CategoryCatalogueController.new,
);

final class CategoryCatalogueController extends AsyncNotifier<CategoryCatalogueView> {
  @override
  Future<CategoryCatalogueView> build() async {
    final result = await ref.watch(loadCategoryCatalogueProvider)();
    return switch (result) {
      Success<CategoryCatalogue>(:final value) => CategoryCatalogueLoaded(value),
      Failed<CategoryCatalogue>(:final failure) => CategoryCatalogueUnavailable(failure),
    };
  }

  Future<void> refresh() async {
    state = const AsyncLoading<CategoryCatalogueView>();
    state = await AsyncValue.guard<CategoryCatalogueView>(build);
  }
}

/// The search text the picker is currently narrowed by.
final class CategorySearchController extends Notifier<String> {
  @override
  String build() => '';

  void search(String query) => state = query;
}

final NotifierProvider<CategorySearchController, String> categorySearchProvider =
    NotifierProvider<CategorySearchController, String>(CategorySearchController.new);
