/**
 * RejectStatementImport — the person looked, and said no.
 *
 * The counterpart to `CommitStatementImport`, and it exists as its own use
 * case rather than as a flag on that one for a reason worth stating: "no" must
 * be as reachable and as cheap as "yes". A review flow where the refusal is a
 * secondary path — a cancel that navigates away, a timeout that just leaves
 * the import sitting there — quietly pressures people toward the outcome that
 * is easy, and the outcome that is easy here writes several hundred financial
 * records.
 *
 * ## What rejection does NOT do
 *
 * It does not delete anything. The staged rows and the stored statement
 * remain, and `REJECTED` is a terminal state whose only move is `ERASED`. A
 * person who rejects and then changes their mind can start a new import of the
 * same file — which is exactly why file-duplicate detection counts only
 * COMMITTED imports.
 *
 * Keeping the rows is also what makes "why did nothing import?" answerable
 * afterwards. A rejection that erased its own evidence would leave a person
 * with a statement they know they uploaded and no record of what the platform
 * made of it.
 *
 * ## Reachable from three states, and that is deliberate
 *
 * `DRAFT`, `SOURCE_STORED` and `REVIEW_REQUIRED` all permit rejection: a
 * person may abandon an import before uploading, after uploading, or after
 * reading the preview. `PARSING` permits it too — a parse in progress is work
 * this platform is doing, not a commitment the person made.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import { checkTransition } from '../../domain/import-state.js';
import { transitionTo, type StatementImport } from '../../domain/statement-import.js';
import { StatementImportId } from '../../domain/refs.js';
import {
  IMPORT_NOT_FOUND,
  notInExpectedState,
  storeFailure,
  type ImportNotFound,
  type ImportNotInExpectedState,
  type StoreFailure,
} from '../errors.js';
import type { StatementImportRepository } from '../ports/statement-import-repository.js';
import { requirePrincipal, type ImportsPrincipal } from '../principal.js';
import type { MissingPrincipalContext } from '../principal.js';

export interface RejectStatementImportInput {
  readonly importId: string;
}

export type RejectStatementImportError =
  | MissingPrincipalContext
  | ImportNotFound
  | ImportNotInExpectedState
  | StoreFailure;

export class RejectStatementImport {
  constructor(
    private readonly imports: StatementImportRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RejectStatementImportInput,
    actor: ImportsPrincipal,
  ): Promise<Result<StatementImport, RejectStatementImportError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return Result.err(principal.error);
    const acting = principal.value;

    const importId = StatementImportId.of(input.importId);
    let imported: StatementImport | null;
    try {
      imported = await this.imports.findById(acting, importId);
    } catch (error) {
      return Result.err(storeFailure('read statement import', error));
    }
    if (imported === null) return Result.err(IMPORT_NOT_FOUND);

    // Asked of the state machine rather than of a hand-written list, so this
    // use case cannot drift from the transitions the domain and the database
    // both enforce.
    if (checkTransition(imported.state, 'REJECTED') !== null) {
      return Result.err(
        notInExpectedState(imported.state, ['DRAFT', 'SOURCE_STORED', 'PARSING', 'REVIEW_REQUIRED']),
      );
    }

    // No refusal code. A rejection is not a refusal by this platform — it is a
    // decision by the person, and labelling it with a failure code would put
    // the platform's vocabulary onto somebody else's choice.
    const rejected = transitionTo(imported, 'REJECTED', this.clock.now());
    try {
      await this.imports.update(acting, rejected, imported.version);
    } catch (error) {
      return Result.err(storeFailure('reject statement import', error));
    }
    return Result.ok(rejected);
  }
}
