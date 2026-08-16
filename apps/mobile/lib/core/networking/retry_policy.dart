// PURE DART ONLY.
//
// IDEMPOTENCY-AWARE RETRY.
//
// The policy has one hard rule: a request the client cannot prove is safe to
// repeat is never repeated automatically. `ApiRequest.isReplayable` decides
// that — an idempotent method, or an explicit idempotency key. Everything
// else fails once and returns to the caller.
//
// The second rule bounds the blast radius: attempts are capped, delays grow
// exponentially, and each delay carries jitter so that a fleet of clients
// recovering from an outage does not arrive in a single wave.
import 'dart:math';

import 'package:meta/meta.dart';

import '../errors/failure.dart';

/// Retry configuration.
@immutable
final class RetryPolicy {
  const RetryPolicy({
    this.maxAttempts = 3,
    this.baseDelay = const Duration(milliseconds: 250),
    this.maxDelay = const Duration(seconds: 4),
    this.jitterFraction = 0.25,
  })  : assert(maxAttempts >= 1, 'At least one attempt must be made.'),
        assert(jitterFraction >= 0 && jitterFraction <= 1, 'Jitter is a fraction of the delay.');

  /// Total attempts including the first. A value of 1 disables retrying.
  final int maxAttempts;

  final Duration baseDelay;

  final Duration maxDelay;

  /// Proportion of each delay that is randomised.
  final double jitterFraction;

  /// No retries at all. Used for the refresh call, which must never storm.
  static const RetryPolicy none = RetryPolicy(maxAttempts: 1);

  /// Whether [failure] describes a condition a repeat could resolve.
  ///
  /// Deliberately excludes every 4xx except rate limiting: a rejected request
  /// is rejected, and repeating it only consumes budget. Also excludes
  /// contract violations, which are a build problem, and cancellation, which
  /// the caller asked for.
  bool isRetryableFailure(Failure failure) => switch (failure) {
        OfflineFailure() || TimeoutFailure() || DependencyUnavailableFailure() => true,
        RateLimitedFailure() => true,
        _ => false,
      };

  /// The wait before attempt number [attempt] (1-based; the first retry is
  /// attempt 2). [serverRequested] takes precedence when the server named a
  /// wait, capped at [maxDelay] so a hostile or mistaken header cannot park
  /// the application indefinitely.
  Duration delayBefore(int attempt, {Duration? serverRequested, Random? random}) {
    if (serverRequested != null) {
      return serverRequested > maxDelay ? maxDelay : serverRequested;
    }
    final exponent = attempt - 2 < 0 ? 0 : attempt - 2;
    final scaled = baseDelay * pow(2, exponent).toDouble();
    final capped = scaled > maxDelay ? maxDelay : scaled;
    if (jitterFraction == 0) {
      return capped;
    }
    final generator = random ?? Random();
    final jitterRange = capped.inMicroseconds * jitterFraction;
    final offset = (generator.nextDouble() * 2 - 1) * jitterRange;
    final withJitter = capped.inMicroseconds + offset;
    return Duration(microseconds: withJitter < 0 ? 0 : withJitter.round());
  }
}
