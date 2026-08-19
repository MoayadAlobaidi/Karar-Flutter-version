// CHOOSING A CATEGORY.
//
// The list is the reviewed catalogue and nothing else. There is no free-text
// category, because a subject's own label never becomes a catalogue row; there
// is no suggestion and no confidence, because this platform has neither and a
// client that invented one would be presenting a guess as a fact.
//
// A RETIRED entry is not offered. It is still resolvable elsewhere so an
// existing assignment stays readable, but `assignable` — which the platform
// states — is what decides whether it may be chosen now.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../../transactions/presentation/transactions_providers.dart';
import '../domain/transaction_category.dart';
import 'categories_providers.dart';

/// The category catalogue, for one transaction.
final class CategoryPickerScreen extends ConsumerStatefulWidget {
  const CategoryPickerScreen({required this.transactionId, super.key});

  final String transactionId;

  @override
  ConsumerState<CategoryPickerScreen> createState() => _CategoryPickerScreenState();
}

class _CategoryPickerScreenState extends ConsumerState<CategoryPickerScreen> {
  final TextEditingController _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final catalogue = ref.watch(categoryCatalogueProvider);
    final query = ref.watch(categorySearchProvider);
    final write = ref.watch(transactionWriteControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.categoryPickerTitle,
        onBack: () => context.go(
          FinancialRoutes.transactionDetailPath(widget.transactionId),
        ),
      ),
      body: SafeArea(
        top: false,
        child: catalogue.when(
          loading: () => KararLoadingView(subject: l10n.categoryPickerTitle),
          error: (Object error, StackTrace _) => _Unavailable(l10n: l10n),
          data: (CategoryCatalogueView view) => switch (view) {
            CategoryCatalogueUnavailable() => _Unavailable(l10n: l10n),
            CategoryCatalogueLoaded(:final catalogue) => _Catalogue(
                catalogue: catalogue,
                query: query,
                search: _search,
                write: write,
                l10n: l10n,
                transactionId: widget.transactionId,
              ),
          },
        ),
      ),
    );
  }
}

final class _Unavailable extends ConsumerWidget {
  const _Unavailable({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Center(
        child: SingleChildScrollView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          child: KararStateView.error(
            title: l10n.categoriesUnavailableTitle,
            message: l10n.categoriesUnavailableDescription,
            actionLabel: l10n.actionRetry,
            onAction: () => unawaited(
              ref.read(categoryCatalogueProvider.notifier).refresh(),
            ),
          ),
        ),
      );
}

final class _Catalogue extends ConsumerWidget {
  const _Catalogue({
    required this.catalogue,
    required this.query,
    required this.search,
    required this.write,
    required this.l10n,
    required this.transactionId,
  });

  final CategoryCatalogue catalogue;
  final String query;
  final TextEditingController search;
  final TransactionWriteState write;
  final AppLocalizations l10n;
  final String transactionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = catalogue.search(query);

    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        _Outcome(state: write, l10n: l10n),
        KararTextField(
          label: l10n.categorySearchLabel,
          controller: search,
          prefixIcon: KararIcons.search,
          showClearAction: true,
          onChanged: (String value) =>
              ref.read(categorySearchProvider.notifier).search(value),
        ),
        SizedBox(height: context.spacing.md),
        if (matches.isEmpty)
          KararStateView.empty(
            title: l10n.categoriesEmptyTitle,
            message: l10n.categoriesEmptyDescription,
          )
        else
          for (final entry in matches)
            Padding(
              padding: EdgeInsetsDirectional.only(bottom: context.spacing.xs),
              child: Padding(
                // Indented by depth so the catalogue's own hierarchy is
                // visible. Directional, so it indents from the right in
                // Arabic.
                padding: EdgeInsetsDirectional.only(
                  start: context.spacing.md * entry.depth,
                ),
                child: KararListRow(
                  title: categoryLabel(entry, l10n),
                  subtitle: entry.code,
                  onPressed: () => unawaited(
                    ref
                        .read(transactionWriteControllerProvider.notifier)
                        .assignCategory(transactionId, entry.code),
                  ),
                ),
              ),
            ),
        SizedBox(height: context.spacing.md),
        if (catalogue.entries.isNotEmpty)
          LabelledValue(
            label: l10n.categoryCatalogueVersionLabel,
            value: catalogue.entries.first.catalogueVersion,
          ),
      ],
    );
  }
}

/// The catalogue's own label for the reading language.
///
/// The catalogue ships both languages as reference data, so this picks one
/// rather than translating anything.
String categoryLabel(TransactionCategory category, AppLocalizations l10n) =>
    l10n.localeName == 'ar' ? category.labelAr : category.labelEn;

final class _Outcome extends StatelessWidget {
  const _Outcome({required this.state, required this.l10n});

  final TransactionWriteState state;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final Widget? banner = switch (state) {
      TransactionWriteIdle() ||
      TransactionWriteSubmitting() ||
      TransactionWriteSaved() ||
      TransactionDeleteSettled() =>
        null,
      TransactionCategorySaved() =>
        KararBanner(message: l10n.categoryAssigned, tone: KararStatusTone.success),
      TransactionWriteRejected(
        :final isUserAssignmentWins,
        :final isCategoryUnknown,
      ) =>
        KararBanner(
          message: isUserAssignmentWins
              ? l10n.categoryAssignmentWins
              : isCategoryUnknown
                  ? l10n.categoryUnknown
                  : l10n.transactionRejected,
          tone: isUserAssignmentWins ? KararStatusTone.info : KararStatusTone.danger,
        ),
    };
    if (banner == null) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
      child: Semantics(liveRegion: true, child: banner),
    );
  }
}
