// PURE DART ONLY.
//
// Reads and VALIDATES build configuration. The rules below are the reason this
// file exists; each one has a test.
//
//   1. The environment identifier is required in a release build. There is no
//      default. A release binary that does not say what it is does not run.
//   2. PRODUCTION NEVER FALLS BACK. No default base URL, no inherited DEV
//      value, no localhost. Missing or local-looking configuration in a
//      production build is a hard failure, surfaced as CONFIG_INVALID, and the
//      application never reaches protected content.
//   3. STAGING, DEV and PRODUCTION require HTTPS. Only LOCAL may use plain
//      HTTP, and only against a loopback host.
//   4. No key whose NAME suggests a secret is accepted at all. A build that
//      tries to pass one fails rather than shipping it.
//
// This phase deliberately configures NO production API URL. A production build
// must supply one at build time.
import '../../core/errors/failure.dart';
import '../../core/errors/result.dart';
import 'app_configuration.dart';
import 'app_environment.dart';

/// Build-time keys the client reads. Nothing outside this list is consulted.
abstract final class ConfigurationKeys {
  static const String environment = 'KARAR_ENV';
  static const String apiBaseUrl = 'KARAR_API_BASE_URL';
  static const String appVersion = 'KARAR_APP_VERSION';
  static const String buildNumber = 'KARAR_BUILD_NUMBER';
  static const String brandId = 'KARAR_BRAND_ID';

  static const Set<String> all = <String>{
    environment,
    apiBaseUrl,
    appVersion,
    buildNumber,
    brandId,
  };
}

/// Machine-readable validation violations. Stable identifiers, safe to log and
/// safe to show on the configuration-error screen.
abstract final class ConfigurationViolation {
  static const String environmentMissing = 'ENVIRONMENT_MISSING';
  static const String environmentUnknown = 'ENVIRONMENT_UNKNOWN';
  static const String apiBaseUrlMissing = 'API_BASE_URL_MISSING';
  static const String apiBaseUrlMalformed = 'API_BASE_URL_MALFORMED';
  static const String apiBaseUrlInsecure = 'API_BASE_URL_INSECURE';
  static const String apiBaseUrlLocalInNonLocal = 'API_BASE_URL_LOCAL_IN_NON_LOCAL_BUILD';
  static const String apiBaseUrlCredentialsPresent = 'API_BASE_URL_CREDENTIALS_PRESENT';
  static const String secretShapedKeyPresent = 'SECRET_SHAPED_KEY_PRESENT';
  static const String appVersionMissing = 'APP_VERSION_MISSING';
  static const String buildNumberMissing = 'BUILD_NUMBER_MISSING';
}

/// The values compiled into this binary.
///
/// `String.fromEnvironment` must be evaluated in a const context to be folded
/// at compile time, which is why these are const fields rather than a loop.
abstract final class CompiledConfiguration {
  static const String environment = String.fromEnvironment(ConfigurationKeys.environment);
  static const String apiBaseUrl = String.fromEnvironment(ConfigurationKeys.apiBaseUrl);
  static const String appVersion =
      String.fromEnvironment(ConfigurationKeys.appVersion, defaultValue: '0.0.0');
  static const String buildNumber =
      String.fromEnvironment(ConfigurationKeys.buildNumber, defaultValue: '0');
  static const String brandId =
      String.fromEnvironment(ConfigurationKeys.brandId, defaultValue: 'karar');

  /// The compiled values as a map, for the loader.
  static Map<String, String> asMap() => <String, String>{
        ConfigurationKeys.environment: environment,
        ConfigurationKeys.apiBaseUrl: apiBaseUrl,
        ConfigurationKeys.appVersion: appVersion,
        ConfigurationKeys.buildNumber: buildNumber,
        ConfigurationKeys.brandId: brandId,
      };
}

/// Validates build configuration into an [AppConfiguration].
final class ConfigurationLoader {
  const ConfigurationLoader();

  /// The LOCAL default. Matches the API entrypoint the Makefile starts.
  /// Applies to LOCAL only, and to no other profile ever.
  static final Uri localDefaultApiBaseUrl = Uri.parse('http://localhost:3000');

  /// Hosts that identify a developer machine or emulator loopback.
  static const Set<String> _loopbackHosts = <String>{
    'localhost',
    '0.0.0.0',
    // Android emulator alias for the host machine.
    '10.0.2.2',
  };

  /// Domain suffixes that never resolve on the public internet.
  ///
  /// `.local` is mDNS, `.internal` is private cloud DNS, and RFC 2606 reserves
  /// `.test` and `.localhost` so they can never be delegated.
  static const List<String> _localOnlySuffixes = <String>[
    '.local',
    '.localhost',
    '.internal',
    '.test',
  ];

  /// Whether [host] only ever resolves on a developer machine.
  ///
  /// THIS MUST STAY AS WIDE AS THE BUILD GUARDS. `android/app/build.gradle.kts`
  /// and `ios/Scripts/verify_packaged_bundle.sh` refuse to BUILD a deployed
  /// artifact pointed at any of these; this function is why such an artifact
  /// would also refuse to START if one were produced another way. The two
  /// layers are each meant to be sufficient alone, so a host rejected there and
  /// accepted here is a hole in the backstop rather than a difference of
  /// opinion — and there was one: the build guards were widened for the
  /// bracketed IPv6 literal and the trailing-dot form, and this was not.
  static bool _isLocalOnlyHost(String rawHost) {
    // A trailing dot is the fully-qualified form. `localhost.` resolves exactly
    // as `localhost` does and compares equal to nothing.
    final host = rawHost.toLowerCase().replaceAll(RegExp(r'\.+$'), '');
    if (host.isEmpty) return true;
    if (_loopbackHosts.contains(host)) return true;

    // The whole 127.0.0.0/8 block, not merely 127.0.0.1.
    if (host.startsWith('127.')) return true;

    // Any spelling of the IPv6 loopback: `::1` and `0:0:0:0:0:0:0:1` are the
    // same address. Dart's Uri strips the brackets required in a URL, so the
    // host reaching here is already unwrapped.
    if (host.contains(':')) {
      if (host.replaceAll('0', '').replaceAll(':', '') == '1') return true;
      if (host == '::' || host == '::ffff:127.0.0.1') return true;
    }

    return _localOnlySuffixes.any(host.endsWith);
  }

  /// Substrings that mark a configuration KEY as one that must never be
  /// compiled into a client binary.
  static const List<String> _secretShapedKeyMarkers = <String>[
    'secret',
    'password',
    'private',
    'credential',
    'token',
    'apikey',
    'api_key',
    'service_account',
    'kms',
    'signing',
    'keystore',
  ];

  /// Validates [values] for [isReleaseBuild].
  ///
  /// Returns every violation found, not just the first, so one build fixes
  /// everything rather than discovering problems one at a time.
  Result<AppConfiguration> load({
    required Map<String, String> values,
    required bool isReleaseBuild,
  }) {
    final violations = <String>[];

    for (final key in values.keys) {
      final normalized = key.toLowerCase();
      if (ConfigurationKeys.all.contains(key)) {
        continue;
      }
      for (final marker in _secretShapedKeyMarkers) {
        if (normalized.contains(marker)) {
          violations.add('${ConfigurationViolation.secretShapedKeyPresent}:$key');
          break;
        }
      }
    }

    final rawEnvironment = _read(values, ConfigurationKeys.environment);
    final environment = AppEnvironment.tryParse(rawEnvironment);
    if (environment == null) {
      violations.add(
        rawEnvironment == null
            ? ConfigurationViolation.environmentMissing
            : ConfigurationViolation.environmentUnknown,
      );
      // Without a profile nothing else can be judged: HTTPS and locality rules
      // all depend on which environment this is.
      return Failed<AppConfiguration>(
        ConfigurationInvalidFailure(violations: List<String>.unmodifiable(violations)),
      );
    }

    final rawBaseUrl = _read(values, ConfigurationKeys.apiBaseUrl);
    Uri? apiBaseUrl;
    if (rawBaseUrl == null) {
      if (environment == AppEnvironment.local) {
        apiBaseUrl = localDefaultApiBaseUrl;
      } else {
        violations.add(ConfigurationViolation.apiBaseUrlMissing);
      }
    } else {
      final parsed = Uri.tryParse(rawBaseUrl);
      if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
        violations.add(ConfigurationViolation.apiBaseUrlMalformed);
      } else {
        apiBaseUrl = parsed;
        if (parsed.userInfo.isNotEmpty) {
          violations.add(ConfigurationViolation.apiBaseUrlCredentialsPresent);
        }
        if (parsed.scheme != 'https' && !environment.allowsInsecureTransport) {
          violations.add(ConfigurationViolation.apiBaseUrlInsecure);
        }
        if (_isLocalOnlyHost(parsed.host) && environment != AppEnvironment.local) {
          violations.add(ConfigurationViolation.apiBaseUrlLocalInNonLocal);
        }
      }
    }

    final appVersion = _read(values, ConfigurationKeys.appVersion);
    if (isReleaseBuild && (appVersion == null || appVersion == '0.0.0')) {
      violations.add(ConfigurationViolation.appVersionMissing);
    }
    final buildNumber = _read(values, ConfigurationKeys.buildNumber);
    if (isReleaseBuild && (buildNumber == null || buildNumber == '0')) {
      violations.add(ConfigurationViolation.buildNumberMissing);
    }

    if (violations.isNotEmpty || apiBaseUrl == null) {
      return Failed<AppConfiguration>(
        ConfigurationInvalidFailure(violations: List<String>.unmodifiable(violations)),
      );
    }

    return Success<AppConfiguration>(
      AppConfiguration(
        environment: environment,
        apiBaseUrl: apiBaseUrl,
        appVersion: appVersion ?? '0.0.0',
        buildNumber: buildNumber ?? '0',
        brandId: _read(values, ConfigurationKeys.brandId) ?? 'karar',
      ),
    );
  }

  String? _read(Map<String, String> values, String key) {
    final value = values[key];
    if (value == null || value.trim().isEmpty) {
      return null;
    }
    return value.trim();
  }
}
