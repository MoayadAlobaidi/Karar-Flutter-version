// PRESENTATION — composition for the identity kernel.
//
// Providers live here, never in `domain/`. Everything is reached through
// `ref`; there is no service locator and no global singleton.
//
// The stores below are deliberately NOT auto-disposed. `PendingMfaChallengeStore`
// is written by the sign-in screen and read by the multi-factor screen, which
// are different routes: an auto-disposing provider would drop the challenge
// during the navigation between them.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/dependency_injection/providers.dart';
import '../../data/api_authentication_repository.dart';
import '../../data/pending_mfa_challenge_store.dart';
import '../../data/session_adoption.dart';
import '../../domain/repositories/authentication_repository.dart';
import '../../domain/use_cases/authentication_use_cases.dart';
import '../../domain/value_objects/password.dart';

/// The length policy the contract states. Held in a provider so a test can
/// narrow it without editing a screen.
final Provider<PasswordPolicy> passwordPolicyProvider =
    Provider<PasswordPolicy>((Ref ref) => const PasswordPolicy());

/// The in-memory holder for a login-issued multi-factor challenge.
final Provider<PendingMfaChallengeStore> pendingMfaChallengeStoreProvider =
    Provider<PendingMfaChallengeStore>((Ref ref) => PendingMfaChallengeStore());

/// The single path from a session payload into platform secure storage.
final Provider<SessionAdoption> sessionAdoptionProvider =
    Provider<SessionAdoption>(
  (Ref ref) => SessionAdoption(
    sessions: ref.watch(sessionManagerProvider),
    codec: ref.watch(sessionTokenCodecProvider),
    refreshCoordinator: ref.watch(tokenRefreshCoordinatorProvider),
    challenges: ref.watch(pendingMfaChallengeStoreProvider),
    secureStore: ref.watch(secureStoreProvider),
    logger: ref.watch(loggerProvider),
  ),
);

final Provider<AuthenticationRepository> authenticationRepositoryProvider =
    Provider<AuthenticationRepository>(
  (Ref ref) => ApiAuthenticationRepository(
    client: ref.watch(apiClientProvider),
    sessions: ref.watch(sessionManagerProvider),
    adoption: ref.watch(sessionAdoptionProvider),
    refreshCoordinator: ref.watch(tokenRefreshCoordinatorProvider),
    idempotencyKeys: ref.watch(correlationIdGeneratorProvider),
  ),
);

final Provider<RegisterAccount> registerAccountProvider = Provider<RegisterAccount>(
  (Ref ref) => RegisterAccount(ref.watch(authenticationRepositoryProvider)),
);

final Provider<SignIn> signInUseCaseProvider = Provider<SignIn>(
  (Ref ref) => SignIn(ref.watch(authenticationRepositoryProvider)),
);

final Provider<SignOut> signOutUseCaseProvider = Provider<SignOut>(
  (Ref ref) => SignOut(ref.watch(authenticationRepositoryProvider)),
);

final Provider<ChangePassword> changePasswordUseCaseProvider = Provider<ChangePassword>(
  (Ref ref) => ChangePassword(ref.watch(authenticationRepositoryProvider)),
);
