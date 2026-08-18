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
import type {
  FinancialAccountRetentionDecisionPort,
  FinancialRetentionDecision,
  RetentionGovernedDataset,
} from '../application/ports/financial-account-retention-decision.js';
import type {
  AccountSourceLinkEraserPort,
  AccountSourceLinkErasureOutcome,
} from '../application/ports/account-source-link-eraser.js';
import type {
  FinancialRecordEraserPort,
  FinancialRecordErasureCounts,
  FinancialRecordErasureOutcome,
} from '../application/ports/financial-record-eraser.js';
import { NO_RECORDS_ERASED } from '../application/ports/financial-record-eraser.js';
import type {
  PaymentInstrumentEraserPort,
  PaymentInstrumentErasureOutcome,
} from '../application/ports/payment-instrument-eraser.js';
import type {
  FinancialRecordPresence,
  FinancialRecordPresencePort,
} from '../application/ports/financial-record-presence.js';
import type { IdSource } from '../application/ports/id-source.js';
import type { InstitutionCatalogueReader } from '../application/ports/institution-catalogue-reader.js';
import type { AccountsPrincipal } from '../application/principal.js';
import { CreateManualAccount } from '../application/use-cases/create-manual-account.js';
import { DeleteOwnAccount } from '../application/use-cases/delete-own-account.js';
import { ListOwnAccounts } from '../application/use-cases/list-own-accounts.js';
import { ListOwnBalanceSnapshots } from '../application/use-cases/list-own-balance-snapshots.js';
import { ReadOwnAccount } from '../application/use-cases/read-own-account.js';
import { RecordReportedBalance } from '../application/use-cases/record-reported-balance.js';
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
import {
  ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE,
  ACCOUNT_SYNTHETIC_PERIOD,
  SYNTHETIC_RETENTION_MARKER,
} from '@karar/financial-retention-local-fixtures';

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
/** A UUID, because migration 0089 makes the column one. Obviously synthetic. */
const SYNTHETIC_SOURCE_REFERENCE = '5e000000-0000-4000-8000-00000000005e' as SourceReference;

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
  #countFailure: Error | null = null;

  /** Lets a test make this store go silent, to prove the rule fails closed. */
  failCountWith(error: Error): void {
    this.#countFailure = error;
  }

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
    if (this.#countFailure !== null) return Promise.reject(this.#countFailure);
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


/**
 * A retention provider under test control. `DECIDED` is the labelled-synthetic
 * answer the LOCAL fixture gives; every other state is the answer a deployment
 * without a reviewed decision must get, and the gate has to refuse all of them.
 */
class ScriptedRetentionDecisionPort implements FinancialAccountRetentionDecisionPort {
  readonly asked: RetentionGovernedDataset[] = [];
  #decision: (dataset: RetentionGovernedDataset) => FinancialRetentionDecision;
  #throws: Error | null = null;

  constructor() {
    this.#decision = (dataset) => ({
      state: 'DECIDED',
      dataset,
      retentionPeriod: ACCOUNT_SYNTHETIC_PERIOD,
      basis: `${SYNTHETIC_RETENTION_MARKER}: test fixture, not a legal opinion`,
      approvalReference: ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE,
      packVersion: `synthetic-test/${SYNTHETIC_RETENTION_MARKER}`,
    });
  }

  answer(decision: (dataset: RetentionGovernedDataset) => FinancialRetentionDecision): void {
    this.#decision = decision;
    this.#throws = null;
  }

  failWith(error: Error): void {
    this.#throws = error;
  }

  decideFor(
    _actor: AccountsPrincipal,
    dataset: RetentionGovernedDataset,
  ): Promise<FinancialRetentionDecision> {
    this.asked.push(dataset);
    if (this.#throws !== null) return Promise.reject(this.#throws);
    return Promise.resolve(this.#decision(dataset));
  }
}

/**
 * A monotonic counter the two erasure fakes stamp themselves with, so a test
 * can assert WHICH ran first. Reset by `wire()`.
 */
let callOrdinal = 0;
function nextCallOrdinal(): number {
  callOrdinal += 1;
  return callOrdinal;
}

/**
 * Stands in for the transactions module. OWNERSHIP-AWARE like the other
 * fakes: records are keyed on (tenant, user, account), so a neighbour's
 * transaction is invisible rather than merely filtered — which is what lets
 * the "another user's transaction does not freeze my currency" case actually
 * fail if the use case ever asked the wrong question.
 */
class FakeFinancialRecordStore
  implements FinancialRecordPresencePort, FinancialRecordEraserPort
{
  readonly rows: Array<{ owner: string; accountId: FinancialAccountId }> = [];
  erasedAt: number | null = null;
  #presenceFailure: Error | null = null;
  #erasure: ((accountId: FinancialAccountId) => FinancialRecordErasureOutcome) | null = null;
  #eraserFailure: Error | null = null;

  seed(actor: AccountsPrincipal, accountId: FinancialAccountId, count = 1): void {
    for (let i = 0; i < count; i += 1) this.rows.push({ owner: ownerKey(actor), accountId });
  }

  failPresenceWith(error: Error): void {
    this.#presenceFailure = error;
  }

  /** Setting one erasure behaviour clears the other: a fake with two live
   *  moods is a fake nobody can reason about. */
  eraseWith(outcome: (accountId: FinancialAccountId) => FinancialRecordErasureOutcome): void {
    this.#erasure = outcome;
    this.#eraserFailure = null;
  }

  failErasureWith(error: Error): void {
    this.#eraserFailure = error;
    this.#erasure = null;
  }

  private own(actor: AccountsPrincipal, accountId: FinancialAccountId) {
    return this.rows.filter(
      (row) => row.owner === ownerKey(actor) && row.accountId === accountId,
    );
  }

  hasAnyRecordForAccount(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<FinancialRecordPresence> {
    if (this.#presenceFailure !== null) return Promise.reject(this.#presenceFailure);
    return Promise.resolve({ accountId, hasAnyRecord: this.own(actor, accountId).length > 0 });
  }

  eraseAccountScopedRecords(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<FinancialRecordErasureOutcome> {
    this.erasedAt = nextCallOrdinal();
    if (this.#eraserFailure !== null) return Promise.reject(this.#eraserFailure);
    if (this.#erasure !== null) return Promise.resolve(this.#erasure(accountId));
    const doomed = this.own(actor, accountId);
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    const deleted: FinancialRecordErasureCounts = {
      ...NO_RECORDS_ERASED,
      FINANCIAL_RECORD: doomed.length,
    };
    return Promise.resolve({ kind: 'erased', deleted });
  }
}

/**
 * Stands in for the financial-connections module. OWNERSHIP-AWARE like the
 * others: links are keyed on (tenant, user, account), so a neighbour's link
 * is invisible rather than merely filtered.
 *
 * `erasedAt` records the call order against the record store, because the
 * ordering is a contract and not an implementation detail: the source link is
 * the route by which new records arrive, so it is cut BEFORE the records that
 * travel down it (see `delete-own-account.ts`). Nothing else in this suite
 * could observe that, and an ordering nobody checks is an ordering that drifts.
 */
class FakeAccountSourceLinkStore implements AccountSourceLinkEraserPort {
  readonly rows: Array<{ owner: string; accountId: FinancialAccountId }> = [];
  erasedAt: number | null = null;
  #outcome: ((accountId: FinancialAccountId) => AccountSourceLinkErasureOutcome) | null = null;
  #failure: Error | null = null;

  seed(actor: AccountsPrincipal, accountId: FinancialAccountId, count = 1): void {
    for (let i = 0; i < count; i += 1) this.rows.push({ owner: ownerKey(actor), accountId });
  }

  /** Setting one behaviour clears the other: a fake with two live moods is a
   *  fake nobody can reason about. */
  eraseWith(outcome: (accountId: FinancialAccountId) => AccountSourceLinkErasureOutcome): void {
    this.#outcome = outcome;
    this.#failure = null;
  }

  failErasureWith(error: Error): void {
    this.#failure = error;
    this.#outcome = null;
  }

  eraseAccountSourceLinks(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<AccountSourceLinkErasureOutcome> {
    this.erasedAt = nextCallOrdinal();
    if (this.#failure !== null) return Promise.reject(this.#failure);
    if (this.#outcome !== null) return Promise.resolve(this.#outcome(accountId));
    const doomed = this.rows.filter(
      (row) => row.owner === ownerKey(actor) && row.accountId === accountId,
    );
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve({ kind: 'erased', accountSourceLinksDeleted: doomed.length });
  }
}

/**
 * Stands in for the payment-instruments module. OWNERSHIP-AWARE like the
 * others: instruments are keyed on (tenant, user, account), so a neighbour's
 * card is invisible rather than merely filtered.
 *
 * `erasedAt` records the call order against the other two stores, because the
 * ordering is a contract and not an implementation detail. An instrument is a
 * way to SPEND from the account, so it is cut after the source link — the only
 * one of the two that can put a row in the database — and before the records,
 * which are the part a retry cannot rebuild. Nothing else in this suite could
 * observe that, and an ordering nobody checks is an ordering that drifts.
 */
class FakePaymentInstrumentStore implements PaymentInstrumentEraserPort {
  readonly rows: Array<{ owner: string; accountId: FinancialAccountId }> = [];
  erasedAt: number | null = null;
  #outcome: ((accountId: FinancialAccountId) => PaymentInstrumentErasureOutcome) | null = null;
  #failure: Error | null = null;

  seed(actor: AccountsPrincipal, accountId: FinancialAccountId, count = 1): void {
    for (let i = 0; i < count; i += 1) this.rows.push({ owner: ownerKey(actor), accountId });
  }

  /** Setting one behaviour clears the other: a fake with two live moods is a
   *  fake nobody can reason about. */
  eraseWith(outcome: (accountId: FinancialAccountId) => PaymentInstrumentErasureOutcome): void {
    this.#outcome = outcome;
    this.#failure = null;
  }

  failErasureWith(error: Error): void {
    this.#failure = error;
    this.#outcome = null;
  }

  erasePaymentInstruments(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<PaymentInstrumentErasureOutcome> {
    this.erasedAt = nextCallOrdinal();
    if (this.#failure !== null) return Promise.reject(this.#failure);
    if (this.#outcome !== null) return Promise.resolve(this.#outcome(accountId));
    const doomed = this.rows.filter(
      (row) => row.owner === ownerKey(actor) && row.accountId === accountId,
    );
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve({ kind: 'erased', paymentInstrumentsDeleted: doomed.length });
  }
}

const institutionRows: readonly Institution[] = [
  {
    id: ACTIVE_INSTITUTION,
    code: 'QA_SYNTHETIC_TEST_ONE',
    kind: 'BANK',
    displayNameEn: 'Synthetic Test Institution One',
    displayNameAr: 'مؤسسة اختبار اصطناعية واحد',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: RETIRED_INSTITUTION,
    code: 'QA_SYNTHETIC_TEST_TWO',
    kind: 'MOBILE_MONEY_OPERATOR',
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
let recordStore: FakeFinancialRecordStore;
let sourceLinkStore: FakeAccountSourceLinkStore;
let instrumentStore: FakePaymentInstrumentStore;
let retention: ScriptedRetentionDecisionPort;
let ids: CountingIdSource;

function wire(): {
  create: CreateManualAccount;
  list: ListOwnAccounts;
  read: ReadOwnAccount;
  update: UpdateOwnAccount;
  remove: DeleteOwnAccount;
  listSnapshots: ListOwnBalanceSnapshots;
  recordBalance: RecordReportedBalance;
} {
  callOrdinal = 0;
  snapshotStore = new FakeSnapshotRepository();
  accountStore = new FakeAccountRepository(snapshotStore);
  recordStore = new FakeFinancialRecordStore();
  sourceLinkStore = new FakeAccountSourceLinkStore();
  instrumentStore = new FakePaymentInstrumentStore();
  retention = new ScriptedRetentionDecisionPort();
  ids = new CountingIdSource();
  return {
    create: new CreateManualAccount(accountStore, institutions, retention, ids, clock),
    list: new ListOwnAccounts(accountStore),
    read: new ReadOwnAccount(accountStore),
    update: new UpdateOwnAccount(
      accountStore,
      snapshotStore,
      recordStore,
      institutions,
      clock,
    ),
    remove: new DeleteOwnAccount(accountStore, recordStore, sourceLinkStore, instrumentStore),
    listSnapshots: new ListOwnBalanceSnapshots(accountStore, snapshotStore),
    recordBalance: new RecordReportedBalance(
      accountStore,
      snapshotStore,
      retention,
      ids,
      clock,
    ),
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
    const { list, read, create, update, remove, listSnapshots, recordBalance } = wire();
    const broken = { tenantId: TENANT_A } as unknown as AccountsPrincipal;
    const id = 'fa000000-0000-4000-8000-000000000001' as FinancialAccountId;

    const outcomes = await Promise.all([
      list.execute(broken),
      read.execute({ accountId: id }, broken),
      create.execute(manualInput, broken),
      update.execute({ accountId: id, expectedVersion: 1, displayName: 'x' }, broken),
      remove.execute({ accountId: id, expectedVersion: 1 }, broken),
      listSnapshots.execute({ accountId: id }, broken),
      recordBalance.execute(
        {
          accountId: id,
          amount: Money.of(1_000n, QAR),
          asOf: NOW,
          balanceKind: 'BOOKED',
          sourceReference: SYNTHETIC_SOURCE_REFERENCE,
        },
        broken,
      ),
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
    expect(created.value.origin).toBe('MANUAL');
    expect(created.value.status).toBe('ACTIVE');
    expect(created.value.version).toBe(1);
    expect(created.value.currency.code).toBe('QAR');
    // Unstated nature is UNKNOWN, deliberately not ASSET: an account nobody
    // has classified must never be silently counted as money the person has.
    expect(created.value.nature).toBe('UNKNOWN');
    expect(created.value.walletKind).toBeNull();
  });

  it('a wallet must say which kind it is, and a non-wallet must not claim one', async () => {
    const { create } = wire();
    const undescribed = await create.execute(
      { ...manualInput, accountType: 'WALLET', displayName: 'Synthetic Test Wallet' },
      actorA1,
    );
    expect(undescribed.ok).toBe(false);
    if (!undescribed.ok) expect(undescribed.error.kind).toBe('rule_violated');

    const contradiction = await create.execute(
      { ...manualInput, accountType: 'CURRENT', walletKind: 'E_MONEY' },
      actorA1,
    );
    expect(contradiction.ok).toBe(false);

    const wallet = await create.execute(
      {
        ...manualInput,
        accountType: 'WALLET',
        walletKind: 'MOBILE_MONEY',
        nature: 'ASSET',
        displayName: 'Synthetic Test Wallet',
      },
      actorA1,
    );
    expect(wallet.ok).toBe(true);
    if (wallet.ok) {
      expect(wallet.value.walletKind).toBe('MOBILE_MONEY');
      expect(wallet.value.nature).toBe('ASSET');
    }
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
    expect(created.value.userSuppliedInstitutionLabel?.reveal()).toBe(
      'Synthetic Unlisted Institution',
    );
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
      expect(renamed.value.displayName.reveal()).toBe('Synthetic Test Account Renamed');
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
    expect(accountStore.rows.get(created.value.id)?.displayName.reveal()).toBe('First Device Edit');
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
    expect(accountStore.rows.get(created.value.id)?.displayName.reveal()).toBe(
      'Synthetic Test Account One',
    );
  });

  it('leaves the currency alone when no currency change was asked for, without asking anyone', async () => {
    // The cross-module question costs a round trip and reveals that an
    // account was touched. An edit that cannot change the currency has no
    // business asking it.
    const { create, update } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.failPresenceWith(new Error('this port must not be called'));

    const renamed = await update.execute(
      { accountId: created.value.id, expectedVersion: 1, displayName: 'Renamed Only' },
      actorA1,
    );
    expect(renamed.ok).toBe(true);
  });
});

/**
 * The currency-immutability rule, case by case.
 *
 * Stored minor units are scaled by their currency's exponent, so
 * re-denominating an account that holds records multiplies or divides every
 * historical figure by ten between a two-decimal and a three-decimal currency
 * — silently, and with nothing on screen to tell the person it happened. The
 * rule used to consult balance snapshots alone; a transaction is just as much
 * a financial record and lives in another module, which is what
 * `FinancialRecordPresencePort` is for.
 */
describe('financial-accounts use cases: currency immutability, in every case that decides it', () => {
  async function accountFor(create: CreateManualAccount): Promise<FinancialAccount> {
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) throw new Error('fixture create failed');
    return created.value;
  }

  function snapshotFor(accountId: FinancialAccountId, suffix: string): Promise<BalanceSnapshot> {
    return snapshotStore.append(actorA1, {
      id: `b5000000-0000-4000-8000-0000000000${suffix}` as BalanceSnapshotId,
      tenantId: TENANT_A,
      userId: USER_A1,
      accountId,
      amount: Money.of(1_000n, QAR),
      asOf: NOW,
      sourceKind: 'MANUAL',
      balanceKind: 'BOOKED',
      sourceReference: SYNTHETIC_SOURCE_REFERENCE,
      capturedAt: NOW,
      createdAt: NOW,
    });
  }

  async function changeCurrency(update: UpdateOwnAccount, account: FinancialAccount) {
    return update.execute(
      { accountId: account.id, expectedVersion: account.version, currencyCode: 'KWD' },
      actorA1,
    );
  }

  it('1. an empty account may be corrected: nobody is harmed by fixing a mistyped currency', async () => {
    const { create, update } = wire();
    const account = await accountFor(create);
    const corrected = await changeCurrency(update, account);
    expect(corrected.ok).toBe(true);
    if (corrected.ok) expect(corrected.value.currency.code).toBe('KWD');
  });

  it('2. a balance snapshot freezes it', async () => {
    const { create, update } = wire();
    const account = await accountFor(create);
    await snapshotFor(account.id, 'c1');

    const refused = await changeCurrency(update, account);
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'rule_violated') {
      expect(refused.error.violation.kind).toBe('currency_immutable_with_records');
    } else {
      expect.unreachable('expected the currency-immutability rule to refuse');
    }
    expect(accountStore.rows.get(account.id)?.currency.code).toBe('QAR');
  });

  it('3. a TRANSACTION freezes it, with no snapshot anywhere — the case that was missing', async () => {
    const { create, update } = wire();
    const account = await accountFor(create);
    recordStore.seed(actorA1, account.id);
    expect(await snapshotStore.countForAccount(actorA1, account.id)).toBe(0);

    const refused = await changeCurrency(update, account);
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'rule_violated') {
      expect(refused.error.violation.kind).toBe('currency_immutable_with_records');
    } else {
      expect.unreachable('a transaction is a financial record and must freeze the currency');
    }
    expect(accountStore.rows.get(account.id)?.currency.code).toBe('QAR');
  });

  it('4. both a snapshot and a transaction freeze it', async () => {
    const { create, update } = wire();
    const account = await accountFor(create);
    await snapshotFor(account.id, 'c2');
    recordStore.seed(actorA1, account.id);

    const refused = await changeCurrency(update, account);
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'rule_violated') {
      expect(refused.error.violation.kind).toBe('currency_immutable_with_records');
    } else {
      expect.unreachable('expected the currency-immutability rule to refuse');
    }
  });

  it("5. another user's transaction does not freeze the caller's account", async () => {
    // The port is principal-scoped. If it ever answered across subjects, a
    // neighbour's activity would block a correction the owner is entitled to
    // make — and a leak in that direction is as real as a leak the other way.
    const { create, update } = wire();
    const account = await accountFor(create);
    recordStore.seed(actorA2, account.id, 3);
    recordStore.seed(actorB1, account.id, 3);

    const corrected = await changeCurrency(update, account);
    expect(corrected.ok).toBe(true);
    if (corrected.ok) expect(corrected.value.currency.code).toBe('KWD');
  });

  it('6. a store that cannot answer fails CLOSED, and says so honestly', async () => {
    const { create, update } = wire();
    const account = await accountFor(create);
    recordStore.failPresenceWith(new Error('synthetic record-store outage'));

    const refused = await changeCurrency(update, account);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      // NOT `currency_immutable_with_records`: asserting that records exist
      // when the question went unanswered would be inventing a fact.
      expect(refused.error.kind).toBe('record_presence_unavailable');
    }
    expect(accountStore.rows.get(account.id)?.currency.code).toBe('QAR');
  });

  it('6b. the same failure on the snapshot half also fails closed', async () => {
    const { create, update } = wire();
    const account = await accountFor(create);
    snapshotStore.failCountWith(new Error('synthetic snapshot-store outage'));

    const refused = await changeCurrency(update, account);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('record_presence_unavailable');
    expect(accountStore.rows.get(account.id)?.currency.code).toBe('QAR');
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
        balanceKind: 'BOOKED',
        sourceReference: SYNTHETIC_SOURCE_REFERENCE,
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
      expect(deleted.value.recordsDeleted).toEqual(NO_RECORDS_ERASED);
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
      balanceKind: 'BOOKED',
      sourceReference: SYNTHETIC_SOURCE_REFERENCE,
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

/**
 * The retention gate.
 *
 * Migration 0088, migration 0089, MODULE.md and DATA_LIFECYCLE.md all say
 * durable financial creation fails closed while the retention decision is
 * unresolved. Until this gate existed that was a paragraph: `CreateManualAccount`
 * asked nothing and wrote unconditionally. The assertion that matters in every
 * case below is the same one — ZERO durable rows after a refusal.
 */
describe('financial-accounts use cases: durable creation fails closed on retention', () => {
  const unresolvedDecisions: ReadonlyArray<
    readonly [string, (dataset: RetentionGovernedDataset) => FinancialRetentionDecision]
  > = [
    [
      'PENDING_LEGAL_REVIEW',
      (dataset) => ({
        state: 'PENDING_LEGAL_REVIEW',
        dataset,
        reason: 'the financial-data retention question is with legal review',
        packVersion: 'synthetic-test/pending',
      }),
    ],
    [
      'UNAVAILABLE',
      (dataset) => ({
        state: 'UNAVAILABLE',
        dataset,
        reason: 'no policy pack is bound for this tenant',
      }),
    ],
    [
      // Structurally impossible for a subject's own financial records, and
      // therefore a refusal: a provider answering this has a defect, and
      // reading it as permission would be the failure the gate exists for.
      'NOT_APPLICABLE',
      (dataset) => ({
        state: 'NOT_APPLICABLE',
        dataset,
        reason: 'claims retention law does not reach a subject financial dataset',
      }),
    ],
    [
      // A period with no evidence behind it. Absence of evidence means not
      // approved, so DECIDED alone is not enough.
      'DECIDED with no approval evidence',
      (dataset) => ({
        state: 'DECIDED',
        dataset,
        retentionPeriod: 'P7Y',
        basis: 'someone typed a duration',
        approvalReference: '',
        packVersion: 'synthetic-test/unevidenced',
      }),
    ],
  ];

  for (const [label, decision] of unresolvedDecisions) {
    it(`refuses account creation and writes ZERO rows when retention is ${label}`, async () => {
      const { create, list } = wire();
      retention.answer(decision);

      const refused = await create.execute(manualInput, actorA1);
      expect(refused.ok).toBe(false);
      if (!refused.ok) {
        expect(refused.error.kind).toBe('retention_unresolved');
        if (refused.error.kind === 'retention_unresolved') {
          expect(refused.error.dataset).toBe('financial_accounts');
        }
      }
      // Zero durable rows: nothing in the account store, nothing in the
      // snapshot store, and no identifier was even minted.
      expect(accountStore.rows.size).toBe(0);
      expect(snapshotStore.rows).toHaveLength(0);
      const listed = await list.execute(actorA1);
      expect(listed.ok && listed.value).toHaveLength(0);
    });
  }

  it('refuses a reported balance and writes ZERO rows when retention is unresolved', async () => {
    const { create, recordBalance } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    retention.answer((dataset) => ({
      state: 'PENDING_LEGAL_REVIEW',
      dataset,
      reason: 'the financial-data retention question is with legal review',
      packVersion: 'synthetic-test/pending',
    }));

    const refused = await recordBalance.execute(
      {
        accountId: created.value.id,
        amount: Money.of(1_000n, QAR),
        asOf: NOW,
        balanceKind: 'BOOKED',
        sourceReference: SYNTHETIC_SOURCE_REFERENCE,
      },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'retention_unresolved') {
      expect(refused.error.dataset).toBe('financial_account_balance_snapshots');
    } else {
      expect.unreachable('expected the retention gate to refuse');
    }
    expect(snapshotStore.rows).toHaveLength(0);
  });

  it('asks BEFORE reading the catalogue or minting an id, so a refusal touches nothing', async () => {
    wire(); // for the stores and the scripted port; the use case is built below

    retention.answer((dataset) => ({
      state: 'UNAVAILABLE',
      dataset,
      reason: 'no policy pack is bound',
    }));
    // A named institution would normally be resolved before the insert; the
    // gate runs first, so even that read does not happen.
    let catalogueReads = 0;
    const counting: InstitutionCatalogueReader = {
      listSelectable: () => institutions.listSelectable(),
      findByRef: (ref) => {
        catalogueReads += 1;
        return institutions.findByRef(ref);
      },
    };
    const gated = new CreateManualAccount(accountStore, counting, retention, ids, clock);

    const refused = await gated.execute(
      { ...manualInput, institutionRef: ACTIVE_INSTITUTION },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    expect(catalogueReads).toBe(0);
    expect(accountStore.rows.size).toBe(0);
  });

  it('a provider that throws is a defect, not an unresolved decision', async () => {
    // The two are different: "we have not decided" is a policy state a caller
    // can act on; a throwing provider is broken infrastructure. Collapsing
    // them would send someone to legal for a connection timeout.
    const { create } = wire();
    retention.failWith(new Error('synthetic policy-pack outage'));

    const refused = await create.execute(manualInput, actorA1);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('store_failure');
    expect(accountStore.rows.size).toBe(0);
  });

  it('the LOCAL fixture answer is accepted, and carries its no-legal-effect label', async () => {
    const { create } = wire();
    const created = await create.execute(manualInput, actorA1);
    expect(created.ok).toBe(true);
    expect(retention.asked).toEqual(['financial_accounts']);

    const decision = await retention.decideFor(actorA1, 'financial_accounts');
    expect(decision.state).toBe('DECIDED');
    if (decision.state === 'DECIDED') {
      expect(decision.basis).toContain(SYNTHETIC_RETENTION_MARKER);
      expect(decision.approvalReference).toContain(SYNTHETIC_RETENTION_MARKER);
    }
  });
});

/**
 * Deletion erases the records other modules hold, or it does not report
 * success. The account row is never removed while records scoped to it might
 * survive — that is the orphaning this port exists to end.
 */
describe('financial-accounts use cases: deletion erases account-scoped records or refuses', () => {
  it('erases the records, deletes the account, and reports both counts as measurements', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.seed(actorA1, created.value.id, 4);
    await snapshotStore.append(actorA1, {
      id: 'b5000000-0000-4000-8000-0000000000d1' as BalanceSnapshotId,
      tenantId: TENANT_A,
      userId: USER_A1,
      accountId: created.value.id,
      amount: Money.of(1_000n, QAR),
      asOf: NOW,
      sourceKind: 'MANUAL',
      balanceKind: 'BOOKED',
      sourceReference: SYNTHETIC_SOURCE_REFERENCE,
      capturedAt: NOW,
      createdAt: NOW,
    });

    const deleted = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.value.snapshotsDeleted).toBe(1);
      expect(deleted.value.recordsDeleted.FINANCIAL_RECORD).toBe(4);
    }
    expect(recordStore.rows).toHaveLength(0);
    expect(snapshotStore.rows).toHaveLength(0);
    expect(accountStore.rows.size).toBe(0);
  });

  it('does NOT delete the account when the eraser fails, and does not report success', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.seed(actorA1, created.value.id, 2);
    recordStore.failErasureWith(new Error('synthetic record-store outage'));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('erasure_incomplete');
    // The account survives WITH its records: a coherent world to retry into,
    // rather than an anchor deleted out from under rows that still exist.
    expect(accountStore.rows.has(created.value.id)).toBe(true);
    expect(recordStore.rows).toHaveLength(2);
  });

  it('does NOT delete the account on a PARTIAL erasure, and reports what was removed', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.eraseWith(() => ({
      kind: 'incomplete',
      deleted: { ...NO_RECORDS_ERASED, FINANCIAL_RECORD: 2 },
      reason: 'the provenance rows could not be removed',
    }));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'erasure_incomplete') {
      expect(refused.error.outcome).toBe('incomplete');
      expect(refused.error.deleted.FINANCIAL_RECORD).toBe(2);
    } else {
      expect.unreachable('a partial erasure must never be reported as success');
    }
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });

  it('checks the version BEFORE erasing, so a stale delete destroys nothing', async () => {
    // The ordering is the whole point: erasing a person's records and then
    // refusing with "try again" would destroy data to answer a race.
    const { create, update, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.seed(actorA1, created.value.id, 3);
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
    expect(recordStore.rows).toHaveLength(3);
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });

  it('a neighbour cannot erase anything: the refusal comes before the eraser is reached', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.seed(actorA1, created.value.id, 2);
    recordStore.failErasureWith(new Error('the eraser must not be reached for a foreign account'));

    for (const intruder of [actorA2, actorB1]) {
      const refused = await remove.execute(
        { accountId: created.value.id, expectedVersion: 1 },
        intruder,
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');
    }
    expect(recordStore.rows).toHaveLength(2);
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });

  it('a retry after a failed erasure converges, because the erasure is idempotent', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.seed(actorA1, created.value.id, 2);
    recordStore.failErasureWith(new Error('synthetic transient outage'));

    const first = await remove.execute({ accountId: created.value.id, expectedVersion: 1 }, actorA1);
    expect(first.ok).toBe(false);

    recordStore.eraseWith(() => ({ kind: 'erased', deleted: NO_RECORDS_ERASED }));
    const second = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(second.ok).toBe(true);
    expect(accountStore.rows.size).toBe(0);
  });
});

/**
 * Deletion also erases the SOURCE LINKS that say which data source feeds the
 * account, or it does not report success.
 *
 * Those rows live in `modules/financial-connections` and carry the encrypted
 * external account reference — a protected external identity. `account_id`
 * there is a raw uuid with no foreign key back here, so nothing cascaded to
 * them and an account delete left every one of them behind while telling the
 * person the account was gone. `AccountSourceLinkEraserPort` is how that
 * claim becomes true; these cases are what makes it checkable.
 */
describe('financial-accounts use cases: deletion erases account-source links or refuses', () => {
  it('erases the source links BEFORE the records, deletes the account, and reports both counts', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    recordStore.seed(actorA1, created.value.id, 3);

    const deleted = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.value.accountSourceLinksDeleted).toBe(2);
      expect(deleted.value.recordsDeleted.FINANCIAL_RECORD).toBe(3);
    }
    expect(sourceLinkStore.rows).toHaveLength(0);
    expect(recordStore.rows).toHaveLength(0);
    expect(accountStore.rows.size).toBe(0);

    // The ORDER is a contract: the link is the route by which new records
    // arrive, so it is cut before the records that travel down it. Reverse
    // this and an import through a still-live link can write rows into the
    // gap, which the account delete then orphans while reporting success.
    expect(sourceLinkStore.erasedAt).not.toBeNull();
    expect(recordStore.erasedAt).not.toBeNull();
    expect(sourceLinkStore.erasedAt as number).toBeLessThan(recordStore.erasedAt as number);
  });

  it('does NOT delete the account when the source-link eraser fails, and never reaches the records', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    recordStore.seed(actorA1, created.value.id, 3);
    sourceLinkStore.failErasureWith(new Error('synthetic source-link store outage'));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'source_link_erasure_incomplete') {
      expect(refused.error.outcome).toBe('failed');
      // A throw is not a partial erasure: nothing is KNOWN to have gone.
      expect(refused.error.accountSourceLinksDeleted).toBe(0);
    } else {
      expect.unreachable('a failed source-link erasure must never be reported as success');
    }
    // A coherent world to retry into, and the records were never touched —
    // step 2 refuses before step 3 begins.
    expect(accountStore.rows.has(created.value.id)).toBe(true);
    expect(sourceLinkStore.rows).toHaveLength(2);
    expect(recordStore.rows).toHaveLength(3);
    expect(recordStore.erasedAt).toBeNull();
  });

  it('does NOT delete the account on a PARTIAL source-link erasure, and reports what was removed', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.eraseWith(() => ({
      kind: 'incomplete',
      accountSourceLinksDeleted: 1,
      reason: 'one link could not be removed',
    }));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'source_link_erasure_incomplete') {
      expect(refused.error.outcome).toBe('incomplete');
      expect(refused.error.accountSourceLinksDeleted).toBe(1);
    } else {
      expect.unreachable('a partial source-link erasure must never be reported as success');
    }
    expect(accountStore.rows.has(created.value.id)).toBe(true);
    expect(recordStore.erasedAt).toBeNull();
  });

  it('the record-erasure refusal reports the source links that ALREADY went', async () => {
    // The half-done case, which is the one a person would most want the truth
    // about: the links are gone, the records are not, the account stands.
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    recordStore.seed(actorA1, created.value.id, 3);
    recordStore.failErasureWith(new Error('synthetic record-store outage'));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'erasure_incomplete') {
      expect(refused.error.accountSourceLinksDeleted).toBe(2);
    } else {
      expect.unreachable('a failed record erasure must never be reported as success');
    }
    expect(sourceLinkStore.rows).toHaveLength(0);
    expect(recordStore.rows).toHaveLength(3);
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });

  it('checks the version BEFORE erasing links, so a stale delete destroys nothing', async () => {
    const { create, update, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    await update.execute(
      { accountId: created.value.id, expectedVersion: 1, displayName: 'Renamed Synthetic' },
      actorA1,
    );

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('version_conflict');
    expect(sourceLinkStore.rows).toHaveLength(2);
    expect(sourceLinkStore.erasedAt).toBeNull();
  });

  it('a source-link failure carries NO store text outward, and keeps the cause for the boundary', async () => {
    // The same rule as `storeFailure`, applied to the other module's throw: a
    // driver message can carry a connection string, the failing SQL, or a
    // fragment of the ciphertext of the external account reference.
    const CONNECTION_STRING = 'postgres://user:password@internal-host:5432/karar';
    const SQL = 'DELETE FROM public.account_source_links';
    const poisoned = new Error(`connection to ${CONNECTION_STRING} failed while running ${SQL}`);

    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.failErasureWith(poisoned);

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return expect.unreachable('the erasure was supposed to fail');

    for (const rendered of [
      JSON.stringify(refused.error) ?? '',
      JSON.stringify({ ...refused.error }),
      Object.keys(refused.error).join(','),
      refused.error.message,
    ]) {
      expect(rendered).not.toContain(CONNECTION_STRING);
      expect(rendered).not.toContain(SQL);
      expect(rendered).not.toContain('password');
      expect(rendered).not.toContain('internal-host');
    }
    // Reachable by name for the one boundary allowed to log it, and
    // non-enumerable so no serializer can reach it by accident.
    expect((refused.error as { cause?: unknown }).cause).toBe(poisoned);
    expect(Object.getOwnPropertyDescriptor(refused.error, 'cause')?.enumerable).toBe(false);
  });

  it('a retry after a failed source-link erasure converges, because the erasure is idempotent', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    sourceLinkStore.failErasureWith(new Error('synthetic transient outage'));

    const first = await remove.execute({ accountId: created.value.id, expectedVersion: 1 }, actorA1);
    expect(first.ok).toBe(false);

    sourceLinkStore.eraseWith(() => ({ kind: 'erased', accountSourceLinksDeleted: 2 }));
    const second = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.accountSourceLinksDeleted).toBe(2);
    expect(accountStore.rows.size).toBe(0);
  });

  it('a neighbour cannot reach the source-link eraser at all', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    sourceLinkStore.failErasureWith(
      new Error('the source-link eraser must not be reached for a foreign account'),
    );

    for (const intruder of [actorA2, actorB1]) {
      const refused = await remove.execute(
        { accountId: created.value.id, expectedVersion: 1 },
        intruder,
      );
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');
    }
    expect(sourceLinkStore.erasedAt).toBeNull();
    expect(sourceLinkStore.rows).toHaveLength(2);
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });
});

/**
 * Reported balances are gated, bound to the account, and never narrative.
 */
describe('financial-accounts use cases: recording a reported balance', () => {
  it('records a figure a source asserted, with the capture instant taken from the clock', async () => {
    const { create, recordBalance, listSnapshots } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const asOf = new Date('2026-08-01T00:00:00.000Z');
    const recorded = await recordBalance.execute(
      {
        accountId: created.value.id,
        amount: Money.fromDecimalString('-1234.56', QAR),
        asOf,
        balanceKind: 'BOOKED',
        sourceReference: SYNTHETIC_SOURCE_REFERENCE,
      },
      actorA1,
    );
    expect(recorded.ok).toBe(true);
    if (recorded.ok) {
      expect(recorded.value.amount.minorUnits).toBe(-123_456n);
      expect(recorded.value.asOf).toEqual(asOf);
      // When this platform LEARNED it is the platform's fact, not a caller's.
      expect(recorded.value.capturedAt).toEqual(NOW);
      expect(recorded.value.sourceKind).toBe('MANUAL');
    }

    const listed = await listSnapshots.execute({ accountId: created.value.id }, actorA1);
    expect(listed.ok && listed.value).toHaveLength(1);
  });

  it('refuses a source reference that could carry narrative, before any write', async () => {
    const { create, recordBalance } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const refused = await recordBalance.execute(
      {
        accountId: created.value.id,
        amount: Money.of(1_000n, QAR),
        asOf: NOW,
        balanceKind: 'BOOKED',
        sourceReference: 'closing balance printed on the second page of the statement',
      },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'rule_violated') {
      expect(refused.error.violation.kind).toBe('invalid_source_reference');
    } else {
      expect.unreachable('expected the source-reference rule to refuse');
    }
    expect(snapshotStore.rows).toHaveLength(0);
  });

  it('a neighbour cannot attach a balance to an account they cannot see', async () => {
    const { create, recordBalance } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');

    const refused = await recordBalance.execute(
      {
        accountId: created.value.id,
        amount: Money.of(1_000n, QAR),
        asOf: NOW,
        balanceKind: 'BOOKED',
        sourceReference: SYNTHETIC_SOURCE_REFERENCE,
      },
      actorA2,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');
    expect(snapshotStore.rows).toHaveLength(0);
  });
});

/**
 * Deletion also erases the PAYMENT INSTRUMENTS that spend from the account, or
 * it does not report success.
 *
 * Those rows live in `modules/payment-instruments` and say what SPENDS from a
 * balance-bearing account, carrying the encrypted mask a person reads off
 * their own card. `account_id` there is a raw uuid with no foreign key back
 * here, so nothing cascaded to them and an account delete left every one of
 * them behind while telling the person the account was gone — an instrument
 * naming a deleted account being a way to spend from something the person
 * believes no longer exists. `PaymentInstrumentEraserPort` is how that claim
 * becomes true; these cases are what makes it checkable.
 */
describe('financial-accounts use cases: deletion erases payment instruments or refuses', () => {
  it('erases links, THEN instruments, THEN records — and reports every count', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    instrumentStore.seed(actorA1, created.value.id, 3);
    recordStore.seed(actorA1, created.value.id, 4);

    const deleted = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.value.accountSourceLinksDeleted).toBe(2);
      expect(deleted.value.paymentInstrumentsDeleted).toBe(3);
      expect(deleted.value.recordsDeleted.FINANCIAL_RECORD).toBe(4);
    }
    expect(sourceLinkStore.rows).toHaveLength(0);
    expect(instrumentStore.rows).toHaveLength(0);
    expect(recordStore.rows).toHaveLength(0);
    expect(accountStore.rows.size).toBe(0);

    // The ORDER is a contract, and the whole order is asserted rather than one
    // pair of it. The link is the only one of the three routes that can put a
    // row in the database, so it is cut first; the instrument is a way to
    // SPEND from the account and is cut next; the records go last of the three
    // because they are the part a retry cannot rebuild by asking the person.
    expect(sourceLinkStore.erasedAt).not.toBeNull();
    expect(instrumentStore.erasedAt).not.toBeNull();
    expect(recordStore.erasedAt).not.toBeNull();
    expect(sourceLinkStore.erasedAt as number).toBeLessThan(instrumentStore.erasedAt as number);
    expect(instrumentStore.erasedAt as number).toBeLessThan(recordStore.erasedAt as number);
  });

  it('does NOT delete the account when the instrument eraser fails, and never reaches the records', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    instrumentStore.seed(actorA1, created.value.id, 3);
    recordStore.seed(actorA1, created.value.id, 4);
    instrumentStore.failErasureWith(new Error('synthetic instrument store outage'));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'instrument_erasure_incomplete') {
      expect(refused.error.outcome).toBe('failed');
      // A throw is not a partial erasure: nothing is KNOWN to have gone.
      expect(refused.error.paymentInstrumentsDeleted).toBe(0);
      // The links DID go, and the refusal says so rather than pretending the
      // request left no trace.
      expect(refused.error.accountSourceLinksDeleted).toBe(2);
    } else {
      expect.unreachable('a failed instrument erasure must never be reported as success');
    }
    // A coherent world to retry into, and the records were never touched —
    // step 3 refuses before step 4 begins.
    expect(accountStore.rows.has(created.value.id)).toBe(true);
    expect(instrumentStore.rows).toHaveLength(3);
    expect(recordStore.rows).toHaveLength(4);
    expect(recordStore.erasedAt).toBeNull();
  });

  it('does NOT delete the account on a PARTIAL instrument erasure, and reports what was removed', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    instrumentStore.eraseWith(() => ({
      kind: 'incomplete',
      paymentInstrumentsDeleted: 1,
      reason: 'one instrument could not be removed',
    }));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'instrument_erasure_incomplete') {
      expect(refused.error.outcome).toBe('incomplete');
      expect(refused.error.paymentInstrumentsDeleted).toBe(1);
    } else {
      expect.unreachable('a partial instrument erasure must never be reported as success');
    }
    expect(accountStore.rows.has(created.value.id)).toBe(true);
    expect(recordStore.erasedAt).toBeNull();
  });

  it('the record-erasure refusal reports the instruments that ALREADY went', async () => {
    // The half-done case, which is the one a person would most want the truth
    // about: the links and the instruments are gone, the records are not, the
    // account stands.
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    sourceLinkStore.seed(actorA1, created.value.id, 2);
    instrumentStore.seed(actorA1, created.value.id, 3);
    recordStore.seed(actorA1, created.value.id, 4);
    recordStore.failErasureWith(new Error('synthetic record-store outage'));

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'erasure_incomplete') {
      expect(refused.error.accountSourceLinksDeleted).toBe(2);
      expect(refused.error.paymentInstrumentsDeleted).toBe(3);
    } else {
      expect.unreachable('a failed record erasure must never be reported as success');
    }
    expect(instrumentStore.rows).toHaveLength(0);
    expect(recordStore.rows).toHaveLength(4);
    expect(accountStore.rows.has(created.value.id)).toBe(true);
  });

  it('checks the version BEFORE erasing instruments, so a stale delete destroys nothing', async () => {
    const { create, update, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    instrumentStore.seed(actorA1, created.value.id, 3);
    await update.execute(
      { accountId: created.value.id, expectedVersion: 1, displayName: 'Renamed Synthetic' },
      actorA1,
    );

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('version_conflict');
    expect(instrumentStore.rows).toHaveLength(3);
    expect(instrumentStore.erasedAt).toBeNull();
  });

  it('an instrument failure carries NO store text outward, and keeps the cause for the boundary', async () => {
    // The same rule as `storeFailure`, applied to a third module's throw: a
    // driver message can carry a connection string, the failing SQL, or a
    // fragment of the ciphertext of an instrument mask.
    const CONNECTION_STRING = 'postgres://user:password@internal-host:5432/karar';
    const SQL = 'DELETE FROM public.payment_instruments';
    const poisoned = new Error(`connection to ${CONNECTION_STRING} failed while running ${SQL}`);

    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    instrumentStore.failErasureWith(poisoned);

    const refused = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return expect.unreachable('the erasure was supposed to fail');

    for (const rendered of [
      JSON.stringify(refused.error) ?? '',
      JSON.stringify({ ...refused.error }),
      Object.keys(refused.error).join(','),
      refused.error.message,
    ]) {
      expect(rendered).not.toContain(CONNECTION_STRING);
      expect(rendered).not.toContain(SQL);
      expect(rendered).not.toContain('password');
      expect(rendered).not.toContain('internal-host');
    }
    // Reachable by name for the one boundary allowed to log it, and
    // non-enumerable so no serializer can reach it by accident.
    expect((refused.error as { cause?: unknown }).cause).toBe(poisoned);
    expect(Object.getOwnPropertyDescriptor(refused.error, 'cause')?.enumerable).toBe(false);
  });

  it('a retry after a failed instrument erasure converges, because the erasure is idempotent', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    instrumentStore.seed(actorA1, created.value.id, 2);
    instrumentStore.failErasureWith(new Error('synthetic transient outage'));

    const first = await remove.execute({ accountId: created.value.id, expectedVersion: 1 }, actorA1);
    expect(first.ok).toBe(false);

    instrumentStore.eraseWith(() => ({ kind: 'erased', paymentInstrumentsDeleted: 2 }));
    const second = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.paymentInstrumentsDeleted).toBe(2);
    expect(accountStore.rows.size).toBe(0);
  });

  it('a neighbour cannot reach the instrument eraser at all', async () => {
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    instrumentStore.seed(actorA1, created.value.id, 2);
    instrumentStore.failErasureWith(
      new Error('the instrument eraser must not be reached for a foreign account'),
    );

    for (const intruder of [actorA2, actorB1]) {
      const refused = await remove.execute(
        { accountId: created.value.id, expectedVersion: 1 },
        intruder,
      );
      expect(refused.ok).toBe(false);
      // The same oracle-free answer a guessed id gets: the refusal happens at
      // the visibility check, before any erasure is attempted.
      if (!refused.ok) expect(refused.error.kind).toBe('account_not_found');
    }
    expect(instrumentStore.erasedAt).toBeNull();
    expect(instrumentStore.rows).toHaveLength(2);
  });

  it('the relationship count the record eraser measured is folded into the outcome', async () => {
    // `financialRecordRelationshipsDeleted` is how a person is told that the
    // transfer matches relating their movements went too. `undefined` means
    // nobody measured, `0` means measured and none — the two are different
    // claims and the outcome keeps them apart.
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.eraseWith((accountId) => ({
      kind: 'erased',
      deleted: { ...NO_RECORDS_ERASED, FINANCIAL_RECORD: 2 },
      financialRecordRelationshipsDeleted: accountId === created.value.id ? 3 : 0,
    }));

    const deleted = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.value.financialRecordRelationshipsDeleted).toBe(3);
  });

  it('an eraser that measured NO relationships leaves the field absent, not zero', async () => {
    // The counterpart. An implementation with no relationships to erase must
    // not be made to write a zero it never counted, and a reader must not be
    // able to mistake "nobody looked" for "there were none".
    const { create, remove } = wire();
    const created = await create.execute(manualInput, actorA1);
    if (!created.ok) return expect.unreachable('fixture create failed');
    recordStore.eraseWith(() => ({ kind: 'erased', deleted: NO_RECORDS_ERASED }));

    const deleted = await remove.execute(
      { accountId: created.value.id, expectedVersion: 1 },
      actorA1,
    );
    expect(deleted.ok).toBe(true);
    if (deleted.ok) {
      expect(deleted.value.financialRecordRelationshipsDeleted).toBeUndefined();
      expect(Object.keys(deleted.value)).not.toContain('financialRecordRelationshipsDeleted');
    }
  });
});
