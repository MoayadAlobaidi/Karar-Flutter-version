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
import type { TransactionId } from '../../domain/refs.js';
import {
  AssignmentConflictError,
  type AssignmentCommit,
  type CategoryAssignmentRepository,
  type FinancialCategoryCatalogue,
  type MerchantRuleDirectory,
  type MerchantRuleMatch,
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
 * Exact and prefix matching against the reviewed corpus, deterministic and
 * unscored. Retired rules never match: a rule is withdrawn by setting
 * `retired_at`, never by deleting the row, so the corpus stays reviewable.
 *
 * Ordering is by pattern length descending so the most specific reviewed
 * prefix wins — a total, deterministic rule with no weighting involved.
 */
export class PrismaMerchantRuleDirectory implements MerchantRuleDirectory {
  constructor(private readonly handle: PrismaHandle) {}

  async match(normalizedMerchant: string): Promise<MerchantRuleMatch | null> {
    if (typeof normalizedMerchant !== 'string' || normalizedMerchant.trim() === '') return null;
    const candidates = await this.handle.client.merchantRule.findMany({
      where: { retiredAt: null },
      select: { patternKind: true, patternToken: true, categoryCode: true, ruleVersion: true },
    });
    let best: { patternToken: string; categoryCode: string; ruleVersion: string } | null = null;
    for (const rule of candidates) {
      const matches =
        rule.patternKind === 'EXACT'
          ? normalizedMerchant === rule.patternToken
          : normalizedMerchant.startsWith(rule.patternToken);
      if (!matches) continue;
      if (best === null || rule.patternToken.length > best.patternToken.length) {
        best = {
          patternToken: rule.patternToken,
          categoryCode: rule.categoryCode,
          ruleVersion: rule.ruleVersion,
        };
      }
    }
    return best === null
      ? null
      : { categoryCode: CategoryCode.of(best.categoryCode), ruleVersion: best.ruleVersion };
  }
}
