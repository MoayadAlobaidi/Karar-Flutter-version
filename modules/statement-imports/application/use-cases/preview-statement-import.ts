/**
 * PreviewStatementImport — what a person is shown before they decide.
 *
 * ## The rule that shapes every field below
 *
 * **A preview exposes counts, states and codes. It exposes no value read out
 * of the file.** No cell, no header text, no amount, no merchant, no
 * description, no balance, no source reference, no instrument mask, no
 * fingerprint, no transaction id.
 *
 * The reasoning is not squeamishness. A preview is the single most-copied
 * artefact in an import flow: it goes into a screenshot when somebody asks for
 * help, into a log when somebody debugs, into a bug report, into a support
 * ticket, and into whatever analytics the client happens to have. The value
 * that caused a problem is the one thing a person can already see by opening
 * their own file, and it is the one thing that must not make any of those
 * journeys.
 *
 * The safe field name is this module's own vocabulary and is never the file's
 * header text, because a header is content from the file and can carry an
 * account number as easily as the word "Amount".
 *
 * ## What IS exposed, and why each is safe
 *
 * - **Counts** — valid, invalid, exact duplicates, probable duplicates,
 *   total. Numbers about the person's own file.
 * - **The account it targets** — the person's own account id, which they
 *   chose.
 * - **Whether a source is linked** — a boolean, not an address.
 * - **Currency mismatch and date ambiguity** — as reason codes on lines,
 *   which is what makes them actionable without being quotable.
 * - **The reconciliation verdict** — `NOT_AVAILABLE`, `MATCHED` or
 *   `MISMATCHED`, and for a mismatch the first divergent LINE NUMBER. Not the
 *   two figures: the figures are the statement.
 * - **The four processing versions** — how the file was read, which a person
 *   is entitled to and which carries nothing about them.
 *
 * ## Errors are bounded, and the truth about the bound travels with them
 *
 * `maxReportedErrors` caps the list. `totalErrorCount` is the real number.
 * Collapsing them would turn a truncated report into a complete-looking one,
 * which is the same failure mode as a silently truncated import.
 */

import { Result } from '@karar/shared-kernel';
import type { IngestionLimitPolicy } from '@karar/platform/dist/ingestion/limits.js';

import type { ImportState } from '../../domain/import-state.js';
import type { ReconciliationStatus } from '../../domain/reconciliation.js';
import type { ImportRefusalCode, RowError } from '../../domain/reason-codes.js';
import type { ImportCounts, ProcessingVersions } from '../../domain/statement-import.js';
import { StatementImportId } from '../../domain/refs.js';
import {
  IMPORT_NOT_FOUND,
  storeFailure,
  type ImportNotFound,
  type StoreFailure,
} from '../errors.js';
import type { StatementImportRepository } from '../ports/statement-import-repository.js';
import { requirePrincipal, type ImportsPrincipal } from '../principal.js';
import type { MissingPrincipalContext } from '../principal.js';

export interface StatementImportPreview {
  readonly importId: string;
  readonly state: ImportState;
  /** The person's own account. They chose it; nothing inferred it. */
  readonly accountId: string;
  readonly connectionId: string | null;
  /** Whether an encrypted statement is linked. Never where it is. */
  readonly hasStoredSource: boolean;
  readonly counts: ImportCounts;
  readonly reconciliationStatus: ReconciliationStatus;
  readonly versions: ProcessingVersions | null;
  readonly refusalCode: ImportRefusalCode | null;
  /** Bounded by `maxReportedErrors`. Line, safe field, reason code — nothing else. */
  readonly rowErrors: readonly RowError[];
  readonly reportedErrorCount: number;
  /** The REAL number, so a truncated list cannot read as a complete one. */
  readonly totalErrorCount: number;
  /** True when this import may still be committed. */
  readonly awaitsDecision: boolean;
}

export interface PreviewStatementImportInput {
  readonly importId: string;
  readonly limits: IngestionLimitPolicy;
}

export type PreviewStatementImportError =
  | MissingPrincipalContext
  | ImportNotFound
  | StoreFailure;

export class PreviewStatementImport {
  constructor(private readonly imports: StatementImportRepository) {}

  async execute(
    input: PreviewStatementImportInput,
    actor: ImportsPrincipal,
  ): Promise<Result<StatementImportPreview, PreviewStatementImportError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return Result.err(principal.error);
    const acting = principal.value;

    const importId = StatementImportId.of(input.importId);
    try {
      const imported = await this.imports.findById(acting, importId);
      if (imported === null) return Result.err(IMPORT_NOT_FOUND);

      const [source, rowErrors, totalErrorCount] = await Promise.all([
        this.imports.findSource(acting, importId),
        this.imports.listRowErrors(acting, importId, input.limits.maxReportedErrors),
        this.imports.countRowErrors(acting, importId),
      ]);

      return Result.ok({
        importId,
        state: imported.state,
        accountId: imported.accountRef.accountId,
        connectionId: imported.connectionRef?.connectionId ?? null,
        // A boolean, deliberately. `objectRef` is an opaque handle and it
        // still has no business leaving this module: a handle is enough to
        // ask a store for a subject's bank statement.
        hasStoredSource: source !== null,
        counts: imported.counts,
        reconciliationStatus: imported.reconciliationStatus,
        versions: imported.versions,
        refusalCode: imported.refusalCode,
        rowErrors,
        reportedErrorCount: rowErrors.length,
        totalErrorCount,
        awaitsDecision: imported.state === 'REVIEW_REQUIRED',
      });
    } catch (error) {
      return Result.err(storeFailure('read the statement import preview', error));
    }
  }
}
