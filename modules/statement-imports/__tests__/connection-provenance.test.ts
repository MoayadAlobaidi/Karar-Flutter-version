/**
 * GATE 3 — the connection an import names is a claim, and this is the suite
 * that holds it to one.
 *
 * `connectionId` says "this file arrived through that route". The field was
 * validated for UUID SHAPE at the HTTP edge and then written straight onto
 * the import row, so a caller could stamp their own import with a connection
 * id naming nothing, or with one of their own `MANUAL` connections — a rail
 * whose entire definition is that the person typed their entries and no file
 * arrives on it. Nothing about it crossed a tenant: the column carries no
 * foreign key, so a bad id was never an existence oracle, and the one write
 * that reads it back is scoped by tenant, user, connection AND account. What
 * was wrong is that a row could say something untrue about the subject's own
 * data, in exactly the shape of the things that are true.
 *
 * **Each `it` below fails if its check is deleted, and nothing else here
 * covers it.** They are written against the use case with in-memory ports
 * rather than against PostgreSQL, because what is being proven is a decision
 * the application layer makes before any row exists — the refusals leave no
 * database state to inspect, which is the point of them.
 *
 * WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT: that the connection is linked
 * to the account being imported into. `ConnectionAccessPort` cannot express
 * the question and `StartStatementImport` does not ask it. A connection is a
 * route and one route legitimately feeds many accounts (ADR-0028); the
 * `account_source_links` row that would carry the relation is minted from the
 * external account reference the FILE names, so at DRAFT — before a byte has
 * been uploaded — it cannot exist yet; and `SourceObservationWriterPort` in
 * `@karar/financial-connections` already calls "no link at all" an ordinary
 * outcome in its own contract. A gate demanding it would refuse the first
 * import through every connection anybody ever creates.
 */

import { describe, expect, it } from 'vitest';
import { Clock, TenantId, UserId } from '@karar/shared-kernel';

import { StartStatementImport } from '../application/use-cases/start-statement-import.js';
import type { ImportsPrincipal } from '../application/principal.js';
import type {
  CanonicalAccountAccessPort,
  CanonicalAccountSummary,
} from '../application/ports/canonical-account-access.js';
import type {
  ConnectionAccessPort,
  ConnectionSummary,
} from '../application/ports/connection-access.js';
import type { IdSource } from '../application/ports/id-source.js';
import type {
  StatementRetentionDecisionPort,
  StatementRetentionDecision,
} from '../application/ports/statement-retention-decision.js';
import type { StatementImportRepository } from '../application/ports/statement-import-repository.js';
import type { StatementImport } from '../domain/statement-import.js';
import { CanonicalAccountRef } from '../domain/refs.js';

const ACTOR: ImportsPrincipal = {
  tenantId: TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a'),
  userId: UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1'),
};

const ACCOUNT_ID = 'acc00000-0000-4000-8000-0000000000a1';
const FILE_CONNECTION_ID = 'c0117777-0000-4000-8000-00000000f11e';
const MANUAL_CONNECTION_ID = 'c0117777-0000-4000-8000-00000000a4e1';
const ABSENT_CONNECTION_ID = 'c0117777-0000-4000-8000-00000000ab5e';
const OTHER_SUBJECTS_CONNECTION_ID = 'c0117777-0000-4000-8000-00000000e15e';

/** Every write this suite could produce, so a refusal can be shown to write nothing. */
class RecordingRepository {
  readonly created: StatementImport[] = [];

  create(_actor: ImportsPrincipal, imported: StatementImport): Promise<void> {
    this.created.push(imported);
    return Promise.resolve();
  }
}

const DECIDED: StatementRetentionDecision = {
  state: 'DECIDED',
  dataset: 'statement_import_source',
  retentionPeriod: 'P7Y',
  basis: 'synthetic local fixture with no legal effect',
  approvalReference: 'karar-ref:approval:synthetic-test@v1',
  packVersion: 'synthetic-local/connection-provenance',
  effect: 'SYNTHETIC_NO_LEGAL_EFFECT',
};

const RETENTION: StatementRetentionDecisionPort = {
  decideFor: (_actor, dataset): Promise<StatementRetentionDecision> =>
    Promise.resolve({ ...DECIDED, dataset }),
};

const ACTIVE_ACCOUNT: CanonicalAccountSummary = {
  accountRef: CanonicalAccountRef.of(ACCOUNT_ID),
  lifecycleState: 'ACTIVE',
  currencyCode: 'QAR',
};

const ACCOUNTS: CanonicalAccountAccessPort = {
  resolveOwnAccount: (_actor, accountRef) =>
    Promise.resolve(
      accountRef.accountId === ACCOUNT_ID ? { ...ACTIVE_ACCOUNT, accountRef } : null,
    ),
};

/**
 * The subject's own connection inventory, as the port reports it.
 *
 * Two of theirs on the two implemented rails, and NOTHING for the other two
 * ids — an id that was never minted and an id belonging to somebody else are
 * both `null` here, which is what the port's contract requires and what makes
 * the "does not exist" / "not yours" pair indistinguishable to a caller.
 */
const OWN_CONNECTIONS: ReadonlyMap<string, string> = new Map([
  [FILE_CONNECTION_ID, 'USER_FILE_UPLOAD'],
  [MANUAL_CONNECTION_ID, 'MANUAL'],
]);

const CONNECTIONS: ConnectionAccessPort = {
  resolveOwnConnection: (_actor, connectionRef): Promise<ConnectionSummary | null> => {
    const rail = OWN_CONNECTIONS.get(connectionRef.connectionId);
    return Promise.resolve(rail === undefined ? null : { connectionRef, rail });
  },
};

const IDS: IdSource = { nextId: () => '11111111-0000-4000-8000-00000000000f' };

function wire(
  connections: ConnectionAccessPort = CONNECTIONS,
): { start: StartStatementImport; repository: RecordingRepository } {
  const repository = new RecordingRepository();
  return {
    repository,
    start: new StartStatementImport(
      repository as unknown as StatementImportRepository,
      ACCOUNTS,
      connections,
      RETENTION,
      IDS,
      new Clock.Fixed(new Date('2026-08-20T09:00:00.000Z')),
    ),
  };
}

describe('the connection an import names is the caller’s own', () => {
  it('REFUSES a connection id that names nothing', async () => {
    const { start, repository } = wire();
    const result = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: ABSENT_CONNECTION_ID },
      ACTOR,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('connection_not_found');
    // The refusal leaves no durable record of the attempt.
    expect(repository.created).toEqual([]);
  });

  it('REFUSES another subject’s connection with the SAME arm, byte for byte', async () => {
    // The oracle test. "Not yours" and "no such thing" must be one answer, or
    // a caller walks identifiers until the wording changes and has learned
    // which ids belong to somebody. The module already makes this choice for
    // accounts (`ACCOUNT_NOT_FOUND`); this asserts the connection follows the
    // convention rather than inventing a second one.
    const { start } = wire();
    const absent = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: ABSENT_CONNECTION_ID },
      ACTOR,
    );
    const foreign = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: OTHER_SUBJECTS_CONNECTION_ID },
      ACTOR,
    );
    expect(absent.ok).toBe(false);
    expect(foreign.ok).toBe(false);
    if (absent.ok || foreign.ok) return;
    expect(foreign.error).toEqual(absent.error);
    expect(JSON.stringify(foreign.error)).toBe(JSON.stringify(absent.error));
  });
});

describe('the connection an import names is one a file can arrive on', () => {
  it('REFUSES the caller’s own MANUAL connection', async () => {
    // The defect that had teeth. A MANUAL connection means the person typed
    // their entries; an import attributed to one claims this platform
    // received a file through a route on which none arrives, and at commit
    // the claim reaches `last_successful_import_at` on that link.
    const { start, repository } = wire();
    const result = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: MANUAL_CONNECTION_ID },
      ACTOR,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('connection_not_usable');
    if (result.error.kind !== 'connection_not_usable') return;
    expect(result.error.rail).toBe('MANUAL');
    expect(repository.created).toEqual([]);
  });

  it('REFUSES a rail this module does not recognise, rather than allowing it', async () => {
    // A rail implemented later, or one an adapter failed to map, arrives as
    // an unrecognised string. A gap is not permission.
    const unrecognised: ConnectionAccessPort = {
      resolveOwnConnection: (_actor, connectionRef) =>
        Promise.resolve({ connectionRef, rail: 'UNRECOGNIZED' }),
    };
    const { start, repository } = wire(unrecognised);
    const result = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: FILE_CONNECTION_ID },
      ACTOR,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('connection_not_usable');
    expect(repository.created).toEqual([]);
  });

  it('distinguishes an unusable rail from an invisible connection', async () => {
    // Two arms rather than one, and that is NOT an oracle: a caller reaching
    // `connection_not_usable` already owns the connection and can read its
    // rail from their own connection list. The same shape the module already
    // uses for accounts — `account_not_found` and `account_not_writable`.
    const { start } = wire();
    const invisible = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: ABSENT_CONNECTION_ID },
      ACTOR,
    );
    const unusable = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: MANUAL_CONNECTION_ID },
      ACTOR,
    );
    expect(invisible.ok).toBe(false);
    expect(unusable.ok).toBe(false);
    if (invisible.ok || unusable.ok) return;
    expect(invisible.error.kind).not.toBe(unusable.error.kind);
  });
});

describe('what the gate does not refuse', () => {
  it('ACCEPTS the caller’s own USER_FILE_UPLOAD connection and records it', async () => {
    const { start, repository } = wire();
    const result = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: FILE_CONNECTION_ID },
      ACTOR,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.connectionRef?.connectionId).toBe(FILE_CONNECTION_ID);
    expect(result.value.connectionRef?.referenceType).toBe('FINANCIAL_CONNECTION');
    expect(result.value.state).toBe('DRAFT');
    expect(repository.created).toHaveLength(1);
  });

  it('ACCEPTS an import that names NO connection, and never asks the port', async () => {
    // The optionality is load-bearing. A person can import a file before any
    // connection exists, and making one a prerequisite would put a setup step
    // in front of reading one's own statement. Both spellings — omitted and
    // explicit null — take the same path.
    let asked = 0;
    const counting: ConnectionAccessPort = {
      resolveOwnConnection: (actor, connectionRef) => {
        asked += 1;
        return CONNECTIONS.resolveOwnConnection(actor, connectionRef);
      },
    };
    const { start, repository } = wire(counting);

    const omitted = await start.execute({ accountId: ACCOUNT_ID }, ACTOR);
    const explicitNull = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: null },
      ACTOR,
    );

    expect(omitted.ok).toBe(true);
    expect(explicitNull.ok).toBe(true);
    if (!omitted.ok || !explicitNull.ok) return;
    expect(omitted.value.connectionRef).toBeNull();
    expect(explicitNull.value.connectionRef).toBeNull();
    expect(repository.created).toHaveLength(2);
    // Not merely "answered null" — never consulted at all.
    expect(asked).toBe(0);
  });

  it('does not require the connection to be linked to the account', async () => {
    // Stated as a test so the decision is visible rather than inferable from
    // an absence — and made CHECKABLE rather than merely asserted. The port
    // is handed a connection reference and nothing else, so no rule in this
    // module can consult the account while deciding about the connection: a
    // relation gate would have to change this shape first, and this fails
    // when it does.
    const seen: unknown[] = [];
    const watching: ConnectionAccessPort = {
      resolveOwnConnection: (actor, connectionRef) => {
        seen.push(connectionRef);
        return CONNECTIONS.resolveOwnConnection(actor, connectionRef);
      },
    };
    const { start } = wire(watching);
    const result = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: FILE_CONNECTION_ID },
      ACTOR,
    );
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0] as object).sort()).toEqual(['connectionId', 'referenceType']);
  });
});

describe('the gate fails closed when it cannot ask', () => {
  it('REFUSES when the connection port throws, and writes nothing', async () => {
    const broken: ConnectionAccessPort = {
      resolveOwnConnection: () => Promise.reject(new Error('synthetic port failure')),
    };
    const { start, repository } = wire(broken);
    const result = await start.execute(
      { accountId: ACCOUNT_ID, connectionId: FILE_CONNECTION_ID },
      ACTOR,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('connection_access_unavailable');
    expect(repository.created).toEqual([]);
    // The cause is carried for the boundary logger and is invisible to
    // serialization, exactly as every other `cause` in this module's errors.
    expect(Object.keys(result.error)).not.toContain('cause');
    expect(JSON.parse(JSON.stringify(result.error))['cause']).toBeUndefined();
  });
});
