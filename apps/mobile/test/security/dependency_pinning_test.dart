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
    final RegExpMatch? match = RegExp(r'^  ([a-z0-9_]+):\s*(.*)$').firstMatch(line);
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
        reason:
            'the parser found almost no direct dependencies, which means it '
            'is broken rather than that the pubspec is clean',
      );
    });

    test('the only nested-block dependencies are SDK-sourced ones', () {
      // An empty constraint means a nested block follows. `sdk: flutter` is
      // legitimate and carries no version. `git:`, `path:` and `hosted:` also
      // parse to an empty constraint — and those bypass the pinning rule
      // entirely, because the next test skips empty constraints. Without this
      // assertion, adding `flutter_secure_storage:` with a `git:` block below
      // it would leave a suite named "every direct dependency is pinned"
      // passing while the package floated on a branch.
      final List<String> nested = <String>[
        for (final _Declared entry in declared)
          if (entry.value.isEmpty) entry.key,
      ];
      const Set<String> sdkSourced = <String>{'flutter', 'flutter_test', 'flutter_localizations'};
      final Set<String> offending = nested.toSet().difference(sdkSourced);
      expect(
        offending,
        isEmpty,
        reason:
            'these direct dependencies use a nested block rather than an '
            'inline version, which hides the constraint from the check below: '
            '${offending.join(', ')}. A git: or path: source is not a reviewed '
            'release at all; a hosted: block may be pinned but is not visible '
            'here. Either way it is a deliberate decision, so state the reason '
            'beside the entry and amend this test.',
      );
    });

    test('no direct dependency uses a range, a wildcard, or "any"', () {
      final List<String> ranged = <String>[];
      for (final _Declared entry in declared) {
        final String constraint = entry.value;
        // An empty value introduces a nested block, which the test above
        // constrains to SDK-sourced packages only.
        if (constraint.isEmpty) continue;
        final bool isExact = RegExp(r'^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$').hasMatch(constraint);
        if (!isExact) ranged.add('${entry.key}: $constraint');
      }
      expect(
        ranged,
        isEmpty,
        reason:
            'these direct dependencies are not exactly pinned, so a fresh '
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
          reason:
              '$name holds credentials, terminates TLS, or hosts the '
              'biometric prompt; it must never float',
        );
      }
    });

    test('no dependency_overrides section exists', () {
      // An override silently replaces a resolved version for the whole graph,
      // including the pinned direct set above. It is the one construct that
      // makes every other assertion in this file untrue without editing any
      // line they read.
      final List<String> lines = File('pubspec.yaml').readAsLinesSync();
      expect(
        lines.where((String line) => line.trimRight() == 'dependency_overrides:'),
        isEmpty,
        reason:
            'dependency_overrides bypasses the pins above. If one is ever '
            'genuinely needed, record why beside it and amend this test '
            'deliberately.',
      );
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

    test('every hosted package comes from pub.dev, and only from pub.dev', () {
      // THIS IS AN EXCLUSIVITY CHECK, AND THE TEST ABOVE IS NOT.
      //
      // `contains('url: "https://pub.dev"')` passes as long as ONE entry names
      // pub.dev. An audit proved the gap by redirecting a single package to a
      // private mirror: 105 entries still said pub.dev, one did not, and the
      // whole suite stayed green. `--enforce-lockfile` would then faithfully
      // enforce the mirror, because the lockfile is the thing it trusts — a
      // substituted dependency would be pinned, checksummed, reproducible, and
      // not from the source anybody reviewed.
      final List<String> lines = File('pubspec.lock').readAsLinesSync();

      final List<String> foreign = <String>[];
      var hostedUrls = 0;
      for (final String rawLine in lines) {
        final String line = rawLine.trim();
        if (!line.startsWith('url:')) continue;
        hostedUrls++;
        final String url = line.substring('url:'.length).trim().replaceAll('"', '');
        if (url != 'https://pub.dev') foreign.add(url);
      }

      // A lockfile with no `url:` lines at all would make the loop vacuous.
      expect(
        hostedUrls,
        greaterThan(50),
        reason:
            'almost no hosted source was found in the lockfile, which means '
            'this test is parsing nothing rather than that the lockfile is clean',
      );
      expect(
        foreign.toSet(),
        isEmpty,
        reason:
            'these hosted sources are not pub.dev:\n${foreign.toSet().join('\n')}\n'
            'A package resolved from another host is reviewed by nobody here, '
            'and the lockfile makes it reproducible rather than making it safe.',
      );
    });

    test('every hosted package carries a checksum', () {
      // A `sha256:` somewhere is not the same as one on every package. An entry
      // without a digest is an entry whose bytes nothing pins.
      final List<String> lines = File('pubspec.lock').readAsLinesSync();
      final int hosted = lines.where((String line) => line.trim() == 'source: hosted').length;
      final int digests = lines.where((String line) => line.trim().startsWith('sha256:')).length;
      expect(hosted, greaterThan(50), reason: 'the lockfile was not parsed');
      expect(
        digests,
        hosted,
        reason:
            'there are $hosted hosted packages but $digests checksums. '
            'Every hosted package must pin its bytes, not most of them.',
      );
    });
  });
}
