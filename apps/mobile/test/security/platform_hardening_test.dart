import 'dart:io';
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
import 'package:flutter_test/flutter_test.dart';

import 'support/source_tree.dart';

const String _androidManifest = 'android/app/src/main/AndroidManifest.xml';
const String _releaseNetworkConfig =
    'android/app/src/main/res/xml/network_security_config.xml';
const String _debugNetworkConfig =
    'android/app/src/debug/res/xml/network_security_config.xml';
const String _appGradle = 'android/app/build.gradle.kts';
const String _infoPlist = 'ios/Runner/Info.plist';

/// The only hosts a debug build may reach over plain HTTP. Every one is the
/// developer's own machine.
const List<String> _permittedCleartextHosts = <String>[
  'localhost',
  '127.0.0.1',
  '10.0.2.2',
];

String _declarations(String relativePath) =>
    collapseXmlWhitespace(stripXmlComments(readRequiredFile(relativePath)));

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

    test('the permissions a dependency contributes are known and accounted for', () {
      // This file declares one permission, but the SHIPPED artifact declares
      // three: the manifest merger adds USE_BIOMETRIC and USE_FINGERPRINT from
      // androidx.biometric, which local_auth_android depends on. Asserting only
      // on this file would let the suite pass while the installed app requests
      // permissions nobody reviewed, so the merged set is the property under
      // test and this list is the review record.
      //
      // Both are `normal` protection level: granted at install, no runtime
      // prompt, no privacy disclosure obligation beyond naming them here.
      // USE_FINGERPRINT is the pre-API-28 predecessor of USE_BIOMETRIC and is
      // contributed for backwards compatibility; minSdk is 24, so it applies.
      const Set<String> reviewedContributedPermissions = <String>{
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
      };

      final merged = _mergedManifestPermissions();
      if (merged == null) {
        // The merged manifest only exists after a Gradle build. Skipping is
        // honest; silently passing on the source manifest would not be.
        markTestSkipped('no merged manifest present — run `flutter build apk --debug` first');
        return;
      }
      expect(
        merged.difference(<String>{
          'android.permission.INTERNET',
          ...reviewedContributedPermissions,
        }),
        isEmpty,
        reason: 'a dependency contributed a permission that has not been '
            'reviewed. Add it to this list deliberately, with the reason, or '
            'remove the dependency that brings it in.',
      );
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

    test('arbitrary loads are disabled', () {
      expect(
        plist,
        contains('<key>NSAllowsArbitraryLoads</key> <false/>'),
        reason: 'stated rather than omitted, so turning it on is a visible edit to an '
            'explicit decision',
      );
    });

    test('no blanket ATS relaxation key is present', () {
      for (final key in <String>[
        'NSAllowsArbitraryLoadsInWebContent',
        'NSAllowsArbitraryLoadsForMedia',
        'NSAllowsLocalNetworking',
      ]) {
        expect(
          plist,
          isNot(contains(key)),
          reason: '$key relaxes ATS for a whole class of traffic rather than one host',
        );
      }
    });

    test('the only exception domain is loopback', () {
      final exceptionBlock =
          RegExp(r'<key>NSExceptionDomains</key> <dict>(.*?)</dict> </dict>')
              .firstMatch(plist)
              ?.group(1);
      expect(
        exceptionBlock,
        isNotNull,
        reason: 'the local-development exception must be declared explicitly',
      );

      final domains = RegExp(r'<key>([^<]+)</key>')
          .allMatches(exceptionBlock!)
          .map((RegExpMatch match) => match.group(1)!)
          .where((String key) => !key.startsWith('NS'))
          .toList(growable: false);

      expect(
        domains,
        <String>['localhost'],
        reason: 'ATS applies to loopback, so the LOCAL profile needs this one '
            'exception. No routable host may be added.',
      );
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

/// The permission set of the merged manifest an actual build produces, or null
/// when no build output is present. The merger — not this repository's source —
/// decides what the installed application requests.
Set<String>? _mergedManifestPermissions() {
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

  final Set<String> declared = <String>{};
  for (final File manifest in manifests) {
    declared.addAll(
      RegExp(r'<uses-permission[^>]*android:name="(android\.permission\.[^"]+)"')
          .allMatches(manifest.readAsStringSync())
          .map((RegExpMatch match) => match.group(1)!),
    );
  }
  return declared;
}
