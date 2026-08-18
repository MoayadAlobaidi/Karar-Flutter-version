// PLATFORM NETWORK AND PACKAGING CONTROLS, ENFORCED.
//
// The Android manifest, the network security configs and the iOS Info.plist
// are the files a reviewer, a store submission and an attacker all read first.
// They are also the files most likely to be relaxed "temporarily" by someone
// debugging a connection problem. These assertions turn each decision into a
// test, so a relaxation is a red build rather than a quiet regression.
//
// Assertions are made against the DECLARATIONS, with XML comments stripped:
// the explanatory prose in those files names the very attributes under test,
// so a comment must not be able to satisfy — or break — an assertion.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'support/bundle_identity.dart';
import 'support/source_tree.dart';

const String _androidManifest = 'android/app/src/main/AndroidManifest.xml';
const String _releaseNetworkConfig =
    'android/app/src/main/res/xml/network_security_config.xml';
const String _debugNetworkConfig =
    'android/app/src/debug/res/xml/network_security_config.xml';
const String _staticDataExtractionRules =
    'android/app/src/main/res/xml/data_extraction_rules.xml';
const String _appGradle = 'android/app/build.gradle.kts';
const String _infoPlist = 'ios/Runner/Info.plist';

/// The rules resource is GENERATED, so it is read out of the build output.
///
/// It cannot be a committed file: `<platform-specific-params>` is required on
/// `<cross-platform-transfer>` and carries an Apple Team ID, an identity this
/// project does not have. A LOCAL artifact declares a test-only one; a deployed
/// assembly refuses to build until a real one is supplied out of band. So the
/// thing under test is what an assembly produced, not what someone typed.
const String _generatedResourceName = 'data_extraction_rules.xml';

/// The path every exclusion carries, naming the whole domain directory.
///
/// `.` and not `./`. The two are the SAME exclusion at runtime — FullBackup
/// stores `new File(domainDirectory, path).getCanonicalPath()` and
/// canonicalisation collapses `dir/.` and `dir/./` to `dir` — but they are not
/// the same to lint. FullBackupContentDetector.validatePath reports
/// "Subdirectories are not allowed for domain `sharedpref`" for any path
/// containing `/` in the sharedpref and database domains, and FullBackupContent
/// is FATAL, so `./` fails lintVitalRelease and no release artifact can be
/// produced at all. sharedpref is where the session tokens live.
const String _wholeDomainPath = '.';

/// The identity a LOCAL artifact declares for an iOS counterpart that does not
/// exist.
///
/// It has two jobs. It must read as fake to a person dumping the resource out
/// of an APK, and it must be impossible for a deployed artifact to carry even
/// if someone passes it deliberately. The second is structural, not a matter of
/// naming: it is not shaped like an Apple Team ID, and every deployed build
/// runs whatever it is given through that shape.
const String _testOnlyTeamId = 'TEST-ONLY-NOT-AN-APPLE-TEAM-ID';

/// An Apple Team ID, as Apple issues them: ten characters, uppercase letters
/// and digits.
final RegExp _appleTeamIdShape = RegExp(r'^[A-Z0-9]{10}$');

/// The only cross-platform target the framework names anywhere:
/// `BackupAgent.FLAG_CROSS_PLATFORM_DATA_TRANSFER_IOS`, documented as "a
/// cross-platform transfer to or from iOS".
const String _crossPlatformTarget = 'ios';

/// The only hosts a debug build may reach over plain HTTP. Every one is the
/// developer's own machine.
const List<String> _permittedCleartextHosts = <String>[
  'localhost',
  '127.0.0.1',
  '10.0.2.2',
];

/// Every domain Android's backup rules can name. Each declared extraction mode
/// must exclude all of them, so "excluded" cannot come to mean "excluded except
/// the one domain nobody listed".
const List<String> _backupDomains = <String>[
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
];

/// Every extraction mode the rules resource must declare. A mode with no
/// section is not off — Android documents a missing section as fully enabled
/// for all content — so the absence of one of these is the defect being
/// guarded against.
const List<String> _dataExtractionModes = <String>[
  'cloud-backup',
  'device-transfer',
  'cross-platform-transfer',
];

/// Alias for the shared reader, so the assertions below read as they did when
/// this helper was declared here.
String _declarations(String relativePath) => declarations(relativePath);

void main() {
  group('Android release network policy', () {
    late String manifest;
    late String releaseConfig;

    setUpAll(() {
      manifest = _declarations(_androidManifest);
      releaseConfig = _declarations(_releaseNetworkConfig);
    });

    test('the manifest points at a network security config', () {
      expect(
        manifest,
        contains('android:networkSecurityConfig="@xml/network_security_config"'),
      );
    });

    test('the manifest disables cleartext traffic and never enables it', () {
      expect(manifest, contains('android:usesCleartextTraffic="false"'));
      expect(
        manifest,
        isNot(contains('android:usesCleartextTraffic="true"')),
        reason: 'a blanket cleartext permission must never be declared',
      );
    });

    test('the release config forbids cleartext with no domain exception', () {
      expect(releaseConfig, contains('cleartextTrafficPermitted="false"'));
      expect(
        releaseConfig,
        isNot(contains('cleartextTrafficPermitted="true"')),
        reason: 'the release policy must contain no cleartext exception at all',
      );
      expect(
        releaseConfig,
        isNot(contains('<domain-config')),
        reason: 'a release domain exception would be a per-host cleartext or trust '
            'relaxation; there is no host that warrants one',
      );
    });

    test('the release config trusts the system store only', () {
      expect(releaseConfig, contains('<certificates src="system" />'));
      expect(
        releaseConfig,
        isNot(contains('src="user"')),
        reason: 'trusting user-installed CAs would let a proxy or MDM profile '
            'intercept this application',
      );
    });

    test('the release config declares no debug-overrides block', () {
      expect(
        releaseConfig,
        isNot(contains('<debug-overrides')),
        reason: 'debug-overrides is honoured whenever android:debuggable is true, '
            'which couples a trust decision to a manifest flag tooling can set. '
            'The debug exception is scoped by source set instead.',
      );
    });

    test('no certificate is pinned', () {
      // Pinning is deliberately NOT a Phase 4 control. Adding a pin-set here
      // would change an architecture decision by editing a config file.
      expect(releaseConfig, isNot(contains('<pin-set')));
      expect(_declarations(_debugNetworkConfig), isNot(contains('<pin-set')));
    });

    test('android auto-backup is disabled', () {
      expect(manifest, contains('android:allowBackup="false"'));
    });

    test('devices below API 31 are covered by their own mechanism', () {
      // TWO ERAS, TWO MECHANISMS, AND minSdk IS 24.
      //
      // `dataExtractionRules` is honoured only from API 31. Everything from
      // API 24 to 30 reads `fullBackupContent` instead, and would ignore the
      // resource entirely — so asserting the API 31+ resource says nothing
      // about most of the supported range.
      //
      // `android:fullBackupContent="false"` is the pre-31 answer and is
      // stronger than the 31+ one: below 31 it disables the transfer path as
      // well as cloud backup, which is precisely the coupling that stops
      // holding at 31 and forced the data-extraction resource to exist.
      expect(
        manifest,
        contains('android:fullBackupContent="false"'),
        reason: 'without this, devices from API 24 to 30 fall back to default '
            'backup behaviour: the data-extraction resource does not apply to '
            'them, and allowBackup alone is not the whole control there',
      );
      expect(
        manifest,
        contains('android:allowBackup="false"'),
        reason: 'the one attribute both eras honour',
      );
    });

    test('a data-extraction rules resource is declared, because allowBackup does not '
        'cover device transfer', () {
      // Android's documented limit: for an application running on and targeting
      // API 31 or higher, allowBackup="false" disables cloud backup but does
      // NOT disable device-to-device transfer. targetSdk is the Flutter default
      // (36 with this SDK), so the gap applies to what ships. The rules
      // resource is what closes it, and a missing resource is documented to
      // leave the transfer modes fully enabled rather than off.
      expect(
        manifest,
        contains('android:dataExtractionRules="@xml/data_extraction_rules"'),
      );
      expect(manifest, contains('android:fullBackupContent="false"'));
    });

    test('INTERNET is declared, and the app itself requests nothing else', () {
      expect(
        manifest,
        contains('<uses-permission android:name="android.permission.INTERNET"/>'),
        reason: 'the Flutter template declares INTERNET in the debug and profile '
            'source sets only, which leaves a release build with no network access',
      );
      final declared = RegExp(r'<uses-permission android:name="([^"]+)"')
          .allMatches(manifest)
          .map((RegExpMatch match) => match.group(1)!)
          .toSet();
      expect(
        declared,
        <String>{'android.permission.INTERNET'},
        reason: 'every additional permission is a privacy disclosure obligation this '
            'product does not need to take on',
      );
    });

    test('the platform permissions of a real build are exactly the reviewed set', () {
      // THIS IS THE AUTHORITATIVE PERMISSION CONTROL. The source manifest
      // declares one permission; the artifact a device installs declares four.
      // The manifest merger, not this repository's source, decides that — so
      // the merged output is the property under test, and the sets below are
      // the review record for what it is allowed to contain.
      //
      // Provenance and protection level of each platform permission, verified
      // against the merge blame report of a real build:
      //
      //   INTERNET        `normal`  — declared by this project's own manifest.
      //   USE_BIOMETRIC   `normal`  — contributed by the local_auth_android
      //                               plugin module, and independently by
      //                               androidx.biometric 1.1.0.
      //   USE_FINGERPRINT `normal`  — contributed by androidx.biometric 1.1.0.
      //                               The predecessor of USE_BIOMETRIC,
      //                               deprecated at API 28 and carried for
      //                               compatibility below it; minSdk is 24, so
      //                               it covers a range that ships.
      //
      // `normal` means granted at install with no runtime prompt, so none of
      // these produces a user-facing consent step — which is exactly why the
      // review has to happen here instead.
      //
      // The comparison is EXACT, not a subset check. A subset check passes when
      // a permission disappears, which would let a dependency swap go unnoticed
      // in the direction that changes behaviour silently; and it invites the
      // allow-list to be padded with permissions that are not actually present.
      // Either half of a mismatch is a finding: a new entry means a dependency
      // started asking for something nobody reviewed, and a missing entry means
      // this record has gone stale.
      const Set<String> expectedPlatformPermissions = <String>{
        'android.permission.INTERNET',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
      };

      final merged = _mergedManifestPermissions();
      if (merged == null) {
        // The merged manifest only exists after a Gradle build. Skipping is
        // honest; silently passing on the source manifest would not be.
        _requireBuildIfExpected();
        markTestSkipped('no merged manifest present — run `flutter build apk --debug` first');
        return;
      }
      expect(
        merged.platform,
        expectedPlatformPermissions,
        reason: 'the permission set of a built artifact no longer matches the '
            'reviewed record. Adding an entry is a deliberate act with a stated '
            'reason, or the dependency that brings it in goes.',
      );
    });

    test('the only non-platform permission is the signature-level one androidx '
        'defines for this application', () {
      // The fourth permission in the merged manifest is not a platform
      // capability at all: androidx.core contributes both a <permission>
      // declaration and its matching <uses-permission> for
      // DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION, at protection level
      // `signature`, so receivers androidx registers at runtime are reachable
      // only by code signed with the same key.
      //
      // It is matched by shape rather than by literal because its name carries
      // the applicationId, which changes with the environment suffix — the
      // release artifact and the local one do not spell it the same way. The
      // shape is still narrow: any OTHER custom permission a dependency starts
      // contributing fails here.
      final merged = _mergedManifestPermissions();
      if (merged == null) {
        _requireBuildIfExpected();
        markTestSkipped('no merged manifest present — run `flutter build apk --debug` first');
        return;
      }

      final expected = RegExp(
        r'^com\.kararfinance\.app(\.[a-z]+)?\.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION$',
      );
      // Iterating a set proves nothing about an EMPTY set. androidx.core
      // contributes this permission on every variant, so an empty collection
      // means the reader broke rather than that the artifact is clean — and a
      // broken reader would make every assertion here silently vacuous.
      expect(
        merged.other,
        isNotEmpty,
        reason: 'no custom permission was found at all. androidx.core '
            'contributes one to every variant, so this means the merged '
            'manifest was not parsed, not that the artifact is clean.',
      );
      for (final permission in merged.other) {
        expect(
          expected.hasMatch(permission),
          isTrue,
          reason: '$permission is a custom permission no review covers. It reached a '
              'built artifact from a dependency, so the decision is which '
              'dependency goes, not which line here changes.',
        );
      }
    });
  });

  // THE RESOURCE IS A BUILD OUTPUT, SO TWO KINDS OF ASSERTION LIVE HERE.
  //
  //   Against the GENERATOR (app/build.gradle.kts, always present): what any
  //   future assembly will produce, including for environments no lane builds.
  //   This is the only way a PRODUCTION rule can be checked on a lane that
  //   assembles LOCAL and nothing else.
  //
  //   Against the GENERATED resource (present after an assembly): what a build
  //   actually produced, which is the only version that can be packaged. A
  //   generator assertion cannot certify a rule that does not fire — that
  //   mistake has already been made once in this repository, where a source
  //   presence check certified an IPv6 rule that was unreachable.
  //
  // Neither substitutes for the other, and neither reads a committed XML file,
  // because there is no longer one to read.
  group('Android data-extraction rules', () {
    late String gradle;

    setUpAll(() {
      gradle = stripCodeComments(readRequiredFile(_appGradle));
    });

    test('the resource is generated, and no static copy survives beside it', () {
      // Two copies would both sit in the tree and only one would ever be
      // packaged — and the committed one is the one a reviewer reads. AGP
      // would also reject the duplicate outright, but "the build breaks" is
      // not the property worth asserting; "there is one source of truth" is.
      final File staticCopy =
          File('${mobilePackageRoot().path}/$_staticDataExtractionRules');
      expect(
        staticCopy.existsSync(),
        isFalse,
        reason: '$_staticDataExtractionRules exists. The rules resource is '
            'produced by GenerateDataExtractionRules in $_appGradle, because '
            'one of its required attributes is an Apple Team ID this project '
            'does not have. A committed copy either duplicates the resource or '
            'is read instead of the one that ships.',
      );
      expect(
        gradle,
        contains('abstract class GenerateDataExtractionRules'),
        reason: 'without the generator, @xml/data_extraction_rules resolves to '
            'nothing and the backup framework falls back to its default, which '
            'is to copy everything',
      );
      expect(
        gradle,
        contains('addGeneratedSourceDirectory'),
        reason: 'the generated directory must be registered through the AGP '
            'variant API, which wires the task dependency itself. Adding it to '
            'sourceSets by hand is what produces a resource that is merged on '
            'one invocation and missing on the next.',
      );
      expect(
        gradle,
        contains('checkGeneratedSources = true'),
        reason: 'lint skips generated sources by default, and lintVitalRelease '
            'is what once caught <cross-platform-transfer> with no platform '
            'attribute. Generating the resource put it out of lint\'s reach: '
            'with this off, a release assembly of a rules resource missing that '
            'same attribute succeeds.',
      );
    });

    test('the generator declares exactly the reviewed modes, domains and path', () {
      // EXACT SETS, NOT SUBSTRING PRESENCE. A subset check passes when a
      // domain disappears, which is the direction that changes behaviour.
      expect(
        _kotlinStringList(gradle, 'SECTIONS'),
        _dataExtractionModes.toSet(),
        reason: 'a mode with no section is not off: Android documents a missing '
            'section as fully enabled for all content',
      );
      expect(
        _kotlinStringList(gradle, 'DOMAINS'),
        _backupDomains.toSet(),
        reason: 'session tokens live in sharedpref, and a domain left unnamed is '
            'a domain left in',
      );
      expect(
        gradle,
        contains('const val WHOLE_DOMAIN_PATH = "$_wholeDomainPath"'),
        reason: 'every exclusion carries this path. "./" means the same thing at '
            'runtime and fails lintVitalRelease at FATAL severity in the '
            'sharedpref and database domains, so no release artifact can be '
            'produced with it.',
      );
      expect(
        gradle,
        contains('const val CROSS_PLATFORM_TARGET = "$_crossPlatformTarget"'),
        reason: 'nothing rejects a wrong platform value — FullBackup reads the '
            'attribute as an opaque string and uses it as a map key — so a '
            'misspelling builds, lints, ships, and addresses a platform nobody '
            'transfers to',
      );
    });

    test('every exclusion in every mode names both a domain and the whole domain', () {
      final rules = _generatedRulesOrSkip();
      if (rules == null) return;

      for (final resource in rules) {
        for (final mode in _dataExtractionModes) {
          final String section = _sectionOf(resource, mode);
          final Iterable<RegExpMatch> exclusions =
              RegExp(r'<exclude([^>]*)/>').allMatches(section);
          expect(
            exclusions,
            isNotEmpty,
            reason: '${resource.path}: <$mode> declares no exclusion at all',
          );
          for (final RegExpMatch exclusion in exclusions) {
            final String attributes = exclusion.group(1)!;
            final String? domain =
                RegExp(r'domain="([^"]*)"').firstMatch(attributes)?.group(1);
            final String? path =
                RegExp(r'path="([^"]*)"').firstMatch(attributes)?.group(1);
            expect(
              domain,
              isNotNull,
              reason: '${resource.path}: <$mode> has an exclusion with no domain '
                  'attribute, which the framework skips entirely',
            );
            expect(
              path,
              _wholeDomainPath,
              reason: '${resource.path}: <$mode> excludes domain "$domain" with '
                  'path="$path". The scope of an exclusion is stated, not left '
                  'to the parser\'s null handling, and the whole-domain form is '
                  '"$_wholeDomainPath".',
            );
          }
        }
      }
    });

    test('every mode excludes every domain, and nothing is included back', () {
      final rules = _generatedRulesOrSkip();
      if (rules == null) return;

      for (final resource in rules) {
        for (final mode in _dataExtractionModes) {
          final String section = _sectionOf(resource, mode);
          for (final domain in _backupDomains) {
            expect(
              section,
              contains('<exclude domain="$domain" path="$_wholeDomainPath" />'),
              reason: '${resource.path}: <$mode> does not exclude the $domain '
                  'domain. Session tokens live in sharedpref, and a domain left '
                  'unnamed is a domain left in.',
            );
          }
        }
        expect(
          resource.declarations,
          isNot(contains('<include')),
          reason: '${resource.path}: an include element re-admits content to a '
              'mode this resource exists to empty',
        );
      }
    });

    test('cross-platform-transfer names exactly one platform, and it is ios', () {
      // AN EXACT VALUE, NOT A PATTERN. An earlier revision accepted
      // `platform="[a-z_]+"` and so certified `platform="apple_icloud"`, a
      // value invented in this repository that appears in no AOSP source and in
      // no lint rule. A pattern is the wrong shape of assertion because nothing
      // else rejects a wrong value either: FullBackup reads the attribute as an
      // opaque string, the platform publishes no enumeration, and lint checks
      // only that the attribute is PRESENT.
      final rules = _generatedRulesOrSkip();
      if (rules == null) return;

      for (final resource in rules) {
        final Iterable<RegExpMatch> openings =
            RegExp(r'<cross-platform-transfer([^>]*)>').allMatches(resource.declarations);
        expect(
          openings.length,
          1,
          reason: '${resource.path}: found ${openings.length} '
              'cross-platform-transfer sections. The framework iterates every '
              'matching element, so a duplicate is a second policy nobody '
              'reviewed and a reviewer may read the wrong one.',
        );
        for (final RegExpMatch opening in openings) {
          final String? platform =
              RegExp(r'platform="([^"]*)"').firstMatch(opening.group(1)!)?.group(1);
          expect(
            platform,
            _crossPlatformTarget,
            reason: '${resource.path}: cross-platform-transfer declares '
                'platform="$platform". Only "$_crossPlatformTarget" is a target '
                'the framework names, and a value it does not recognise is '
                'accepted silently rather than refused — the section then looks '
                'correct and does nothing.',
          );
        }
        expect(
          resource.declarations,
          isNot(contains('apple_icloud')),
          reason: '${resource.path}: apple_icloud was invented here and names no '
              'real platform',
        );
      }
    });

    test('platform-specific-params is declared once, with all three attributes', () {
      // The element is REQUIRED by the application contract for
      // <cross-platform-transfer>, and it carries bundleId, teamId and
      // contentVersion. A partially filled element is not a smaller version of
      // a complete one: it names a counterpart that cannot be identified.
      final rules = _generatedRulesOrSkip();
      if (rules == null) return;

      for (final resource in rules) {
        final Iterable<RegExpMatch> declared =
            RegExp(r'<platform-specific-params([^>]*)/>')
                .allMatches(resource.declarations);
        expect(
          declared.length,
          1,
          reason: '${resource.path}: found ${declared.length} '
              'platform-specific-params elements, expected exactly one',
        );

        final String attributes = declared.first.group(1)!;
        for (final attribute in <String>['bundleId', 'teamId', 'contentVersion']) {
          final String? value =
              RegExp('$attribute="([^"]*)"').firstMatch(attributes)?.group(1);
          expect(
            value,
            isNotNull,
            reason: '${resource.path}: platform-specific-params declares no '
                '$attribute',
          );
          expect(
            value,
            isNotEmpty,
            reason: '${resource.path}: platform-specific-params declares an empty '
                '$attribute, which identifies nothing',
          );
        }

        // Inside the section it governs, not beside it. The framework only
        // reads it while parsing cross-platform-transfer.
        expect(
          _sectionOf(resource, 'cross-platform-transfer'),
          contains('<platform-specific-params'),
          reason: '${resource.path}: platform-specific-params is declared outside '
              'the cross-platform-transfer section, where nothing reads it',
        );
      }
    });

    test('a LOCAL artifact declares the test-only identity', () {
      final rules = _generatedRulesOrSkip();
      if (rules == null) return;

      final List<_GeneratedRules> local =
          rules.where((_GeneratedRules resource) => resource.isLocal).toList();
      if (local.isEmpty) {
        _requireLocalArtifactIfExpected();
        markTestSkipped(
          'no LOCAL data-extraction rules were generated — run '
          '`flutter build apk --debug -Pkarar.env=LOCAL --dart-define=KARAR_ENV=LOCAL`',
        );
        return;
      }

      for (final resource in local) {
        expect(
          _teamIdOf(resource),
          _testOnlyTeamId,
          reason: '${resource.path}: a LOCAL artifact must declare the test-only '
              'Team ID. Anything else is an identity that came from somewhere, '
              'and nowhere in this repository is a place a real one may come '
              'from.',
        );
      }
    });

    test('a deployed artifact cannot carry the test-only identity', () {
      // THIS REPLACES "the element is not declared at all".
      //
      // That rule existed because a test which only recognises obviously-fake
      // identities cannot tell a real one from a convincing fabrication — an
      // independent review inserted `teamId="9ZX7Q4KD22"` and the whole suite
      // passed. Absence was the only thing left to assert. The application
      // contract requires the element, so absence is no longer available, and
      // the property that replaces it is stronger: the test-only value is not
      // merely recognisable, it is STRUCTURALLY unable to reach a deployed
      // artifact.
      //
      // Three links, and all three are checked here:
      //
      //   1. this file and the generator name the same test-only value, so the
      //      assertion cannot drift away from what is generated;
      //   2. that value is not shaped like an Apple Team ID;
      //   3. every deployed build takes its Team ID from configuration and runs
      //      it through that shape, with no default and no fallback — so
      //      supplying the test-only value by hand is refused too.
      //
      // Link 3 is asserted against the generator AND, whenever a deployed
      // assembly is present, against what it produced.
      expect(
        gradle,
        contains('const val TEST_ONLY_TEAM_ID = "$_testOnlyTeamId"'),
        reason: 'the generator and this file must name the same test-only value, '
            'or every assertion below is about a string nothing emits',
      );
      expect(
        _appleTeamIdShape.hasMatch(_testOnlyTeamId),
        isFalse,
        reason: '$_testOnlyTeamId is shaped like a real Apple Team ID. That is '
            'the whole defence: a deployed build validates whatever it is given '
            'against this shape, so a test-only value that satisfies it could be '
            'passed straight through.',
      );
      expect(
        gradle,
        contains(r'val APPLE_TEAM_ID = Regex("^[A-Z0-9]{10}$")'),
        reason: 'the shape a deployed build enforces must be the shape asserted '
            'here',
      );
      expect(
        gradle,
        contains('if (!APPLE_TEAM_ID.matches(supplied))'),
        reason: 'a deployed build must reject a Team ID that is not shaped like '
            'one, which is also what refuses the test-only value when it is '
            'supplied deliberately',
      );
      expect(
        gradle,
        contains('if (supplied.isEmpty())'),
        reason: 'a deployed build must refuse when no Team ID was configured. '
            'There is no default: a default would be a fabricated identity with '
            'a friendlier name.',
      );
      expect(
        gradle,
        contains('document.contains(TEST_ONLY_TEAM_ID)'),
        reason: 'the generator must also check its own OUTPUT before writing it, '
            'so a future edit to the environment branch fails the build instead '
            'of shipping',
      );

      final rules = _generatedRules();
      final List<_GeneratedRules> deployed = rules
          .where((_GeneratedRules resource) => resource.isDeployed)
          .toList();
      for (final resource in deployed) {
        expect(
          resource.raw,
          isNot(contains(_testOnlyTeamId)),
          reason: '${resource.path} was generated for ${resource.environment} and '
              'contains the test-only Team ID. Only LOCAL may declare it.',
        );
        final String? teamId = _teamIdOf(resource);
        expect(
          teamId != null && _appleTeamIdShape.hasMatch(teamId),
          isTrue,
          reason: '${resource.path} was generated for ${resource.environment} and '
              'declares teamId="$teamId", which is not an Apple Team ID. A value '
              'nothing can match looks configured and is inert.',
        );
      }
    });
  });

  group('Android debug network policy', () {
    late String debugConfig;

    setUpAll(() {
      debugConfig = _declarations(_debugNetworkConfig);
    });

    test('it lives in the debug source set, so release cannot contain it', () {
      expect(
        _debugNetworkConfig,
        contains('/src/debug/'),
        reason: 'source-set scoping is what makes the exception structurally absent '
            'from a release artifact rather than merely switched off in it',
      );
    });

    test('its base configuration still forbids cleartext', () {
      expect(
        debugConfig,
        contains('<base-config cleartextTrafficPermitted="false">'),
        reason: 'the loopback permission must be an explicit exception, not a '
            'relaxed default',
      );
    });

    test('cleartext is permitted for loopback hosts only', () {
      final domains = RegExp(r'<domain[^>]*>([^<]+)</domain>')
          .allMatches(debugConfig)
          .map((RegExpMatch match) => match.group(1)!.trim())
          .toList(growable: false);

      expect(domains, isNotEmpty, reason: 'the exception must name its hosts');
      for (final domain in domains) {
        expect(
          _permittedCleartextHosts,
          contains(domain),
          reason: '$domain is not a loopback host. Only the developer machine may '
              'be reached over plain HTTP, in debug builds only.',
        );
      }
    });

    test('debug builds do not trust user-installed certificate authorities', () {
      expect(
        debugConfig,
        isNot(contains('src="user"')),
        reason: 'an intercepting proxy must not be able to read this application by '
            'installing a certificate, in any build type. Inspect traffic at the '
            'local API instead.',
      );
    });
  });

  group('Android packaging and signing', () {
    late String gradle;

    setUpAll(() {
      gradle = stripCodeComments(readRequiredFile(_appGradle));
    });

    test('the application id is the owned reverse-domain identifier', () {
      expect(gradle, contains('applicationId = "com.kararfinance.app"'));
      expect(
        gradle,
        isNot(contains('qa.karar')),
        reason: 'the template identifier embedded a country code in the package name; '
            'jurisdiction is decided by backend policy, never by which binary was '
            'installed',
      );
    });

    test('the release build type never falls back to the debug signing key', () {
      final releaseBlock = RegExp(r'release \{(.*?)\n        \}', dotAll: true)
          .firstMatch(gradle)
          ?.group(1);
      expect(releaseBlock, isNotNull, reason: 'a release build type must be declared');
      expect(
        releaseBlock,
        isNot(contains('getByName("debug")')),
        reason: 'signing a release with the world-readable debug key would be worse '
            'than shipping an unsigned artifact',
      );
      expect(releaseBlock, contains('isDebuggable = false'));
    });

    test('every environment except production carries an id suffix', () {
      // Only an unsuffixed artifact is a production artifact, and production
      // must be asked for explicitly.
      for (final environment in <String>['LOCAL', 'DEV', 'STAGING']) {
        expect(
          gradle,
          contains('"$environment" to ".'),
          reason: '$environment builds must be installable beside production and '
              'never mistakable for it',
        );
      }
      expect(gradle, contains('"PRODUCTION" to ""'));
    });

    test('no per-country build variant exists', () {
      // Brand and environment are the only dimensions. Country and jurisdiction
      // come from backend policy.
      for (final country in <String>['qatar', 'uae', 'saudi', 'oman', 'kuwait', 'bahrain']) {
        expect(
          gradle.toLowerCase(),
          isNot(contains(country)),
          reason: 'a per-country variant would move a jurisdiction decision into the '
              'build system',
        );
      }
      expect(
        gradle,
        isNot(contains('productFlavors')),
        reason: 'environments are build configuration, not source forks',
      );
    });
  });

  group('iOS App Transport Security', () {
    late String plist;

    setUpAll(() {
      plist = _declarations(_infoPlist);
    });

    // The Android equivalents above are asserted against a release source set
    // that a debug build replaces, so "the exception is not in the release
    // artifact" is a property of this repository. iOS has no source sets: it
    // builds ONE Info.plist for every configuration, so the same property
    // cannot be established here at all. It is established in the packaged
    // artifact instead — see ios_packaged_bundle_test.dart, which reads the
    // plist inside the built `.app`. What is asserted HERE is the one thing
    // this file can see: that the shared plist declares no exception for the
    // build to inherit.
    test('the shared plist declares no transport security of any kind', () {
      for (final key in <String>[
        'NSAppTransportSecurity',
        'NSExceptionDomains',
        'NSAllowsArbitraryLoads',
        'NSAllowsArbitraryLoadsInWebContent',
        'NSAllowsArbitraryLoadsForMedia',
        'NSAllowsLocalNetworking',
      ]) {
        expect(
          plist,
          isNot(contains(key)),
          reason: 'anything declared in this file is in EVERY iOS artifact, '
              'including DEV, STAGING and PRODUCTION. $key must not be one of '
              'them; a deployed build relies on the platform transport policy.',
        );
      }
    });

    test('the local-development exception is a fragment, scoped by a build phase', () {
      final fragment = _declarations('ios/Runner/ATSLocalDevelopment.plist');
      expect(
        fragment,
        contains('<key>localhost</key>'),
        reason: 'ATS applies to loopback, so the LOCAL profile needs this one '
            'exception. No routable host may be added.',
      );
      expect(
        fragment,
        contains('<key>NSAllowsArbitraryLoads</key> <false/>'),
        reason: 'stated rather than omitted, so turning it on is a visible edit to an '
            'explicit decision',
      );
      for (final key in <String>[
        'NSAllowsArbitraryLoadsInWebContent',
        'NSAllowsArbitraryLoadsForMedia',
        'NSAllowsLocalNetworking',
      ]) {
        expect(
          fragment,
          isNot(contains(key)),
          reason: '$key relaxes ATS for a whole class of traffic rather than one host',
        );
      }
    });

    test('the bundle identifier is the owned reverse-domain identifier', () {
      final project = readRequiredFile('ios/Runner.xcodeproj/project.pbxproj');

      // The value is quoted because it interpolates a build setting, and an
      // unquoted `$(...)` makes the whole project file unparseable to Xcode.
      // That failure mode is silent in this repository — nothing but an actual
      // iOS build catches it — so the quoting is asserted, not assumed.
      //
      // THIS TEST IS NOT ABOUT THE ARTIFACT AND CANNOT BE.
      //
      // It passed unchanged through the whole period in which LOCAL, DEV,
      // STAGING and PRODUCTION all produced `com.kararfinance.app`, because a
      // prefix check on a build setting says nothing about what any build was
      // called. What the artifact is called is asserted in
      // ios_packaged_bundle_test.dart against the packaged plist, and the
      // cross-platform group below asserts the two platforms agree. This stays
      // for the one thing it does establish: the project file names the owned
      // identifier and nothing else.
      final identifiers = RegExp(r'PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);')
          .allMatches(project)
          .map((RegExpMatch match) => match.group(1)!.trim())
          .toSet();

      expect(identifiers, isNotEmpty);
      for (final identifier in identifiers) {
        expect(
          identifier,
          startsWith('"${baseApplicationId()}'),
          reason: '$identifier must be the owned identifier, and must be quoted '
              'because it interpolates a build setting',
        );
        expect(identifier, endsWith('"'));
      }

      expect(
        project,
        isNot(contains('qa.karar')),
        reason: 'the template identifier embedded a country code',
      );
    });

    test('no signing identity, team or provisioning profile is committed', () {
      final project = readRequiredFile('ios/Runner.xcodeproj/project.pbxproj');
      final teamAssignments = RegExp(r'DEVELOPMENT_TEAM = ([^;]+);')
          .allMatches(project)
          .map((RegExpMatch match) => match.group(1)!.trim())
          .where((String value) => value.isNotEmpty && value != '""')
          .toList(growable: false);
      expect(
        teamAssignments,
        isEmpty,
        reason: 'release signing material is supplied externally at release time',
      );
      expect(project, isNot(contains('PROVISIONING_PROFILE_SPECIFIER = "')));
    });
  });

  // ONE RULE, TWO PLATFORMS, AND THE ARTIFACTS THEY ACTUALLY PRODUCED.
  //
  // The Android data-extraction rules NAME the iOS counterpart by bundle
  // identifier. For as long as the iOS xcconfigs left KARAR_BUNDLE_ID_SUFFIX
  // empty, that element was a claim about an identifier no iOS build produced:
  // a DEV artifact named `com.kararfinance.app.dev` while every iOS build,
  // whatever it was compiled for, was `com.kararfinance.app`. The generator
  // recorded the gap in a comment. A comment is not a control.
  //
  // Closing it needs three things, and all three are here:
  //
  //   1. ONE RULE. `applicationId` and `environmentSuffixes` in
  //      app/build.gradle.kts are the authority. ios/Scripts/bundle_identity.sh
  //      is a second ENCODING of it — a shell file, because the iOS build phase
  //      is a shell script — and it is asserted equal rather than trusted.
  //
  //   2. THE BUILT ARTIFACTS, not the sources. The merged manifest's package
  //      attribute is the applicationId a build actually produced; the packaged
  //      plist's CFBundleIdentifier is what the iOS artifact actually calls
  //      itself. Both are read here.
  //
  //   3. NO APPLE TEAM ID ANYWHERE. Agreeing about the identifier is not the
  //      same as being able to configure the cross-platform transfer, which
  //      needs an identity this project does not have. That refusal is asserted
  //      in the data-extraction group above and is untouched by any of this.
  group('cross-platform application identity', () {
    test('both platforms encode the same environment-to-identifier rule', () {
      // Character-for-character, not "both contain .dev somewhere". The two
      // encodings exist because the two build systems cannot read each other's;
      // that is a reason for two files, not for two rules.
      expect(
        iosBaseBundleIdentifier(),
        baseApplicationId(),
        reason: 'the iOS build phase derives from a different base identifier '
            'than the Android build packages. One of the two is naming an '
            'application this project does not own.',
      );
      expect(
        iosEnvironmentSuffixRule(),
        environmentSuffixRule(),
        reason: 'the suffix table in $iosBundleIdentityRules and the one in '
            '$_appGradle are not the same rule. They must be, because the '
            "Android artifact's data-extraction rules name the iOS artifact by "
            'the identifier this table produces.',
      );
      expect(
        iosDeclaredEnvironments().toSet(),
        declaredEnvironments().toSet(),
        reason: 'the environment list the iOS build phase validates against is '
            'not the set of environments the product has',
      );
    });

    test('only production is unsuffixed, on both platforms', () {
      // Restating the Android-only assertion above in the form that matters
      // across platforms: the empty suffix is production's, and it is the only
      // empty one. An artifact with no suffix is a production artifact whatever
      // built it.
      final Map<String, String> rule = environmentSuffixRule();
      expect(
        rule['PRODUCTION'],
        isEmpty,
        reason: 'production must be the unsuffixed identity, or nothing is',
      );
      for (final MapEntry<String, String> entry in rule.entries) {
        if (entry.key == 'PRODUCTION') continue;
        expect(
          entry.value,
          isNotEmpty,
          reason: '${entry.key} maps to an empty suffix, so a ${entry.key} '
              'artifact carries the production identifier on both platforms. It '
              'would install over production, and an App Store record for that '
              'identifier would accept it.',
        );
      }
      // Distinct, not merely non-empty: two environments sharing a suffix is
      // the same collision with more steps.
      expect(
        rule.values.toSet().length,
        rule.length,
        reason: 'two environments map to the same identifier in $rule',
      );
    });

    test('the applicationId a build produced is the rule\'s value for the '
        'environment that assembly recorded', () {
      // The MERGED manifest, because `applicationIdSuffix` is applied by the
      // build: the Gradle source states an intention and the merged manifest
      // states the result. Pairing it with the environment recorded in the
      // generated rules resource is what makes this non-vacuous — it asserts
      // that `-Pkarar.env` and `applicationIdSuffix` produced the same answer
      // in one assembly, rather than inverting the identifier and comparing it
      // with itself.
      final Map<String, String> observed = builtAndroidApplicationIds();
      if (observed.isEmpty) {
        _requireBuildIfExpected();
        markTestSkipped(
          'no merged manifest present — run `flutter build apk --debug '
          '-Pkarar.env=LOCAL --dart-define=KARAR_ENV=LOCAL` first',
        );
        return;
      }

      final Set<String> assembled = _generatedRules()
          .map((_GeneratedRules resource) => resource.environment)
          .whereType<String>()
          .toSet();
      expect(
        assembled,
        isNotEmpty,
        reason: 'a build produced a merged manifest but no generated '
            'data-extraction rules, so there is nothing that says which '
            'environment it was assembled for',
      );

      final Set<String> expectedIdentifiers = assembled
          .map(counterpartBundleIdentifier)
          .toSet();
      for (final MapEntry<String, String> entry in observed.entries) {
        expect(
          expectedIdentifiers,
          contains(entry.value),
          reason: '${entry.key} declares package="${entry.value}", which is not '
              'what the rule produces for any environment this tree was '
              'assembled for ($assembled). The packaged identity and the '
              'requested environment have come apart.',
        );
      }
    });

    test('the iOS artifact is named what the Android build names its '
        'counterpart', () {
      // THE ASSERTION THE OLD COMMENT SAID COULD NOT BE MADE.
      //
      // `counterpartBundleId.set(variant.applicationId)` asserts the iOS
      // counterpart of a DEV Android artifact is `com.kararfinance.app.dev`.
      // The generator's own doc comment recorded that this was NOT CLAIMED to
      // be true, because no iOS build produced that identifier. This reads the
      // built iOS bundles and claims it.
      final List<PackagedIosBundle> bundles = packagedIosBundles();
      if (bundles.isEmpty) {
        if (!Platform.isMacOS) {
          markTestSkipped(
            'no iOS artifact can be read without plutil; the Android gate does '
            'not promise one',
          );
          return;
        }
        markTestSkipped(
          'no built iOS bundle under build/ios. Run `flutter build ios '
          '--simulator --debug --dart-define=KARAR_ENV=LOCAL`; '
          'KARAR_VERIFY_IOS_ARTIFACT makes its absence a failure in '
          'ios_packaged_bundle_test.dart.',
        );
        return;
      }

      for (final PackagedIosBundle bundle in bundles) {
        expect(
          declaredEnvironments(),
          contains(bundle.environment),
          reason: '${bundle.label} records no usable environment '
              "('${bundle.environment}'), so what it should be called cannot be "
              'derived. The packaging phase refuses to produce such an artifact.',
        );
        expect(
          bundle.bundleIdentifier,
          counterpartBundleIdentifier(bundle.environment),
          reason: '${bundle.label} was compiled for ${bundle.environment} and '
              "calls itself '${bundle.bundleIdentifier}', but the Android build "
              'names '
              "'${counterpartBundleIdentifier(bundle.environment)}' as the iOS "
              'counterpart for that environment',
        );
      }

      // And directly, artifact to artifact, wherever both were built.
      final Map<String, String> android = builtAndroidApplicationIds();
      final Map<String, String> environments = environmentByBundleIdentifier();
      for (final PackagedIosBundle bundle in bundles) {
        for (final MapEntry<String, String> entry in android.entries) {
          if (environments[entry.value] != bundle.environment) continue;
          expect(
            bundle.bundleIdentifier,
            entry.value,
            reason: 'the ${bundle.environment} iOS artifact (${bundle.label}) '
                "is '${bundle.bundleIdentifier}' and the ${bundle.environment} "
                "Android artifact (${entry.key}) is '${entry.value}'",
          );
        }
      }
    });

    test('a deployed artifact names its counterpart by the same rule', () {
      // The bundleId attribute in the generated resource, checked against the
      // rule rather than against a literal. LOCAL is excluded because it
      // deliberately declares the test-only identity instead — the counterpart
      // it would otherwise name is one no App Store record exists for, and the
      // test-only value is what keeps an invented identity out of a LOCAL
      // artifact. That branch is asserted in the data-extraction group above
      // and is not weakened here.
      final rules = _generatedRules()
          .where((_GeneratedRules resource) => resource.isDeployed)
          .toList();
      if (rules.isEmpty) {
        markTestSkipped(
          'no deployed data-extraction rules were generated; a deployed '
          'assembly also requires an Apple Team ID, which this repository does '
          'not hold',
        );
        return;
      }

      for (final resource in rules) {
        final String? declared =
            RegExp(r'<platform-specific-params[^>]*bundleId="([^"]*)"')
                .firstMatch(resource.declarations)
                ?.group(1);
        expect(
          declared,
          counterpartBundleIdentifier(resource.environment!),
          reason: '${resource.path} was generated for ${resource.environment} '
              "and names '$declared' as the iOS counterpart, which is not the "
              'identifier an iOS build of that environment produces',
        );
      }
    });
  });

  group('no analytics, crash-reporting, advertising or fingerprinting SDK', () {
    test('none is configured on either platform', () {
      // The architecture suite already bans these as pub dependencies. They can
      // also arrive as a native Gradle dependency or an iOS package, which that
      // check would not see.
      const List<String> forbidden = <String>[
        'firebase',
        'crashlytics',
        'com.google.android.gms',
        'analytics',
        'appsflyer',
        'adjust.com',
        'amplitude',
        'mixpanel',
        'segment.com',
        'sentry',
        'bugsnag',
        'datadog',
        'facebook',
        'admob',
        'fingerprint',
      ];

      final offenders = <String>[];
      for (final file in readSourceFiles(<String>['android', 'ios'])) {
        if (file.relativePath.endsWith('platform_hardening_test.dart')) {
          continue;
        }
        final body = stripCodeComments(file.contents).toLowerCase();
        for (final marker in forbidden) {
          if (body.contains(marker)) {
            offenders.add('${file.relativePath}: $marker');
          }
        }
      }

      expect(
        offenders,
        isEmpty,
        reason: 'no telemetry SDK may exist anywhere in this product. Found: $offenders',
      );
    });
  });
}

/// One generated data-extraction rules resource, and which profile made it.
final class _GeneratedRules {
  const _GeneratedRules({
    required this.path,
    required this.environment,
    required this.raw,
    required this.declarations,
  });

  /// Where it was found, so a failure names the file rather than a rule.
  final String path;

  /// The profile the generator recorded in the resource's own header. This is
  /// what makes it possible to say whether the test-only identity in a given
  /// file is expected or is a finding — the output directory is named after the
  /// build type, which says nothing about the environment.
  final String? environment;

  /// The file as written, comments and all. The provenance header is a comment,
  /// so the environment cannot be read off the stripped form.
  final String raw;

  /// What the resource DECLARES: comments removed, whitespace collapsed.
  final String declarations;

  bool get isLocal => environment == 'LOCAL';

  /// A profile whose artifact is meant to be installed somewhere other than the
  /// machine that built it. An unrecognised header is treated as deployed: the
  /// safe reading of "this file does not say what it is" is not "it is LOCAL".
  bool get isDeployed => environment != 'LOCAL';
}

/// Every generated rules resource in the build output.
///
/// Only the GENERATOR's own outputs are read, not the merged or packaged
/// copies. A merged copy for a variant this session did not build can be left
/// over from an earlier one, and a stale file is a worse assertion than none.
/// What reaches the APK is checked on the APK itself, with aapt2, in CI.
List<_GeneratedRules> _generatedRules() {
  final String packageRoot = mobilePackageRoot().path;
  final Directory generated = Directory('$packageRoot/build/app/generated');
  final Directory fallback = Directory('$packageRoot/build');
  final Directory root = generated.existsSync() ? generated : fallback;
  if (!root.existsSync()) return const <_GeneratedRules>[];

  final results = <_GeneratedRules>[];
  for (final entity in root.listSync(recursive: true)) {
    if (entity is! File) continue;
    final String path = entity.path.replaceAll(r'\', '/');
    if (!path.endsWith('/$_generatedResourceName')) continue;
    if (!path.contains('/generated/')) continue;
    final String raw = entity.readAsStringSync();
    results.add(
      _GeneratedRules(
        path: path.substring(packageRoot.length + 1),
        environment:
            RegExp(r'karar\.env\s*=\s*([A-Z]+)').firstMatch(raw)?.group(1),
        raw: raw,
        declarations: collapseXmlWhitespace(stripXmlComments(raw)),
      ),
    );
  }
  return results;
}

/// The generated resources, or null when none exists and the absence is
/// tolerated.
///
/// Returning null means the caller should return: the assertion has been
/// recorded as skipped. When the gate variable is set it fails instead, because
/// a lane that promised to build and then found nothing to read is the failure
/// this gate exists to catch.
List<_GeneratedRules>? _generatedRulesOrSkip() {
  final List<_GeneratedRules> rules = _generatedRules();
  if (rules.isNotEmpty) return rules;
  expect(
    _androidBuildIsExpected,
    isFalse,
    reason: '$_androidGateVariable is set, so an assembly must have generated a '
        'data-extraction rules resource — but none was found under build/. The '
        'resource is produced per assembly; nothing to read means nothing was '
        'assembled, and passing by absence is what this gate prevents.',
  );
  markTestSkipped(
    'no generated data-extraction rules present — run '
    '`flutter build apk --debug -Pkarar.env=LOCAL --dart-define=KARAR_ENV=LOCAL` first',
  );
  return null;
}

/// Fails when a build was promised and produced no LOCAL resource.
void _requireLocalArtifactIfExpected() {
  expect(
    _androidBuildIsExpected,
    isFalse,
    reason: '$_androidGateVariable is set, so a LOCAL assembly must have run — '
        'but every generated rules resource was produced for another profile. '
        'The test-only identity is only ever asserted against a LOCAL artifact, '
        'so without one this assertion never runs.',
  );
}

/// The body of one section of a generated resource.
String _sectionOf(_GeneratedRules resource, String mode) {
  // The opening tag may carry attributes — <cross-platform-transfer> REQUIRES
  // `platform`, and omitting it does not make the section permissive, it makes
  // the resource invalid. Matching the bare `<mode>` form would fail on a
  // correct file and pass on one missing the attribute, which is backwards.
  final RegExpMatch? match =
      RegExp('<$mode(?:\\s[^>]*)?>(.*?)</$mode>', dotAll: true)
          .firstMatch(resource.declarations);
  expect(
    match,
    isNotNull,
    reason: '${resource.path} declares no <$mode> section. An undeclared mode is '
        'documented as fully enabled for all content, not off.',
  );
  return match!.group(1)!;
}

/// The Team ID a generated resource declares, or null when it declares none.
String? _teamIdOf(_GeneratedRules resource) =>
    RegExp(r'<platform-specific-params[^>]*teamId="([^"]*)"')
        .firstMatch(resource.declarations)
        ?.group(1);

/// The string entries of a `listOf(...)` assigned to [name] in a Kotlin source.
///
/// Used to compare the generator's declared sets EXACTLY, rather than checking
/// that each expected entry appears somewhere in the file — which would pass on
/// a list that also contains something nobody reviewed.
Set<String> _kotlinStringList(String kotlin, String name) {
  final RegExpMatch? match =
      RegExp('val $name =\\s*\\n?\\s*listOf\\(([^)]*)\\)', dotAll: true)
          .firstMatch(kotlin);
  expect(
    match,
    isNotNull,
    reason: '$_appGradle declares no `val $name = listOf(...)`, so the generated '
        'resource is built from something this assertion cannot see',
  );
  return RegExp(r'"([^"]*)"')
      .allMatches(match!.group(1)!)
      .map((RegExpMatch entry) => entry.group(1)!)
      .toSet();
}

/// The permissions a merged manifest requests, split by who defines them.
///
/// The split matters because the two halves are checked differently: platform
/// permissions have fixed names and are matched exactly, while an
/// application-defined one carries the applicationId and therefore varies with
/// the environment suffix.
final class _MergedPermissions {
  const _MergedPermissions(this.platform, this.other);

  /// `android.permission.*` — capabilities the operating system grants.
  final Set<String> platform;

  /// Everything else: permissions an application or a library defines itself.
  final Set<String> other;
}

/// The environment variable a lane sets once it has built the APK, mirroring
/// `KARAR_VERIFY_IOS_ARTIFACT` on the iOS side.
///
/// Without it these assertions skip wherever no build output exists, which is
/// every lane that runs the suite without first building — so the check that
/// matters most silently never runs. A lane that has built sets this, and a
/// missing artifact then fails instead of skipping.
const String _androidGateVariable = 'KARAR_VERIFY_ANDROID_ARTIFACT';

bool get _androidBuildIsExpected {
  final String value =
      (Platform.environment[_androidGateVariable] ?? '').trim().toLowerCase();
  return value == '1' || value == 'true' || value == 'yes';
}

/// Fails when a build was promised and is absent; otherwise records the skip.
///
/// Returning normally means the caller may treat the absence as a skip.
void _requireBuildIfExpected() {
  expect(
    _androidBuildIsExpected,
    isFalse,
    reason: '$_androidGateVariable is set, so a built APK and its merged '
        'manifest must be present — but none was found. Build the debug APK '
        'before running this suite, or unset the variable. Passing by absence '
        'is exactly the failure this gate exists to prevent.',
  );
}

/// The permissions of the merged manifest an actual build produces, or null
/// when no build output is present. The merger — not this repository's source —
/// decides what the installed application requests.
///
/// Every merged manifest under the build directory is read and the results
/// unioned, so a permission present in one variant and not another is still
/// caught.
_MergedPermissions? _mergedManifestPermissions() {
  final Directory intermediates =
      Directory('android/app/build/intermediates/merged_manifest');
  final Directory fallback = Directory('build/app/intermediates/merged_manifest');
  final Directory root = intermediates.existsSync() ? intermediates : fallback;
  if (!root.existsSync()) return null;

  final Iterable<File> manifests = root
      .listSync(recursive: true)
      .whereType<File>()
      .where((File file) => file.path.endsWith('AndroidManifest.xml'));
  if (manifests.isEmpty) return null;

  final Set<String> platform = <String>{};
  final Set<String> other = <String>{};
  for (final File manifest in manifests) {
    // Comments are stripped first, on the same rule as every other assertion in
    // this file: the merger copies the source manifest's prose into its output,
    // and that prose names permissions.
    final String declarations = stripXmlComments(manifest.readAsStringSync());
    for (final RegExpMatch match
        in RegExp(r'<uses-permission[^>]*android:name="([^"]+)"')
            .allMatches(declarations)) {
      final String name = match.group(1)!;
      (name.startsWith('android.permission.') ? platform : other).add(name);
    }
  }
  if (platform.isEmpty && other.isEmpty) return null;
  return _MergedPermissions(platform, other);
}
