// THE BOUND ORGANISATION, AND SWITCHING AWAY FROM IT.
//
// The binding shown here is read from the startup coordinator's bootstrap
// answer and from nowhere else — not from a route parameter, not from a
// header, not from a preference, and not from anything a person typed.
//
// Alternatives are likewise the platform's. When the platform lists none, this
// screen says so rather than offering a control that could only send an
// identifier nobody supplied.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/bootstrap_snapshot.dart' as shell;
import '../../../app/lifecycle/startup_state.dart';
import '../../../shared/shared.dart';
import '../domain/tenant_binding.dart';
import 'tenant_providers.dart';
import 'tenant_selection_screen.dart' show tenantChoicesOf;
import 'tenant_strings.dart';

/// The binding as this feature reads it from the shell.
@immutable
final class TenantBindingView {
  const TenantBindingView({this.current, this.alternatives = const <TenantChoice>[]});

  /// The organisation the session is bound to, or null when it is unbound.
  final TenantChoice? current;

  /// Other organisations the PLATFORM offered. Never composed locally.
  final List<TenantChoice> alternatives;
}

/// The binding, rebuilt whenever the startup coordinator moves.
final Provider<TenantBindingView?> tenantBindingViewProvider = Provider<TenantBindingView?>(
  (Ref ref) {
    final listenable = ref.watch(startupListenableProvider);
    void onChanged() => ref.invalidateSelf();
    listenable.addListener(onChanged);
    ref.onDispose(() => listenable.removeListener(onChanged));

    final state = listenable.state;
    if (state is! Ready) {
      return null;
    }
    return switch (state.bootstrap.binding) {
      shell.TenantBound(:final tenant) => TenantBindingView(
          current: tenantChoicesOf(<shell.TenantOption>[tenant]).single,
        ),
      shell.TenantUnbound() => const TenantBindingView(),
      shell.TenantSelectionRequired(:final choices) => TenantBindingView(
          alternatives: tenantChoicesOf(choices),
        ),
    };
  },
);

/// The organisation surface.
final class OrganisationScreen extends ConsumerWidget {
  const OrganisationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = TenantStrings.of(context);
    final view = ref.watch(tenantBindingViewProvider);
    final binding = ref.watch(tenantBindingControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: strings.organisationTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: view == null
            ? const KararLoadingView()
            : ListView(
                padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
                children: <Widget>[
                  _CurrentCard(view: view, strings: strings),
                  SizedBox(height: context.spacing.sectionGap),
                  _SwitchCard(
                    view: view,
                    strings: strings,
                    binding: binding,
                    onSwitch: (TenantChoice choice) => unawaited(
                      ref.read(tenantBindingControllerProvider.notifier).switchTo(choice),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

final class _CurrentCard extends StatelessWidget {
  const _CurrentCard({required this.view, required this.strings});

  final TenantBindingView view;
  final TenantStrings strings;

  @override
  Widget build(BuildContext context) {
    final current = view.current;
    if (current == null) {
      return KararCard(
        child: KararBanner(
          title: strings.unboundTitle,
          message: strings.unboundDescription,
          tone: KararStatusTone.info,
        ),
      );
    }
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            strings.currentOrganisationLabel,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          KararBidiText(
            current.name,
            style: context.typography.headingSmall.copyWith(
              color: context.colors.contentPrimary,
            ),
          ),
          SizedBox(height: context.spacing.md),
          // Label above value rather than "Label: value" on one line: the
          // separator would be punctuation this file invented, and a stacked
          // pair keeps a long role readable at a large text scale in both
          // reading directions.
          Text(
            strings.roleLabel,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          KararBidiText(
            current.roleHint,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

final class _SwitchCard extends StatelessWidget {
  const _SwitchCard({
    required this.view,
    required this.strings,
    required this.binding,
    required this.onSwitch,
  });

  final TenantBindingView view;
  final TenantStrings strings;
  final TenantBindingUiState binding;
  final ValueChanged<TenantChoice> onSwitch;

  @override
  Widget build(BuildContext context) {
    final submittingId = binding is TenantBindingSubmitting
        ? (binding as TenantBindingSubmitting).tenantId
        : null;

    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              strings.switchHeading,
              textAlign: TextAlign.start,
              style: context.typography.titleMedium.copyWith(
                color: context.colors.contentPrimary,
              ),
            ),
          ),
          SizedBox(height: context.spacing.sm),
          Text(
            strings.switchDescription,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          SizedBox(height: context.spacing.md),
          if (view.alternatives.isEmpty)
            KararBanner(
              title: strings.noAlternativesTitle,
              message: strings.noAlternativesDescription,
              tone: KararStatusTone.info,
            )
          else
            for (final choice in view.alternatives)
              Padding(
                padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
                child: KararListRow(
                  title: choice.name,
                  subtitle: strings.roleWithValue(choice.roleHint),
                  semanticLabel:
                      context.l10n.a11yTitleWithSubtitle(strings.switchAction, choice.name),
                  trailing: submittingId == choice.tenantId
                      ? const KararLoadingIndicator.inline()
                      : null,
                  onPressed: submittingId == null ? () => onSwitch(choice) : null,
                ),
              ),
          if (binding is TenantBindingConfirmed) ...<Widget>[
            SizedBox(height: context.spacing.md),
            KararBanner(
              message: (binding as TenantBindingConfirmed).outcome is TenantSwitched
                  ? strings.switchedConfirmation
                  : strings.boundConfirmation,
              tone: KararStatusTone.success,
            ),
          ],
          if (binding is TenantBindingRejected) ...<Widget>[
            SizedBox(height: context.spacing.md),
            KararBanner(
              title: (binding as TenantBindingRejected).membershipChangedConcurrently
                  ? strings.membershipChangedTitle
                  : strings.selectionFailedTitle,
              message: (binding as TenantBindingRejected).membershipChangedConcurrently
                  ? strings.membershipChangedDescription
                  : strings.selectionFailedDescription,
              tone: KararStatusTone.danger,
            ),
          ],
        ],
      ),
    );
  }
}
