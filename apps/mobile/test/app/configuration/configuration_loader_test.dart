// Build-configuration validation.
//
// The rule this file exists to defend: A PRODUCTION BUILD NEVER FALLS BACK.
// Missing, local-looking, or plain-HTTP configuration in a production build is
// a hard failure. There is no default endpoint for any profile except LOCAL.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/app/configuration/app_configuration.dart';
import 'package:karar_mobile/app/configuration/app_environment.dart';
import 'package:karar_mobile/app/configuration/configuration_loader.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';

void main() {
  const loader = ConfigurationLoader();

  List<String> violationsOf(Result<AppConfiguration> result) {
    final failure = result.failureOrNull;
    expect(failure, isA<ConfigurationInvalidFailure>());
    return (failure! as ConfigurationInvalidFailure).violations;
  }

  group('environment identifier', () {
    test('is required; an absent value never defaults to a profile', () {
      final result = loader.load(
        values: <String, String>{},
        isReleaseBuild: true,
      );

      expect(result.isFailure, isTrue);
      expect(violationsOf(result), contains(ConfigurationViolation.environmentMissing));
    });

    test('an unrecognised value is refused rather than coerced', () {
      final result = loader.load(
        values: <String, String>{ConfigurationKeys.environment: 'PROD'},
        isReleaseBuild: true,
      );

      expect(violationsOf(result), contains(ConfigurationViolation.environmentUnknown));
    });

    test('parses the four known profiles case-insensitively', () {
      expect(AppEnvironment.tryParse('local'), AppEnvironment.local);
      expect(AppEnvironment.tryParse('DEV'), AppEnvironment.dev);
      expect(AppEnvironment.tryParse(' staging '), AppEnvironment.staging);
      expect(AppEnvironment.tryParse('PRODUCTION'), AppEnvironment.production);
      expect(AppEnvironment.tryParse('preprod'), isNull);
      expect(AppEnvironment.tryParse(null), isNull);
    });
  });

  group('production', () {
    test('without an API base URL fails; it does not inherit the local default', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'PRODUCTION',
          ConfigurationKeys.appVersion: '1.0.0',
          ConfigurationKeys.buildNumber: '42',
        },
        isReleaseBuild: true,
      );

      expect(result.isFailure, isTrue);
      expect(violationsOf(result), contains(ConfigurationViolation.apiBaseUrlMissing));
      expect(result.valueOrNull, isNull);
    });

    test('refuses a loopback host', () {
      for (final host in <String>[
        'http://localhost:3000',
        'https://127.0.0.1',
        'https://10.0.2.2:3000',
        'https://api.local',
      ]) {
        final result = loader.load(
          values: <String, String>{
            ConfigurationKeys.environment: 'PRODUCTION',
            ConfigurationKeys.apiBaseUrl: host,
            ConfigurationKeys.appVersion: '1.0.0',
            ConfigurationKeys.buildNumber: '42',
          },
          isReleaseBuild: true,
        );

        expect(
          violationsOf(result),
          contains(ConfigurationViolation.apiBaseUrlLocalInNonLocal),
          reason: '$host must not be accepted by a production build',
        );
      }
    });

    test('refuses plain HTTP', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'PRODUCTION',
          ConfigurationKeys.apiBaseUrl: 'http://api.example.invalid',
          ConfigurationKeys.appVersion: '1.0.0',
          ConfigurationKeys.buildNumber: '42',
        },
        isReleaseBuild: true,
      );

      expect(violationsOf(result), contains(ConfigurationViolation.apiBaseUrlInsecure));
    });

    test('refuses credentials embedded in the URL', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'PRODUCTION',
          ConfigurationKeys.apiBaseUrl: 'https://user:pass@api.example.invalid',
          ConfigurationKeys.appVersion: '1.0.0',
          ConfigurationKeys.buildNumber: '42',
        },
        isReleaseBuild: true,
      );

      expect(
        violationsOf(result),
        contains(ConfigurationViolation.apiBaseUrlCredentialsPresent),
      );
    });

    test('accepts a complete, secure, non-local configuration', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'PRODUCTION',
          ConfigurationKeys.apiBaseUrl: 'https://api.example.invalid',
          ConfigurationKeys.appVersion: '1.4.0',
          ConfigurationKeys.buildNumber: '1201',
          ConfigurationKeys.brandId: 'karar',
        },
        isReleaseBuild: true,
      );

      final configuration = result.valueOrNull;
      expect(configuration, isNotNull);
      expect(configuration!.environment, AppEnvironment.production);
      expect(configuration.isProduction, isTrue);
      expect(configuration.apiBaseUrl, Uri.parse('https://api.example.invalid'));
      expect(configuration.apiBaseUrl, isNot(ConfigurationLoader.localDefaultApiBaseUrl));
    });
  });

  group('staging and dev', () {
    test('both require an explicit HTTPS base URL', () {
      for (final environment in <String>['STAGING', 'DEV']) {
        final missing = loader.load(
          values: <String, String>{ConfigurationKeys.environment: environment},
          isReleaseBuild: false,
        );
        expect(
          violationsOf(missing),
          contains(ConfigurationViolation.apiBaseUrlMissing),
          reason: '$environment must not inherit a default endpoint',
        );

        final insecure = loader.load(
          values: <String, String>{
            ConfigurationKeys.environment: environment,
            ConfigurationKeys.apiBaseUrl: 'http://api.example.invalid',
          },
          isReleaseBuild: false,
        );
        expect(violationsOf(insecure), contains(ConfigurationViolation.apiBaseUrlInsecure));
      }
    });
  });

  group('local', () {
    test('defaults to the loopback API when no base URL is supplied', () {
      final result = loader.load(
        values: <String, String>{ConfigurationKeys.environment: 'LOCAL'},
        isReleaseBuild: false,
      );

      expect(result.valueOrNull?.apiBaseUrl, ConfigurationLoader.localDefaultApiBaseUrl);
    });

    test('permits plain HTTP', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'LOCAL',
          ConfigurationKeys.apiBaseUrl: 'http://10.0.2.2:3000',
        },
        isReleaseBuild: false,
      );

      expect(result.isSuccess, isTrue);
    });
  });

  group('release builds', () {
    test('require public build metadata', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'STAGING',
          ConfigurationKeys.apiBaseUrl: 'https://api.example.invalid',
        },
        isReleaseBuild: true,
      );

      final violations = violationsOf(result);
      expect(violations, contains(ConfigurationViolation.appVersionMissing));
      expect(violations, contains(ConfigurationViolation.buildNumberMissing));
    });

    test('debug builds tolerate absent build metadata', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'STAGING',
          ConfigurationKeys.apiBaseUrl: 'https://api.example.invalid',
        },
        isReleaseBuild: false,
      );

      expect(result.isSuccess, isTrue);
    });
  });

  group('secret-shaped configuration', () {
    test('is refused outright, whatever the environment', () {
      for (final key in <String>[
        'KARAR_API_SECRET',
        'KARAR_SIGNING_KEY',
        'KARAR_DB_PASSWORD',
        'KARAR_SERVICE_ACCOUNT_JSON',
        'KARAR_KMS_KEY_ID',
        'KARAR_ACCESS_TOKEN',
      ]) {
        final result = loader.load(
          values: <String, String>{
            ConfigurationKeys.environment: 'LOCAL',
            key: 'anything',
          },
          isReleaseBuild: false,
        );

        expect(
          violationsOf(result).any(
            (String violation) =>
                violation.startsWith(ConfigurationViolation.secretShapedKeyPresent),
          ),
          isTrue,
          reason: '$key must not be accepted as client configuration',
        );
      }
    });

    test('reports every violation at once rather than one per build', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'PRODUCTION',
          ConfigurationKeys.apiBaseUrl: 'http://localhost:3000',
        },
        isReleaseBuild: true,
      );

      final violations = violationsOf(result);
      expect(violations, contains(ConfigurationViolation.apiBaseUrlInsecure));
      expect(violations, contains(ConfigurationViolation.apiBaseUrlLocalInNonLocal));
      expect(violations, contains(ConfigurationViolation.appVersionMissing));
      expect(violations, contains(ConfigurationViolation.buildNumberMissing));
    });

    test('a violation names the key, never the value', () {
      final result = loader.load(
        values: <String, String>{
          ConfigurationKeys.environment: 'LOCAL',
          'KARAR_API_SECRET': 'super-secret-value',
        },
        isReleaseBuild: false,
      );

      for (final violation in violationsOf(result)) {
        expect(violation, isNot(contains('super-secret-value')));
      }
    });
  });
}
