// THE SIGNED-IN LANDING SURFACE, WITH FINANCIAL NAVIGATION WHEN IT APPLIES.
//
// Without the capability this widget IS the platform home screen — the same
// widget, built the same way, with nothing added and nothing named. There is no
// disabled tab, no greyed-out row and no "coming soon": a person whose account
// does not carry the capability sees exactly what they saw before this
// workstream existed.
//
// With the capability, a bottom navigation bar appears with two destinations.
// The navigation bar is the ONLY place the financial surface is named, so the
// gate is read once, here, and the answer decides whether the name exists at
// all.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/lifecycle/startup_state.dart';
import '../../../shared/shared.dart';
import '../../platform_bootstrap/presentation/platform_feature_registration.dart';
import 'accounts_and_wallets_screen.dart';
import 'financial_capability.dart';

/// The home builder the composition root installs.
Widget buildFinancialHomeShell(BuildContext context, StartupState state) =>
    FinancialHomeShell(state: state);

/// The home surface, with or without financial navigation.
final class FinancialHomeShell extends ConsumerStatefulWidget {
  const FinancialHomeShell({required this.state, super.key});

  final StartupState state;

  @override
  ConsumerState<FinancialHomeShell> createState() => _FinancialHomeShellState();
}

class _FinancialHomeShellState extends ConsumerState<FinancialHomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final enabled = ref.watch(financialSurfaceEnabledProvider);
    if (!enabled) {
      // Byte-for-byte the surface that existed before this workstream. No tab
      // bar is built, so nothing names the financial surface anywhere in the
      // tree — not as a destination, not as a disabled one, not as a count.
      return buildPlatformHomeScreen(context, widget.state);
    }

    final l10n = context.l10n;
    final destinations = <KararNavigationDestination>[
      KararNavigationDestination(
        icon: KararIcons.statusNeutral,
        label: l10n.financialHomeTabHome,
      ),
      KararNavigationDestination(
        icon: KararIcons.document,
        label: l10n.financialHomeTabAccounts,
      ),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: <Widget>[
          buildPlatformHomeScreen(context, widget.state),
          const AccountsAndWalletsScreen(),
        ],
      ),
      bottomNavigationBar: KararNavigationBar(
        destinations: destinations,
        selectedIndex: _index,
        onDestinationSelected: (int index) => setState(() => _index = index),
      ),
    );
  }
}
