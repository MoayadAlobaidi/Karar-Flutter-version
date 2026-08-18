// PURE DART ONLY.
//
// WHAT MAY LIVE IN THIS TYPE
//   * the API base URL;
//   * the environment identifier;
//   * public build metadata (version name, build number);
//   * a public brand identifier.
//
// WHAT MAY NEVER LIVE IN THIS TYPE, OR ANYWHERE ELSE IN THE CLIENT
//   database credentials, service-account files, API secrets, KMS key
//   references, private keys, signing secrets, provider credentials, webhook
//   signing keys, or anything else whose disclosure would matter. A mobile
//   binary is a published document: everything compiled into it is public.
//   Values of that kind belong to server-side configuration and reach the
//   client, if at all, only as the result of an authenticated call.
import 'package:meta/meta.dart';

import 'app_environment.dart';

/// Resolved, validated build configuration.
@immutable
final class AppConfiguration {
  const AppConfiguration({
    required this.environment,
    required this.apiBaseUrl,
    required this.appVersion,
    required this.buildNumber,
    required this.brandId,
  });

  final AppEnvironment environment;

  /// Origin and optional base path of the API. Never contains credentials.
  final Uri apiBaseUrl;

  /// Public version name, e.g. `1.4.0`.
  final String appVersion;

  /// Public build number.
  final String buildNumber;

  /// Public brand identifier used to select brand assets. Not a tenant id and
  /// not an authorisation input: the server decides what a session may see.
  final String brandId;

  bool get isProduction => environment.isProduction;

  /// Safe to log in full: every field is public by construction.
  @override
  String toString() => 'AppConfiguration(environment: ${environment.identifier}, '
      'apiBaseUrl: $apiBaseUrl, appVersion: $appVersion, buildNumber: $buildNumber, '
      'brandId: $brandId)';
}
