// THE PICKER SEAM WHERE NO SYSTEM PICKER EXISTS.
//
// Android and iOS now have a real adapter: the system document picker over a
// first-party platform channel, in `platform_statement_source_picker.dart`. It
// asks for ONE DOCUMENT — `ACTION_OPEN_DOCUMENT` and
// `UIDocumentPickerViewController` — which grants access to the single file the
// person chose, needs no manifest permission and no entitlement, and therefore
// leaves the merged-manifest allow-list in
// `test/security/platform_hardening_test.dart` unchanged. That was the whole
// argument against a file-picker dependency: every such library contributes
// manifest entries, and a storage or media permission bought to read one chosen
// file is the wrong trade.
//
// THIS CLASS IS STILL REACHED, AND IS STILL THE HONEST ANSWER, on every host
// where no native half is registered — the machine the test suite runs on, and
// any platform this product has not shipped a picker for. `platformStatementSourcePicker()`
// selects it there. It answers [PickerOutcomeUnavailable] — a distinct outcome,
// not a failure — and the surface above it says the device cannot offer a file,
// offering no retry, because a retry cannot succeed.
//
// Nothing here throws: an `UnimplementedError` reaching a screen would be a
// crash presented to a person as though something had broken, when in fact
// nothing did.
import '../domain/statement_source_picker.dart';

/// A [StatementSourcePicker] that reports, truthfully, that this host cannot
/// ask the device for a document.
final class UnavailableStatementSourcePicker implements StatementSourcePicker {
  const UnavailableStatementSourcePicker();

  @override
  Future<PickerOutcome> pickStatementSource() async =>
      const PickerOutcomeUnavailable();
}
