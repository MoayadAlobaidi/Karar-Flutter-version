// PURE DART ONLY.
import '../../../core/errors/result.dart';
import 'session_directory_repository.dart';
import 'user_session.dart';

/// Lists the caller's live sessions, ordered for display.
final class ListSessions {
  const ListSessions(this._repository);

  final SessionDirectoryRepository _repository;

  Future<Result<SessionDirectory>> call() async {
    final Result<SessionDirectory> listed = await _repository.list();
    return listed.map((SessionDirectory directory) => directory.sortedForDisplay());
  }
}

/// Revokes one session.
final class RevokeSession {
  const RevokeSession(this._repository);

  final SessionDirectoryRepository _repository;

  Future<Result<void>> call({required String sessionId}) =>
      _repository.revoke(sessionId: sessionId);
}

/// Revokes every session except the current one.
final class RevokeOtherSessions {
  const RevokeOtherSessions(this._repository);

  final SessionDirectoryRepository _repository;

  Future<Result<int>> call() => _repository.revokeOthers();
}
