/**
 * Categorisation persistence: the subject-scoped assignment chain, the
 * platform-global catalogue, and the reviewed merchant-rule corpus.
 *
 * The split matters and is visible in the constructors. The assignment
 * repository runs every statement inside `withPrincipalContext`, because
 * `transaction_category_assignments` is RLS-FORCEd on both principal GUCs.
 * The catalogue and the rule directory take no principal at all: their tables
 * carry no tenant, user or account column (migration 0092), so there is no
 * predicate to bind and asking for a principal would imply a relationship the
 * schema is built to be incapable of.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';

import type { TransactionCategoryAssignment } from '../../domain/category-assignment.js';
import {
  createFinancialCategory,
  CategoryCode,
  type FinancialCategory,
} from '../../domain/category-catalogue.js';
import { createMerchantRule, type MerchantRule } from '../../domain/merchant-rules.js';
import type { TransactionId } from '../../domain/refs.js';
import {
  AssignmentConflictError,
  type AssignmentCommit,
  type CategoryAssignmentRepository,
  type FinancialCategoryCatalogue,
  type MerchantRuleDirectory,
} from '../../application/ports/category-repository.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';
import { toAssignment, type AssignmentRow } from './row-mappers.js';

export class PrismaCategoryAssignmentRepository implements CategoryAssignmentRepository {
  constructor(private readonly handle: PrismaHandle) {}

  private run<T>(
    principal: TransactionsPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: principal.tenantId, userId: principal.userId },
      fn,
    );
  }

  async assign(principal: TransactionsPrincipal, commit: AssignmentCommit): Promise<void> {
    const { assignment, supersedesId } = commit;
    await this.run(principal, async (tx) => {
      if (supersedesId !== null) {
        // Compare-and-set on the ACTIVE status: if a concurrent assignment
        // already closed this row, zero rows match and we refuse rather than
        // inserting a second ACTIVE assignment. The partial unique index in
        // 0093 would catch that too; this produces the better error.
        const closed = await tx.transactionCategoryAssignment.updateMany({
          where: {
            id: supersedesId,
            tenantId: principal.tenantId,
            userId: principal.userId,
            status: 'ACTIVE',
          },
          data: {
            status: 'SUPERSEDED',
            supersededAt: assignment.assignedAt,
            supersededById: assignment.id,
          },
        });
        if (closed.count === 0) {
          throw new AssignmentConflictError(
            'the active category assignment changed while this one was being made; nothing was written',
          );
        }
      }
      await tx.transactionCategoryAssignment.create({
        data: {
          id: assignment.id,
          transactionId: assignment.transactionId,
          tenantId: assignment.tenantId,
          userId: assignment.userId,
          categoryCode: assignment.categoryCode,
          assignmentSource: assignment.assignmentSource,
          ruleVersion: assignment.ruleVersion,
          assignedBy: assignment.assignedBy,
          assignedAt: assignment.assignedAt,
          status: assignment.status,
          supersededById: assignment.supersededById,
          supersededAt: assignment.supersededAt,
        },
      });
    });
  }

  async listChain(
    principal: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<readonly TransactionCategoryAssignment[]> {
    const rows = await this.run(principal, (tx) =>
      tx.transactionCategoryAssignment.findMany({
        where: { transactionId, tenantId: principal.tenantId, userId: principal.userId },
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      }),
    );
    return rows.map((row) => toAssignment(row as AssignmentRow));
  }

  async findActive(
    principal: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<TransactionCategoryAssignment | null> {
    const row = await this.run(principal, (tx) =>
      tx.transactionCategoryAssignment.findFirst({
        where: {
          transactionId,
          tenantId: principal.tenantId,
          userId: principal.userId,
          status: 'ACTIVE',
        },
      }),
    );
    return row === null ? null : toAssignment(row as AssignmentRow);
  }
}

interface CategoryRow {
  code: string;
  parentCode: string | null;
  labelEn: string;
  labelAr: string;
  catalogueVersion: string;
  retiredAt: Date | null;
}

function toCategory(row: CategoryRow): FinancialCategory {
  return createFinancialCategory({
    code: row.code,
    parentCode: row.parentCode,
    labels: { en: row.labelEn, ar: row.labelAr },
    catalogueVersion: row.catalogueVersion,
    retiredAt: row.retiredAt,
  });
}

/**
 * Catalogue reads run WITHOUT a principal context, deliberately: the table is
 * outside RLS (allow-listed, migration 0092 header) because it has no
 * principal column, and karar_app holds SELECT only, so this is a read of
 * reference data and nothing else.
 */
export class PrismaFinancialCategoryCatalogue implements FinancialCategoryCatalogue {
  constructor(private readonly handle: PrismaHandle) {}

  async findByCode(code: CategoryCode): Promise<FinancialCategory | null> {
    const row = await this.handle.client.financialCategory.findUnique({ where: { code } });
    return row === null ? null : toCategory(row as CategoryRow);
  }

  async list(): Promise<readonly FinancialCategory[]> {
    const rows = await this.handle.client.financialCategory.findMany({
      orderBy: [{ code: 'asc' }],
    });
    return rows.map((row) => toCategory(row as CategoryRow));
  }
}

/**
 * The reviewed corpus, read and mapped — and NOTHING else.
 *
 * This class used to decide which rule won, and that is exactly what it must
 * not do. The decision lived in a loop over `findMany` with no `orderBy`,
 * keeping the first-seen rule among equally long patterns; PostgreSQL
 * promises no order for such a query, so two reviewed patterns of the same
 * length matching the same narrative resolved to whichever row the plan
 * happened to emit first. Same input, same corpus, two possible answers —
 * invisible until the day a tie exists, and then invisible again because the
 * two servers each looked internally consistent.
 *
 * Selection now lives in `domain/merchant-rules.ts` under a comparator that
 * is total, so no tie survives to be broken by a query plan. The `orderBy`
 * below is belt and braces on top of that: it makes the READ deterministic
 * too, so a test asserting on the corpus sees a stable sequence.
 *
 * `createMerchantRule` re-checks each row against the constraints migration
 * 0092 already enforces. That is not distrust of the database; it is the
 * boundary where "a row" becomes "a reviewed rule", and a malformed pattern
 * that got in some other way should stop here loudly rather than sit in the
 * corpus looking like a working rule while matching nothing.
 */
/**
 * The most active rules the directory will read.
 *
 * A ceiling rather than a page: the evaluator needs the WHOLE corpus to decide
 * (the most specific match wins), so a partial read is a wrong answer. The
 * number is a reviewed catalogue's order of magnitude, and a corpus that
 * outgrows it needs an indexed lookup rather than a bigger array.
 */
export const MAX_ACTIVE_MERCHANT_RULES = 10_000;

export class PrismaMerchantRuleDirectory implements MerchantRuleDirectory {
  constructor(private readonly handle: PrismaHandle) {}

  async listActiveRules(): Promise<readonly MerchantRule[]> {
    // Retired rules are excluded here rather than filtered later: a withdrawn
    // rule must not reach the decision at all. Withdrawal is `retired_at`,
    // never a deleted row, so the corpus stays reviewable.
    // BOUNDED. The evaluator re-reads the corpus on every call by design, and
    // the CSV commit calls it once per committed row — so an unbounded
    // `findMany` here is O(rows x corpus) per commit, with a statement able to
    // carry `maxRows` = 50,000. The ordering is total and deterministic, so a
    // corpus at the bound is truncated identically on every call rather than
    // arbitrarily; exceeding it is a refusal below, not a silent short read,
    // because a category decided from a partial corpus is a wrong answer that
    // looks like a right one.
    const rows = await this.handle.client.merchantRule.findMany({
      where: { retiredAt: null },
      select: { patternKind: true, patternToken: true, categoryCode: true, ruleVersion: true },
      orderBy: [{ patternToken: 'asc' }, { patternKind: 'asc' }, { ruleVersion: 'asc' }],
      take: MAX_ACTIVE_MERCHANT_RULES + 1,
    });
    if (rows.length > MAX_ACTIVE_MERCHANT_RULES) {
      throw new Error(
        `the active merchant-rule corpus exceeds ${String(MAX_ACTIVE_MERCHANT_RULES)} rules; ` +
          'categorisation is refused rather than decided from a truncated corpus',
      );
    }
    return rows.map((row) =>
      createMerchantRule({
        patternKind: row.patternKind,
        patternToken: row.patternToken,
        categoryCode: row.categoryCode,
        ruleVersion: row.ruleVersion,
      }),
    );
  }
}
