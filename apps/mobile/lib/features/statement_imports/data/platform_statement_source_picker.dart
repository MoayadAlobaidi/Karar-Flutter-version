// DATA LAYER — the system document picker, over a first-party platform channel.
//
// This file is the ONLY place in the client that talks to the picker channel.
// The domain port it implements is pure Dart and stays that way; the channel's
// vocabulary — method name, argument map, error codes — stops here.
//
// ## Why a channel and not a plugin
//
// The port's header states the requirement: ask for ONE DOCUMENT, not for
// storage. Every off-the-shelf file-picker plugin contributes manifest entries,
// and the merged-manifest allow-list in `test/security/platform_hardening_test.dart`
// names the exact permission set of a real build. The system document picker —
// `ACTION_OPEN_DOCUMENT` on Android, `UIDocumentPickerViewController` on iOS —
// grants access to the single file the person chose and needs NO manifest
// permission and NO entitlement at all, so a first-party channel is the only
// mechanism that satisfies the port without widening what the application may
// reach. The native halves live in
// `android/app/src/main/kotlin/com/kararfinance/app/StatementDocumentPicker.kt`
// and `ios/Runner/StatementDocumentPicker.swift`.
//
// ## DEVICE EXECUTION IS NOT VERIFIED
//
// Stated plainly, in the code, because a comment that implied otherwise would
// be worse than no comment. Nothing in this repository has run this channel on
// a physical device or a simulator. What IS verified here: the Dart mapping
// from every channel answer onto the port's outcomes, and the channel contract
// itself — name, method, argument shape, return shape and error codes — driven
// through the framework's mock messenger, plus a source-level assertion that
// both native halves speak the same names. The native code compiles; it has
// not been exercised against a real document provider.
//
// ## The channel is narrow ON PURPOSE
//
// One method. It takes a byte bound and returns bytes and a media type. There
// is no read-a-path call, no directory call, no write and no delete, and no
// filename crosses it — `PickedStatementSource` has no field for one and
// `modules/statement-imports` stores none, so a filename could only ever be
// logged or displayed, and a bank's export is routinely named after the account
// it belongs to.
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:flutter/services.dart'
    show MethodChannel, MissingPluginException, PlatformException;

import '../domain/statement_source.dart' show maxSourceBytes;
import '../domain/statement_source_picker.dart';
import 'unavailable_statement_source_picker.dart';

/// The channel both native halves listen on.
///
/// A fixed literal, deliberately NOT derived from the application id: Android
/// applies an `applicationIdSuffix` per environment, and a channel name that
/// moved with the environment would be a build-configuration bug that only
/// appears at runtime.
const String documentPickerChannelName = 'com.kararfinance.app/document_picker';

/// The one method on the channel.
const String pickCsvSourceMethod = 'pickCsvSource';

/// The argument carrying the byte bound. See [maxSourceBytes].
const String maxBytesArgument = 'maxBytes';

/// Key of the chosen document's bytes in the answer.
const String bytesResultKey = 'bytes';

/// Key of the media type the document provider declared.
const String mediaTypeResultKey = 'mediaType';

/// No system document picker could be presented on this device.
const String pickerUnavailableCode = 'PICKER_UNAVAILABLE';

/// The person chose a document and the device could not read it.
const String sourceUnreadableCode = 'SOURCE_UNREADABLE';

/// A pick was already in flight when another was asked for.
const String pickerBusyCode = 'PICKER_BUSY';

/// The call did not carry the arguments the channel requires.
const String invalidRequestCode = 'INVALID_REQUEST';

/// What a media type is allowed to look like before it is discarded.
///
/// The declared type is advisory and is never shown to anyone, but it is a
/// string a document provider chose, and this client should not carry an
/// unbounded one around. Anything empty or longer than this is replaced by the
/// unknown-content type rather than trusted.
const int _maxDeclaredMediaTypeLength = 255;

/// What a document of unknown declared type is called.
const String _unknownMediaType = 'application/octet-stream';

/// The picker for the platform this process is running on.
///
/// Android and iOS get the channel-backed adapter. Every other host —
/// including the machine the test suite runs on — gets
/// [UnavailableStatementSourcePicker], because there is no native half
/// registered there and claiming otherwise would be a picker that cannot open.
StatementSourcePicker platformStatementSourcePicker() {
  if (Platform.isAndroid || Platform.isIOS) {
    return PlatformStatementSourcePicker();
  }
  return const UnavailableStatementSourcePicker();
}

/// The single call [PlatformStatementSourcePicker] makes.
///
/// Declared as a seam so the mapping from channel answers onto the port's typed
/// outcomes — the part that decides what a person is told — is exercised by
/// tests on a host with no document provider attached. The production
/// implementation forwards to a [MethodChannel] and does nothing else.
abstract interface class DocumentPickerChannel {
  /// Invokes [pickCsvSourceMethod] with `{[maxBytesArgument]: maxBytes}` and
  /// returns what the platform answered, unchanged.
  ///
  /// A chosen document is a map; a dismissed picker is null; everything else
  /// arrives as a [PlatformException] carrying one of the codes above, or as a
  /// [MissingPluginException] where no native half is registered.
  Future<Object?> pickCsvSource({required int maxBytes});
}

/// The system document picker, over the platform channel.
///
/// DEVICE EXECUTION IS NOT VERIFIED — see the file header.
final class PlatformStatementSourcePicker implements StatementSourcePicker {
  PlatformStatementSourcePicker({DocumentPickerChannel? channel})
      : _channel = channel ?? const MethodChannelDocumentPicker();

  final DocumentPickerChannel _channel;

  @override
  Future<PickerOutcome> pickStatementSource() async {
    final Object? answer;
    try {
      // The bound is the SERVER'S, mirrored: the native half reads at most one
      // byte past it and stops, so a person who chose a 400 MB export waits for
      // 10 MiB rather than for the file — and the extra byte is what makes the
      // length exceed [maxSourceBytes], so the existing `SourceProblem.tooLarge`
      // refusal states the reason instead of a truncated file being uploaded as
      // though it were whole.
      answer = await _channel.pickCsvSource(maxBytes: maxSourceBytes);
    } on MissingPluginException {
      // No native half is registered for this host, so there is no picker this
      // build can raise.
      return const PickerOutcomeUnavailable();
    } on PlatformException catch (error) {
      return _outcomeFor(error.code);
    } on Object {
      // A channel fault, a codec fault, anything the framework raises. None of
      // them produced a document.
      return const PickerOutcomeUnreadable();
    }
    if (answer == null) {
      // The person dismissed the picker. Not an error, and never presented as
      // one.
      return const PickerOutcomeCancelled();
    }
    return _chosenFrom(answer);
  }

  /// Reads the answer without trusting its shape.
  ///
  /// A malformed payload is a programming error on the native side rather than
  /// something a person did, and it is reported as unreadable: the honest
  /// statement is that no document arrived, and the surface offers a retry.
  static PickerOutcome _chosenFrom(Object answer) {
    if (answer is! Map<Object?, Object?>) {
      return const PickerOutcomeUnreadable();
    }
    final Object? bytes = answer[bytesResultKey];
    if (bytes is! Uint8List) {
      return const PickerOutcomeUnreadable();
    }
    return PickerOutcomeChosen(
      PickedStatementSource(
        // BY IDENTITY. Nothing here trims, re-encodes, normalises or repairs
        // what the person's bank wrote (ADR-0029).
        bytes: bytes,
        declaredMediaType: _declaredMediaType(answer[mediaTypeResultKey]),
      ),
    );
  }

  /// The provider's own label for the file, held at arm's length.
  ///
  /// Advisory only: the platform decides for itself whether the content is CSV
  /// by inspecting it, and refuses spreadsheet, archive and binary content on
  /// that basis rather than on this string. Nothing renders it.
  static String _declaredMediaType(Object? declared) {
    if (declared is! String) {
      return _unknownMediaType;
    }
    final String trimmed = declared.trim();
    if (trimmed.isEmpty || trimmed.length > _maxDeclaredMediaTypeLength) {
      return _unknownMediaType;
    }
    return trimmed;
  }

  /// Maps a channel error code onto the port's typed outcomes.
  ///
  /// The default is the one that says least and offers a retry, because a code
  /// this build does not recognise is not evidence about what a person did.
  static PickerOutcome _outcomeFor(String code) => switch (code) {
        // No document provider on the device could be presented at all. A fact
        // about the device rather than something that went wrong, and the
        // surface offers no retry for it.
        pickerUnavailableCode => const PickerOutcomeUnavailable(),
        // A picker is already open. Nothing was chosen for THIS request, and
        // the person is looking at the picker that answers the earlier one, so
        // the honest report is the same as a dismissal: no document, no
        // message.
        pickerBusyCode => const PickerOutcomeCancelled(),
        // `sourceUnreadableCode`, `invalidRequestCode`, and any code added
        // after this build.
        _ => const PickerOutcomeUnreadable(),
      };
}

/// Forwards to the platform channel and does nothing else.
///
/// Public solely so the channel CONTRACT — the name, the method, the argument
/// map — can be asserted against the framework's mock messenger. A private
/// class would leave those four strings verified only by reading them.
final class MethodChannelDocumentPicker implements DocumentPickerChannel {
  const MethodChannelDocumentPicker();

  static const MethodChannel _channel = MethodChannel(documentPickerChannelName);

  @override
  Future<Object?> pickCsvSource({required int maxBytes}) =>
      _channel.invokeMethod<Object?>(
        pickCsvSourceMethod,
        <String, Object?>{maxBytesArgument: maxBytes},
      );
}
