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

import '../../../shared/shared.dart';
import '../domain/user_profile.dart';
import 'profile_providers.dart';
import 'profile_strings.dart';

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
    final strings = ProfileStrings.of(context);
    final view = ref.watch(ownProfileProvider);
    final edit = ref.watch(profileEditControllerProvider);

    return Scaffold(
      appBar: KararAppBar(
        title: strings.screenTitle,
        onBack: () => context.pop(),
      ),
      body: SafeArea(
        top: false,
        child: view.when(
          loading: () => KararLoadingView(subject: strings.screenTitle),
          error: (Object error, StackTrace _) => _Unavailable(strings: strings, ref: ref),
          data: (ProfileView value) => switch (value) {
            ProfileUnavailable() => _Unavailable(strings: strings, ref: ref),
            ProfileLoaded(:final profile) => _ProfileBody(
                profile: profile,
                strings: strings,
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
  const _Unavailable({required this.strings, required this.ref});

  final ProfileStrings strings;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
          child: KararStateView.error(
            title: strings.unavailableTitle,
            message: strings.unavailableDescription,
            actionLabel: context.l10n.actionRetry,
            onAction: () => unawaited(ref.read(ownProfileProvider.notifier).refresh()),
          ),
        ),
      );
}

final class _ProfileBody extends StatelessWidget {
  const _ProfileBody({
    required this.profile,
    required this.strings,
    required this.edit,
    required this.displayName,
    required this.onSave,
  });

  final UserProfile profile;
  final ProfileStrings strings;
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
                label: strings.displayNameLabel,
                helperText: strings.displayNameHelper,
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
                label: accountStatusLabel(profile.status, strings),
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
                  message: strings.statusDisableRequestedNote,
                  tone: KararStatusTone.info,
                ),
              ],
              SizedBox(height: context.spacing.md),
              _Labelled(label: strings.languageLabel, value: profile.locale),
              SizedBox(height: context.spacing.sm),
              _Labelled(
                label: strings.residencyLabel,
                value: profile.residencyJurisdictionRef ?? strings.notStated,
              ),
              SizedBox(height: context.spacing.sm),
              _Labelled(label: strings.organisationLabel, value: profile.tenantId),
              SizedBox(height: context.spacing.sm),
              _Labelled(label: strings.accountReferenceLabel, value: profile.userId),
              SizedBox(height: context.spacing.sm),
              _Labelled(
                label: strings.memberSinceLabel,
                value: context.formatter.date(profile.createdAt),
              ),
              SizedBox(height: context.spacing.sm),
              _Labelled(
                label: strings.lastUpdatedLabel,
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
          KararBanner(message: strings.saveConfirmation, tone: KararStatusTone.success),
        ];
      case ProfileEditRejected(:final noApprovedChanges):
        return <Widget>[
          SizedBox(height: context.spacing.md),
          KararBanner(
            title: noApprovedChanges ? strings.noChangesTitle : strings.saveFailedTitle,
            message: noApprovedChanges
                ? strings.noChangesDescription
                : strings.saveFailedDescription,
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
String accountStatusLabel(AccountStatus status, ProfileStrings strings) =>
    switch (status) {
      AccountStatus.active => strings.statusActive,
      AccountStatus.disableRequested => strings.statusDisableRequested,
      AccountStatus.deletionRequested => strings.statusDeletionRequested,
      AccountStatus.disabled => strings.statusDisabled,
      AccountStatus.unrecognised => strings.statusUnrecognised,
    };
