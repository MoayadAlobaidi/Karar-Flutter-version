// PURE DART ONLY.
//
// Cancellation crosses the whole stack: a screen disposes, its in-flight
// requests must stop. Callers hold this token rather than a transport type, so
// that a feature never imports the HTTP client to cancel a request.
import 'dart:async';

/// A one-shot cancellation signal.
final class CancellationToken {
  CancellationToken();

  final Completer<void> _completer = Completer<void>();
  String? _reason;

  /// Whether cancellation has been requested.
  bool get isCancelled => _completer.isCompleted;

  /// A non-sensitive label describing why the request was cancelled.
  String? get reason => _reason;

  /// Completes once cancellation is requested. Never completes with an error.
  Future<void> get whenCancelled => _completer.future;

  /// Requests cancellation. Idempotent: a second call is ignored so that a
  /// dispose path can cancel without checking first.
  void cancel([String reason = 'cancelled_by_caller']) {
    if (_completer.isCompleted) {
      return;
    }
    _reason = reason;
    _completer.complete();
  }
}
