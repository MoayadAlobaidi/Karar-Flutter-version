// PURE DART ONLY — the port. Implementations live beside it.
//
// This store is for NON-SENSITIVE preferences only: locale, theme, the
// last-seen onboarding step, a dismissed hint. It is backed by platform shared
// preferences, which is plain, unencrypted, and readable on a rooted or
// jailbroken device.
//
// Tokens, refresh tokens, MFA secrets, recovery codes and consent evidence
// MUST NOT be written here. `PreferenceKey` refuses to construct a key whose
// name looks sensitive, so the mistake fails at the call site rather than in
// production.
//
// NEITHER MAY A SECURITY DECISION. This store swallows platform failures and
// falls back to memory when it cannot be opened, and both are deliberate: the
// in-memory value is the caller's intent, a failed disk write costs the user a
// tap, and no preference is worth blocking startup for. Those same two
// behaviours are how the application-lock choice came to be read as "off" on a
// device whose preference storage had failed, and how the persisted-session
// abandonment marker came to report success without reaching disk.
//
// Both values have moved to `core/security/local_security_state_store.dart`,
// which swallows nothing and has no fallback. Nothing that decides whether
// protected content renders belongs in this file again — the write path here
// deliberately offers no way to find out whether a write landed, so an author
// tempted to gate on a preference has to notice that they cannot.
import 'package:meta/meta.dart';

/// A validated preference key.
@immutable
final class PreferenceKey {
  /// Throws when [name] resembles a credential. The check is a guard rail for
  /// the whole team, not a substitute for review.
  factory PreferenceKey(String name) {
    if (name.isEmpty) {
      throw ArgumentError.value(name, 'name', 'A preference key may not be empty.');
    }
    final normalized = name.toLowerCase();
    for (final marker in _forbiddenMarkers) {
      if (normalized.contains(marker)) {
        throw ArgumentError.value(
          name,
          'name',
          'Preference storage is unencrypted; "$marker" values belong in secure storage.',
        );
      }
    }
    return PreferenceKey._(name);
  }

  const PreferenceKey._(this.name);

  static const List<String> _forbiddenMarkers = <String>[
    'token',
    'password',
    'secret',
    'credential',
    'recovery',
    'totp',
    'mfa',
    'evidence',
    'apikey',
    'api_key',
    'privatekey',
    'private_key',
  ];

  final String name;

  @override
  bool operator ==(Object other) => other is PreferenceKey && other.name == name;

  @override
  int get hashCode => name.hashCode;

  @override
  String toString() => name;
}

/// Non-sensitive key/value persistence.
abstract interface class KeyValueStore {
  String? readString(PreferenceKey key);

  Future<void> writeString(PreferenceKey key, String value);

  bool? readBool(PreferenceKey key);

  /// Writes a boolean. The platform outcome is deliberately NOT reported.
  ///
  /// For an ordinary preference — a theme choice, a dismissed hint — the
  /// in-memory value is the caller's intent and a failed disk write is not
  /// worth propagating. For anything whose correctness depends on the write
  /// having landed, this signature is the wrong tool and there is no checked
  /// variant here to reach for: use `LocalSecurityStateStore`.
  Future<void> writeBool(PreferenceKey key, {required bool value});

  Future<void> remove(PreferenceKey key);

  /// Removes every value this application wrote. Called on sign-out alongside
  /// the secure-storage wipe.
  Future<void> clear();
}

/// An in-memory store. Used by tests and as the fallback when the platform
/// preference store cannot be opened — losing a theme choice is acceptable,
/// blocking startup for one is not.
///
/// This fallback is exactly why no security decision may be read through this
/// port: an in-memory store holds no application-lock choice, and a caller that
/// defaults a missing choice to "off" has just disabled the lock because the
/// platform had a bad day.
final class InMemoryKeyValueStore implements KeyValueStore {
  final Map<String, Object> _values = <String, Object>{};

  @override
  String? readString(PreferenceKey key) {
    final value = _values[key.name];
    return value is String ? value : null;
  }

  @override
  Future<void> writeString(PreferenceKey key, String value) async {
    _values[key.name] = value;
  }

  @override
  bool? readBool(PreferenceKey key) {
    final value = _values[key.name];
    return value is bool ? value : null;
  }

  @override
  Future<void> writeBool(PreferenceKey key, {required bool value}) async {
    _values[key.name] = value;
  }

  @override
  Future<void> remove(PreferenceKey key) async {
    _values.remove(key.name);
  }

  @override
  Future<void> clear() async {
    _values.clear();
  }
}
