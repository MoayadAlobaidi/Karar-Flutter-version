import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/email_address.dart';
import 'package:karar_mobile/features/authentication/domain/value_objects/password.dart';

void main() {
  group('EmailAddress', () {
    test('accepts an ordinary address and trims it', () {
      final EmailCheck check = EmailAddress.parse('  person@example.test  ');
      expect(check, isA<EmailAccepted>());
      expect((check as EmailAccepted).email.value, 'person@example.test');
    });

    test('accepts a plus-addressed and a subdomain address', () {
      // A client pattern stricter than the server rejects addresses the
      // platform would have accepted, which the user cannot work around.
      expect(EmailAddress.parse('person+karar@mail.example.test'),
          isA<EmailAccepted>());
      expect(EmailAddress.parse("o'brien@example.test"), isA<EmailAccepted>());
    });

    test('reports an empty value distinctly from a malformed one', () {
      expect(
        (EmailAddress.parse('   ') as EmailRejected).violation,
        EmailViolation.empty,
      );
      expect(
        (EmailAddress.parse('person') as EmailRejected).violation,
        EmailViolation.malformed,
      );
    });

    test('rejects values that cannot be an address', () {
      for (final String candidate in <String>[
        '@example.test',
        'person@',
        'person@example',
        'person@.test',
        'person@example.',
        'person example@test.test',
      ]) {
        expect(
          EmailAddress.parse(candidate),
          isA<EmailRejected>(),
          reason: '$candidate must not be accepted',
        );
      }
    });

    test('toString never contains the address', () {
      final EmailAccepted accepted =
          EmailAddress.parse('person@example.test') as EmailAccepted;
      expect(accepted.email.toString(), isNot(contains('person')));
      expect(accepted.email.toString(), isNot(contains('example.test')));
    });
  });

  group('PasswordPolicy', () {
    const PasswordPolicy policy = PasswordPolicy();

    test('mirrors the contract bounds', () {
      expect(policy.minimumLength, 8);
      expect(policy.maximumLength, 512);
    });

    test('names the first rule broken', () {
      expect(policy.violationOf(''), PasswordViolation.empty);
      expect(policy.violationOf('short'), PasswordViolation.tooShort);
      expect(policy.violationOf('a' * 513), PasswordViolation.tooLong);
      expect(policy.violationOf('a' * 8), isNull);
      expect(policy.violationOf('a' * 512), isNull);
    });

    test('parse yields an accepted password or a violation', () {
      expect(policy.parse('correct-horse'), isA<PasswordAccepted>());
      expect(
        (policy.parse('nope') as PasswordRejected).violation,
        PasswordViolation.tooShort,
      );
    });

    test('a password never prints its material', () {
      final PasswordAccepted accepted =
          policy.parse('correct-horse-battery') as PasswordAccepted;
      expect(accepted.password.value, 'correct-horse-battery');
      expect(accepted.password.toString(), isNot(contains('correct-horse')));
      expect(accepted.password.toString(), contains('redacted'));
    });
  });

  group('OpaqueSecret', () {
    test('trims, because pasted codes arrive with whitespace', () {
      const OpaqueSecret secret = OpaqueSecret('  A1B2C3D4 ');
      expect(secret.trimmed, 'A1B2C3D4');
      expect(secret.isEmpty, isFalse);
    });

    test('whitespace alone is empty', () {
      expect(const OpaqueSecret('   ').isEmpty, isTrue);
    });

    test('never prints its material', () {
      expect(const OpaqueSecret('123456').toString(), isNot(contains('123456')));
    });
  });
}
