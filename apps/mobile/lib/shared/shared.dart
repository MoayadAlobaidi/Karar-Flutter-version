/// Everything a feature needs from the shared layer: design tokens and
/// components, the locale-aware formatter, and the context extensions that
/// reach them.
///
/// A feature imports this file and `package:karar_mobile/l10n/karar_localization.dart`;
/// it never imports a token or component file by path.
library;

export 'design_system/design_system.dart';
export 'extensions/build_context_extensions.dart';
export 'formatting/arabic_digit_input_formatter.dart';
export 'formatting/arabic_numerals.dart';
export 'formatting/karar_formatter.dart';
