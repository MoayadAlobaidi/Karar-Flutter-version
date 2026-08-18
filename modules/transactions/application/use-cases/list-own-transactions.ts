/**
 * ListOwnTransactions — one keyset page of the calling principal's own
 * transactions.
 *
 * OWN means own. The input carries no `userId` and no `tenantId`; the
 * principal is read from context, and the repository binds it into the
 * database session so RLS scopes the query. There is no "list for user X"
 * shape to abuse, by construction (MODULE.md: no `?userId=` parameter is
 * accepted anywhere).
 *
 * Page size is bounded by the platform's declared ingestion limit policy for
 * the manual-transaction path rather than by a constant invented here — a
 * limit that lives beside the code that uses it is a limit nobody can
 * inventory (packages/platform ingestion/limits.ts).
 */

import { Result } from '@karar/shared-kernel';
import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/index.js';

import { AccountRef } from '../../domain/refs.js';
import type { Transaction } from '../../domain/transaction.js';
import {
  principalContextMissing,
  toStoreFailure,
  type InvalidCursor,
  type PrincipalContextMissing,
  type StoreFailure,
} from '../errors.js';
import { decodeCursor, encodeCursor } from '../pagination.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

/** Declared bounds; a request above the maximum is clamped, never unbounded. */
export const TRANSACTION_PAGE_LIMITS = Object.freeze({
  max: INGESTION_LIMIT_POLICIES.manualTransaction.maxPageSize,
  default: INGESTION_LIMIT_POLICIES.manualTransaction.defaultPageSize,
});

export interface ListOwnTransactionsInput {
  /** Narrow to one account. Absent reads every account the principal owns. */
  readonly accountId?: string;
  /** Opaque cursor from a previous page. Absent starts at the newest row. */
  readonly cursor?: string;
  /** Requested page size; clamped into the declared bounds. */
  readonly limit?: number;
}

export interface TransactionPageView {
  readonly transactions: readonly Transaction[];
  /** Pass back as `cursor` for the next page; `null` when the list is exhausted. */
  readonly nextCursor: string | null;
}

export type ListOwnTransactionsError = PrincipalContextMissing | InvalidCursor | StoreFailure;

export class ListOwnTransactions {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
  ) {}

  async execute(
    input: ListOwnTransactionsInput = {},
  ): Promise<Result<TransactionPageView, ListOwnTransactionsError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());

    let after = null;
    if (input.cursor !== undefined) {
      const decoded = decodeCursor(input.cursor);
      if (!decoded.ok) return decoded;
      after = decoded.value;
    }

    const accountRef = input.accountId === undefined ? null : AccountRef.of(input.accountId);
    const limit = clampLimit(input.limit);

    try {
      const page = await this.transactions.page(principal, { accountRef, after, limit });
      return Result.ok({
        transactions: page.transactions,
        nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
      });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
  }
}

/**
 * Clamps rather than refuses. A caller asking for more than the ceiling gets
 * the ceiling — the alternative is a paging client that fails on a number it
 * cannot know in advance, while an unclamped limit is the unbounded read the
 * declared policy exists to prevent. A non-integer or non-positive request
 * falls back to the default for the same reason.
 */
function clampLimit(requested: number | undefined): number {
  if (requested === undefined || !Number.isInteger(requested) || requested < 1) {
    return TRANSACTION_PAGE_LIMITS.default;
  }
  return Math.min(requested, TRANSACTION_PAGE_LIMITS.max);
}
