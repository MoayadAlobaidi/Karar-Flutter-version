// PURE DART ONLY — the port. The platform implementation is
// flutter_secure_store.dart.
//
// Everything written through this port lands in platform secure storage: the
// iOS Keychain, or Android Keystore-backed encrypted storage. Nothing else in
// the application may persist a credential.
//
// FAIL CLOSED: every operation returns a `Result`. A read that fails is NOT a
// null token — it is a failure, and the caller must treat the session as
// absent rather than assume the store is empty.
import 'package:meta/meta.dart';

import '../errors/failure.dart';
import '../errors/result.dart';

/// A key in secure storage.
@immutable
final class SecureKey {
  const SecureKey(this.name);

  final String name;

  @override
  bool operator ==(Object other) => other is SecureKey && other.name == name;

  @override
  int get hashCode => name.hashCode;

  @override
  String toString() => name;
}

/// Platform secure storage.
abstract interface class SecureStore {
  /// Reads a value. `Success(null)` means the key is genuinely absent;
  /// `Failed` means the store could not be consulted.
  Future<Result<String?>> read(SecureKey key);

  Future<Result<void>> write(SecureKey key, String value);

  Future<Result<void>> delete(SecureKey key);

  /// Removes every entry this application owns. Called on sign-out and on
  /// refresh-token reuse detection.
  Future<Result<void>> deleteAll();
}

/// An in-memory secure store for tests. Can be told to fail so that the
/// fail-closed paths are exercised.
final class InMemorySecureStore implements SecureStore {
  InMemorySecureStore();

  final Map<String, String> _values = <String, String>{};

  /// When set, every operation fails with this operation kind.
  SecureStorageOperation? failWith;

  /// Number of times [deleteAll] ran, for assertions about sign-out.
  int deleteAllCount = 0;

  /// A read-only view for assertions.
  Map<String, String> get entries => Map<String, String>.unmodifiable(_values);

  @override
  Future<Result<String?>> read(SecureKey key) async {
    final failure = failWith;
    if (failure != null) {
      return Failed<String?>(SecureStorageUnavailableFailure(operation: failure));
    }
    return Success<String?>(_values[key.name]);
  }

  @override
  Future<Result<void>> write(SecureKey key, String value) async {
    final failure = failWith;
    if (failure != null) {
      return Failed<void>(SecureStorageUnavailableFailure(operation: failure));
    }
    _values[key.name] = value;
    return const Success<void>(null);
  }

  @override
  Future<Result<void>> delete(SecureKey key) async {
    final failure = failWith;
    if (failure != null) {
      return Failed<void>(SecureStorageUnavailableFailure(operation: failure));
    }
    _values.remove(key.name);
    return const Success<void>(null);
  }

  @override
  Future<Result<void>> deleteAll() async {
    deleteAllCount++;
    final failure = failWith;
    if (failure != null) {
      return Failed<void>(SecureStorageUnavailableFailure(operation: failure));
    }
    _values.clear();
    return const Success<void>(null);
  }
}
