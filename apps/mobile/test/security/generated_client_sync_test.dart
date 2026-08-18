// THE COMMITTED API CLIENT MATCHES THE GENERATOR THAT PRODUCED IT.
//
// DIVISION OF LABOUR — read this before adding to either side.
//
//   CI runs the authoritative check:
//       cd apps/mobile && dart run tool/generate_api_client.dart --check
//   It regenerates from the OpenAPI contract in memory and exits non-zero if
//   any byte differs. That is the check that catches CONTRACT drift, and it is
//   the one that must stay in the pipeline.
//
//   This suite covers what that check cannot: it runs in-process, so it cannot
//   invoke the generator (a `flutter test` isolate has no Dart executable to
//   spawn), and it does not read the contract at all. What it does assert is
//   that the committed output is internally consistent and carries the
//   provenance the drift check depends on — that the files exist, are marked
//   generated, agree with each other on which contract and which generator
//   version produced them, and record the generator version currently declared
//   in the tool.
//
//   The failure this catches on its own: someone bumps `generatorVersion`, or
//   hand-edits a generated file, without regenerating. The header stops
//   matching and this fails immediately, in the required `mobile` check.
import 'package:flutter_test/flutter_test.dart';

import 'support/source_tree.dart';

const List<String> _generatedFiles = <String>[
  'lib/core/networking/generated/models.dart',
  'lib/core/networking/generated/karar_api_client.dart',
];

/// Reads a `// Label: value` header field from a generated file.
String? _headerField(String contents, String label) =>
    RegExp('^//\\s+$label:\\s+(.+)\$', multiLine: true)
        .firstMatch(contents)
        ?.group(1)
        ?.trim();

void main() {
  group('the generated API client is in sync', () {
    late Map<String, String> generated;

    setUpAll(() {
      generated = <String, String>{
        for (final path in _generatedFiles) path: readRequiredFile(path),
      };
    });

    test('every generated file is marked as generated', () {
      for (final entry in generated.entries) {
        expect(
          entry.value,
          startsWith('// GENERATED CODE — DO NOT MODIFY BY HAND.'),
          reason: '${entry.key} must announce that it is generated, so a hand edit is '
              'obviously wrong to the next reader',
        );
      }
    });

    test('the generator version recorded matches the tool that is committed', () {
      final tool = readRequiredFile('tool/generate_api_client.dart');
      final declared = RegExp(r"""const String generatorVersion = '([^']+)'""")
          .firstMatch(tool)
          ?.group(1);
      expect(
        declared,
        isNotNull,
        reason: 'the generator must declare its version so output is traceable',
      );

      for (final entry in generated.entries) {
        final recorded = _headerField(entry.value, 'Generator');
        expect(
          recorded,
          'tool/generate_api_client.dart $declared',
          reason: '${entry.key} was produced by a different generator version than the '
              'one committed. Regenerate with: '
              'dart run tool/generate_api_client.dart',
        );
      }
    });

    test('all generated files agree on the contract they came from', () {
      final digests = <String, String?>{
        for (final entry in generated.entries)
          entry.key: _headerField(entry.value, 'Digest'),
      };
      final contracts = <String, String?>{
        for (final entry in generated.entries)
          entry.key: _headerField(entry.value, 'Contract'),
      };

      for (final entry in digests.entries) {
        expect(
          entry.value,
          isNotNull,
          reason: '${entry.key} must record the contract digest it was built from',
        );
      }
      expect(
        digests.values.toSet(),
        hasLength(1),
        reason: 'the generated files were produced from different contract revisions, '
            'which means one of them is stale: $digests',
      );
      expect(
        contracts.values.toSet(),
        hasLength(1),
        reason: 'the generated files name different contract versions: $contracts',
      );
    });

    test('the drift check the pipeline runs is still available', () {
      // If this command is renamed or removed, the CI step silently stops
      // proving anything. The generated files document it, and CI invokes it.
      final tool = readRequiredFile('tool/generate_api_client.dart');
      expect(
        tool,
        contains("arguments.contains('--check')"),
        reason: 'the --check mode is what CI relies on to detect contract drift',
      );
      for (final entry in generated.entries) {
        expect(
          entry.value,
          contains('dart run tool/generate_api_client.dart --check'),
          reason: '${entry.key} must document how drift is detected',
        );
      }
    });

    test('generated code is never hand-edited into carrying a credential', () {
      // The generator emits no literals other than paths and field names. A
      // long opaque literal here would mean either a hand edit or a contract
      // carrying material it should not.
      for (final entry in generated.entries) {
        final literals = RegExp(r"'([A-Za-z0-9+/_-]{40,}={0,2})'")
            .allMatches(stripCodeComments(entry.value))
            .map((RegExpMatch match) => match.group(1)!)
            .toList(growable: false);
        expect(
          literals,
          isEmpty,
          reason: '${entry.key} contains a long opaque literal: $literals',
        );
      }
    });
  });
}
