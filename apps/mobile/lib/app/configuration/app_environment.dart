// PURE DART ONLY.
//
// The four environment profiles. An environment is BUILD configuration: it
// arrives through `--dart-define` at compile time and is never read from a
// text field, a deep link, a QR code, a downloaded file, or any other input a
// person or a server can influence. There is deliberately no setter.
/// A deployment profile.
enum AppEnvironment {
  /// Developer machine against locally running infrastructure.
  local(identifier: 'LOCAL', allowsInsecureTransport: true, isProduction: false),

  /// Shared integration environment.
  dev(identifier: 'DEV', allowsInsecureTransport: false, isProduction: false),

  /// Pre-production, production-shaped.
  staging(identifier: 'STAGING', allowsInsecureTransport: false, isProduction: false),

  /// Real customers, real money.
  production(identifier: 'PRODUCTION', allowsInsecureTransport: false, isProduction: true);

  const AppEnvironment({
    required this.identifier,
    required this.allowsInsecureTransport,
    required this.isProduction,
  });

  /// The value supplied at build time. Public, non-secret.
  final String identifier;

  /// Whether a plain-HTTP API base URL is acceptable. True only for LOCAL,
  /// where the API runs on the developer's own machine.
  final bool allowsInsecureTransport;

  final bool isProduction;

  /// Resolves an identifier, or null when it names no known profile.
  ///
  /// Returning null rather than defaulting is the whole point: an unrecognised
  /// environment must stop the build from running, not quietly become LOCAL.
  static AppEnvironment? tryParse(String? identifier) {
    if (identifier == null) {
      return null;
    }
    final normalized = identifier.trim().toUpperCase();
    for (final candidate in values) {
      if (candidate.identifier == normalized) {
        return candidate;
      }
    }
    return null;
  }
}
