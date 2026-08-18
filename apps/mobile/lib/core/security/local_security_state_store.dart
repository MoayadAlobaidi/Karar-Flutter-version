// PURE DART ONLY — the port. The platform implementation lives in
// `core/storage/preferences_local_security_state_store.dart`.
//
// THE LOCAL SECURITY-STATE STORE IS NOT THE PREFERENCE STORE.
//
// `KeyValueStore` holds a locale, a theme, a dismissed hint. Losing one of
// those costs the user a tap, so that store swallows a platform failure and
// falls back to memory when it cannot be opened. Both behaviours are correct
// THERE and catastrophic here.
//
// Two values decide whether protected content renders: the application-lock
// choice, and the persisted-session abandonment marker. Read either one
// through a store that answers "absent" when it actually means "I could not
// open", and the client concludes the lock is off, or that no credential was
// ever abandoned, and opens the door it was asked to hold shut. An independent
// review demonstrated exactly that against the preference store: the platform
// refused, `_guard` logged and returned, `readBool(...) ?? false` reported the
// lock DISABLED, and startup skipped the gate entirely.
//
// This port therefore holds four rules, and the whole design follows from
// them:
//
//   1. NOTHING IS SWALLOWED. Every operation answers with a typed outcome; no
//      implementation may catch a platform error and return a value.
//   2. THERE IS NO IN-MEMORY FALLBACK. A store that cannot be opened reports
//      UNAVAILABLE for the life of the process. It does not quietly become a
//      store that forgets everything at exit.
//   3. ABSENT MEANS ABSENT. It is returned only when the store was consulted
//      successfully and held no value — never as a stand-in for a failure.
//   4. NO CREDENTIAL LIVES HERE. The key space is a closed enum of two flags
//      and the value space is `bool`. A token, refresh token, MFA secret or
//      recovery code cannot be written through this port because there is no
//      key to name one and no type to carry one.
//
// DIAGNOSTICS CARRY NO STORED VALUE. Every outcome renders as its
// [LocalSecurityStateOutcome.diagnosticLabel], which names the OPERATION and
// its result and never the boolean. The flags record intent rather than
// secrets, but a log line that prints one still tells a reader of the device's
// logs whether the lock is on, and that is a fact about the user this client
// does not need to emit.
import 'package:meta/meta.dart';

import '../errors/failure.dart';

/// Every value the local security-state store may ever hold.
///
/// A closed enum rather than a name-validated string key, because the
/// preference store's `PreferenceKey` guard is a denylist and this is an
/// allowlist: a caller cannot invent `security.refresh_token` here, correctly
/// spelled or not, so the "no credentials in local state" rule is structural
/// rather than a check somebody has to keep current.
enum LocalSecurityFlag {
  /// The user's application-lock CHOICE.
  ///
  /// Records that a lock is WANTED. It can satisfy no lock, prove no presence
  /// and authenticate nobody; the unlock itself is process-scoped and is never
  /// persisted anywhere.
  appLockEnabled('app_lock_enabled'),

  /// The persisted-session abandonment marker.
  ///
  /// One boolean recording that whatever credential is in secure storage is no
  /// longer permitted to be restored. It is not a token and not a copy of one.
  /// See `core/security/token_store.dart` for the ordering it participates in.
  persistedSessionAbandoned('persisted_session_abandoned');

  const LocalSecurityFlag(this.storageName);

  /// The name this flag is persisted under. Namespaced by the implementation.
  final String storageName;
}

/// The base of everything this port can answer with.
///
/// Sealed, and split into one sealed family per operation, so that a caller's
/// `switch` is checked for exhaustiveness at compile time and a new outcome
/// cannot be swallowed by a default branch.
@immutable
sealed class LocalSecurityStateOutcome {
  const LocalSecurityStateOutcome();

  /// Short, non-sensitive label naming the operation and its result.
  ///
  /// NEVER contains the stored value. See the file header.
  String get diagnosticLabel;

  @override
  String toString() => diagnosticLabel;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/// The outcome of reading one flag.
@immutable
sealed class SecurityStateRead extends LocalSecurityStateOutcome {
  const SecurityStateRead();

  /// The flag's value, or null when there is no trustworthy answer.
  ///
  /// Deliberately null for ABSENT as well as for the two faults: a caller that
  /// wants "absent means off" must say so by switching, because that default is
  /// safe for the lock choice and wrong for the abandonment marker.
  bool? get valueOrNull => switch (this) {
        SecurityStateValue(:final value) => value,
        SecurityStateAbsent() || SecurityStateUnavailable() || SecurityStateCorrupt() =>
          null,
      };

  /// True when the store was consulted successfully, whatever it held.
  bool get isAnswered => this is SecurityStateValue || this is SecurityStateAbsent;

  /// The typed failure for a fault, or null when the store answered.
  Failure? get failureOrNull => switch (this) {
        SecurityStateValue() || SecurityStateAbsent() => null,
        SecurityStateUnavailable() => const LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.read,
          ),
        SecurityStateCorrupt() => const LocalSecurityStateCorruptFailure(),
      };
}

/// SUCCESS. The store was consulted and holds this value.
final class SecurityStateValue extends SecurityStateRead {
  const SecurityStateValue(this.value);

  final bool value;

  @override
  String get diagnosticLabel => 'security_state_present';
}

/// ABSENT. The store was consulted successfully and holds no value for the
/// flag.
///
/// Returned ONLY after a successful consultation. An implementation that
/// answers this because it could not open, could not read, or caught an error
/// has broken the port's central promise; see rule 3 in the file header.
final class SecurityStateAbsent extends SecurityStateRead {
  const SecurityStateAbsent();

  @override
  String get diagnosticLabel => 'security_state_absent';
}

/// UNAVAILABLE. The store could not be opened or could not be read.
///
/// The caller has NO answer. It must not substitute a default, and it must not
/// render anything the missing answer was meant to gate.
final class SecurityStateUnavailable extends SecurityStateRead {
  const SecurityStateUnavailable();

  @override
  String get diagnosticLabel => 'security_state_unavailable';
}

/// CORRUPT. A value exists under the flag and is not a boolean.
///
/// Distinguished from ABSENT because the two mean opposite things: absent is a
/// user who never chose, corrupt is a value that was written and has since been
/// damaged or tampered with. It fails closed like UNAVAILABLE, and the value
/// itself is never read out or reported.
final class SecurityStateCorrupt extends SecurityStateRead {
  const SecurityStateCorrupt();

  @override
  String get diagnosticLabel => 'security_state_corrupt';
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/// The outcome of writing one flag.
@immutable
sealed class SecurityStateWrite extends LocalSecurityStateOutcome {
  const SecurityStateWrite();

  /// True only when the platform CONFIRMED the write.
  ///
  /// The one question every caller of this port's write path has to ask: an
  /// application lock that is enabled in memory and nowhere else is off, and
  /// an abandonment marker that never reached the platform protects nothing
  /// while reporting success.
  bool get isDurable => this is SecurityStateWritten;

  Failure? get failureOrNull => switch (this) {
        SecurityStateWritten() => null,
        SecurityStateWriteFailed() => const LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.write,
          ),
        SecurityStateWriteUnavailable() => const LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.open,
          ),
      };
}

/// SUCCESS. The platform accepted the write.
final class SecurityStateWritten extends SecurityStateWrite {
  const SecurityStateWritten();

  @override
  String get diagnosticLabel => 'security_state_written';
}

/// WRITE_FAILED. The store is open and the platform refused this write.
final class SecurityStateWriteFailed extends SecurityStateWrite {
  const SecurityStateWriteFailed();

  @override
  String get diagnosticLabel => 'security_state_write_failed';
}

/// UNAVAILABLE. The store was never opened, so no write was even attempted.
///
/// Kept apart from [SecurityStateWriteFailed] because the remedies differ: a
/// refused write may succeed on retry, an unopened store will refuse every
/// write for the life of the process.
final class SecurityStateWriteUnavailable extends SecurityStateWrite {
  const SecurityStateWriteUnavailable();

  @override
  String get diagnosticLabel => 'security_state_write_unavailable';
}

// ---------------------------------------------------------------------------
// Removing
// ---------------------------------------------------------------------------

/// The outcome of removing one flag.
@immutable
sealed class SecurityStateRemoval extends LocalSecurityStateOutcome {
  const SecurityStateRemoval();

  /// True only when the platform CONFIRMED the removal.
  bool get isDurable => this is SecurityStateRemoved;

  Failure? get failureOrNull => switch (this) {
        SecurityStateRemoved() => null,
        SecurityStateRemoveFailed() => const LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.remove,
          ),
        SecurityStateRemoveUnavailable() => const LocalSecurityStateUnavailableFailure(
            operation: LocalSecurityStateOperation.open,
          ),
      };
}

/// SUCCESS. The platform accepted the removal.
final class SecurityStateRemoved extends SecurityStateRemoval {
  const SecurityStateRemoved();

  @override
  String get diagnosticLabel => 'security_state_removed';
}

/// REMOVE_FAILED. The store is open and the platform refused this removal.
final class SecurityStateRemoveFailed extends SecurityStateRemoval {
  const SecurityStateRemoveFailed();

  @override
  String get diagnosticLabel => 'security_state_remove_failed';
}

/// UNAVAILABLE. The store was never opened, so no removal was attempted.
final class SecurityStateRemoveUnavailable extends SecurityStateRemoval {
  const SecurityStateRemoveUnavailable();

  @override
  String get diagnosticLabel => 'security_state_remove_unavailable';
}

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

/// Durable storage for the two local security decisions.
///
/// Every method returns a typed outcome and none of them throws. An
/// implementation that catches a platform error must map it to the matching
/// fault case; converting it to a value is the defect this port exists to make
/// impossible.
abstract interface class LocalSecurityStateStore {
  /// Reads [flag]. Asynchronous on purpose: an implementation may not cache a
  /// snapshot taken at open time and then answer from it after the platform
  /// has stopped responding.
  Future<SecurityStateRead> read(LocalSecurityFlag flag);

  /// Writes [flag], reporting whether the platform accepted it.
  Future<SecurityStateWrite> write(LocalSecurityFlag flag, {required bool value});

  /// Removes [flag], reporting whether the platform accepted it.
  Future<SecurityStateRemoval> remove(LocalSecurityFlag flag);
}

/// A store that reports UNAVAILABLE for everything.
///
/// This is what an implementation returns when the platform store cannot be
/// opened. It is NOT a degraded store — it holds nothing, forgets nothing, and
/// tells every caller the truth, so the application blocks on a startup state
/// that says so rather than proceeding on an invented default.
///
/// Compare `InMemoryKeyValueStore`, which is a legitimate fallback for a theme
/// choice and would be a fail-open disaster here: it answers ABSENT, and ABSENT
/// reads as "the user never turned the lock on".
final class UnavailableLocalSecurityStateStore implements LocalSecurityStateStore {
  const UnavailableLocalSecurityStateStore();

  @override
  Future<SecurityStateRead> read(LocalSecurityFlag flag) async =>
      const SecurityStateUnavailable();

  @override
  Future<SecurityStateWrite> write(LocalSecurityFlag flag, {required bool value}) async =>
      const SecurityStateWriteUnavailable();

  @override
  Future<SecurityStateRemoval> remove(LocalSecurityFlag flag) async =>
      const SecurityStateRemoveUnavailable();
}

/// An in-memory store, for tests and for a build with no platform storage.
///
/// It is never installed as a FALLBACK. The composition root wires either the
/// platform store or [UnavailableLocalSecurityStateStore]; this type is
/// constructed only where a test wants a working store it can break on demand.
final class InMemoryLocalSecurityStateStore implements LocalSecurityStateStore {
  InMemoryLocalSecurityStateStore();

  final Map<LocalSecurityFlag, Object?> _values = <LocalSecurityFlag, Object?>{};

  /// Flags whose READ reports the store could not be consulted.
  final Set<LocalSecurityFlag> unreadableFlags = <LocalSecurityFlag>{};

  /// Flags whose stored value is damaged, so a read reports CORRUPT.
  final Set<LocalSecurityFlag> corruptFlags = <LocalSecurityFlag>{};

  /// Flags whose WRITE is refused. The stored value is left untouched, which
  /// is what a platform that rejected the call actually leaves behind.
  final Set<LocalSecurityFlag> unwritableFlags = <LocalSecurityFlag>{};

  /// Flags whose REMOVAL is refused.
  final Set<LocalSecurityFlag> unremovableFlags = <LocalSecurityFlag>{};

  /// Every flag written, in order, as `flag=value`. Lets a test assert what
  /// reached local storage without reaching into the map.
  final List<String> writes = <String>[];

  @override
  Future<SecurityStateRead> read(LocalSecurityFlag flag) async {
    if (unreadableFlags.contains(flag)) {
      return const SecurityStateUnavailable();
    }
    if (corruptFlags.contains(flag)) {
      return const SecurityStateCorrupt();
    }
    final Object? value = _values[flag];
    if (value == null) {
      return const SecurityStateAbsent();
    }
    return value is bool ? SecurityStateValue(value) : const SecurityStateCorrupt();
  }

  @override
  Future<SecurityStateWrite> write(LocalSecurityFlag flag, {required bool value}) async {
    if (unwritableFlags.contains(flag)) {
      return const SecurityStateWriteFailed();
    }
    writes.add('${flag.storageName}=$value');
    _values[flag] = value;
    return const SecurityStateWritten();
  }

  @override
  Future<SecurityStateRemoval> remove(LocalSecurityFlag flag) async {
    if (unremovableFlags.contains(flag)) {
      return const SecurityStateRemoveFailed();
    }
    _values.remove(flag);
    return const SecurityStateRemoved();
  }
}
