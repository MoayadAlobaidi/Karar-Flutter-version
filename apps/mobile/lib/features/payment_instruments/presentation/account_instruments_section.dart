// WHAT SPENDS FROM THIS ACCOUNT.
//
// Instruments are rendered UNDER their parent account and nowhere else. The
// section shows a type, a safe mask and a status for each one — and no figure,
// because an instrument has none.
//
// This is where the two-virtual-cards case is settled: a wallet with two
// virtual cards renders ONE wallet balance, above, and TWO instrument rows,
// here. Neither row can show an amount, because [PaymentInstrument] has no
// field that could hold one and this widget reads no balance provider.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../financial_accounts/presentation/financial_labels.dart';
import '../../financial_accounts/presentation/financial_widgets.dart';
import '../domain/payment_instrument.dart';
import 'instruments_providers.dart';

/// The instruments nested under one account.
final class AccountInstrumentsSection extends ConsumerWidget {
  const AccountInstrumentsSection({
    required this.accountId,
    required this.l10n,
    super.key,
  });

  final String accountId;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final instruments = ref.watch(accountInstrumentsProvider(accountId));

    return FinancialSection(
      heading: l10n.instrumentsSectionTitle,
      child: KararCard(
        child: instruments.when(
          loading: () => const KararLoadingIndicator.inline(),
          error: (Object error, StackTrace _) => Text(
            l10n.instrumentsEmptyTitle,
            textAlign: TextAlign.start,
            style: context.typography.bodyMedium
                .copyWith(color: context.colors.contentSecondary),
          ),
          data: (List<PaymentInstrument> value) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                context.formatter
                    .applyNumerals(l10n.instrumentsCountLabel(value.length)),
                textAlign: TextAlign.start,
                style: context.typography.labelMedium
                    .copyWith(color: context.colors.contentSecondary),
              ),
              SizedBox(height: context.spacing.sm),
              if (value.isEmpty)
                Text(
                  l10n.instrumentsEmptyTitle,
                  textAlign: TextAlign.start,
                  style: context.typography.bodyMedium
                      .copyWith(color: context.colors.contentSecondary),
                )
              else
                for (final instrument in value)
                  Padding(
                    padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
                    child: PaymentInstrumentRow(instrument: instrument, l10n: l10n),
                  ),
              SizedBox(height: context.spacing.xs),
              // Stated on every account, however many instruments it has. It
              // is the sentence that keeps two cards on one wallet from
              // reading as two balances.
              Text(
                l10n.instrumentsNoBalanceNotice,
                textAlign: TextAlign.start,
                style: context.typography.bodySmall
                    .copyWith(color: context.colors.contentTertiary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One instrument: a label, a type, a masked tail and a status.
///
/// There is no amount anywhere in this widget, and there is nothing it could
/// read to obtain one.
final class PaymentInstrumentRow extends StatelessWidget {
  const PaymentInstrumentRow({
    required this.instrument,
    required this.l10n,
    super.key,
  });

  final PaymentInstrument instrument;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final typeLabel = instrumentTypeLabel(instrument.instrumentType, l10n);
    final statusLabel = instrumentStatusLabel(instrument.status, l10n);
    return Semantics(
      label: l10n.a11yInstrumentSummary(instrument.displayLabel, typeLabel, statusLabel),
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: context.colors.surfaceSunken,
          borderRadius: BorderRadius.all(Radius.circular(context.radii.md)),
        ),
        child: Padding(
          padding: EdgeInsetsDirectional.all(context.spacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              KararBidiText(
                instrument.displayLabel,
                style: context.typography.bodyLarge
                    .copyWith(color: context.colors.contentPrimary),
              ),
              SizedBox(height: context.spacing.xs),
              Wrap(
                spacing: context.spacing.xs,
                runSpacing: context.spacing.xs,
                children: <Widget>[
                  KararStatusBadge(label: typeLabel, tone: KararStatusTone.neutral),
                  KararStatusBadge(
                    label: statusLabel,
                    tone: switch (instrument.status) {
                      InstrumentStatus.active => KararStatusTone.success,
                      InstrumentStatus.suspended => KararStatusTone.warning,
                      InstrumentStatus.expired ||
                      InstrumentStatus.cancelled =>
                        KararStatusTone.danger,
                      InstrumentStatus.unrecognised => KararStatusTone.neutral,
                    },
                  ),
                  KararStatusBadge(
                    label: instrument.spendable
                        ? l10n.instrumentSpendable
                        : l10n.instrumentNotSpendable,
                    tone: instrument.spendable
                        ? KararStatusTone.info
                        : KararStatusTone.neutral,
                  ),
                ],
              ),
              SizedBox(height: context.spacing.sm),
              LabelledValue(
                label: l10n.accountMaskLabel,
                value: safeMaskLabel(
                  instrument.mask.value,
                  withheld: instrument.mask.isWithheld,
                  l10n: l10n,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String instrumentTypeLabel(InstrumentType type, AppLocalizations l10n) =>
    switch (type) {
      InstrumentType.physicalCard => l10n.instrumentTypePhysicalCard,
      InstrumentType.virtualCard => l10n.instrumentTypeVirtualCard,
      InstrumentType.prepaidCard => l10n.instrumentTypePrepaidCard,
      InstrumentType.tokenizedCard => l10n.instrumentTypeTokenizedCard,
      InstrumentType.qrPaymentIdentity => l10n.instrumentTypeQrPaymentIdentity,
      InstrumentType.other => l10n.instrumentTypeOther,
      InstrumentType.unrecognised => l10n.instrumentTypeUnrecognised,
    };

String instrumentStatusLabel(InstrumentStatus status, AppLocalizations l10n) =>
    switch (status) {
      InstrumentStatus.active => l10n.instrumentStatusActive,
      InstrumentStatus.suspended => l10n.instrumentStatusSuspended,
      InstrumentStatus.expired => l10n.instrumentStatusExpired,
      InstrumentStatus.cancelled => l10n.instrumentStatusCancelled,
      InstrumentStatus.unrecognised => l10n.instrumentStatusUnrecognised,
    };
