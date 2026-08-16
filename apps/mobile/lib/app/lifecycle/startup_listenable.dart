// Bridges the startup coordinator to Flutter's listenable protocol.
//
// GoRouter re-evaluates its redirect when this notifies. Keeping the bridge
// separate from the coordinator means the coordinator stays pure Dart and
// testable without a widget binding.
import 'dart:async';

import 'package:flutter/foundation.dart';

import 'startup_coordinator.dart';
import 'startup_state.dart';

/// Notifies on every startup state change.
final class StartupListenable extends ChangeNotifier {
  StartupListenable(this._coordinator) {
    _subscription = _coordinator.states.listen((StartupState _) => notifyListeners());
  }

  final StartupCoordinator _coordinator;
  late final StreamSubscription<StartupState> _subscription;

  StartupState get state => _coordinator.state;

  @override
  void dispose() {
    unawaited(_subscription.cancel());
    super.dispose();
  }
}
