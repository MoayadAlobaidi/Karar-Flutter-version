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
import '../platform/bounded_platform_call.dart';
import 'secure_store.dart';

/// [SecureStore] over the platform keystore.
final class FlutterSecureStore implements SecureStore {
  FlutterSecureStore({required AppLogger logger, FlutterSecureStorage? storage})
    : _logger = logger.forCategory('security'),
      _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
            mOptions: MacOsOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
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
      return Success<String?>(
        await boundedPlatformCall<String?>(
          operation: 'secure_storage.read',
          timeout: PlatformCallTimeouts.storage,
          run: () => _storage.read(key: _qualify(key)),
        ),
      );
    } on Object catch (error) {
      return _fail<String?>(SecureStorageOperation.read, key, error);
    }
  }

  @override
  Future<Result<void>> write(SecureKey key, String value) async {
    try {
      await boundedPlatformCall<void>(
        operation: 'secure_storage.write',
        timeout: PlatformCallTimeouts.storage,
        run: () => _storage.write(key: _qualify(key), value: value),
      );
      return const Success<void>(null);
    } on Object catch (error) {
      return _fail<void>(SecureStorageOperation.write, key, error);
    }
  }

  @override
  Future<Result<void>> delete(SecureKey key) async {
    try {
      await boundedPlatformCall<void>(
        operation: 'secure_storage.delete',
        timeout: PlatformCallTimeouts.storage,
        run: () => _storage.delete(key: _qualify(key)),
      );
      return const Success<void>(null);
    } on Object catch (error) {
      return _fail<void>(SecureStorageOperation.delete, key, error);
    }
  }

  @override
  Future<Result<void>> deleteAll() async {
    try {
      final all = await boundedPlatformCall<Map<String, String>>(
        operation: 'secure_storage.read_all',
        timeout: PlatformCallTimeouts.storage,
        run: () => _storage.readAll(),
      );
      for (final entryKey in all.keys) {
        if (entryKey.startsWith('$namespace.')) {
          // Each entry is bounded on its own. A wipe of many entries must not
          // be able to hold the caller open by the SUM of the entries: the
          // caller of `deleteAll` is ending a session, which is the one moment
          // a person must never be left waiting on a store that is not
          // answering.
          await boundedPlatformCall<void>(
            operation: 'secure_storage.delete',
            timeout: PlatformCallTimeouts.storage,
            run: () => _storage.delete(key: entryKey),
          );
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
    // A TIMEOUT ARRIVES HERE, deliberately, by the same door a throw does.
    //
    // `boundedPlatformCall` throws `PlatformCallTimedOut`, which this `on
    // Object catch` already covers, so "the keychain did not answer" produces
    // exactly the `SecureStorageUnavailableFailure` that "the keychain threw"
    // produces. That is the correct answer and not a convenience: in both
    // cases we do not know what the store holds, and the one thing that must
    // never happen is a non-answer becoming an ABSENT credential — which the
    // session manager is entitled to read as a person who is simply not signed
    // in, and the token store as an absent abandonment marker.
    //
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
