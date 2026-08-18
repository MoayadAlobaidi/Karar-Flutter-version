// NO CREDENTIAL IS COMPILED INTO THIS CLIENT.
//
// A mobile binary is a published document. Anything compiled into it is
// readable by anyone who downloads it, so the only safe number of secrets in
// this tree is zero. This suite reads the source and fails the build when a
// credential appears, rather than relying on review to catch it.
//
// WHY THIS IS NOT REDUNDANT WITH GITLEAKS
//   The repository-wide `secrets` job scans git history for known credential
//   shapes. It runs on the whole monorepo and knows nothing about this package.
//   These tests run inside the required `mobile` check, scan the working tree
//   (including files gitleaks would pass over), and encode the categories this
//   product specifically must never ship: database credentials, Cloudflare
//   tokens, service-account keys, signing material, refresh tokens, MFA seeds
//   and recovery codes.
//
// WHAT THIS DOES NOT COVER
//   Built artifacts. An APK is scanned in CI, after it exists, by the
//   `mobile-android-build` job. A test cannot scan a binary it did not build.
//
// HOW MATCHING WORKS
//   Two rules, deliberately different in strictness:
//
//   1. Shapes that are NEVER legitimate — a PEM private key block, a
//      service-account document, a connection string with an inline password,
//      a provider key with a published prefix. These fail on sight.
//
//   2. Credential-shaped NAMES assigned literal MATERIAL. The word "password"
//      appears throughout this codebase in redaction marker lists and guard
//      rails, and must keep appearing, so a bare word search would be useless.
//      The rule instead requires a secret-shaped identifier assigned a literal
//      that looks like real material: long, mixed-case, and carrying digits, or
//      a long hex or base64 blob. Identifier-like and SCREAMING_CASE values are
//      not material and do not match.
import 'package:flutter_test/flutter_test.dart';

import 'support/source_tree.dart';

/// A finding: what matched, where.
final class _Finding {
  const _Finding(this.path, this.lineNumber, this.rule, this.line);

  final String path;
  final int lineNumber;
  final String rule;
  final String line;

  @override
  String toString() {
    final trimmed = line.trim();
    final excerpt = trimmed.length > 120 ? '${trimmed.substring(0, 120)}…' : trimmed;
    return '$path:$lineNumber  [$rule]  $excerpt';
  }
}

/// Shapes that are never legitimate in this tree, whatever the surrounding
/// code says. Each entry is named so a failure explains itself.
final Map<String, RegExp> _forbiddenShapes = <String, RegExp>{
  'private-key-block': RegExp('-----BEGIN [A-Z ]*PRIVATE KEY-----'),
  'certificate-block': RegExp('-----BEGIN CERTIFICATE-----'),
  'service-account-document': RegExp(r'"type"\s*:\s*"service_account"'),
  'json-web-token': RegExp(r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'),
  // A connection string carrying an inline user:password pair.
  'database-connection-credentials': RegExp(
    r'\b(postgres|postgresql|mysql|mariadb|mongodb(\+srv)?|redis|rediss|amqp|amqps)://'
    r'''[^\s'"/:@]+:[^\s'"/@]+@''',
  ),
  'aws-access-key-id': RegExp(r'\bAKIA[0-9A-Z]{16}\b'),
  'google-api-key': RegExp(r'\bAIza[0-9A-Za-z_-]{35}\b'),
  'slack-token': RegExp(r'\bxox[baprs]-[0-9A-Za-z-]{10,}'),
  'github-token': RegExp(r'\bgh[pousr]_[A-Za-z0-9]{36}\b'),
  'stripe-secret-key': RegExp(r'\bsk_(live|test)_[A-Za-z0-9]{16,}\b'),
  // Cloudflare's scoped API tokens carry this published prefix.
  'cloudflare-api-token': RegExp(r'\bv1\.0-[A-Za-z0-9_-]{20,}'),
  'openssh-private-key': RegExp(r'\bssh-rsa\s+AAAA[0-9A-Za-z+/]{60,}'),
};

/// Identifier fragments that make a name credential-shaped.
const List<String> _secretNameMarkers = <String>[
  'password',
  'passwd',
  'secret',
  'privatekey',
  'private_key',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'authtoken',
  'auth_token',
  'bearertoken',
  'bearer_token',
  'credential',
  'keystorepassword',
  'storepassword',
  'keypassword',
  'signingkey',
  'signing_key',
  'totpsecret',
  'totp_secret',
  'mfaseed',
  'mfa_seed',
  'recoverycode',
  'recovery_code',
  'servicekey',
  'service_key',
  'clientsecret',
  'client_secret',
];

/// A credential-shaped identifier assigned a QUOTED string literal.
///
/// Used for source code. Requiring the quotes is what keeps
/// `accessTokenExpiresAt: DateTime.utc(2999)` out of the results: an
/// expression is not material, and a rule that cannot tell the difference gets
/// switched off by the first person it interrupts.
final RegExp _quotedAssignmentPattern = RegExp(
  r'''([A-Za-z_][A-Za-z0-9_.\-]*)\s*[:=]{1,2}\s*(['"])([^'"\n]{8,})\2''',
);

/// The same idea for `key=value` formats, where values are not quoted:
/// .properties, .env and simple YAML.
final RegExp _bareAssignmentPattern = RegExp(
  r'''^\s*([A-Za-z_][A-Za-z0-9_.\-]*)\s*[:=]\s*(\S{8,})\s*$''',
  multiLine: true,
);

/// Whether a file's assignments are quoted string literals (source code) or
/// bare `key=value` pairs (configuration).
bool _usesQuotedLiterals(String relativePath) =>
    RegExp(r'\.(dart|kt|kts|gradle|swift|java|json)$').hasMatch(relativePath);

bool _isSecretShapedName(String identifier) {
  final normalised = identifier.toLowerCase().replaceAll('-', '');
  for (final marker in _secretNameMarkers) {
    if (normalised.contains(marker.replaceAll('-', ''))) {
      return true;
    }
  }
  return false;
}

/// Whether a literal looks like real credential MATERIAL rather than a name,
/// a placeholder, or a machine-readable constant.
///
/// The bar is deliberately concrete: material is long, and it is either
/// mixed-case with digits or a long hex/base64 blob. `SECRET_SHAPED_KEY_PRESENT`
/// (no lowercase), `session_tokens.v1` (no uppercase) and
/// `<supplied-at-release-time>` (a placeholder) all fail it, which is the
/// point — those are the values this codebase legitimately contains.
bool _looksLikeMaterial(String rawValue) {
  final value = rawValue.trim();
  if (value.length < 16) {
    return false;
  }
  // Obvious placeholders and template markers.
  // Template markers, interpolations, and anything with the shape of a code
  // expression rather than a value.
  for (final marker in <String>['<', '>', r'$', '{{', '…', ' ', '(', ')', '[', ']']) {
    if (value.contains(marker)) {
      return false;
    }
  }
  final lower = value.toLowerCase();
  for (final placeholder in <String>[
    'redacted',
    'example',
    'placeholder',
    'supplied',
    'changeme',
    'your-',
    'xxx',
    'todo',
    'null',
    'none',
  ]) {
    if (lower.contains(placeholder)) {
      return false;
    }
  }
  final hasLower = RegExp('[a-z]').hasMatch(value);
  final hasUpper = RegExp('[A-Z]').hasMatch(value);
  final hasDigit = RegExp('[0-9]').hasMatch(value);
  if (hasLower && hasUpper && hasDigit) {
    return true;
  }
  // A long hex or base64 blob is material even without mixed case.
  if (RegExp(r'^[A-Fa-f0-9]{32,}$').hasMatch(value)) {
    return true;
  }
  if (RegExp(r'^[A-Za-z0-9+/]{40,}={0,2}$').hasMatch(value)) {
    return true;
  }
  return false;
}

List<_Finding> _scan(List<SourceFile> files) {
  final findings = <_Finding>[];
  for (final file in files) {
    // This file describes every pattern it searches for, so scanning its own
    // source would report its rule table as a finding.
    if (file.relativePath == 'test/security/embedded_secrets_test.dart') {
      continue;
    }
    final isCodeLike = RegExp(r'\.(dart|kt|kts|gradle|swift|java|properties|yaml|yml)$')
        .hasMatch(file.relativePath);
    final body = isCodeLike ? stripCodeComments(file.contents) : file.contents;
    final lines = body.split('\n');

    for (var index = 0; index < lines.length; index++) {
      final line = lines[index];
      if (line.trim().isEmpty) {
        continue;
      }

      for (final entry in _forbiddenShapes.entries) {
        if (entry.value.hasMatch(line)) {
          findings.add(_Finding(file.relativePath, index + 1, entry.key, line));
        }
      }

      final quoted = _usesQuotedLiterals(file.relativePath);
      final assignments = quoted
          ? _quotedAssignmentPattern
              .allMatches(line)
              .map((RegExpMatch m) => <String>[m.group(1)!, m.group(3)!])
          : _bareAssignmentPattern
              .allMatches(line)
              .map((RegExpMatch m) => <String>[m.group(1)!, m.group(2)!]);

      for (final assignment in assignments) {
        if (_isSecretShapedName(assignment[0]) && _looksLikeMaterial(assignment[1])) {
          findings.add(
            _Finding(file.relativePath, index + 1, 'secret-shaped-assignment', line),
          );
        }
      }
    }
  }
  return findings;
}

void main() {
  group('no credential material is present in the mobile source tree', () {
    late List<SourceFile> files;

    setUpAll(() {
      files = readSourceFiles(mobileSourceRoots);
    });

    test('lib, android, ios, tool and test contain no credential material', () {
      final findings = _scan(files);
      expect(
        findings,
        isEmpty,
        reason: 'credential material must never be committed. Findings:\n'
            '${findings.join('\n')}',
      );
    });

    test('no signing material, keystore or provisioning profile is committed', () {
      const List<String> forbiddenExtensions = <String>[
        '.jks',
        '.keystore',
        '.p12',
        '.pfx',
        '.pem',
        '.key',
        '.cer',
        '.crt',
        '.der',
        '.mobileprovision',
        '.provisionprofile',
      ];
      // Files that carry provider credentials by construction. Their presence
      // is a finding regardless of contents, and each also implies an
      // analytics or messaging SDK this product does not use.
      const List<String> forbiddenNames = <String>[
        'google-services.json',
        'googleservice-info.plist',
        'firebase.json',
        'key.properties',
        'serviceaccount.json',
        'service-account.json',
      ];

      final offenders = <String>[];
      for (final file in readSourceFiles(mobileSourceRoots)) {
        final lower = file.relativePath.toLowerCase();
        final name = lower.split('/').last;
        // The template that documents which values a release operator supplies
        // externally. It contains placeholders only, which the scan above
        // proves.
        if (name == 'key.properties.example') {
          continue;
        }
        for (final extension in forbiddenExtensions) {
          if (lower.endsWith(extension)) {
            offenders.add(file.relativePath);
          }
        }
        if (forbiddenNames.contains(name)) {
          offenders.add(file.relativePath);
        }
      }

      expect(
        offenders,
        isEmpty,
        reason: 'signing and provider credential files must be supplied externally at '
            'release time, never committed. Found: $offenders',
      );
    });

    test('the environment keys the client reads are all non-secret', () {
      // The loader consults an explicit, closed list. If a key whose NAME is
      // credential-shaped is ever added to it, the client would be asking to
      // have a secret compiled in.
      final loader = readRequiredFile('lib/app/configuration/configuration_loader.dart');
      final keyBlock = RegExp(
        r'abstract final class ConfigurationKeys \{(.*?)\n\}',
        dotAll: true,
      ).firstMatch(loader);
      expect(keyBlock, isNotNull, reason: 'ConfigurationKeys must be declarable');

      final declared = RegExp(r"""static const String \w+ = '([A-Z0-9_]+)'""")
          .allMatches(keyBlock!.group(1)!)
          .map((RegExpMatch match) => match.group(1)!)
          .toList(growable: false);

      expect(declared, isNotEmpty, reason: 'the client must declare the keys it reads');
      for (final key in declared) {
        expect(
          _isSecretShapedName(key),
          isFalse,
          reason: '$key is credential-shaped and must not be a build-time input to a '
              'mobile binary',
        );
      }
    });
  });
}
