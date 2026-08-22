// THE CAPABILITY GATE FOR THE WHOLE FINANCIAL SURFACE.
//
// Financial navigation and financial routes exist only while the platform's
// CLIENT-SAFE bootstrap says the TRANSACTIONS capability is available. Three
// properties hold, and each is tested:
//
//   * NO NAV ITEM. The home shell reads this gate before it builds a
//     destination, so nothing names the surface when it is absent;
//   * NO SCREEN. Every financial route is wrapped in [FinancialCapabilityGate],
//     which decides BEFORE the screen widget is constructed. A screen that is
//     never built reads no provider, so no repository is constructed and no
//     request is issued — a deep link is refused without touching the network;
//   * NOTHING RETAINED. The gate holds no financial state of its own, and the
//     providers that would hold some are only ever read from inside a built
//     screen. Nothing to keep means nothing to clear.
//
// The gate fails CLOSED. `BootstrapSnapshot.hasCapability` already answers
// false when capability resolution did not complete, and every startup state
// other than READY answers false here, so an unresolved bootstrap, an expired
// session and an unknown state are all the same closed door.
//
// WHY THIS IS NOT THE PLATFORM'S `navigableCapabilityIds` ALLOWLIST. That
// allowlist drives the home screen's SERVICES section, whose contract is that
// an identifier the build did not register produces no destination anywhere,
// not even as a count. It is deliberately empty and a regression test asserts
// that it stays empty. This gate is a different question — "may this build
// mount its own routes" — asked of the same client-safe answer, and it names
// one identifier the platform already publishes rather than enumerating what
// the platform can do.
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/bootstrap_snapshot.dart';
import '../../../app/lifecycle/startup_state.dart';
import 'financial_unavailable_screen.dart';

/// The capability identifier the financial surface is gated on, exactly as the
/// platform publishes it.
const String transactionsCapabilityId = 'TRANSACTIONS';

/// The bootstrap answer, or null outside READY.
///
/// Derived from the startup coordinator rather than fetched: there is one
/// authority on what bootstrap returned, and a second read here would be a
/// second answer to a question that already has one.
final Provider<BootstrapSnapshot?> financialBootstrapProvider =
    Provider<BootstrapSnapshot?>((Ref ref) {
  final listenable = ref.watch(startupListenableProvider);
  void onChanged() => ref.invalidateSelf();
  listenable.addListener(onChanged);
  ref.onDispose(() => listenable.removeListener(onChanged));
  return switch (listenable.state) {
    Ready(:final bootstrap) => bootstrap,
    _ => null,
  };
});

/// Whether this build may mount the financial surface at all.
///
/// A `bool` on purpose: Riverpod notifies a dependant only when a value
/// changes, so every startup transition that leaves the answer alone leaves
/// the routes and the navigation bar alone with it.
final Provider<bool> financialSurfaceEnabledProvider = Provider<bool>((Ref ref) {
  final bootstrap = ref.watch(financialBootstrapProvider);
  if (bootstrap == null) {
    return false;
  }
  return bootstrap.hasCapability(transactionsCapabilityId);
});

/// Builds [child] only when the capability is present.
///
/// The builder is a callback rather than a widget so the financial screen is
/// not CONSTRUCTED when the gate is closed. A constructed-but-hidden screen
/// still runs its provider reads, and a provider read is what starts a
/// request.
final class FinancialCapabilityGate extends ConsumerWidget {
  const FinancialCapabilityGate({required this.builder, super.key});

  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(financialSurfaceEnabledProvider)) {
      return const FinancialUnavailableScreen();
    }
    return builder(context);
  }
}
