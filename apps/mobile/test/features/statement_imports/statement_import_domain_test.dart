// THE RULES THAT DECIDE WHETHER A FILE CAN BE READ AT ALL.
//
// Each group mirrors a rule the platform enforces, and asserts that the client
// reaches the SAME answer — so a person is told on the mapping screen rather
// than after an upload and a parse. Where the two could drift, the test states
// the platform number independently rather than importing the constant it is
// checking, which is the only way a drifting bound fails rather than agreeing
// with itself.
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/features/statement_imports/data/csv_sample_reader.dart';
import 'package:karar_mobile/features/statement_imports/domain/column_mapping.dart';
import 'package:karar_mobile/features/statement_imports/domain/import_lifecycle.dart';
import 'package:karar_mobile/features/statement_imports/domain/row_issue.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_sample.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_source.dart';

import 'support/statement_import_harness.dart';

/// A mapping that is valid, so each test can break exactly one thing.
StatementColumnMapping validMapping() => const StatementColumnMapping(
      bookingDateColumn: 0,
      descriptionColumn: 1,
      amount: SignedAmountMapping(
        amountColumn: 2,
        signFrame: AmountSignFrame.accountHolder,
      ),
      hasHeaderRow: true,
      statedCurrencyCode: 'QAR',
    );

void main() {
  group('the byte bound is the platform bound', () {
    test('it is 10 MiB, stated here independently of the constant', () {
      // `INGESTION_LIMIT_POLICIES.csvStatementImport.maxBytes` is
      // `10 * 1024 * 1024`. Written out rather than imported, so a client that
      // drifted from the platform fails here instead of agreeing with itself.
      expect(maxSourceBytes, 10485760);
    });

    test('a file one byte past the bound is refused before any upload', () {
      final source = SelectedStatementSource(
        bytes: Uint8List(maxSourceBytes + 1),
        declaredMediaType: 'text/csv',
      );
      expect(source.problem, SourceProblem.tooLarge);
    });

    test('a file exactly at the bound is accepted', () {
      final source = SelectedStatementSource(
        bytes: Uint8List(maxSourceBytes),
        declaredMediaType: 'text/csv',
      );
      expect(source.problem, isNull);
    });

    test('an empty file is refused as empty rather than as too large', () {
      final source = SelectedStatementSource(
        bytes: Uint8List(0),
        declaredMediaType: 'text/csv',
      );
      expect(source.problem, SourceProblem.empty);
    });

    test('a chosen source carries no filename anywhere', () {
      // The platform stores none and the contract has no field for one, so a
      // filename could only ever be logged or displayed — and a bank export is
      // routinely named after the account it belongs to.
      final source = SelectedStatementSource(
        bytes: Uint8List.fromList(<int>[1]),
        declaredMediaType: 'text/csv',
      );
      expect(source.toString(), 'SelectedStatementSource()');
    });
  });

  group('a mapping is checked before the file is read', () {
    test('a valid mapping has no violations', () {
      expect(checkMapping(validMapping(), columnCount: 4), isEmpty);
    });

    test('no currency column and no stated currency is refused', () {
      // The currency of the account is NOT an answer: a USD statement imported
      // into a QAR account would carry a currency nobody chose on every row.
      final mapping = validMapping().copyWith(statedCurrencyCode: () => null);
      expect(
        checkMapping(mapping, columnCount: 4),
        contains(MappingViolation.currencyNotDetermined),
      );
    });

    test('a currency column AND a stated currency is refused', () {
      final mapping = validMapping().copyWith(currencyColumn: () => 3);
      expect(
        checkMapping(mapping, columnCount: 4),
        contains(MappingViolation.currencyDoublyDetermined),
      );
    });

    test('one column mapped to two fields is refused', () {
      final mapping = validMapping().copyWith(merchantColumn: () => 1);
      expect(
        checkMapping(mapping, columnCount: 4),
        contains(MappingViolation.columnUsedTwice),
      );
    });

    test('a column past the end of the file is refused', () {
      final mapping = validMapping().copyWith(merchantColumn: () => 9);
      expect(
        checkMapping(mapping, columnCount: 4),
        contains(MappingViolation.columnIndexInvalid),
      );
    });

    test('a balance column with no stated kind is refused', () {
      final mapping = validMapping().copyWith(sourceBalanceColumn: () => 3);
      expect(
        checkMapping(mapping, columnCount: 4),
        contains(MappingViolation.balanceKindNotStated),
      );
    });

    test('a balance column WITH a stated kind is accepted', () {
      final mapping = validMapping().copyWith(
        sourceBalanceColumn: () => 3,
        sourceBalanceKind: () => SourceBalanceKind.running,
      );
      expect(checkMapping(mapping, columnCount: 4), isEmpty);
    });

    test('a timezone column with no instant column is refused', () {
      final mapping = validMapping().copyWith(sourceTimezoneColumn: () => 3);
      expect(
        checkMapping(mapping, columnCount: 4),
        contains(MappingViolation.timezoneWithoutInstant),
      );
    });

    test('a debit and credit pair maps both columns', () {
      const mapping = StatementColumnMapping(
        bookingDateColumn: 0,
        descriptionColumn: 1,
        amount: DebitCreditAmountMapping(debitColumn: 2, creditColumn: 3),
        hasHeaderRow: true,
        statedCurrencyCode: 'QAR',
      );
      expect(mapping.declaredColumns, containsAll(<int>[2, 3]));
      expect(checkMapping(mapping, columnCount: 4), isEmpty);
    });

    test('the same column used for debit and credit is refused', () {
      const mapping = StatementColumnMapping(
        bookingDateColumn: 0,
        descriptionColumn: 1,
        amount: DebitCreditAmountMapping(debitColumn: 2, creditColumn: 2),
        hasHeaderRow: true,
        statedCurrencyCode: 'QAR',
      );
      expect(
        checkMapping(mapping, columnCount: 4),
        contains(MappingViolation.columnUsedTwice),
      );
    });

    test('an unknown column count still checks everything else', () {
      // Only the past-the-end half of the index rule needs the count.
      final mapping = validMapping().copyWith(merchantColumn: () => 900);
      expect(checkMapping(mapping), isEmpty);
    });
  });

  group('a refused row points at the right remedy', () {
    test('an unstated convention sends the person back to the mapping', () {
      for (final reason in <RowIssueReason>[
        RowIssueReason.ambiguousDateOrder,
        RowIssueReason.ambiguousDecimalSeparator,
        RowIssueReason.ambiguousDirection,
      ]) {
        expect(
          reason.remedy,
          RowIssueRemedy.stateAConvention,
          reason: '$reason is fixed by stating a convention, never by editing the file',
        );
      }
    });

    test('an unreadable value sends the person back to their bank', () {
      expect(
        RowIssueReason.unreadableDate.remedy,
        RowIssueRemedy.correctTheFile,
      );
      expect(
        RowIssueReason.decimalPlacesExceedCurrency.remedy,
        RowIssueRemedy.correctTheFile,
      );
    });

    test('a bound is named as a bound', () {
      expect(RowIssueReason.fieldTooLarge.remedy, RowIssueRemedy.respectABound);
      expect(RowIssueReason.tooManyColumns.remedy, RowIssueRemedy.respectABound);
    });

    test('an unknown reason claims no remedy it does not have', () {
      expect(RowIssueReason.unrecognised.remedy, RowIssueRemedy.unknown);
    });

    test('a row issue carries no value from the file', () {
      const issue = RowIssue(
        rowNumber: 14,
        field: StatementField.amount,
        reason: RowIssueReason.unreadableAmount,
      );
      expect(issue.toString(), contains('14'));
      expect(issue.toString(), isNot(contains('1.234')));
    });
  });

  group('a commit is offered only when it could succeed', () {
    test('a reconciliation mismatch withholds the commit', () {
      final snapshot = snapshotFixture(
        state: ImportLifecycleState.reviewRequired,
        reconciliation: ReconciliationOutcome.mismatched,
      );
      expect(
        snapshot.canCommit,
        isFalse,
        reason: 'the platform refuses this commit; offering it teaches people '
            'that refusals are noise',
      );
    });

    test('no version withholds the commit', () {
      // The contract does not carry `version` on a read, so an import reached
      // by identifier cannot be committed blind.
      final snapshot = snapshotFixture(
        state: ImportLifecycleState.reviewRequired,
        version: null,
      );
      expect(snapshot.canCommit, isFalse);
    });

    test('a reviewable import with a version can be committed', () {
      final snapshot = snapshotFixture(state: ImportLifecycleState.reviewRequired);
      expect(snapshot.canCommit, isTrue);
    });

    test('an import not awaiting a decision cannot be committed', () {
      final snapshot = snapshotFixture(
        state: ImportLifecycleState.reviewRequired,
        awaitsDecision: false,
      );
      expect(snapshot.canCommit, isFalse);
    });

    test('an unrecognised state is not assumed settled', () {
      // Assuming it were would offer the erase action on an import that might
      // be mid-commit.
      expect(ImportLifecycleState.unrecognised.isSettled, isFalse);
    });
  });

  group('the local sample reader', () {
    StatementSample readOrFail(String csv) {
      final reading = readStatementSample(Uint8List.fromList(utf8.encode(csv)));
      expect(reading.problem, isNull, reason: 'expected $csv to be readable');
      return reading.sample!;
    }

    test('splits plain rows and counts the widest', () {
      final sample = readOrFail('a,b,c\n1,2,3\n');
      expect(sample.rows.length, 2);
      expect(sample.columnCount, 3);
      expect(sample.rows.first.cells.map((UntrustedCell c) => c.exactText),
          <String>['a', 'b', 'c']);
    });

    test('a quoted field keeps its commas and newlines', () {
      final sample = readOrFail('"Doe, John","line\nbreak"\n');
      expect(sample.rows.first.cellAt(0)!.exactText, 'Doe, John');
      expect(sample.rows.first.cellAt(1)!.exactText, 'line\nbreak');
    });

    test('a doubled quote becomes one literal quote', () {
      final sample = readOrFail('"say ""hi"""\n');
      expect(sample.rows.first.cellAt(0)!.exactText, 'say "hi"');
    });

    test('CRLF line endings do not leave a carriage return in the last field', () {
      final sample = readOrFail('a,b\r\n1,2\r\n');
      expect(sample.rows.first.cellAt(1)!.exactText, 'b');
    });

    test('an unterminated quote is refused rather than split anyway', () {
      // Splitting it would silently merge fields and mis-number every column
      // after it, which is how a person maps "column 4" onto a column that is
      // not there.
      final reading = readStatementSample(Uint8List.fromList(utf8.encode('"open,1\n')));
      expect(reading.sample, isNull);
      expect(reading.problem, SampleProblem.malformedQuoting);
    });

    test('malformed UTF-8 is refused rather than repaired', () {
      // Replacing the damaged bytes would put U+FFFD inside a merchant name
      // and show it as though the bank had written it. The platform answers
      // INVALID_ENCODING for the same input.
      final reading = readStatementSample(Uint8List.fromList(<int>[0x61, 0xC3, 0x28]));
      expect(reading.sample, isNull);
      expect(reading.problem, SampleProblem.invalidEncoding);
    });

    test('an empty file is refused as empty', () {
      final reading = readStatementSample(Uint8List(0));
      expect(reading.problem, SampleProblem.empty);
    });

    test('the sample stops at the row limit however long the file is', () {
      final csv = List<String>.generate(500, (int i) => 'a$i,b$i').join('\n');
      final sample = readOrFail('$csv\n');
      expect(sample.rows.length, sampleRowLimit);
    });

    test('a line wider than the platform accepts is refused', () {
      final wide = List<String>.filled(maxSampleColumns + 5, 'x').join(',');
      final reading = readStatementSample(Uint8List.fromList(utf8.encode('$wide\n')));
      expect(reading.sample, isNull);
      expect(reading.problem, SampleProblem.tooManyColumns);
    });

    test('a trailing newline does not invent an extra row', () {
      final sample = readOrFail('a,b\n1,2\n');
      expect(sample.rows.length, 2);
    });

    test('adversarial cells survive the reader byte-identical', () {
      // Quoting is how the FORMAT encodes a value; decoding it is not a
      // modification. Everything inside must come back exactly.
      for (final hostile in adversarialCells) {
        final escaped = hostile.replaceAll('"', '""');
        final sample = readOrFail('"$escaped"\n');
        expect(sample.rows.first.cellAt(0)!.exactText, hostile);
      }
    });

    test('a cell is not trimmed', () {
      final sample = readOrFail('  padded  ,x\n');
      expect(sample.rows.first.cellAt(0)!.exactText, '  padded  ');
    });

    test('a short line reports an absent cell rather than an empty one', () {
      // The platform reports "missing" and "blank" with different reason
      // codes, so the client must not collapse them.
      final sample = readOrFail('a,b,c\n1\n');
      expect(sample.rows[1].cellAt(2), isNull);
    });
  });
}
