/**
 * StartStatementImport — a person says "I have a statement for this account".
 *
 * Nothing about the FILE happens here. What happens is the two gates that
 * decide whether a durable record of this import may exist at all, and the
 * order between them is deliberate.
 *
 * ## GATE 1 — retention, asked first
 *
 * Asked before the account is resolved, and the order matters: when retention
 * is unresolved every account id gets the same refusal, so an unresolved legal
 * decision cannot be turned into a probe against another context's data. The
 * reverse order would answer "that account is not yours" to a caller the
 * platform is not allowed to write anything for at all.
 *
 * Both datasets are asked — the stored source and the staged rows — and both
 * must answer `DECIDED`. A provider that permitted one and refused the other
 * would leave a coherent policy ("keep the parse, drop the file") that this
 * phase has no way to honour, so it is refused rather than half-applied.
 *
 * **The refusal leaves ZERO durable rows**, including no import row. That is
 * why the decision is a constructor argument on the aggregate rather than
 * something recorded after the row exists: an import row created first and
 * decided second is still a durable record of a subject's statement-import
 * attempt governed by a decision nobody took.
 *
 * ## GATE 2 — the account
 *
 * Resolved through `CanonicalAccountAccessPort`, which reports existence,
 * lifecycle and currency and nothing else. The person chooses the account;
 * this module never infers one from institution, type or currency, and the
 * port cannot express the question that would let it (ADR-0028).
 *
 * The currency is recorded nowhere on the import. It is re-read at parse and
 * again at commit, because an import can sit in review for days and an
 * account's currency can be corrected in that time — a copy taken now would
 * be a stale fact used to validate a fresh file.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import { startImport, type StatementImport } from '../../domain/statement-import.js';
import {
  CanonicalAccountRef,
  ConnectionRef,
  StatementImportId,
  type CanonicalAccountRef as AccountRefType,
} from '../../domain/refs.js';
import {
  ACCOUNT_NOT_FOUND,
  accountAccessUnavailable,
  retentionUnresolved,
  storeFailure,
  type AccountAccessUnavailable,
  type AccountNotFound,
  type AccountNotWritable,
  type RetentionUnresolved,
  type StoreFailure,
} from '../errors.js';
import {
  isWritableLifecycleState,
  type CanonicalAccountAccessPort,
  type CanonicalAccountSummary,
} from '../ports/canonical-account-access.js';
import type { IdSource } from '../ports/id-source.js';
import type { StatementImportRepository } from '../ports/statement-import-repository.js';
import {
  RETENTION_GOVERNED_DATASETS,
  permitsDurableWrite,
  type StatementRetentionDecisionPort,
} from '../ports/statement-retention-decision.js';
import { requirePrincipal, type ImportsPrincipal } from '../principal.js';
import type { MissingPrincipalContext } from '../principal.js';

/** No `userId` and no `tenantId`: the principal is context, never input. */
export interface StartStatementImportInput {
  /** The ONE account this import targets. Chosen by the person. */
  readonly accountId: string;
  /** The connection the file arrived through, when the person has one. */
  readonly connectionId?: string | null;
}

export type StartStatementImportError =
  | MissingPrincipalContext
  | RetentionUnresolved
  | AccountNotFound
  | AccountNotWritable
  | AccountAccessUnavailable
  | StoreFailure;

export class StartStatementImport {
  constructor(
    private readonly imports: StatementImportRepository,
    private readonly accounts: CanonicalAccountAccessPort,
    private readonly retention: StatementRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: StartStatementImportInput,
    actor: ImportsPrincipal,
  ): Promise<Result<StatementImport, StartStatementImportError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return Result.err(principal.error);
    const acting = principal.value;

    // GATE 1 — retention, before anything is resolved and before any row.
    for (const dataset of RETENTION_GOVERNED_DATASETS) {
      let decision;
      try {
        decision = await this.retention.decideFor(acting, dataset);
      } catch (error) {
        return Result.err(storeFailure('resolve statement retention', error));
      }
      if (!permitsDurableWrite(decision)) {
        return Result.err(retentionUnresolved(dataset, decision));
      }
    }
    // Re-read the source dataset's decision for the values recorded on the
    // row. Asked twice rather than cached from the loop because a provider is
    // free to answer differently per dataset, and recording the rows'
    // decision against the source would attribute one dataset's period to
    // another's data.
    const sourceDecision = await this.retention.decideFor(acting, 'statement_import_source');
    if (sourceDecision.state !== 'DECIDED') {
      return Result.err(retentionUnresolved('statement_import_source', sourceDecision));
    }

    const accountRef: AccountRefType = CanonicalAccountRef.of(input.accountId);

    // GATE 2 — the account.
    let account: CanonicalAccountSummary | null;
    try {
      account = await this.accounts.resolveOwnAccount(acting, accountRef);
    } catch (error) {
      return Result.err(accountAccessUnavailable(error));
    }
    if (account === null) return Result.err(ACCOUNT_NOT_FOUND);
    if (!isWritableLifecycleState(account.lifecycleState)) {
      return Result.err(refuseUnwritableAccount(account));
    }

    const now = this.clock.now();
    const imported = startImport({
      id: StatementImportId.of(this.ids.nextId()),
      tenantId: acting.tenantId,
      userId: acting.userId,
      accountRef,
      connectionRef:
        input.connectionId === null || input.connectionId === undefined
          ? null
          : ConnectionRef.of(input.connectionId),
      retention: {
        state: 'DECIDED',
        decidedAt: now,
        retentionPeriod: sourceDecision.retentionPeriod,
        basis: sourceDecision.basis,
        packVersion: sourceDecision.packVersion,
      },
      createdAt: now,
    });

    try {
      await this.imports.create(acting, imported);
    } catch (error) {
      return Result.err(storeFailure('start statement import', error));
    }
    return Result.ok(imported);
  }
}

/**
 * The refusal for an account the principal owns but may not import into.
 *
 * Archived and closed are named separately rather than collapsed into "not
 * active" because they mean different things to a person: an archived account
 * is one they put away and can bring back, a closed one is finished. Filing a
 * month of movements into either produces records the account holder believes
 * they stopped keeping.
 *
 * An unrecognised state is refused too. A state this module has no rule for is
 * not permission to import; it is a gap, and the fail-closed reading of a gap
 * is no.
 */
function refuseUnwritableAccount(account: CanonicalAccountSummary): AccountNotWritable {
  return {
    kind: 'account_not_writable',
    lifecycleState: account.lifecycleState,
    message:
      `this account is ${account.lifecycleState.toLowerCase()}, so a statement may not be ` +
      'imported into it. Importing would produce records the account holder believes they ' +
      'stopped keeping — and at the scale of a statement that is a month of movements, not one',
  };
}
