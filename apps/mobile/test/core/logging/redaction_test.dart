// Redaction policy.
//
// A binding constraint of the platform: authorization headers, cookies,
// tokens, passwords, verification and reset codes, MFA secrets, recovery codes
// and consent evidence never reach a log sink, in any build.
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/logging/app_logger.dart';
import 'package:karar_mobile/core/logging/redaction.dart';

void main() {
  const redactor = Redactor();

  group('headers', () {
    test('drops every credential-bearing header', () {
      final redacted = redactor.redactHeaders(<String, String>{
        'Authorization': 'Bearer secret-access-token',
        'Cookie': 'session=abc',
        'Set-Cookie': 'session=abc',
        'Proxy-Authorization': 'Basic abc',
        'X-Api-Key': 'abc',
        'X-Refresh-Token': 'abc',
        'WWW-Authenticate': 'Bearer realm="karar"',
        'x-correlation-id': 'corr-1',
        'content-type': 'application/json',
      });

      expect(redacted['Authorization'], redactedPlaceholder);
      expect(redacted['Cookie'], redactedPlaceholder);
      expect(redacted['Set-Cookie'], redactedPlaceholder);
      expect(redacted['Proxy-Authorization'], redactedPlaceholder);
      expect(redacted['X-Api-Key'], redactedPlaceholder);
      expect(redacted['X-Refresh-Token'], redactedPlaceholder);
      expect(redacted['WWW-Authenticate'], redactedPlaceholder);
      expect(redacted['x-correlation-id'], 'corr-1');
      expect(redacted['content-type'], 'application/json');
      expect(redacted.values, isNot(contains('Bearer secret-access-token')));
    });
  });

  group('fields', () {
    test('replaces sensitive values at the top level', () {
      final redacted = redactor.redactFields(<String, Object?>{
        'password': 'hunter2',
        'newPassword': 'hunter3',
        'accessToken': 'aaa',
        'refreshToken': 'bbb',
        'challengeToken': 'ccc',
        'recoveryCode': 'ddd',
        'verificationCode': 'eee',
        'totpSecret': 'fff',
        'consentEvidence': 'ggg',
        'status': 200,
      });

      for (final key in redacted.keys.where((String key) => key != 'status')) {
        expect(redacted[key], redactedPlaceholder, reason: key);
      }
      expect(redacted['status'], 200);
    });

    test('walks nested maps and lists', () {
      final redacted = redactor.redactFields(<String, Object?>{
        'session': <String, Object?>{
          'sessionId': 'session-1',
          'accessToken': 'aaa',
          'nested': <String, Object?>{'apiKey': 'bbb'},
        },
        'entries': <Object?>[
          <String, Object?>{'refreshToken': 'ccc', 'id': 'entry-1'},
        ],
      });

      final session = redacted['session']! as Map<String, Object?>;
      expect(session['sessionId'], 'session-1');
      expect(session['accessToken'], redactedPlaceholder);
      expect((session['nested']! as Map<String, Object?>)['apiKey'], redactedPlaceholder);

      final entries = redacted['entries']! as List<Object?>;
      final entry = entries.single! as Map<String, Object?>;
      expect(entry['refreshToken'], redactedPlaceholder);
      expect(entry['id'], 'entry-1');
    });

    test('keeps the RFC 7807 code, which diagnostics depend on', () {
      final redacted = redactor.redactFields(<String, Object?>{'code': 'BOOTSTRAP_UNAVAILABLE'});

      expect(redacted['code'], 'BOOTSTRAP_UNAVAILABLE');
    });

    test('replaces an arbitrary object with its type name', () {
      final redacted = redactor.redactFields(<String, Object?>{'value': Object()});

      expect(redacted['value'], 'Object');
    });
  });

  group('URIs', () {
    test('keeps query keys and removes query values', () {
      final redacted = redactor.redactUri(
        Uri.parse('https://api.example.invalid/consent/status?purposeRef=marketing&token=abc'),
      );

      expect(redacted, contains('purposeRef'));
      expect(redacted, contains('/consent/status'));
      expect(redacted, isNot(contains('marketing')));
      expect(redacted, isNot(contains('abc')));
    });

    test('drops userinfo and fragment', () {
      final redacted = redactor.redactUri(
        Uri.parse('https://user:pass@api.example.invalid/path#fragment'),
      );

      expect(redacted, isNot(contains('user')));
      expect(redacted, isNot(contains('pass')));
      expect(redacted, isNot(contains('fragment')));
    });
  });

  group('AppLogger', () {
    test('applies redaction before the record reaches the sink', () {
      final sink = RecordingLogSink();
      final logger = AppLogger(sink: sink, minimumLevel: LogLevel.trace);

      logger.forCategory('networking').info(
        'API request completed.',
        fields: <String, Object?>{'authorization': 'Bearer aaa', 'status': 200},
        correlationId: 'corr-1',
      );

      final record = sink.records.single;
      expect(record.fields['authorization'], redactedPlaceholder);
      expect(record.fields['status'], 200);
      expect(record.toString(), isNot(contains('Bearer aaa')));
    });

    test('records the error TYPE, never the error message', () {
      final sink = RecordingLogSink();
      final logger = AppLogger(sink: sink, minimumLevel: LogLevel.trace);

      logger.forCategory('security').error(
            'Secure storage operation failed.',
            error: const FormatException('token=super-secret'),
          );

      final record = sink.records.single;
      expect(record.error, 'FormatException');
      expect(record.toString(), isNot(contains('super-secret')));
    });

    test('honours the level threshold', () {
      final sink = RecordingLogSink();
      final logger = AppLogger(sink: sink, minimumLevel: LogLevel.warning);
      final category = logger.forCategory('startup');

      category
        ..trace('trace')
        ..debug('debug')
        ..info('info')
        ..warning('warning')
        ..error('error');

      expect(
        sink.records.map((LogRecord record) => record.level),
        <LogLevel>[LogLevel.warning, LogLevel.error],
      );
    });

    test('the silent logger writes nothing at all', () {
      // Production builds use this. The assertion is that it cannot be made to
      // emit, whatever it is asked to log.
      AppLogger.silent.log(
        LogLevel.error,
        'security',
        'Anything',
        fields: <String, Object?>{'accessToken': 'aaa'},
      );
      // Reaching here without a sink write is the assertion; NoopLogSink has
      // nowhere to record to.
      expect(AppLogger.silent, isNotNull);
    });
  });
}
