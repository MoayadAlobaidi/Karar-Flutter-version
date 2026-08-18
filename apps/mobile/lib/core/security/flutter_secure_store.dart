// Platform secure storage: iOS Keychain, Android Keystore-backed storage.
//
// Configuration decisions made here, and why:
//   * iOS accessibility is `first_unlock_this_device`. The refresh flow must
//     work after a reboot while the device sits locked in a pocket, so
//     `unlocked` is too strict; `this_device` keeps the credential out of
//     iCloud Keychain and off any restored backup.
//   * Android `resetOnError` is true. A key-material change makes existing
//     ciphertext undecryptable; dropping it forces re-authentication, which is
//     the closed outcome. Leaving unreadable ciphertext in place would leave
//     the install permanently broken.
//   * Every failure is returned, never swallowed. A caller that cannot read
//     the store must behave as though there is no credential.
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../errors/failure.dart';
import '../errors/result.dart';
import '../logging/app_logger.dart';
import 'secure_store.dart';

/// [SecureStore] over the platform keystore.
final class FlutterSecureStore implements SecureStore {
  FlutterSecureStore({required AppLogger logger, FlutterSecureStorage? storage})
      : _logger = logger.forCategory('security'),
        _storage = storage ??
            const FlutterSecureStorage(
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
              mOptions: MacOsOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
              aOptions: AndroidOptions(
                resetOnError: true,
                preferencesKeyPrefix: secureStorageNamespace,
              ),
            );

  /// Namespace for entries this application owns.
  static const String namespace = secureStorageNamespace;

  final FlutterSecureStorage _storage;
  final CategoryLogger _logger;

  String _qualify(SecureKey key) => '$namespace.${key.name}';

  @override
  Future<Result<String?>> read(SecureKey key) async {
    try {
      return Success<String?>(await _storage.read(key: _qualify(key)));
    } on Object catch (error) {
      return _fail<String?>(SecureStorageOperation.read, key, error);
    }
  }

  @override
  Future<Result<void>> write(SecureKey key, String value) async {
    try {
      await _storage.write(key: _qualify(key), value: value);
      return const Success<void>(null);
    } on Object catch (error) {
      return _fail<void>(SecureStorageOperation.write, key, error);
    }
  }

  @override
  Future<Result<void>> delete(SecureKey key) async {
    try {
      await _storage.delete(key: _qualify(key));
      return const Success<void>(null);
    } on Object catch (error) {
      return _fail<void>(SecureStorageOperation.delete, key, error);
    }
  }

  @override
  Future<Result<void>> deleteAll() async {
    try {
      final all = await _storage.readAll();
      for (final entryKey in all.keys) {
        if (entryKey.startsWith('$namespace.')) {
          await _storage.delete(key: entryKey);
        }
      }
      return const Success<void>(null);
    } on Object catch (error) {
      // A wipe that cannot complete is reported. The caller escalates: the
      // session is ended regardless, and the in-memory credential is dropped.
      return _fail<void>(SecureStorageOperation.delete, const SecureKey('*'), error);
    }
  }

  Result<T> _fail<T>(SecureStorageOperation operation, SecureKey key, Object error) {
    // The key NAME is logged; a value never is, and neither is the platform
    // error message, which can echo the entry.
    _logger.error(
      'Secure storage operation failed; treating the credential as absent.',
      fields: <String, Object?>{'operation': operation.name, 'entry': key.name},
      error: error,
    );
    return Failed<T>(SecureStorageUnavailableFailure(operation: operation));
  }
}

/// Prefix applied to every secure entry.
const String secureStorageNamespace = 'karar_secure';
