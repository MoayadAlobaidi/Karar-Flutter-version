// Providers for the consent surface.
//
// The purposes shown are the ones the PLATFORM's applicable documents cover.
// The client keeps no list of purposes, because a purpose it named itself
// would be one the platform never published.
//
// Acceptance prerequisites are read from the bootstrap answer, not computed:
// whether a jurisdiction governs the subject, whether the governing policy
// pack is approved, and whether an operating entity is bound. All three must
// hold before the platform will record an acceptance, and the control is
// disabled until they do rather than enabled and then apologised for.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/bootstrap_snapshot.dart';
import '../../../app/lifecycle/startup_state.dart';
import '../../../app/lifecycle/tenant_data_scope.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_consent_repository.dart';
import '../domain/consent_repository.dart';
import '../domain/consent_state.dart';
import '../domain/legal_document.dart';

final Provider<ConsentRepository> consentRepositoryProvider = Provider<ConsentRepository>(
  (Ref ref) => ApiConsentRepository(ref.watch(apiClientProvider)),
);

final Provider<AcceptLegalDocument> acceptLegalDocumentProvider =
    Provider<AcceptLegalDocument>(
  (Ref ref) => AcceptLegalDocument(ref.watch(consentRepositoryProvider)),
);

final Provider<WithdrawConsent> withdrawConsentProvider = Provider<WithdrawConsent>(
  (Ref ref) => WithdrawConsent(ref.watch(consentRepositoryProvider)),
);

/// The prerequisites for recording an acceptance, read from bootstrap.
///
/// Outside READY nothing is known, and nothing known fails closed.
final Provider<ConsentPrerequisites> consentPrerequisitesProvider =
    Provider<ConsentPrerequisites>((Ref ref) {
  final listenable = ref.watch(startupListenableProvider);
  void onChanged() => ref.invalidateSelf();
  listenable.addListener(onChanged);
  ref.onDispose(() => listenable.removeListener(onChanged));

  final state = listenable.state;
  if (state is! Ready) {
    return ConsentPrerequisites.none;
  }
  final snapshot = state.bootstrap;
  return ConsentPrerequisites(
    jurisdictionAssigned: snapshot.jurisdictionState == JurisdictionState.unverified ||
        snapshot.jurisdictionState == JurisdictionState.verified,
    policyPackApproved: snapshot.policyPackStatus == 'ACTIVE',
    operatingEntityAssigned:
        snapshot.operatingEntityState == OperatingEntityState.assigned,
  );
});

/// The consent surface.
sealed class ConsentSurface {
  const ConsentSurface();
}

/// The platform answered. [purposes] is empty when no published document
/// applies, which is a stated answer and not an outage.
final class ConsentSurfaceLoaded extends ConsentSurface {
  const ConsentSurfaceLoaded(this.purposes);

  final List<ConsentOverview> purposes;
}

/// The applicable-document read failed, so no purpose can be resolved at all.
final class ConsentSurfaceUnavailable extends ConsentSurface {
  const ConsentSurfaceUnavailable(this.failure);

  final Failure failure;
}

/// Loads the consent surface.
final class ConsentSurfaceController extends TenantScopedAsyncNotifier<ConsentSurface> {
  static const ResolveConsentOverview _resolve = ResolveConsentOverview();

  @override
  ConsentSurface get discarded =>
      const ConsentSurfaceUnavailable(SessionChangedFailure());

  @override
  Future<ConsentSurface> load() async {
    final repository = ref.watch(consentRepositoryProvider);
    final prerequisites = ref.watch(consentPrerequisitesProvider);

    final documents = await repository.listApplicableDocuments();
    switch (documents) {
      case Failed<List<LegalDocument>>(:final failure):
        return ConsentSurfaceUnavailable(failure);
      case Success<List<LegalDocument>>(:final value):
        final purposeRefs = <String>[];
        for (final document in value) {
          for (final purposeRef in document.purposeRefs) {
            if (!purposeRefs.contains(purposeRef)) {
              purposeRefs.add(purposeRef);
            }
          }
        }

        final overviews = <ConsentOverview>[];
        for (final purposeRef in purposeRefs) {
          final status = await repository.readStatus(purposeRef: purposeRef);
          overviews.add(
            switch (status) {
              Failed<ConsentStatusRecord>(:final failure) =>
                _resolve.unavailable(purposeRef: purposeRef, failure: failure),
              Success<ConsentStatusRecord>(:final value) => _resolve(
                  purposeRef: purposeRef,
                  status: value,
                  documents: documents.valueOrNull ?? const <LegalDocument>[],
                  prerequisites: prerequisites,
                ),
            },
          );
        }
        return ConsentSurfaceLoaded(List<ConsentOverview>.unmodifiable(overviews));
    }
  }

  /// Re-reads the surface after an action the platform confirmed.
  Future<void> refresh() async {
    final TenantDataGeneration issued = binding;
    state = const AsyncLoading<ConsentSurface>();
    final AsyncValue<ConsentSurface> answer =
        await AsyncValue.guard<ConsentSurface>(load);
    if (issued.hasEnded) {
      // The notifier survives the discard, so without this the surface read
      // under the previous binding is written back over the new one's.
      return;
    }
    state = answer;
  }
}

final AsyncNotifierProvider<ConsentSurfaceController, ConsentSurface>
    consentSurfaceControllerProvider =
    AsyncNotifierProvider<ConsentSurfaceController, ConsentSurface>(
  ConsentSurfaceController.new,
);

/// The outcome of one acceptance or withdrawal.
sealed class ConsentActionState {
  const ConsentActionState();
}

final class ConsentActionIdle extends ConsentActionState {
  const ConsentActionIdle();
}

final class ConsentActionSubmitting extends ConsentActionState {
  const ConsentActionSubmitting(this.purposeRef);

  final String purposeRef;
}

/// The platform recorded an acceptance. Reached only from a confirmed
/// response; there is no optimistic transition into it.
final class ConsentAccepted extends ConsentActionState {
  const ConsentAccepted({required this.purposeRef, required this.grant});

  final String purposeRef;
  final ConsentGrant grant;
}

/// The platform recorded a withdrawal. The prior grant is preserved as
/// evidence, which the surface states rather than implying deletion.
final class ConsentWithdrawn extends ConsentActionState {
  const ConsentWithdrawn({required this.purposeRef, required this.withdrawal});

  final String purposeRef;
  final ConsentWithdrawal withdrawal;
}

final class ConsentActionFailed extends ConsentActionState {
  const ConsentActionFailed({required this.purposeRef, required this.failure});

  final String purposeRef;
  final Failure failure;
}

/// Sequences one acceptance or withdrawal.
final class ConsentActionController extends Notifier<ConsentActionState> {
  @override
  ConsentActionState build() => const ConsentActionIdle();

  Future<void> accept({
    required String purposeRef,
    required String legalDocumentVersionId,
  }) async {
    if (state is ConsentActionSubmitting) {
      return;
    }
    final TenantDataGeneration issued = ref.tenantBinding();
    state = ConsentActionSubmitting(purposeRef);
    final result = await ref.read(acceptLegalDocumentProvider)(
      legalDocumentVersionId: legalDocumentVersionId,
      purposeRef: purposeRef,
    );
    if (issued.hasEnded) {
      // An acceptance recorded under a binding that is gone would otherwise be
      // reported as this binding's, and would refresh this binding's surface.
      return;
    }
    switch (result) {
      case Failed<ConsentGrant>(:final failure):
        state = ConsentActionFailed(purposeRef: purposeRef, failure: failure);
      case Success<ConsentGrant>(:final value):
        state = ConsentAccepted(purposeRef: purposeRef, grant: value);
        await ref.read(consentSurfaceControllerProvider.notifier).refresh();
    }
  }

  Future<void> withdraw({required String purposeRef, required String grantId}) async {
    if (state is ConsentActionSubmitting) {
      return;
    }
    final TenantDataGeneration issued = ref.tenantBinding();
    state = ConsentActionSubmitting(purposeRef);
    final result = await ref.read(withdrawConsentProvider)(grantId);
    if (issued.hasEnded) {
      return;
    }
    switch (result) {
      case Failed<ConsentWithdrawal>(:final failure):
        state = ConsentActionFailed(purposeRef: purposeRef, failure: failure);
      case Success<ConsentWithdrawal>(:final value):
        state = ConsentWithdrawn(purposeRef: purposeRef, withdrawal: value);
        await ref.read(consentSurfaceControllerProvider.notifier).refresh();
    }
  }
}

final NotifierProvider<ConsentActionController, ConsentActionState>
    consentActionControllerProvider =
    NotifierProvider<ConsentActionController, ConsentActionState>(
  ConsentActionController.new,
);
