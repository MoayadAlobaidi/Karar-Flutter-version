// THE SEQUENCE, DRIVEN THROUGH THE PORTS.
//
// The picker is a fake and the repository is a script, so every step above the
// picker port runs for real. That is the point of the port: this build ships no
// document-picker adapter, and the flow it feeds is nonetheless exercised end
// to end rather than left untested until one arrives.
//
// The properties under test are the ones a person would be harmed by:
//
//   * a file past the bound is refused WITHOUT an upload being attempted;
//   * the bytes the picker produced are the bytes the repository is handed —
//     not a copy, not a re-encoding;
//   * a duplicate upload lands on the refusal step rather than the mapping
//     step, so nobody maps columns for a file that will not be imported;
//   * a commit carries the version from the last WRITE, never a guess.
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:karar_mobile/core/errors/result.dart';
import 'package:karar_mobile/features/statement_imports/domain/column_mapping.dart';
import 'package:karar_mobile/features/statement_imports/domain/import_lifecycle.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_import.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_source.dart';
import 'package:karar_mobile/features/statement_imports/domain/statement_source_picker.dart';
import 'package:karar_mobile/features/statement_imports/presentation/statement_imports_providers.dart';

import 'support/statement_import_harness.dart';

const String csvFixture = 'Date,Description,Amount\n2026-04-03,Coffee,-12.50\n';

StatementColumnMapping mappingFixture() => const StatementColumnMapping(
      bookingDateColumn: 0,
      descriptionColumn: 1,
      amount: SignedAmountMapping(
        amountColumn: 2,
        signFrame: AmountSignFrame.accountHolder,
      ),
      hasHeaderRow: true,
      statedCurrencyCode: 'QAR',
    );

({
  ProviderContainer container,
  ScriptedStatementImportsRepository repository,
  FakeStatementSourcePicker picker,
}) flowFor({
  List<int>? bytes,
  PickerOutcome? outcome,
  ScriptedStatementImportsRepository? repository,
}) {
  final scripted = repository ?? ScriptedStatementImportsRepository();
  final picker = outcome != null
      ? FakeStatementSourcePicker(outcome)
      : FakeStatementSourcePicker.returning(bytes ?? utf8.encode(csvFixture));
  final container = ProviderContainer(
    overrides: statementImportOverrides(repository: scripted, picker: picker),
  );
  addTearDown(container.dispose);
  return (container: container, repository: scripted, picker: picker);
}

StatementImportFlowController controllerOf(ProviderContainer container) =>
    container.read(statementImportFlowProvider.notifier);

StatementImportFlowState stateOf(ProviderContainer container) =>
    container.read(statementImportFlowProvider);

void main() {
  group('choosing a source', () {
    test('the shipped picker reports itself unavailable rather than throwing', () async {
      // The seam is honest: a person is told the build cannot offer a file
      // picker, and is not shown a crash or a retry that cannot succeed.
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final outcome =
          await container.read(statementSourcePickerProvider).pickStatementSource();

      expect(outcome, isA<PickerOutcomeUnavailable>());
    });

    test('an unavailable picker leaves the flow on its own honest state', () async {
      final flow = flowFor(outcome: const PickerOutcomeUnavailable());
      await controllerOf(flow.container).chooseSource();
      expect(stateOf(flow.container), isA<ImportFlowPickerUnavailable>());
    });

    test('a cancelled picker is not reported as an error', () async {
      // Somebody changing their mind is not an event to narrate back at them.
      final flow = flowFor(outcome: const PickerOutcomeCancelled());
      await controllerOf(flow.container).chooseSource();
      expect(stateOf(flow.container), isA<ImportFlowIdle>());
    });

    test('an unreadable document says so without naming a path', () async {
      final flow = flowFor(outcome: const PickerOutcomeUnreadable());
      await controllerOf(flow.container).chooseSource();
      expect(stateOf(flow.container), isA<ImportFlowPickerUnreadable>());
    });

    test('a readable CSV becomes a sample the mapping step can draw', () async {
      final flow = flowFor();
      await controllerOf(flow.container).chooseSource();

      final state = stateOf(flow.container);
      expect(state, isA<ImportFlowSourceReady>());
      expect((state as ImportFlowSourceReady).sample.columnCount, 3);
      expect(state.sample.rows.length, 2);
    });

    test('a file past the bound is refused and NO upload is attempted', () async {
      final flow = flowFor(bytes: List<int>.filled(maxSourceBytes + 1, 0x61));

      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);

      final state = stateOf(flow.container);
      expect(state, isA<ImportFlowSourceRefused>());
      expect((state as ImportFlowSourceRefused).source, SourceProblem.tooLarge);
      expect(
        flow.repository.calls,
        isEmpty,
        reason: 'a file the client already knows is too large must not be sent',
      );
    });

    test('a badly encoded file is refused and NO upload is attempted', () async {
      final flow = flowFor(bytes: <int>[0x61, 0xC3, 0x28]);

      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);

      expect(stateOf(flow.container), isA<ImportFlowSourceRefused>());
      expect(flow.repository.calls, isEmpty);
    });
  });

  group('uploading', () {
    test('the repository is handed exactly the bytes the picker produced', () async {
      final bytes = utf8.encode(csvFixture);
      final flow = flowFor(bytes: bytes);

      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);

      expect(
        flow.repository.uploadedBytes,
        isNotNull,
        reason: 'the upload must actually have been issued',
      );
      expect(
        flow.repository.uploadedBytes!.toList(),
        Uint8List.fromList(bytes).toList(),
        reason: 'nothing between the picker and the repository may re-encode, '
            'trim or normalise the file',
      );
    });

    test('a stored source moves the person to the mapping step', () async {
      final flow = flowFor();
      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);

      expect(stateOf(flow.container), isA<ImportFlowMapping>());
      expect(flow.repository.calls, <String>['start', 'upload']);
    });

    test('an already-imported file lands on the refusal, not the mapping', () async {
      // Mapping columns for a file that will never be imported wastes a
      // person time and teaches them the refusal came too late.
      final repository = ScriptedStatementImportsRepository(
        uploadResult: Success<StatementImportSnapshot>(
          snapshotFixture(
            state: ImportLifecycleState.duplicate,
            refusal: ImportRefusal.sourceAlreadyImported,
          ),
        ),
      );
      final flow = flowFor(repository: repository);

      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);

      final state = stateOf(flow.container);
      expect(state, isA<ImportFlowRefused>());
      expect(
        (state as ImportFlowRefused).snapshot.refusal,
        ImportRefusal.sourceAlreadyImported,
      );
    });

    test('a failed start does not go on to upload the file', () async {
      final repository = ScriptedStatementImportsRepository(
        startResult: const Failed<StatementImportSnapshot>(syntheticFailure),
      );
      final flow = flowFor(repository: repository);

      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);

      expect(stateOf(flow.container), isA<ImportFlowFailed>());
      expect(flow.repository.calls, <String>['start']);
    });
  });

  group('parsing', () {
    Future<({ProviderContainer container, ScriptedStatementImportsRepository repository})>
        uploaded({ScriptedStatementImportsRepository? repository}) async {
      final flow = flowFor(repository: repository);
      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);
      return (container: flow.container, repository: flow.repository);
    }

    test('the stated mapping reaches the repository unchanged', () async {
      final flow = await uploaded();
      await controllerOf(flow.container).parse(mapping: mappingFixture());

      final sent = flow.repository.parsedMapping;
      expect(sent, isNotNull);
      expect(sent!.bookingDateColumn, 0);
      expect((sent.amount as SignedAmountMapping).signFrame,
          AmountSignFrame.accountHolder);
      expect(sent.dateOrder, isNull, reason: 'an unstated order stays unstated');
    });

    test('a stated balance is carried, and its absence is carried too', () async {
      final flow = await uploaded();
      await controllerOf(flow.container).parse(mapping: mappingFixture());
      expect(flow.repository.parsedBalance, isNull);

      final second = await uploaded();
      await controllerOf(second.container).parse(
        mapping: mappingFixture(),
        statedBalance: const StatedStatementBalance(
          minorUnits: '125000',
          kind: StatementBalanceKind.closing,
          currencyCode: 'QAR',
        ),
      );
      expect(second.repository.parsedBalance?.minorUnits, '125000');
    });

    test('a parse that refuses lands on the refusal step', () async {
      final flow = await uploaded(
        repository: ScriptedStatementImportsRepository(
          parseResult: Success<StatementImportSnapshot>(
            snapshotFixture(
              state: ImportLifecycleState.failed,
              refusal: ImportRefusal.multipleAccountsInSource,
            ),
          ),
        ),
      );
      await controllerOf(flow.container).parse(mapping: mappingFixture());

      final state = stateOf(flow.container);
      expect(state, isA<ImportFlowRefused>());
      expect(
        (state as ImportFlowRefused).snapshot.refusal,
        ImportRefusal.multipleAccountsInSource,
      );
    });

    test('a successful parse waits for a decision rather than committing', () async {
      final flow = await uploaded();
      await controllerOf(flow.container).parse(mapping: mappingFixture());

      expect(stateOf(flow.container), isA<ImportFlowAwaitingReview>());
      expect(
        flow.repository.calls,
        isNot(contains('commit')),
        reason: 'nothing financial is written until a person says so',
      );
    });
  });

  group('deciding', () {
    Future<({ProviderContainer container, ScriptedStatementImportsRepository repository})>
        reviewable() async {
      final repository = ScriptedStatementImportsRepository(
        uploadResult: Success<StatementImportSnapshot>(
          snapshotFixture(state: ImportLifecycleState.sourceStored, version: 6),
        ),
        parseResult: Success<StatementImportSnapshot>(
          snapshotFixture(state: ImportLifecycleState.reviewRequired, version: 7),
        ),
      );
      final flow = flowFor(repository: repository);
      await controllerOf(flow.container).chooseSource();
      await controllerOf(flow.container).upload(accountId: accountFixtureId);
      await controllerOf(flow.container).parse(mapping: mappingFixture());
      return (container: flow.container, repository: flow.repository);
    }

    test('the commit carries the version from the last write', () async {
      // A blind commit could apply a decision taken against a different parse.
      final flow = await reviewable();
      await controllerOf(flow.container).commit();

      expect(flow.repository.committedVersion, 7);
      expect(stateOf(flow.container), isA<ImportFlowCommitted>());
    });

    test('an idempotent retry is reported as a success', () async {
      final flow = await reviewable();
      flow.repository.commitResult = Success<ImportCommitReceipt>(
        const ImportCommitReceipt(
          importId: importFixtureId,
          committedTransactionCount: 4,
          alreadyCommitted: true,
          transactionIds: <String>[],
        ),
      );
      await controllerOf(flow.container).commit();

      final state = stateOf(flow.container);
      expect(state, isA<ImportFlowCommitted>());
      expect((state as ImportFlowCommitted).receipt.alreadyCommitted, isTrue);
    });

    test('discarding erases the staged statement', () async {
      final flow = await reviewable();
      await controllerOf(flow.container).discard();

      expect(flow.repository.calls, contains('erase'));
      expect(stateOf(flow.container), isA<ImportFlowDiscarded>());
    });

    test('a reset leaves nothing behind to commit', () async {
      final flow = await reviewable();
      controllerOf(flow.container).reset();

      expect(stateOf(flow.container), isA<ImportFlowIdle>());
      expect(controllerOf(flow.container).importId, isNull);

      // A commit after a reset must issue nothing at all.
      final before = flow.repository.calls.length;
      await controllerOf(flow.container).commit();
      expect(flow.repository.calls.length, before);
    });
  });
}
