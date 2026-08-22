/**
 * The linking decision, exercised through the real use cases against fakes
 * that reproduce the database's refusals.
 *
 * Three properties are proven here and again against live PostgreSQL in
 * `linking-rules.integration.test.ts`:
 *
 *   1. an EXACT external-reference match within one principal links
 *      automatically, ACROSS connections — which is the mechanism by which a
 *      CSV-created account later receives API data without becoming a second
 *      account;
 *   2. a PROBABLE match does NOT link automatically — it waits for the
 *      person, and only `ConfirmProbableSourceLink` moves it;
 *   3. one source account never maps to two canonical accounts.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { Clock } from '@karar/shared-kernel';

import { ConfirmProbableSourceLink } from '../application/use-cases/confirm-probable-source-link.js';
import { CreateManualConnection } from '../application/use-cases/create-manual-connection.js';
import { DeclineProbableSourceLink } from '../application/use-cases/decline-probable-source-link.js';
import { EraseAccountSourceLinks } from '../application/use-cases/erase-account-source-links.js';
import { ListOwnAccountSourceLinks } from '../application/use-cases/list-own-account-source-links.js';
import { ProposeAccountSourceLink } from '../application/use-cases/propose-account-source-link.js';
import { RecordSourceObservation } from '../application/use-cases/record-source-observation.js';
import type { FinancialConnectionId } from '../domain/refs.js';
import {
  InMemoryAccountAccess,
  InMemoryConnectionRepository,
  InMemorySourceLinkRepository,
  SequentialIdSource,
} from './fakes/in-memory-repositories.js';
import {
  ACTOR_A1,
  ACTOR_A2,
  EVERY_SOURCE_LINK_PAGE,
  SYNTHETIC_SOURCE_REF_ONE,
  SYNTHETIC_SOURCE_REF_TWO,
  testFingerprints,
  testRetention,
} from './fixtures.js';

const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));
const ACCOUNT_ONE = 'ac000000-0000-4000-8000-0000000000a1';
const ACCOUNT_TWO = 'ac000000-0000-4000-8000-0000000000a2';

let connections: InMemoryConnectionRepository;
let links: InMemorySourceLinkRepository;
let accounts: InMemoryAccountAccess;
let createConnection: CreateManualConnection;
let propose: ProposeAccountSourceLink;
let confirm: ConfirmProbableSourceLink;
let decline: DeclineProbableSourceLink;
let list: ListOwnAccountSourceLinks;
let observe: RecordSourceObservation;
let erase: EraseAccountSourceLinks;

beforeEach(() => {
  connections = new InMemoryConnectionRepository();
  links = new InMemorySourceLinkRepository();
  accounts = new InMemoryAccountAccess();
  accounts.add(ACTOR_A1, ACCOUNT_ONE);
  accounts.add(ACTOR_A1, ACCOUNT_TWO);

  const retention = testRetention();
  const fingerprints = testFingerprints();
  createConnection = new CreateManualConnection(
    connections,
    retention,
    new SequentialIdSource('0c0c0c0c-0000-4000-8000-0000000'),
    clock,
  );
  propose = new ProposeAccountSourceLink(
    links,
    connections,
    accounts,
    fingerprints,
    retention,
    new SequentialIdSource('05050505-0000-4000-8000-0000000'),
    clock,
  );
  confirm = new ConfirmProbableSourceLink(links, clock);
  decline = new DeclineProbableSourceLink(links, clock);
  list = new ListOwnAccountSourceLinks(links);
  observe = new RecordSourceObservation(links);
  erase = new EraseAccountSourceLinks(links);
});

async function makeConnection(
  rail: 'MANUAL' | 'USER_FILE_UPLOAD',
  label: string,
): Promise<FinancialConnectionId> {
  const created = await createConnection.execute(
    { rail, displayLabel: label, institutionRef: null },
    ACTOR_A1,
  );
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('unreachable');
  return created.value.id;
}

describe('creating a connection', () => {
  it('creates one on an implemented rail', async () => {
    const created = await createConnection.execute(
      { rail: 'USER_FILE_UPLOAD', displayLabel: 'Synthetic Test Connection Upload', institutionRef: null },
      ACTOR_A1,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.rail).toBe('USER_FILE_UPLOAD');
    expect(created.value.status).toBe('ACTIVE');
  });

  it('refuses an unimplemented rail even when a caller forces the type', async () => {
    const created = await createConnection.execute(
      {
        rail: 'OPEN_FINANCE_API' as 'MANUAL',
        displayLabel: 'Synthetic Test Connection Api',
        institutionRef: null,
      },
      ACTOR_A1,
    );
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.error.kind).toBe('rule_violated');
    if (created.error.kind !== 'rule_violated') return;
    expect(created.error.violation.kind).toBe('rail_not_implemented');
  });

  it('refuses without a principal', async () => {
    const created = await createConnection.execute(
      { rail: 'MANUAL', displayLabel: 'Synthetic Test Connection Manual', institutionRef: null },
      null as unknown as typeof ACTOR_A1,
    );
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.kind).toBe('missing_principal_context');
  });
});

describe('the probable path — it asks, and it does not link', () => {
  it('creates a PENDING_CONFIRMATION link when nothing matches', async () => {
    const connection = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      {
        connectionId: connection,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.value.matchBasis).toBe('PROBABLE');
    expect(proposed.value.link.status).toBe('PENDING_CONFIRMATION');
    expect(proposed.value.link.subjectConfirmedAt).toBeNull();
    expect(proposed.value.resolvedFromExistingLink).toBe(false);
  });

  it('becomes LINKED only through the subject confirming, and records when', async () => {
    const connection = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      {
        connectionId: connection,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const confirmed = await confirm.execute(
      { linkId: proposed.value.link.id, expectedVersion: proposed.value.link.version },
      ACTOR_A1,
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.status).toBe('LINKED');
    expect(confirmed.value.subjectConfirmedAt).toEqual(clock.now());
    expect(confirmed.value.matchBasis).toBe('PROBABLE');
  });

  it('refuses a proposal with no prior match and no candidate — it never guesses', async () => {
    const connection = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      { connectionId: connection, externalAccountReference: SYNTHETIC_SOURCE_REF_ONE },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(false);
    if (!proposed.ok) expect(proposed.error.kind).toBe('account_not_found');
  });

  it('keeps a decline as a record, and lets a later match be proposed', async () => {
    const connection = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      {
        connectionId: connection,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const declined = await decline.execute(
      { linkId: proposed.value.link.id, expectedVersion: proposed.value.link.version },
      ACTOR_A1,
    );
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(declined.value.status).toBe('DECLINED');
    expect(declined.value.subjectConfirmedAt).toBeNull();

    // A declined link is not a mapping, so the same source account may be
    // proposed against a different account through another connection.
    const second = await makeConnection('MANUAL', 'Synthetic Test Connection Manual');
    const again = await propose.execute(
      {
        connectionId: second,
        candidateAccountId: ACCOUNT_TWO,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.matchBasis).toBe('PROBABLE');
  });

  it('refuses to decline a settled link', async () => {
    const connection = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      {
        connectionId: connection,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    const confirmed = await confirm.execute(
      { linkId: proposed.value.link.id, expectedVersion: proposed.value.link.version },
      ACTOR_A1,
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;

    const declined = await decline.execute(
      { linkId: confirmed.value.id, expectedVersion: confirmed.value.version },
      ACTOR_A1,
    );
    expect(declined.ok).toBe(false);
    if (declined.ok) return;
    expect(declined.error.kind).toBe('rule_violated');
    if (declined.error.kind !== 'rule_violated') return;
    expect(declined.error.violation.kind).toBe('settled_link_not_repointable');
  });
});

describe('the exact path — the whole point of the redesign', () => {
  it('auto-links a second connection to the SAME account, without asking again', async () => {
    // The scenario ADR-0028 opens with: an account created from a CSV import
    // later starts receiving data from another route, and must not become a
    // second account.
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const first = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await confirm.execute(
      { linkId: first.value.link.id, expectedVersion: first.value.link.version },
      ACTOR_A1,
    );

    const other = await makeConnection('MANUAL', 'Synthetic Test Connection Manual');
    const second = await propose.execute(
      { connectionId: other, externalAccountReference: SYNTHETIC_SOURCE_REF_ONE },
      ACTOR_A1,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.matchBasis).toBe('EXACT_EXTERNAL_REFERENCE');
    expect(second.value.link.status).toBe('LINKED');
    expect(second.value.link.accountRef.accountId).toBe(ACCOUNT_ONE);
    expect(second.value.resolvedFromExistingLink).toBe(true);
    // Auto-linked, so nobody was asked and no confirmation is claimed.
    expect(second.value.link.subjectConfirmedAt).toBeNull();

    // ONE account, TWO connections feeding it.
    const forAccount = await list.execute(
      { accountId: ACCOUNT_ONE, ...EVERY_SOURCE_LINK_PAGE },
      ACTOR_A1,
    );
    expect(forAccount.ok).toBe(true);
    if (!forAccount.ok) return;
    expect(forAccount.value.items).toHaveLength(2);
    expect(new Set(forAccount.value.items.map((link) => link.connectionId)).size).toBe(2);
  });

  it('re-proposing through the same connection is a duplicate, answered with the existing link', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const first = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const again = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.link.id).toBe(first.value.link.id);
    const all = await list.execute(EVERY_SOURCE_LINK_PAGE, ACTOR_A1);
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.value.items).toHaveLength(1);
  });

  it('one connection may feed MANY accounts', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    for (const [account, reference] of [
      [ACCOUNT_ONE, SYNTHETIC_SOURCE_REF_ONE],
      [ACCOUNT_TWO, SYNTHETIC_SOURCE_REF_TWO],
    ] as const) {
      const proposed = await propose.execute(
        {
          connectionId: csv,
          candidateAccountId: account,
          externalAccountReference: reference,
        },
        ACTOR_A1,
      );
      expect(proposed.ok, `${account} must link`).toBe(true);
    }
    const all = await list.execute(EVERY_SOURCE_LINK_PAGE, ACTOR_A1);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value.items).toHaveLength(2);
    expect(new Set(all.value.items.map((link) => link.accountRef.accountId)).size).toBe(2);
  });
});

describe('one source account never maps to two canonical accounts', () => {
  it('refuses a caller naming a different account for a source already linked', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const first = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(first.ok).toBe(true);

    const other = await makeConnection('MANUAL', 'Synthetic Test Connection Manual');
    const conflicting = await propose.execute(
      {
        connectionId: other,
        candidateAccountId: ACCOUNT_TWO,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(conflicting.ok).toBe(false);
    if (conflicting.ok) return;
    expect(conflicting.error.kind).toBe('source_account_already_linked_elsewhere');
    if (conflicting.error.kind !== 'source_account_already_linked_elsewhere') return;
    expect(conflicting.error.linkedAccountId).toBe(ACCOUNT_ONE);
  });
});

describe('what a proposal refuses before anything is stored', () => {
  it('refuses an external reference that is actually an IBAN', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: 'QA00SYNT000000000000ALPHA00',
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(false);
    if (proposed.ok) return;
    expect(proposed.error.kind).toBe('rule_violated');
    if (proposed.error.kind !== 'rule_violated') return;
    expect(proposed.error.violation.kind).toBe('external_reference_not_storable');
    expect(links.rows.size).toBe(0);
  });

  it('refuses an account the caller cannot see, indistinguishably from one that is absent', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    accounts.add(ACTOR_A2, 'ac000000-0000-4000-8000-0000000000b9');

    const neighbours = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: 'ac000000-0000-4000-8000-0000000000b9',
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    const nonexistent = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: 'ac000000-0000-4000-8000-0000000000ff',
        externalAccountReference: SYNTHETIC_SOURCE_REF_TWO,
      },
      ACTOR_A1,
    );
    expect(neighbours.ok).toBe(false);
    expect(nonexistent.ok).toBe(false);
    if (neighbours.ok || nonexistent.ok) return;
    expect(neighbours.error).toEqual(nonexistent.error);
  });

  it('refuses an archived account rather than resurrecting it on the next import', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const archived = 'ac000000-0000-4000-8000-0000000000c1';
    accounts.add(ACTOR_A1, archived, 'ARCHIVED');
    const proposed = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: archived,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(false);
    if (!proposed.ok) expect(proposed.error.kind).toBe('account_not_linkable');
  });

  it('refuses a retired connection', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const current = connections.rows.get(csv);
    expect(current).toBeDefined();
    if (current === undefined) return;
    connections.rows.set(csv, { ...current, status: 'RETIRED' });

    const proposed = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(false);
    if (!proposed.ok) expect(proposed.error.kind).toBe('connection_not_usable');
  });

  it('refuses a connection the caller does not own', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A2,
    );
    expect(proposed.ok).toBe(false);
    if (!proposed.ok) expect(proposed.error.kind).toBe('connection_not_found');
  });
});

describe('an observation is a report, never a decision', () => {
  it('moves the window and the capabilities without settling a pending match', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    const proposed = await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.value.link.capabilities).toEqual({
      balance: 'NOT_OBSERVED',
      pendingTransactions: 'NOT_OBSERVED',
    });

    const later = new Date('2026-08-19T09:00:00.000Z');
    const observed = await observe.execute(
      {
        linkId: proposed.value.link.id,
        expectedVersion: proposed.value.link.version,
        observation: {
          observedAt: later,
          successfulImportAt: later,
          capabilities: { balance: 'OBSERVED' },
        },
      },
      ACTOR_A1,
    );
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    expect(observed.value.observation.lastObservedAt).toEqual(later);
    expect(observed.value.observation.lastSuccessfulImportAt).toEqual(later);
    expect(observed.value.capabilities.balance).toBe('OBSERVED');
    expect(observed.value.capabilities.pendingTransactions).toBe('NOT_OBSERVED');
    // Still waiting for the person. Hearing from a source is not consent.
    expect(observed.value.status).toBe('PENDING_CONFIRMATION');
    expect(observed.value.subjectConfirmedAt).toBeNull();
  });
});

describe('erasing an account reaches its source links', () => {
  it('removes every link feeding one account and answers the exact count', async () => {
    const csv = await makeConnection('USER_FILE_UPLOAD', 'Synthetic Test Connection Csv');
    await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_ONE,
        externalAccountReference: SYNTHETIC_SOURCE_REF_ONE,
      },
      ACTOR_A1,
    );
    await propose.execute(
      {
        connectionId: csv,
        candidateAccountId: ACCOUNT_TWO,
        externalAccountReference: SYNTHETIC_SOURCE_REF_TWO,
      },
      ACTOR_A1,
    );

    const erased = await erase.execute({ accountId: ACCOUNT_ONE }, ACTOR_A1);
    expect(erased.ok).toBe(true);
    if (!erased.ok) return;
    expect(erased.value.accountSourceLinksDeleted).toBe(1);

    // Idempotent by contract: a retry converges rather than compounding.
    const again = await erase.execute({ accountId: ACCOUNT_ONE }, ACTOR_A1);
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.accountSourceLinksDeleted).toBe(0);

    // The other account's link survives — erasure is scoped, not a purge.
    const remaining = await list.execute(EVERY_SOURCE_LINK_PAGE, ACTOR_A1);
    expect(remaining.ok).toBe(true);
    if (remaining.ok) expect(remaining.value.items).toHaveLength(1);
  });
});
