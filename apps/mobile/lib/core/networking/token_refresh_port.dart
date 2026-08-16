// PURE DART ONLY.
//
// The transport depends on this narrow port rather than on the concrete
// coordinator, and the coordinator implements it without importing the
// transport. That is what lets the refresh call be issued through a RAW
// transport — one with no credential attachment and no refresh hook — so a
// refresh can never re-enter the refresh path.
import '../errors/result.dart';
import '../security/session_tokens.dart';

/// What the transport needs from the refresh coordinator.
abstract interface class TokenRefreshPort {
  /// Returns a credential safe to send now, refreshing at most once across
  /// all concurrent callers.
  Future<Result<SessionTokens>> ensureUsable(SessionTokens observed);

  /// Refreshes because the server rejected [observed], even though the client
  /// believed it was still valid.
  Future<Result<SessionTokens>> refreshAfterRejection(SessionTokens observed);
}
