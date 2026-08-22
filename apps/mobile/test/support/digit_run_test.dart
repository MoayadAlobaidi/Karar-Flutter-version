import 'package:flutter_test/flutter_test.dart';

import 'digit_run.dart';

void main() {
  group('longestDigitRun catches what an account number looks like', () {
    test('an unbroken card number', () {
      expect(longestDigitRun('4111111111111111'), 16);
    });

    test('a card number grouped by spaces or hyphens, as a card prints it', () {
      expect(longestDigitRun('4111 1111 1111 1111'), 16);
      expect(longestDigitRun('4111-1111-1111-1111'), 16);
    });

    test('an IBAN-shaped tail inside a sentence', () {
      // 20, not 28: the letters in `QA58 DOHB` end the run, so what is detected
      // is the numeric tail `0000 1234 5678 9012 3456`. That is the part that
      // must never reach a screen, and it is well over the threshold.
      expect(longestDigitRun('Account QA58 DOHB 0000 1234 5678 9012 3456'), 20);
    });
  });

  group('and does NOT fire on ordinary rendered text', () {
    test('THE CASE CI FOUND: a formatted freshness timestamp', () {
      // The old rule stripped every separator and counted nine digits here,
      // reporting a date as a possible card number. It passed on macOS and
      // failed on Linux, because the two render the same instant differently.
      expect(longestDigitRun('True as of Mar 1, 2026 12:00 PM'), lessThan(9));
      expect(longestDigitRun('True as of 01/03/2026 12:00'), lessThan(9));
      expect(longestDigitRun('Last seen 2026-03-01T12:00:00Z'), lessThan(9));
    });

    test('a masked tail, which is the thing that IS allowed on screen', () {
      expect(longestDigitRun('**1234'), 4);
      expect(longestDigitRun('•••• 4417'), 4);
    });

    test('an amount with grouping and a currency code', () {
      expect(longestDigitRun('QAR 12,345.67'), lessThan(9));
      expect(longestDigitRun('1,234,567.89 USD'), lessThan(9));
    });

    test('a run broken by any non-grouping character does not continue', () {
      expect(longestDigitRun('1234:5678'), 4);
      expect(longestDigitRun('1234, 5678'), 4);
      expect(longestDigitRun('1234/5678'), 4);
      // A double separator is not how a number is grouped.
      expect(longestDigitRun('1234  5678'), 4);
    });

    test('a trailing separator does not extend a run', () {
      expect(longestDigitRun('1234 '), 4);
      expect(longestDigitRun('1234-'), 4);
    });
  });
}
