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

  /// When set, every operation fails with this operation kind. The blunt
  /// instrument: most fail-closed tests need one call to fail and do not care
  /// which.
  SecureStorageOperation? failWith;

  /// Operations that fail while the others keep working.
  ///
  /// A keystore that still reads and writes but will not DELETE is a real
  /// condition, and it is the only way to test what becomes of a credential
  /// the user abandoned and the platform would not erase. [failWith] cannot
  /// express it: a store that also refuses reads hides the very survivor such
  /// a test is about.
  final Set<SecureStorageOperation> failingOperations = <SecureStorageOperation>{};

  /// Number of times [deleteAll] ran, for assertions about sign-out.
  int deleteAllCount = 0;

  /// A read-only view for assertions.
  Map<String, String> get entries => Map<String, String>.unmodifiable(_values);

  /// The refusal for [attempted], or null when the store should carry on.
  Result<T>? _refuse<T>(SecureStorageOperation attempted) {
    final blanket = failWith;
    if (blanket != null) {
      return Failed<T>(SecureStorageUnavailableFailure(operation: blanket));
    }
    if (failingOperations.contains(attempted)) {
      return Failed<T>(SecureStorageUnavailableFailure(operation: attempted));
    }
    return null;
  }

  @override
  Future<Result<String?>> read(SecureKey key) async =>
      _refuse<String?>(SecureStorageOperation.read) ??
      Success<String?>(_values[key.name]);

  @override
  Future<Result<void>> write(SecureKey key, String value) async {
    final refusal = _refuse<void>(SecureStorageOperation.write);
    if (refusal != null) {
      return refusal;
    }
    _values[key.name] = value;
    return const Success<void>(null);
  }

  @override
  Future<Result<void>> delete(SecureKey key) async {
    final refusal = _refuse<void>(SecureStorageOperation.delete);
    if (refusal != null) {
      return refusal;
    }
    _values.remove(key.name);
    return const Success<void>(null);
  }

  @override
  Future<Result<void>> deleteAll() async {
    deleteAllCount++;
    final refusal = _refuse<void>(SecureStorageOperation.delete);
    if (refusal != null) {
      return refusal;
    }
    _values.clear();
    return const Success<void>(null);
  }
}
