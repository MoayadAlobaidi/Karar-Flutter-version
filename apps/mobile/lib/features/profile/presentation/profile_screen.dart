// THE SUBJECT'S OWN PROFILE.
//
// Two fields are editable, because the platform accepts two. Everything else
// is rendered as state the platform owns, with no control implying otherwise.
//
// A saved state is shown only after the platform returns the stored profile.
// Nothing here is written locally and reported as saved.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../l10n/karar_localization.dart';
import '../../../shared/shared.dart';
import '../domain/user_profile.dart';
import 'profile_providers.dart';

/// The profile surface.
final class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final TextEditingController _displayName = TextEditingController();
  String? _seededFor;

  @override
  void dispose() {
    _displayName.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final view = ref.watch(ownProfileProvider);
    final edit = ref.watch(profileEditControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: l10n.profileScreenTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: view.when(
          loading: () => KararLoadingView(subject: l10n.profileScreenTitle),
          error: (Object error, StackTrace _) => _Unavailable(l10n: l10n, ref: ref),
          data: (ProfileView value) => switch (value) {
            ProfileUnavailable() => _Unavailable(l10n: l10n, ref: ref),
            ProfileLoaded(:final profile) => _ProfileBody(
                profile: profile,
                l10n: l10n,
                edit: edit,
                displayName: _seedController(profile),
                onSave: () => unawaited(
                  ref.read(profileEditControllerProvider.notifier).save(
                        ProfileChangeSet(
                          displayName: _displayName.text.trim() == profile.displayName
                              ? null
                              : _displayName.text.trim(),
                        ),
                      ),
                ),
              ),
          },
        ),
      ),
    );
  }

  /// Fills the field from the platform's value once per loaded profile, so a
  /// refresh does not overwrite an edit in progress.
  TextEditingController _seedController(UserProfile profile) {
    if (_seededFor != profile.userId) {
      _seededFor = profile.userId;
      _displayName.text = profile.displayName;
    }
    return _displayName;
  }
}

final class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.l10n, required this.ref});

  final AppLocalizations l10n;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          child: KararStateView.error(
            title: l10n.profileUnavailableTitle,
            message: l10n.profileUnavailableDescription,
            actionLabel: context.l10n.actionRetry,
            onAction: () => unawaited(ref.read(ownProfileProvider.notifier).refresh()),
          ),
        ),
      );
}

final class _ProfileBody extends StatelessWidget {
  const _ProfileBody({
    required this.profile,
    required this.l10n,
    required this.edit,
    required this.displayName,
    required this.onSave,
  });

  final UserProfile profile;
  final AppLocalizations l10n;
  final ProfileEditState edit;
  final TextEditingController displayName;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
      children: <Widget>[
        KararCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              KararTextField(
                label: l10n.profileDisplayNameLabel,
                helperText: l10n.profileDisplayNameHelper,
                controller: displayName,
                isEnabled: edit is! ProfileEditSubmitting,
                maxLength: 120,
              ),
              SizedBox(height: context.spacing.md),
              KararButton(
                label: context.l10n.actionSave,
                isFullWidth: true,
                isLoading: edit is ProfileEditSubmitting,
                onPressed: onSave,
              ),
              ..._editOutcome(context),
            ],
          ),
        ),
        SizedBox(height: context.spacing.sectionGap),
        KararCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              KararStatusBadge(
                label: accountStatusLabel(profile.status, l10n),
                tone: switch (profile.status) {
                  AccountStatus.active => KararStatusTone.success,
                  AccountStatus.disableRequested ||
                  AccountStatus.deletionRequested =>
                    KararStatusTone.warning,
                  AccountStatus.disabled => KararStatusTone.danger,
                  AccountStatus.unrecognised => KararStatusTone.neutral,
                },
              ),
              if (profile.status == AccountStatus.disableRequested) ...<Widget>[
                SizedBox(height: context.spacing.md),
                KararBanner(
                  message: l10n.profileStatusDisableRequestedNote,
                  tone: KararStatusTone.info,
                ),
              ],
              SizedBox(height: context.spacing.md),
              _Labelled(label: l10n.profileLanguageLabel, value: profile.locale),
              SizedBox(height: context.spacing.sm),
              _Labelled(
                label: l10n.profileResidencyLabel,
                value: profile.residencyJurisdictionRef ?? l10n.profileNotStated,
              ),
              SizedBox(height: context.spacing.sm),
              _Labelled(label: l10n.profileOrganisationLabel, value: profile.tenantId),
              SizedBox(height: context.spacing.sm),
              _Labelled(label: l10n.profileAccountReferenceLabel, value: profile.userId),
              SizedBox(height: context.spacing.sm),
              _Labelled(
                label: l10n.profileMemberSinceLabel,
                value: context.formatter.date(profile.createdAt),
              ),
              SizedBox(height: context.spacing.sm),
              _Labelled(
                label: l10n.profileLastUpdatedLabel,
                value: context.formatter.date(profile.updatedAt),
              ),
            ],
          ),
        ),
      ],
    );
  }

  List<Widget> _editOutcome(BuildContext context) {
    switch (edit) {
      case ProfileEditIdle():
      case ProfileEditSubmitting():
        return const <Widget>[];
      case ProfileEditSaved():
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(message: l10n.profileSaveConfirmation, tone: KararStatusTone.success),
        ];
      case ProfileEditRejected(:final noApprovedChanges):
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: noApprovedChanges ? l10n.profileNoChangesTitle : l10n.profileSaveFailedTitle,
            message: noApprovedChanges
                ? l10n.profileNoChangesDescription
                : l10n.profileSaveFailedDescription,
            tone: noApprovedChanges ? KararStatusTone.info : KararStatusTone.danger,
          ),
        ];
    }
  }
}

final class _Labelled extends StatelessWidget {
  const _Labelled({required this.label, required this.value});

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

/// The label for an account status.
String accountStatusLabel(AccountStatus status, AppLocalizations l10n) =>
    switch (status) {
      AccountStatus.active => l10n.profileStatusActive,
      AccountStatus.disableRequested => l10n.profileStatusDisableRequested,
      AccountStatus.deletionRequested => l10n.profileStatusDeletionRequested,
      AccountStatus.disabled => l10n.profileStatusDisabled,
      AccountStatus.unrecognised => l10n.profileStatusUnrecognised,
    };
