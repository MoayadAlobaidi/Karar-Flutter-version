// THE BUILD-TIME ENVIRONMENT GUARD.
//
// A deployed-environment artifact must not be producible without the
// configuration it needs. The Dart configuration loader already refuses a
// missing, loopback, plain-HTTP or credential-bearing base URL, so such a build
// fails closed at runtime — but by then the artifact exists, carries the
// PRODUCTION package identity, and is distributable. The guard that matters
// runs in Gradle, before anything is packaged.
//
// THESE ARE PRESENCE CHECKS, AND PRESENCE IS NOT THE SAME AS HOLDING.
//
// They assert every rule the guard must enforce is PRESENT in the build
// script, so deleting or weakening one is a red build here. They do not invoke
// Gradle, because a Gradle run needs a JDK 17+ toolchain that is not on every
// machine, and a test that silently skips is worse than none.
//
// The limit of that is not theoretical, and it is recorded here because it
// caught nobody until an independent review ran the real thing: the script
// contained a `"::1"` rule, the assertion below found the string, this file
// passed — and a PRODUCTION build with an `https://[::1]:8443` endpoint still
// succeeded, because the host was extracted by splitting on the first colon,
// which yields `[` for the bracketed form RFC 3986 requires. The rule was
// present and unreachable. A presence check certified a rule that did not hold.
//
// So the behavioural proof lives where it can actually run: `.github/workflows/
// ci.yml`, job `mobile-android`, which already installs JDK 17 and invokes
// Gradle. It asserts each unusable endpoint is REFUSED and refused for the
// stated reason, and that a routable one is still accepted. Treat the two as a
// pair — this file catches deletion, that job catches a rule that has stopped
// working.
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
        reason:
            'userinfo in a URL ships inside the artifact and is readable '
            'by anyone who unpacks it',
      );
    });

    test('a host that only resolves on a developer machine is rejected', () {
      expect(script, contains('Local-only endpoint'));
      for (final String host in <String>[
        '"localhost"',
        '"127."',
        '"0.0.0.0"',
        // The Android emulator's alias for the host machine.
        '"10.0.2.2"',
        // RFC 2606 reserves these; they never resolve publicly.
        '".test"',
        '".localhost"',
        // mDNS and private cloud DNS respectively.
        '".local"',
        '".internal"',
      ]) {
        expect(script, contains(host), reason: '$host must be rejected as a deployed endpoint');
      }
    });

    test('the host is extracted in a way that can see an IPv6 literal', () {
      // Not "is ::1 mentioned" — it was, and it did not hold. The thing worth
      // asserting is that the extraction handles the bracketed form at all,
      // because splitting on the first colon is what made the IPv6 rules
      // unreachable.
      expect(
        script,
        contains('fun hostOf('),
        reason: 'host extraction must be a named rule, not an inline split',
      );
      expect(
        script,
        contains("substringAfter('[').substringBefore(']')"),
        reason:
            'a bracketed IPv6 authority must be unwrapped before the host '
            'is compared, or every IPv6 rule below is dead code',
      );
      expect(
        script,
        contains("trimEnd('.')"),
        reason:
            'localhost. is the fully-qualified form of localhost and '
            'resolves identically, so the trailing dot must not defeat the rule',
      );
      expect(
        script,
        isNot(contains("rejectLocalOnlyHost(authority.substringBefore(':')")),
        reason:
            'this is the exact call that yielded [ for [::1]:8443 and let '
            'a PRODUCTION build through',
      );
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
