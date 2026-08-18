// PRESENTATION — the layout every identity screen shares.
//
// The shape is dictated by the accessibility requirements rather than by
// taste:
//
//   * the body ALWAYS scrolls. At a 2x text scale a sign-in form is taller
//     than a phone, and a column that cannot scroll clips its submit button;
//   * width is capped so a line of body text stays readable on a tablet;
//   * spacing comes from tokens, and every inset is directional, so Arabic
//     mirrors without a second layout;
//   * the failure notice is a `KararBanner`, which is a live region, so a
//     screen reader announces a rejected submission instead of leaving the
//     user to discover it.
import 'package:flutter/material.dart';

import '../../../../shared/shared.dart';

/// A scrolling, width-capped form surface with an app bar.
class IdentityScaffold extends StatelessWidget {
  const IdentityScaffold({
    required this.title,
    required this.children,
    this.onBack,
    this.actions = const <Widget>[],
    super.key,
  });

  final String title;
  final List<Widget> children;
  final VoidCallback? onBack;
  final List<Widget> actions;

  /// The widest a text column may be before it becomes hard to track.
  static const double maxContentWidth = 520;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.colors.background,
      appBar: KararAppBar(title: title, onBack: onBack, actions: actions),
      body: SafeArea(
        child: Align(
          alignment: AlignmentDirectional.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: maxContentWidth),
            child: SingleChildScrollView(
              padding: EdgeInsetsDirectional.all(context.spacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: children,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Vertical rhythm between form elements. One token, one meaning.
class IdentityGap extends StatelessWidget {
  const IdentityGap({super.key}) : _size = _GapSize.standard;

  const IdentityGap.small({super.key}) : _size = _GapSize.small;

  const IdentityGap.large({super.key}) : _size = _GapSize.large;

  final _GapSize _size;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: switch (_size) {
          _GapSize.small => context.spacing.sm,
          _GapSize.standard => context.spacing.md,
          _GapSize.large => context.spacing.xl,
        },
      );
}

enum _GapSize { small, standard, large }

/// An explanatory paragraph beneath a screen title.
class IdentityBody extends StatelessWidget {
  const IdentityBody(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        textAlign: TextAlign.start,
        style: context.typography.bodyMedium.copyWith(
          color: context.colors.contentSecondary,
        ),
      );
}

/// A section heading inside a screen.
class IdentityHeading extends StatelessWidget {
  const IdentityHeading(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
        header: true,
        child: Text(
          text,
          textAlign: TextAlign.start,
          style: context.typography.titleMedium.copyWith(
            color: context.colors.contentPrimary,
          ),
        ),
      );
}

/// The failure notice shown above a form.
///
/// [message] is already localized and already stripped of diagnostics by the
/// failure mapper; this widget adds the live region and the tone.
class IdentityFailureNotice extends StatelessWidget {
  const IdentityFailureNotice({
    required this.message,
    this.tone = KararStatusTone.danger,
    this.actionLabel,
    this.onAction,
    super.key,
  });

  final String message;
  final KararStatusTone tone;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsetsDirectional.only(bottom: context.spacing.md),
        child: KararBanner(
          message: message,
          tone: tone,
          actionLabel: actionLabel,
          onAction: onAction,
        ),
      );
}
