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
//
// THE BUNDLE IDENTIFIER IS CHECKED HERE FOR THE SAME REASON THE ATS KEY IS.
//
// `PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project is not the identity of the
// artifact, it is one input to it — and for most of this project's life it was
// an input that produced `com.kararfinance.app` for LOCAL, DEV, STAGING and
// PRODUCTION alike, while every source-level assertion about it passed. The
// only statement worth making is about the CFBundleIdentifier inside the built
// `.app`, compared against the identifier the ANDROID build derives for the
// same environment. Both come from one rule, read out of
// android/app/build.gradle.kts by support/bundle_identity.dart; neither is
// spelled out here.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'support/bundle_identity.dart';
import 'support/source_tree.dart';

/// The environment variable CI sets after building the app.
const String _gateVariable = 'KARAR_VERIFY_IOS_ARTIFACT';

const String _infoPlist = 'ios/Runner/Info.plist';
const String _atsFragment = 'ios/Runner/ATSLocalDevelopment.plist';
const String _verifyScript = iosVerifyScript;
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
const String _environmentKey = iosBuildEnvironmentKey;

/// The recorded value for a build the phase could not determine an environment
/// for. It can no longer be produced — a build with no KARAR_ENV is refused by
/// the phase, because the identifier it would have to package is nobody's — but
/// an artifact predating that rule, or one from a fork that removed it, is still
/// something this suite must be able to name rather than crash on.
const String _undeterminedEnvironment = 'UNSET';

bool get _buildIsExpected {
  final String value =
      (Platform.environment[_gateVariable] ?? '').trim().toLowerCase();
  return value == '1' || value == 'true' || value == 'yes';
}

/// The transport-security dictionary of a packaged bundle, if it has one.
extension on PackagedIosBundle {
  Map<String, Object?>? get appTransportSecurity =>
      info['NSAppTransportSecurity'] as Map<String, Object?>?;
}

/// Every built application bundle under `build/ios`.
///
/// Discovery and plist decoding live in support/bundle_identity.dart, because
/// the cross-platform assertions in platform_hardening_test.dart read the same
/// artifacts and two readers would eventually disagree about what "the built
/// bundle" is.
List<PackagedIosBundle> _packagedBundles() => packagedIosBundles();

/// The bundles to assert against, or null when there is nothing to read and
/// nothing was expected. Fails rather than returning null when a build was
/// expected.
List<PackagedIosBundle>? _bundlesUnderTest() {
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

  final List<PackagedIosBundle> bundles = _packagedBundles();
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
    late List<PackagedIosBundle>? bundles;

    setUpAll(() {
      bundles = _bundlesUnderTest();
    });

    /// Runs [body] against every built bundle, or skips when there is none and
    /// none was expected. A skip is visible in the runner output; a silent
    /// pass would not be.
    void forEachBundle(String description, void Function(PackagedIosBundle) body) {
      test(description, () {
        final List<PackagedIosBundle>? found = bundles;
        if (found == null) {
          markTestSkipped(
            'no built iOS bundle under build/ios. Run `flutter build ios '
            '--simulator --debug --dart-define=KARAR_ENV=LOCAL`, or set '
            '$_gateVariable=1 to make its absence a failure.',
          );
          return;
        }
        for (final PackagedIosBundle bundle in found) {
          body(bundle);
        }
      });
    }

    forEachBundle('states the environment it was built for', (PackagedIosBundle bundle) {
      expect(
        bundle.environment,
        isNotEmpty,
        reason: '${bundle.label} carries no $_environmentKey, which means the '
            '`Verify Packaged Bundle` build phase did not run. Nothing below '
            'this line can be trusted about that artifact, and the phase is '
            'also what confines the local HTTP exception.',
      );
      expect(
        <String>[...declaredEnvironments(), _undeterminedEnvironment],
        contains(bundle.environment),
        reason: '${bundle.label} was built for an unrecognised environment '
            "'${bundle.environment}'",
      );
    });

    // THE ASSERTION THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT.
    //
    // Before the packaging phase derived it, LOCAL, DEV, STAGING and PRODUCTION
    // all produced `com.kararfinance.app` — verified by building each and
    // reading this exact key — while the source-level assertion that
    // PRODUCT_BUNDLE_IDENTIFIER "starts with the owned identifier" passed for
    // all four. Nothing below reads a build setting or an xcconfig; it reads
    // what the artifact calls itself and compares it with what the Android
    // build calls the same environment.
    forEachBundle(
      'is named for the environment it was compiled for, and named the same '
      'thing the Android build names it',
      (PackagedIosBundle bundle) {
        if (bundle.environment == _undeterminedEnvironment) {
          // A build that never learned its environment is refused outright by
          // the packaging phase now, so this cannot be produced. If one is
          // present it is stale, and the assertion below would compare an
          // identifier against a rule that has no entry for it.
          fail(
            '${bundle.label} records $_environmentKey=$_undeterminedEnvironment, '
            'so it was packaged with no compiled environment. Such a build is '
            'refused now — its identifier belongs to no environment — so this '
            'artifact predates the rule and must be rebuilt rather than read.',
          );
        }
        expect(
          bundle.bundleIdentifier,
          counterpartBundleIdentifier(bundle.environment),
          reason: '${bundle.label} was compiled for ${bundle.environment} and '
              "the artifact calls itself '${bundle.bundleIdentifier}'. The "
              'expected value is derived from the same rule the Android build '
              'applies through applicationIdSuffix, which is the identifier the '
              "Android artifact's data-extraction rules name as this "
              'application. A mismatch means one platform is installing over — '
              'or claiming to be the counterpart of — a different application.',
        );
      },
    );

    forEachBundle(
      'never carries the production identifier unless it is a PRODUCTION build',
      (PackagedIosBundle bundle) {
        // Stated separately from the equality above because it is the property
        // that matters on its own, and because it holds for a reason the
        // equality does not carry: only PRODUCTION maps to the empty suffix, so
        // only PRODUCTION may be unsuffixed. A LOCAL artifact wearing the
        // production identifier installs OVER the production application on a
        // device that has both.
        final String production = counterpartBundleIdentifier('PRODUCTION');
        if (bundle.environment == 'PRODUCTION') {
          expect(bundle.bundleIdentifier, production);
          return;
        }
        expect(
          bundle.bundleIdentifier,
          isNot(production),
          reason: '${bundle.label} was compiled for ${bundle.environment} and '
              "carries the production identifier '$production'. It would "
              'install over the production application, and any App Store '
              'record for that identifier would accept it.',
        );
      },
    );

    // The two artifacts, compared to each other rather than each to the rule.
    //
    // The equality above proves each platform matches the rule. That is the
    // useful form when only one platform has been built, which is every lane
    // but this one. When both have been built the stronger statement is
    // available and costs nothing: the identifier in the packaged plist and the
    // applicationId in the merged manifest are the same string.
    forEachBundle(
      'matches the identifier the built Android artifact carries for the same '
      'environment',
      (PackagedIosBundle bundle) {
        final Map<String, String> android = builtAndroidApplicationIds();
        final Map<String, String> environments = environmentByBundleIdentifier();
        final Iterable<MapEntry<String, String>> sameEnvironment = android
            .entries
            .where((MapEntry<String, String> entry) =>
                environments[entry.value] == bundle.environment);
        if (sameEnvironment.isEmpty) {
          // Nothing to compare with. Not a failure here: this suite's gate
          // promises an iOS artifact, and the Android gate in
          // platform_hardening_test.dart is what promises the other half.
          return;
        }
        for (final MapEntry<String, String> entry in sameEnvironment) {
          expect(
            bundle.bundleIdentifier,
            entry.value,
            reason: '${bundle.label} carries '
                "'${bundle.bundleIdentifier}' and ${entry.key} carries "
                "'${entry.value}' for the same environment "
                '${bundle.environment}',
          );
        }
      },
    );

    forEachBundle(
      'carries no localhost exception unless it is a LOCAL build',
      (PackagedIosBundle bundle) {
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
      (PackagedIosBundle bundle) {
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

    forEachBundle('carries no key that permits arbitrary loads', (PackagedIosBundle bundle) {
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

    forEachBundle('carries a Face ID purpose string', (PackagedIosBundle bundle) {
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
      (PackagedIosBundle bundle) {
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
              decodePlist(strings)['NSFaceIDUsageDescription'];
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

  // The artifact assertions above prove what was built. These prove it could
  // not have been built any other way — that the derivation is still wired in,
  // still fails closed, and still refuses the one case where narrowing the
  // packaged identifier would produce an artifact its own provisioning profile
  // does not cover.
  group('the mechanism that gives an artifact its environment identity', () {
    late String script;

    setUpAll(() {
      script = readRequiredFile(_verifyScript);
    });

    test('the phase derives the identifier from the shared rule, not its own', () {
      expect(
        script,
        contains('. "\$identity_rules"'),
        reason: 'the build phase must source $iosBundleIdentityRules rather than '
            'carry its own copy of the suffix table. A second copy is a second '
            'rule the moment either is edited.',
      );
      expect(
        script,
        contains(r'karar_bundle_identifier "$compiled_environment"'),
        reason: 'the expected identifier must come from the compiled '
            'environment. Deriving it from CONFIGURATION would make a Debug '
            'build of DEV a LOCAL artifact.',
      );

      final String project = readRequiredFile(_project);
      expect(
        project,
        contains('Scripts/bundle_identity.sh'),
        reason: 'the rule file must be an input of the build phase, so an edit '
            'to the suffix table is an edit the build notices',
      );
    });

    test('a build that does not know its environment is refused', () {
      // Not defaulted to LOCAL, and not defaulted to production. The App
      // Transport Security section can afford to treat an undetermined
      // environment as "grant nothing", because the artifact starts without the
      // exception. An identifier has no equivalent: the artifact starts with
      // one, and every value it could be names some real environment.
      expect(
        script,
        contains(r'[ -n "$compiled_environment" ] || fail "Missing environment:'),
        reason: 'a build compiled with no KARAR_ENV must fail rather than be '
            'given an identifier that belongs to an environment nobody asked '
            'for',
      );
      expect(
        script,
        contains('|| fail "Unknown environment:'),
        reason: 'an environment outside the rule must fail rather than fall '
            'through to the empty suffix, which is production\'s',
      );
    });

    test('the packaged identifier is re-read after being written', () {
      expect(
        script,
        contains(r'[ "$final_identifier" = "$expected_identifier" ] || fail'),
        reason: 'a rewrite that reported success and did not take would '
            'otherwise ship the wrong identity. This also covers the path where '
            'nothing was rewritten, so the final value is asserted on every '
            'branch rather than only the corrected one.',
      );
    });

    test('the xcconfig seed is checked against the rule, not merely read', () {
      expect(
        script,
        contains(r'[ "$seed_is_an_identity" -eq 1 ] || fail'),
        reason: 'a typo in an xcconfig produces an identifier that still starts '
            'with the owned prefix. Unchecked, it would be silently overwritten '
            'here and never seen.',
      );

      // And the seeds themselves are identifiers this project issues. Debug
      // seeds the developer environment and Release seeds production, which are
      // the defaults for those configurations; the phase corrects any build
      // that crosses the two axes.
      final Set<String> issued = environmentByBundleIdentifier().keys.toSet();
      final Map<String, String> rule = environmentSuffixRule();
      for (final String xcconfig in <String>[
        iosDebugXcconfig,
        iosReleaseXcconfig,
      ]) {
        final String? suffix = xcconfigBundleIdSuffix(xcconfig);
        expect(
          suffix,
          isNotNull,
          reason: '$xcconfig sets no KARAR_BUNDLE_ID_SUFFIX, so '
              'PRODUCT_BUNDLE_IDENTIFIER resolves with an empty expansion and '
              'the seed is production\'s by accident rather than by decision',
        );
        expect(
          issued,
          contains('${baseApplicationId()}$suffix'),
          reason: "$xcconfig seeds the suffix '$suffix', which no environment "
              'in $rule maps to',
        );
      }
      expect(
        xcconfigBundleIdSuffix(iosDebugXcconfig),
        rule['LOCAL'],
        reason: 'the Debug default is the developer environment, on the same '
            'rule as `-Pkarar.env` defaulting to LOCAL on Android: a build with '
            'no arguments can never be production',
      );
      expect(
        xcconfigBundleIdSuffix(iosReleaseXcconfig),
        rule['PRODUCTION'],
        reason: 'Release and Profile are the configurations a production '
            'artifact is cut from, and PRODUCT_BUNDLE_IDENTIFIER is what a '
            'provisioning profile is ever selected by',
      );
    });

    test('narrowing the identifier is refused on a build that is provisioned', () {
      // The narrowing happens after Xcode has already chosen a provisioning
      // profile from PRODUCT_BUNDLE_IDENTIFIER, so on a signed build it would
      // leave the artifact claiming an identity its own profile does not cover.
      // Every artifact this repository produces is unsigned or ad-hoc signed
      // and has neither a team nor a profile, so this never fires today — and
      // the day it would, it fails instead of shipping.
      expect(
        script,
        contains(
          r'if [ -n "${DEVELOPMENT_TEAM:-}" ] || '
          r'[ -n "${PROVISIONING_PROFILE_SPECIFIER:-}" ]; then',
        ),
        reason: 'a signed build needs per-environment Xcode configurations and '
            'per-environment App Store records, and both need a real Apple Team '
            'ID. Until one exists out of band, that path is refused rather than '
            'approximated.',
      );
      expect(
        script,
        contains('Cross-platform identity is not configured for signed builds'),
        reason: 'the refusal must say what is missing, or an operator reads it '
            'as a bug in the build',
      );

      // And no team or profile is committed for it to find.
      final String project = readRequiredFile(_project);
      expect(
        RegExp(r'DEVELOPMENT_TEAM = ([^;]+);')
            .allMatches(project)
            .map((RegExpMatch match) => match.group(1)!.trim())
            .where((String value) => value.isNotEmpty && value != '""'),
        isEmpty,
        reason: 'no Apple Team ID exists for this project, and a syntactically '
            'valid one committed here would be an identity that is not ours',
      );
    });
  });
}
