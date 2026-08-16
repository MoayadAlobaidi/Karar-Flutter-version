import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart' show Bidi;

/// Text whose language is not known at build time.
///
/// Server-supplied content — a legal document, a display name, a merchant
/// string — may be in a different language from the interface. Rendering an
/// Arabic paragraph inside an English `Directionality` puts its trailing
/// punctuation on the wrong side and reorders any embedded Latin run.
///
/// This widget resolves the *paragraph* direction from the first strong
/// character in [text] and renders inside that direction. Bidirectional runs
/// *within* the paragraph are still resolved by the Unicode algorithm, which
/// is what makes a mixed "Karar قرار" string read correctly either way.
///
/// Legal documents are displayed in the locale the server supplied. Nothing
/// here translates them.
class KararBidiText extends StatelessWidget {
  const KararBidiText(
    this.text, {
    this.style,
    this.maxLines,
    this.overflow,
    this.textAlign = TextAlign.start,
    this.semanticsLabel,
    super.key,
  });

  final String text;
  final TextStyle? style;
  final int? maxLines;
  final TextOverflow? overflow;
  final TextAlign textAlign;
  final String? semanticsLabel;

  /// The direction [text] should be laid out in.
  ///
  /// Falls back to the ambient direction when the string has no strong
  /// character at all — digits and punctuation only, for example — because
  /// guessing in that case is worse than inheriting.
  static TextDirection directionOf(String text, TextDirection fallback) {
    if (!Bidi.hasAnyLtr(text) && !Bidi.hasAnyRtl(text)) {
      return fallback;
    }
    return Bidi.detectRtlDirectionality(text)
        ? TextDirection.rtl
        : TextDirection.ltr;
  }

  @override
  Widget build(BuildContext context) {
    final TextDirection resolved = directionOf(
      text,
      Directionality.of(context),
    );
    return Directionality(
      textDirection: resolved,
      child: Text(
        text,
        style: style,
        maxLines: maxLines,
        overflow: overflow,
        textAlign: textAlign,
        semanticsLabel: semanticsLabel,
      ),
    );
  }
}
