// THE TENANT-SELECTION GATE.
//
// The list is the platform's, verbatim. There is no free-text identifier, no
// remembered tenant, no deep-link parameter and no locally invented entry: the
// only identifiers this screen can send are the ones the platform put in front
// of it, and the platform verifies membership again before anything binds.
//
// Three shapes, one screen:
//   * several memberships — choose;
//   * exactly one — bind it without asking, which is the approved path for a
//     question with a single possible answer;
//   * none — an honest onboarding state whose one action is to redeem an
//     invitation. The session stays unbound and nothing tenant-bound renders.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/lifecycle/bootstrap_snapshot.dart';
import '../../../app/lifecycle/startup_state.dart';
import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../domain/invitation_redemption.dart';
import '../domain/tenant_binding.dart';
import 'tenant_providers.dart';

/// The gate-screen builder registered for [StartupStage.tenantSelectionRequired].
Widget buildTenantSelectionScreen(BuildContext context, StartupState state) =>
    TenantSelectionScreen(
      choices: state is TenantSelectionPending
          ? tenantChoicesOf(state.choices)
          : const <TenantChoice>[],
    );

/// Maps the shell's tenant options onto the feature's own type.
List<TenantChoice> tenantChoicesOf(List<TenantOption> options) => <TenantChoice>[
      for (final option in options)
        TenantChoice(
          tenantId: option.tenantId,
          name: option.name,
          roleHint: option.roleHint,
        ),
    ];

/// Chooses the organisation this session binds to.
final class TenantSelectionScreen extends ConsumerStatefulWidget {
  const TenantSelectionScreen({required this.choices, super.key});

  final List<TenantChoice> choices;

  @override
  ConsumerState<TenantSelectionScreen> createState() => _TenantSelectionScreenState();
}

class _TenantSelectionScreenState extends ConsumerState<TenantSelectionScreen> {
  static const TenantSelectionPolicy _policy = TenantSelectionPolicy();

  final TextEditingController _invitationController = TextEditingController();
  bool _autoBindAttempted = false;

  @override
  void initState() {
    super.initState();
    // A single membership is bound without asking. Scheduled rather than
    // called inline because a provider must not be written to during build.
    final decision = _policy.decide(widget.choices);
    if (decision is BindSingleTenant) {
      WidgetsBinding.instance.addPostFrameCallback((Duration _) {
        if (!mounted || _autoBindAttempted) {
          return;
        }
        _autoBindAttempted = true;
        unawaited(
          ref.read(tenantBindingControllerProvider.notifier).bind(decision.choice),
        );
      });
    }
  }

  @override
  void dispose() {
    _invitationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final decision = _policy.decide(widget.choices);
    final binding = ref.watch(tenantBindingControllerProvider);

    return Scaffold(
      appBar: KararAppBar(title: l10n.tenantSelectionTitle),
      body: SafeArea(
        top: false,
        child: switch (decision) {
          NoTenantMembership() => _NoMembershipBody(
              l10n: l10n,
              controller: _invitationController,
              onRedeem: _redeem,
            ),
          BindSingleTenant() => KararLoadingView(subject: l10n.tenantOrganisationTitle),
          ChooseTenant(:final choices) => _ChoiceList(
              choices: choices,
              l10n: l10n,
              binding: binding,
              onSelect: (TenantChoice choice) => unawaited(
                ref.read(tenantBindingControllerProvider.notifier).bind(choice),
              ),
            ),
        },
      ),
    );
  }

  void _redeem() {
    final token = InvitationToken.tryParse(_invitationController.text);
    if (token == null) {
      return;
    }
    unawaited(ref.read(invitationRedemptionControllerProvider.notifier).redeem(token));
  }
}

final class _ChoiceList extends StatelessWidget {
  const _ChoiceList({
    required this.choices,
    required this.l10n,
    required this.binding,
    required this.onSelect,
  });

  final List<TenantChoice> choices;
  final AppLocalizations l10n;
  final TenantBindingUiState binding;
  final ValueChanged<TenantChoice> onSelect;

  @override
  Widget build(BuildContext context) {
    final submittingId = binding is TenantBindingSubmitting
        ? (binding as TenantBindingSubmitting).tenantId
        : null;

    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        Text(
          l10n.tenantSelectionDescription,
          textAlign: TextAlign.start,
          style: context.typography.bodyMedium.copyWith(
            color: context.colors.contentSecondary,
          ),
        ),
        SizedBox(height: context.spacing.lg),
        if (binding is TenantBindingRejected) ...<Widget>[
          _RejectionBanner(rejection: binding as TenantBindingRejected, l10n: l10n),
          SizedBox(height: context.spacing.lg),
        ],
        for (final choice in choices)
          Padding(
            padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
            child: KararCard(
              padding: EdgeInsetsDirectional.zero,
              child: KararListRow(
                title: choice.name,
                subtitle: l10n.tenantRoleValuePattern(l10n.tenantRoleLabel, choice.roleHint),
                semanticLabel: context.l10n
                    .a11yTitleWithSubtitle(l10n.tenantSelectSemanticPrefix, choice.name),
                trailing: submittingId == choice.tenantId
                    ? const KararLoadingIndicator.inline()
                    : null,
                onPressed: submittingId == null ? () => onSelect(choice) : null,
              ),
            ),
          ),
      ],
    );
  }
}

final class _NoMembershipBody extends ConsumerWidget {
  const _NoMembershipBody({
    required this.l10n,
    required this.controller,
    required this.onRedeem,
  });

  final AppLocalizations l10n;
  final TextEditingController controller;
  final VoidCallback onRedeem;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final redemption = ref.watch(invitationRedemptionControllerProvider);
    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        KararStateView.empty(
          title: l10n.tenantNoMembershipTitle,
          message: l10n.tenantNoMembershipDescription,
        ),
        SizedBox(height: context.spacing.lg),
        KararCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Semantics(
                header: true,
                child: Text(
                  l10n.tenantInvitationHeading,
                  textAlign: TextAlign.start,
                  style: context.typography.titleMedium.copyWith(
                    color: context.colors.contentPrimary,
                  ),
                ),
              ),
              SizedBox(height: context.spacing.sm),
              Text(
                l10n.tenantInvitationDescription,
                textAlign: TextAlign.start,
                style: context.typography.bodySmall.copyWith(
                  color: context.colors.contentSecondary,
                ),
              ),
              SizedBox(height: context.spacing.md),
              KararTextField(
                label: l10n.tenantInvitationFieldLabel,
                controller: controller,
                isEnabled: redemption is! InvitationRedemptionSubmitting,
                textInputAction: TextInputAction.done,
                onSubmitted: (String _) => onRedeem(),
              ),
              SizedBox(height: context.spacing.md),
              KararButton(
                label: l10n.tenantInvitationAction,
                isFullWidth: true,
                isLoading: redemption is InvitationRedemptionSubmitting,
                onPressed: onRedeem,
              ),
              if (redemption is InvitationRedemptionAccepted) ...<Widget>[
                SizedBox(height: context.spacing.md),
                KararBanner(
                  message: l10n.tenantInvitationRedeemed,
                  tone: KararStatusTone.success,
                ),
              ],
              if (redemption is InvitationRedemptionRejected) ...<Widget>[
                SizedBox(height: context.spacing.md),
                KararBanner(
                  title: l10n.tenantInvitationFailedTitle,
                  message: l10n.tenantInvitationFailedDescription,
                  tone: KararStatusTone.danger,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// A refused binding, described without naming what the platform withheld.
final class _RejectionBanner extends StatelessWidget {
  const _RejectionBanner({required this.rejection, required this.l10n});

  final TenantBindingRejected rejection;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final reference = rejection.failure.correlationId;
    final (String title, String message) = switch (rejection) {
      _ when rejection.membershipChangedConcurrently => (
          l10n.tenantMembershipChangedTitle,
          l10n.tenantMembershipChangedDescription,
        ),
      _ when rejection.membershipRefused => (
          l10n.tenantMembershipRefusedTitle,
          l10n.tenantMembershipRefusedDescription,
        ),
      _ => (l10n.tenantSelectionFailedTitle, l10n.tenantSelectionFailedDescription),
    };
    return KararBanner(
      title: title,
      message: reference == null
          ? message
          : '$message ${context.l10n.stateErrorReference(reference)}',
      tone: KararStatusTone.danger,
    );
  }
}
