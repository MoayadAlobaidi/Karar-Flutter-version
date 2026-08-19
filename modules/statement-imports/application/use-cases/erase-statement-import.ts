/**
 * EraseStatementImport — removing the staged statement, and the byte the
 * database cannot reach.
 *
 * ## The order is the whole use case
 *
 * ```
 * delete the stored OBJECT -> then delete the rows
 * ```
 *
 * `ON DELETE CASCADE` takes the source row, the staged rows and the row
 * errors when the import goes (migrations 0100, 0101). It cannot take the
 * ciphertext, because the ciphertext is not in PostgreSQL — and a dangling
 * encrypted object nobody can name is still a subject's bank statement
 * sitting in a store, now with no row left to say whose it is or that it
 * should have gone.
 *
 * So the object is deleted FIRST. If that fails, nothing else is attempted
 * and the refusal says so: an import row that still names an object is
 * recoverable, and an object with no row that names it is not.
 *
 * The store's `erase` is idempotent by contract, so a retry after a partial
 * failure finds nothing and answers `false` rather than throwing.
 *
 * ## What erasure does NOT remove
 *
 * **The canonical transactions a committed import produced.** Those are the
 * person's own financial records and they survive the file that carried them,
 * exactly as a transaction survives the connection it arrived through
 * (ADR-0028). What goes is the staged statement behind them: the encrypted
 * file, the parsed lines, and the errors.
 *
 * Their provenance keeps naming this import by id, and that reference now
 * points at nothing. That is the honest outcome rather than a defect: the
 * record still says "this came from an import", which is true, and the import
 * it came from has been erased, which is also true. Rewriting provenance to
 * hide the gap would make an erased import indistinguishable from a manual
 * entry.
 *
 * ## Reachable from every settled state, including COMMITTED
 *
 * A person may erase a statement they never parsed, one that failed, one they
 * rejected, and one they committed. Restricting erasure to the unsuccessful
 * states would mean the only way to remove a successfully imported bank
 * statement from this platform is to have imported it badly.
 *
 * The single exception is `COMMITTING`: a commit in flight is a database
 * transaction that is still running, and erasing the import out from under it
 * would race the write it is making. The commit settles first — and every one
 * of the states it settles into may then be erased.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import { checkTransition } from '../../domain/import-state.js';
import { transitionTo, type StatementImport } from '../../domain/statement-import.js';
import { StatementImportId } from '../../domain/refs.js';
import {
  IMPORT_NOT_FOUND,
  notInExpectedState,
  sourceStoreUnavailable,
  storeFailure,
  type ImportNotFound,
  type ImportNotInExpectedState,
  type SourceStoreUnavailable,
  type StoreFailure,
} from '../errors.js';
import type { EncryptedSourceStorePort } from '../ports/encrypted-source-store.js';
import type { StatementImportRepository } from '../ports/statement-import-repository.js';
import { requirePrincipal, type ImportsPrincipal } from '../principal.js';
import type { MissingPrincipalContext } from '../principal.js';

export interface EraseStatementImportInput {
  readonly importId: string;
}

/** What went, counted rather than assumed. */
export interface StatementImportErased {
  readonly importId: string;
  /** True when an encrypted object existed and was deleted. */
  readonly storedObjectDeleted: boolean;
  readonly rowsDeleted: boolean;
}

export type EraseStatementImportError =
  | MissingPrincipalContext
  | ImportNotFound
  | ImportNotInExpectedState
  | SourceStoreUnavailable
  | StoreFailure;

export class EraseStatementImport {
  constructor(
    private readonly imports: StatementImportRepository,
    private readonly sources: EncryptedSourceStorePort,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: EraseStatementImportInput,
    actor: ImportsPrincipal,
  ): Promise<Result<StatementImportErased, EraseStatementImportError>> {
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
    if (checkTransition(imported.state, 'ERASED') !== null) {
      // The only unreachable case is an import that is already ERASED, and
      // answering "not found" for it would be a lie about a row that exists.
      return Result.err(notInExpectedState(imported.state, ['any state but ERASED' as never]));
    }

    // The state is recorded BEFORE the object goes, so an interrupted erasure
    // leaves an import that says it is being erased rather than one that looks
    // untouched while its statement has already gone.
    const erased = transitionTo(imported, 'ERASED', this.clock.now());
    try {
      await this.imports.update(acting, erased, imported.version);
    } catch (error) {
      return Result.err(storeFailure('mark the statement import erased', error));
    }

    let storedObjectDeleted = false;
    try {
      const descriptor = await this.imports.findSource(acting, importId);
      if (descriptor !== null) {
        storedObjectDeleted = await this.sources.erase(acting, {
          storeKind: descriptor.storeKind,
          objectRef: descriptor.objectRef,
          byteLength: descriptor.byteLength,
          algorithm: descriptor.algorithm,
          keyVersion: descriptor.keyVersion,
          nonce: descriptor.nonce,
          authTag: descriptor.authTag,
          integrityChecksumAlgorithm: descriptor.integrityChecksumAlgorithm,
          integrityChecksum: descriptor.integrityChecksum,
        });
      }
    } catch (error) {
      // Nothing else is attempted. An import row that still names an object is
      // recoverable; an object with no row naming it is not.
      return Result.err(sourceStoreUnavailable(error));
    }

    try {
      const rowsDeleted = await this.imports.deleteImport(acting, importId);
      return Result.ok({ importId, storedObjectDeleted, rowsDeleted });
    } catch (error) {
      return Result.err(storeFailure('erase the statement import', error));
    }
  }
}
