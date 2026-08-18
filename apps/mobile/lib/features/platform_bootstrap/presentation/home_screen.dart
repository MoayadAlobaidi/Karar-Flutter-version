// THE AUTHENTICATED HOME.
//
// What this screen shows is an honest account and platform state: who the
// session belongs to, which organisation it is bound to, which regime governs
// it, which legal person it was contracted with, what has been agreed to, and
// which services the platform says are available.
//
// What it does NOT show, anywhere, in any state, including while loading:
// a balance, an account, a transaction, a portfolio, a synchronisation state,
// an insight, a score, or any monetary value. The platform publishes none of
// those in this phase, so displaying one — even as a placeholder or a
// skeleton with a plausible figure — would be a fabrication.
//
// Capability navigation is built from the platform's answer alone. No product
// capability is implemented in this build, so the services section renders the
// honest empty state rather than a menu of things that do not open.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../consent/presentation/consent_routes.dart';
import '../../profile/presentation/profile_routes.dart';
import '../../settings/presentation/settings_routes.dart';
import '../../tenant_selection/presentation/tenant_routes.dart';
import '../domain/platform_capability.dart';
import '../domain/platform_context.dart';
import 'platform_providers.dart';
import 'platform_routes.dart';

/// The signed-in landing surface.
final class PlatformHomeScreen extends ConsumerWidget {
  const PlatformHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final context_ = ref.watch(platformContextProvider);
    final l10n = context.l10n;

    return Scaffold(
      appBar: KararAppBar(title: l10n.platformHomeTitle),
      body: SafeArea(
        top: false,
        child: context_ == null
            // Unreachable through the router, which only routes here in READY.
            // Rendering progress is the honest answer to "the context is not
            // here yet"; an error would claim a failure that did not happen.
            ? const KararLoadingView()
            : _HomeBody(platform: context_, l10n: l10n),
      ),
    );
  }
}

final class _HomeBody extends StatelessWidget {
  const _HomeBody({required this.platform, required this.l10n});

  final PlatformContext platform;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        _Section(
          heading: l10n.platformSectionServices,
          child: _ServicesState(platform: platform, l10n: l10n),
        ),
        _Section(
          heading: l10n.platformSectionAccount,
          padded: false,
          child: KararListRow(
            title: l10n.platformProfileRowTitle,
            subtitle: l10n.platformProfileRowSubtitle,
            leadingIcon: KararIcons.statusNeutral,
            onPressed: () => context.go(ProfileRoutes.profile),
          ),
        ),
        _Section(
          heading: l10n.platformSectionSession,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              KararStatusBadge(
                label: l10n.platformSessionActive,
                tone: KararStatusTone.success,
              ),
              SizedBox(height: context.spacing.md),
              _LabelledValue(
                label: l10n.platformSessionReferenceLabel,
                value: platform.sessionId,
              ),
            ],
          ),
        ),
        _Section(
          heading: l10n.platformSectionOrganisation,
          padded: false,
          child: _OrganisationRow(platform: platform, l10n: l10n),
        ),
        _Section(
          heading: l10n.platformSectionJurisdiction,
          padded: false,
          child: KararListRow(
            title: jurisdictionStateLabel(platform.jurisdiction.state, l10n),
            subtitle: l10n.platformJurisdictionRowSubtitle,
            leadingIcon: KararIcons.statusInfo,
            onPressed: () => context.go(PlatformRoutes.jurisdiction),
          ),
        ),
        _Section(
          heading: l10n.platformSectionLegal,
          padded: false,
          child: KararListRow(
            title: operatingEntityLabel(platform.operatingEntity, l10n),
            subtitle: l10n.platformLegalRowSubtitle,
            leadingIcon: KararIcons.document,
            onPressed: () => context.go(PlatformRoutes.legal),
          ),
        ),
        _Section(
          heading: l10n.platformSectionConsent,
          padded: false,
          child: KararListRow(
            title: l10n.platformSectionConsent,
            subtitle: l10n.platformConsentRowSubtitle,
            leadingIcon: KararIcons.check,
            onPressed: () => context.go(ConsentRoutes.consent),
          ),
        ),
        _Section(
          heading: l10n.platformSectionSettings,
          padded: false,
          child: KararListRow(
            title: l10n.platformSectionSettings,
            subtitle: l10n.platformSettingsRowSubtitle,
            leadingIcon: KararIcons.language,
            onPressed: () => context.go(SettingsRoutes.settings),
          ),
        ),
      ],
    );
  }
}

/// The services section.
///
/// Three outcomes, and the first two are the pair this workstream exists to
/// keep apart: a completed resolution with nothing in it is an empty state,
/// while a resolution that did not complete is a closed door. A destination
/// list is only ever built from what the platform returned.
final class _ServicesState extends StatelessWidget {
  const _ServicesState({required this.platform, required this.l10n});

  final PlatformContext platform;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final navigation = platform.navigation;
    switch (navigation) {
      case CapabilityNavigationUnresolved():
        return KararBanner(
          title: l10n.platformCapabilitiesUnresolvedTitle,
          message: l10n.platformCapabilitiesUnresolvedDescription,
          tone: KararStatusTone.warning,
        );
      case CapabilityNavigationResolved(:final destinations):
        if (destinations.isEmpty) {
          return KararStateView.empty(
            title: l10n.platformNoServicesTitle,
            message: l10n.platformNoServicesDescription,
          );
        }
        return Column(
          children: <Widget>[
            for (final destination in destinations)
              KararListRow(
                title: destination.capabilityId,
                onPressed: () => context.go(destination.routePath),
              ),
          ],
        );
    }
  }
}

final class _OrganisationRow extends StatelessWidget {
  const _OrganisationRow({required this.platform, required this.l10n});

  final PlatformContext platform;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final tenant = platform.boundTenant;
    return KararListRow(
      title: tenant?.name ?? l10n.platformOrganisationUnbound,
      subtitle: tenant == null ? null : l10n.platformOrganisationRowSubtitle,
      leadingIcon: KararIcons.statusNeutral,
      onPressed: () => context.go(TenantRoutes.organisation),
    );
  }
}

/// A heading with a card beneath it.
final class _Section extends StatelessWidget {
  const _Section({required this.heading, required this.child, this.padded = true});

  final String heading;
  final Widget child;

  /// A row supplies its own padding and its own touch target, so a card that
  /// padded it again would shrink the target and misalign the chevron.
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

/// A label above the value it names.
///
/// Stacked rather than side by side so a large text scale lengthens the column
/// instead of clipping either half.
final class _LabelledValue extends StatelessWidget {
  const _LabelledValue({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: context.l10n.a11yTitleWithSubtitle(label, value),
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            label,
            textAlign: TextAlign.start,
            style: context.typography.labelMedium.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
          SizedBox(height: context.spacing.xxs),
          KararBidiText(
            value,
            style: context.typography.bodyMedium.copyWith(
              color: context.colors.contentPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

/// The label for a jurisdiction state. Names the STATE, never the regime's
/// rules.
String jurisdictionStateLabel(PlatformJurisdictionState state, AppLocalizations l10n) =>
    switch (state) {
      PlatformJurisdictionState.none => l10n.platformJurisdictionNone,
      PlatformJurisdictionState.unverified => l10n.platformJurisdictionUnverified,
      PlatformJurisdictionState.verified => l10n.platformJurisdictionVerified,
      PlatformJurisdictionState.unrecognised => l10n.platformJurisdictionUnrecognised,
    };

/// The label for the operating-entity state. The assigned case shows the
/// registered legal name the platform published, and nothing derived from it.
String operatingEntityLabel(OperatingEntityContext entity, AppLocalizations l10n) =>
    switch (entity) {
      OperatingEntityAssigned(:final entity) => entity.name,
      OperatingEntityUnassigned() => l10n.platformOperatingEntityUnassignedTitle,
      OperatingEntityUnavailable() => l10n.platformOperatingEntityUnavailableTitle,
      OperatingEntityUnrecognised() => l10n.platformOperatingEntityUnrecognisedTitle,
    };
