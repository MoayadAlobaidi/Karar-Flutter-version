// JURISDICTION STATUS AND SELF-DECLARATION.
//
// The status is the platform's, rendered as a state and never as a rule: this
// screen states WHETHER a regime governs the account and whether the platform
// verified it, and says nothing about what that regime requires. No
// jurisdiction's rules are encoded in this client.
//
// A declaration is USER_DECLARED and UNVERIFIED, and it widens nothing. The
// screen says both, before the control and again after the platform answers,
// so a person cannot read a recorded declaration as a verified one.
//
// The selectable references come from the platform. This build receives none —
// the contract exposes no endpoint that lists the register — so the screen
// renders an honest unavailable state rather than a free-text field that would
// invite an identifier the register does not hold.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/shared.dart';
import '../domain/jurisdiction_declaration.dart';
import '../domain/platform_context.dart';
import 'home_screen.dart' show jurisdictionStateLabel;
import 'platform_providers.dart';
import 'platform_strings.dart';

/// The jurisdiction surface.
final class JurisdictionScreen extends ConsumerStatefulWidget {
  const JurisdictionScreen({super.key});

  @override
  ConsumerState<JurisdictionScreen> createState() => _JurisdictionScreenState();
}

class _JurisdictionScreenState extends ConsumerState<JurisdictionScreen> {
  JurisdictionReference? _selected;

  @override
  Widget build(BuildContext context) {
    final platform = ref.watch(platformContextProvider);
    final strings = PlatformStrings.of(context);
    final options = ref.watch(jurisdictionReferenceOptionsProvider);
    final declaration = ref.watch(jurisdictionDeclarationControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: strings.jurisdictionScreenTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: platform == null
            ? const KararLoadingView()
            : ListView(
                padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
                children: <Widget>[
                  _StatusCard(status: platform.jurisdiction, strings: strings),
                  SizedBox(height: context.spacing.sectionGap),
                  _DeclarationCard(
                    strings: strings,
                    options: options,
                    selected: _selected,
                    declarationState: declaration,
                    onSelect: (JurisdictionReference reference) =>
                        setState(() => _selected = reference),
                    onDeclare: _selected == null
                        ? null
                        : () => unawaited(
                              ref
                                  .read(jurisdictionDeclarationControllerProvider.notifier)
                                  .declare(_selected!),
                            ),
                  ),
                ],
              ),
      ),
    );
  }
}

final class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.status, required this.strings});

  final JurisdictionStatus status;
  final PlatformStrings strings;

  @override
  Widget build(BuildContext context) {
    final identifier = status.jurisdictionId;
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          KararStatusBadge(
            label: jurisdictionStateLabel(status.state, strings),
            tone: switch (status.state) {
              PlatformJurisdictionState.verified => KararStatusTone.success,
              PlatformJurisdictionState.unverified => KararStatusTone.info,
              PlatformJurisdictionState.none => KararStatusTone.neutral,
              PlatformJurisdictionState.unrecognised => KararStatusTone.warning,
            },
          ),
          if (identifier != null) ...<Widget>[
            SizedBox(height: context.spacing.md),
            Text(
              strings.jurisdictionReferenceLabel,
              textAlign: TextAlign.start,
              style: context.typography.labelMedium.copyWith(
                color: context.colors.contentSecondary,
              ),
            ),
            SizedBox(height: context.spacing.xxs),
            KararBidiText(
              identifier,
              style: context.typography.bodyMedium.copyWith(
                color: context.colors.contentPrimary,
              ),
            ),
          ],
          SizedBox(height: context.spacing.md),
          Text(
            strings.jurisdictionRowSubtitle,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

final class _DeclarationCard extends StatelessWidget {
  const _DeclarationCard({
    required this.strings,
    required this.options,
    required this.selected,
    required this.declarationState,
    required this.onSelect,
    required this.onDeclare,
  });

  final PlatformStrings strings;
  final List<JurisdictionReference> options;
  final JurisdictionReference? selected;
  final JurisdictionDeclarationState declarationState;
  final ValueChanged<JurisdictionReference> onSelect;
  final VoidCallback? onDeclare;

  @override
  Widget build(BuildContext context) {
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              strings.jurisdictionDeclareTitle,
              textAlign: TextAlign.start,
              style: context.typography.titleMedium.copyWith(
                color: context.colors.contentPrimary,
              ),
            ),
          ),
          SizedBox(height: context.spacing.sm),
          Text(
            strings.jurisdictionDeclareDescription,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          SizedBox(height: context.spacing.md),
          if (options.isEmpty)
            KararBanner(
              message: strings.jurisdictionSelectionUnavailable,
              tone: KararStatusTone.info,
            )
          else ...<Widget>[
            for (final option in options)
              KararCheckboxTile(
                label: option.id,
                value: option == selected,
                onChanged: declarationState is JurisdictionDeclarationSubmitting
                    ? null
                    : (bool _) => onSelect(option),
              ),
            SizedBox(height: context.spacing.md),
            KararButton(
              label: strings.jurisdictionDeclareAction,
              isFullWidth: true,
              isLoading: declarationState is JurisdictionDeclarationSubmitting,
              onPressed: onDeclare,
            ),
          ],
          ..._outcome(context),
        ],
      ),
    );
  }

  List<Widget> _outcome(BuildContext context) {
    switch (declarationState) {
      case JurisdictionDeclarationIdle():
      case JurisdictionDeclarationSubmitting():
        return const <Widget>[];
      case JurisdictionDeclarationConfirmed(:final declaration):
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: declaration.recorded
                ? strings.jurisdictionRecorded
                : strings.jurisdictionAlreadyInEffect,
            message: strings.jurisdictionRemainsUnverified,
            tone: KararStatusTone.info,
          ),
        ];
      case JurisdictionDeclarationFailed(:final failure):
        // The reference is the only detail shown. A failure message is not a
        // channel for anything the successful response would have withheld.
        final reference = failure.correlationId;
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: context.l10n.stateErrorTitle,
            message: reference == null
                ? context.l10n.stateErrorDescription
                : context.l10n.stateErrorReference(reference),
            tone: KararStatusTone.danger,
          ),
        ];
    }
  }
}
