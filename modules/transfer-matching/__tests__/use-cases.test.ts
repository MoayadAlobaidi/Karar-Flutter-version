/**
 * The use-case gates, against in-memory fakes.
 *
 * These are the rules the application layer holds that no schema constraint
 * can: the retention gate running before anything is read or written, a
 * voided transaction refused, the ORIENTATION decided from the signs rather
 * than from the parameter names, and the absence of any owner identifier on
 * an input type.
 *
 * The fakes are deliberately dumb — a map and a list. Anything cleverer would
 * be a second implementation of the rules under test.
 */

import { describe, expect, it } from 'vitest';

import { CalendarDay, Clock, TenantId, UserId } from '@karar/shared-kernel';

import type {
  MatchableTransactionAccessPort,
  MatchableTransactionStatus,
  MatchableTransactionSummary,
} from '../application/ports/matchable-transaction-access.js';
import type {
  FinancialRetentionDecision,
  RetentionGovernedDataset,
  TransferMatchRetentionDecisionPort,
} from '../application/ports/transfer-match-retention-decision.js';
import type {
  TransferMatchCreateOutcome,
  TransferMatchRepository,
  TransferMatchUpdateOutcome,
} from '../application/ports/transfer-match-repository.js';
import type { IdSource } from '../application/ports/id-source.js';
import type { MatchingPrincipal } from '../application/principal.js';
import type { MatchedAccountRef, TransactionRef, TransferMatchId } from '../domain/refs.js';
import type { MatchState, TransferMatch } from '../domain/transfer-match.js';
import { ConfirmTransferMatch } from '../application/use-cases/confirm-transfer-match.js';
import { EraseTransferMatches } from '../application/use-cases/erase-transfer-matches.js';
import { ListOwnTransferMatches } from '../application/use-cases/list-own-transfer-matches.js';
import { RejectTransferMatch } from '../application/use-cases/reject-transfer-match.js';
import { SuggestTransferMatch } from '../application/use-cases/suggest-transfer-match.js';
// The marker is IMPORTED, never typed. `tsc` emits these tests into the same
// dist/ a deployment ships, so a fixture value written here travels exactly as
// far as one written in source — which the retention closure test proves by
// scanning every dist/ in the production closure.
import { SYNTHETIC_RETENTION_MARKER } from '@karar/financial-retention-local-fixtures';

const TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const ACTOR: MatchingPrincipal = { tenantId: TENANT, userId: USER };
const ACCOUNT_ONE = 'a0000000-0000-4000-8000-00000000000a';
const ACCOUNT_TWO = 'b0000000-0000-4000-8000-00000000000b';
const TX_OUT = 'd0000000-0000-4000-8000-000000000001';
const TX_IN = 'e0000000-0000-4000-8000-000000000001';
const clock = new Clock.Fixed(new Date('2026-08-19T12:00:00.000Z'));

class InMemoryMatches implements TransferMatchRepository {
  readonly rows = new Map<string, TransferMatch>();

  listOwn(): Promise<readonly TransferMatch[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  listOwnByState(
    _actor: MatchingPrincipal,
    state: MatchState,
  ): Promise<readonly TransferMatch[]> {
    return Promise.resolve([...this.rows.values()].filter((match) => match.state === state));
  }

  findOwnById(
    _actor: MatchingPrincipal,
    id: TransferMatchId,
  ): Promise<TransferMatch | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findOwnForTransaction(
    _actor: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<readonly TransferMatch[]> {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (match) =>
          match.outflow.transactionRef.transactionId === transactionRef.transactionId ||
          match.inflow.transactionRef.transactionId === transactionRef.transactionId,
      ),
    );
  }

  create(
    _actor: MatchingPrincipal,
    match: TransferMatch,
  ): Promise<TransferMatchCreateOutcome> {
    this.rows.set(match.id, match);
    return Promise.resolve({ kind: 'created', match });
  }

  update(
    _actor: MatchingPrincipal,
    expectedVersion: number,
    next: TransferMatch,
  ): Promise<TransferMatchUpdateOutcome> {
    const current = this.rows.get(next.id);
    if (current === undefined) return Promise.resolve({ kind: 'not_found' });
    if (current.version !== expectedVersion) return Promise.resolve({ kind: 'stale' });
    this.rows.set(next.id, next);
    return Promise.resolve({ kind: 'updated', match: next });
  }

  eraseForTransaction(
    _actor: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<number> {
    let removed = 0;
    for (const [id, match] of [...this.rows]) {
      if (
        match.outflow.transactionRef.transactionId === transactionRef.transactionId ||
        match.inflow.transactionRef.transactionId === transactionRef.transactionId
      ) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }

  eraseForAccount(_actor: MatchingPrincipal, accountRef: MatchedAccountRef): Promise<number> {
    let removed = 0;
    for (const [id, match] of [...this.rows]) {
      if (
        match.outflow.accountRef.accountId === accountRef.accountId ||
        match.inflow.accountRef.accountId === accountRef.accountId
      ) {
        this.rows.delete(id);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
}

interface SeededTransaction {
  readonly transactionId: string;
  readonly accountId: string;
  readonly amountMinorUnits: bigint;
  readonly currencyCode: string;
  readonly bookingDate: CalendarDay;
  readonly status: MatchableTransactionStatus;
}

class FakeTransactions implements MatchableTransactionAccessPort {
  /** Records every transaction the port was ASKED about, so a test can prove it. */
  readonly asked: string[] = [];

  constructor(private readonly known: readonly SeededTransaction[]) {}

  resolveOwnTransaction(
    _principal: MatchingPrincipal,
    transactionRef: TransactionRef,
  ): Promise<MatchableTransactionSummary | null> {
    this.asked.push(transactionRef.transactionId);
    const found = this.known.find(
      (candidate) => candidate.transactionId === transactionRef.transactionId,
    );
    return Promise.resolve(
      found === undefined
        ? null
        : {
            transactionRef,
            accountRef: { referenceType: 'FINANCIAL_ACCOUNT' as const, accountId: found.accountId },
            amountMinorUnits: found.amountMinorUnits,
            currencyCode: found.currencyCode,
            bookingDate: found.bookingDate,
            status: found.status,
          },
    );
  }
}

class FakeRetention implements TransferMatchRetentionDecisionPort {
  calls = 0;

  constructor(private readonly answer: FinancialRetentionDecision['state']) {}

  decideFor(
    _actor: MatchingPrincipal,
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
        reason: 'a provider asserting retention law does not reach a person’s transfers',
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

const BOOKED = CalendarDay.of(2026, 8, 17);

const OUTFLOW: SeededTransaction = {
  transactionId: TX_OUT,
  accountId: ACCOUNT_ONE,
  amountMinorUnits: -10_000n,
  currencyCode: 'QAR',
  bookingDate: BOOKED,
  status: 'POSTED',
};
const INFLOW: SeededTransaction = {
  transactionId: TX_IN,
  accountId: ACCOUNT_TWO,
  amountMinorUnits: 10_000n,
  currencyCode: 'QAR',
  bookingDate: CalendarDay.of(2026, 8, 18),
  status: 'POSTED',
};

function build(options?: {
  retention?: FinancialRetentionDecision['state'];
  transactions?: readonly SeededTransaction[];
}) {
  const matches = new InMemoryMatches();
  const transactions = new FakeTransactions(options?.transactions ?? [OUTFLOW, INFLOW]);
  const retention = new FakeRetention(options?.retention ?? 'DECIDED');
  const suggest = new SuggestTransferMatch(
    matches,
    transactions,
    retention,
    new SequentialIds(),
    clock,
  );
  return { matches, transactions, retention, suggest };
}

describe('SuggestTransferMatch gates, in order', () => {
  it('refuses without a principal, before the retention port is even asked', async () => {
    const { suggest, retention } = build();
    const suggested = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      null as unknown as MatchingPrincipal,
    );
    expect(suggested.ok).toBe(false);
    if (!suggested.ok) expect(suggested.error.kind).toBe('missing_principal_context');
    expect(retention.calls).toBe(0);
  });

  it('refuses when retention is unresolved, and reads no transaction at all', async () => {
    const { suggest, transactions, matches } = build({ retention: 'PENDING_LEGAL_REVIEW' });
    const suggested = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      ACTOR,
    );
    expect(suggested.ok).toBe(false);
    if (!suggested.ok) {
      expect(suggested.error.kind).toBe('retention_unresolved');
      if (suggested.error.kind === 'retention_unresolved') {
        expect(suggested.error.dataset).toBe('transfer_matches');
        expect(suggested.error.decision.state).toBe('PENDING_LEGAL_REVIEW');
      }
    }
    // A refusal here must leave no row behind, and must not have gone looking
    // at another context's subject data on the way.
    expect(transactions.asked).toEqual([]);
    expect(matches.rows.size).toBe(0);
  });

  it('treats NOT_APPLICABLE as a refusal, not as permission', async () => {
    const { suggest } = build({ retention: 'NOT_APPLICABLE' });
    const suggested = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      ACTOR,
    );
    expect(suggested.ok).toBe(false);
    if (!suggested.ok) expect(suggested.error.kind).toBe('retention_unresolved');
  });

  it('refuses a transaction the principal cannot see, naming which side', async () => {
    const { suggest } = build();
    const suggested = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: '0f0f0f0f-0000-4000-8000-00000000000f' },
      ACTOR,
    );
    expect(suggested.ok).toBe(false);
    if (!suggested.ok && suggested.error.kind === 'transaction_not_found') {
      expect(suggested.error.side).toBe('SECOND');
    } else {
      throw new Error('expected a transaction_not_found refusal');
    }
  });

  it('refuses a VOIDED transaction — a record of something that did not happen', async () => {
    const { suggest, matches } = build({
      transactions: [OUTFLOW, { ...INFLOW, status: 'VOIDED' }],
    });
    const suggested = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      ACTOR,
    );
    expect(suggested.ok).toBe(false);
    if (!suggested.ok && suggested.error.kind === 'rule_violated') {
      expect(suggested.error.violation.kind).toBe('transaction_not_matchable');
    } else {
      throw new Error('expected a transaction_not_matchable refusal');
    }
    expect(matches.rows.size).toBe(0);
  });

  it('refuses an UNRECOGNIZED status rather than treating it as POSTED', async () => {
    const { suggest } = build({
      transactions: [OUTFLOW, { ...INFLOW, status: 'UNRECOGNIZED' }],
    });
    const suggested = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      ACTOR,
    );
    expect(suggested.ok).toBe(false);
  });

  it('decides the ORIENTATION from the signs, whichever order the caller passes', async () => {
    // The gate that would otherwise store an inflow in the outflow column and
    // have every later reader believe it.
    for (const [first, second] of [
      [TX_OUT, TX_IN],
      [TX_IN, TX_OUT],
    ]) {
      const { suggest } = build();
      const suggested = await suggest.execute(
        { firstTransactionId: first as string, secondTransactionId: second as string },
        ACTOR,
      );
      expect(suggested.ok).toBe(true);
      if (suggested.ok) {
        expect(suggested.value.outflow.transactionRef.transactionId).toBe(TX_OUT);
        expect(suggested.value.inflow.transactionRef.transactionId).toBe(TX_IN);
      }
    }
  });

  it('produces a SUGGESTED match carrying no decision, and nothing else', async () => {
    const { suggest, matches } = build();
    const suggested = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      ACTOR,
    );
    expect(suggested.ok).toBe(true);
    if (!suggested.ok) return;
    expect(suggested.value.state).toBe('SUGGESTED');
    expect(suggested.value.subjectDecidedAt).toBeNull();
    expect(matches.rows.size).toBe(1);
  });

  it('refuses a transaction already in a live match, naming the colliding one', async () => {
    const { suggest, matches } = build({
      transactions: [
        OUTFLOW,
        INFLOW,
        {
          ...INFLOW,
          transactionId: 'e0000000-0000-4000-8000-000000000002',
        },
      ],
    });
    const first = await suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      ACTOR,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await suggest.execute(
      {
        firstTransactionId: TX_OUT,
        secondTransactionId: 'e0000000-0000-4000-8000-000000000002',
      },
      ACTOR,
    );
    expect(second.ok).toBe(false);
    if (!second.ok && second.error.kind === 'transaction_already_matched') {
      expect(second.error.conflictingMatchId).toBe(first.value.id);
    } else {
      throw new Error('expected a transaction_already_matched refusal');
    }
    expect(matches.rows.size).toBe(1);
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

  it('no use-case input carries a decision instant either', async () => {
    // A caller-supplied decision instant is a CLAIM about when somebody
    // decided something, and the column exists to be a fact. The clock is the
    // only source.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const useCaseDir = path.resolve(
      path.dirname(url.fileURLToPath(import.meta.url)),
      '..',
      'application',
      'use-cases',
    );
    for (const file of fs.readdirSync(useCaseDir).filter((f) => f.endsWith('.ts'))) {
      const contents = fs.readFileSync(path.join(useCaseDir, file), 'utf8');
      for (const block of contents.matchAll(/export interface \w*Input \{([\s\S]*?)\n\}/g)) {
        const body = block[1] ?? '';
        expect({
          file,
          hasDecidedAt: /\breadonly\s+(?:subjectDecidedAt|decidedAt|confirmedAt)\s*[?:]/.test(body),
        }).toEqual({ file, hasDecidedAt: false });
      }
    }
  });
});

describe('the other use cases', () => {
  async function seedOne() {
    const built = build();
    const suggested = await built.suggest.execute(
      { firstTransactionId: TX_OUT, secondTransactionId: TX_IN },
      ACTOR,
    );
    if (!suggested.ok) throw new Error('setup failed');
    return { ...built, match: suggested.value };
  }

  it('confirming refuses on a stale version rather than overwriting', async () => {
    const { matches, match } = await seedOne();
    const confirm = new ConfirmTransferMatch(matches, clock);
    const stale = await confirm.execute({ matchId: match.id, expectedVersion: 99 }, ACTOR);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.kind).toBe('version_conflict');
  });

  it('confirming records the clock instant, and only the clock instant', async () => {
    const { matches, match } = await seedOne();
    const confirm = new ConfirmTransferMatch(matches, clock);
    const confirmed = await confirm.execute(
      { matchId: match.id, expectedVersion: match.version },
      ACTOR,
    );
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.value.state).toBe('CONFIRMED');
      expect(confirmed.value.subjectDecidedAt).toEqual(clock.now());
    }
  });

  it('rejecting keeps the row and frees the transactions', async () => {
    const { matches, match } = await seedOne();
    const reject = new RejectTransferMatch(matches, clock);
    const rejected = await reject.execute(
      { matchId: match.id, expectedVersion: match.version },
      ACTOR,
    );
    expect(rejected.ok).toBe(true);
    // KEPT, not deleted.
    expect(matches.rows.size).toBe(1);
    if (rejected.ok) expect(rejected.value.state).toBe('REJECTED');
  });

  it('confirming an absent match answers not-found, never silently succeeds', async () => {
    const { matches } = await seedOne();
    const confirm = new ConfirmTransferMatch(matches, clock);
    const missing = await confirm.execute(
      { matchId: 'cccccccc-0000-4000-8000-000000000099', expectedVersion: 1 },
      ACTOR,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.kind).toBe('match_not_found');
  });

  it('listing narrows by state and returns a list, never a figure', async () => {
    const { matches, match } = await seedOne();
    const list = new ListOwnTransferMatches(matches);
    const suggested = await list.execute({ state: 'SUGGESTED' }, ACTOR);
    expect(suggested.ok).toBe(true);
    if (suggested.ok) {
      expect(suggested.value).toHaveLength(1);
      expect(Array.isArray(suggested.value)).toBe(true);
    }
    const confirmed = await list.execute({ state: 'CONFIRMED' }, ACTOR);
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.value).toHaveLength(0);
    expect(match.state).toBe('SUGGESTED');
  });

  it('erasure is idempotent on both scopes and reports the exact count', async () => {
    const { matches, match } = await seedOne();
    const erase = new EraseTransferMatches(matches);
    const byTransaction = await erase.forTransaction(
      { transactionId: match.outflow.transactionRef.transactionId },
      ACTOR,
    );
    expect(byTransaction.ok).toBe(true);
    if (byTransaction.ok) expect(byTransaction.value.transferMatchesDeleted).toBe(1);
    const again = await erase.forTransaction(
      { transactionId: match.outflow.transactionRef.transactionId },
      ACTOR,
    );
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.transferMatchesDeleted).toBe(0);

    const second = await seedOne();
    const eraseAgain = new EraseTransferMatches(second.matches);
    const byAccount = await eraseAgain.forAccount({ accountId: ACCOUNT_ONE }, ACTOR);
    expect(byAccount.ok).toBe(true);
    if (byAccount.ok) expect(byAccount.value.transferMatchesDeleted).toBe(1);
  });
});
