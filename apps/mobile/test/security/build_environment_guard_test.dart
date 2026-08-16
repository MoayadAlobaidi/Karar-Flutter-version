// THE BUILD-TIME ENVIRONMENT GUARD.
//
// A deployed-environment artifact must not be producible without the
// configuration it needs. The Dart configuration loader already refuses a
// missing, loopback, plain-HTTP or credential-bearing base URL, so such a build
// fails closed at runtime — but by then the artifact exists, carries the
// PRODUCTION package identity, and is distributable. The guard that matters
// runs in Gradle, before anything is packaged.
//
// These tests do not invoke Gradle: a Gradle run needs a JDK 17+ toolchain that
// is not present on every machine or CI lane, and a test that silently skips is
// worse than none. They assert instead that every rule the guard is required to
// enforce is PRESENT in the build script, so deleting or weakening one is a red
// build here. The behavioural proof — each rule rejecting a real build — is
// recorded in the phase report against executed Gradle invocations.
//
// The two layers are deliberate. Losing either is a finding:
//   Gradle  — refuses to BUILD an artifact that cannot work.
//   Dart    — refuses to START if one is somehow produced.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

File _buildScript() {
  final File script = File('android/app/build.gradle.kts');
  expect(
    script.existsSync(),
    isTrue,
    reason: 'the Android build script is the location of the build-time guard',
  );
  return script;
}

void main() {
  group('the Android build guard rejects an unconfigured deployed build', () {
    late String script;

    setUpAll(() {
      script = _buildScript().readAsStringSync();
    });

    test('absent dart-defines fail a non-LOCAL build rather than exempting it', () {
      // The original guard ran only WHEN dart-defines existed, which made
      // `./gradlew assembleRelease -Pkarar.env=PRODUCTION` — a direct
      // invocation, passing none — a complete bypass. Absence must be the
      // failure, not the exemption.
      expect(
        script,
        contains('project.findProperty("dart-defines") == null'),
        reason: 'a non-LOCAL build with no compiled configuration must fail',
      );
      expect(script, contains('Unconfigured \$requestedEnvironment build'));
    });

    test('the compiled environment must be present and must match the package', () {
      expect(script, contains('Missing environment: a \$requestedEnvironment build'));
      expect(script, contains('Environment mismatch'));
    });

    test('an endpoint is required, must be https, and must carry no credentials', () {
      expect(script, contains('Missing endpoint: a \$requestedEnvironment build'));
      expect(script, contains('Insecure endpoint'));
      expect(script, contains(r'!baseUrl.startsWith("https://")'));
      expect(script, contains('Credentials in endpoint'));
      expect(
        script,
        contains("authority.contains('@')"),
        reason: 'userinfo in a URL ships inside the artifact and is readable '
            'by anyone who unpacks it',
      );
    });

    test('a host that only resolves on a developer machine is rejected', () {
      expect(script, contains('Local-only endpoint'));
      for (final String host in <String>[
        '"localhost"',
        '"127.0.0.1"',
        '"::1"',
        // The Android emulator's alias for the host machine.
        '"10.0.2.2"',
        // RFC 2606 reserves these; they never resolve publicly.
        '".test"',
        '".localhost"',
        // mDNS and private cloud DNS respectively.
        '".local"',
        '".internal"',
      ]) {
        expect(
          script,
          contains(host),
          reason: '$host must be rejected as a deployed endpoint',
        );
      }
    });

    test('LOCAL keeps its documented default and stays buildable', () {
      expect(
        script,
        contains('if (requestedEnvironment == "LOCAL")'),
        reason: 'LOCAL is the only environment buildable without arguments',
      );
      expect(script, contains('if (requestedEnvironment != "LOCAL")'));
    });
  });
}
