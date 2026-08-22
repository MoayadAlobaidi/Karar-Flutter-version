/**
 * In-memory doubles for the use-case tests.
 *
 * They implement the ports' CONTRACTS, not a convenient subset: the
 * transaction store enforces the dedup uniqueness the real unique constraint
 * enforces, the version compare-and-set the real UPDATE enforces, and the
 * principal scoping RLS enforces. A double that skipped those would make the
 * use-case tests pass while the real ones failed, which is worse than having
 * no double at all.
 *
 * The principal scoping is modelled explicitly — every stored row remembers
 * its owner and a lookup by a different principal returns nothing — so the
 * "another subject's id is indistinguishable from absent" behaviour is
 * exercised here as well as against live PostgreSQL.
 */

import { createAssignment, type TransactionCategoryAssignment } from '../../domain/category-assignment.js';
import { createFinancialCategory, type CategoryCode, type FinancialCategory } from '../../domain/category-catalogue.js';
import { createMerchantRule, type MerchantRule } from '../../domain/merchant-rules.js';
import type { TransactionProvenance } from '../../domain/provenance.js';
import type { TransactionRevision } from '../../domain/revision.js';
import type { TransactionId } from '../../domain/refs.js';
import type { Transaction } from '../../domain/transaction.js';
import {
  AssignmentConflictError,
  type AssignmentCommit,
  type CategoryAssignmentRepository,
  type FinancialCategoryCatalogue,
  type MerchantRuleDirectory,
} from '../../application/ports/category-repository.js';
import type { IdSource } from '../../application/ports/id-source.js';
import type {
  PrincipalContextPort,
  TransactionsPrincipal,
} from '../../application/ports/principal-context.js';
import {
  DuplicateTransactionError,
  OccurrenceOrdinalNotNextError,
  TransactionVersionConflictError,
  type RuleCategoryAssignment,
  type TransactionCommit,
  type TransactionCorrectionCommit,
  type TransactionPage,
  type TransactionPageQuery,
  type TransactionRepository,
} from '../../application/ports/transaction-repository.js';
import type {
  AccountAccessSummary,
  AccountLifecycleState,
  FinancialAccountAccessPort,
} from '../../application/ports/financial-account-access.js';
import type { AccountRef } from '../../domain/refs.js';
import type {
  TransactionRetentionDecision,
  TransactionRetentionDecisionPort,
} from '../../application/ports/transaction-retention-decision.js';
import type {
  TransferMatchEraserPort,
  TransferMatchErasureOutcome,
} from '../../application/ports/transfer-match-eraser.js';

/** The principal source a composition root would bind to the session. */
export class FixedPrincipalContext implements PrincipalContextPort {
  #principal: TransactionsPrincipal | null;

  constructor(principal: TransactionsPrincipal | null) {
    this.#principal = principal;
  }

  current(): TransactionsPrincipal | null {
    return this.#principal;
  }

  /** Switch the acting principal — how the tests probe cross-user access. */
  actAs(principal: TransactionsPrincipal | null): void {
    this.#principal = principal;
  }
}

/** Sequential ids, so a failing test names the row that failed. */
export class SequentialIdSource implements IdSource {
  #next = 0;

  constructor(private readonly prefix = '00000000-0000-7000-8000') {}

  nextId(): string {
    this.#next += 1;
    return `${this.prefix}-${this.#next.toString(16).padStart(12, '0')}`;
  }
}

interface StoredTransaction {
  transaction: Transaction;
  revisions: TransactionRevision[];
  provenance: TransactionProvenance[];
  /** Principal + account + fingerprint version + fingerprint. */
  identityKey: string;
  occurrenceOrdinal: number;
}

function scopeKey(principal: TransactionsPrincipal): string {
  return `${principal.tenantId}|${principal.userId}`;
}

function owns(principal: TransactionsPrincipal, transaction: Transaction): boolean {
  return transaction.tenantId === principal.tenantId && transaction.userId === principal.userId;
}

export class InMemoryTransactionRepository implements TransactionRepository {
  readonly #rows = new Map<string, StoredTransaction>();

  /**
   * The assignment store a commit writes into, when one is wired.
   *
   * In PostgreSQL the two writes are two statements in one transaction; here
   * they are two objects, so the double is handed the assignment store to
   * write into. Optional because most suites do not categorise and should not
   * have to construct one — but when it IS wired, a commit carrying a rule's
   * assignment writes it, exactly as the live repository does.
   */
  assignments: InMemoryCategoryAssignmentRepository | null = null;

  /** Wire the assignment store, returning `this` so seeding stays one line. */
  writingAssignmentsInto(assignments: InMemoryCategoryAssignmentRepository): this {
    this.assignments = assignments;
    return this;
  }

  /**
   * The stored occurrences of one content identity. Derived from the rows
   * rather than from a counter kept beside them, so deletion behaves exactly
   * as the live rule does: `max(occurrence_ordinal)` is taken over surviving
   * rows, and erasing the second coffee makes occurrence 2 claimable again.
   */
  #ordinalsFor(identityKey: string): readonly number[] {
    return [...this.#rows.values()]
      .filter((stored) => stored.identityKey === identityKey)
      .map((stored) => stored.occurrenceOrdinal);
  }

  commit(principal: TransactionsPrincipal, commit: TransactionCommit): Promise<void> {
    // The double holds the REAL contract, ordinal included: the unique key is
    // over content identity AND occurrence, and the ordinal must be the next
    // unused one. A double that skipped the second rule would let the
    // use-case tests pass while the live ones failed.
    const identityKey = [
      scopeKey(principal),
      commit.transaction.accountRef.accountId,
      commit.fingerprint.version,
      commit.fingerprint.value,
    ].join('|');
    const recorded = this.#ordinalsFor(identityKey);
    if (recorded.includes(commit.occurrenceOrdinal)) {
      return Promise.reject(
        new DuplicateTransactionError(commit.fingerprint.version, 'duplicate fingerprint'),
      );
    }
    const nextOrdinal = Math.max(0, ...recorded) + 1;
    if (commit.occurrenceOrdinal !== nextOrdinal) {
      return Promise.reject(
        new OccurrenceOrdinalNotNextError(
          commit.occurrenceOrdinal,
          nextOrdinal,
          'the occurrence ordinal must be the next unused one for this content identity',
        ),
      );
    }
    this.#rows.set(commit.transaction.id, {
      transaction: commit.transaction,
      revisions: [commit.revision],
      provenance: [commit.provenance],
      identityKey,
      occurrenceOrdinal: commit.occurrenceOrdinal,
    });
    // The double holds the REAL contract here too: a commit carrying a rule's
    // assignment writes it, in the same call, or writes nothing. A double that
    // silently dropped it would make every "manual entry gets categorised"
    // test pass against a repository that never wrote a category.
    if (commit.ruleCategoryAssignment !== null) {
      const assignment = commit.ruleCategoryAssignment;
      this.assignments?.seedFromCommit(principal, commit.transaction.id, assignment);
    }
    return Promise.resolve();
  }

  findById(principal: TransactionsPrincipal, id: TransactionId): Promise<Transaction | null> {
    const stored = this.#rows.get(id);
    if (stored === undefined || !owns(principal, stored.transaction)) return Promise.resolve(null);
    return Promise.resolve(stored.transaction);
  }

  page(principal: TransactionsPrincipal, query: TransactionPageQuery): Promise<TransactionPage> {
    const ordered = [...this.#rows.values()]
      .map((stored) => stored.transaction)
      .filter((transaction) => owns(principal, transaction))
      .filter(
        (transaction) =>
          query.accountRef === null ||
          transaction.accountRef.accountId === query.accountRef.accountId,
      )
      .sort((left, right) => {
        // Days compare as days. `compare` is the only ordering CalendarDay
        // offers, which is the point: there is no instant to subtract and no
        // timezone to make the order depend on where this runs.
        const byDate = right.bookingDate.compare(left.bookingDate);
        if (byDate !== 0) return byDate;
        return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
      });
    const after = query.after;
    const remaining =
      after === null
        ? ordered
        : ordered.filter((transaction) => {
            const byDate = transaction.bookingDate.compare(after.bookingDate);
            if (byDate !== 0) return byDate < 0;
            return transaction.id < after.id;
          });
    const pageRows = remaining.slice(0, query.limit);
    const hasMore = remaining.length > query.limit;
    const last = pageRows[pageRows.length - 1];
    return Promise.resolve({
      transactions: pageRows,
      nextCursor:
        hasMore && last !== undefined ? { bookingDate: last.bookingDate, id: last.id } : null,
    });
  }

  correct(
    principal: TransactionsPrincipal,
    commit: TransactionCorrectionCommit,
  ): Promise<void> {
    const stored = this.#rows.get(commit.transaction.id);
    if (stored === undefined || !owns(principal, stored.transaction)) {
      return Promise.reject(new TransactionVersionConflictError(commit.expectedVersion, -1, 'absent'));
    }
    if (stored.transaction.version !== commit.expectedVersion) {
      return Promise.reject(
        new TransactionVersionConflictError(
          commit.expectedVersion,
          stored.transaction.version,
          'version moved',
        ),
      );
    }
    stored.transaction = commit.transaction;
    stored.revisions.push(commit.revision);
    stored.provenance.push(commit.provenance);
    return Promise.resolve();
  }

  delete(principal: TransactionsPrincipal, id: TransactionId): Promise<boolean> {
    const stored = this.#rows.get(id);
    if (stored === undefined || !owns(principal, stored.transaction)) {
      return Promise.resolve(false);
    }
    // The double models the schema's ON DELETE CASCADE: revisions and
    // provenance go with the transaction, never outlive it. The dedup
    // identity goes with it too, because it is columns ON the row.
    this.#rows.delete(id);
    return Promise.resolve(true);
  }

  listRevisions(
    principal: TransactionsPrincipal,
    id: TransactionId,
  ): Promise<readonly TransactionRevision[]> {
    const stored = this.#rows.get(id);
    if (stored === undefined || !owns(principal, stored.transaction)) return Promise.resolve([]);
    return Promise.resolve(
      [...stored.revisions].sort((a, b) => a.revisionNumber - b.revisionNumber),
    );
  }

  listProvenance(
    principal: TransactionsPrincipal,
    id: TransactionId,
  ): Promise<readonly TransactionProvenance[]> {
    const stored = this.#rows.get(id);
    if (stored === undefined || !owns(principal, stored.transaction)) return Promise.resolve([]);
    return Promise.resolve(
      [...stored.provenance].sort((a, b) => a.revisionNumber - b.revisionNumber),
    );
  }

  /** Test-only: rows still held, for cascade assertions. */
  size(): number {
    return this.#rows.size;
  }
}

export class InMemoryCategoryAssignmentRepository implements CategoryAssignmentRepository {
  readonly #rows = new Map<string, TransactionCategoryAssignment>();

  /**
   * The assignment a `commit` carried, written as the live repository writes
   * it: ACTIVE, `RULE`-sourced, naming its rule version, superseding nothing
   * — a transaction that has only just been created has no chain to supersede.
   */
  seedFromCommit(
    principal: TransactionsPrincipal,
    transactionId: string,
    assignment: RuleCategoryAssignment,
  ): void {
    this.#rows.set(
      assignment.id,
      createAssignment({
        id: assignment.id,
        transactionId: transactionId as TransactionId,
        tenantId: principal.tenantId,
        userId: principal.userId,
        categoryCode: assignment.categoryCode,
        assignmentSource: 'RULE',
        ruleVersion: assignment.ruleVersion,
        assignedBy: assignment.assignedBy,
        assignedAt: assignment.assignedAt,
        status: 'ACTIVE',
        supersededById: null,
        supersededAt: null,
      }),
    );
  }

  assign(principal: TransactionsPrincipal, commit: AssignmentCommit): Promise<void> {
    if (commit.supersedesId !== null) {
      const previous = this.#rows.get(commit.supersedesId);
      if (previous === undefined || previous.status !== 'ACTIVE') {
        return Promise.reject(new AssignmentConflictError('the active assignment moved'));
      }
      this.#rows.set(previous.id, {
        ...previous,
        status: 'SUPERSEDED',
        supersededAt: commit.assignment.assignedAt,
        supersededById: commit.assignment.id,
      });
    }
    this.#rows.set(commit.assignment.id, commit.assignment);
    return Promise.resolve();
  }

  listChain(
    principal: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<readonly TransactionCategoryAssignment[]> {
    return Promise.resolve(
      [...this.#rows.values()].filter(
        (assignment) =>
          assignment.transactionId === transactionId &&
          assignment.tenantId === principal.tenantId &&
          assignment.userId === principal.userId,
      ),
    );
  }

  async findActive(
    principal: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<TransactionCategoryAssignment | null> {
    const chain = await this.listChain(principal, transactionId);
    return chain.find((assignment) => assignment.status === 'ACTIVE') ?? null;
  }
}

/** A tiny catalogue, matching the codes migration 0092 seeds. */
export class StaticCategoryCatalogue implements FinancialCategoryCatalogue {
  readonly #byCode = new Map<string, FinancialCategory>();

  constructor(
    entries: ReadonlyArray<{
      code: string;
      parentCode?: string | null;
      en: string;
      ar: string;
      retiredAt?: Date | null;
    }> = DEFAULT_CATEGORIES,
  ) {
    for (const entry of entries) {
      const category = createFinancialCategory({
        code: entry.code,
        parentCode: entry.parentCode ?? null,
        labels: { en: entry.en, ar: entry.ar },
        catalogueVersion: 'catalogue/1',
        retiredAt: entry.retiredAt ?? null,
      });
      this.#byCode.set(category.code, category);
    }
  }

  findByCode(code: CategoryCode): Promise<FinancialCategory | null> {
    return Promise.resolve(this.#byCode.get(code) ?? null);
  }

  list(): Promise<readonly FinancialCategory[]> {
    return Promise.resolve([...this.#byCode.values()]);
  }
}

/**
 * The reviewed merchant corpus, stated by the test.
 *
 * Rules go through `createMerchantRule`, so a test cannot seed a pattern the
 * database would refuse — an uppercase token, a token with reference
 * punctuation in it, an unversioned rule. A double that accepted those would
 * let a test prove matching works on rules that could never exist.
 *
 * `listActiveRules` returns the seeded order UNCHANGED and offers a
 * `shuffled()` reader, because the contract is that order does not matter:
 * the selection is total, so the same corpus in any order must decide the
 * same way, and that is a thing to assert rather than assume.
 */
export class InMemoryMerchantRuleDirectory implements MerchantRuleDirectory {
  #rules: MerchantRule[] = [];
  reads = 0;

  constructor(
    seed: ReadonlyArray<{
      patternKind: string;
      patternToken: string;
      categoryCode: string;
      ruleVersion: string;
    }> = [],
  ) {
    for (const rule of seed) this.add(rule);
  }

  add(rule: {
    patternKind: string;
    patternToken: string;
    categoryCode: string;
    ruleVersion: string;
  }): this {
    this.#rules.push(createMerchantRule(rule));
    return this;
  }

  /** Replace the corpus wholesale — how a test models "the rules changed". */
  replaceWith(
    rules: ReadonlyArray<{
      patternKind: string;
      patternToken: string;
      categoryCode: string;
      ruleVersion: string;
    }>,
  ): this {
    this.#rules = [];
    for (const rule of rules) this.add(rule);
    return this;
  }

  /** The same corpus, reversed. Deterministic, so the assertion is stable. */
  reversed(): InMemoryMerchantRuleDirectory {
    const other = new InMemoryMerchantRuleDirectory();
    for (const rule of [...this.#rules].reverse()) other.add(rule);
    return other;
  }

  listActiveRules(): Promise<readonly MerchantRule[]> {
    this.reads += 1;
    return Promise.resolve([...this.#rules]);
  }
}

const DEFAULT_CATEGORIES = [
  { code: 'FOOD', en: 'Food and drink', ar: 'طعام وشراب' },
  { code: 'FOOD.GROCERIES', parentCode: 'FOOD', en: 'Groceries', ar: 'بقالة' },
  { code: 'TRANSPORT', en: 'Transport', ar: 'مواصلات' },
  { code: 'OTHER', en: 'Other', ar: 'أخرى' },
  {
    code: 'HOUSING',
    en: 'Housing',
    ar: 'سكن',
    retiredAt: new Date('2026-01-01T00:00:00.000Z'),
  },
] as const;

/**
 * The account-visibility double.
 *
 * It models the ONE rule the real composition adapter must hold: an account
 * resolves only for the principal who owns it, and every other case — another
 * user in the same tenant, another tenant, an id nobody minted — answers
 * `null` indistinguishably. The real adapter gets that scoping from the
 * accounts module's RLS policies; the double gets it from an owner check, so
 * the use-case tests exercise the same three refusals the live suite does.
 *
 * Seeded accounts belong to somebody. There is no "unowned" account, because
 * there is no such thing in the accounts module either.
 */
export interface SeededAccount {
  readonly accountId: string;
  readonly owner: TransactionsPrincipal;
  readonly currencyCode: string;
  readonly lifecycleState?: AccountLifecycleState;
  readonly providerConnected?: boolean;
}

export class FixedAccountDirectory implements FinancialAccountAccessPort {
  readonly #accounts = new Map<string, SeededAccount>();

  constructor(accounts: readonly SeededAccount[] = []) {
    for (const account of accounts) this.add(account);
  }

  add(account: SeededAccount): this {
    this.#accounts.set(account.accountId, account);
    return this;
  }

  resolveOwnAccount(
    principal: TransactionsPrincipal,
    accountRef: AccountRef,
  ): Promise<AccountAccessSummary | null> {
    const account = this.#accounts.get(accountRef.accountId);
    if (
      account === undefined ||
      account.owner.tenantId !== principal.tenantId ||
      account.owner.userId !== principal.userId
    ) {
      // Absent, another user's, another tenant's — one answer. The double
      // must not be more helpful than the port, or the test that proves the
      // outcomes are indistinguishable would be proving it about the double.
      return Promise.resolve(null);
    }
    return Promise.resolve({
      accountRef,
      currencyCode: account.currencyCode,
      lifecycleState: account.lifecycleState ?? 'ACTIVE',
      providerConnected: account.providerConnected ?? false,
    });
  }
}

/**
 * A retention decision the test states outright.
 *
 * Constructed with whichever of the three answers the case is about, so a
 * refusal test asserts against a real `PENDING_LEGAL_REVIEW` or `UNAVAILABLE`
 * rather than against a mock that throws.
 */
export class StubRetentionDecisionPort implements TransactionRetentionDecisionPort {
  #decision: TransactionRetentionDecision;
  #calls = 0;

  constructor(decision: TransactionRetentionDecision) {
    this.#decision = decision;
  }

  /** How many times the gate was consulted — proves it is not skipped. */
  get calls(): number {
    return this.#calls;
  }

  answerWith(decision: TransactionRetentionDecision): void {
    this.#decision = decision;
  }

  decide(): Promise<TransactionRetentionDecision> {
    this.#calls += 1;
    return Promise.resolve(this.#decision);
  }
}

/**
 * `TransferMatchEraserPort`, in memory — the port `modules/transfer-matching`
 * satisfies for real.
 *
 * OWNERSHIP-AWARE like the transaction store: a match is keyed on (tenant,
 * user, transaction, account), so a neighbour's match is invisible rather than
 * merely filtered. That is what makes "a caller who names a stranger's
 * transaction erases none of their matches" testable here rather than only
 * against RLS.
 *
 * `calls` counts how often the eraser was consulted, because "the deletion
 * path reached it at all" and "the deletion path refused before reaching it"
 * are both contracts: a delete with no principal bound must touch nothing, and
 * a delete that proceeds must cut the relationship before the record.
 */
export class InMemoryTransferMatchEraser implements TransferMatchEraserPort {
  readonly rows: Array<{
    owner: string;
    transactionIds: readonly string[];
    accountIds: readonly string[];
  }> = [];
  calls = 0;
  #outcome: (() => TransferMatchErasureOutcome) | null = null;
  #failure: Error | null = null;

  seed(
    actor: TransactionsPrincipal,
    what: { readonly transactionIds?: readonly string[]; readonly accountIds?: readonly string[] },
    count = 1,
  ): void {
    for (let i = 0; i < count; i += 1) {
      this.rows.push({
        owner: `${actor.tenantId}/${actor.userId}`,
        transactionIds: what.transactionIds ?? [],
        accountIds: what.accountIds ?? [],
      });
    }
  }

  /** Setting one behaviour clears the other: a double with two live moods is
   *  a double nobody can reason about. */
  eraseWith(outcome: () => TransferMatchErasureOutcome): void {
    this.#outcome = outcome;
    this.#failure = null;
  }

  failErasureWith(error: Error): void {
    this.#failure = error;
    this.#outcome = null;
  }

  eraseTransferMatchesForTransaction(
    actor: TransactionsPrincipal,
    transactionId: string,
  ): Promise<TransferMatchErasureOutcome> {
    return this.#erase(actor, (row) => row.transactionIds.includes(transactionId));
  }

  eraseTransferMatchesForAccount(
    actor: TransactionsPrincipal,
    accountId: string,
  ): Promise<TransferMatchErasureOutcome> {
    return this.#erase(actor, (row) => row.accountIds.includes(accountId));
  }

  #erase(
    actor: TransactionsPrincipal,
    matches: (row: { transactionIds: readonly string[]; accountIds: readonly string[] }) => boolean,
  ): Promise<TransferMatchErasureOutcome> {
    this.calls += 1;
    if (this.#failure !== null) return Promise.reject(this.#failure);
    if (this.#outcome !== null) return Promise.resolve(this.#outcome());
    const owner = `${actor.tenantId}/${actor.userId}`;
    const doomed = this.rows.filter((row) => row.owner === owner && matches(row));
    for (const row of doomed) this.rows.splice(this.rows.indexOf(row), 1);
    return Promise.resolve({ kind: 'erased', transferMatchesDeleted: doomed.length });
  }
}

/**
 * The double a suite uses when transfer matches are not what it is about:
 * there are none, and it says so. Never a silent success — it answers `erased`
 * with an exact zero, which is what an empty store must answer.
 */
export const ERASES_NO_TRANSFER_MATCHES: TransferMatchEraserPort = {
  eraseTransferMatchesForTransaction: () =>
    Promise.resolve({ kind: 'erased', transferMatchesDeleted: 0 }),
  eraseTransferMatchesForAccount: () =>
    Promise.resolve({ kind: 'erased', transferMatchesDeleted: 0 }),
};
