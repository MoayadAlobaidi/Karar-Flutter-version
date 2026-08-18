// THE ENVIRONMENT TO BUNDLE IDENTIFIER RULE, READ RATHER THAN RESTATED.
//
// Android and iOS have to agree about what a DEV artifact is called, and the
// agreement has to be checkable. The Android data-extraction rules NAME the iOS
// counterpart by bundle identifier — that is the whole point of
// `<platform-specific-params bundleId="...">` — so "the two platforms use the
// same suffix scheme" is not a tidiness preference, it is whether that element
// identifies the application it claims to.
//
// The rule has ONE home: `applicationId` and `environmentSuffixes` in
// android/app/build.gradle.kts. Everything here is derived from those two
// declarations by reading them, never by repeating them, so an assertion cannot
// keep passing against a value the build no longer produces. The iOS side —
// ios/Scripts/bundle_identity.sh, which the `Verify Packaged Bundle` build phase
// sources — is a second ENCODING of the same rule, and it is checked for
// equality against this one rather than trusted.
//
// Nothing in this file hardcodes `com.kararfinance.app`, `.local`, `.dev` or
// `.staging`. That is deliberate to the point of being awkward in places: a
// suite that spells out the expected identifiers proves that someone typed the
// same thing twice, which is exactly the property that was already true when
// every iOS build produced `com.kararfinance.app` regardless of environment.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'source_tree.dart';

/// Where the rule lives. The Android build file is the authority; the iOS
/// script is the second encoding that must match it.
const String androidBuildGradle = 'android/app/build.gradle.kts';
const String iosBundleIdentityRules = 'ios/Scripts/bundle_identity.sh';
const String iosVerifyScript = 'ios/Scripts/verify_packaged_bundle.sh';
const String iosDebugXcconfig = 'ios/Flutter/Debug.xcconfig';
const String iosReleaseXcconfig = 'ios/Flutter/Release.xcconfig';

/// The key the iOS build phase writes into the packaged plist so an artifact
/// states which environment it was built for.
const String iosBuildEnvironmentKey = 'KararBuildEnvironment';

/// The application identifier the Android build declares, with no suffix
/// applied. This is the PRODUCTION identity on both platforms.
String baseApplicationId() {
  final String gradle = stripCodeComments(readRequiredFile(androidBuildGradle));
  final String? id = RegExp(r'applicationId\s*=\s*"([^"]+)"')
      .firstMatch(gradle)
      ?.group(1);
  expect(
    id,
    isNotNull,
    reason: '$androidBuildGradle declares no applicationId, so there is no base '
        'identifier for either platform to derive from',
  );
  return id!;
}

/// The environment-to-suffix map the Android build applies through
/// `applicationIdSuffix`.
///
/// Parsed out of the Kotlin rather than copied, so this is the map a build
/// actually uses. PRODUCTION's entry is the empty string and must stay that
/// way: an unsuffixed artifact is a production artifact.
Map<String, String> environmentSuffixRule() {
  final String gradle = stripCodeComments(readRequiredFile(androidBuildGradle));
  final RegExpMatch? block =
      RegExp(r'val environmentSuffixes[^=]*=\s*mapOf\(([^)]*)\)', dotAll: true)
          .firstMatch(gradle);
  expect(
    block,
    isNotNull,
    reason: '$androidBuildGradle declares no `val environmentSuffixes = '
        'mapOf(...)`, so the suffix rule is somewhere this suite cannot read '
        'and every derived assertion below would be about a guess',
  );

  final rule = <String, String>{};
  for (final RegExpMatch entry
      in RegExp(r'"([A-Z]+)"\s+to\s+"([^"]*)"').allMatches(block!.group(1)!)) {
    rule[entry.group(1)!] = entry.group(2)!;
  }
  expect(
    rule,
    isNotEmpty,
    reason: '$androidBuildGradle declares an empty environment suffix map',
  );
  return rule;
}

/// Every environment the product has, in the order the rule declares them.
List<String> declaredEnvironments() =>
    environmentSuffixRule().keys.toList(growable: false);

/// The identifier BOTH platforms must produce for [environment].
///
/// This is the value Android packages as its applicationId, the value its
/// generated data-extraction rules name as the iOS counterpart, and the value
/// the iOS packaged plist must declare as CFBundleIdentifier. One function, so
/// there is one answer.
String counterpartBundleIdentifier(String environment) {
  final Map<String, String> rule = environmentSuffixRule();
  expect(
    rule.containsKey(environment),
    isTrue,
    reason: "'$environment' is not one of the declared environments "
        '${rule.keys.toList()}',
  );
  return '${baseApplicationId()}${rule[environment]!}';
}

/// Every identifier the product issues, mapped back to the environment that
/// owns it. Used to say which environment an OBSERVED identifier belongs to
/// without inferring it from a directory name or a build type.
Map<String, String> environmentByBundleIdentifier() {
  final identities = <String, String>{};
  for (final String environment in declaredEnvironments()) {
    identities[counterpartBundleIdentifier(environment)] = environment;
  }
  return identities;
}

/// The base identifier the iOS build phase derives from.
String iosBaseBundleIdentifier() {
  final String script = readRequiredFile(iosBundleIdentityRules);
  final String? id = RegExp(r'^KARAR_BASE_BUNDLE_ID="([^"]*)"', multiLine: true)
      .firstMatch(script)
      ?.group(1);
  expect(
    id,
    isNotNull,
    reason: '$iosBundleIdentityRules declares no KARAR_BASE_BUNDLE_ID, so the '
        'iOS build phase has no base identifier to derive from',
  );
  return id!;
}

/// The environment-to-suffix map the iOS build phase applies.
///
/// Read off the `case` arms, which are the executable form. A comment in that
/// file naming a suffix cannot satisfy this: the pattern requires the arm's
/// `printf`, so what is parsed here is what runs.
Map<String, String> iosEnvironmentSuffixRule() {
  final String script = readRequiredFile(iosBundleIdentityRules);
  final rule = <String, String>{};
  for (final RegExpMatch arm in RegExp(
    r"""^\s*([A-Z]+)\)\s*printf\s+'%s'\s+"([^"]*)"\s*;;""",
    multiLine: true,
  ).allMatches(script)) {
    rule[arm.group(1)!] = arm.group(2)!;
  }
  expect(
    rule,
    isNotEmpty,
    reason: '$iosBundleIdentityRules declares no environment arms, so the iOS '
        'build phase resolves every environment to the same identifier — which '
        'is the defect this rule exists to close',
  );
  return rule;
}

/// The environment list the iOS build phase walks when checking that the
/// xcconfig seed is one of the identifiers this project issues.
List<String> iosDeclaredEnvironments() {
  final String script = readRequiredFile(iosBundleIdentityRules);
  final String? declared =
      RegExp(r'^KARAR_ENVIRONMENTS="([^"]*)"', multiLine: true)
          .firstMatch(script)
          ?.group(1);
  expect(
    declared,
    isNotNull,
    reason: '$iosBundleIdentityRules declares no KARAR_ENVIRONMENTS list',
  );
  return declared!.split(RegExp(r'\s+')).where((String e) => e.isNotEmpty)
      .toList(growable: false);
}

/// The `KARAR_BUNDLE_ID_SUFFIX` an xcconfig seeds PRODUCT_BUNDLE_IDENTIFIER
/// with, or null when the file does not set it.
///
/// Comments are stripped first. Both xcconfigs explain the mechanism in prose
/// that names the setting, and a paragraph about a value must not be able to
/// read as the value.
String? xcconfigBundleIdSuffix(String relativePath) {
  final String contents = stripCodeComments(readRequiredFile(relativePath));
  final RegExpMatch? match =
      RegExp(r'^\s*KARAR_BUNDLE_ID_SUFFIX\s*=(.*)$', multiLine: true)
          .firstMatch(contents);
  return match?.group(1)?.trim();
}

// ---------------------------------------------------------------------------
// What was actually built
// ---------------------------------------------------------------------------

/// One built iOS application bundle, with its packaged plist decoded.
final class PackagedIosBundle {
  const PackagedIosBundle(this.label, this.directory, this.info);

  /// The build directory the bundle came out of, for failure messages.
  final String label;
  final Directory directory;

  /// The packaged Info.plist, decoded. This is the file that ships: Xcode
  /// writes it, the Flutter tool edits it, and this project's `Verify Packaged
  /// Bundle` phase edits it last.
  final Map<String, Object?> info;

  /// The environment the build phase recorded. Empty when the phase did not
  /// run, which is itself a finding.
  String get environment =>
      (info[iosBuildEnvironmentKey] as String? ?? '').trim();

  /// The EFFECTIVE identifier of the artifact — not the xcconfig seed, not
  /// PRODUCT_BUNDLE_IDENTIFIER, but what the installed application is called.
  String get bundleIdentifier =>
      (info['CFBundleIdentifier'] as String? ?? '').trim();
}

/// Decodes a plist — binary or XML — through plutil.
///
/// Everything under a built `.app` is a binary plist, including the compiled
/// `.strings` files. Shelling out is deliberate: a binary plist parser written
/// here would put a component of this project's own between the assertion and
/// the artifact, and a bug in it would read as a passing test.
Map<String, Object?> decodePlist(File file) {
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
///
/// Bundles left over from earlier environments are kept rather than filtered:
/// each one states its own environment, so a STAGING bundle beside a LOCAL one
/// is two observations, not an ambiguity.
List<PackagedIosBundle> packagedIosBundles() {
  if (!Platform.isMacOS) {
    return const <PackagedIosBundle>[];
  }
  final Directory root = Directory('${mobilePackageRoot().path}/build/ios');
  if (!root.existsSync()) {
    return const <PackagedIosBundle>[];
  }

  final bundles = <PackagedIosBundle>[];
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
      PackagedIosBundle(
        entity.path.split('/').last,
        bundle,
        decodePlist(info),
      ),
    );
  }
  bundles.sort(
    (PackagedIosBundle a, PackagedIosBundle b) => a.label.compareTo(b.label),
  );
  return bundles;
}

/// The applicationId of every merged Android manifest a build produced, keyed
/// by the manifest that declared it.
///
/// The MERGED manifest is used rather than the Gradle source for the same
/// reason the packaged plist is used on iOS: `applicationIdSuffix` is applied
/// by the build, so the source states an intention and the merged manifest
/// states the result. This is the identifier the installed package has, and the
/// one the iOS counterpart must match.
Map<String, String> builtAndroidApplicationIds() {
  final String packageRoot = mobilePackageRoot().path;
  final observed = <String, String>{};
  for (final String relativeRoot in <String>[
    'android/app/build/intermediates',
    'build/app/intermediates',
  ]) {
    final Directory root = Directory('$packageRoot/$relativeRoot');
    if (!root.existsSync()) {
      continue;
    }
    for (final FileSystemEntity entity in root.listSync(recursive: true)) {
      if (entity is! File) continue;
      final String path = entity.path.replaceAll(r'\', '/');
      if (!path.endsWith('/AndroidManifest.xml')) continue;
      if (!path.contains('/merged_manifest')) continue;
      final String? id =
          RegExp(r'\bpackage="([^"]+)"').firstMatch(entity.readAsStringSync())
              ?.group(1);
      if (id == null) continue;
      observed[path.substring(packageRoot.length + 1)] = id;
    }
  }
  return observed;
}
