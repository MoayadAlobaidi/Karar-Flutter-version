/**
 * StartStatementImport — a person says "I have a statement for this account".
 *
 * Nothing about the FILE happens here. What happens is the three gates that
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
 *
 * ## GATE 3 — the connection, when one is named
 *
 * Only when one is named. `connectionId` is optional and stays optional: a
 * person can import a file before any connection exists, and refusing that
 * would make a connection a prerequisite for reading one's own statement. An
 * absent connection is `null` on the row and skips this gate entirely.
 *
 * When one IS named it is resolved through `ConnectionAccessPort` and must be
 * the caller's own, exist, and be on a rail a file can arrive on — which is
 * `USER_FILE_UPLOAD` and nothing else. Until this gate existed the id was
 * checked for UUID SHAPE at the edge and written straight onto the row, so an
 * import could claim it arrived through a connection that names nothing, or
 * through one of the subject's own `MANUAL` connections — a rail whose
 * definition is that the person typed their entries and no file arrives on
 * it. That claim is not inert: at commit it moves
 * `last_successful_import_at` on the matching link.
 *
 * **No cross-subject read was ever possible here and none is added.** The
 * column carries no foreign key, so a bad id was never an existence oracle,
 * and the one write that reads it back is scoped by tenant, user, connection
 * and account. What was wrong is narrower and worse for a platform that sells
 * provenance: the row could say something untrue about the subject's own
 * data, in the same shape as the things that are true.
 *
 * Asked AFTER the account, which costs nothing and reads correctly: the
 * account is the required argument and the connection is the optional
 * qualifier on it, so a caller who names neither correctly hears about the
 * one they had to supply. Neither refusal tells anybody anything about
 * another subject, so the order carries no oracle either way.
 *
 * **The connection is not required to relate to the account.** See
 * `ConnectionAccessPort` for the argument; in short, a connection is a route
 * and one route legitimately feeds many accounts (ADR-0028), the link that
 * would express the relation is minted from the file's own content and
 * therefore cannot exist yet at DRAFT, and `SourceObservationWriterPort`
 * already declares "no link at all" an ordinary outcome.
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
  CONNECTION_NOT_FOUND,
  accountAccessUnavailable,
  connectionAccessUnavailable,
  retentionUnresolved,
  storeFailure,
  type AccountAccessUnavailable,
  type AccountNotFound,
  type AccountNotWritable,
  type ConnectionAccessUnavailable,
  type ConnectionNotFound,
  type ConnectionNotUsable,
  type RetentionUnresolved,
  type StoreFailure,
} from '../errors.js';
import {
  isWritableLifecycleState,
  type CanonicalAccountAccessPort,
  type CanonicalAccountSummary,
} from '../ports/canonical-account-access.js';
import {
  isImportableRail,
  type ConnectionAccessPort,
  type ConnectionSummary,
} from '../ports/connection-access.js';
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
  | ConnectionNotFound
  | ConnectionNotUsable
  | ConnectionAccessUnavailable
  | StoreFailure;

export class StartStatementImport {
  constructor(
    private readonly imports: StatementImportRepository,
    private readonly accounts: CanonicalAccountAccessPort,
    /**
     * REQUIRED, with no default and nothing optional about it.
     *
     * A defaulted port here would be a gate a composition root could drop by
     * omission — and a dropped gate is invisible, because an import with an
     * unchecked connection looks exactly like one with a checked connection.
     * That is the same reasoning that makes `DeleteOwnAccount`'s three
     * erasers required arguments: the failure mode of the convenient version
     * is silence.
     */
    private readonly connections: ConnectionAccessPort,
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

    // GATE 3 — the connection, only when the person named one.
    const connectionRef =
      input.connectionId === null || input.connectionId === undefined
        ? null
        : ConnectionRef.of(input.connectionId);
    if (connectionRef !== null) {
      let connection: ConnectionSummary | null;
      try {
        connection = await this.connections.resolveOwnConnection(acting, connectionRef);
      } catch (error) {
        return Result.err(connectionAccessUnavailable(error));
      }
      if (connection === null) return Result.err(CONNECTION_NOT_FOUND);
      if (!isImportableRail(connection.rail)) {
        return Result.err(refuseUnimportableConnection(connection));
      }
    }

    const now = this.clock.now();
    const imported = startImport({
      id: StatementImportId.of(this.ids.nextId()),
      tenantId: acting.tenantId,
      userId: acting.userId,
      accountRef,
      connectionRef,
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

/**
 * The refusal for a connection the principal owns but on which no file
 * arrives.
 *
 * The rail is named, and naming it is safe: it is a word from a closed
 * vocabulary describing the caller's OWN connection, which they can already
 * read from their own connection list. What the message must not become is a
 * suggestion to pick a different id until one is accepted — so it says what
 * the rail MEANS rather than which rail would work.
 *
 * `MANUAL` is the case this exists for. A manual connection is a ledger the
 * person keeps by hand; attributing an uploaded statement to it records that
 * Karar received a file through a route on which no file arrives, and the
 * claim outlives the import — at commit it stamps
 * `last_successful_import_at` on that link, which is a report of a successful
 * import on a connection that has never had one.
 */
function refuseUnimportableConnection(connection: ConnectionSummary): ConnectionNotUsable {
  return {
    kind: 'connection_not_usable',
    rail: connection.rail,
    message:
      `this connection is on the ${connection.rail} rail, and a statement file does not arrive ` +
      'on it. Attributing an upload to it would record that this platform received a file ' +
      'through a route that carries none, and the claim does not stay on the import: it reports ' +
      'a successful delivery against that connection when the import commits',
  };
}
