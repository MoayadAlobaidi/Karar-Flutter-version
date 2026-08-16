// PURE DART ONLY.
//
// Time is injected, never read from a static. Token expiry, refresh windows
// and session lifetime are all decided against this abstraction so that the
// tests covering them are deterministic rather than wall-clock dependent.
import 'package:meta/meta.dart';

/// A source of the current instant.
abstract interface class Clock {
  /// The current instant in UTC. Implementations must return UTC so that
  /// comparisons against server timestamps never depend on the device zone.
  DateTime nowUtc();
}

/// The production clock.
@immutable
final class SystemClock implements Clock {
  const SystemClock();

  @override
  DateTime nowUtc() => DateTime.now().toUtc();
}

/// A clock whose instant is set by the test.
final class FixedClock implements Clock {
  FixedClock(DateTime instant) : _instant = instant.toUtc();

  DateTime _instant;

  /// Moves the clock forward. Negative durations are rejected: a clock that
  /// can run backwards would make expiry checks untestable.
  void advance(Duration by) {
    if (by.isNegative) {
      throw ArgumentError.value(by, 'by', 'A clock may not move backwards.');
    }
    _instant = _instant.add(by);
  }

  /// Repositions the clock to an explicit instant.
  void setTo(DateTime instant) => _instant = instant.toUtc();

  @override
  DateTime nowUtc() => _instant;
}
