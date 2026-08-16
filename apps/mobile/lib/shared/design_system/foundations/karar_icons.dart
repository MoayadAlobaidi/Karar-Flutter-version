import 'package:flutter/material.dart';

import '../tokens/karar_colors.dart';

/// The sanctioned icon vocabulary.
///
/// Icons are named by meaning, not by picture, so a brand can substitute an
/// icon set without a widget change.
///
/// Every entry in [directional] is declared with `matchTextDirection: true`, so
/// Flutter mirrors it automatically under RTL — a forward chevron points left
/// in Arabic without any widget deciding that. `test/shared/design_system/`
/// asserts that property rather than trusting it.
abstract final class KararIcons {
  static const IconData back = Icons.arrow_back;
  static const IconData forward = Icons.arrow_forward;
  static const IconData navigateNext = Icons.chevron_right;
  static const IconData navigatePrevious = Icons.chevron_left;

  /// Icons whose meaning depends on reading direction.
  ///
  /// Membership is not a label — the accompanying test asserts that every entry
  /// really is declared `matchTextDirection`. `Icons.exit_to_app` looks
  /// directional and is not mirrored by the framework, so it is deliberately
  /// absent.
  static const List<IconData> directional = <IconData>[
    back,
    forward,
    navigateNext,
    navigatePrevious,
  ];

  static const IconData close = Icons.close;
  static const IconData clear = Icons.cancel;
  static const IconData search = Icons.search;
  static const IconData refresh = Icons.refresh;
  static const IconData edit = Icons.edit_outlined;
  static const IconData copy = Icons.copy_outlined;
  static const IconData visible = Icons.visibility_outlined;
  static const IconData hidden = Icons.visibility_off_outlined;
  static const IconData expand = Icons.expand_more;
  static const IconData collapse = Icons.expand_less;
  static const IconData check = Icons.check;

  static const IconData statusInfo = Icons.info_outline;
  static const IconData statusSuccess = Icons.check_circle_outline;
  static const IconData statusWarning = Icons.warning_amber_rounded;
  static const IconData statusDanger = Icons.error_outline;
  static const IconData statusNeutral = Icons.radio_button_unchecked;
  static const IconData statusPending = Icons.schedule;

  static const IconData empty = Icons.inbox_outlined;
  static const IconData offline = Icons.wifi_off_outlined;
  static const IconData language = Icons.translate;
  static const IconData document = Icons.description_outlined;

  static IconData forTone(KararStatusTone tone) {
    switch (tone) {
      case KararStatusTone.neutral:
        return statusNeutral;
      case KararStatusTone.info:
        return statusInfo;
      case KararStatusTone.success:
        return statusSuccess;
      case KararStatusTone.warning:
        return statusWarning;
      case KararStatusTone.danger:
        return statusDanger;
    }
  }
}
