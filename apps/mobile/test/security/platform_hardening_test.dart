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

import 'support/source_tree.dart';

const String _androidManifest = 'android/app/src/main/AndroidManifest.xml';
const String _releaseNetworkConfig =
    'android/app/src/main/res/xml/network_security_config.xml';
const String _debugNetworkConfig =
    'android/app/src/debug/res/xml/network_security_config.xml';
const String _dataExtractionRules =
    'android/app/src/main/res/xml/data_extraction_rules.xml';
const String _appGradle = 'android/app/build.gradle.kts';
const String _infoPlist = 'ios/Runner/Info.plist';

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

    test('every extraction mode is declared and excludes every domain', () {
      final rules = _declarations(_dataExtractionRules);

      for (final mode in _dataExtractionModes) {
        // The opening tag may carry attributes — `<cross-platform-transfer>`
        // REQUIRES `platform`, and omitting it does not make the section
        // permissive, it makes the whole resource invalid and fails
        // lintVitalRelease. Matching the bare `<mode>` form would therefore
        // fail on a correct file and pass on one missing the attribute
        // entirely, which is backwards.
        final RegExp opening = RegExp('<$mode(\\s[^>]*)?>');
        expect(
          opening.hasMatch(rules),
          isTrue,
          reason: 'an undeclared <$mode> section is fully enabled for all content, '
              'not off',
        );

        final section =
            RegExp('<$mode(?:\\s[^>]*)?>(.*?)</$mode>', dotAll: true)
                .firstMatch(rules)
                ?.group(1);
        expect(section, isNotNull);
        for (final domain in _backupDomains) {
          expect(
            section,
            contains('<exclude domain="$domain" />'),
            reason: '$mode does not exclude the $domain domain. Session tokens live '
                'in sharedpref, and a domain left unnamed is a domain left in',
          );
        }
      }

      expect(
        rules,
        isNot(contains('<include')),
        reason: 'an include element would re-admit content to a mode this file exists '
            'to empty',
      );
    });

    test('cross-platform-transfer names exactly the platform it governs', () {
      // AN EXACT VALUE, NOT A PATTERN. The previous version of this test
      // accepted `platform="[a-z_]+"`, and so happily certified
      // `platform="apple_icloud"` — a value invented in this repository that
      // appears in no AOSP source and in no lint rule.
      //
      // A pattern is the wrong shape of assertion here because nothing else
      // rejects a wrong value either. `FullBackup.java:735` reads the
      // attribute as an opaque string and uses it as a map key; the platform
      // publishes no enumeration, and `FullBackupContentDetector` checks only
      // that the attribute is PRESENT. So a misspelled platform builds
      // cleanly, passes lint, ships, and silently addresses a target nobody
      // transfers to — the section looks correct and does nothing.
      //
      // `ios` is the only cross-platform target the framework names:
      // BackupAgent.FLAG_CROSS_PLATFORM_DATA_TRANSFER_IOS, "a cross-platform
      // transfer to or from iOS".
      final rules = _declarations(_dataExtractionRules);

      expect(
        rules,
        contains('<cross-platform-transfer platform="ios">'),
        reason: 'the section must name exactly platform="ios"',
      );
      expect(
        rules,
        isNot(contains('apple_icloud')),
        reason: 'apple_icloud was invented here and names no real platform; a '
            'wrong value makes the section inert without failing anything',
      );

      // Exactly one such section. Two would let a reviewer read the correct
      // one while the framework parsed the other.
      final sections =
          RegExp('<cross-platform-transfer').allMatches(rules).length;
      expect(
        sections,
        1,
        reason: 'found $sections cross-platform-transfer sections; the '
            'framework iterates every matching element, so a duplicate is a '
            'second policy nobody reviewed',
      );

      // And no other value can appear on it, however spelled.
      for (final RegExpMatch match
          in RegExp(r'<cross-platform-transfer[^>]*>').allMatches(rules)) {
        final String opening = match.group(0)!;
        final String? platform =
            RegExp(r'platform="([^"]*)"').firstMatch(opening)?.group(1);
        expect(
          platform,
          'ios',
          reason: 'cross-platform-transfer declares platform="$platform". '
              'Only "ios" is a target the framework names, and a value it does '
              'not recognise is accepted silently rather than refused.',
        );
      }
    });

    test('no platform-specific-params element is declared at all', () {
      // ABSENCE IS THE ASSERTION, NOT PLAUSIBILITY.
      //
      // The previous version rejected a list of literal placeholders — TEAMID,
      // XXXXXXXXXX, TODO. An independent review inserted
      // `teamId="9ZX7Q4KD22"`, an entirely invented but syntactically valid
      // Team ID, and the whole suite passed. A test that can only recognise
      // obviously-fake identities cannot distinguish a real one from a
      // convincing fabrication, which is the only distinction that matters.
      //
      // So the rule is categorical: the element must not appear. It carries
      // bundleId, teamId and contentVersion, which identify the iOS
      // counterpart data may be matched TO — they exist to ENABLE a match, and
      // the framework reads the presence of an entry as "export to and import
      // from that platform is supported" (FullBackup.java:486-488). Absence
      // leaves the map empty, which the framework reads as NOT supported.
      //
      // Adding it is therefore a deliberate decision requiring a real,
      // configured, evidenced Apple Team ID and a published counterpart app.
      // When that happens, this test is the place the decision is recorded —
      // by being changed, on purpose, with the evidence in the commit.
      final rules = _declarations(_dataExtractionRules);
      expect(
        rules,
        isNot(contains('platform-specific-params')),
        reason: 'a platform-specific-params element appeared. No Apple Team ID '
            'is configured for this project and no iOS counterpart is '
            'published, so any value here is fabricated. Absence is what the '
            'framework reads as unsupported; a fabricated identity is what it '
            'reads as supported.',
      );
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
      final identifiers = RegExp(r'PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);')
          .allMatches(project)
          .map((RegExpMatch match) => match.group(1)!.trim())
          .toSet();

      expect(identifiers, isNotEmpty);
      for (final identifier in identifiers) {
        expect(
          identifier,
          startsWith('"com.kararfinance.app'),
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
