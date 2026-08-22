// ASKS THE UI ISOLATE A QUESTION AND WAITS FOR THE ANSWER.
//
// The frame watch in `startup_smoke.sh` can prove that a screen came to REST.
// It cannot prove WHICH screen, and that is the whole difficulty: an app frozen
// on the transient indicator and an app that reached the sign-in screen before
// the first sample produce the same evidence — a run of identical frames.
//
// This probe decides it, and decides it twice over:
//
//   LIVENESS.  A service extension is dispatched on the UI isolate. An isolate
//              whose event loop has stopped cannot answer one. So an answer
//              arriving at all is the proof the frame watch cannot give, and it
//              is a property of the thread rather than of the timing.
//
//   CONTENT.   The answer is the widget tree. A tree containing the startup
//              gate is a person still waiting; a tree containing a route they
//              can act on is a person who has arrived.
//
// Debug artifacts only, which is what the smoke check builds. A release build
// has no service extensions, and this refuses rather than guesses.
//
// USAGE
//   dart run tool/startup_probe.dart <ws-uri> [timeout-seconds]
//
// EXIT
//   0  the UI isolate answered, and the answer is printed on stdout
//   1  it did not answer in time, or the artifact exposes no service extension
import 'dart:async';
import 'dart:io';

import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

Future<void> main(List<String> args) async {
  if (args.isEmpty) {
    stderr.writeln('usage: startup_probe.dart <ws-uri> [timeout-seconds]');
    exit(64);
  }
  final uri = args[0];
  final timeout = Duration(
    seconds: int.tryParse(args.length > 1 ? args[1] : '') ?? 20,
  );

  VmService? service;
  try {
    service = await vmServiceConnectUri(uri).timeout(timeout);
    final vm = await service.getVM().timeout(timeout);

    // THE FIRST isolate is not good enough. A Flutter app runs more than one,
    // and only the one that owns the widget tree can answer this — asking the
    // wrong one returns an error that reads exactly like a hang.
    IsolateRef? ui;
    for (final IsolateRef ref in vm.isolates ?? const <IsolateRef>[]) {
      final Isolate isolate = await service
          .getIsolate(ref.id!)
          .timeout(timeout);
      if ((isolate.extensionRPCs ?? const <String>[]).contains(
        'ext.flutter.debugDumpApp',
      )) {
        ui = ref;
        break;
      }
    }
    if (ui == null) {
      stderr.writeln(
        'no isolate exposes ext.flutter.debugDumpApp — this is not a debug Flutter build',
      );
      exit(1);
    }

    // The timeout is the point of the whole exercise: a wedged UI isolate
    // accepts the request and never completes it, and an await with no bound
    // would hang this process in exactly the way the app under test is
    // suspected of hanging.
    final Response answer = await service
        .callServiceExtension('ext.flutter.debugDumpApp', isolateId: ui.id)
        .timeout(timeout);

    // AN EMPTY ANSWER IS NOT AN ANSWER. `debugDumpApp` returns the tree under
    // `data`; if that key is missing the isolate replied to the transport
    // without describing anything, and printing '' would let the caller grep a
    // blank string for the transient marker, find nothing, and report that the
    // tree holds no transient screen. The liveness half would be true and the
    // content half would be invented. Found by an independent review at the
    // closeout, in a probe written to stop exactly that kind of claim.
    final Object? tree = answer.json?['data'];
    final String rendered = tree?.toString() ?? '';
    if (rendered.trim().isEmpty) {
      stderr.writeln(
        'the UI isolate answered but returned no widget tree, so the screen it is '
        'showing cannot be determined',
      );
      exit(1);
    }
    stdout.writeln(rendered);
    exit(0);
  } on TimeoutException {
    stderr.writeln(
      'the UI isolate did not answer within ${timeout.inSeconds}s',
    );
    exit(1);
  } on Object catch (error) {
    stderr.writeln('probe failed: $error');
    exit(1);
  } finally {
    await service?.dispose();
  }
}
