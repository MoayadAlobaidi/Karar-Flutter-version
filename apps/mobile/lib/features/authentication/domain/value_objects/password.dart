// PURE DART ONLY. See email_address.dart for the shared-kernel note.
import 'package:meta/meta.dart';

/// Why a candidate password was not accepted.
///
/// The bounds mirror the contract (`minLength: 8`, `maxLength: 512`). Checking
/// them here saves a round trip; the server remains the authority and its
/// rejection is still handled.
enum PasswordViolation { empty, tooShort, tooLong }

/// The length policy the contract states.
@immutable
final class PasswordPolicy {
  const PasswordPolicy({this.minimumLength = 8, this.maximumLength = 512});

  final int minimumLength;
  final int maximumLength;

  /// The first rule [candidate] breaks, or null when it satisfies all of them.
  PasswordViolation? violationOf(String candidate) {
    if (candidate.isEmpty) {
      return PasswordViolation.empty;
    }
    if (candidate.length < minimumLength) {
      return PasswordViolation.tooShort;
    }
    if (candidate.length > maximumLength) {
      return PasswordViolation.tooLong;
    }
    return null;
  }

  /// Parses [candidate] against this policy.
  PasswordCheck parse(String candidate) {
    final PasswordViolation? violation = violationOf(candidate);
    return violation == null
        ? PasswordAccepted(Password._(candidate))
        : PasswordRejected(violation);
  }
}

/// The outcome of parsing a candidate password.
@immutable
sealed class PasswordCheck {
  const PasswordCheck();
}

/// The candidate satisfies the policy.
final class PasswordAccepted extends PasswordCheck {
  const PasswordAccepted(this.password);

  final Password password;
}

/// The candidate does not.
final class PasswordRejected extends PasswordCheck {
  const PasswordRejected(this.violation);

  final PasswordViolation violation;
}

/// A password that satisfied the policy.
///
/// Neither `toString` nor `==` exposes the material. Comparing two passwords
/// is not an operation this type offers, so a timing-sensitive comparison
/// cannot be written against it by accident.
@immutable
final class Password {
  const Password._(this.value);

  final String value;

  @override
  String toString() => 'Password(<redacted>)';
}

/// A secret the user typed that this client does not police.
///
/// The current password at a change, a one-time code, a reset token: their
/// rules belong to the server, and a client rule stricter than the server's
/// would lock a legitimate user out. The type exists for one reason — it
/// redacts itself, so a secret cannot reach a log through interpolation.
@immutable
final class OpaqueSecret {
  const OpaqueSecret(this.value);

  final String value;

  bool get isEmpty => value.trim().isEmpty;

  /// The value with surrounding whitespace removed. Pasted codes routinely
  /// arrive with a trailing space.
  String get trimmed => value.trim();

  @override
  String toString() => 'OpaqueSecret(<redacted>)';
}
