/**
 * The use-case gates, against in-memory fakes.
 *
 * These are the rules the application layer holds that no schema constraint
 * can: the retention gate running BEFORE any key is used, a PAN refused
 * before it reaches encryption, an account that resolves to nothing, and the
 * absence of any owner identifier on an input type.
 *
 * The fakes are deliberately dumb — a map and a counter. Anything cleverer
 * would be a second implementation of the rules under test.
 */

import { describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';

import type {
  InstrumentCreateOutcome,
  InstrumentUpdateOutcome,
  PaymentInstrumentRepository,
} from '../application/ports/payment-instrument-repository.js';
import type {
  BalanceBearingAccountAccessPort,
  BalanceBearingAccountSummary,
} from '../application/ports/balance-bearing-account-access.js';
import type {
  FinancialRetentionDecision,
  PaymentInstrumentRetentionDecisionPort,
  RetentionGovernedDataset,
} from '../application/ports/payment-instrument-retention-decision.js';
import type { IdSource } from '../application/ports/id-source.js';
import type { InstrumentsPrincipal } from '../application/principal.js';
import type { PaymentInstrument } from '../domain/payment-instrument.js';
import type { BalanceBearingAccountRef, PaymentInstrumentId } from '../domain/refs.js';
import { DeleteOwnPaymentInstrument } from '../application/use-cases/delete-own-payment-instrument.js';
import { ErasePaymentInstruments } from '../application/use-cases/erase-payment-instruments.js';
import { ListOwnPaymentInstruments } from '../application/use-cases/list-own-payment-instruments.js';
import { RecordPaymentInstrument } from '../application/use-cases/record-payment-instrument.js';
import { UpdateOwnPaymentInstrument } from '../application/use-cases/update-own-payment-instrument.js';
// The marker is IMPORTED, never typed. `tsc` emits these tests into the same
// dist/ a deployment ships, so a fixture value written here travels exactly as
// far as one written in source — which the retention closure test proves by
// scanning every dist/ in the production closure.
import { SYNTHETIC_RETENTION_MARKER } from '@karar/financial-retention-local-fixtures';

const TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const ACTOR: InstrumentsPrincipal = { tenantId: TENANT, userId: USER };
const WALLET = 'dddddddd-0000-4000-8000-00000000000d';
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));

class InMemoryInstruments implements PaymentInstrumentRepository {
  readonly rows = new Map<string, PaymentInstrument>();

  listOwn(): Promise<readonly PaymentInstrument[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  listOwnForAccount(
    _actor: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<readonly PaymentInstrument[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((i) => i.accountRef.accountId === accountRef.accountId),
    );
  }

  findOwnById(
    _actor: InstrumentsPrincipal,
    id: PaymentInstrumentId,
  ): Promise<PaymentInstrument | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  create(
    _actor: InstrumentsPrincipal,
    instrument: PaymentInstrument,
  ): Promise<InstrumentCreateOutcome> {
    this.rows.set(instrument.id, instrument);
    return Promise.resolve({ kind: 'created', instrument });
  }

  update(
    _actor: InstrumentsPrincipal,
    expectedVersion: number,
    next: PaymentInstrument,
  ): Promise<InstrumentUpdateOutcome> {
    const current = this.rows.get(next.id);
    if (current === undefined) return Promise.resolve({ kind: 'not_found' });
    if (current.version !== expectedVersion) return Promise.resolve({ kind: 'stale' });
    this.rows.set(next.id, next);
    return Promise.resolve({ kind: 'updated', instrument: next });
  }

  delete(_actor: InstrumentsPrincipal, id: PaymentInstrumentId): Promise<boolean> {
    return Promise.resolve(this.rows.delete(id));
  }

  eraseForAccount(
    _actor: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<number> {
    let removed = 0;
    for (const [id, instrument] of [...this.rows]) {
      if (instrument.accountRef.accountId === accountRef.accountId) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
}

class FakeAccounts implements BalanceBearingAccountAccessPort {
  /** Records every account the port was ASKED about, so a test can prove it. */
  readonly asked: string[] = [];

  constructor(
    private readonly known: ReadonlyMap<string, BalanceBearingAccountSummary['lifecycleState']>,
  ) {}

  resolveOwnAccount(
    _principal: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<BalanceBearingAccountSummary | null> {
    this.asked.push(accountRef.accountId);
    const state = this.known.get(accountRef.accountId);
    return Promise.resolve(state === undefined ? null : { accountRef, lifecycleState: state });
  }
}

class FakeRetention implements PaymentInstrumentRetentionDecisionPort {
  /** Counts key-adjacent work that must NOT have happened before this gate. */
  calls = 0;

  constructor(private readonly answer: FinancialRetentionDecision['state']) {}

  decideFor(
    _actor: InstrumentsPrincipal,
    dataset: RetentionGovernedDataset,
  ): Promise<FinancialRetentionDecision> {
    this.calls += 1;
    if (this.answer === 'DECIDED') {
      return Promise.resolve({
        state: 'DECIDED',
        dataset,
        retentionPeriod: 'P0D',
        basis: `${SYNTHETIC_RETENTION_MARKER}: unit-test fixture, not a legal determination`,
        approvalReference: `karar-ref:approval:${SYNTHETIC_RETENTION_MARKER}/unit-test@v1`,
        packVersion: 'synthetic-unit-test',
      });
    }
    if (this.answer === 'NOT_APPLICABLE') {
      return Promise.resolve({
        state: 'NOT_APPLICABLE',
        dataset,
        reason: 'a provider asserting retention law does not reach a person’s cards',
      });
    }
    return Promise.resolve({
      state: 'PENDING_LEGAL_REVIEW',
      dataset,
      reason: 'the financial-data retention decision has not been taken',
      packVersion: 'synthetic-unit-test',
    });
  }
}

class SequentialIds implements IdSource {
  private next = 0;

  nextId(): string {
    this.next += 1;
    return `cccccccc-0000-4000-8000-${String(this.next).padStart(12, '0')}`;
  }
}

function build(options?: {
  retention?: FinancialRetentionDecision['state'];
  accounts?: Map<string, BalanceBearingAccountSummary['lifecycleState']>;
}) {
  const instruments = new InMemoryInstruments();
  const accounts = new FakeAccounts(
    options?.accounts ?? new Map([[WALLET, 'ACTIVE' as const]]),
  );
  const retention = new FakeRetention(options?.retention ?? 'DECIDED');
  const record = new RecordPaymentInstrument(
    instruments,
    accounts,
    retention,
    new SequentialIds(),
    clock,
  );
  return { instruments, accounts, retention, record };
}

describe('RecordPaymentInstrument gates, in order', () => {
  it('refuses without a principal, before the retention port is even asked', async () => {
    const { record, retention } = build();
    const created = await record.execute(
      {
        accountId: WALLET,
        instrumentType: 'VIRTUAL_CARD',
        mask: '**00',
        displayLabel: 'Synthetic Test Instrument',
      },
      null as unknown as InstrumentsPrincipal,
    );
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.kind).toBe('missing_principal_context');
    expect(retention.calls).toBe(0);
  });

  it('refuses when retention is unresolved, and touches no account and no key', async () => {
    const { record, accounts, instruments } = build({ retention: 'PENDING_LEGAL_REVIEW' });
    const created = await record.execute(
      {
        accountId: WALLET,
        instrumentType: 'VIRTUAL_CARD',
        mask: '**00',
        displayLabel: 'Synthetic Test Instrument',
      },
      ACTOR,
    );
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.error.kind).toBe('retention_unresolved');
      if (created.error.kind === 'retention_unresolved') {
        expect(created.error.dataset).toBe('payment_instruments');
        expect(created.error.decision.state).toBe('PENDING_LEGAL_REVIEW');
      }
    }
    // A refusal here must leave no ciphertext, no key usage and no row behind.
    expect(accounts.asked).toEqual([]);
    expect(instruments.rows.size).toBe(0);
  });

  it('treats NOT_APPLICABLE as a refusal, not as permission', async () => {
    const { record } = build({ retention: 'NOT_APPLICABLE' });
    const created = await record.execute(
      {
        accountId: WALLET,
        instrumentType: 'VIRTUAL_CARD',
        mask: '**00',
        displayLabel: 'Synthetic Test Instrument',
      },
      ACTOR,
    );
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.kind).toBe('retention_unresolved');
  });

  it('refuses a PAN-shaped mask BEFORE the account is even resolved', async () => {
    // The order matters: a value that is actually a card number must not
    // reach a key, and it must not become a database round trip either.
    const { record, accounts, instruments } = build();
    const created = await record.execute(
      {
        accountId: WALLET,
        instrumentType: 'PHYSICAL_CARD',
        mask: '1111222233334444',
        displayLabel: 'Synthetic Test Instrument',
      },
      ACTOR,
    );
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.error.kind).toBe('rule_violated');
      expect(created.error.message).not.toContain('1111222233334444');
    }
    expect(accounts.asked).toEqual([]);
    expect(instruments.rows.size).toBe(0);
  });

  it('refuses an account the principal cannot see, with the not-found answer', async () => {
    const { record } = build();
    const created = await record.execute(
      {
        accountId: 'ffffffff-0000-4000-8000-00000000000f',
        instrumentType: 'VIRTUAL_CARD',
        mask: '**00',
        displayLabel: 'Synthetic Test Instrument',
      },
      ACTOR,
    );
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.kind).toBe('account_not_found');
  });

  it('refuses an archived or closed account, distinctly from not-found', async () => {
    for (const state of ['ARCHIVED', 'CLOSED', 'UNRECOGNIZED'] as const) {
      const { record } = build({ accounts: new Map([[WALLET, state]]) });
      const created = await record.execute(
        {
          accountId: WALLET,
          instrumentType: 'VIRTUAL_CARD',
          mask: '**00',
          displayLabel: 'Synthetic Test Instrument',
        },
        ACTOR,
      );
      expect(created.ok).toBe(false);
      if (!created.ok) {
        expect(created.error.kind).toBe('account_not_attachable');
        if (created.error.kind === 'account_not_attachable') {
          expect(created.error.lifecycleState).toBe(state);
        }
      }
    }
  });

  it('records two instruments on one account without any objection', async () => {
    const { record, instruments } = build();
    for (const mask of ['**00', '**11']) {
      const created = await record.execute(
        {
          accountId: WALLET,
          instrumentType: 'VIRTUAL_CARD',
          mask,
          displayLabel: `Synthetic Test Instrument ${mask}`,
        },
        ACTOR,
      );
      expect(created.ok).toBe(true);
    }
    expect(instruments.rows.size).toBe(2);
    const accounts = new Set([...instruments.rows.values()].map((i) => i.accountRef.accountId));
    expect(accounts).toEqual(new Set([WALLET]));
  });
});

describe('the principal is context and never input', () => {
  it('no use-case input type declares an owner identifier', async () => {
    // Asserted over the SOURCE, because the guarantee is that the field does
    // not exist rather than that nobody passes it.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const useCaseDir = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '..',
      'application',
      'use-cases',
    );
    const files = fs.readdirSync(useCaseDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const contents = fs.readFileSync(path.join(useCaseDir, file), 'utf8');
      const inputBlocks = [...contents.matchAll(/export interface \w*Input \{([\s\S]*?)\n\}/g)];
      for (const block of inputBlocks) {
        const body = block[1] ?? '';
        expect({ file, hasUserId: /\breadonly\s+userId\s*[?:]/.test(body) }).toEqual({
          file,
          hasUserId: false,
        });
        expect({ file, hasTenantId: /\breadonly\s+tenantId\s*[?:]/.test(body) }).toEqual({
          file,
          hasTenantId: false,
        });
      }
    }
  });
});

describe('the other use cases', () => {
  it('an update refuses on a stale version rather than overwriting', async () => {
    const { record, instruments } = build();
    const created = await record.execute(
      {
        accountId: WALLET,
        instrumentType: 'VIRTUAL_CARD',
        mask: '**00',
        displayLabel: 'Synthetic Test Instrument',
      },
      ACTOR,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const update = new UpdateOwnPaymentInstrument(instruments, clock);
    const stale = await update.execute(
      { instrumentId: created.value.id, expectedVersion: 99, status: 'SUSPENDED' },
      ACTOR,
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.kind).toBe('version_conflict');
  });

  it('an update that changes nothing does not burn a version', async () => {
    const { record, instruments } = build();
    const created = await record.execute(
      {
        accountId: WALLET,
        instrumentType: 'VIRTUAL_CARD',
        mask: '**00',
        displayLabel: 'Synthetic Test Instrument',
      },
      ACTOR,
    );
    if (!created.ok) throw new Error('setup failed');
    const update = new UpdateOwnPaymentInstrument(instruments, clock);
    const same = await update.execute(
      {
        instrumentId: created.value.id,
        expectedVersion: 1,
        displayLabel: 'Synthetic Test Instrument',
      },
      ACTOR,
    );
    expect(same.ok).toBe(true);
    if (same.ok) expect(same.value.version).toBe(1);
  });

  it('deleting an absent instrument answers not-found, never silently succeeds', async () => {
    const { instruments } = build();
    const remove = new DeleteOwnPaymentInstrument(instruments);
    const deleted = await remove.execute(
      { instrumentId: 'cccccccc-0000-4000-8000-000000000099' },
      ACTOR,
    );
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) expect(deleted.error.kind).toBe('instrument_not_found');
  });

  it('erasure is idempotent and reports the exact count', async () => {
    const { record, instruments } = build();
    for (const mask of ['**00', '**11']) {
      await record.execute(
        {
          accountId: WALLET,
          instrumentType: 'VIRTUAL_CARD',
          mask,
          displayLabel: `Synthetic Test Instrument ${mask}`,
        },
        ACTOR,
      );
    }
    const erase = new ErasePaymentInstruments(instruments);
    const first = await erase.execute({ accountId: WALLET }, ACTOR);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.paymentInstrumentsDeleted).toBe(2);
    const second = await erase.execute({ accountId: WALLET }, ACTOR);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.paymentInstrumentsDeleted).toBe(0);
  });

  it('listing narrows to one account and returns a list, never a figure', async () => {
    const { record, instruments } = build({
      accounts: new Map([
        [WALLET, 'ACTIVE' as const],
        ['eeeeeeee-0000-4000-8000-00000000000e', 'ACTIVE' as const],
      ]),
    });
    await record.execute(
      {
        accountId: WALLET,
        instrumentType: 'VIRTUAL_CARD',
        mask: '**00',
        displayLabel: 'Synthetic Test Instrument One',
      },
      ACTOR,
    );
    await record.execute(
      {
        accountId: 'eeeeeeee-0000-4000-8000-00000000000e',
        instrumentType: 'PHYSICAL_CARD',
        mask: '**11',
        displayLabel: 'Synthetic Test Instrument Two',
      },
      ACTOR,
    );
    const list = new ListOwnPaymentInstruments(instruments);
    const forWallet = await list.execute({ accountId: WALLET }, ACTOR);
    expect(forWallet.ok).toBe(true);
    if (forWallet.ok) {
      expect(forWallet.value).toHaveLength(1);
      expect(Array.isArray(forWallet.value)).toBe(true);
    }
    const all = await list.execute({}, ACTOR);
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.value).toHaveLength(2);
  });
});
