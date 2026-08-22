// THE PICKER PORT — A NARROW ONE, ON PURPOSE.
//
// The whole of the interface's dependency on "choosing a file" is the one
// method below. It takes nothing, it returns bytes and a declared media type,
// and it names no plugin, no platform channel, no intent, no UTI and no path.
// A screen tests against a fake that returns bytes; nothing above this line
// knows or cares how a document reached it.
//
// ## What the adapter behind this port is REQUIRED to do
//
// These are not implementation notes, they are the port's contract, and an
// adapter that breaks one of them is wrong even if it compiles:
//
//   * ASK FOR ONE DOCUMENT, NOT FOR STORAGE. The mechanism must be the
//     system document picker — `ACTION_OPEN_DOCUMENT` on Android,
//     `UIDocumentPickerViewController` on iOS — which grants access to the
//     single file the person chose and to nothing else. It must NOT request
//     READ_EXTERNAL_STORAGE, READ_MEDIA_*, MANAGE_EXTERNAL_STORAGE, or a
//     photo-library entitlement. A permission that buys access to everything
//     in order to read one file is the wrong trade, and this product's merged
//     manifest is asserted against an exact allow-list
//     (`test/security/platform_hardening_test.dart`) precisely so that trade
//     cannot be made quietly.
//   * COPY THE FILE NOWHERE. The bytes are read into memory, handed to the
//     upload, and dropped. No cache directory, no application-support copy, no
//     temporary file that outlives the import.
//   * CARRY NO FILENAME. There is no `name` field on [PickedStatementSource]
//     and there must not be one. `modules/statement-imports` stores no filename
//     anywhere and the contract has no field for one, so a filename could only
//     ever be logged or displayed — and a bank's export is routinely named
//     after the account it belongs to.
//   * DECODE NOTHING. The port deals in bytes. Interpreting them is the
//     platform's job, and a client that decoded-and-re-encoded would hand the
//     platform a file its owner never wrote.
//
// ## What is behind this port, stated plainly
//
// Android and iOS are served by a FIRST-PARTY PLATFORM CHANNEL over the system
// document picker (`data/platform_statement_source_picker.dart`, with the
// native halves under `android/` and `ios/`). That mechanism was chosen because
// it is the only one that satisfies the requirements above: a file-picker
// dependency would contribute manifest entries, and the merged-manifest
// allow-list test names the exact permission set of a real build, whereas the
// system document picker needs no manifest permission and no entitlement at
// all.
//
// DEVICE EXECUTION IS NOT VERIFIED. What is verified is the Dart mapping from
// every channel answer onto the outcomes below, the channel contract itself
// against the framework's mock messenger, and — at the source level — that both
// native halves speak the same names. Behaviour against a real document
// provider has not been exercised in this repository, and no comment or test
// name here may imply otherwise.
//
// Every other host — the machine the test suite runs on included — gets
// [UnavailableStatementSourcePicker], which answers [PickerOutcomeUnavailable]
// honestly. There the interface says the device cannot offer a file; it does
// not pretend to try and it does not fail as though something broke.
import 'dart:typed_data';

import 'package:meta/meta.dart';

/// A document the person chose.
///
/// Bytes and a declared media type. **No filename, and no path** — see the
/// header for why neither may be added.
@immutable
final class PickedStatementSource {
  const PickedStatementSource({required this.bytes, required this.declaredMediaType});

  final Uint8List bytes;

  /// What the document provider said the file is. Advisory: the platform
  /// decides for itself by inspecting content.
  final String declaredMediaType;

  @override
  String toString() => 'PickedStatementSource()';
}

/// What asking for a document produced.
@immutable
sealed class PickerOutcome {
  const PickerOutcome();
}

/// The person chose a document and it was read.
@immutable
final class PickerOutcomeChosen extends PickerOutcome {
  const PickerOutcomeChosen(this.source);

  final PickedStatementSource source;
}

/// The person dismissed the picker. Not an error, and never presented as one.
@immutable
final class PickerOutcomeCancelled extends PickerOutcome {
  const PickerOutcomeCancelled();
}

/// This host cannot ask the device for a document.
///
/// A distinct outcome rather than a failure, because it is a fact about where
/// the application is running rather than something that went wrong: the
/// surface says so plainly instead of showing a retry that cannot succeed.
///
/// Reached on any host with no document-picker adapter registered, and on
/// Android or iOS where the system could present no document provider at all.
@immutable
final class PickerOutcomeUnavailable extends PickerOutcome {
  const PickerOutcomeUnavailable();
}

/// The device could not read the document the person chose.
///
/// Carries no path, no filename and no platform message: a platform error
/// string routinely contains the full file path, and a path contains a name.
@immutable
final class PickerOutcomeUnreadable extends PickerOutcome {
  const PickerOutcomeUnreadable();
}

/// Asks the person for one document.
abstract interface class StatementSourcePicker {
  /// Presents the system document picker and reads the chosen file.
  ///
  /// Implementations must satisfy every requirement in this file's header.
  Future<PickerOutcome> pickStatementSource();
}
