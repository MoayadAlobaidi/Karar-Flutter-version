// THE PICKER SEAM, LEFT HONESTLY EMPTY.
//
// This build ships no document-picker adapter. The reason is recorded in full
// in `domain/statement_source_picker.dart`; in short, every available way to
// implement it required something that is not this feature's to change:
//
//   * a third-party plugin means a new direct dependency in `pubspec.yaml`,
//     whose header requires an exact, reviewed pin, and which is not a file
//     this work owns;
//   * every such plugin contributes manifest entries, and
//     `test/security/platform_hardening_test.dart` asserts the merged manifest
//     declares EXACTLY `INTERNET`, `USE_BIOMETRIC`, `USE_FINGERPRINT` and one
//     androidx signature-level permission. Adding a storage or media permission
//     to read one file the person chose is the wrong trade, and that test
//     exists so the trade cannot be made quietly;
//   * a first-party platform channel over `ACTION_OPEN_DOCUMENT` and
//     `UIDocumentPickerViewController` is the right answer and needs NO
//     manifest permission at all — the system picker grants access to the one
//     chosen document. It is also native code in two languages, and a
//     half-written one would be worse than a stated seam.
//
// So this class answers [PickerOutcomeUnavailable] — a distinct outcome, not a
// failure. The surface above it says the device cannot offer a file in this
// build, and offers no retry, because a retry cannot succeed. Nothing here
// throws: an `UnimplementedError` reaching a screen would be a crash presented
// to a person as though something had broken, when in fact nothing did.
//
// EVERYTHING ELSE IN THE FLOW IS REAL. The upload, the mapping, the parse, the
// review and the commit are implemented and tested against the platform's
// contract; a fake picker in the tests supplies bytes, and the real one is the
// only piece missing. When the platform channel lands, it replaces this class
// and nothing above the port changes.
import '../domain/statement_source_picker.dart';

/// A [StatementSourcePicker] that reports, truthfully, that this build cannot
/// ask the device for a document.
final class UnavailableStatementSourcePicker implements StatementSourcePicker {
  const UnavailableStatementSourcePicker();

  @override
  Future<PickerOutcome> pickStatementSource() async =>
      const PickerOutcomeUnavailable();
}
