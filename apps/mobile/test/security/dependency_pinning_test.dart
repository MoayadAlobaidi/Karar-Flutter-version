// DEPENDENCY PINNING IS A SUPPLY-CHAIN CONTROL, SO IT NEEDS A TEST.
//
// The pubspec states that every direct non-SDK dependency is pinned to an exact
// version. Until this file existed, nothing enforced it: the architecture
// layer-rules test only checked that a `dependencies:` section and a lockfile
// were present, which a caret range satisfies just as well as an exact pin. The
// policy was therefore documentation, and a security-critical plugin had drifted
// to `^3.0.2` without anything failing.
//
// An exact pin matters here for a specific reason. A range lets a fresh
// resolution pick a version nobody reviewed — and the packages most likely to
// be ranged are the ones that hold credentials, terminate TLS, or host the
// biometric prompt. Committing a lockfile is not a substitute: the lockfile
// only binds a resolution that honours it, which is why CI passes
// `--enforce-lockfile`.
//
// SDK-sourced dependencies (`flutter`, `flutter_test`, `flutter_localizations`)
// carry no version of their own and are exempt by construction.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// A direct dependency and the version expression written against it.
typedef _Declared = MapEntry<String, String>;

/// Parses the direct `dependencies:` and `dev_dependencies:` blocks.
///
/// Deliberately a small hand parser rather than a YAML package: this test must
/// keep working when the dependency set is exactly what is in question, and it
/// only needs two flat blocks of `name: constraint`.
List<_Declared> _directDependencies() {
  final File pubspec = File('pubspec.yaml');
  expect(pubspec.existsSync(), isTrue, reason: 'pubspec.yaml must exist');

  final List<_Declared> declared = <_Declared>[];
  var inBlock = false;
  for (final String rawLine in pubspec.readAsLinesSync()) {
    final String line = rawLine.split('#').first.trimRight();
    if (line.isEmpty) continue;

    // A non-indented, non-comment line ends whatever block we were in.
    if (!line.startsWith(' ')) {
      inBlock = line == 'dependencies:' || line == 'dev_dependencies:';
      continue;
    }
    if (!inBlock) continue;

    // Only two-space-indented entries are direct dependencies; deeper
    // indentation belongs to a nested key such as `sdk:` or `path:`.
    final RegExpMatch? match =
        RegExp(r'^  ([a-z0-9_]+):\s*(.*)$').firstMatch(line);
    if (match == null) continue;
    declared.add(MapEntry<String, String>(match.group(1)!, match.group(2)!.trim()));
  }
  return declared;
}

void main() {
  group('every direct dependency is pinned to an exact version', () {
    late List<_Declared> declared;

    setUpAll(() {
      declared = _directDependencies();
    });

    test('the pubspec declares direct dependencies at all', () {
      // Guards against the parser silently matching nothing, which would make
      // every assertion below vacuously true.
      expect(
        declared.length,
        greaterThan(5),
        reason: 'the parser found almost no direct dependencies, which means it '
            'is broken rather than that the pubspec is clean',
      );
    });

    test('no direct dependency uses a range, a wildcard, or "any"', () {
      final List<String> ranged = <String>[];
      for (final _Declared entry in declared) {
        final String constraint = entry.value;
        // An empty value introduces a nested block (`sdk: flutter`), which the
        // next test covers.
        if (constraint.isEmpty) continue;
        final bool isExact = RegExp(r'^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$')
            .hasMatch(constraint);
        if (!isExact) ranged.add('${entry.key}: $constraint');
      }
      expect(
        ranged,
        isEmpty,
        reason: 'these direct dependencies are not exactly pinned, so a fresh '
            'resolution could pick a version nobody reviewed:\n'
            '${ranged.join('\n')}\n'
            'Pin them, or record a technical reason beside the entry and amend '
            'this test deliberately.',
      );
    });

    test('the security-critical dependencies are pinned by name', () {
      // Named explicitly so that removing one from the pubspec is also a
      // failure, not a silent pass by absence.
      const List<String> critical = <String>[
        'flutter_secure_storage',
        'local_auth',
        'dio',
        'go_router',
        'flutter_riverpod',
      ];
      final Map<String, String> byName = <String, String>{
        for (final _Declared entry in declared) entry.key: entry.value,
      };
      for (final String name in critical) {
        expect(
          byName.keys,
          contains(name),
          reason: '$name is a security-relevant dependency this test tracks',
        );
        expect(
          byName[name],
          matches(RegExp(r'^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$')),
          reason: '$name holds credentials, terminates TLS, or hosts the '
              'biometric prompt; it must never float',
        );
      }
    });

    test('the committed lockfile records hosted sources with checksums', () {
      final File lockfile = File('pubspec.lock');
      expect(
        lockfile.existsSync(),
        isTrue,
        reason: 'the lockfile is what --enforce-lockfile binds a resolution to',
      );
      final String contents = lockfile.readAsStringSync();
      expect(contents, contains('sha256:'));
      expect(contents, contains('url: "https://pub.dev"'));
    });
  });
}
