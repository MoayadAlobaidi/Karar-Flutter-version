// THE OPERATING-ENTITY AND LEGAL CONTEXT SURFACE.
//
// It renders the reviewed safe summary the platform published, for three
// purposes and no others: naming the contracting party, giving support an
// identity to work from, and giving legal documents a publisher.
//
// NOTHING IS INFERRED HERE. This screen does not state or imply a controller
// or processor role, a legal obligation, a licence, a regulatory approval, a
// supervisory relationship, or a lawful basis for processing. The register
// holds material this projection deliberately omits, and an omission is not an
// invitation to reconstruct it from what remains.
//
// The three absent states are rendered as themselves. UNASSIGNED is not an
// error; UNAVAILABLE is a read that failed; a state this build does not
// recognise is closed rather than guessed.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../../consent/presentation/consent_routes.dart';
import '../domain/platform_context.dart';
import 'platform_providers.dart';

/// The contracting entity and the governing policy version.
final class LegalContextScreen extends ConsumerWidget {
  const LegalContextScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final platform = ref.watch(platformContextProvider);
    final l10n = context.l10n;

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.platformLegalScreenTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: platform == null
            ? const KararLoadingView()
            : ListView(
                padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
                children: <Widget>[
                  _OperatingEntityCard(
                    entity: platform.operatingEntity,
                    l10n: l10n,
                  ),
                  SizedBox(height: context.spacing.sectionGap),
                  _PolicyPackCard(policyPack: platform.policyPack, l10n: l10n),
                  SizedBox(height: context.spacing.sectionGap),
                  KararCard(
                    padding: EdgeInsetsDirectional.zero,
                    child: KararListRow(
                      title: l10n.platformSectionConsent,
                      subtitle: l10n.platformConsentRowSubtitle,
                      leadingIcon: KararIcons.document,
                      onPressed: () => context.go(ConsentRoutes.consent),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

final class _OperatingEntityCard extends StatelessWidget {
  const _OperatingEntityCard({required this.entity, required this.l10n});

  final OperatingEntityContext entity;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              l10n.platformOperatingEntityHeading,
              textAlign: TextAlign.start,
              style: context.typography.titleMedium.copyWith(
                color: context.colors.contentPrimary,
              ),
            ),
          ),
          SizedBox(height: context.spacing.md),
          ..._body(context),
        ],
      ),
    );
  }

  List<Widget> _body(BuildContext context) {
    switch (entity) {
      case OperatingEntityAssigned(:final entity):
        return <Widget>[
          _LabelledValue(
            label: l10n.platformOperatingEntityNameLabel,
            value: entity.name,
          ),
          if (entity.jurisdictionRef != null) ...<Widget>[
            SizedBox(height: context.spacing.md),
            _LabelledValue(
              label: l10n.platformOperatingEntityJurisdictionLabel,
              value: entity.jurisdictionRef!,
            ),
          ],
          if (entity.contactReference != null) ...<Widget>[
            SizedBox(height: context.spacing.md),
            _LabelledValue(
              label: l10n.platformOperatingEntityContactLabel,
              value: entity.contactReference!,
            ),
          ],
          SizedBox(height: context.spacing.md),
          Text(
            l10n.platformOperatingEntityAssignedNote,
            textAlign: TextAlign.start,
            style: context.typography.bodySmall.copyWith(
              color: context.colors.contentSecondary,
            ),
          ),
        ];
      case OperatingEntityUnassigned():
        return <Widget>[
          _StateNote(
            title: l10n.platformOperatingEntityUnassignedTitle,
            message: l10n.platformOperatingEntityUnassignedDescription,
            tone: KararStatusTone.info,
          ),
        ];
      case OperatingEntityUnavailable():
        return <Widget>[
          _StateNote(
            title: l10n.platformOperatingEntityUnavailableTitle,
            message: l10n.platformOperatingEntityUnavailableDescription,
            tone: KararStatusTone.warning,
          ),
        ];
      case OperatingEntityUnrecognised():
        return <Widget>[
          _StateNote(
            title: l10n.platformOperatingEntityUnrecognisedTitle,
            message: l10n.platformOperatingEntityUnrecognisedDescription,
            tone: KararStatusTone.warning,
          ),
        ];
    }
  }
}

final class _PolicyPackCard extends StatelessWidget {
  const _PolicyPackCard({required this.policyPack, required this.l10n});

  final PolicyPackStatus policyPack;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final version = policyPack.version;
    final status = policyPack.status;
    return KararCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              l10n.platformPolicyPackHeading,
              textAlign: TextAlign.start,
              style: context.typography.titleMedium.copyWith(
                color: context.colors.contentPrimary,
              ),
            ),
          ),
          SizedBox(height: context.spacing.md),
          if (version == null && status == null)
            Text(
              l10n.platformPolicyPackAbsent,
              textAlign: TextAlign.start,
              style: context.typography.bodyMedium.copyWith(
                color: context.colors.contentSecondary,
              ),
            )
          else ...<Widget>[
            if (version != null)
              _LabelledValue(label: l10n.platformPolicyPackVersionLabel, value: version),
            if (status != null) ...<Widget>[
              SizedBox(height: context.spacing.md),
              _LabelledValue(label: l10n.platformPolicyPackStatusLabel, value: status),
            ],
          ],
        ],
      ),
    );
  }
}

final class _StateNote extends StatelessWidget {
  const _StateNote({required this.title, required this.message, required this.tone});

  final String title;
  final String message;
  final KararStatusTone tone;

  @override
  Widget build(BuildContext context) =>
      KararBanner(title: title, message: message, tone: tone);
}

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
