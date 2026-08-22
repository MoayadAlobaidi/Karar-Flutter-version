// ONE READING OF THE CONTRACT, ENFORCED.
//
// The financial surface used to have two independent readings of
// `openapi.yaml`: the generated client and DTOs, and a hand-written gateway
// with hand-written decoders and hand-written enumeration tables beside them.
// Two readings of one contract do not fail when they disagree — they diverge
// quietly, and the first person to notice is the one whose money is shown
// wrong.
//
// The second reading is gone. This file is what stops it coming back, and it
// is executable rather than advisory: it reads the production source tree and
// fails the build on each of the three shapes the removal was about.
//
//   1. A HARD-CODED `/financial/...` PATH. The contract states every path
//      once and the generator emits it once. A path spelled out anywhere else
//      is a second spelling that no drift check compares against.
//
//   2. A HAND-WRITTEN RESPONSE DECODER. A function that reads a JSON map by
//      string key is a decoder standing parallel to a generated DTO for the
//      same schema. The DTO is regenerated when the contract changes; the
//      hand-written one is not, and nothing says so.
//
//   3. A DUPLICATED ENUMERATION TABLE. A `Map` from wire strings to a domain
//      enumeration, or back, reproduces what the generated enum already does.
//      When the contract gains a member, the generated enum gains it and the
//      table does not — and a table lookup with a fallback compiles perfectly
//      while answering "unrecognised" forever.
//
// The rules are functions over a directory, so the SELF-TEST at the bottom can
// seed each of the three shapes into a temporary tree and prove the scan
// actually fires on it. A guard nobody has seen fail is a guard nobody knows
// works.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../support/financial_roots.dart';

/// The production source this guard reads.
const String productionRoot = 'lib';

/// The financial features. Rules 2 and 3 are about how the FINANCIAL contract
/// is read, so they are scoped here; rule 1 covers the whole of production.
/// Every financial feature folder, from the one shared list.
const List<String> financialRoots = financialFeatureRoots;

/// The generated client and DTOs. This is the ONE reading of the contract, so
/// it is the one place a contract path is spelled out.
const String generatedRoot = 'lib/core/networking/generated';

/// Files permitted to hold a `/financial/...` string literal, each with the
/// reason it is not an API path.
///
/// The list is deliberately a map rather than a set: an entry has to be
/// justified in the same edit that adds it. There is NO raw-body upload
/// adapter on this list — the generated client covers every financial
/// operation this client calls, so no transport adapter of any kind survives.
const Map<String, String> financialPathAllowlist = <String, String>{
  'lib/features/financial_accounts/presentation/financial_routes.dart':
      'In-app NAVIGATION routes, which are go_router locations rather than '
      'API paths. They resemble the contract paths because the product is '
      'organised the way the contract is. The companion assertion below '
      'proves this file can issue no request, so it cannot become a place '
      'to hide one.',
};

/// One thing the scan objects to.
final class ContractReadingFinding {
  ContractReadingFinding({
    required this.rule,
    required this.path,
    required this.line,
    required this.evidence,
  });

  final String rule;
  final String path;
  final int line;
  final String evidence;

  @override
  String toString() => '[$rule] $path:$line  $evidence';
}

/// Rule 1: a contract path spelled out anywhere but the generated client.
///
/// Matches the literal opening of a financial path, so a path assembled by
/// concatenation from `'/financial'` is caught alongside a whole one.
final RegExp hardCodedFinancialPath = RegExp('[\'"]/financial(?=[/\'"])');

/// Rule 2: the shapes a hand-written response decoder is made of.
final List<RegExp> handWrittenResponseDecoding = <RegExp>[
  // The transport's decoded-body alias, and the type it aliases.
  RegExp(r'\bJsonMap\b'),
  RegExp(r'Map<\s*String\s*,\s*Object\?\s*>'),
  // Reading a raw body. The generated client is the only caller of these.
  RegExp(r'\brequireObject\s*\('),
  RegExp(r'\brequireArray\s*\('),
];

/// Rule 3: a table that only reproduces generated enumeration decoding.
final List<RegExp> duplicatedVocabularyTable = <RegExp>[
  // `Map<String, AccountType>` and `Map<AccountType, String>`, but not
  // `Map<String, String>` or any other map of ordinary values.
  RegExp(r'Map<\s*String\s*,\s*(?!' + _scalarTypeAlternation + r'\b)[A-Z]\w*\s*>'),
  RegExp(r'Map<\s*(?!' + _scalarTypeAlternation + r'\b)[A-Z]\w*\s*,\s*String\s*>'),
  // A wire value used as a map key, which is what such a table is made of,
  // whatever it happens to be typed as.
  RegExp('[\'"][A-Z][A-Z0-9_]{2,}[\'"]\\s*:'),
];

/// Type names that are values rather than vocabularies, so a map keyed on or
/// valued by one is not an enumeration table.
const String _scalarTypeAlternation =
    'String|Object|Function|List|Set|Map|Iterable|DateTime|Duration|Uri';

/// Every Dart file under [root], with comment-only lines blanked so prose
/// explaining a rule cannot trip the rule it explains.
List<ScannedSource> sourcesUnder(String root) {
  final directory = Directory(root);
  if (!directory.existsSync()) {
    return const <ScannedSource>[];
  }
  final found = <ScannedSource>[];
  for (final file in directory.listSync(recursive: true).whereType<File>()) {
    final path = file.path.replaceAll(r'\', '/');
    if (!path.endsWith('.dart')) {
      continue;
    }
    found.add(ScannedSource(path, file.readAsLinesSync()));
  }
  found.sort((ScannedSource a, ScannedSource b) => a.path.compareTo(b.path));
  return found;
}

/// Rule 1 over one tree.
List<ContractReadingFinding> findHardCodedFinancialPaths(
  String root, {
  Map<String, String> allowlist = financialPathAllowlist,
  String excluding = generatedRoot,
}) {
  final findings = <ContractReadingFinding>[];
  for (final source in sourcesUnder(root)) {
    if (source.path.startsWith(excluding) || allowlist.containsKey(source.path)) {
      continue;
    }
    findings.addAll(source.matches('hard-coded financial path', <RegExp>[hardCodedFinancialPath]));
  }
  return findings;
}

/// Rule 2 over one tree.
List<ContractReadingFinding> findHandWrittenResponseDecoders(String root) {
  final findings = <ContractReadingFinding>[];
  for (final source in sourcesUnder(root)) {
    findings.addAll(source.matches('hand-written response decoder', handWrittenResponseDecoding));
  }
  return findings;
}

/// Rule 3 over one tree.
List<ContractReadingFinding> findDuplicatedVocabularyTables(String root) {
  final findings = <ContractReadingFinding>[];
  for (final source in sourcesUnder(root)) {
    findings.addAll(source.matches('duplicated vocabulary table', duplicatedVocabularyTable));
  }
  return findings;
}

void main() {
  test('the scan reads production source', () {
    // A scan that found nothing would pass every rule below without checking
    // anything, which is the failure mode these guards exist to avoid.
    expect(sourcesUnder(productionRoot), isNotEmpty);
    expect(sourcesUnder(generatedRoot), isNotEmpty);
    for (final root in financialRoots) {
      expect(sourcesUnder(root), isNotEmpty, reason: '$root has no Dart source');
    }
  });

  group('one reading of the contract', () {
    test('no contract path is spelled out outside the generated client', () {
      final findings = findHardCodedFinancialPaths(productionRoot);
      expect(
        findings,
        isEmpty,
        reason:
            'the contract states each path once and the generator emits it '
            'once; a second spelling is a second reading:\n'
            '${findings.join('\n')}',
      );
    });

    test('every allowlisted file is justified and can issue no request', () {
      for (final entry in financialPathAllowlist.entries) {
        final file = File(entry.key);
        expect(
          file.existsSync(),
          isTrue,
          reason:
              '${entry.key} is allowlisted but does not exist; a stale '
              'exemption is a hole nobody is watching',
        );
        expect(
          entry.value.length,
          greaterThan(40),
          reason: '${entry.key} is exempted without a stated reason',
        );
        final body = file.readAsStringSync();
        for (final needle in <String>[
          'ApiRequest',
          'ApiTransport',
          'KararApiClient',
          'HttpMethod',
        ]) {
          expect(
            body.contains(needle),
            isFalse,
            reason:
                '${entry.key} is exempted from the path rule because it '
                'issues no request, and it names $needle',
          );
        }
      }
    });

    test('no financial response is decoded by hand', () {
      final findings = <ContractReadingFinding>[
        for (final root in financialRoots) ...findHandWrittenResponseDecoders(root),
      ];
      expect(
        findings,
        isEmpty,
        reason:
            'a generated DTO already decodes this schema; a second decoder '
            'is not regenerated when the contract changes:\n'
            '${findings.join('\n')}',
      );
    });

    test('no vocabulary is tabulated a second time', () {
      final findings = <ContractReadingFinding>[
        for (final root in financialRoots) ...findDuplicatedVocabularyTables(root),
      ];
      expect(
        findings,
        isEmpty,
        reason:
            'the generated enumeration already maps every wire value; a '
            'table beside it silently stops covering the vocabulary the day a '
            'member is added:\n${findings.join('\n')}',
      );
    });
  });

  group('the guard itself fires', () {
    // Each rule is seeded with the exact shape it exists to catch, in a
    // throwaway tree, and the seed is removed afterwards. Without this, a
    // regex that matched nothing would look identical to a clean source tree.
    late Directory seeded;

    setUp(() {
      seeded = Directory.systemTemp.createTempSync('karar_contract_guard');
    });

    tearDown(() {
      if (seeded.existsSync()) {
        seeded.deleteSync(recursive: true);
      }
    });

    void seed(String name, String source) {
      File('${seeded.path}/$name').writeAsStringSync(source);
    }

    test('a hard-coded financial path is caught', () {
      seed('offending_gateway.dart', '''
final class FinancialPaths {
  static const String accounts = '/financial/accounts';
  static String account(String id) => '\$accounts/\$id';
}
''');
      final findings = findHardCodedFinancialPaths(
        seeded.path,
        allowlist: const <String, String>{},
        excluding: 'nothing-is-excluded',
      );
      expect(findings, hasLength(1));
      expect(findings.single.rule, 'hard-coded financial path');
      expect(findings.single.evidence, contains('/financial/accounts'));
    });

    test('a hand-written response decoder is caught', () {
      seed('offending_decoder.dart', '''
FinancialAccount decodeAccount(Map<String, Object?> json) => FinancialAccount(
      accountId: json['accountId']! as String,
    );
''');
      final findings = findHandWrittenResponseDecoders(seeded.path);
      expect(findings, isNotEmpty);
      expect(findings.first.rule, 'hand-written response decoder');
      expect(findings.first.path, endsWith('offending_decoder.dart'));
    });

    test('a duplicated vocabulary table is caught', () {
      seed('offending_vocabulary.dart', '''
const Map<String, AccountType> accountTypeByWire = <String, AccountType>{
  'CURRENT': AccountType.current,
  'SAVINGS': AccountType.savings,
};
''');
      final findings = findDuplicatedVocabularyTables(seeded.path);
      expect(findings, isNotEmpty);
      expect(findings.first.rule, 'duplicated vocabulary table');
      expect(findings.first.path, endsWith('offending_vocabulary.dart'));
    });

    test('a clean tree produces nothing, so the rules are not always-on', () {
      // The opposite failure: a guard that fires on everything is as useless
      // as one that fires on nothing, and would have to be deleted the first
      // time somebody wrote ordinary code.
      seed('innocent.dart', '''
import 'package:meta/meta.dart';

/// A perfectly ordinary mapper over a generated DTO.
@immutable
final class Ordinary {
  const Ordinary(this.label, this.byCode);

  final String label;
  final Map<String, String> byCode;

  String describe() => label.trim();
}
''');
      expect(
        findHardCodedFinancialPaths(
          seeded.path,
          allowlist: const <String, String>{},
          excluding: 'nothing-is-excluded',
        ),
        isEmpty,
      );
      expect(findHandWrittenResponseDecoders(seeded.path), isEmpty);
      expect(findDuplicatedVocabularyTables(seeded.path), isEmpty);
    });

    test('a comment explaining a rule does not trip it', () {
      seed('commented.dart', '''
// The old gateway hard-coded '/financial/accounts' and kept a
// Map<String, AccountType> beside it. Both are gone.
const int answer = 1;
''');
      expect(
        findHardCodedFinancialPaths(
          seeded.path,
          allowlist: const <String, String>{},
          excluding: 'nothing-is-excluded',
        ),
        isEmpty,
      );
      expect(findDuplicatedVocabularyTables(seeded.path), isEmpty);
    });
  });
}

/// One production file, ready to be matched against the rules.
final class ScannedSource {
  ScannedSource(this.path, List<String> lines)
    : lines = <String>[for (final line in lines) line.trimLeft().startsWith('//') ? '' : line];

  final String path;

  /// Content with comment-only lines blanked.
  final List<String> lines;

  List<ContractReadingFinding> matches(String rule, List<RegExp> patterns) {
    final findings = <ContractReadingFinding>[];
    for (var index = 0; index < lines.length; index++) {
      for (final pattern in patterns) {
        final match = pattern.firstMatch(lines[index]);
        if (match != null) {
          findings.add(
            ContractReadingFinding(
              rule: rule,
              path: path,
              line: index + 1,
              evidence: lines[index].trim(),
            ),
          );
          break;
        }
      }
    }
    return findings;
  }
}
