import 'package:flutter/material.dart';

import '../../l10n/karar_localization.dart';
import '../design_system/tokens/karar_colors.dart';
import '../design_system/tokens/karar_elevation.dart';
import '../design_system/tokens/karar_motion.dart';
import '../design_system/tokens/karar_radii.dart';
import '../design_system/tokens/karar_sizing.dart';
import '../design_system/tokens/karar_spacing.dart';
import '../design_system/tokens/karar_tokens.dart';
import '../design_system/tokens/karar_typography.dart';
import '../formatting/karar_formatter.dart';

/// Token, string and direction access for widgets.
///
/// Every widget in the product reads design values through these getters. A
/// literal colour, size or string inside a widget is a review failure.
extension KararContext on BuildContext {
  /// The resolved token set.
  ///
  /// Falls back to resolving from the ambient brightness and locale when the
  /// theme extension is absent, so a widget still renders correctly inside a
  /// bare `MaterialApp` — a test harness, or a screen mounted before the shell
  /// installs its theme.
  KararTokens get tokens {
    return Theme.of(this).extension<KararTokens>() ??
        KararTokens.resolve(
          brightness: Theme.of(this).brightness,
          locale: Localizations.maybeLocaleOf(this) ?? const Locale('en'),
        );
  }

  KararColors get colors => tokens.colors;
  KararTypography get typography => tokens.typography;
  KararSpacing get spacing => tokens.spacing;
  KararRadii get radii => tokens.radii;
  KararSizing get sizing => tokens.sizing;
  KararElevation get elevation => tokens.elevation;
  KararMotion get motion => tokens.motion;

  /// Localized strings.
  AppLocalizations get l10n => AppLocalizations.of(this);

  /// The single formatter, bound to the active locale.
  KararFormatter get formatter => KararFormatter.of(this);

  TextDirection get direction => Directionality.of(this);

  bool get isRtl => Directionality.of(this) == TextDirection.rtl;

  /// The user's text scale. Read this rather than assuming a fixed height.
  TextScaler get textScaler => MediaQuery.textScalerOf(this);

  /// True once text is large enough that a horizontal row of label and value
  /// should stack vertically instead of clipping.
  bool get prefersStackedLayout => textScaler.scale(16) > 16 * 1.3;
}
