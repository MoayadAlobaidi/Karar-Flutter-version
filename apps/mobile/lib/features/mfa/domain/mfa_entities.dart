// PURE DART ONLY.
//
// This feature imports `features/authentication/domain` — the shared kernel of
// the identity bounded context. See
// features/email_verification/domain/email_verification_repository.dart.
//
// ONE-TIME SECRETS.
//
// Two payloads in this file exist EXACTLY ONCE: the TOTP shared secret at
// enrolment, and the ten recovery codes at confirmation. The server will not
// return either again. That makes them the most dangerous values in the
// client, so both types redact themselves in `toString`, neither implements
// `==`, and nothing in this feature writes them to preferences, a file, a
// log or a snapshot. They live in view state for the length of one screen and
// are dropped when it is left.
import 'package:meta/meta.dart';

/// The material returned once when TOTP enrolment starts.
@immutable
final class MfaEnrolment {
  const MfaEnrolment({required this.sharedSecret, required this.otpauthUrl});

  /// The base32 shared secret, for a user who types it into their
  /// authenticator by hand.
  final String sharedSecret;

  /// The `otpauth://` URL the same authenticator can consume directly.
  ///
  /// It EMBEDS the shared secret, so it is exactly as sensitive as the secret
  /// and is handled identically.
  final String otpauthUrl;

  @override
  String toString() => 'MfaEnrolment(<redacted>)';
}

/// The ten one-time recovery codes, returned once when enrolment is confirmed.
@immutable
final class MfaRecoveryCodes {
  const MfaRecoveryCodes(this.codes);

  final List<String> codes;

  int get count => codes.length;

  @override
  String toString() => 'MfaRecoveryCodes(count: ${codes.length})';
}

/// Whether a multi-factor challenge is outstanding, and until when.
///
/// The challenge TOKEN is not here. It is a credential; the data layer holds
/// it in memory for the few minutes it lives and this type reports only the
/// facts a screen needs.
@immutable
final class MfaChallengeStatus {
  const MfaChallengeStatus.none()
      : isOutstanding = false,
        expiresAt = null;

  const MfaChallengeStatus.outstanding({required DateTime expiresAt})
      : isOutstanding = true,
        expiresAt = expiresAt;

  final bool isOutstanding;

  final DateTime? expiresAt;

  /// Whether the challenge can still be redeemed at [now].
  bool isRedeemableAt(DateTime now) {
    final DateTime? deadline = expiresAt;
    if (!isOutstanding || deadline == null) {
      return false;
    }
    return now.toUtc().isBefore(deadline.toUtc());
  }

  @override
  String toString() => 'MfaChallengeStatus(outstanding: $isOutstanding)';
}
