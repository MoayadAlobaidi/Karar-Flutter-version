/**
 * Persistence ports for categorisation — the subject-scoped assignment chain
 * and the platform-global catalogue, deliberately separate.
 *
 * They are separate because they sit on opposite sides of the subject
 * boundary. `transaction_category_assignments` is `SUBJECT_DERIVED` and
 * RLS-FORCEd on both principal GUCs; `financial_categories` is
 * `NON_PERSONAL_BY_DESIGN` reference data with no tenant, user, or account
 * column at all (MODULE.md). One port that read both would need a principal
 * to read the catalogue, which would be a fiction, or would read assignments
 * without one, which would be a hole.
 */

import type {
  AssignmentSource,
  TransactionCategoryAssignment,
} from '../../domain/category-assignment.js';
import type { CategoryCode, FinancialCategory } from '../../domain/category-catalogue.js';
import type { MerchantRule } from '../../domain/merchant-rules.js';
import type { TransactionId } from '../../domain/refs.js';
import type { TransactionsPrincipal } from './principal-context.js';

/**
 * What one assignment writes: the new row, plus the id of the ACTIVE row it
 * supersedes. Both happen in one statement pair inside one transaction, so no
 * reader ever observes two ACTIVE assignments or none.
 */
export interface AssignmentCommit {
  readonly assignment: TransactionCategoryAssignment;
  /** The ACTIVE assignment being replaced, or `null` on the first assignment. */
  readonly supersedesId: string | null;
}

/**
 * Raised when the ACTIVE assignment changed between the caller's read and its
 * write — two concurrent assignments would otherwise both believe they
 * superseded the same row and leave two ACTIVE rows behind.
 */
export class AssignmentConflictError extends Error {
  override readonly name = 'AssignmentConflictError';
}

export interface CategoryAssignmentRepository {
  /**
   * Atomically marks `supersedesId` SUPERSEDED (pointing at the new row) and
   * inserts the new ACTIVE assignment. Throws `AssignmentConflictError` when
   * `supersedesId` is no longer the ACTIVE row.
   */
  assign(principal: TransactionsPrincipal, commit: AssignmentCommit): Promise<void>;

  /** The full chain for one transaction, unordered; the domain orders it. */
  listChain(
    principal: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<readonly TransactionCategoryAssignment[]>;

  /** The single ACTIVE assignment, or `null`. */
  findActive(
    principal: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<TransactionCategoryAssignment | null>;
}

/**
 * Read access to the platform catalogue. No principal: the catalogue belongs
 * to no tenant and no subject, and asking for one would imply a relationship
 * the table is built to be incapable of.
 *
 * Read-only by design. The catalogue changes by reviewed migration, the same
 * discipline the permissions catalogue follows (migration 0050) — so no
 * runtime write path exists to be authorized, rate-limited, or abused.
 */
export interface FinancialCategoryCatalogue {
  findByCode(code: CategoryCode): Promise<FinancialCategory | null>;
  /** Every entry, retired ones included; the caller decides what is assignable. */
  list(): Promise<readonly FinancialCategory[]>;
}

/**
 * The reviewed merchant-rule corpus, read-only from this module.
 *
 * **This port READS, it does not DECIDE.** It hands back the live rules and
 * nothing more; which of them applies to a narrative is
 * `domain/merchant-rules.ts`, and it is there rather than here for two
 * reasons that both bite in practice. A selection rule living in an adapter
 * is a selection rule nobody can unit-test without a database, so the
 * tie-break between two matching patterns goes unexercised until it is wrong
 * in production. And an adapter that reduces rows to one answer inherits
 * whatever order the database returned them in — for an unordered `SELECT`,
 * no order at all — which makes the answer depend on the query plan. The
 * domain's comparator is total, so it does not.
 *
 * There is no score, no confidence and no ordered candidate list anywhere on
 * this surface: a rule matched or it did not (MODULE.md: deterministic only;
 * no AI, no LLM).
 *
 * The corpus itself carries **no subject linkage of any kind** — no tenant,
 * no user, no account, no statement row, and no verbatim customer narrative
 * (migration 0092 enforces the shape structurally). Patterns are reviewed and
 * generalised before entry. That is also why this port takes no principal:
 * there is no predicate to bind, and asking for one would imply a
 * relationship the table is built to be incapable of. What IS subject-scoped
 * is everything the decision is then applied to — the transaction read and
 * the assignment written both go through `CategoryAssignmentRepository` and
 * `TransactionRepository` above, which are RLS-FORCEd on both principal GUCs.
 */
export interface MerchantRuleDirectory {
  /**
   * Every rule currently in force — retired ones excluded, because a rule is
   * withdrawn by setting `retired_at` rather than by deleting the row, so the
   * corpus stays reviewable and a withdrawn rule stays visible to an auditor
   * while matching nothing.
   *
   * Order is not part of the contract. The domain's selection is total, so a
   * caller cannot depend on one.
   */
  listActiveRules(): Promise<readonly MerchantRule[]>;
}

/** Re-exported so callers of the assignment flow name the same source union. */
export type { AssignmentSource };
