// PRODUCTION NEVER FALLS BACK.
//
// The configuration loader's own suite proves the parsing rules. This suite
// asserts the SECURITY property those rules exist to produce: there is no
// input, and no absence of input, that lets a production build come up
// pointing at a developer machine, at plain HTTP, or at nothing at all.
//
// The distinction matters because the failure being guarded against is not a
// bug in parsing. It is a release engineer forgetting a flag, and the binary
// helpfully carrying on with whatever it inherited.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/configuration/app_environment.dart';
import 'package:karar_mobile/app/configuration/configuration_loader.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';

const ConfigurationLoader _loader = ConfigurationLoader();

/// Every profile that is not the developer's own machine.
const List<AppEnvironment> _nonLocalEnvironments = <AppEnvironment>[
  AppEnvironment.dev,
  AppEnvironment.staging,
  AppEnvironment.production,
];

Result<Object?> _load(Map<String, String> values, {bool release = true}) =>
    _loader.load(values: values, isReleaseBuild: release);

List<String> _violations(Result<Object?> result) {
  expect(result, isA<Failed<Object?>>(), reason: 'expected this configuration to be rejected');
  final failure = (result as Failed<Object?>).failure;
  expect(failure, isA<ConfigurationInvalidFailure>());
  return (failure as ConfigurationInvalidFailure).violations;
}

Map<String, String> _valid(String environment, String baseUrl) => <String, String>{
      ConfigurationKeys.environment: environment,
      ConfigurationKeys.apiBaseUrl: baseUrl,
      ConfigurationKeys.appVersion: '1.4.0',
      ConfigurationKeys.buildNumber: '412',
    };

void main() {
  group('a production build cannot fall back to local configuration', () {
    test('production with no API base URL is rejected outright', () {
      final result = _load(<String, String>{
        ConfigurationKeys.environment: 'PRODUCTION',
        ConfigurationKeys.appVersion: '1.4.0',
        ConfigurationKeys.buildNumber: '412',
      });
      expect(_violations(result), contains(ConfigurationViolation.apiBaseUrlMissing));
    });

    test('the LOCAL default URL is never applied to any other profile', () {
      final localDefault = ConfigurationLoader.localDefaultApiBaseUrl.toString();
      for (final environment in _nonLocalEnvironments) {
        final result = _load(<String, String>{
          ConfigurationKeys.environment: environment.identifier,
          ConfigurationKeys.appVersion: '1.4.0',
          ConfigurationKeys.buildNumber: '412',
        });
        expect(
          _violations(result),
          contains(ConfigurationViolation.apiBaseUrlMissing),
          reason: '${environment.identifier} must fail rather than inherit $localDefault',
        );
      }
    });

    test('a loopback host is rejected outside LOCAL', () {
      const List<String> loopbackUrls = <String>[
        'https://localhost:3000',
        'https://127.0.0.1:3000',
        'https://10.0.2.2:3000',
        'https://api.localhost',
        'https://karar.local',
      ];
      for (final environment in _nonLocalEnvironments) {
        for (final url in loopbackUrls) {
          expect(
            _violations(_load(_valid(environment.identifier, url))),
            contains(ConfigurationViolation.apiBaseUrlLocalInNonLocal),
            reason: '${environment.identifier} must not accept $url',
          );
        }
      }
    });

    test('plain HTTP is rejected outside LOCAL', () {
      for (final environment in _nonLocalEnvironments) {
        expect(
          _violations(_load(_valid(environment.identifier, 'http://api.example.test'))),
          contains(ConfigurationViolation.apiBaseUrlInsecure),
          reason: '${environment.identifier} must require TLS',
        );
      }
    });

    test('only LOCAL declares that it tolerates insecure transport', () {
      expect(AppEnvironment.local.allowsInsecureTransport, isTrue);
      for (final environment in _nonLocalEnvironments) {
        expect(
          environment.allowsInsecureTransport,
          isFalse,
          reason: '${environment.identifier} must never permit plain HTTP',
        );
      }
    });

    test('production is the only profile that reports itself as production', () {
      final producing = AppEnvironment.values
          .where((AppEnvironment environment) => environment.isProduction)
          .toList(growable: false);
      expect(producing, <AppEnvironment>[AppEnvironment.production]);
    });
  });

  group('an unidentified build does not run', () {
    test('a missing environment is a hard failure, not a default', () {
      expect(
        _violations(_load(<String, String>{
          ConfigurationKeys.apiBaseUrl: 'https://api.example.test',
        })),
        contains(ConfigurationViolation.environmentMissing),
      );
    });

    test('an unrecognised environment never resolves to a known profile', () {
      for (final candidate in <String>[
        'PROD',
        'production ',
        'QATAR',
        'UAE',
        'local-dev',
        'STAGING2',
        '',
      ]) {
        final parsed = AppEnvironment.tryParse(candidate);
        if (parsed != null) {
          // Only exact, case-insensitive, whitespace-trimmed matches may parse.
          expect(
            parsed.identifier,
            candidate.trim().toUpperCase(),
            reason: '"$candidate" must not resolve to a different profile',
          );
        }
      }
      expect(AppEnvironment.tryParse('PROD'), isNull);
      expect(AppEnvironment.tryParse('QATAR'), isNull);
      expect(AppEnvironment.tryParse(null), isNull);
    });

    test('a release build must state its version and build number', () {
      final violations = _violations(_load(<String, String>{
        ConfigurationKeys.environment: 'PRODUCTION',
        ConfigurationKeys.apiBaseUrl: 'https://api.example.test',
      }));
      expect(violations, contains(ConfigurationViolation.appVersionMissing));
      expect(violations, contains(ConfigurationViolation.buildNumberMissing));
    });
  });

  group('no credential may be supplied as build configuration', () {
    test('a credential-shaped build key is rejected', () {
      for (final key in <String>[
        'KARAR_API_SECRET',
        'KARAR_DB_PASSWORD',
        'CLOUDFLARE_API_TOKEN',
        'KARAR_SIGNING_KEY',
        'KARAR_PRIVATE_KEY',
        'GOOGLE_SERVICE_ACCOUNT',
        'KARAR_KEYSTORE_PASSWORD',
      ]) {
        final values = _valid('PRODUCTION', 'https://api.example.test')
          ..[key] = 'anything-at-all';
        final violations = _violations(_load(values));
        expect(
          violations.any(
            (String violation) =>
                violation.startsWith(ConfigurationViolation.secretShapedKeyPresent),
          ),
          isTrue,
          reason: '$key must stop the build rather than be compiled in',
        );
      }
    });

    test('credentials embedded in the API base URL are rejected', () {
      expect(
        _violations(_load(_valid('PRODUCTION', 'https://user:pass@api.example.test'))),
        contains(ConfigurationViolation.apiBaseUrlCredentialsPresent),
      );
    });
  });

  group('the local profile still works, and only it', () {
    test('LOCAL accepts the loopback default without any configuration', () {
      final result = _loader.load(
        values: <String, String>{ConfigurationKeys.environment: 'LOCAL'},
        isReleaseBuild: false,
      );
      expect(result, isA<Success<Object?>>());
    });

    test('LOCAL accepts plain HTTP against loopback', () {
      final result = _loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'LOCAL',
          ConfigurationKeys.apiBaseUrl: 'http://localhost:3000',
        },
        isReleaseBuild: false,
      );
      expect(result, isA<Success<Object?>>());
    });

    test('a valid production configuration is accepted', () {
      // The negative cases above would pass trivially if nothing were ever
      // accepted. This proves the loader is discriminating, not just refusing.
      expect(
        _load(_valid('PRODUCTION', 'https://api.example.test')),
        isA<Success<Object?>>(),
      );
    });
  });
}
