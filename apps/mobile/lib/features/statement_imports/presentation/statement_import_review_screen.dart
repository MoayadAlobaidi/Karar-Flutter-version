// ONE IMPORT, ADDRESSED BY IDENTIFIER.
//
// The standalone review location. It shows what the parse produced for an
// import the person already has, and lets them discard it.
//
// ## Why it cannot commit, stated rather than hidden
//
// A commit requires `expectedVersion`, and the contract deliberately does NOT
// carry `version` on any read — a client takes it from the response to the
// write it last performed, which is the upload or the parse. So an import
// reached by identifier, in a session that did not parse it, has no version,
// and a commit from here would be a blind one: it could apply a decision the
// person took against a different parse.
//
// The button is therefore absent rather than present-and-broken. Discarding
// needs no version and is offered.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/shared.dart';
import 'statement_import_review_widgets.dart';
import 'statement_imports_providers.dart';

/// The review surface for one import.
class StatementImportReviewScreen extends ConsumerWidget {
  const StatementImportReviewScreen({required this.importId, super.key});

  final String importId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final preview = ref.watch(statementImportPreviewProvider(importId));
    return Scaffold(
      appBar: KararAppBar(title: l10n.statementImportReviewTitle),
      body: SafeArea(
        top: false,
        child: preview.when(
          loading: () => KararLoadingView(subject: l10n.statementImportReviewTitle),
          error: (Object error, StackTrace _) => KararStateView.error(
            title: l10n.statementImportUnavailableTitle,
            message: l10n.statementImportUnavailableDescription,
            actionLabel: l10n.actionRetry,
            onAction: () => ref.invalidate(statementImportPreviewProvider(importId)),
          ),
          data: (ImportPreviewView view) => switch (view) {
            ImportPreviewUnavailable() => KararStateView.error(
                title: l10n.statementImportUnavailableTitle,
                message: l10n.statementImportUnavailableDescription,
                actionLabel: l10n.actionRetry,
                onAction: () => ref.invalidate(statementImportPreviewProvider(importId)),
              ),
            ImportPreviewLoaded(:final preview) => SingleChildScrollView(
                padding: EdgeInsetsDirectional.all(context.spacing.md),
                child: ImportReviewBody(preview: preview),
              ),
          },
        ),
      ),
    );
  }
}
