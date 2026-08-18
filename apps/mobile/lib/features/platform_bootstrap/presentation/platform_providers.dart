// Providers for the platform surface.
//
// The platform context is DERIVED from the startup coordinator's state and is
// never fetched independently. There is one authority on whether bootstrap
// resolved, and a second fetch here would be a second answer to a question
// that already has one.
//
// A screen therefore reads `platformContextProvider`, which is non-null only
// in READY. Outside READY the router has already sent the user somewhere else,
// so a null is a programming error rather than a state to render around.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/startup_state.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_jurisdiction_repository.dart';
import '../data/platform_context_mapper.dart';
import '../domain/jurisdiction_declaration.dart';
import '../domain/platform_context.dart';

/// The current startup state, rebuilt whenever the coordinator moves.
final Provider<StartupState> startupStateProvider = Provider<StartupState>((Ref ref) {
  final listenable = ref.watch(startupListenableProvider);
  void onChanged() => ref.invalidateSelf();
  listenable.addListener(onChanged);
  ref.onDispose(() => listenable.removeListener(onChanged));
  return listenable.state;
});

/// The platform context, or null when startup has not reached READY.
final Provider<PlatformContext?> platformContextProvider = Provider<PlatformContext?>(
  (Ref ref) => switch (ref.watch(startupStateProvider)) {
    Ready(:final bootstrap) => const PlatformContextMapper().toContext(bootstrap),
    _ => null,
  },
);

final Provider<JurisdictionRepository> jurisdictionRepositoryProvider =
    Provider<JurisdictionRepository>(
  (Ref ref) => ApiJurisdictionRepository(ref.watch(apiClientProvider)),
);

final Provider<DeclareOwnJurisdiction> declareOwnJurisdictionProvider =
    Provider<DeclareOwnJurisdiction>(
  (Ref ref) => DeclareOwnJurisdiction(ref.watch(jurisdictionRepositoryProvider)),
);

/// The jurisdictions the platform offers for selection.
///
/// Empty, and deliberately so: the contract exposes no endpoint that lists the
/// register's jurisdiction references, and a client that let a person type one
/// would be composing an identifier the register may not hold. The declaration
/// screen renders an honest "selection unavailable" state until an endpoint
/// supplies the list.
final Provider<List<JurisdictionReference>> jurisdictionReferenceOptionsProvider =
    Provider<List<JurisdictionReference>>((Ref ref) => const <JurisdictionReference>[]);

/// The outcome of a self-declaration attempt.
sealed class JurisdictionDeclarationState {
  const JurisdictionDeclarationState();
}

final class JurisdictionDeclarationIdle extends JurisdictionDeclarationState {
  const JurisdictionDeclarationIdle();
}

final class JurisdictionDeclarationSubmitting extends JurisdictionDeclarationState {
  const JurisdictionDeclarationSubmitting();
}

/// The platform confirmed the declaration. `recorded` is false when the same
/// jurisdiction was already in effect.
final class JurisdictionDeclarationConfirmed extends JurisdictionDeclarationState {
  const JurisdictionDeclarationConfirmed(this.declaration);

  final JurisdictionDeclaration declaration;
}

final class JurisdictionDeclarationFailed extends JurisdictionDeclarationState {
  const JurisdictionDeclarationFailed(this.failure);

  final Failure failure;
}

/// Drives one self-declaration.
///
/// The confirmed state is produced only from the platform's answer. There is
/// no optimistic transition, because a declaration nobody recorded is not a
/// declaration.
final class JurisdictionDeclarationController extends Notifier<JurisdictionDeclarationState> {
  @override
  JurisdictionDeclarationState build() => const JurisdictionDeclarationIdle();

  Future<void> declare(JurisdictionReference reference) async {
    if (state is JurisdictionDeclarationSubmitting) {
      return;
    }
    state = const JurisdictionDeclarationSubmitting();
    final result = await ref.read(declareOwnJurisdictionProvider)(reference);
    state = switch (result) {
      Success<JurisdictionDeclaration>(:final value) =>
        JurisdictionDeclarationConfirmed(value),
      Failed<JurisdictionDeclaration>(:final failure) =>
        JurisdictionDeclarationFailed(failure),
    };
  }
}

final NotifierProvider<JurisdictionDeclarationController, JurisdictionDeclarationState>
    jurisdictionDeclarationControllerProvider =
    NotifierProvider<JurisdictionDeclarationController, JurisdictionDeclarationState>(
  JurisdictionDeclarationController.new,
);
