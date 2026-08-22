// THE DOCUMENT-PICKER CHANNEL, ASSERTED WITHOUT A DEVICE.
//
// DEVICE EXECUTION IS NOT VERIFIED HERE, AND NO TEST IN THIS FILE IMPLIES IT
// IS. Nothing below opens a system document picker, presents a view controller,
// or reads a file off a device. What is asserted is everything that can be
// asserted from a host:
//
//   1. THE CONTRACT. The real `MethodChannel` is driven through the framework's
//      mock messenger, so the channel name, the method name, the argument map
//      and the shape of every answer are checked as they are actually encoded —
//      not as a fake remembers them.
//   2. THE MAPPING. Every answer the platform can give, including every error
//      code, is mapped onto the port's typed outcomes. This is the part that
//      decides what a person is told, so it is exercised exhaustively.
//   3. THE NATIVE HALVES, AT THE SOURCE LEVEL. Both native files are read and
//      asserted to speak the same names as Dart, to use the single-document
//      mechanism the port requires, and — the point of the whole exercise — to
//      contain none of the things that would widen what this application may
//      reach. A source assertion is weaker than running the code; it is also
//      the strongest thing available here, and it catches the rename and the
//      "temporary" persisted grant, which is what it is for.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/statement_imports/data/platform_statement_source_picker.dart';
import 'package:karar_mobile/features/statement_imports/data/unavailable_statement_source_picker.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_source.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_source_picker.dart';

import '../../security/support/source_tree.dart';

const String _kotlinHalf =
    'android/app/src/main/kotlin/com/kararfinance/app/StatementDocumentPicker.kt';
const String _kotlinHost = 'android/app/src/main/kotlin/com/kararfinance/app/MainActivity.kt';
const String _swiftHalf = 'ios/Runner/StatementDocumentPicker.swift';

/// A channel that answers with whatever a test scripted, or raises what it was
/// given. Used for the mapping group; the contract group uses the real channel.
final class _ScriptedChannel implements DocumentPickerChannel {
  _ScriptedChannel.answering(this._answer) : _fault = null;

  _ScriptedChannel.raising(Exception fault)
      : _answer = null,
        _fault = fault;

  final Object? _answer;
  final Exception? _fault;

  int callCount = 0;
  int? lastMaxBytes;

  @override
  Future<Object?> pickCsvSource({required int maxBytes}) async {
    callCount++;
    lastMaxBytes = maxBytes;
    final Exception? fault = _fault;
    if (fault != null) {
      throw fault;
    }
    return _answer;
  }
}

/// The bytes of a chosen document, as the standard codec delivers them.
Map<Object?, Object?> _chosenPayload(List<int> bytes, {String mediaType = 'text/csv'}) =>
    <Object?, Object?>{
      bytesResultKey: Uint8List.fromList(bytes),
      mediaTypeResultKey: mediaType,
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('the channel contract', () {
    const MethodChannel channel = MethodChannel(documentPickerChannelName);
    late List<MethodCall> calls;

    TestDefaultBinaryMessenger messenger() =>
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

    void answerWith(Future<Object?> Function(MethodCall call) handler) {
      messenger().setMockMethodCallHandler(channel, (MethodCall call) {
        calls.add(call);
        return handler(call);
      });
      addTearDown(() => messenger().setMockMethodCallHandler(channel, null));
    }

    setUp(() => calls = <MethodCall>[]);

    test('the channel is named exactly what both native halves listen on', () {
      // Stated literally rather than by interpolation: this is the string that
      // has to match three files, and a test that read the constant it is
      // checking would agree with any rename on either side.
      expect(documentPickerChannelName, 'com.kararfinance.app/document_picker');
      expect(pickCsvSourceMethod, 'pickCsvSource');
    });

    test('one method is invoked, with only the byte bound as its argument', () async {
      answerWith((MethodCall call) async => null);

      await const MethodChannelDocumentPicker().pickCsvSource(maxBytes: maxSourceBytes);

      expect(calls, hasLength(1));
      expect(calls.single.method, pickCsvSourceMethod);
      // EXACTLY ONE ARGUMENT. Not a path, not a directory, not a filter the
      // caller composed, not a flag. The channel is narrow because a wider one
      // is a general file-reading capability with a picker attached.
      expect(calls.single.arguments, <String, Object?>{maxBytesArgument: maxSourceBytes});
    });

    test('the bound sent over the channel is the server’s, not one invented here', () async {
      // 10 MiB, written out. It mirrors
      // `INGESTION_LIMIT_POLICIES.csvStatementImport.maxBytes` in
      // packages/platform/src/ingestion/limits.ts, and a client bound that
      // drifted from the platform's would be worse than no bound at all.
      answerWith((MethodCall call) async => null);

      await PlatformStatementSourcePicker(
        channel: const MethodChannelDocumentPicker(),
      ).pickStatementSource();

      expect(calls.single.arguments, <String, Object?>{maxBytesArgument: 10485760});
    });

    test('a chosen document arrives as bytes and a declared type, and nothing else',
        () async {
      final Uint8List sent = Uint8List.fromList(<int>[0x44, 0x61, 0x74, 0x65]);
      answerWith(
        (MethodCall call) async => <Object?, Object?>{
          bytesResultKey: sent,
          mediaTypeResultKey: 'text/csv',
        },
      );

      final PickerOutcome outcome = await PlatformStatementSourcePicker(
        channel: const MethodChannelDocumentPicker(),
      ).pickStatementSource();

      expect(outcome, isA<PickerOutcomeChosen>());
      final PickedStatementSource source = (outcome as PickerOutcomeChosen).source;
      expect(source.bytes, sent);
      expect(source.declaredMediaType, 'text/csv');
      // NO FILENAME CROSSES THE CHANNEL, and there is nowhere for one to land:
      // the port has no field for it. Asserted because a name is the thing a
      // future change would be most tempted to add "just for the summary".
      expect(source.toString(), 'PickedStatementSource()');
    });

    test('a null answer is a dismissal, encoded and decoded for real', () async {
      answerWith((MethodCall call) async => null);

      final PickerOutcome outcome = await PlatformStatementSourcePicker(
        channel: const MethodChannelDocumentPicker(),
      ).pickStatementSource();

      expect(outcome, isA<PickerOutcomeCancelled>());
    });

    test('an unreadable document crosses the channel as a bare code', () async {
      late PlatformException raised;
      answerWith((MethodCall call) async {
        throw PlatformException(code: sourceUnreadableCode);
      });

      final PickerOutcome outcome = await PlatformStatementSourcePicker(
        channel: _RecordingChannel(
          const MethodChannelDocumentPicker(),
          onError: (PlatformException error) => raised = error,
        ),
      ).pickStatementSource();

      expect(outcome, isA<PickerOutcomeUnreadable>());
      expect(raised.code, sourceUnreadableCode);
      // NO MESSAGE, NO DETAILS. A platform error string routinely carries the
      // full path of the file, and a path carries a name.
      expect(raised.message, isNull);
      expect(raised.details, isNull);
    });

    test('no registered handler is reported as unavailable, not as a fault', () async {
      // Nothing is registered for the channel, which is exactly the state on a
      // host with no native half — the machine this suite runs on included.
      final PickerOutcome outcome = await PlatformStatementSourcePicker(
        channel: const MethodChannelDocumentPicker(),
      ).pickStatementSource();

      expect(outcome, isA<PickerOutcomeUnavailable>());
    });
  });

  group('what each answer means to a person', () {
    test('a chosen document is handed over by identity', () async {
      final Uint8List bytes = Uint8List.fromList(<int>[1, 2, 3, 4]);
      final channel = _ScriptedChannel.answering(<Object?, Object?>{
        bytesResultKey: bytes,
        mediaTypeResultKey: 'text/csv',
      });

      final PickerOutcome outcome =
          await PlatformStatementSourcePicker(channel: channel).pickStatementSource();

      // BY IDENTITY: not a copy, not a re-encoding. What the person's bank
      // wrote is what the platform parses.
      expect((outcome as PickerOutcomeChosen).source.bytes, same(bytes));
      expect(channel.lastMaxBytes, maxSourceBytes);
    });

    test('the picker is asked once per request', () async {
      final channel = _ScriptedChannel.answering(null);

      await PlatformStatementSourcePicker(channel: channel).pickStatementSource();

      expect(channel.callCount, 1);
    });

    test('an unavailable picker is distinct from a failure', () async {
      final channel = _ScriptedChannel.raising(
        PlatformException(code: pickerUnavailableCode),
      );

      expect(
        await PlatformStatementSourcePicker(channel: channel).pickStatementSource(),
        isA<PickerOutcomeUnavailable>(),
      );
    });

    test('a picker already open reports no document, and says nothing', () async {
      // Nothing was chosen for THIS request and the person is looking at the
      // picker that answers the earlier one. Narrating that back at them would
      // be a message about a race they did not cause.
      final channel = _ScriptedChannel.raising(PlatformException(code: pickerBusyCode));

      expect(
        await PlatformStatementSourcePicker(channel: channel).pickStatementSource(),
        isA<PickerOutcomeCancelled>(),
      );
    });

    test('a malformed request is refused without blaming the person', () async {
      final channel = _ScriptedChannel.raising(
        PlatformException(code: invalidRequestCode),
      );

      expect(
        await PlatformStatementSourcePicker(channel: channel).pickStatementSource(),
        isA<PickerOutcomeUnreadable>(),
      );
    });

    test('a code this build does not know fails closed and offers a retry', () async {
      final channel = _ScriptedChannel.raising(
        PlatformException(code: 'SOMETHING_ADDED_LATER'),
      );

      expect(
        await PlatformStatementSourcePicker(channel: channel).pickStatementSource(),
        isA<PickerOutcomeUnreadable>(),
      );
    });

    test('a missing implementation is unavailable rather than unreadable', () async {
      final channel = _ScriptedChannel.raising(
        MissingPluginException('no implementation on this host'),
      );

      expect(
        await PlatformStatementSourcePicker(channel: channel).pickStatementSource(),
        isA<PickerOutcomeUnavailable>(),
      );
    });

    test('a channel fault of any other kind is unreadable', () async {
      final channel = _ScriptedChannel.raising(const FormatException('codec'));

      expect(
        await PlatformStatementSourcePicker(channel: channel).pickStatementSource(),
        isA<PickerOutcomeUnreadable>(),
      );
    });

    test('an answer of the wrong shape is unreadable, not a crash', () async {
      for (final Object? malformed in <Object?>[
        'not a map',
        <Object?, Object?>{},
        <Object?, Object?>{bytesResultKey: 'not bytes'},
        <Object?, Object?>{mediaTypeResultKey: 'text/csv'},
      ]) {
        final channel = _ScriptedChannel.answering(malformed);
        expect(
          await PlatformStatementSourcePicker(channel: channel).pickStatementSource(),
          isA<PickerOutcomeUnreadable>(),
          reason: 'a native half answering $malformed must not reach a screen as a throw',
        );
      }
    });

    test('a media type this build cannot use is replaced, never carried around',
        () async {
      final Uint8List bytes = Uint8List.fromList(<int>[1]);
      for (final Object? declared in <Object?>[
        null,
        '',
        '   ',
        42,
      ]) {
        final channel = _ScriptedChannel.answering(<Object?, Object?>{
          bytesResultKey: bytes,
          mediaTypeResultKey: declared,
        });
        final PickerOutcome outcome =
            await PlatformStatementSourcePicker(channel: channel).pickStatementSource();
        expect(
          (outcome as PickerOutcomeChosen).source.declaredMediaType,
          'application/octet-stream',
        );
      }
    });

    test('an unbounded media type is discarded rather than held', () async {
      final channel = _ScriptedChannel.answering(<Object?, Object?>{
        bytesResultKey: Uint8List.fromList(<int>[1]),
        mediaTypeResultKey: 'text/${'x' * 4000}',
      });

      final PickerOutcome outcome =
          await PlatformStatementSourcePicker(channel: channel).pickStatementSource();

      expect(
        (outcome as PickerOutcomeChosen).source.declaredMediaType,
        'application/octet-stream',
      );
    });

    test('a document past the bound still reaches the client, and is refused there',
        () async {
      // The native halves read ONE BYTE past the bound and stop. That extra
      // byte is what makes an oversized file arrive longer than the bound, so
      // the existing refusal states the reason instead of a truncated statement
      // being uploaded as though it were whole.
      final channel = _ScriptedChannel.answering(
        _chosenPayload(List<int>.filled(maxSourceBytes + 1, 0x61)),
      );

      final PickerOutcome outcome =
          await PlatformStatementSourcePicker(channel: channel).pickStatementSource();

      final SelectedStatementSource selected = SelectedStatementSource(
        bytes: (outcome as PickerOutcomeChosen).source.bytes,
        declaredMediaType: outcome.source.declaredMediaType,
      );
      expect(selected.problem, SourceProblem.tooLarge);
    });

    test('a host with no native half gets the picker that says so', () {
      // `platformStatementSourcePicker()` selects by the host it is RUNNING on,
      // and the suite runs on a desktop host. The unavailable path therefore
      // stays reachable and stays exercised.
      expect(platformStatementSourcePicker(), isA<UnavailableStatementSourcePicker>());
    });
  });

  group('the native halves, read as source', () {
    late String kotlin;
    late String kotlinHost;
    late String swift;

    setUpAll(() {
      // Comments are stripped: both files legitimately NAME the mechanisms
      // asserted absent below, in the prose explaining why they are absent. A
      // comment must not be able to satisfy — or break — an assertion.
      kotlin = stripCodeComments(readRequiredFile(_kotlinHalf));
      kotlinHost = stripCodeComments(readRequiredFile(_kotlinHost));
      swift = stripCodeComments(readRequiredFile(_swiftHalf));
    });

    test('both halves speak the names Dart sends', () {
      for (final String half in <String>[kotlin, swift]) {
        expect(half, contains('"$documentPickerChannelName"'));
        expect(half, contains('"$pickCsvSourceMethod"'));
        expect(half, contains('"$maxBytesArgument"'));
        expect(half, contains('"$bytesResultKey"'));
        expect(half, contains('"$mediaTypeResultKey"'));
        for (final String code in <String>[
          pickerUnavailableCode,
          sourceUnreadableCode,
          pickerBusyCode,
          invalidRequestCode,
        ]) {
          expect(half, contains('"$code"'));
        }
      }
    });

    test('Android asks for one openable document and never for storage', () {
      expect(kotlin, contains('Intent.ACTION_OPEN_DOCUMENT'));
      expect(kotlin, contains('Intent.CATEGORY_OPENABLE'));
      expect(kotlin, contains('Intent.EXTRA_MIME_TYPES'));
      expect(kotlin, contains('"text/csv"'));
    });

    test('Android takes no permission, no subtree and no lasting grant', () {
      // THIS IS THE POINT OF THE WHOLE MECHANISM. Each of these buys access to
      // more than the one file a person chose, and the merged-manifest
      // allow-list in test/security/platform_hardening_test.dart is what makes
      // a permission fail the build. This assertion catches the attempt one
      // step earlier, in the code that would have needed it.
      const List<String> forbidden = <String>[
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'MANAGE_EXTERNAL_STORAGE',
        'READ_MEDIA_',
        'ACTION_OPEN_DOCUMENT_TREE',
        'ACTION_GET_CONTENT',
        'FLAG_GRANT_PERSISTABLE_URI_PERMISSION',
        'takePersistableUriPermission',
        'requestPermissions',
        'checkSelfPermission',
        // A filename is not carried, so the column that would supply one is
        // never queried.
        'OpenableColumns',
        'DISPLAY_NAME',
      ];
      for (final String token in forbidden) {
        expect(
          kotlin,
          isNot(contains(token)),
          reason: '$token reaches for more than the one document the person chose',
        );
        expect(kotlinHost, isNot(contains(token)));
      }
    });

    test('Android reads the stream under the bound and closes it deterministically',
        () {
      expect(kotlin, contains('maxBytes + 1'));
      // `use` closes on every exit path, including a throw.
      expect(kotlin, contains('openInputStream(uri)?.use'));
      // Nothing is copied anywhere: no cache file, no application-support copy.
      for (final String token in <String>['cacheDir', 'filesDir', 'createTempFile']) {
        expect(kotlin, isNot(contains(token)));
      }
    });

    test('iOS opens the document in place and never copies it', () {
      expect(swift, contains('UIDocumentPickerViewController'));
      expect(swift, contains('forOpeningContentTypes'));
      expect(swift, contains('asCopy: false'));
      expect(swift, isNot(contains('asCopy: true')));
      expect(swift, contains('allowsMultipleSelection = false'));
      expect(swift, contains('.commaSeparatedText'));
      // The safe text fallback: CSV exports are routinely typed as plain text.
      expect(swift, contains('.plainText'));
    });

    test('iOS balances the security scope exactly once each way', () {
      expect(
        RegExp('startAccessingSecurityScopedResource').allMatches(swift).length,
        1,
      );
      expect(
        RegExp('stopAccessingSecurityScopedResource').allMatches(swift).length,
        1,
      );
      // Released by `defer`, so a throw or an early return cannot leak it.
      expect(swift, contains('defer {'));
    });

    test('iOS keeps nothing that could re-open the file later', () {
      for (final String token in <String>[
        'bookmarkData',
        'securityScopedBookmark',
        'UTType.folder',
        'forOpeningContentTypes: [.folder]',
        'lastPathComponent',
        'UIDocumentPickerMode',
        'copyItem',
        'FileManager.default.copyItem',
      ]) {
        expect(
          swift,
          isNot(contains(token)),
          reason: '$token outlives the one read this port is allowed',
        );
      }
    });

    test('no file under android/ names a storage or media permission', () {
      // The manifest is asserted elsewhere against a REAL BUILD's merged
      // permission set. This is the source-level counterpart, and it covers the
      // Gradle files and any resource a future change might reach for.
      const List<String> forbidden = <String>[
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'MANAGE_EXTERNAL_STORAGE',
        'READ_MEDIA_IMAGES',
        'READ_MEDIA_VIDEO',
        'READ_MEDIA_AUDIO',
        'READ_MEDIA_VISUAL_USER_SELECTED',
      ];
      final offenders = <String>[];
      for (final SourceFile file in readSourceFiles(<String>['android'])) {
        final String body = isCodeLikePath(file.relativePath)
            ? stripCodeComments(file.contents)
            : stripXmlComments(file.contents);
        for (final String token in forbidden) {
          if (body.contains(token)) {
            offenders.add('${file.relativePath}: $token');
          }
        }
      }
      expect(offenders, isEmpty, reason: 'found: $offenders');
    });
  });
}

/// Wraps the real channel so a test can see the [PlatformException] that
/// crossed it, which the adapter deliberately swallows into a typed outcome.
final class _RecordingChannel implements DocumentPickerChannel {
  const _RecordingChannel(this._inner, {required this.onError});

  final DocumentPickerChannel _inner;
  final void Function(PlatformException error) onError;

  @override
  Future<Object?> pickCsvSource({required int maxBytes}) async {
    try {
      return await _inner.pickCsvSource(maxBytes: maxBytes);
    } on PlatformException catch (error) {
      onError(error);
      rethrow;
    }
  }
}
