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

import '../../../shared/shared.dart';
import '../../consent/presentation/consent_routes.dart';
import '../../profile/presentation/profile_routes.dart';
import '../../settings/presentation/settings_routes.dart';
import '../../tenant_selection/presentation/tenant_routes.dart';
import '../domain/platform_capability.dart';
import '../domain/platform_context.dart';
import 'platform_providers.dart';
import 'platform_routes.dart';
import 'platform_strings.dart';

/// The signed-in landing surface.
final class PlatformHomeScreen extends ConsumerWidget {
  const PlatformHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final context_ = ref.watch(platformContextProvider);
    final strings = PlatformStrings.of(context);

    return Scaffold(
      appBar: KararAppBar(title: strings.homeTitle),
      body: SafeArea(
        top: false,
        child: context_ == null
            // Unreachable through the router, which only routes here in READY.
            // Rendering progress is the honest answer to "the context is not
            // here yet"; an error would claim a failure that did not happen.
            ? const KararLoadingView()
            : _HomeBody(platform: context_, strings: strings),
      ),
    );
  }
}

final class _HomeBody extends StatelessWidget {
  const _HomeBody({required this.platform, required this.strings});

  final PlatformContext platform;
  final PlatformStrings strings;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        _Section(
          heading: strings.sectionServices,
          child: _ServicesState(platform: platform, strings: strings),
        ),
        _Section(
          heading: strings.sectionAccount,
          padded: false,
          child: KararListRow(
            title: strings.profileRowTitle,
            subtitle: strings.profileRowSubtitle,
            leadingIcon: KararIcons.statusNeutral,
            onPressed: () => context.go(ProfileRoutes.profile),
          ),
        ),
        _Section(
          heading: strings.sectionSession,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              KararStatusBadge(
                label: strings.sessionActive,
                tone: KararStatusTone.success,
              ),
              SizedBox(height: context.spacing.md),
              _LabelledValue(
                label: strings.sessionReferenceLabel,
                value: platform.sessionId,
              ),
            ],
          ),
        ),
        _Section(
          heading: strings.sectionOrganisation,
          padded: false,
          child: _OrganisationRow(platform: platform, strings: strings),
        ),
        _Section(
          heading: strings.sectionJurisdiction,
          padded: false,
          child: KararListRow(
            title: jurisdictionStateLabel(platform.jurisdiction.state, strings),
            subtitle: strings.jurisdictionRowSubtitle,
            leadingIcon: KararIcons.statusInfo,
            onPressed: () => context.go(PlatformRoutes.jurisdiction),
          ),
        ),
        _Section(
          heading: strings.sectionLegal,
          padded: false,
          child: KararListRow(
            title: operatingEntityLabel(platform.operatingEntity, strings),
            subtitle: strings.legalRowSubtitle,
            leadingIcon: KararIcons.document,
            onPressed: () => context.go(PlatformRoutes.legal),
          ),
        ),
        _Section(
          heading: strings.sectionConsent,
          padded: false,
          child: KararListRow(
            title: strings.sectionConsent,
            subtitle: strings.consentRowSubtitle,
            leadingIcon: KararIcons.check,
            onPressed: () => context.go(ConsentRoutes.consent),
          ),
        ),
        _Section(
          heading: strings.sectionSettings,
          padded: false,
          child: KararListRow(
            title: strings.sectionSettings,
            subtitle: strings.settingsRowSubtitle,
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
  const _ServicesState({required this.platform, required this.strings});

  final PlatformContext platform;
  final PlatformStrings strings;

  @override
  Widget build(BuildContext context) {
    final navigation = platform.navigation;
    switch (navigation) {
      case CapabilityNavigationUnresolved():
        return KararBanner(
          title: strings.capabilitiesUnresolvedTitle,
          message: strings.capabilitiesUnresolvedDescription,
          tone: KararStatusTone.warning,
        );
      case CapabilityNavigationResolved(:final destinations):
        if (destinations.isEmpty) {
          return KararStateView.empty(
            title: strings.noServicesTitle,
            message: strings.noServicesDescription,
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
  const _OrganisationRow({required this.platform, required this.strings});

  final PlatformContext platform;
  final PlatformStrings strings;

  @override
  Widget build(BuildContext context) {
    final tenant = platform.boundTenant;
    return KararListRow(
      title: tenant?.name ?? strings.organisationUnbound,
      subtitle: tenant == null ? null : strings.organisationRowSubtitle,
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
String jurisdictionStateLabel(PlatformJurisdictionState state, PlatformStrings strings) =>
    switch (state) {
      PlatformJurisdictionState.none => strings.jurisdictionNone,
      PlatformJurisdictionState.unverified => strings.jurisdictionUnverified,
      PlatformJurisdictionState.verified => strings.jurisdictionVerified,
      PlatformJurisdictionState.unrecognised => strings.jurisdictionUnrecognised,
    };

/// The label for the operating-entity state. The assigned case shows the
/// registered legal name the platform published, and nothing derived from it.
String operatingEntityLabel(OperatingEntityContext entity, PlatformStrings strings) =>
    switch (entity) {
      OperatingEntityAssigned(:final entity) => entity.name,
      OperatingEntityUnassigned() => strings.operatingEntityUnassignedTitle,
      OperatingEntityUnavailable() => strings.operatingEntityUnavailableTitle,
      OperatingEntityUnrecognised() => strings.operatingEntityUnrecognisedTitle,
    };
