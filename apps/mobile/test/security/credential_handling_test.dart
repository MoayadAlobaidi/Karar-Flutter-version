// WHERE CREDENTIALS LIVE, AND WHAT MAY BE SAID ABOUT THEM.
//
// Two properties, both of which fail silently in production if they regress:
//
//   1. A session credential exists in platform secure storage and nowhere
//      else. Not in shared preferences, not in a log line, not in an object's
//      toString.
//
//   2. Diagnostics never carry anything that can authenticate, authorise or
//      prove an act. The redactor's own suite covers its mechanics; this suite
//      asserts the specific categories this product must never emit — access
//      and refresh tokens, passwords, MFA seeds and recovery codes.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/failure.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/core/logging/redaction.dart';
import 'package:karar_mobile/core/security/secure_store.dart';
import 'package:karar_mobile/core/security/session_tokens.dart';
import 'package:karar_mobile/core/security/token_store.dart';
import 'package:karar_mobile/core/storage/key_value_store.dart';

import 'support/source_tree.dart';

const Redactor _redactor = Redactor();

SessionTokens _tokens() => SessionTokens(
  accessToken: 'access-token-value-must-not-leak',
  accessTokenExpiresAt: DateTime.utc(2026, 9, 1, 12),
  refreshToken: 'refresh-token-value-must-not-leak',
  refreshTokenExpiresAt: DateTime.utc(2026, 10, 1, 12),
  sessionId: 'session-1',
);

void main() {
  group('session credentials live in platform secure storage only', () {
    test('the token store writes through the secure store', () async {
      final secureStore = InMemorySecureStore();
      final tokenStore = SecureTokenStore(secureStore);

      final written = await tokenStore.write(_tokens());
      expect(written, isA<Success<void>>());
      expect(
        secureStore.entries,
        isNotEmpty,
        reason: 'the credential must reach platform secure storage',
      );
    });

    test('a secure-store failure is a failure, never an empty session', () async {
      final secureStore = InMemorySecureStore()..failWith = SecureStorageOperation.read;
      final tokenStore = SecureTokenStore(secureStore);

      final read = await tokenStore.read();
      expect(
        read,
        isA<Failed<SessionTokens?>>(),
        reason:
            'a store that cannot be consulted must not be reported as an absent '
            'session; the caller has to fail closed rather than treat the user as '
            'signed out and continue',
      );
    });

    test('clearing removes the credential', () async {
      final secureStore = InMemorySecureStore();
      final tokenStore = SecureTokenStore(secureStore);
      await tokenStore.write(_tokens());
      await tokenStore.clear();
      expect(secureStore.entries, isEmpty);
    });

    test('unencrypted preferences refuse a credential-shaped key', () {
      for (final name in <String>[
        'access_token',
        'refreshToken',
        'user_password',
        'api_secret',
        'mfa_seed',
        'totp_secret',
        'recovery_codes',
        'consent_evidence',
        'private_key',
      ]) {
        expect(
          () => PreferenceKey(name),
          throwsA(isA<ArgumentError>()),
          reason:
              'shared preferences are unencrypted and readable on a rooted '
              'device; "$name" must fail at the call site',
        );
      }
    });

    test('legitimate preference keys still work', () {
      // Otherwise the guard could be satisfied by rejecting everything.
      for (final name in <String>['locale', 'theme_mode', 'app_lock_enabled']) {
        expect(PreferenceKey(name).name, name);
      }
    });

    test('a session credential never renders itself', () {
      final rendered = _tokens().toString();
      expect(rendered, isNot(contains('access-token-value-must-not-leak')));
      expect(rendered, isNot(contains('refresh-token-value-must-not-leak')));
    });
  });

  group('diagnostics are redacted', () {
    test('credential-bearing headers never survive', () {
      final redacted = _redactor.redactHeaders(<String, String>{
        'authorization': 'Bearer secret-value',
        'proxy-authorization': 'Basic secret-value',
        'cookie': 'session=secret-value',
        'set-cookie': 'session=secret-value',
        'x-api-key': 'secret-value',
        'x-refresh-token': 'secret-value',
        'content-type': 'application/json',
      });

      for (final entry in redacted.entries) {
        if (entry.key == 'content-type') {
          expect(entry.value, 'application/json');
          continue;
        }
        expect(entry.value, redactedPlaceholder, reason: '${entry.key} must not reach a log sink');
      }
    });

    test('every category this product must never log is redacted', () {
      final redacted = _redactor.redactFields(<String, Object?>{
        'accessToken': 'a',
        'refresh_token': 'b',
        'password': 'c',
        'totpSecret': 'd',
        'mfa_code': 'e',
        'recovery_code': 'f',
        'verification_code': 'g',
        'reset_code': 'h',
        'apiKey': 'i',
        'private_key': 'j',
        'credential': 'k',
        'signature': 'l',
        'evidence': 'm',
        'status': 'ok',
      });

      for (final entry in redacted.entries) {
        if (entry.key == 'status') {
          expect(entry.value, 'ok', reason: 'non-sensitive diagnostics must survive');
          continue;
        }
        expect(entry.value, redactedPlaceholder, reason: '${entry.key} must be redacted');
      }
    });

    test('nesting does not smuggle a credential past the redactor', () {
      final redacted = _redactor.redactFields(<String, Object?>{
        'envelope': <String, Object?>{
          'inner': <String, Object?>{'refreshToken': 'must-not-appear'},
        },
        'list': <Object?>[
          <String, Object?>{'password': 'must-not-appear'},
        ],
      });
      expect(redacted.toString(), isNot(contains('must-not-appear')));
    });

    test('query values are removed while the shape of the URL is kept', () {
      final rendered = _redactor.redactUri(
        Uri.parse('https://api.karar.example/v1/sessions?token=leaked&page=2'),
      );
      expect(rendered, isNot(contains('leaked')));
      expect(rendered, contains('/v1/sessions'));
      expect(rendered, contains('token='), reason: 'the key is diagnostic, the value is not');
    });

    test('userinfo in a URL is dropped rather than redacted in place', () {
      final rendered = _redactor.redactUri(
        Uri.parse('https://user:password@api.karar.example/v1/ping'),
      );
      expect(rendered, isNot(contains('password')));
      expect(rendered, isNot(contains('user:')));
    });
  });

  group('the transport logs a closed set of fields', () {
    test('no request or response body or header is ever logged', () {
      // Bodies are unbounded attacker-influenced content whose sensitive fields
      // cannot be known in advance, so they are not logged at all — not
      // redacted, not truncated, not in debug builds. This is asserted against
      // the source because the property is about what the code CAN emit, not
      // about one execution of it.
      final transport = stripCodeComments(
        readRequiredFile('lib/core/networking/dio_api_transport.dart'),
      );

      // Every diagnostic field map the transport builds. The maps are flat, so
      // matching up to the first closing brace is exact rather than a guess.
      final fieldBlocks = RegExp(r'fields: <String, Object\?>\{([^}]*)\}')
          .allMatches(transport)
          .map((RegExpMatch match) => match.group(1)!)
          .toList(growable: false);
      expect(
        fieldBlocks,
        isNotEmpty,
        reason: 'the transport must build at least one diagnostic field map',
      );

      for (final block in fieldBlocks) {
        for (final entry in RegExp(r"'([^']+)':\s*([^,\n]+)").allMatches(block)) {
          final key = entry.group(1)!;
          final valueExpression = entry.group(2)!;

          expect(
            _redactor.isSensitiveField(key),
            isFalse,
            reason:
                'the transport logs a field named "$key", which the redactor '
                'classifies as sensitive',
          );

          // A body or a header set is unbounded, attacker-influenced content
          // whose sensitive members cannot be known in advance. It is not
          // logged at all — not redacted, not truncated, not in debug builds.
          for (final forbidden in <String>['.body', '.data', '.headers', 'credential']) {
            expect(
              valueExpression,
              isNot(contains(forbidden)),
              reason: 'the value logged for "$key" reads $forbidden',
            );
          }
        }
      }
    });

    test('the path is redacted before it is logged', () {
      final transport = stripCodeComments(
        readRequiredFile('lib/core/networking/dio_api_transport.dart'),
      );
      expect(
        transport,
        contains('_redactor.redactUri'),
        reason: 'a path may carry an identifier or a query value',
      );
    });

    test('invalid certificates are refused rather than accepted by a callback', () {
      final transport = stripCodeComments(
        readRequiredFile('lib/core/networking/dio_api_transport.dart'),
      );
      expect(
        transport,
        contains('badCertificateCallback'),
        reason: 'the decision must be greppable, so a future override is a visible edit',
      );
      expect(
        transport,
        isNot(RegExp(r'badCertificateCallback\s*=\s*\([^)]*\)\s*=>\s*true')),
        reason: 'accepting an invalid certificate would defeat platform TLS validation',
      );
      expect(RegExp(r'badCertificateCallback[^;]*=>\s*false').hasMatch(transport), isTrue);
    });

    test('no certificate is pinned in the transport', () {
      final transport = readRequiredFile('lib/core/networking/dio_api_transport.dart');
      for (final marker in <String>[
        'SecurityContext',
        'setTrustedCertificates',
        'sha256/',
        'pinnedCertificate',
      ]) {
        expect(
          stripCodeComments(transport),
          isNot(contains(marker)),
          reason:
              'pinning is not a Phase 4 control and adding it needs an ADR, not a '
              'code change',
        );
      }
    });
  });
}
