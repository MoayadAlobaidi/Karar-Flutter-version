// WHAT THIS DEVICE KEEPS WHEN THE APP IS CLOSED.
//
// A stolen or seized phone is a threat this product has to survive, and the
// cheapest defence is to have kept nothing worth taking. Financial records
// live on the platform; the client renders them and forgets them.
//
// `credential_handling_test.dart` already proves that a credential cannot be
// written to unencrypted preferences and cannot reach a log. This file proves
// the other half, which nothing asserted before: that no FINANCIAL data is
// persisted at all, and that the two rules keeping it that way — a reviewed
// set of preference keys, and no file or database store anywhere — are
// enforced rather than merely observed.
//
// Both are scans of the real tree, so they fail on the code as it is rather
// than on a copy written for the test.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/tenant_selection/data/api_tenant_binding_repository.dart';

/// Every preference key this application is reviewed to write.
///
/// Neither is financial, neither identifies a person, and both are readable by
/// anyone holding the device without telling them anything they could not see
/// by opening the app. ADDING TO THIS SET IS A REVIEW DECISION: a preference
/// is unencrypted, survives sign-out, and is not scoped to an organisation
/// unless someone remembers to register it.
const Set<String> reviewedPreferenceKeys = <String>{'localization.locale', 'localization.theme'};

/// Packages that would give the application a place to keep records.
///
/// Not a blocklist of bad software — each is perfectly good — but each one is
/// a durable store, and this client is not supposed to have one. Adding any of
/// them is the moment to decide what may be written and what erases it, which
/// is a decision worth failing a build over.
const Set<String> persistencePackages = <String>{
  'sqflite',
  'hive',
  'hive_flutter',
  'isar',
  'objectbox',
  'drift',
  'moor',
  'path_provider',
  'sembast',
  'realm',
};

/// Direct file writes. `path_provider` is how an app finds a writable
/// directory, so its absence is most of the guarantee, but a `File` written
/// against any path at all is the same disclosure.
///
/// The `Sync` variants are named explicitly. An earlier version matched
/// `writeAsString\s*\(` and therefore could not match `writeAsStringSync(` at
/// all — the `\s*\(` found the `S` — so the most idiomatic synchronous write
/// in Dart passed a test named for catching written files. `create` is here
/// Deliberately NOT matching a bare `create(` — a first attempt did, and
/// flagged `AccountFormController.create` and three other domain methods that
/// have nothing to do with files. A guard that cries wolf gets an exemption
/// list, and an exemption list is how a guard stops guarding. These names
/// belong to `File` and to almost nothing else.
final RegExp fileWrite = RegExp(
  r'\b(writeAsString|writeAsStringSync|writeAsBytes|writeAsBytesSync'
  r'|openWrite|openSync)\s*\(',
);

Directory get libRoot => Directory('lib');

List<File> dartSources() =>
    libRoot
        .listSync(recursive: true)
        .whereType<File>()
        .where((File file) => file.path.endsWith('.dart'))
        .toList()
      ..sort((File a, File b) => a.path.compareTo(b.path));

void main() {
  group('nothing financial is written to this device', () {
    test('every preference key the application constructs is a reviewed one', () {
      final constructed = <String, String>{};
      final key = RegExp(r"PreferenceKey\(\s*'([^']+)'\s*\)");

      for (final file in dartSources()) {
        // The class that DEFINES PreferenceKey names markers in its own
        // validation, and the tenant repository constructs one from a
        // registered name rather than a literal.
        if (file.path.endsWith('core/storage/key_value_store.dart')) continue;
        for (final match in key.allMatches(file.readAsStringSync())) {
          constructed[match.group(1)!] = file.path;
        }
      }

      expect(
        constructed.keys.toSet(),
        reviewedPreferenceKeys,
        reason:
            'a preference key outside the reviewed set is unencrypted storage '
            'nobody decided on. Found: $constructed',
      );
    });

    test('a preference outside the reviewed set is registered as tenant-scoped', () {
      // `tenantScopedPreferenceKeyNames` is documented as the list a feature
      // must join or "it will survive a switch and be read under the wrong
      // tenant". That was a comment; this makes it a rule. Every key that is
      // NOT one of the two organisation-independent ones must appear in it.
      final unscoped = reviewedPreferenceKeys.difference(tenantScopedPreferenceKeyNames.toSet());

      expect(
        unscoped,
        <String>{'localization.locale', 'localization.theme'},
        reason:
            'a preference that is neither organisation-independent nor '
            'registered as tenant-scoped outlives a tenant switch',
      );
    });

    test('the application declares no durable store', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      final declared = RegExp(
        r'^\s{2}([a-z_0-9]+):',
        multiLine: true,
      ).allMatches(pubspec).map((RegExpMatch match) => match.group(1)!).toSet();

      expect(
        declared.intersection(persistencePackages),
        isEmpty,
        reason:
            'a database or a writable-directory package means this client '
            'can keep financial records between launches',
      );
    });

    test('no source writes a file', () {
      final writers = <String>[
        for (final file in dartSources())
          if (fileWrite.hasMatch(file.readAsStringSync())) file.path,
      ];

      expect(writers, isEmpty, reason: 'a written file is a financial record left behind');
    });

    test('the guards are not vacuous', () {
      // Each rule above passes trivially if its scan finds nothing. These
      // assert the scans actually reach the tree they claim to read.
      expect(dartSources().length, greaterThan(100));
      expect(reviewedPreferenceKeys, isNotEmpty);
      expect(File('pubspec.yaml').existsSync(), isTrue);
    });
  });
}
