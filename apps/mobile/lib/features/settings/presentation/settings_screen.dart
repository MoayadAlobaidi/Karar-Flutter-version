// SETTINGS.
//
// Language and appearance are device preferences. Everything else on this
// screen is a way into a surface that renders platform state, plus the one
// account action the platform offers: recording an intention to disable.
//
// The disable request is described as what it is. It records an intention; it
// disables nothing, removes nothing, and ends no session. Presenting it as a
// completed closure would be a promise the platform has not made.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/localization/locale_preference.dart';
import '../../../shared/shared.dart';
import '../../consent/presentation/consent_routes.dart';
import '../../platform_bootstrap/presentation/platform_routes.dart';
import '../../profile/presentation/profile_providers.dart';
import '../../profile/presentation/profile_routes.dart';
import '../../tenant_selection/presentation/tenant_routes.dart';
import 'settings_providers.dart';
import 'settings_strings.dart';

/// The settings surface.
final class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = SettingsStrings.of(context);
    final selectedLocale = ref.watch(selectedLocaleProvider);
    final selectedTheme = ref.watch(selectedThemeProvider);
    final preferences = ref.watch(presentationPreferencesProvider);
    final disable = ref.watch(accountDisableControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: strings.screenTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          children: <Widget>[
            _Group(
              heading: context.l10n.languageSettingTitle,
              child: Column(
                children: <Widget>[
                  for (final option in interfaceLocaleOptions)
                    KararCheckboxTile(
                      label: _localeLabel(context, option),
                      value: selectedLocale?.value == option?.value,
                      onChanged: (bool _) =>
                          unawaited(preferences.setLocale(option)),
                    ),
                ],
              ),
            ),
            _Group(
              heading: strings.appearanceTitle,
              child: Column(
                children: <Widget>[
                  for (final theme in ThemePreference.values)
                    KararCheckboxTile(
                      label: switch (theme) {
                        ThemePreference.system => strings.themeSystem,
                        ThemePreference.light => strings.themeLight,
                        ThemePreference.dark => strings.themeDark,
                      },
                      value: selectedTheme == theme,
                      onChanged: (bool _) => unawaited(preferences.setTheme(theme)),
                    ),
                ],
              ),
            ),
            _Group(
              heading: strings.yourAccountTitle,
              padded: false,
              child: Column(
                children: <Widget>[
                  KararListRow(
                    title: strings.profileRow,
                    onPressed: () => context.go(ProfileRoutes.profile),
                  ),
                  KararListRow(
                    title: strings.organisationRow,
                    onPressed: () => context.go(TenantRoutes.organisation),
                  ),
                  KararListRow(
                    title: strings.jurisdictionRow,
                    onPressed: () => context.go(PlatformRoutes.jurisdiction),
                  ),
                  KararListRow(
                    title: strings.legalRow,
                    onPressed: () => context.go(PlatformRoutes.legal),
                  ),
                  KararListRow(
                    title: strings.consentRow,
                    onPressed: () => context.go(ConsentRoutes.consent),
                  ),
                ],
              ),
            ),
            _Group(
              heading: strings.dangerTitle,
              child: _DisableCard(strings: strings, state: disable),
            ),
          ],
        ),
      ),
    );
  }

  String _localeLabel(BuildContext context, LocaleTag? option) => switch (option?.value) {
        'en' => context.l10n.languageEnglish,
        'ar' => context.l10n.languageArabic,
        _ => context.l10n.languageSystemDefault,
      };
}

final class _DisableCard extends ConsumerWidget {
  const _DisableCard({required this.strings, required this.state});

  final SettingsStrings strings;
  final AccountDisableState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          strings.disableTitle,
          textAlign: TextAlign.start,
          style: context.typography.bodyLarge.copyWith(
            color: context.colors.contentPrimary,
          ),
        ),
        SizedBox(height: context.spacing.xs),
        Text(
          strings.disableDescription,
          textAlign: TextAlign.start,
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentSecondary,
          ),
        ),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: strings.disableAction,
          variant: KararButtonVariant.destructive,
          isFullWidth: true,
          isLoading: state is AccountDisableSubmitting,
          onPressed: () => unawaited(_confirm(context, ref)),
        ),
        ..._outcome(context),
      ],
    );
  }

  Future<void> _confirm(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => KararDialog(
        title: strings.disableConfirmTitle,
        message: strings.disableConfirmMessage,
        confirmLabel: strings.disableAction,
        cancelLabel: dialogContext.l10n.actionCancel,
        isDestructive: true,
        onConfirm: () => Navigator.of(dialogContext).pop(true),
        onCancel: () => Navigator.of(dialogContext).pop(false),
      ),
    );
    if (confirmed ?? false) {
      await ref.read(accountDisableControllerProvider.notifier).request();
    }
  }

  List<Widget> _outcome(BuildContext context) {
    switch (state) {
      case AccountDisableIdle():
      case AccountDisableSubmitting():
        return const <Widget>[];
      case AccountDisableRecorded(:final request):
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: strings.disableRecordedTitle,
            message: request.auditRecorded
                ? strings.disableRecordedMessage
                : '${strings.disableRecordedMessage} ${strings.disableAuditWarning}',
            tone: request.auditRecorded
                ? KararStatusTone.info
                : KararStatusTone.warning,
          ),
        ];
      case AccountDisableRejected():
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: strings.disableFailedTitle,
            message: strings.disableFailedMessage,
            tone: KararStatusTone.danger,
          ),
        ];
    }
  }
}

final class _Group extends StatelessWidget {
  const _Group({required this.heading, required this.child, this.padded = true});

  final String heading;
  final Widget child;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: context.spacing.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Padding(
              padding: EdgeInsetsDirectional.only(bottom: context.spacing.sm),
              child: Text(
                heading,
                textAlign: TextAlign.start,
                style: context.typography.titleMedium.copyWith(
                  color: context.colors.contentSecondary,
                ),
              ),
            ),
          ),
          KararCard(
            padding: padded ? null : EdgeInsetsDirectional.zero,
            child: child,
          ),
        ],
      ),
    );
  }
}
