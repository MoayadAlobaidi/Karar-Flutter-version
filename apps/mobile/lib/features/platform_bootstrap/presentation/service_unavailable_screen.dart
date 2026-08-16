// The BOOTSTRAP_UNAVAILABLE surface.
//
// THIS IS NOT THE EMPTY STATE. A 503 means the platform could not perform a
// resolution; a 200 carrying `RESOLVED` and no items means it performed one and
// had nothing to report. They render differently on purpose:
//
//   * here — an outage, with a safe retry and a reference a person can quote;
//   * there — an honest "no services are available to you" inside the signed-in
//     surface, reached only after startup succeeded.
//
// This screen leaks nothing about capabilities. It names no service, no
// entitlement and no dependency, because a failure message is not a permitted
// channel for information the successful response would have withheld. The
// correlation reference is the one identifier shown, and it is opaque by
// construction.
//
// It never navigates onward. Rendering as though resolution had succeeded is
// the specific mistake this surface exists to prevent.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../app/lifecycle/startup_state.dart';
import '../../../shared/shared.dart';
import 'platform_strings.dart';

/// Renders the service-unavailable startup gate.
final class ServiceUnavailableScreen extends ConsumerWidget {
  const ServiceUnavailableScreen({required this.state, super.key});

  final BootstrapUnavailable state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = PlatformStrings.of(context);
    final reference = state.failure.correlationId;
    // Null means the platform did not say. A retry is offered in that case,
    // because withholding one would strand a person over a silence.
    final canRetry = state.retryable != false;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsetsDirectional.all(context.spacing.screenInset),
            child: KararStateView.error(
              title: strings.serviceUnavailableTitle,
              message: canRetry
                  ? strings.serviceUnavailableDescription
                  : strings.serviceUnavailableFinalDescription,
              detail: reference == null ? null : context.l10n.stateErrorReference(reference),
              actionLabel: canRetry ? context.l10n.actionRetry : strings.actionStartOver,
              onAction: () {
                final coordinator = ref.read(startupCoordinatorProvider);
                unawaited(canRetry ? coordinator.retryBootstrap() : coordinator.start());
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// The gate-screen builder registered for [StartupStage.bootstrapUnavailable].
///
/// A state other than [BootstrapUnavailable] cannot reach this route, so the
/// fallback renders progress rather than inventing an error for a state that
/// is not one.
Widget buildServiceUnavailableScreen(BuildContext context, StartupState state) =>
    state is BootstrapUnavailable
        ? ServiceUnavailableScreen(state: state)
        : const Scaffold(body: Center(child: KararLoadingView()));
