// Default screens for the startup gate routes.
//
// These are PLACEHOLDERS with a deliberate shape: each renders the stage it
// represents and offers exactly the one recovery action the state declares, so
// the machine is walkable end to end before any product screen exists. They
// carry no branding, no copy worth translating, and no data of any kind.
//
// A feature workstream replaces one by overriding `startupScreenOverrides`
// (see app/dependency_injection/providers.dart) with a builder for that stage.
// No file in this directory needs editing to do it.
import 'package:flutter/material.dart';

import '../lifecycle/startup_state.dart';

/// Renders one startup gate state and its recovery action.
final class StartupGateScreen extends StatelessWidget {
  const StartupGateScreen({
    required this.state,
    required this.onRecover,
    super.key,
  });

  final StartupState state;

  /// Invoked when the user takes the state's declared recovery action. Null
  /// when the state has no action the user can take.
  final VoidCallback? onRecover;

  @override
  Widget build(BuildContext context) {
    if (state.isTransient) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator.adaptive()),
      );
    }
    final action = onRecover;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  state.stage.name,
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  state.recovery.name,
                  style: Theme.of(context).textTheme.bodySmall,
                  textAlign: TextAlign.center,
                ),
                if (action != null) ...<Widget>[
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: action,
                    child: Text(state.recovery.name),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The protected root placeholder.
///
/// Replaced by the feature workstream that owns the signed-in landing surface.
/// It renders nothing but a confirmation that startup resolved — in
/// particular, no balance, account, transaction or other financial value, none
/// of which this layer has or may invent.
final class ReadyPlaceholderScreen extends StatelessWidget {
  const ReadyPlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: Text(
              StartupStage.ready.name,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ),
      );
}
