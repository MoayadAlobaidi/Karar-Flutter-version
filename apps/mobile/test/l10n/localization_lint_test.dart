import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Source rules that a lint package would carry if the project had one.
///
/// `docs/architecture/flutter.md` §5 lists both of these as enforced rules: no
/// hardcoded user-facing strings, and directional insets only. They are checked
/// here because retrofitting bidirectional layout later means finding every
/// hardcoded `EdgeInsets.only(left:)` one screen at a time.
///
/// Run with the rest of the localization gate:
///
/// ```
/// cd apps/mobile && flutter test test/l10n
/// ```
///
/// Both checks read whole files rather than single lines, because the formatter
/// puts almost every argument on its own line and a line-by-line scan would
/// miss nearly everything it is meant to catch.
void main() {
  final List<_Source> sources = _dartSourcesUnder('lib');

  test('the scan actually found source to check', () {
    expect(sources, isNotEmpty);
  });

  test('no user-facing string literal is passed to Text()', () {
    final RegExp literalText = RegExp(r'''\bText\(\s*['"]''');
    final List<String> offenders = <String>[];
    for (final _Source source in sources) {
      offenders.addAll(source.findAll(literalText));
    }
    expect(
      offenders,
      isEmpty,
      reason:
          'User-facing text must come from an ARB key, not a literal:\n'
          '${offenders.join('\n')}',
    );
  });

  test('layout is directional, never left or right', () {
    final Map<RegExp, String> banned = <RegExp, String>{
      RegExp(
        r'EdgeInsets\.only\((?:\s*\w+\s*:\s*[^,)]+,?)*\s*(left|right)\s*:',
      ): 'use EdgeInsetsDirectional.only(start:/end:)',
      RegExp(r'EdgeInsets\.fromLTRB\('): 'use EdgeInsetsDirectional.fromSTEB',
      RegExp(
        r'\bAlignment\.(centerLeft|centerRight|topLeft|topRight|bottomLeft|bottomRight)\b',
      ): 'use AlignmentDirectional',
      RegExp(r'\bTextAlign\.(left|right)\b'): 'use TextAlign.start or end',
      RegExp(r'\bPositioned\(\s*(?:\s*\w+\s*:\s*[^,)]+,?)*\s*(left|right)\s*:'):
          'use PositionedDirectional',
      RegExp(r'BorderRadius\.horizontal\('):
          'use BorderRadiusDirectional.horizontal',
      RegExp(r'\bBorderRadius\.only\(\s*(top|bottom)(Left|Right)'):
          'use BorderRadiusDirectional.only',
    };

    final List<String> offenders = <String>[];
    for (final _Source source in sources) {
      for (final MapEntry<RegExp, String> rule in banned.entries) {
        offenders.addAll(
          source.findAll(rule.key).map((String hit) => '$hit -> ${rule.value}'),
        );
      }
    }
    expect(
      offenders,
      isEmpty,
      reason:
          'Hardcoded direction found. Arabic reads right to left, so a left '
          'inset is a defect, not a style choice:\n${offenders.join('\n')}',
    );
  });
}

class _Source {
  _Source(this.path, this._content);

  final String path;

  /// File content with comment-only lines blanked out, so a rule cannot be
  /// tripped by prose in a doc comment while line numbers stay accurate.
  final String _content;

  List<String> findAll(RegExp pattern) {
    return pattern
        .allMatches(_content)
        .map(
          (RegExpMatch match) =>
              '$path:${_lineOf(match.start)}  ${_snippet(match.start)}',
        )
        .toList();
  }

  int _lineOf(int offset) =>
      '\n'.allMatches(_content.substring(0, offset)).length + 1;

  String _snippet(int offset) {
    final String rest = _content.substring(offset);
    final int end = rest.indexOf('\n');
    return (end == -1 ? rest : rest.substring(0, end)).trim();
  }
}

/// Every Dart file under [path], except generated output, which is produced
/// from a contract and is not hand-maintained.
List<_Source> _dartSourcesUnder(String path) {
  return Directory(path)
      .listSync(recursive: true)
      .whereType<File>()
      .where((File file) => file.path.endsWith('.dart'))
      .where((File file) => !file.path.contains('/generated/'))
      .map((File file) => _Source(file.path, _stripCommentLines(file)))
      .toList();
}

String _stripCommentLines(File file) {
  return file
      .readAsLinesSync()
      .map((String line) {
        final String trimmed = line.trim();
        return trimmed.startsWith('//') ? '' : line;
      })
      .join('\n');
}
