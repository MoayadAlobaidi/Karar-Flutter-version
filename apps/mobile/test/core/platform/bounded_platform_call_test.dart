import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/platform/bounded_platform_call.dart';

void main() {
  group('boundedPlatformCall', () {
    test('returns the value when the call completes', () async {
      final value = await boundedPlatformCall<String>(
        operation: 'fixture.read',
        timeout: const Duration(seconds: 1),
        run: () async => 'value',
      );
      expect(value, 'value');
    });

    test('lets a THROWN failure through unchanged, so the caller keeps its own handling', () async {
      // The bound adds an outcome; it does not replace the one the platform
      // already had. A caller's `on Object catch` must still see the original.
      await expectLater(
        boundedPlatformCall<String>(
          operation: 'fixture.read',
          timeout: const Duration(seconds: 1),
          run: () async => throw const FormatException('platform said no'),
        ),
        throwsA(isA<FormatException>()),
      );
    });

    test('THE THIRD OUTCOME: a future that never completes becomes a typed failure', () async {
      // This is the case a try/catch cannot reach and the reason this file
      // exists. Without the bound the expectation below never resolves and the
      // test times out rather than passing.
      final Completer<String> never = Completer<String>();
      await expectLater(
        boundedPlatformCall<String>(
          operation: 'fixture.read',
          timeout: const Duration(milliseconds: 50),
          run: () => never.future,
        ),
        throwsA(isA<PlatformCallTimedOut>()),
      );
    });

    test('names the operation and the bound, and nothing else', () async {
      final Completer<String> never = Completer<String>();
      PlatformCallTimedOut? captured;
      try {
        await boundedPlatformCall<String>(
          operation: 'secure_storage.read',
          timeout: const Duration(milliseconds: 20),
          run: () => never.future,
        );
      } on PlatformCallTimedOut catch (error) {
        captured = error;
      }
      expect(captured, isNotNull);
      expect(captured!.operation, 'secure_storage.read');
      expect(captured.timeout, const Duration(milliseconds: 20));
      // No key, no value, no platform message can be in it: the type has
      // nowhere to put one.
      expect(
        captured.toString(),
        'PlatformCallTimedOut(operation: secure_storage.read, timeout: 20ms)',
      );
    });

    test('a late answer after the bound is discarded rather than delivered', () async {
      final Completer<String> arrivesLate = Completer<String>();
      final future = boundedPlatformCall<String>(
        operation: 'fixture.read',
        timeout: const Duration(milliseconds: 20),
        run: () => arrivesLate.future,
      );
      await expectLater(future, throwsA(isA<PlatformCallTimedOut>()));
      // The platform answering afterwards must not resurface as a second
      // completion of the same call.
      arrivesLate.complete('too late');
      expect(await arrivesLate.future, 'too late');
    });
  });

  group('the timeout policy is one policy', () {
    test('storage and storeOpen are the only durations, and they are ordered', () {
      expect(PlatformCallTimeouts.storage, const Duration(seconds: 3));
      expect(PlatformCallTimeouts.storeOpen, const Duration(seconds: 5));
      expect(
        PlatformCallTimeouts.storeOpen > PlatformCallTimeouts.storage,
        isTrue,
        reason: 'opening a store may do first-run setup; a read of an open store may not',
      );
    });
  });
}
