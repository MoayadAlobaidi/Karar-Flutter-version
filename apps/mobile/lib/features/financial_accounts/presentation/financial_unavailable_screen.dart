// THE REFUSAL.
//
// What a deep link into the financial surface reaches when the capability is
// absent. It says the surface is not available for this account and nothing
// else: it does not name an account, a wallet, a transaction, a balance or a
// currency, because describing what is behind a closed door is a disclosure in
// itself.
//
// It reads no financial provider, so reaching it starts no request.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/routing/route_paths.dart';
import '../../../shared/shared.dart';

/// Rendered in place of any financial screen the capability does not cover.
final class FinancialUnavailableScreen extends StatelessWidget {
  const FinancialUnavailableScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: KararAppBar(title: l10n.financialUnavailableTitle),
      body: SafeArea(
        top: false,
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
            child: KararStateView.empty(
              title: l10n.financialUnavailableTitle,
              message: l10n.financialUnavailableDescription,
              actionLabel: l10n.financialUnavailableAction,
              onAction: () => context.go(RoutePaths.home),
            ),
          ),
        ),
      ),
    );
  }
}
