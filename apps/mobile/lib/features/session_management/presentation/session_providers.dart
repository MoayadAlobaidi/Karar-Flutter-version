// PRESENTATION — composition and controllers for the session directory.
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_session_directory_repository.dart';
import '../domain/session_directory_repository.dart';
import '../domain/session_use_cases.dart';
import '../domain/user_session.dart';

final Provider<SessionDirectoryRepository> sessionDirectoryRepositoryProvider =
    Provider<SessionDirectoryRepository>(
  (Ref ref) => ApiSessionDirectoryRepository(
    client: ref.watch(apiClientProvider),
    idempotencyKeys: ref.watch(correlationIdGeneratorProvider),
  ),
);

final Provider<ListSessions> listSessionsUseCaseProvider = Provider<ListSessions>(
  (Ref ref) => ListSessions(ref.watch(sessionDirectoryRepositoryProvider)),
);

final Provider<RevokeSession> revokeSessionUseCaseProvider = Provider<RevokeSession>(
  (Ref ref) => RevokeSession(ref.watch(sessionDirectoryRepositoryProvider)),
);

final Provider<RevokeOtherSessions> revokeOtherSessionsUseCaseProvider =
    Provider<RevokeOtherSessions>(
  (Ref ref) => RevokeOtherSessions(ref.watch(sessionDirectoryRepositoryProvider)),
);

/// What the sessions screen renders.
@immutable
final class SessionsViewState {
  const SessionsViewState({
    this.isLoading = false,
    this.directory,
    this.failure,
    this.busySessionId,
    this.isRevokingOthers = false,
    this.revocationFailure,
    this.revokedOne = false,
    this.revokedOthersCount,
  });

  const SessionsViewState.loading()
      : isLoading = true,
        directory = null,
        failure = null,
        busySessionId = null,
        isRevokingOthers = false,
        revocationFailure = null,
        revokedOne = false,
        revokedOthersCount = null;

  const SessionsViewState.failed(Failure this.failure)
      : isLoading = false,
        directory = null,
        busySessionId = null,
        isRevokingOthers = false,
        revocationFailure = null,
        revokedOne = false,
        revokedOthersCount = null;

  final bool isLoading;

  /// Null until the first successful load. An empty directory is a loaded
  /// state, not an absent one — the difference is what separates the empty
  /// view from the loading view.
  final SessionDirectory? directory;

  /// A failure that prevented the LIST from loading.
  final Failure? failure;

  /// The session a revoke is currently in flight for.
  final String? busySessionId;

  final bool isRevokingOthers;

  /// A failure from a REVOKE. Kept apart from [failure] so a failed revoke
  /// shows a notice above a list that is still perfectly good, rather than
  /// replacing it with an error screen.
  final Failure? revocationFailure;

  final bool revokedOne;

  /// How many other sessions the server reported revoking.
  final int? revokedOthersCount;

  bool get hasLoaded => directory != null;

  bool get isBusy => isLoading || isRevokingOthers || busySessionId != null;

  SessionsViewState _loaded(
    SessionDirectory value, {
    Failure? revocationFailure,
    bool revokedOne = false,
    int? revokedOthersCount,
  }) =>
      SessionsViewState(
        directory: value,
        revocationFailure: revocationFailure,
        revokedOne: revokedOne,
        revokedOthersCount: revokedOthersCount,
      );

  @override
  String toString() => 'SessionsViewState(loaded: $hasLoaded)';
}

/// Drives the sessions screen.
final class SessionsController extends Notifier<SessionsViewState> {
  @override
  SessionsViewState build() => const SessionsViewState();

  /// Loads, or reloads after a retry.
  Future<void> load() async {
    if (state.isLoading) {
      return;
    }
    state = const SessionsViewState.loading();
    final Result<SessionDirectory> outcome = await ref.read(listSessionsUseCaseProvider)();
    if (!ref.mounted) {
      return;
    }
    state = switch (outcome) {
      Failed<SessionDirectory>(:final failure) => SessionsViewState.failed(failure),
      Success<SessionDirectory>(:final value) => SessionsViewState(directory: value),
    };
  }

  Future<void> revoke(String sessionId) async {
    if (state.isBusy) {
      return;
    }
    final SessionDirectory? current = state.directory;
    state = SessionsViewState(directory: current, busySessionId: sessionId);
    final Result<void> outcome =
        await ref.read(revokeSessionUseCaseProvider)(sessionId: sessionId);
    if (!ref.mounted) {
      return;
    }
    switch (outcome) {
      case Failed<void>(:final failure):
        state = SessionsViewState(directory: current, revocationFailure: failure);
      case Success<void>():
        // Reload rather than remove the row locally: the server is the
        // authority on what is still live, and a local edit would show a
        // directory this client invented.
        await _reloadAfterRevocation(revokedOne: true);
    }
  }

  Future<void> revokeOthers() async {
    if (state.isBusy) {
      return;
    }
    final SessionDirectory? current = state.directory;
    state = SessionsViewState(directory: current, isRevokingOthers: true);
    final Result<int> outcome = await ref.read(revokeOtherSessionsUseCaseProvider)();
    if (!ref.mounted) {
      return;
    }
    switch (outcome) {
      case Failed<int>(:final failure):
        state = SessionsViewState(directory: current, revocationFailure: failure);
      case Success<int>(:final value):
        await _reloadAfterRevocation(revokedOthersCount: value);
    }
  }

  Future<void> _reloadAfterRevocation({
    bool revokedOne = false,
    int? revokedOthersCount,
  }) async {
    final Result<SessionDirectory> reloaded =
        await ref.read(listSessionsUseCaseProvider)();
    if (!ref.mounted) {
      return;
    }
    switch (reloaded) {
      case Failed<SessionDirectory>(:final failure):
        // The revoke succeeded; only the refresh did not. Report the refresh
        // failure without claiming the revoke failed.
        state = SessionsViewState(
          directory: state.directory,
          revocationFailure: failure,
          revokedOne: revokedOne,
          revokedOthersCount: revokedOthersCount,
        );
      case Success<SessionDirectory>(:final value):
        state = const SessionsViewState()._loaded(
          value,
          revokedOne: revokedOne,
          revokedOthersCount: revokedOthersCount,
        );
    }
  }
}

final NotifierProvider<SessionsController, SessionsViewState> sessionsControllerProvider =
    NotifierProvider.autoDispose<SessionsController, SessionsViewState>(
  SessionsController.new,
);
