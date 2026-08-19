// PROVIDERS FOR THE STATEMENT-IMPORT SURFACE.
//
// Everything here is TENANT-SCOPED: an import targets an account that belongs
// to one organisation, and it is invalid the moment the session binding
// changes. `statementImportTenantScopedProviders()` lists them so a tenant
// switch discards them.
//
// No widget in this feature performs a request. A screen reads a provider, the
// provider reads a use case, the use case reads the repository, and only the
// repository touches the generated client.
//
// ## The flow controller holds the file, and drops it
//
// The chosen bytes live in `ImportFlowSourceReady`/`ImportFlowMapping` and
// nowhere else — no cache, no disk, no preference store. `_forget()` clears
// them the moment the import is stored, refused or abandoned, so a person who
// finishes an import is not still carrying their bank statement in memory.
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show AsyncNotifierProviderFamily;

import '../../../app/lifecycle/tenant_data_scope.dart';

import '../../../app/dependency_injection/providers.dart';
import '../../../core/errors/failure.dart';
import '../../../core/errors/result.dart';
import '../data/api_statement_imports_repository.dart';
import '../data/csv_sample_reader.dart';
import '../data/unavailable_statement_source_picker.dart';
import '../domain/column_mapping.dart';
import '../domain/import_lifecycle.dart';
import '../domain/statement_import.dart';
import '../domain/statement_imports_repository.dart';
import '../domain/statement_sample.dart';
import '../domain/statement_source.dart';
import '../domain/statement_source_picker.dart';

final Provider<StatementImportsRepository> statementImportsRepositoryProvider =
    Provider<StatementImportsRepository>(
  (Ref ref) => ApiStatementImportsRepository(ref.watch(apiClientProvider)),
);

/// The document picker.
///
/// This build supplies the one that reports itself unavailable; see
/// `data/unavailable_statement_source_picker.dart` for exactly why, and
/// `domain/statement_source_picker.dart` for what a real one must do. A test
/// overrides this with a fake that returns bytes, which is how every step above
/// the port is exercised for real.
final Provider<StatementSourcePicker> statementSourcePickerProvider =
    Provider<StatementSourcePicker>((Ref ref) => const UnavailableStatementSourcePicker());

final Provider<StartStatementImport> startStatementImportProvider =
    Provider<StartStatementImport>(
  (Ref ref) => StartStatementImport(ref.watch(statementImportsRepositoryProvider)),
);

final Provider<UploadStatementSource> uploadStatementSourceProvider =
    Provider<UploadStatementSource>(
  (Ref ref) => UploadStatementSource(ref.watch(statementImportsRepositoryProvider)),
);

final Provider<ParseStatementSource> parseStatementSourceProvider =
    Provider<ParseStatementSource>(
  (Ref ref) => ParseStatementSource(ref.watch(statementImportsRepositoryProvider)),
);

final Provider<ReadStatementImportPreview> readStatementImportPreviewProvider =
    Provider<ReadStatementImportPreview>(
  (Ref ref) => ReadStatementImportPreview(ref.watch(statementImportsRepositoryProvider)),
);

final Provider<CommitStatementImport> commitStatementImportProvider =
    Provider<CommitStatementImport>(
  (Ref ref) => CommitStatementImport(ref.watch(statementImportsRepositoryProvider)),
);

final Provider<EraseStatementImport> eraseStatementImportProvider =
    Provider<EraseStatementImport>(
  (Ref ref) => EraseStatementImport(ref.watch(statementImportsRepositoryProvider)),
);

// ---------------------------------------------------------------------------
// Flow state
// ---------------------------------------------------------------------------

/// Which server-side step is in flight, so the surface can name it rather than
/// showing an unlabelled spinner a screen reader cannot describe.
enum ImportFlowStep { uploading, parsing, committing, discarding }

sealed class StatementImportFlowState {
  const StatementImportFlowState();
}

/// Nothing chosen yet.
final class ImportFlowIdle extends StatementImportFlowState {
  const ImportFlowIdle();
}

/// This build cannot ask the device for a document. A fact about the build, not
/// a failure, and presented as one.
final class ImportFlowPickerUnavailable extends StatementImportFlowState {
  const ImportFlowPickerUnavailable();
}

/// The device could not read the chosen document.
final class ImportFlowPickerUnreadable extends StatementImportFlowState {
  const ImportFlowPickerUnreadable();
}

/// The chosen file cannot be offered to the platform, and this client can say
/// why without a round trip.
final class ImportFlowSourceRefused extends StatementImportFlowState {
  const ImportFlowSourceRefused({this.source, this.sample});

  final SourceProblem? source;
  final SampleProblem? sample;
}

/// A file is chosen and readable; the person can upload it.
final class ImportFlowSourceReady extends StatementImportFlowState {
  const ImportFlowSourceReady({required this.source, required this.sample});

  final SelectedStatementSource source;
  final StatementSample sample;
}

/// The bytes are stored. The mapping step is next.
final class ImportFlowMapping extends StatementImportFlowState {
  const ImportFlowMapping({required this.snapshot, required this.sample});

  final StatementImportSnapshot snapshot;
  final StatementSample sample;
}

/// Something is in flight server-side.
final class ImportFlowWorking extends StatementImportFlowState {
  const ImportFlowWorking(this.step);

  final ImportFlowStep step;
}

/// Parsed and staged. The person decides.
final class ImportFlowAwaitingReview extends StatementImportFlowState {
  const ImportFlowAwaitingReview(this.snapshot);

  final StatementImportSnapshot snapshot;
}

/// The platform refused the import, with a typed code.
final class ImportFlowRefused extends StatementImportFlowState {
  const ImportFlowRefused(this.snapshot);

  final StatementImportSnapshot snapshot;
}

/// The commit wrote the rows.
final class ImportFlowCommitted extends StatementImportFlowState {
  const ImportFlowCommitted(this.receipt);

  final ImportCommitReceipt receipt;
}

/// The staged statement was erased.
final class ImportFlowDiscarded extends StatementImportFlowState {
  const ImportFlowDiscarded();
}

/// A typed transport or platform failure. Distinct from a refusal: a refusal is
/// the platform saying no for a stated reason, this is not reaching an answer.
final class ImportFlowFailed extends StatementImportFlowState {
  const ImportFlowFailed(this.failure);

  final Failure failure;
}

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------

/// Drives the sequence: choose -> upload -> map -> parse -> decide.
final class StatementImportFlowController extends Notifier<StatementImportFlowState> {
  @override
  StatementImportFlowState build() => const ImportFlowIdle();

  /// The bytes of the file being imported, held only while they are needed.
  Uint8List? _bytes;

  /// The import the platform opened for this file.
  String? _importId;

  /// The optimistic-concurrency token from the last WRITE.
  ///
  /// The contract does not carry it on the single-import read, so it is kept
  /// from the upload or the parse response. A commit without one is not
  /// offered, because a blind commit could apply a decision taken against a
  /// different parse.
  int? _version;

  /// The import currently open, for the surface to address. Null before the
  /// upload and after the flow is reset.
  String? get importId => _importId;

  /// Asks the device for a document, then reads enough of it to map columns.
  Future<void> chooseSource() async {
    final outcome = await ref.read(statementSourcePickerProvider).pickStatementSource();
    switch (outcome) {
      case PickerOutcomeUnavailable():
        state = const ImportFlowPickerUnavailable();
      case PickerOutcomeUnreadable():
        state = const ImportFlowPickerUnreadable();
      case PickerOutcomeCancelled():
        // A person changing their mind is not an event to narrate back at
        // them. The surface returns to where it was.
        state = const ImportFlowIdle();
      case PickerOutcomeChosen(:final source):
        _acceptChosen(source);
    }
  }

  void _acceptChosen(PickedStatementSource picked) {
    final selected = SelectedStatementSource(
      bytes: picked.bytes,
      declaredMediaType: picked.declaredMediaType,
    );
    final problem = selected.problem;
    if (problem != null) {
      _forget();
      state = ImportFlowSourceRefused(source: problem);
      return;
    }
    final reading = readStatementSample(selected.bytes);
    final sample = reading.sample;
    if (sample == null) {
      _forget();
      state = ImportFlowSourceRefused(sample: reading.problem);
      return;
    }
    _bytes = selected.bytes;
    state = ImportFlowSourceReady(source: selected, sample: sample);
  }

  /// Opens a draft against [accountId] and sends the bytes.
  Future<void> upload({required String accountId, String? connectionId}) async {
    final current = state;
    if (current is! ImportFlowSourceReady) {
      return;
    }
    final bytes = _bytes;
    if (bytes == null) {
      return;
    }
    final sample = current.sample;
    state = const ImportFlowWorking(ImportFlowStep.uploading);

    final started = await ref.read(startStatementImportProvider)(
      accountId: accountId,
      connectionId: connectionId,
    );
    switch (started) {
      case Failed<StatementImportSnapshot>(:final failure):
        state = ImportFlowFailed(failure);
        return;
      case Success<StatementImportSnapshot>(:final value):
        _importId = value.importId;
        _version = value.version;
    }

    final uploaded = await ref.read(uploadStatementSourceProvider)(
      importId: _importId!,
      bytes: bytes,
    );
    // The bytes have reached the platform, or failed to. Either way this
    // client has no further use for them.
    _bytes = null;
    switch (uploaded) {
      case Failed<StatementImportSnapshot>(:final failure):
        state = ImportFlowFailed(failure);
      case Success<StatementImportSnapshot>(:final value):
        _version = value.version ?? _version;
        state = value.refusal != null || value.state == ImportLifecycleState.duplicate
            ? ImportFlowRefused(value)
            : ImportFlowMapping(snapshot: value, sample: sample);
    }
  }

  /// Parses the stored source under a mapping the person stated.
  Future<void> parse({
    required StatementColumnMapping mapping,
    StatedStatementBalance? statedBalance,
  }) async {
    final current = state;
    final importId = _importId;
    if (current is! ImportFlowMapping || importId == null) {
      return;
    }
    final sample = current.sample;
    state = const ImportFlowWorking(ImportFlowStep.parsing);

    final parsed = await ref.read(parseStatementSourceProvider)(
      importId: importId,
      mapping: mapping,
      statedBalance: statedBalance,
    );
    switch (parsed) {
      case Failed<StatementImportSnapshot>(:final failure):
        // The mapping step is where the person can act, so a failed parse
        // returns them to it rather than stranding them.
        state = ImportFlowMapping(snapshot: current.snapshot, sample: sample);
        state = ImportFlowFailed(failure);
      case Success<StatementImportSnapshot>(:final value):
        _version = value.version ?? _version;
        state = value.refusal != null
            ? ImportFlowRefused(value)
            : ImportFlowAwaitingReview(value);
    }
  }

  /// Writes the reviewed rows as transactions.
  Future<void> commit() async {
    final current = state;
    final importId = _importId;
    final version = _version;
    if (current is! ImportFlowAwaitingReview || importId == null || version == null) {
      return;
    }
    state = const ImportFlowWorking(ImportFlowStep.committing);
    final committed = await ref.read(commitStatementImportProvider)(
      importId: importId,
      expectedVersion: version,
    );
    state = switch (committed) {
      Failed<ImportCommitReceipt>(:final failure) => ImportFlowFailed(failure),
      Success<ImportCommitReceipt>(:final value) => ImportFlowCommitted(value),
    };
  }

  /// Erases the staged statement without importing it.
  Future<void> discard() async {
    final importId = _importId;
    if (importId == null) {
      _forget();
      state = const ImportFlowIdle();
      return;
    }
    state = const ImportFlowWorking(ImportFlowStep.discarding);
    final erased = await ref.read(eraseStatementImportProvider)(importId: importId);
    switch (erased) {
      case Failed<ImportErasureReceipt>(:final failure):
        state = ImportFlowFailed(failure);
      case Success<ImportErasureReceipt>():
        _forget();
        state = const ImportFlowDiscarded();
    }
  }

  /// Returns to the beginning, keeping nothing.
  void reset() {
    _forget();
    state = const ImportFlowIdle();
  }

  void _forget() {
    _bytes = null;
    _importId = null;
    _version = null;
  }
}

final NotifierProvider<StatementImportFlowController, StatementImportFlowState>
    statementImportFlowProvider =
    NotifierProvider<StatementImportFlowController, StatementImportFlowState>(
  StatementImportFlowController.new,
);

// ---------------------------------------------------------------------------
// The standalone review read
// ---------------------------------------------------------------------------

/// What the review surface has to show for one import.
sealed class ImportPreviewView {
  const ImportPreviewView();
}

final class ImportPreviewLoaded extends ImportPreviewView {
  const ImportPreviewLoaded(this.preview);

  final StatementImportPreview preview;
}

final class ImportPreviewUnavailable extends ImportPreviewView {
  const ImportPreviewUnavailable(this.failure);

  final Failure failure;
}

/// One import's preview, addressed by identifier.
///
/// Used by the standalone review location. It carries no `version` — the
/// contract does not put one on a read — so this surface can show and discard
/// an import but cannot commit one.
final class StatementImportPreviewController
    extends TenantScopedAsyncNotifier<ImportPreviewView> {
  StatementImportPreviewController(this.importId);

  final String importId;

  /// What the preview becomes when the organisation changes or the session
  /// ends. A parsed statement is rows read out of one organisation's file; the
  /// next principal must not find them staged and reviewable.
  @override
  ImportPreviewView get discarded =>
      const ImportPreviewUnavailable(SessionChangedFailure());

  @override
  Future<ImportPreviewView> load() async {
    final result = await ref.watch(readStatementImportPreviewProvider)(importId: importId);
    return switch (result) {
      Success<StatementImportPreview>(:final value) => ImportPreviewLoaded(value),
      Failed<StatementImportPreview>(:final failure) => ImportPreviewUnavailable(failure),
    };
  }
}

final AsyncNotifierProviderFamily<StatementImportPreviewController, ImportPreviewView,
        String> statementImportPreviewProvider =
    AsyncNotifierProvider.family<StatementImportPreviewController, ImportPreviewView,
        String>(
  StatementImportPreviewController.new,
);

/// Providers whose value belongs to one organisation.
///
/// An import targets an account, and an account belongs to one organisation. A
/// provider missing from this list would survive a tenant switch and leave one
/// organisation's statement staged under another.
List<TenantScopedProvider> statementImportTenantScopedProviders() =>
    <TenantScopedProvider>[
      tenantScopedNotifier(statementImportFlowProvider),
      tenantScopedAsyncFamily(statementImportPreviewProvider),
    ];
