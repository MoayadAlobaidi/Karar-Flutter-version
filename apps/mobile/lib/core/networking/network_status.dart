// PURE DART ONLY.
//
// Offline state is DERIVED from request outcomes rather than polled from a
// connectivity plugin. A radio that reports "connected" while a captive portal
// swallows every request is the common case, and a plugin would report the
// application as online throughout. What matters to the user is whether the
// API answers, which is exactly what this tracks.
import 'dart:async';

/// Whether the API is currently reachable.
enum Reachability {
  /// A request has succeeded recently.
  online,

  /// The last attempt could not reach the API at all.
  offline,

  /// Nothing has been attempted yet this launch.
  unknown,
}

/// Tracks reachability from observed request outcomes.
final class NetworkStatusTracker {
  NetworkStatusTracker();

  final StreamController<Reachability> _changes = StreamController<Reachability>.broadcast();
  Reachability _current = Reachability.unknown;

  Reachability get current => _current;

  bool get isOffline => _current == Reachability.offline;

  /// Emits on every transition. Does not replay the current value; read
  /// [current] for that.
  Stream<Reachability> get changes => _changes.stream;

  /// A request reached the server, whatever it answered.
  void recordReachable() => _transition(Reachability.online);

  /// A request could not leave the device or the connection was refused.
  void recordUnreachable() => _transition(Reachability.offline);

  void _transition(Reachability next) {
    if (_current == next) {
      return;
    }
    _current = next;
    if (!_changes.isClosed) {
      _changes.add(next);
    }
  }

  Future<void> dispose() => _changes.close();
}
