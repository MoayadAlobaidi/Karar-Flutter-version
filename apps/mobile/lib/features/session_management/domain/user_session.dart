// PURE DART ONLY.
//
// A live session as the platform is willing to describe it.
//
// The server MINIMISES this at the edge: a coarse user-agent summary, and no
// raw address or user agent. The client does not enrich it, does not geolocate
// it, and does not persist it. What is shown is exactly what was returned.
import 'package:meta/meta.dart';

/// One of the caller's live sessions.
@immutable
final class UserSession {
  const UserSession({
    required this.sessionId,
    required this.createdAt,
    required this.isCurrent,
    this.lastSeenAt,
    this.absoluteExpiresAt,
    this.userAgentSummary,
  });

  /// Opaque identifier. Non-secret; it is what a revoke addresses.
  final String sessionId;

  final DateTime createdAt;

  /// Whether this is the session the request was made from. It is offered a
  /// different action: sign out, never revoke.
  final bool isCurrent;

  final DateTime? lastSeenAt;

  /// When the session dies regardless of activity.
  final DateTime? absoluteExpiresAt;

  /// The coarse device summary the server chose to expose, or null when it
  /// exposed none. Never a raw user-agent string.
  final String? userAgentSummary;

  @override
  bool operator ==(Object other) =>
      other is UserSession &&
      other.sessionId == sessionId &&
      other.createdAt == createdAt &&
      other.isCurrent == isCurrent &&
      other.lastSeenAt == lastSeenAt &&
      other.absoluteExpiresAt == absoluteExpiresAt &&
      other.userAgentSummary == userAgentSummary;

  @override
  int get hashCode => Object.hash(
        sessionId,
        createdAt,
        isCurrent,
        lastSeenAt,
        absoluteExpiresAt,
        userAgentSummary,
      );

  @override
  String toString() => 'UserSession($sessionId, current: $isCurrent)';
}

/// The caller's sessions, ordered for display.
@immutable
final class SessionDirectory {
  const SessionDirectory(this.sessions);

  final List<UserSession> sessions;

  bool get isEmpty => sessions.isEmpty;

  /// The current session, when the server marked one.
  UserSession? get current {
    for (final UserSession session in sessions) {
      if (session.isCurrent) {
        return session;
      }
    }
    return null;
  }

  /// Every session other than the current one.
  List<UserSession> get others =>
      sessions.where((UserSession session) => !session.isCurrent).toList(growable: false);

  /// Whether "revoke every other session" would do anything.
  bool get hasOthers => others.isNotEmpty;

  /// The current session first, then the rest by most recently seen.
  ///
  /// Ordering is decided here rather than in a widget so it is testable
  /// without a widget tree, and so both languages get the same order.
  SessionDirectory sortedForDisplay() {
    final List<UserSession> sorted = List<UserSession>.of(sessions)
      ..sort((UserSession a, UserSession b) {
        if (a.isCurrent != b.isCurrent) {
          return a.isCurrent ? -1 : 1;
        }
        final DateTime left = a.lastSeenAt ?? a.createdAt;
        final DateTime right = b.lastSeenAt ?? b.createdAt;
        return right.compareTo(left);
      });
    return SessionDirectory(List<UserSession>.unmodifiable(sorted));
  }

  @override
  String toString() => 'SessionDirectory(${sessions.length})';
}
