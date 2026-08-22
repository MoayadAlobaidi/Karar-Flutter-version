// NUMERAL RULES, ENFORCED.
//
// Every user-visible number goes through `KararFormatter`. The formatter is
// easy to reach for a value the client formats itself; the hole is the other
// path, where the number is handed to a generated `AppLocalizations` method and
// formatted by `intl` inside it, out of the formatter's reach. That code is
// generated, so it cannot be fixed in place — the call site has to route the
// finished message back through `KararFormatter.applyNumerals`, and a call site
// obligation is exactly the kind of thing that is honoured on the day it is
// written and forgotten a month later.
//
// Rules enforced here:
//   1. Every call to a generated message with a numeric ICU placeholder is
//      wrapped in `applyNumerals`.
//   2. `NumberFormat` and `DateFormat` are constructed only inside the
//      formatter, so there is one place where the numeral system is applied.
//   3. `toStringAsFixed` is used nowhere.
//
// WHAT THESE RULES DO NOT CATCH, stated plainly so nobody mistakes a green run
// for total coverage:
//
//   * a number rendered by string interpolation or `toString()` — deciding
//     whether an arbitrary interpolated expression is a user-visible quantity
//     or an internal identifier is not something a source scan can do, and a
//     check that guessed would fire on correlation identifiers, wire values and
//     diagnostic labels until somebody deleted it. `flutter analyze` and review
//     cover that; the sweep that produced these rules found no instance;
//   * digits written into an ARB message as literal text rather than as a
//     placeholder. Rule 1 reads the placeholder types, so a hardcoded digit in
//     translated copy is invisible to it;
//   * whether the wrapping formatter is the right one. `applyNumerals` has to
//     be called on a formatter bound to the locale in the widget tree, and only
//     the tests in `test/l10n/numeral_system_test.dart` check that.
//
// Rule 1 derives its message list from the ARB rather than hardcoding one, so a
// message added tomorrow is covered without anyone remembering this file.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Placeholder types whose rendered form is produced by a number formatter.
const Set<String> numericPlaceholderTypes = <String>{'int', 'num', 'double'};

/// The call every numeric message must be routed through.
const String numeralWrapper = 'applyNumerals(';

/// The one file allowed to build an `intl` formatter.
const String formatterPath = 'lib/shared/formatting/karar_formatter.dart';

void main() {
  final List<_Source> sources = _handWrittenSources();
  final Set<String> numericMessages = _numericMessageKeys();

  test('the scan found source and messages to check', () {
    expect(sources, isNotEmpty, reason: 'these tests must run from apps/mobile');
    expect(
      numericMessages,
      isNotEmpty,
      reason:
          'No ARB message declares an int, num or double placeholder. Either '
          'the catalogue changed shape or this scan stopped reading it, and '
          'rule 1 is now enforcing nothing.',
    );
  });

  test('every numeric message is routed through the formatter', () {
    final List<String> offenders = <String>[];
    int checked = 0;

    for (final _Source source in sources) {
      for (final String message in numericMessages) {
        final RegExp call = RegExp('\\.${RegExp.escape(message)}\\s*\\(');
        for (final RegExpMatch match in call.allMatches(source.content)) {
          checked++;
          if (_isWrapped(source.content, match.start)) {
            continue;
          }
          offenders.add('${source.path}:${source.lineOf(match.start)}  $message');
        }
      }
    }

    expect(
      checked,
      greaterThan(0),
      reason:
          'No call to a numeric message was found anywhere in lib. The rule is '
          'matching nothing, which is not the same as passing.',
    );
    expect(
      offenders,
      isEmpty,
      reason:
          'These calls format their number with intl inside the generated '
          'method, which never consults KararNumeralSystem. Wrap each one in '
          'KararFormatter.applyNumerals so its digits match the dates and '
          'amounts beside it:\n${offenders.join('\n')}',
    );
  });

  test('intl formatters are built in one place', () {
    final RegExp construction = RegExp(r'\b(NumberFormat|DateFormat)\s*[.(]');
    final List<String> offenders = <String>[];

    for (final _Source source in sources) {
      if (source.path == formatterPath) {
        continue;
      }
      for (final RegExpMatch match in construction.allMatches(source.content)) {
        offenders.add(
          '${source.path}:${source.lineOf(match.start)}  ${match.group(1)}',
        );
      }
    }

    expect(
      offenders,
      isEmpty,
      reason:
          'A second formatter is a second numeral system. Add the case to '
          '$formatterPath instead:\n${offenders.join('\n')}',
    );
  });

  test('no number is rendered with toStringAsFixed', () {
    final RegExp fixed = RegExp(r'\btoStringAsFixed\s*\(');
    final List<String> offenders = <String>[];

    for (final _Source source in sources) {
      for (final RegExpMatch match in fixed.allMatches(source.content)) {
        offenders.add('${source.path}:${source.lineOf(match.start)}');
      }
    }

    expect(
      offenders,
      isEmpty,
      reason:
          'toStringAsFixed exists only to turn a number into display text, and '
          'it does it with the wrong digits, the wrong separator and a double. '
          'Use KararFormatter.scaled or KararFormatter.money:\n'
          '${offenders.join('\n')}',
    );
  });
}

/// Whether the call beginning at [callStart] — the `.` of `.message(` — sits
/// directly inside [numeralWrapper].
///
/// Walks back over the receiver expression (`l10n`, `context.l10n`, and any
/// line breaks the formatter inserted into it) and then asks what encloses it.
/// Anything other than the wrapper's own open parenthesis, including another
/// call that happens to be nested inside one, counts as unwrapped: the point is
/// that the message is handed straight to the formatter, not that the wrapper
/// appears somewhere nearby.
bool _isWrapped(String content, int callStart) {
  int index = callStart;
  while (index > 0) {
    final int before = index;
    while (index > 0 && _isReceiverCharacter(content.codeUnitAt(index - 1))) {
      index--;
    }
    while (index > 0 && _isWhitespace(content.codeUnitAt(index - 1))) {
      index--;
    }
    if (index == before) {
      break;
    }
  }
  return content.substring(0, index).endsWith(numeralWrapper);
}

bool _isReceiverCharacter(int unit) {
  return (unit >= 0x30 && unit <= 0x39) || // 0-9
      (unit >= 0x41 && unit <= 0x5A) || // A-Z
      (unit >= 0x61 && unit <= 0x7A) || // a-z
      unit == 0x5F || // _
      unit == 0x24 || // $
      unit == 0x2E || // .
      unit == 0x21; // !
}

bool _isWhitespace(int unit) =>
    unit == 0x20 || unit == 0x09 || unit == 0x0A || unit == 0x0D;

/// Message keys whose ICU placeholders are rendered by a number formatter.
///
/// Read from the English catalogue, which is the source the generator uses for
/// placeholder metadata; the translations carry the same keys and types.
Set<String> _numericMessageKeys() {
  final File arb = File('lib/l10n/arb/app_en.arb');
  if (!arb.existsSync()) {
    // Reported as an empty message set by the first test, which explains what
    // silently disabling rule 1 would mean.
    return const <String>{};
  }

  final Map<String, dynamic> catalogue =
      jsonDecode(arb.readAsStringSync()) as Map<String, dynamic>;
  final Set<String> keys = <String>{};

  for (final MapEntry<String, dynamic> entry in catalogue.entries) {
    if (!entry.key.startsWith('@') || entry.value is! Map<String, dynamic>) {
      continue;
    }
    final Object? placeholders =
        (entry.value as Map<String, dynamic>)['placeholders'];
    if (placeholders is! Map<String, dynamic>) {
      continue;
    }
    final bool hasNumber = placeholders.values.any(
      (Object? placeholder) =>
          placeholder is Map<String, dynamic> &&
          numericPlaceholderTypes.contains(placeholder['type']),
    );
    if (hasNumber) {
      keys.add(entry.key.substring(1));
    }
  }
  return keys;
}

class _Source {
  _Source(this.path, this.content);

  final String path;

  /// File content with comment-only lines blanked, so prose explaining a rule
  /// cannot trip it, while line numbers stay accurate.
  final String content;

  int lineOf(int offset) =>
      '\n'.allMatches(content.substring(0, offset)).length + 1;
}

/// Every Dart file under `lib`, except generated output. Generated code is
/// produced from a contract and is the thing these rules work around, not a
/// place they can be applied.
List<_Source> _handWrittenSources() {
  final Directory root = Directory('lib');
  if (!root.existsSync()) {
    return const <_Source>[];
  }
  return root
      .listSync(recursive: true)
      .whereType<File>()
      .map((File file) => file.path.replaceAll(r'\', '/'))
      .where((String path) => path.endsWith('.dart'))
      .where((String path) => !path.contains('/generated/'))
      .map((String path) => _Source(path, _withoutCommentLines(File(path))))
      .toList();
}

String _withoutCommentLines(File file) {
  return file
      .readAsLinesSync()
      .map((String line) => line.trimLeft().startsWith('//') ? '' : line)
      .join('\n');
}
