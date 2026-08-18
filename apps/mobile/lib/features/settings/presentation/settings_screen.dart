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
import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../consent/presentation/consent_routes.dart';
import '../../platform_bootstrap/presentation/platform_routes.dart';
import '../../profile/presentation/profile_providers.dart';
import '../../profile/presentation/profile_routes.dart';
import '../../tenant_selection/presentation/tenant_routes.dart';
import 'settings_providers.dart';

/// The settings surface.
final class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final selectedLocale = ref.watch(selectedLocaleProvider);
    final selectedTheme = ref.watch(selectedThemeProvider);
    final preferences = ref.watch(presentationPreferencesProvider);
    final disable = ref.watch(accountDisableControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.settingsScreenTitle,
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
              heading: l10n.settingsAppearanceTitle,
              child: Column(
                children: <Widget>[
                  for (final theme in ThemePreference.values)
                    KararCheckboxTile(
                      label: switch (theme) {
                        ThemePreference.system => l10n.settingsThemeSystem,
                        ThemePreference.light => l10n.settingsThemeLight,
                        ThemePreference.dark => l10n.settingsThemeDark,
                      },
                      value: selectedTheme == theme,
                      onChanged: (bool _) => unawaited(preferences.setTheme(theme)),
                    ),
                ],
              ),
            ),
            _Group(
              heading: l10n.settingsYourAccountTitle,
              padded: false,
              child: Column(
                children: <Widget>[
                  KararListRow(
                    title: l10n.settingsProfileRow,
                    onPressed: () => context.go(ProfileRoutes.profile),
                  ),
                  KararListRow(
                    title: l10n.settingsOrganisationRow,
                    onPressed: () => context.go(TenantRoutes.organisation),
                  ),
                  KararListRow(
                    title: l10n.settingsJurisdictionRow,
                    onPressed: () => context.go(PlatformRoutes.jurisdiction),
                  ),
                  KararListRow(
                    title: l10n.settingsLegalRow,
                    onPressed: () => context.go(PlatformRoutes.legal),
                  ),
                  KararListRow(
                    title: l10n.settingsConsentRow,
                    onPressed: () => context.go(ConsentRoutes.consent),
                  ),
                ],
              ),
            ),
            _Group(
              heading: l10n.settingsDangerTitle,
              child: _DisableCard(l10n: l10n, state: disable),
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
  const _DisableCard({required this.l10n, required this.state});

  final AppLocalizations l10n;
  final AccountDisableState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          l10n.settingsDisableTitle,
          textAlign: TextAlign.start,
          style: context.typography.bodyLarge.copyWith(
            color: context.colors.contentPrimary,
          ),
        ),
        SizedBox(height: context.spacing.xs),
        Text(
          l10n.settingsDisableDescription,
          textAlign: TextAlign.start,
          style: context.typography.bodySmall.copyWith(
            color: context.colors.contentSecondary,
          ),
        ),
        SizedBox(height: context.spacing.md),
        KararButton(
          label: l10n.settingsDisableAction,
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
        title: l10n.settingsDisableConfirmTitle,
        message: l10n.settingsDisableConfirmMessage,
        confirmLabel: l10n.settingsDisableAction,
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
            title: l10n.settingsDisableRecordedTitle,
            message: request.auditRecorded
                ? l10n.settingsDisableRecordedMessage
                : '${l10n.settingsDisableRecordedMessage} ${l10n.settingsDisableAuditWarning}',
            tone: request.auditRecorded
                ? KararStatusTone.info
                : KararStatusTone.warning,
          ),
        ];
      case AccountDisableRejected():
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: l10n.settingsDisableFailedTitle,
            message: l10n.settingsDisableFailedMessage,
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
