// WHAT THE iOS ARTIFACT CONTAINS, READ OUT OF THE ARTIFACT.
//
// Every other assertion about the iOS bundle in this suite is made against the
// SOURCE tree. That is the right level for "this decision is on record", and
// the wrong level for "this is what ships": iOS builds one Info.plist for every
// configuration, so the packaged plist is a different file from the authored
// one. It is written by Xcode, then edited by the Flutter tool, then edited by
// this project's own `Verify Packaged Bundle` build phase. Only the last of
// those three is what a store submission, a reviewer or an attacker reads.
//
// So this file opens the built `.app` and reads the binary plist inside it.
//
// HOW IT DECIDES A BUILD IS EXPECTED.
//
//   KARAR_VERIFY_IOS_ARTIFACT set to 1, true or yes
//       A built bundle MUST be present and readable. Its absence is a
//       FAILURE. This is the CI contract: the macOS lane builds the app and
//       then sets this variable, so a build step that silently stopped
//       producing an artifact turns this suite red instead of turning it
//       vacuous.
//
//   the variable unset, a build present
//       Every assertion runs anyway. A developer who has built gets the
//       checks for free.
//
//   the variable unset, no build present
//       SKIPPED, naming the variable. Not passed. `flutter test` on Linux —
//       where the mobile lane runs, where there is no Xcode and no plutil —
//       must not be able to report that an iOS property holds when nothing
//       was examined.
//
// The suite reads the packaged plist through plutil rather than parsing a
// binary plist in Dart, so it is macOS-only by construction. That is stated
// through the same gate: with the variable set, a machine without plutil is a
// misconfigured CI lane and fails.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'support/source_tree.dart';

/// The environment variable CI sets after building the app.
const String _gateVariable = 'KARAR_VERIFY_IOS_ARTIFACT';

const String _infoPlist = 'ios/Runner/Info.plist';
const String _atsFragment = 'ios/Runner/ATSLocalDevelopment.plist';
const String _verifyScript = 'ios/Scripts/verify_packaged_bundle.sh';
const String _project = 'ios/Runner.xcodeproj/project.pbxproj';
const String _englishStrings = 'ios/Runner/en.lproj/InfoPlist.strings';
const String _arabicStrings = 'ios/Runner/ar.lproj/InfoPlist.strings';

/// Keys that permit arbitrary loads for a whole class of traffic. None may
/// appear in any artifact, in any configuration.
const List<String> _blanketAtsKeys = <String>[
  'NSAllowsArbitraryLoadsInWebContent',
  'NSAllowsArbitraryLoadsForMedia',
  'NSAllowsLocalNetworking',
];

/// The one environment permitted to carry a plain-HTTP exception.
const String _localEnvironment = 'LOCAL';

/// The key the build phase writes so an artifact says which environment it was
/// built for. Without it a LOCAL bundle and a PRODUCTION bundle are both
/// `Runner.app` at the same path, and the assertion below would be vacuous.
const String _environmentKey = 'KararBuildEnvironment';

bool get _buildIsExpected {
  final String value =
      (Platform.environment[_gateVariable] ?? '').trim().toLowerCase();
  return value == '1' || value == 'true' || value == 'yes';
}

/// One built application bundle found under `build/ios`.
final class _PackagedBundle {
  const _PackagedBundle(this.label, this.directory, this.info);

  /// The build directory the bundle came out of, for failure messages.
  final String label;
  final Directory directory;

  /// The packaged Info.plist, decoded.
  final Map<String, Object?> info;

  String get environment => (info[_environmentKey] as String? ?? '').trim();

  Map<String, Object?>? get appTransportSecurity =>
      info['NSAppTransportSecurity'] as Map<String, Object?>?;
}

/// Decodes a plist — binary or XML — through plutil.
///
/// Everything under a built `.app` is a binary plist, including the compiled
/// `.strings` files. Shelling out to plutil is deliberate: reimplementing the
/// binary plist format in this suite would put a parser of this project's own
/// between the assertion and the artifact, and a bug in it would read as a
/// passing test.
Map<String, Object?> _decodePlist(File file) {
  final ProcessResult result = Process.runSync(
    '/usr/bin/plutil',
    <String>['-convert', 'json', '-o', '-', file.path],
  );
  expect(
    result.exitCode,
    0,
    reason: 'plutil could not read ${file.path}: ${result.stderr}',
  );
  return jsonDecode(result.stdout as String) as Map<String, Object?>;
}

/// Every built application bundle under `build/ios`.
///
/// Both the configuration directories Xcode writes (`Debug-iphonesimulator`,
/// `Release-iphoneos`) and the copies the Flutter tool makes beside them
/// (`iphonesimulator`, `iphoneos`) are included. They are meant to be the same
/// artifact; asserting on all of them is what would catch the day they are not.
List<_PackagedBundle> _packagedBundles() {
  final Directory root = Directory('${mobilePackageRoot().path}/build/ios');
  if (!root.existsSync()) {
    return const <_PackagedBundle>[];
  }

  final bundles = <_PackagedBundle>[];
  for (final FileSystemEntity entity in root.listSync()) {
    if (entity is! Directory) {
      continue;
    }
    final Directory bundle = Directory('${entity.path}/Runner.app');
    final File info = File('${bundle.path}/Info.plist');
    if (!info.existsSync()) {
      continue;
    }
    bundles.add(
      _PackagedBundle(
        entity.path.split('/').last,
        bundle,
        _decodePlist(info),
      ),
    );
  }
  bundles.sort((_PackagedBundle a, _PackagedBundle b) => a.label.compareTo(b.label));
  return bundles;
}

/// The bundles to assert against, or null when there is nothing to read and
/// nothing was expected. Fails rather than returning null when a build was
/// expected.
List<_PackagedBundle>? _bundlesUnderTest() {
  if (!Platform.isMacOS) {
    if (_buildIsExpected) {
      fail(
        '$_gateVariable is set, so an iOS artifact was expected, but this is '
        'not macOS and plutil is not available to read one. Set the variable '
        'only on the lane that builds the app.',
      );
    }
    return null;
  }

  final List<_PackagedBundle> bundles = _packagedBundles();
  if (bundles.isNotEmpty) {
    return bundles;
  }
  if (_buildIsExpected) {
    fail(
      '$_gateVariable is set, so a built iOS bundle was expected under '
      'build/ios, and there is none. A build step that stopped producing an '
      'artifact must fail this suite rather than leave it with nothing to '
      'check.',
    );
  }
  return null;
}

void main() {
  group('the packaged iOS bundle', () {
    late List<_PackagedBundle>? bundles;

    setUpAll(() {
      bundles = _bundlesUnderTest();
    });

    /// Runs [body] against every built bundle, or skips when there is none and
    /// none was expected. A skip is visible in the runner output; a silent
    /// pass would not be.
    void forEachBundle(String description, void Function(_PackagedBundle) body) {
      test(description, () {
        final List<_PackagedBundle>? found = bundles;
        if (found == null) {
          markTestSkipped(
            'no built iOS bundle under build/ios. Run `flutter build ios '
            '--simulator --debug --dart-define=KARAR_ENV=LOCAL`, or set '
            '$_gateVariable=1 to make its absence a failure.',
          );
          return;
        }
        for (final _PackagedBundle bundle in found) {
          body(bundle);
        }
      });
    }

    forEachBundle('states the environment it was built for', (_PackagedBundle bundle) {
      expect(
        bundle.environment,
        isNotEmpty,
        reason: '${bundle.label} carries no $_environmentKey, which means the '
            '`Verify Packaged Bundle` build phase did not run. Nothing below '
            'this line can be trusted about that artifact, and the phase is '
            'also what confines the local HTTP exception.',
      );
      expect(
        <String>['LOCAL', 'DEV', 'STAGING', 'PRODUCTION', 'UNSET'],
        contains(bundle.environment),
        reason: '${bundle.label} was built for an unrecognised environment '
            "'${bundle.environment}'",
      );
    });

    forEachBundle(
      'carries no localhost exception unless it is a LOCAL build',
      (_PackagedBundle bundle) {
        if (bundle.environment == _localEnvironment) {
          return;
        }
        expect(
          bundle.appTransportSecurity,
          isNull,
          reason: '${bundle.label} was built for ${bundle.environment} and '
              'carries an App Transport Security dictionary: '
              '${bundle.appTransportSecurity}. A deployed artifact must rely on '
              'the platform transport policy, with no exception domain of any '
              'kind. Only a Debug build compiled for LOCAL may have one.',
        );
      },
    );

    forEachBundle(
      'grants a LOCAL build the narrow loopback exception and nothing wider',
      (_PackagedBundle bundle) {
        if (bundle.environment != _localEnvironment) {
          return;
        }
        final Map<String, Object?>? ats = bundle.appTransportSecurity;
        if (ats == null) {
          // Permitted, not required: a LOCAL build that never talks to the
          // loopback API does not need the exception.
          return;
        }
        expect(
          ats['NSExceptionDomains'],
          <String, Object?>{
            'localhost': <String, Object?>{
              'NSExceptionAllowsInsecureHTTPLoads': true,
              'NSIncludesSubdomains': false,
            },
          },
          reason: 'the LOCAL exception is for the loopback host of the machine '
              'of the developer and for nothing else. No routable host, and no '
              'subdomain, may be added to it.',
        );
      },
    );

    forEachBundle('carries no key that permits arbitrary loads', (_PackagedBundle bundle) {
      final Map<String, Object?>? ats = bundle.appTransportSecurity;
      if (ats == null) {
        return;
      }
      expect(
        ats['NSAllowsArbitraryLoads'],
        anyOf(isNull, isFalse),
        reason: '${bundle.label} permits arbitrary loads, which switches off '
            'transport security for every host at once',
      );
      for (final String key in _blanketAtsKeys) {
        expect(
          ats.containsKey(key),
          isFalse,
          reason: '$key is present in ${bundle.label}. It relaxes transport '
              'security for a whole class of traffic rather than for one host.',
        );
      }
    });

    forEachBundle('carries a Face ID purpose string', (_PackagedBundle bundle) {
      final Object? purpose = bundle.info['NSFaceIDUsageDescription'];
      expect(
        purpose,
        isA<String>(),
        reason: '${bundle.label} has no Face ID purpose string. iOS terminates '
            'the process on the first Face ID evaluation without one, so this '
            'is a crash rather than a missing disclosure.',
      );
      expect((purpose! as String).trim(), isNotEmpty);
    });

    forEachBundle(
      'carries the Face ID purpose string in English and in Arabic',
      (_PackagedBundle bundle) {
        final localized = <String, String>{};
        for (final String language in <String>['en', 'ar']) {
          final File strings =
              File('${bundle.directory.path}/$language.lproj/InfoPlist.strings');
          expect(
            strings.existsSync(),
            isTrue,
            reason: '${bundle.label} has no $language.lproj/InfoPlist.strings. '
                'The purpose string would fall back to the development '
                'language for every user reading that language, and a system '
                'prompt nobody reads is a disclosure that was not made.',
          );
          final Object? value =
              _decodePlist(strings)['NSFaceIDUsageDescription'];
          expect(
            value,
            isA<String>(),
            reason: '$language.lproj/InfoPlist.strings in ${bundle.label} '
                'carries no NSFaceIDUsageDescription',
          );
          localized[language] = (value! as String).trim();
          expect(localized[language], isNotEmpty);
        }

        expect(
          localized['ar'],
          matches(RegExp(r'[؀-ۿ]')),
          reason: 'the Arabic purpose string in ${bundle.label} contains no '
              'Arabic script, so it is an untranslated copy of the English',
        );
        expect(
          localized['ar'],
          isNot(equals(localized['en'])),
          reason: 'the two localizations are identical in ${bundle.label}',
        );
      },
    );
  });

  // The assertions above prove what the artifact on this machine contains. The
  // ones below prove the artifact could not have been anything else — that the
  // mechanism which produced it is still in place. Removing the build phase, or
  // moving the exception back into the shared plist, would leave the tests
  // above passing on a stale artifact.
  group('the mechanism that keeps the exception out of a deployed artifact', () {
    test('the shared Info.plist declares no transport security at all', () {
      // iOS builds ONE Info.plist for every configuration. Anything declared
      // here is in every artifact, which is exactly how the exception came to
      // ship in DEV, STAGING and PRODUCTION.
      final String plist = declarations(_infoPlist);
      expect(
        plist,
        isNot(contains('NSAppTransportSecurity')),
        reason: 'the shared plist is the one file whose contents reach every '
            'configuration, so no transport exception may be declared in it',
      );
      expect(plist, isNot(contains('NSExceptionDomains')));
      expect(plist, isNot(contains('NSAllowsArbitraryLoads')));
    });

    test('the exception lives in a fragment that is not copied into a bundle', () {
      final String fragment = declarations(_atsFragment);
      expect(fragment, contains('<key>localhost</key>'));
      expect(fragment, contains('<key>NSAllowsArbitraryLoads</key> <false/>'));
      for (final String key in _blanketAtsKeys) {
        expect(
          fragment,
          isNot(contains(key)),
          reason: '$key relaxes transport security for a whole class of '
              'traffic rather than for one host',
        );
      }

      final String project = readRequiredFile(_project);
      expect(
        project,
        isNot(contains('ATSLocalDevelopment.plist in Resources')),
        reason: 'the fragment is merged into the packaged plist by a build '
            'phase. Copying it into the bundle as a resource would put the '
            'exception in every artifact again, by a different route.',
      );
    });

    test('the build phase that merges it is still wired into the target', () {
      final String project = readRequiredFile(_project);
      expect(
        project,
        contains('Verify Packaged Bundle'),
        reason: 'without this phase no artifact gets the exception — which is '
            'the safe direction — but nothing checks the packaged plist for an '
            'arbitrary-load key either',
      );
      expect(project, contains('Scripts/verify_packaged_bundle.sh'));
    });

    test('the merge requires a positively decoded LOCAL environment', () {
      final String script = readRequiredFile(_verifyScript);
      // The whole condition, not a fragment of it. A widened grant reads as
      // `... = "Release" || { <the original condition> }`, which still
      // contains the original as a substring; only anchoring on `if [` and on
      // the trailing `; then` rejects one.
      expect(
        script,
        contains(
          'if [ "\${CONFIGURATION:-}" = "Debug" ] && '
          r'[ "$compiled_environment" = "LOCAL" ]; then',
        ),
        reason: 'the exception must be granted on proof, never on the absence '
            'of a reason to withhold it. An undetermined environment gets no '
            'exception, and no configuration other than Debug gets one at all.',
      );
      expect(
        script,
        contains('KARAR_ENV=*'),
        reason: 'the environment is read from the compiled dart-defines, '
            'because the Xcode configuration does not know it: a Debug build '
            'can be compiled for DEV',
      );
      expect(
        script,
        contains('plutil -remove NSAppTransportSecurity'),
        reason: 'anything an earlier phase or an incremental build left behind '
            'must be removed, not just not-added',
      );
      expect(
        script,
        contains('set -eu'),
        reason: 'an unexpected error must fail the build rather than skip a check',
      );
    });

    test('the Arabic purpose string is in the source tree and in the project', () {
      final String arabic = readRequiredFile(_arabicStrings);
      expect(arabic, contains('NSFaceIDUsageDescription'));
      expect(
        arabic,
        matches(RegExp(r'[؀-ۿ]')),
        reason: 'the Arabic resource contains no Arabic script',
      );

      final String english = readRequiredFile(_englishStrings);
      expect(english, contains('NSFaceIDUsageDescription'));

      final String project = readRequiredFile(_project);
      expect(
        project,
        contains('InfoPlist.strings in Resources'),
        reason: 'a .strings file that is not in the resources build phase is '
            'not in the built application, and the localization silently does '
            'nothing',
      );
      expect(
        project,
        contains('path = ar.lproj/InfoPlist.strings'),
        reason: 'Arabic must be a member of the InfoPlist.strings variant group',
      );
      expect(
        RegExp(r'knownRegions = \(([^)]*)\)').firstMatch(project)?.group(1),
        contains('ar'),
        reason: 'a region Xcode does not know about is not built',
      );
    });

    test('the development-language string and the English localization agree', () {
      // iOS falls back to the Info.plist value when no localization matches.
      // Two different sentences for the same disclosure is the kind of drift
      // nobody notices until a reviewer quotes the wrong one.
      final String? fallback = RegExp(
        r'<key>NSFaceIDUsageDescription</key>\s*<string>(.*?)</string>',
        dotAll: true,
      ).firstMatch(readRequiredFile(_infoPlist))?.group(1);
      expect(fallback, isNotNull);

      final String? english = RegExp(r'"NSFaceIDUsageDescription"\s*=\s*"(.*?)";')
          .firstMatch(readRequiredFile(_englishStrings))
          ?.group(1);
      expect(english, isNotNull);
      expect(english, fallback);
    });
  });
}
