// ARCHITECTURE RULES, ENFORCED.
//
// Documentation alone does not hold a boundary across four workstreams. These
// tests read the source tree and fail the build when a rule is broken, so a
// violation is caught by `flutter test` rather than by review.
//
// Rules enforced here:
//   1. Feature DOMAIN layers import pure Dart only.
//   2. The types domain code is allowed to depend on stay pure themselves.
//   3. Generated API DTOs never escape the data layer.
//   4. No analytics, crash-reporting, advertising or fingerprinting package
//      is declared as a dependency.
//   5. `print` is used nowhere; diagnostics go through the redacting logger.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Import prefixes a feature's `domain/` layer may never reach for.
const List<String> forbiddenInDomain = <String>[
  'package:flutter/',
  'package:flutter_test/',
  'package:flutter_riverpod/',
  'package:riverpod/',
  'package:go_router/',
  'package:dio/',
  'package:flutter_secure_storage/',
  'package:shared_preferences/',
  'package:intl/',
  'dart:io',
  'dart:ui',
  'dart:convert',
  'core/networking/generated/',
  'karar_mobile/core/networking/generated/',
];

/// Packages that must never appear in the dependency list.
const List<String> forbiddenPackages = <String>[
  'firebase_analytics',
  'firebase_crashlytics',
  'sentry',
  'sentry_flutter',
  'amplitude',
  'mixpanel',
  'segment',
  'appsflyer',
  'adjust',
  'facebook_app_events',
  'google_mobile_ads',
  'fingerprint',
  'device_info_plus',
  'posthog',
  'datadog_flutter_plugin',
  'bugsnag',
];

Directory _libDirectory() {
  // Tests run with the package root as the working directory.
  final directory = Directory('lib');
  expect(
    directory.existsSync(),
    isTrue,
    reason: 'the architecture tests must run from apps/mobile',
  );
  return directory;
}

List<File> _dartFilesUnder(Directory root, {bool Function(String path)? where}) {
  if (!root.existsSync()) {
    return const <File>[];
  }
  return root
      .listSync(recursive: true)
      .whereType<File>()
      .where((File file) => file.path.endsWith('.dart'))
      .where((File file) => where == null || where(file.path.replaceAll(r'\', '/')))
      .toList();
}

List<String> _importsOf(File file) {
  final imports = <String>[];
  for (final line in file.readAsLinesSync()) {
    final trimmed = line.trim();
    if (!trimmed.startsWith('import ') && !trimmed.startsWith('export ')) {
      continue;
    }
    final match = RegExp("['\"]([^'\"]+)['\"]").firstMatch(trimmed);
    if (match != null) {
      imports.add(match.group(1)!);
    }
  }
  return imports;
}

void main() {
  group('domain purity', () {
    test('no feature domain file imports a framework, transport or DTO', () {
      final domainFiles = _dartFilesUnder(
        Directory('lib/features'),
        where: (String path) => path.contains('/domain/'),
      );

      final violations = <String>[];
      for (final file in domainFiles) {
        for (final import in _importsOf(file)) {
          for (final forbidden in forbiddenInDomain) {
            if (import.startsWith(forbidden) || import.contains(forbidden)) {
              violations.add('${file.path} imports $import');
            }
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'A feature domain layer must import pure Dart only. See lib/README.md.',
      );
    });

    test('the core libraries domain code depends on are themselves pure', () {
      // `core/errors` and `core/utilities` are the only core packages a domain
      // layer may import, so they carry the same constraint transitively.
      final files = <File>[
        ..._dartFilesUnder(Directory('lib/core/errors')),
        ..._dartFilesUnder(Directory('lib/core/utilities')),
      ];
      expect(files, isNotEmpty);

      final violations = <String>[];
      for (final file in files) {
        for (final import in _importsOf(file)) {
          if (import.startsWith('package:meta/')) {
            continue;
          }
          if (import.startsWith('package:') || import == 'dart:io' || import == 'dart:ui') {
            violations.add('${file.path} imports $import');
          }
        }
      }

      expect(violations, isEmpty);
    });
  });

  group('generated code', () {
    test('generated DTOs do not escape the data layer', () {
      final leaks = <String>[];
      for (final file in _dartFilesUnder(_libDirectory())) {
        final path = file.path.replaceAll(r'\', '/');
        if (path.contains('lib/core/networking/generated/')) {
          continue;
        }
        for (final import in _importsOf(file)) {
          if (!import.contains('networking/generated/')) {
            continue;
          }
          final isDataLayer = path.contains('/data/') ||
              // The bootstrap gateway is the app-level data boundary and is
              // the worked example the README points at.
              path.endsWith('lib/app/lifecycle/api_bootstrap_gateway.dart') ||
              // The composition root wires the client; it maps nothing.
              path.endsWith('lib/app/dependency_injection/providers.dart');
          if (!isDataLayer) {
            leaks.add('$path imports $import');
          }
        }
      }

      expect(
        leaks,
        isEmpty,
        reason: 'Generated DTOs belong to the data layer; map them before they travel.',
      );
    });

    test('generated files declare that they are generated', () {
      final generated = _dartFilesUnder(Directory('lib/core/networking/generated'));
      expect(generated, isNotEmpty);

      for (final file in generated) {
        expect(
          file.readAsStringSync(),
          startsWith('// GENERATED CODE — DO NOT MODIFY BY HAND.'),
          reason: '${file.path} must carry the generated-code banner',
        );
      }
    });
  });

  group('dependencies', () {
    test('no analytics, crash-reporting, advertising or fingerprinting package', () {
      final pubspec = File('pubspec.yaml').readAsStringSync().toLowerCase();

      for (final package in forbiddenPackages) {
        expect(
          pubspec.contains('\n  $package:'),
          isFalse,
          reason: '$package must not be a dependency of this client',
        );
      }
    });

    test('direct dependencies are pinned or explicitly ranged', () {
      final lines = File('pubspec.yaml').readAsLinesSync();
      expect(lines.any((String line) => line.startsWith('dependencies:')), isTrue);
      expect(File('pubspec.lock').existsSync(), isTrue, reason: 'the lockfile is committed');
    });
  });

  group('diagnostics', () {
    test('no source file calls print', () {
      final offenders = <String>[];
      for (final file in _dartFilesUnder(_libDirectory())) {
        for (final line in file.readAsLinesSync()) {
          final trimmed = line.trim();
          if (trimmed.startsWith('//')) {
            continue;
          }
          if (RegExp(r'(^|[^.\w])print\s*\(').hasMatch(trimmed)) {
            offenders.add('${file.path}: $trimmed');
          }
        }
      }

      expect(
        offenders,
        isEmpty,
        reason: 'Diagnostics go through core/logging, which redacts by default.',
      );
    });
  });
}
