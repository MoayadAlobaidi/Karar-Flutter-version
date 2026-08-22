// PURE DART ONLY. See lib/README.md — this file names no plugin and imports no
// Flutter binding; it is the shape a bounded platform call has, not a caller of
// one.
//
// WHY THIS EXISTS: A HUNG PLATFORM CALL IS NEITHER SUCCESS NOR AN EXCEPTION.
//
// Every storage seam in this client is written fail-closed, and every one of
// them was written against two outcomes: the call returns, or the call throws.
// A `try`/`catch` around an `await` handles the second. It does nothing at all
// about the third, which is that the platform never answers — and a `Future`
// that never completes cannot be caught, defaulted, logged or escalated. The
// state machine above it simply stops.
//
// That third outcome is not hypothetical here. The client was executed on an
// iOS 26.5 simulator against a live local API answering `/readyz` 200 and stayed
// on the transient startup indicator for over three minutes across three
// launches, issuing no HTTP request at all. The startup sequence awaits two
// platform storage reads before it ever reaches the network, and neither of
// them was bounded.
//
// A TIMEOUT IS NOT A DEFAULT. This is the property the rest of the file exists
// to protect. "The store did not answer in time" is the same epistemic state as
// "the store threw" — we do not know what it holds — and it must therefore
// travel as the same UNAVAILABLE outcome the throwing path already produces.
// It must never become:
//
//   * `SecurityStateAbsent`, which means "the store was consulted and held
//     nothing", and which the app-lock gate is entitled to read as a user who
//     never turned the lock on. Timing out into that answer would unlock the
//     application by not answering fast enough.
//   * a successful write or removal, because a call that did not complete has
//     not been shown to have persisted anything. Reporting durability on a
//     timeout is worse than reporting failure: the caller stops retrying.
//   * an absent credential-abandonment marker, because "we could not look" is
//     not "there is nothing there".
//
// ONE POLICY, NAMED ONCE. The durations live in `PlatformCallTimeouts` and
// nowhere else. Scattered magic durations are how one seam ends up with a
// three-second bound and its neighbour with thirty, and how a reviewer loses
// the ability to answer "how long can startup take" by reading one file.

import 'dart:async';

/// The single timeout policy for platform calls whose non-completion can hold
/// a state machine open.
///
/// Two durations, and the split is deliberate.
abstract final class PlatformCallTimeouts {
  /// A local key-value or keychain read or write.
  ///
  /// These are on-device operations with no network in them: on a healthy
  /// device they complete in single-digit milliseconds. Three seconds is
  /// therefore several orders of magnitude of headroom and still well inside
  /// what a person will wait at a launch screen before deciding the app is
  /// broken. It is chosen to be generous rather than tight, because the failure
  /// this bound exists for is "never", not "slow".
  static const Duration storage = Duration(seconds: 3);

  /// Opening a store, which may do first-run setup.
  ///
  /// Longer than [storage] because a first launch can legitimately create a
  /// container, and shorter than any human patience threshold.
  static const Duration storeOpen = Duration(seconds: 5);
}

/// A platform call that did not complete within its bound.
///
/// Carries the OPERATION and nothing else. Deliberately not the key, not the
/// value, not the platform's own message: a diagnostic that names the entry
/// tells a reader of the device's logs which security decisions this person has
/// made, and a diagnostic that echoes the platform error can carry the stored
/// value with it.
final class PlatformCallTimedOut implements Exception {
  const PlatformCallTimedOut({required this.operation, required this.timeout});

  /// A stable, non-sensitive identifier such as `secure_storage.read`.
  final String operation;

  /// The bound that was exceeded.
  final Duration timeout;

  @override
  String toString() =>
      'PlatformCallTimedOut(operation: $operation, timeout: ${timeout.inMilliseconds}ms)';
}

/// Runs [run] under [timeout], throwing [PlatformCallTimedOut] if it does not
/// complete.
///
/// THE THROW IS THE POINT. Every caller of this function already has a
/// `catch`-shaped fail-closed path for the platform throwing; routing
/// non-completion into that same path is what makes the third outcome
/// disappear as a special case. A variant that returned a nullable or an
/// `Either` would have to be handled at every call site, and the sites that
/// forgot would be exactly the ones that hang.
///
/// The underlying future is NOT cancelled — Dart futures are not cancellable,
/// and pretending otherwise would be a lie in the signature. If the platform
/// answers later, the answer is discarded. That is correct for a read (we have
/// already reported that we could not look) and it is why a write reports
/// failure rather than success: the operation may yet land, and a caller told
/// "failed" will re-assert it, whereas a caller told "written" will not.
Future<T> boundedPlatformCall<T>({
  required String operation,
  required Duration timeout,
  required Future<T> Function() run,
}) {
  return run().timeout(
    timeout,
    onTimeout: () => throw PlatformCallTimedOut(operation: operation, timeout: timeout),
  );
}
