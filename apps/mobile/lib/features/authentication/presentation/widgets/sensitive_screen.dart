// OBSCURING SENSITIVE CONTENT WHEN THE APPLICATION LEAVES THE FOREGROUND.
//
// Both mobile platforms photograph the current frame when an application is
// backgrounded, and show that image in the task switcher. For most screens
// that is harmless. For the MFA setup key, the recovery codes, a password
// reset and the session list it is not: the snapshot outlives the screen, is
// written to disk by the operating system, and is visible to anyone holding
// the unlocked device.
//
// This widget covers its subtree the moment the application stops being
// `resumed`. On iOS the snapshot is taken at `inactive`, which is why the
// cover engages there and not only at `paused`.
//
// SCOPE, STATED HONESTLY: this is the Flutter-side control. A complete
// defence also sets `FLAG_SECURE` on the Android window and the equivalent
// iOS protection, both of which live in `android/` and `ios/` — directories
// this workstream does not own. The native half is named in the workstream
// report; the widget below is not a substitute for it and does not pretend to
// be. It does, on its own, keep the content out of the captured frame.
import 'package:flutter/material.dart';

import '../../../../l10n/karar_localization.dart';
import '../../../../shared/shared.dart';

/// Covers [child] whenever the application is not in the foreground.
class SensitiveScreen extends StatefulWidget {
  const SensitiveScreen({required this.child, super.key});

  /// Identifies the cover, so a test can assert it is present rather than
  /// inferring it from the surrounding widget types.
  static const Key coverKey = Key('sensitive_screen.cover');

  final Widget child;

  @override
  State<SensitiveScreen> createState() => _SensitiveScreenState();
}

class _SensitiveScreenState extends State<SensitiveScreen> with WidgetsBindingObserver {
  bool _isObscured = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // `resumed` is the only state in which the content may render. Anything
    // else — inactive, hidden, paused, detached — covers it. Failing closed
    // here costs a frame of blank surface and nothing else.
    final bool obscured = state != AppLifecycleState.resumed;
    if (obscured != _isObscured && mounted) {
      setState(() => _isObscured = obscured);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = context.l10n;
    return Stack(
      children: <Widget>[
        // Kept in the tree rather than replaced, so scroll position, focus and
        // in-flight requests survive a brief trip to the task switcher.
        ExcludeSemantics(
          excluding: _isObscured,
          child: widget.child,
        ),
        if (_isObscured)
          Positioned.fill(
            key: SensitiveScreen.coverKey,
            child: Semantics(
              label: l10n.a11ySensitiveScreen,
              child: ColoredBox(
                color: context.colors.surface,
                child: Center(
                  child: Icon(
                    KararIcons.hidden,
                    size: context.sizing.iconLarge,
                    color: context.colors.contentTertiary,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
