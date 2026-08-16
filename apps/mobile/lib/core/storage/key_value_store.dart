// PURE DART ONLY — the port. Implementations live beside it.
//
// This store is for NON-SENSITIVE preferences only: locale, theme, the
// biometric-lock choice, the last-seen onboarding step. It is backed by
// platform shared preferences, which is plain, unencrypted, and readable on a
// rooted or jailbroken device.
//
// Tokens, refresh tokens, MFA secrets, recovery codes and consent evidence
// MUST NOT be written here. `PreferenceKey` refuses to construct a key whose
// name looks sensitive, so the mistake fails at the call site rather than in
// production.
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

  Future<void> writeBool(PreferenceKey key, {required bool value});

  Future<void> remove(PreferenceKey key);

  /// Removes every value this application wrote. Called on sign-out alongside
  /// the secure-storage wipe.
  Future<void> clear();
}

/// An in-memory store. Used by tests and as the fallback when the platform
/// preference store cannot be opened — losing a theme choice is acceptable,
/// blocking startup for one is not.
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
