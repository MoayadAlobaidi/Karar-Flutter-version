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

import type { TransactionCategoryAssignment } from '../../domain/category-assignment.js';
import { createFinancialCategory, type CategoryCode, type FinancialCategory } from '../../domain/category-catalogue.js';
import type { TransactionProvenance } from '../../domain/provenance.js';
import type { TransactionRevision } from '../../domain/revision.js';
import type { TransactionId } from '../../domain/refs.js';
import type { Transaction } from '../../domain/transaction.js';
import {
  AssignmentConflictError,
  type AssignmentCommit,
  type CategoryAssignmentRepository,
  type FinancialCategoryCatalogue,
} from '../../application/ports/category-repository.js';
import type { IdSource } from '../../application/ports/id-source.js';
import type {
  PrincipalContextPort,
  TransactionsPrincipal,
} from '../../application/ports/principal-context.js';
import {
  DuplicateTransactionError,
  TransactionVersionConflictError,
  type TransactionCommit,
  type TransactionCorrectionCommit,
  type TransactionPage,
  type TransactionPageQuery,
  type TransactionRepository,
} from '../../application/ports/transaction-repository.js';

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
  fingerprintKey: string;
}

function scopeKey(principal: TransactionsPrincipal): string {
  return `${principal.tenantId}|${principal.userId}`;
}

function owns(principal: TransactionsPrincipal, transaction: Transaction): boolean {
  return transaction.tenantId === principal.tenantId && transaction.userId === principal.userId;
}

export class InMemoryTransactionRepository implements TransactionRepository {
  readonly #rows = new Map<string, StoredTransaction>();
  readonly #fingerprints = new Set<string>();

  commit(principal: TransactionsPrincipal, commit: TransactionCommit): Promise<void> {
    const fingerprintKey = [
      scopeKey(principal),
      commit.transaction.accountRef.accountId,
      commit.fingerprint.version,
      commit.fingerprint.value,
    ].join('|');
    if (this.#fingerprints.has(fingerprintKey)) {
      return Promise.reject(
        new DuplicateTransactionError(commit.fingerprint.version, 'duplicate fingerprint'),
      );
    }
    this.#fingerprints.add(fingerprintKey);
    this.#rows.set(commit.transaction.id, {
      transaction: commit.transaction,
      revisions: [commit.revision],
      provenance: [commit.provenance],
      fingerprintKey,
    });
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
        const byDate = right.bookingDate.getTime() - left.bookingDate.getTime();
        if (byDate !== 0) return byDate;
        return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
      });
    const after = query.after;
    const remaining =
      after === null
        ? ordered
        : ordered.filter((transaction) => {
            const byDate = transaction.bookingDate.getTime() - after.bookingDate.getTime();
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
    // provenance go with the transaction, never outlive it.
    this.#rows.delete(id);
    this.#fingerprints.delete(stored.fingerprintKey);
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
