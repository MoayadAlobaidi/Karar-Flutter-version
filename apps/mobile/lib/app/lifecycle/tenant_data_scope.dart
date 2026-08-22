// DISCARDING ONE ORGANISATION'S ANSWERS WHEN THE BINDING CHANGES OR THE
// SESSION ENDS.
//
// `ref.invalidate` IS NOT A DISCARD. It is a RELOAD: the element re-runs
// `build`, and `AsyncLoading.copyWithPrevious` carries the previous value
// forward so a screen can render stale-while-revalidate data. `AsyncValue.value`
// therefore keeps answering with the PREVIOUS organisation's data for the whole
// reload window, and `AsyncValue.when` renders it, because `skipLoadingOnRefresh`
// defaults to true. Invalidating on a tenant switch and calling that an
// isolation boundary is the defect this file exists to close.
//
// THERE IS EXACTLY ONE ASSIGNMENT THAT ERASES. Of the three `AsyncValue`
// transitions, only `AsyncData` drops what was there:
//
//   state = AsyncLoading()  -> hasValue stays true, `value` is the old answer;
//   state = AsyncError(…)   -> hasValue stays true, `value` is the old answer;
//   state = AsyncData(x)    -> `copyWithPrevious` returns `this`. ERASED.
//
// So an asynchronous provider can only be emptied FROM THE INSIDE, by writing a
// fresh `AsyncData` of a value that means "no answer is held here". A
// `FutureProvider` has no inside — no notifier, no way to write its state — so
// every tenant-scoped asynchronous read in this build is a
// [TenantScopedAsyncNotifier] instead, and the registry below will not accept
// anything else.
//
// WHY A FAMILY CANNOT BE DISCARDED FROM THE OUTSIDE. `ref.read(family(arg).notifier)`
// needs `arg`, and nothing at the point of discard knows which arguments are
// live. So the direction is inverted: every element registers ITSELF with
// [TenantDataScope] for as long as it holds an answer, and the scope empties
// what is registered. An element that has never built holds nothing; an element
// that is rebuilding re-registers before it awaits anything.
//
// THE SECOND HALF IS THE LATE ANSWER. Riverpod REUSES the notifier instance
// across an invalidation — only `build` re-runs — so `ref.mounted` is still
// true and a hand-written `state = …` after an `await` lands on the live
// element under the NEW organisation. Emptying the element does not help if the
// previous organisation's answer is written back a moment later, so every write
// that follows an `await` takes a [TenantDataGeneration] first and drops itself
// if the binding it was issued under has since been discarded.
//
// The transport refuses such an answer too, by comparing the session identifier
// it captured before the request with the one signed in when the response
// arrives (see `core/networking/dio_api_transport.dart`). That is the defence
// for the real network path and it is the more important one. It cannot be the
// only one: a value already cached needs no request to leak, and a repository
// that answers from anywhere other than that transport never passes the check.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart'
    show AsyncNotifierProviderFamily, ProviderOrFamily;

/// Why one organisation's cached answers are being discarded.
///
/// The two are not the same operation. A binding CHANGE leaves a live session
/// bound to a different organisation, so the discarded reads are worth issuing
/// again. A session that ENDED has no credential to read under, and re-issuing
/// would be a request nothing can answer.
enum TenantDataDiscardReason {
  /// The session is now bound to a different organisation.
  bindingChanged,

  /// The session ended. Nothing may be read until another one begins.
  sessionEnded,
}

/// The live tenant-scoped asynchronous reads, and the generation of the binding
/// they hold answers for.
///
/// One per [ProviderContainer], which is one per process — see
/// `app/bootstrap/app_bootstrap.dart`. The container outlives every session it
/// serves, which is precisely why anything cached in it has to be discarded by
/// hand.
final class TenantDataScope {
  /// Identity-keyed: [TenantScopedAsyncNotifier] does not define `==`, and two
  /// elements of the same family must both be reachable.
  final Set<TenantScopedAsyncNotifier<Object?>> _live =
      <TenantScopedAsyncNotifier<Object?>>{};

  int _generation = 0;

  /// Incremented by every discard. A write that carries an older generation is
  /// an answer to a question the previous organisation was asked.
  int get generation => _generation;

  /// How many elements would be emptied right now. Diagnostics and tests only.
  int get liveAnswerCount => _live.length;

  /// Registers [notifier] for as long as it holds an answer, and answers with
  /// the callback that unregisters it.
  void Function() register(TenantScopedAsyncNotifier<Object?> notifier) {
    _live.add(notifier);
    return () => _live.remove(notifier);
  }

  /// Empties every live answer and moves the generation on.
  ///
  /// Iterates a copy: emptying an element can invalidate it, and an
  /// invalidation unregisters it.
  void discardHeldAnswers() {
    _generation++;
    for (final notifier in _live.toList(growable: false)) {
      notifier.discardHeldAnswer();
    }
  }
}

/// The scope.
///
/// DEPENDS ON NOTHING, deliberately. Every tenant-scoped asynchronous provider
/// reads it while building, so anything it watched would become a dependency of
/// the whole financial and platform surface — and a screen test that overrode
/// only its own repository would start failing on a credential store it has no
/// reason to know about. The two triggers reach it from outside instead: a
/// binding change through `TenantBindingController`, and a session ending
/// through the subscription `startupCoordinatorProvider` installs.
final Provider<TenantDataScope> tenantDataScopeProvider =
    Provider<TenantDataScope>((Ref ref) => TenantDataScope());

/// Every provider whose value belongs to one organisation, WITH the operation
/// that discards it.
///
/// Typed rather than a bare `List<ProviderOrFamily>`: a list of references is a
/// list somebody has to remember to extend, and remembering is the part that
/// rots. Here a provider cannot be registered without saying which kind it is,
/// and the asynchronous kind will not accept a provider that has no way to
/// empty itself — so "registered but not actually discarded" is not a state the
/// types allow.
///
/// Overridden at composition time with every workstream's contribution; see
/// `app/composition/feature_surface.dart`. A provider missing from here
/// survives a switch and will be read under the wrong organisation.
final Provider<List<TenantScopedProvider>> tenantScopedDataProvider =
    Provider<List<TenantScopedProvider>>(
  (Ref ref) => const <TenantScopedProvider>[],
);

/// Discards every registered provider's answer, for [reason].
///
/// The order is fixed: EMPTY first, then invalidate. Emptying is what removes
/// the previous organisation's answer; the invalidation that follows only
/// starts the replacement read, and on its own would leave that answer readable
/// for the whole reload window.
void discardTenantScopedData(Ref ref, TenantDataDiscardReason reason) {
  ref.read(tenantDataScopeProvider).discardHeldAnswers();
  for (final TenantScopedProvider entry in ref.read(tenantScopedDataProvider)) {
    entry.discard(ref, reason);
  }
}

/// One provider whose value belongs to one organisation, together with the
/// operation that discards that value.
///
/// Sealed and constructed only through [tenantScopedNotifier],
/// [tenantScopedAsync] and [tenantScopedAsyncFamily], each of which accepts
/// only the provider shape whose discard it can perform.
sealed class TenantScopedProvider {
  const TenantScopedProvider(this.provider);

  /// The provider itself, so the registry can still be read as a plain list of
  /// what is registered.
  final ProviderOrFamily provider;

  /// Leaves this provider holding no answer from the previous organisation.
  void discard(Ref ref, TenantDataDiscardReason reason);
}

/// A provider whose state is a plain value rather than an [AsyncValue].
///
/// `ref.invalidate` IS a discard for one of these, and the reason is worth
/// stating: a synchronous provider's state is recomputed by `build` on the next
/// read, and there is no `AsyncValue` to carry a previous value forward. A form
/// controller that was mid-submission comes back as idle.
final class SynchronousTenantScopedProvider extends TenantScopedProvider {
  const SynchronousTenantScopedProvider(super.provider);

  @override
  void discard(Ref ref, TenantDataDiscardReason reason) => ref.invalidate(provider);
}

/// A provider whose state is an [AsyncValue], built on
/// [TenantScopedAsyncNotifier].
///
/// The emptying has already happened by the time this runs: every live element
/// is registered with [TenantDataScope], which empties them all before the
/// registry is walked. What is left is to start the read for the organisation
/// that is bound NOW — and only when one is. After a sign-out there is no
/// credential, so invalidating would issue a request that must fail and would
/// refill the element with a failure nobody asked for.
final class AsynchronousTenantScopedProvider extends TenantScopedProvider {
  const AsynchronousTenantScopedProvider(super.provider);

  @override
  void discard(Ref ref, TenantDataDiscardReason reason) {
    if (reason == TenantDataDiscardReason.bindingChanged) {
      ref.invalidate(provider);
    }
  }
}

/// Registers a synchronous provider — a form controller, a filter, an
/// arrangement — as tenant-scoped.
TenantScopedProvider tenantScopedNotifier<NotifierT extends Notifier<StateT>, StateT>(
  NotifierProvider<NotifierT, StateT> provider,
) =>
    SynchronousTenantScopedProvider(provider);

/// Registers an asynchronous provider as tenant-scoped.
///
/// The bound on [NotifierT] is the whole point: only a
/// [TenantScopedAsyncNotifier] can empty itself, so a provider that would
/// survive the discard cannot be registered here at all. Converting it is the
/// only way to add it.
TenantScopedProvider
    tenantScopedAsync<NotifierT extends TenantScopedAsyncNotifier<StateT>, StateT>(
  AsyncNotifierProvider<NotifierT, StateT> provider,
) =>
        AsynchronousTenantScopedProvider(provider);

/// Registers an asynchronous FAMILY as tenant-scoped. See [tenantScopedAsync].
TenantScopedProvider tenantScopedAsyncFamily<
    NotifierT extends TenantScopedAsyncNotifier<StateT>, StateT, ArgT>(
  AsyncNotifierProviderFamily<NotifierT, StateT, ArgT> family,
) =>
    AsynchronousTenantScopedProvider(family);

/// An asynchronous read whose answer belongs to ONE organisation.
///
/// Subclasses supply [load] and [discarded] instead of `build`. [discarded] is
/// what the provider holds when it holds nothing — an empty list, an
/// unavailable view, null — and writing it is the only thing that erases; see
/// the note at the top of this file.
///
/// A `FutureProvider` cannot be one of these, which is why none of the
/// tenant-scoped reads is a `FutureProvider` any more.
abstract base class TenantScopedAsyncNotifier<ValueT> extends AsyncNotifier<ValueT> {
  /// What this provider holds when it holds no organisation's answer.
  ValueT get discarded;

  /// Reads the answer for the binding the session holds now.
  Future<ValueT> load();

  @override
  Future<ValueT> build() {
    // Registered from `build` rather than from a constructor because `build` is
    // what makes an answer exist. `onDispose` runs before every rebuild and on
    // the element's destruction, so the registration pairs exactly and a
    // rebuilt element re-registers before it awaits anything.
    ref.onDispose(ref.read(tenantDataScopeProvider).register(this));
    return load();
  }

  /// Replaces the held answer with [discarded].
  ///
  /// Called by [TenantDataScope] only. Without it a tenant switch leaves the
  /// previous organisation's answer readable — and rendered — for the whole
  /// reload window, because `ref.invalidate` reloads rather than erases.
  void discardHeldAnswer() => state = AsyncData<ValueT>(discarded);

  /// A witness of the binding as it stands NOW, to be taken BEFORE an `await`
  /// and checked after it. See [TenantDataGeneration].
  TenantDataGeneration get binding => ref.tenantBinding();
}

/// A witness that the session is still bound to the organisation it was bound
/// to when this was taken.
///
/// Taken before an `await`, checked after it. Riverpod reuses a notifier across
/// an invalidation, so `ref.mounted` is still true for an element that has
/// already been discarded and rebuilt: it cannot answer this question and must
/// not be used for it.
final class TenantDataGeneration {
  TenantDataGeneration._(this._scope) : _taken = _scope.generation;

  final TenantDataScope _scope;
  final int _taken;

  /// Whether the organisation's data has been discarded since this was taken —
  /// by a switch or by the session ending. A write guarded by this drops
  /// itself; an unguarded one writes the previous organisation's answer into
  /// the state the new organisation's screens read.
  bool get hasEnded => _scope.generation != _taken;
}

/// Takes a [TenantDataGeneration] from any provider's `ref`.
extension TenantDataScopeRef on Ref {
  /// A witness of the current binding, for a write that follows an `await`.
  TenantDataGeneration tenantBinding() =>
      TenantDataGeneration._(read(tenantDataScopeProvider));
}
