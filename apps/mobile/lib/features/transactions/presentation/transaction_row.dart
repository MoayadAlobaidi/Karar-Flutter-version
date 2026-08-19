// One transaction, as every listing renders it.
//
// The amount is the platform's SIGNED figure and the direction is the
// platform's own word for it. The client does no arithmetic on either: it does
// not derive the direction from the sign, and it does not re-sign the amount
// from the direction. Both arrived stated, and both are rendered as stated.
//
// The booking date is a calendar day and is rendered from its three integers,
// so the day a person sees is the day the institution wrote down, whatever
// their device's time zone.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/domain/money.dart';
import '../../financial_accounts/presentation/financial_formatting.dart';
import '../../financial_accounts/presentation/financial_labels.dart';
import '../../financial_accounts/presentation/financial_routes.dart';
import '../domain/transaction.dart';
import 'transaction_labels.dart';

/// One transaction in a list.
final class TransactionRow extends StatelessWidget {
  const TransactionRow({required this.transaction, required this.l10n, super.key});

  final Transaction transaction;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final amount = formatMoney(context, transaction.amount);
    final direction = moneyDirectionLabel(transaction.direction, l10n);

    return KararCard.pressable(
      onPressed: () => context.go(
        FinancialRoutes.transactionDetailPath(transaction.transactionId),
      ),
      semanticLabel: l10n.a11yFinancialAmount(amount, direction),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          KararBidiText(
            transaction.description,
            style: context.typography.bodyLarge
                .copyWith(color: context.colors.contentPrimary),
          ),
          if (transaction.merchant != null) ...<Widget>[
            SizedBox(height: context.spacing.xxs),
            KararBidiText(
              transaction.merchant!,
              style: context.typography.bodySmall
                  .copyWith(color: context.colors.contentSecondary),
            ),
          ],
          SizedBox(height: context.spacing.xs),
          KararBidiText(
            amount,
            style: context.typography.titleMedium
                .copyWith(color: context.colors.contentPrimary),
          ),
          SizedBox(height: context.spacing.xs),
          Wrap(
            spacing: context.spacing.xs,
            runSpacing: context.spacing.xs,
            children: <Widget>[
              KararStatusBadge(
                label: direction,
                tone: directionTone(transaction.direction),
              ),
              KararStatusBadge(
                label: transactionStatusLabel(transaction.status, l10n),
                tone: switch (transaction.status) {
                  TransactionStatus.posted => KararStatusTone.success,
                  TransactionStatus.voided => KararStatusTone.danger,
                  TransactionStatus.unrecognised => KararStatusTone.neutral,
                },
              ),
              KararStatusBadge(
                label: sourceKindLabel(
                  transaction.sourceKind,
                  transaction.availability,
                  l10n,
                ),
                tone: KararStatusTone.neutral,
              ),
            ],
          ),
          SizedBox(height: context.spacing.sm),
          Text(
            l10n.transactionBookedOnLabel,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
          Text(
            formatCalendarDay(context, transaction.bookingDate),
            textAlign: TextAlign.start,
            style: context.typography.bodySmall
                .copyWith(color: context.colors.contentSecondary),
          ),
        ],
      ),
    );
  }
}

/// The tone for a direction.
///
/// An unrecognised direction is a WARNING rather than a neutral: the client
/// does not know which way the money went, and pretending otherwise would put
/// a confident arrow on a record nobody can read.
KararStatusTone directionTone(MoneyDirection direction) => switch (direction) {
      MoneyDirection.moneyIn => KararStatusTone.success,
      MoneyDirection.moneyOut => KararStatusTone.neutral,
      MoneyDirection.unrecognised => KararStatusTone.warning,
    };
