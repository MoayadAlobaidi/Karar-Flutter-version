/**
 * Use-case behaviour against fake repositories.
 *
 * The fakes are OWNERSHIP-AWARE on purpose: they key rows on
 * (tenant, user, id) and return nothing for any other principal, which is the
 * in-memory analogue of what RLS does in the live database. A fake that
 * ignored ownership would let these tests pass while the use cases leaked, so
 * the fake is written to be capable of leaking and is then observed not to.
 *
 * The live-PostgreSQL proof that RLS itself holds is a separate suite
 * (financial-accounts-isolation.integration.test.ts); this one covers the
 * decisions the application layer makes on top of it.
 *
 * All fixtures are obviously synthetic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Clock, Currency, Money, TenantId, UserId } from '@karar/shared-kernel';

import type { BalanceSnapshotRepository } from '../application/ports/balance-snapshot-repository.js';
import type {
  AccountDeleteOutcome,
  AccountUpdateOutcome,
  FinancialAccountRepository,
} from '../application/ports/financial-account-repository.js';
import type { IdSource } from '../application/ports/id-source.js';
import type { InstitutionCatalogueReader } from '../application/ports/institution-catalogue-reader.js';
import type { AccountsPrincipal } from '../application/principal.js';
import { CreateManualAccount } from '../application/use-cases/create-manual-account.js';
import { DeleteOwnAccount } from '../application/use-cases/delete-own-account.js';
import { ListOwnAccounts } from '../application/use-cases/list-own-accounts.js';
import { ListOwnBalanceSnapshots } from '../application/use-cases/list-own-balance-snapshots.js';
import { ReadOwnAccount } from '../application/use-cases/read-own-account.js';
import { UpdateOwnAccount } from '../application/use-cases/update-own-account.js';
import type { BalanceSnapshot } from '../domain/balance-snapshot.js';
import type { FinancialAccount } from '../domain/financial-account.js';
import type { Institution } from '../domain/institution.js';
import type {
  BalanceSnapshotId,
  FinancialAccountId,
  InstitutionRef,
  SourceReference,
} from '../domain/refs.js';

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const USER_A2 = UserId.of('a2a2a2a2-0000-4000-8000-0000000000a2');
const USER_B1 = UserId.of('b1b1b1b1-0000-4000-8000-0000000000b1');
const ACTIVE_INSTITUTION = '11111111-0000-4000-8000-000000000011' as InstitutionRef;
const RETIRED_INSTITUTION = '22222222-0000-4000-8000-000000000022' as InstitutionRef;
const UNKNOWN_INSTITUTION = '33333333-0000-4000-8000-000000000033' as InstitutionRef;
const NOW = new Date('2026-08-18T12:00:00.000Z');
const QAR = Currency.get('QAR');

const actorA1: AccountsPrincipal = { tenantId: TENANT_A, userId: USER_A1 };
/** A second person inside the SAME tenant — the isolation case tenant scoping alone misses. */
const actorA2: AccountsPrincipal = { tenantId: TENANT_A, userId: USER_A2 };
const actorB1: AccountsPrincipal = { tenantId: TENANT_B, userId: USER_B1 };

const clock = new Clock.Fixed(NOW);

function ownerKey(actor: AccountsPrincipal): string {
  return `${actor.tenantId}:${actor.userId}`;
}

/** Ownership-aware in-memory account store: capable of leaking, observed not to. */
class FakeAccountRepository implements FinancialAccountRepository {
  readonly rows = new Map<string, FinancialAccount>();
  private sequence = 0;

  constructor(private readonly snapshots: FakeSnapshotRepository) {}

  seed(account: FinancialAccount): FinancialAccount {
    this.rows.set(account.id, account);
    return account;
  }

  private visible(actor: AccountsPrincipal, account: FinancialAccount | undefined): boolean {
    return account !== undefined && ownerKey(actor) === `${account.tenantId}:${account.userId}`;
  }

  listOwn(actor: AccountsPrincipal): Promise<readonly FinancialAccount[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((row) => this.visible(actor, row))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
    );
  }

  findOwnById(
    actor: AccountsPrincipal,
    id: FinancialAccountId,
  ): Promise<FinancialAccount | null> {
    const row = this.rows.get(id);
    return Promise.resolve(this.visible(actor, row) && row !== undefined ? row : null);
  }

  create(actor: AccountsPrincipal, account: FinancialAccount): Promise<FinancialAccount> {
    this.sequence += 1;
    // The store binds the row to the acting principal, exactly as the RLS
    // WITH CHECK arm does — a fake that trusted the caller's ids would hide
    // the very defect this models.
    const bound: FinancialAccount = {
      ...account,
      tenantId: actor.tenantId,
      userId: actor.userId,
      createdAt: new Date(NOW.getTime() + this.sequence),
    };
    this.rows.set(bound.id, bound);
    return Promise.resolve(bound);
  }

  update(
    actor: AccountsPrincipal,
    expectedVersion: number,
    next: FinancialAccount,
  ): Promise<AccountUpdateOutcome> {
    const current = this.rows.get(next.id);
    if (!this.visible(actor, current) || current === undefined) {
      return Promise.resolve({ kind: 'not_found' });
    }
    if (current.version !== expectedVersion) return Promise.resolve({ kind: 'stale' });
    const stored: FinancialAccount = { ...next, createdAt: current.createdAt };
    this.rows.set(stored.id, stored);
    return Promise.resolve({ kind: 'updated', account: stored });
  }

  deleteOwn(
    actor: AccountsPrincipal,
    id: FinancialAccountId,
    expectedVersion: number,
  ): Promise<AccountDeleteOutcome> {
    const current = this.rows.get(id);
    if (!this.visible(actor, current) || current === undefined) {
      return Promise.resolve({ kind: 'not_found' });
    }
    if (current.version !== expectedVersion) return Promise.resolve({ kind: 'stale' });
    this.rows.delete(id);
    // The account store owns the cascade, exactly as ON DELETE CASCADE does
    // in the real schema — a fake that left the snapshots behind would let a
    // broken erasure path pass.
    const removed = this.snapshots.deleteForAccount(actor, id);
    return Promise.resolve({ kind: 'deleted', snapshotsDeleted: removed });
  }
}

class FakeSnapshotRepository implements BalanceSnapshotRepository {
  readonly rows: BalanceSnapshot[] = [];

  private visible(actor: AccountsPrincipal, row: BalanceSnapshot): boolean {
    return ownerKey(actor) === `${row.tenantId}:${row.userId}`;
  }

  seed(snapshot: BalanceSnapshot): BalanceSnapshot {
    this.rows.push(snapshot);
    return snapshot;
  }

  listForOwnAccount(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<readonly BalanceSnapshot[]> {
    return Promise.resolve(
      this.rows.filter((row) => this.visible(actor, row) && row.accountId === accountId),
    );
  }

  countForAccount(actor: AccountsPrincipal, accountId: FinancialAccountId): Promise<number> {
    return Promise.resolve(
      this.rows.filter((row) => this.visible(actor, row) && row.accountId === accountId).length,
    );
  }

  append(actor: AccountsPrincipal, snapshot: BalanceSnapshot): Promise<BalanceSnapshot> {
    const bound: BalanceSnapshot = {
      ...snapshot,
      tenantId: actor.tenantId,
      userId: actor.userId,
    };
    this.rows.push(bound);
    return Promise.resolve(bound);
  }

  deleteForAccount(actor: AccountsPrincipal, accountId: FinancialAccountId): number {
    const doomed = this.rows.filter(
      (row) => this.visible(actor, row) && row.accountId === accountId,
    );
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    return doomed.length;
  }
}

const institutionRows: readonly Institution[] = [
  {
    id: ACTIVE_INSTITUTION,
    code: 'QA_SYNTHETIC_TEST_ONE',
    displayNameEn: 'Synthetic Test Institution One',
    displayNameAr: 'مؤسسة اختبار اصطناعية واحد',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: RETIRED_INSTITUTION,
    code: 'QA_SYNTHETIC_TEST_TWO',
    displayNameEn: 'Synthetic Test Institution Two',
    displayNameAr: 'مؤسسة اختبار اصطناعية اثنان',
    status: 'RETIRED',
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const institutions: InstitutionCatalogueReader = {
  listSelectable: () =>
    Promise.resolve(institutionRows.filter((row) => row.status === 'ACTIVE')),
  findByRef: (ref) => Promise.resolve(institutionRows.find((row) => row.id === ref) ?? null),
};

class CountingIdSource implements IdSource {
  private next = 0;
  nextId(): string {
    this.next += 1;
    return `fa000000-0000-4000-8000-${String(this.next).padStart(12, '0')}`;
  }
}

let accountStore: FakeAccountRepository;
let snapshotStore: FakeSnapshotRepository;
let ids: CountingIdSource;

function wire(): {
  create: CreateManualAccount;
  list: ListOwnAccounts;
  read: ReadOwnAccount;
  update: UpdateOwnAccount;
  remove: DeleteOwnAccount;
  listSnapshots: ListOwnBalanceSnapshots;
} {
  snapshotStore = new FakeSnapshotRepository();
  accountStore = new FakeAccountRepository(snapshotStore);
  ids = new CountingIdSource();
  return {
    create: new CreateManualAccount(accountStore, institutions, ids, clock),
    list: new ListOwnAccounts(accountStore),
    read: new ReadOwnAccount(accountStore),
    update: new UpdateOwnAccount(accountStore, snapshotStore, institutions, clock),
    remove: new DeleteOwnAccount(accountStore),
    listSnapshots: new ListOwnBalanceSnapshots(accountStore, snapshotStore),
  };
}

const manualInput = {
  accountType: 'CURRENT' as const,
  currencyCode: 'QAR',
  displayName: 'Synthetic Test Account One',
  institutionRef: null,
  userSuppliedInstitutionLabel: null,
  mask: null,
};

describe('financial-accounts use cases: the principal is context, never input', () => {
  const useCaseDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'application',
    'use-cases',
  );

  it('no use-case input type declares a userId or tenantId field', () => {
    // Structural, because a comment saying "do not add an owner parameter" is
    // exactly the kind of instruction that stops being true. The moment an
    // owner id is an input, "read account X as user Y" becomes expressible.
    const offenders: string[] = [];
    for (const file of fs.readdirSync(useCaseDir).filter((name) => name.endsWith('.ts'))) {
      const source = fs.readFileSync(path.join(useCaseDir, file), 'utf8');
      for (const block of source.matchAll(
        /export\s+interface\s+(\w*Input)\s*\{([\s\S]*?)\n\}/g,
      )) {
        const [, name, body = ''] = block;
        // Strip comments so prose about the rule does not read as a field.
        const fields = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        for (const forbidden of ['userId', 'tenantId', 'ownerId', 'subjectId']) {
          if (new RegExp(`\\b${forbidden}\\s*\\??\\s*:`).test(fields)) {
            offenders.push(`${file}:${name}.${forbidden}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('at least one input type was actually scanned, so the check cannot pass vacuously', () => {
    const names = fs
      .readdirSync(useCaseDir)
      .filter((name) => name.endsWith('.ts'))
      .flatMap((file) => [
        ...fs
          .readFileSync(path.join(useCaseDir, file), 'utf8')
          .matchAll(/export\s+interface\s+(\w*Input)\s*\{/g),
      ])
      .map((match) => match[1]);
    expect(names.length).toBeGreaterThanOrEqual(4);
  });

  it('every use case fails closed on an incomplete principal', async () => {
    const { list, read, create, update, remove, listSnapshots } = wire();
    const broken = { tenantId: TENANT_A } as unknown as AccountsPrincipal;
    const id = 'fa000000-0000-4000-8000-000000000001' as FinancialAccountId;

    const outcomes = await Promise.all([
      list.execute(broken),
      read.execute({ accountId: id }, broken),
      create.execute(manualInput, broken),
      update.execute({ accountId: id, expectedVersion: 1, displayName: 'x' }, broken),
      remove.execute({ accountId: id, expectedVersion: 1 }, broken),
      listSnapshots.execute({ accountId: id }, broken),
    ]);
    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.kind).toBe('missing_principal_context');
    }
  });
});

describe('financial-accounts use cases: create, read, list', () => {
  it('creates a manual account bound to the acting principal, ACTIVE at version 1', async () => {
    const { create } = wire();
    const created = await create.execute(manualInput, actorA1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.tenantId).toBe(TENANT_A);
    expect(created.value.userId).toBe(USER_A1);
    expect(created.value.sourceKind).toBe('MANUAL');
    expect(created.value.status).toBe('ACTIVE');
    expect(created.value.version).toBe(1);
    expect(created.value.providerConnectionRef).toBeNull();
    expect(created.value.currency.code).toBe('QAR');
  });

  it('NON-EMPTY FIRST: the owner sees their own accounts, and nobody else does', async () => {
    const { create, list } = wire();
    await create.execute(manualInput, actorA1);
    await create.execute({ ...manualInput, displayName: 'Synthetic Test Account Two' }, actorA1);

    const own = await list.execute(actorA1);
    expect(own.ok).toBe(true);
    if (own.ok) expect(own.value).toHaveLength(2);

    // Same tenant, different person: tenant scoping alone would show these.
    const neighbour = await list.execute(actorA2);
    expect(neighbour.ok).toBe(true);
    if (neighbour.ok) expect(neighbour.value).toHaveLength(0);

    const otherTenant = await list.execute(actorB1);
    expect(otherTenant.ok).toBe(true);
    if (otherTenant.ok) expect(otherTenant.value).toHaveLength(0);
  });

  it('a guessed id, a neighbour account, and another tenant all answer the SAME not-found', async () => {
    const { create, read } = wire();
    const created = await create.execute(manualInput, actorA1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const guessed = await read.execute(
      { accountId: '00000000-0000-4000-8000-000000000000' as FinancialAccountId },
      actorA1,
    );
    const neighbour = await read.execute({ accountId: created.value.id }, actorA2);
    const otherTenant = await read.execute({ accountId: created.value.id }, actorB1);

    for (const outcome of [guessed, neighbour, otherTenant]) {
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.kind).toBe('account_not_found');
    }
    // Identical messages: any difference would be an oracle.
    const messages = new Set(
      [guessed, neighbour, otherTenant].map((outcome) =>
        outcome.ok ? 'ok' : outcome.error.message,
      ),
    );
    expect(messages.size).toBe(1);
  });

  it('refuses an institution that is unknown or no longer selectable', async () => {
    const { create } = wire();
    const unknown = await create.execute(
      { ...manualInput, institutionRef: UNKNOWN_INSTITUTION },
      actorA1,
    );
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.kind).toBe('institution_not_selectable');

    const retired = await create.execute(
      { ...manualInput, institutionRef: RETIRED_INSTITUTION },
      actorA1,
    );
    expect(retired.ok).toBe(false);
    if (!retired.ok) expect(retired.error.kind).toBe('institution_not_selectable');

    const active = await create.execute(
      { ...manualInput, institutionRef: ACTIVE_INSTITUTION },
      actorA1,
    );
    expect(active.ok).toBe(true);
  });

  it('an unlisted institution is recorded as the label the subject typed', async () => {
    const { create } = wire();
    const created = await create.execute(
      { ...manualInput, userSuppliedInstitutionLabel: 'Synthetic Unlisted Institution' },
      actorA1,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.institutionRef).toBeNull();
    expect(created.value.userSuppliedInstitutionLabel).toBe('Synthetic Unlisted Institution');
  });

  it('surfaces a domain rule refusal rather than storing a full number', async () => {
    const { create } = wire();
    const refused = await create.execute({ ...manualInput, mask: '4111111111111111' }, actorA1);
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'rule_violated') {
      expect(refused.error.violation.kind).toBe('mask_not_a_mask');
    } else {
      expect.unreachable('expected a rule violation');
    }
    expect(accountStore.rows.size).toBe(0);
  });

  it('refuses an unsupported currency as a rule violation, not a throw', async () => {
    const { create } = wire();
    const refused = await create.execute({ ...manualInput, currencyCode: 'XYZ' }, actorA1);
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'rule_violated') {
      expect(refused.error.violation.kind).toBe('unsupported_currency');
    } else {
      expect.unreachable('expected a rule violation');
    }
  });
});

describe('financial-accounts use cases: update', () => {
  it('renames the caller own account and moves the version by exactly one', async () => {
    const { create, update } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const renamed = await update.execute(
      {
        accountId: created.value.id,
        expectedVersion: created.value.version,
        displayName: 'Synthetic Test Account Renamed',
      },
      actorA1,
    );
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.value.displayName).toBe('Synthetic Test Account Renamed');
      expect(renamed.value.version).toBe(2);
    }
  });

  it('reports a version conflict instead of overwriting a concurrent edit', async () => {
    const { create, update } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const first = await update.execute(
      { accountId: created.value.id, expectedVersion: 1, displayName: 'First Device Edit' },
      actorA1,
    );
    expect(first.ok).toBe(true);

    const stale = await update.execute(
      { accountId: created.value.id, expectedVersion: 1, displayName: 'Second Device Edit' },
      actorA1,
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.kind).toBe('version_conflict');
    // The first edit survived: nothing was silently overwritten.
    expect(accountStore.rows.get(created.value.id)?.displayName).toBe('First Device Edit');
  });

  it('cannot update a neighbour account inside the same tenant', async () => {
    const { create, update } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const crossUser = await update.execute(
      { accountId: created.value.id, expectedVersion: 1, displayName: 'Taken Over' },
      actorA2,
    );
    expect(crossUser.ok).toBe(false);
    if (!crossUser.ok) expect(crossUser.error.kind).toBe('account_not_found');
    expect(accountStore.rows.get(created.value.id)?.displayName).toBe(
      'Synthetic Test Account One',
    );
  });

  it('permits a currency correction on an empty account and refuses it once a balance exists', async () => {
    const { create, update } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const corrected = await update.execute(
      { accountId: created.value.id, expectedVersion: 1, currencyCode: 'KWD' },
      actorA1,
    );
    expect(corrected.ok).toBe(true);
    if (corrected.ok) expect(corrected.value.currency.code).toBe('KWD');

    await snapshotStore.append(actorA1, {
      id: 'b5000000-0000-4000-8000-0000000000b1' as BalanceSnapshotId,
      tenantId: TENANT_A,
      userId: USER_A1,
      accountId: created.value.id,
      amount: Money.of(1_000n, Currency.get('KWD')),
      asOf: NOW,
      sourceKind: 'MANUAL',
      sourceReference: 'synthetic-test-fixture' as SourceReference,
      capturedAt: NOW,
      createdAt: NOW,
    });

    const refused = await update.execute(
      { accountId: created.value.id, expectedVersion: 2, currencyCode: 'QAR' },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'rule_violated') {
      expect(refused.error.violation.kind).toBe('currency_immutable_with_records');
    } else {
      expect.unreachable('expected the currency-immutability rule to refuse');
    }
  });
});

describe('financial-accounts use cases: delete is first class and cannot cross a user', () => {
  it('deletes the caller own account and reports what the cascade removed', async () => {
    const { create, remove, list } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    for (const suffix of ['b1', 'b2']) {
      await snapshotStore.append(actorA1, {
        id: `b5000000-0000-4000-8000-0000000000${suffix}` as BalanceSnapshotId,
        tenantId: TENANT_A,
        userId: USER_A1,
        accountId: created.value.id,
        amount: Money.of(12_345n, QAR),
        asOf: NOW,
        sourceKind: 'MANUAL',
        sourceReference: 'synthetic-test-fixture' as SourceReference,
        capturedAt: NOW,
        createdAt: NOW,
      });
    }

    const deleted = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.value.accountId).toBe(created.value.id);
      expect(deleted.value.snapshotsDeleted).toBe(2);
    }
    const remaining = await list.execute(actorA1);
    if (remaining.ok) expect(remaining.value).toHaveLength(0);
    expect(snapshotStore.rows).toHaveLength(0);
  });

  it('a neighbour and another tenant cannot delete it, and it survives their attempts', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    for (const intruder of [actorA2, actorB1]) {
      const refused = await remove.execute(
        { accountId: created.value.id, expectedVersion: 1 },
        intruder,
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');
    }
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });

  it('refuses to delete at a stale version, because a delete is not recoverable', async () => {
    const { create, update, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    await update.execute(
      { accountId: created.value.id, expectedVersion: 1, displayName: 'Edited Elsewhere' },
      actorA1,
    );

    const stale = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.kind).toBe('version_conflict');
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });
});

describe('financial-accounts use cases: balance snapshots', () => {
  it('returns the reported snapshots for the caller own account, unchanged', async () => {
    const { create, listSnapshots } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    await snapshotStore.append(actorA1, {
      id: 'b5000000-0000-4000-8000-0000000000b1' as BalanceSnapshotId,
      tenantId: TENANT_A,
      userId: USER_A1,
      accountId: created.value.id,
      amount: Money.of(-123_456n, QAR),
      asOf: NOW,
      sourceKind: 'MANUAL',
      sourceReference: 'synthetic-test-fixture' as SourceReference,
      capturedAt: NOW,
      createdAt: NOW,
    });

    const listed = await listSnapshots.execute({ accountId: created.value.id }, actorA1);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.value).toHaveLength(1);
      expect(listed.value[0]?.amount.minorUnits).toBe(-123_456n);
    }
  });

  it('an owner with no snapshots gets an empty list, NOT a not-found', async () => {
    // The distinction matters: inferring not-found from emptiness would tell a
    // legitimate owner their account does not exist.
    const { create, listSnapshots } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const listed = await listSnapshots.execute({ accountId: created.value.id }, actorA1);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value).toHaveLength(0);
  });

  it('a neighbour asking for the same account gets not-found, not an empty list', async () => {
    const { create, listSnapshots } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const listed = await listSnapshots.execute({ accountId: created.value.id }, actorA2);
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.kind).toBe('account_not_found');
  });
});
