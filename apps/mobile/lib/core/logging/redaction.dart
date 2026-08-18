// PURE DART ONLY.
//
// Redaction policy. This is a security control, not a formatting helper.
//
// The rule the whole client obeys: NOTHING that can authenticate, authorise,
// or prove an act is ever written to a log sink. That covers authorization
// headers, cookies, access and refresh tokens, passwords, e-mail verification
// and password-reset codes, TOTP secrets and codes, MFA recovery codes, and
// consent evidence references.
//
// Request and response BODIES are never logged at all — not redacted, not
// truncated, not in debug builds. A body is unbounded attacker-influenced
// content and the client cannot know in advance which of its fields are
// sensitive. Diagnostics are assembled from an explicit field list instead.
import 'package:meta/meta.dart';

/// Replacement written in place of a redacted value.
const String redactedPlaceholder = '[redacted]';

/// Decides what may leave the process in a log record.
@immutable
final class Redactor {
  const Redactor();

  /// Header names that are removed outright, matched case-insensitively.
  static const Set<String> _redactedHeaderNames = <String>{
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-refresh-token',
    'www-authenticate',
    'proxy-authenticate',
  };

  /// Substrings that mark a field name as sensitive wherever it appears.
  ///
  /// Deliberately does NOT include the bare token `code`: RFC 7807 problem
  /// documents carry a machine-readable `code` that diagnostics depend on,
  /// and the ambiguous cases (verification, reset, TOTP, recovery codes) only
  /// ever occur inside request bodies, which are never logged.
  static const List<String> _sensitiveFieldMarkers = <String>[
    'password',
    'passcode',
    'secret',
    'token',
    'authorization',
    'cookie',
    'credential',
    'recoverycode',
    'recovery_code',
    'verificationcode',
    'verification_code',
    'resetcode',
    'reset_code',
    'mfacode',
    'mfa_code',
    'totp',
    'otpauth',
    'challenge',
    'evidence',
    'signature',
    'privatekey',
    'private_key',
    'apikey',
    'api_key',
  ];

  /// Whether a field name must never have its value logged.
  bool isSensitiveField(String name) {
    final normalized = name.toLowerCase();
    for (final marker in _sensitiveFieldMarkers) {
      if (normalized.contains(marker)) {
        return true;
      }
    }
    return false;
  }

  /// Whether a header must be dropped entirely.
  bool isSensitiveHeader(String name) =>
      _redactedHeaderNames.contains(name.toLowerCase()) || isSensitiveField(name);

  /// Returns a copy of [fields] with every sensitive value replaced.
  ///
  /// Nested maps and lists are walked so that a sensitive value cannot be
  /// smuggled through one level of nesting. Values that are not primitives,
  /// maps, or lists are replaced by their type name: an arbitrary object's
  /// `toString` is not a controlled surface.
  Map<String, Object?> redactFields(Map<String, Object?> fields) {
    final result = <String, Object?>{};
    for (final entry in fields.entries) {
      result[entry.key] = isSensitiveField(entry.key)
          ? redactedPlaceholder
          : _redactValue(entry.value, depth: 0);
    }
    return result;
  }

  /// Returns [headers] with sensitive entries removed and the rest preserved.
  Map<String, String> redactHeaders(Map<String, String> headers) {
    final result = <String, String>{};
    for (final entry in headers.entries) {
      result[entry.key] = isSensitiveHeader(entry.key) ? redactedPlaceholder : entry.value;
    }
    return result;
  }

  /// Renders a URI safe to log: scheme, host, port and path are preserved;
  /// every query VALUE is replaced while its key is kept, and any userinfo or
  /// fragment is dropped.
  ///
  /// Query values are redacted unconditionally because a single mistaken
  /// endpoint that accepts a token as a query parameter would otherwise write
  /// it to every log line.
  String redactUri(Uri uri) {
    final sanitized = Uri(
      scheme: uri.scheme.isEmpty ? null : uri.scheme,
      host: uri.host.isEmpty ? null : uri.host,
      port: uri.hasPort ? uri.port : null,
      path: uri.path,
      queryParameters: uri.queryParameters.isEmpty
          ? null
          : <String, String>{
              for (final key in uri.queryParameters.keys) key: redactedPlaceholder,
            },
    );
    return sanitized.toString();
  }

  Object? _redactValue(Object? value, {required int depth}) {
    // A bounded walk: deeply nested structures are collapsed rather than
    // recursed into indefinitely.
    if (depth > 4) {
      return redactedPlaceholder;
    }
    return switch (value) {
      null => null,
      String() || num() || bool() || DateTime() || Duration() || Enum() => value,
      Map<String, Object?>() => <String, Object?>{
          for (final entry in value.entries)
            entry.key: isSensitiveField(entry.key)
                ? redactedPlaceholder
                : _redactValue(entry.value, depth: depth + 1),
        },
      Iterable<Object?>() => <Object?>[
          for (final element in value) _redactValue(element, depth: depth + 1),
        ],
      _ => value.runtimeType.toString(),
    };
  }
}
