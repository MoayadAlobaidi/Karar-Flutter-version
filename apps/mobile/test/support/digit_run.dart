// WHAT "A RUN OF DIGITS THAT COULD BE AN ACCOUNT NUMBER" ACTUALLY MEANS.
//
// Two screens assert that nothing longer than a masked tail reaches the
// display. Both did it by stripping EVERY non-digit character out of a rendered
// string and measuring what was left:
//
//   rendered.replaceAll(RegExp('[^0-9]'), '').length < 9
//
// That treats digits scattered through a sentence as one number. It is wrong in
// the direction that matters least for security and most for trust: it fires on
// ordinary text. `"True as of Mar 1, 2026 12:00 PM"` reduces to `1202612 00` —
// nine digits — and the assertion reports that a freshness timestamp "could be
// an account or card number".
//
// IT WAS FOUND BY CI, AND ONLY BY CI. The assertion passed on macOS and failed
// on Linux, because the two platforms' ICU data render the same instant with
// different date patterns and therefore a different digit count. Phase 5 ran 116
// commits without a pull request, so the `mobile` lane never executed on any
// Phase 5 head; the first run of it, on the draft pull request opened for that
// reason, reported all three cases in under four minutes.
//
// WHAT THE RULE SHOULD BE. A card or account number is a CONTIGUOUS run of
// digits, optionally grouped by a single space or hyphen — `4111111111111111`,
// `4111 1111 1111 1111`, `4111-1111-1111-1111`. A comma, a colon, a slash or a
// letter ends the run, because no rendering of an account number contains one.
// That keeps every real detection and drops the false ones.

/// The longest contiguous digit run in [text], counting digits only.
///
/// Groups separated by a SINGLE space or hyphen continue the run, because that
/// is how a card number is written on a card. Anything else ends it.
int longestDigitRun(String text) {
  var best = 0;
  var current = 0;
  var index = 0;
  while (index < text.length) {
    final int code = text.codeUnitAt(index);
    final bool isDigit = code >= 0x30 && code <= 0x39;
    if (isDigit) {
      current += 1;
      best = current > best ? current : best;
      index += 1;
      continue;
    }
    final bool isGroupSeparator = code == 0x20 || code == 0x2D; // space, hyphen
    final bool continuesRun =
        isGroupSeparator &&
        current > 0 &&
        index + 1 < text.length &&
        text.codeUnitAt(index + 1) >= 0x30 &&
        text.codeUnitAt(index + 1) <= 0x39;
    if (!continuesRun) {
      current = 0;
    }
    index += 1;
  }
  return best;
}
