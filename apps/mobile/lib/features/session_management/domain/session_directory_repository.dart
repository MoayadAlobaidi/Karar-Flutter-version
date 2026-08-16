// PURE DART ONLY.
import '../../../core/errors/result.dart';
import 'user_session.dart';

/// Reading and revoking the caller's own sessions.
abstract interface class SessionDirectoryRepository {
  Future<Result<SessionDirectory>> list();

  /// Revokes one session and its refresh families.
  ///
  /// A session that is not live answers not-found, which is indistinguishable
  /// from one belonging to another account. The caller treats both the same.
  Future<Result<void>> revoke({required String sessionId});

  /// Revokes every session except the calling one.
  ///
  /// Returns the number the server reported revoking, so the confirmation can
  /// state a fact rather than an assumption.
  Future<Result<int>> revokeOthers();
}
