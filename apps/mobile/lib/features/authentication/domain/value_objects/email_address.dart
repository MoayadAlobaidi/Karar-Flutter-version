// PURE DART ONLY. See lib/README.md — a feature domain layer imports nothing
// but pure Dart, `package:meta`, `core/errors/*` and `core/utilities/*`.
//
// `authentication/domain` is the SHARED KERNEL of the identity bounded
// context: email_verification, password_recovery, mfa and session_management
// import from it. The dependency runs one way only — satellites depend on the
// kernel, never the reverse.
import 'package:meta/meta.dart';

/// Why a candidate address was not accepted.
///
/// The client checks SHAPE only. It never decides whether an address exists —
/// that answer is deliberately unavailable (see the enumeration-resistance
/// note on the registration and recovery flows).
enum EmailViolation {
  /// Nothing was entered.
  empty,

  /// The value cannot be an address: no separator, whitespace, or an empty
  /// local or domain part.
  malformed,
}

/// The outcome of parsing a candidate address.
@immutable
sealed class EmailCheck {
  const EmailCheck();
}

/// The candidate is well-formed.
final class EmailAccepted extends EmailCheck {
  const EmailAccepted(this.email);

  final EmailAddress email;
}

/// The candidate cannot be sent.
final class EmailRejected extends EmailCheck {
  const EmailRejected(this.violation);

  final EmailViolation violation;
}

/// A syntactically plausible e-mail address.
///
/// `toString` omits the value: an address is personal data and routinely ends
/// up in an interpolated string, an assertion message or a framework error
/// dump.
@immutable
final class EmailAddress {
  const EmailAddress._(this.value);

  /// Parses [candidate], trimming surrounding whitespace.
  ///
  /// The check is deliberately permissive. A client-side pattern stricter than
  /// the server's rejects addresses the platform would have accepted, which is
  /// a defect the user cannot work around.
  static EmailCheck parse(String candidate) {
    final String trimmed = candidate.trim();
    if (trimmed.isEmpty) {
      return const EmailRejected(EmailViolation.empty);
    }
    if (trimmed.contains(RegExp(r'\s'))) {
      return const EmailRejected(EmailViolation.malformed);
    }
    final int separator = trimmed.lastIndexOf('@');
    if (separator <= 0 || separator == trimmed.length - 1) {
      return const EmailRejected(EmailViolation.malformed);
    }
    final String domain = trimmed.substring(separator + 1);
    if (!domain.contains('.') || domain.startsWith('.') || domain.endsWith('.')) {
      return const EmailRejected(EmailViolation.malformed);
    }
    return EmailAccepted(EmailAddress._(trimmed));
  }

  /// The address as it will be sent.
  final String value;

  @override
  bool operator ==(Object other) => other is EmailAddress && other.value == value;

  @override
  int get hashCode => value.hashCode;

  @override
  String toString() => 'EmailAddress(<redacted>)';
}
