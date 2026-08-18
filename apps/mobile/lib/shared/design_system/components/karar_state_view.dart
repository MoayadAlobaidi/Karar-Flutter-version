import 'package:flutter/material.dart';

import '../../extensions/build_context_extensions.dart';
import '../foundations/karar_icons.dart';
import 'karar_button.dart';
import 'karar_loading_indicator.dart';

enum _KararStateKind { empty, error, offline }

/// The layout every full-region state shares: an icon, a heading, an
/// explanation, and at most one action.
///
/// Empty, error and offline are one component with three configurations rather
/// than three hand-built screens that drift apart. Copy defaults to the
/// localized strings, so a screen that has nothing specific to say still says
/// something translated.
class KararStateView extends StatelessWidget {
  /// Nothing to show. Not a failure, and never filled with sample content: the
  /// client does not display figures it cannot attribute to a platform
  /// response.
  const KararStateView.empty({
    this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.icon = KararIcons.empty,
    super.key,
  }) : _kind = _KararStateKind.empty,
       detail = null;

  /// A request failed. [detail] carries a support reference when the platform
  /// supplied one.
  const KararStateView.error({
    this.title,
    this.message,
    this.detail,
    this.actionLabel,
    this.onAction,
    super.key,
  }) : _kind = _KararStateKind.error,
       icon = KararIcons.statusDanger;

  /// No usable connection.
  const KararStateView.offline({this.onAction, super.key})
    : _kind = _KararStateKind.offline,
      icon = KararIcons.offline,
      title = null,
      message = null,
      detail = null,
      actionLabel = null;

  final _KararStateKind _kind;
  final IconData icon;
  final String? title;
  final String? message;
  final String? detail;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final _StateCopy copy = _resolve(context);
    return Semantics(
      container: true,
      // An error the user did not ask for is announced when it appears.
      liveRegion: _kind != _KararStateKind.empty,
      child: Padding(
        padding: EdgeInsetsDirectional.symmetric(
          horizontal: context.spacing.xl,
          vertical: context.spacing.xxl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            ExcludeSemantics(
              child: Icon(
                icon,
                size: context.sizing.iconXLarge,
                color: copy.iconColor,
              ),
            ),
            SizedBox(height: context.spacing.lg),
            Text(
              copy.title,
              textAlign: TextAlign.center,
              style: context.typography.headingSmall.copyWith(
                color: context.colors.contentPrimary,
              ),
            ),
            SizedBox(height: context.spacing.sm),
            Text(
              copy.message,
              textAlign: TextAlign.center,
              style: context.typography.bodyMedium.copyWith(
                color: context.colors.contentSecondary,
              ),
            ),
            if (detail != null) ...<Widget>[
              SizedBox(height: context.spacing.sm),
              Text(
                detail!,
                textAlign: TextAlign.center,
                style: context.typography.bodySmall.copyWith(
                  color: context.colors.contentTertiary,
                ),
              ),
            ],
            if (copy.actionLabel != null) ...<Widget>[
              SizedBox(height: context.spacing.xl),
              KararButton(
                label: copy.actionLabel!,
                onPressed: onAction,
                variant: KararButtonVariant.secondary,
              ),
            ],
          ],
        ),
      ),
    );
  }

  _StateCopy _resolve(BuildContext context) {
    switch (_kind) {
      case _KararStateKind.empty:
        return _StateCopy(
          title: title ?? context.l10n.stateEmptyTitle,
          message: message ?? context.l10n.stateEmptyDescription,
          iconColor: context.colors.contentTertiary,
          actionLabel: onAction == null ? null : actionLabel,
        );
      case _KararStateKind.error:
        return _StateCopy(
          title: title ?? context.l10n.stateErrorTitle,
          message: message ?? context.l10n.stateErrorDescription,
          iconColor: context.colors.danger.content,
          actionLabel: onAction == null
              ? null
              : (actionLabel ?? context.l10n.actionRetry),
        );
      case _KararStateKind.offline:
        return _StateCopy(
          title: context.l10n.stateOfflineTitle,
          message: context.l10n.stateOfflineDescription,
          iconColor: context.colors.warning.content,
          actionLabel: onAction == null ? null : context.l10n.actionRetry,
        );
    }
  }
}

@immutable
class _StateCopy {
  const _StateCopy({
    required this.title,
    required this.message,
    required this.iconColor,
    required this.actionLabel,
  });

  final String title;
  final String message;
  final Color iconColor;
  final String? actionLabel;
}

/// A full-region loading state, announced once.
class KararLoadingView extends StatelessWidget {
  const KararLoadingView({this.subject, super.key});

  /// Names what is loading, for the announcement.
  final String? subject;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: EdgeInsetsDirectional.all(context.spacing.xl),
        child: KararLoadingIndicator(subject: subject),
      ),
    );
  }
}
