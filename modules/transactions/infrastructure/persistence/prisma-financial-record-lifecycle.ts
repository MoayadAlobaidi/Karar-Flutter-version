/**
 * The two adapters `modules/financial-accounts` consumes: financial-record
 * presence, and account-scoped erasure.
 *
 * They live here, in the module that owns the rows, so that accounts never
 * imports transactions. The composition root binds these instances into the
 * accounts use cases; the ports they implement are declared in
 * `application/ports/financial-record-lifecycle.ts`, which explains why the
 * declaration exists on both sides.
 *
 * Both run inside the platform's `withPrincipalContext` transaction, so the
 * RLS policies on all four tables decide what is visible and what is
 * deletable. That is not a convenience: the accounts module is asking about
 * `HIGHLY_SENSITIVE_FINANCIAL` rows it cannot see, and the only correct
 * scoping for the answer is the principal's own, enforced by the database
 * rather than by a `where` clause in this file. The explicit predicates below
 * are defence in depth that catches honest mistakes early; RLS is the
 * boundary.
 *
 * `PrismaFinancialRecordEraser` does not carry one of the adapter-name
 * suffixes architecture test 5 recognises — `Eraser` says exactly what it is,
 * and renaming it to satisfy a name pattern would trade the clearer name for
 * a weaker one. It implements `FinancialRecordEraserPort` explicitly, and the
 * suite asserts the binding directly.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { withPrincipalContext } from '@karar/platform/dist/db/principal-context.js';

import type {
  FinancialRecordErasureCounts,
  FinancialRecordErasureOutcome,
  FinancialRecordEraserPort,
  FinancialRecordPresence,
  FinancialRecordPresencePort,
} from '../../application/ports/financial-record-lifecycle.js';
import type { TransactionsPrincipal } from '../../application/ports/principal-context.js';
import type { FinancialAccountId } from '@karar/financial-accounts';

/** PostgreSQL counts arrive as bigint; the driver hands them over as BigInt. */
function toCount(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    // Not reachable with any real subject's data, and still not silently
    // truncated: a count that lost precision would make an erasure report a
    // number nobody could reconcile against the rows that went.
    throw new Error(`a row count of ${value.toString()} exceeds exact integer range`);
  }
  return Number(value);
}

export class PrismaFinancialRecordPresenceReader implements FinancialRecordPresencePort {
  constructor(private readonly handle: PrismaHandle) {}

  async hasAnyRecordForAccount(
    actor: TransactionsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<FinancialRecordPresence> {
    // EXISTS, not COUNT, and not a row: the caller's question is "may this
    // account's currency still change", the answer to which is one bit. A
    // count would tell the accounts module how much this person transacts,
    // and a row would hand it the narrative this module encrypts at rest.
    //
    // Both tables that carry an account reference are checked. Provenance
    // has its own account_id, and the honest reading of "any record about
    // this account" is the union of the two — if they could ever disagree, a
    // currency change should be blocked by either, not by whichever one this
    // file happened to look at.
    const rows = await withPrincipalContext(
      this.handle,
      { tenantId: actor.tenantId, userId: actor.userId },
      (tx) => tx.$queryRaw<Array<{ present: boolean }>>`
        SELECT EXISTS (
          SELECT 1
            FROM public.transactions
           WHERE tenant_id = ${actor.tenantId}::uuid
             AND user_id = ${actor.userId}::uuid
             AND account_id = ${accountId}::uuid
          UNION ALL
          SELECT 1
            FROM public.transaction_provenance
           WHERE tenant_id = ${actor.tenantId}::uuid
             AND user_id = ${actor.userId}::uuid
             AND account_id = ${accountId}::uuid
        ) AS present`,
    );
    // The account id is echoed at the type it arrived as, so the caller's own
    // branded identifier survives the round trip through a module that
    // deliberately never names it.
    return { accountId, hasAnyRecord: rows[0]?.present === true };
  }
}

interface ErasureRow {
  readonly transactions: bigint;
  readonly revisions: bigint;
  readonly provenance: bigint;
  readonly category_assignments: bigint;
  readonly dedup_identities: bigint;
  readonly removed_transactions: bigint;
}

export class PrismaFinancialRecordEraser implements FinancialRecordEraserPort {
  constructor(private readonly handle: PrismaHandle) {}

  async eraseAccountScopedRecords(
    actor: TransactionsPrincipal,
    accountId: string,
  ): Promise<FinancialRecordErasureOutcome> {
    // ONE statement, so counting and deleting cannot disagree. Every CTE in a
    // statement sees the same snapshot, so `tallied` reports what existed
    // before the delete no matter what order the planner picks — which is the
    // only way "how many revisions went" can be answered at all, since the
    // children go by ON DELETE CASCADE and a cascade reports nothing.
    //
    // Counting the children and deleting them in separate round trips would
    // be a different operation: two snapshots, and a count that can drift
    // from what actually went.
    let rows: ErasureRow[];
    try {
      rows = await withPrincipalContext(
        this.handle,
        { tenantId: actor.tenantId, userId: actor.userId },
        (tx) => tx.$queryRaw<ErasureRow[]>`
        WITH doomed AS (
          SELECT id, fingerprint_version, dedup_fingerprint, occurrence_ordinal
            FROM public.transactions
           WHERE tenant_id = ${actor.tenantId}::uuid
             AND user_id = ${actor.userId}::uuid
             AND account_id = ${accountId}::uuid
        ),
        tallied AS (
          SELECT
            (SELECT count(*) FROM doomed) AS transactions,
            (SELECT count(*) FROM public.transaction_revisions
              WHERE transaction_id IN (SELECT id FROM doomed)) AS revisions,
            (SELECT count(*) FROM public.transaction_provenance
              WHERE transaction_id IN (SELECT id FROM doomed)) AS provenance,
            (SELECT count(*) FROM public.transaction_category_assignments
              WHERE transaction_id IN (SELECT id FROM doomed)) AS category_assignments,
            (SELECT count(DISTINCT (fingerprint_version, dedup_fingerprint, occurrence_ordinal))
               FROM doomed) AS dedup_identities
        ),
        removed AS (
          DELETE FROM public.transactions
           WHERE id IN (SELECT id FROM doomed)
          RETURNING id
        )
        SELECT tallied.transactions,
               tallied.revisions,
               tallied.provenance,
               tallied.category_assignments,
               tallied.dedup_identities,
               (SELECT count(*) FROM removed) AS removed_transactions
          FROM tallied`,
      );
    } catch (error) {
      // Nothing could be established, and the transaction is already rolled
      // back. `failed` rather than `incomplete`: no row went, so an immediate
      // retry is safe — which is a different instruction to the caller.
      return {
        kind: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    const row = rows[0];
    if (row === undefined) {
      return {
        kind: 'failed',
        reason:
          'the erasure statement returned no row; nothing may be reported as erased on an answer that never arrived',
      };
    }

    const deleted: FinancialRecordErasureCounts = {
      FINANCIAL_RECORD: toCount(row.removed_transactions),
      FINANCIAL_RECORD_REVISION: toCount(row.revisions),
      FINANCIAL_RECORD_PROVENANCE: toCount(row.provenance),
      FINANCIAL_RECORD_CATEGORY_ASSIGNMENT: toCount(row.category_assignments),
    };
    // The self-check that keeps a partial erasure from being reported as a
    // success. It should be unreachable — counting and deleting happen in one
    // statement over one snapshot — which is exactly why it is worth having:
    // if the invariant ever stops holding, the caller is told, rather than
    // being handed counts that no longer describe what went.
    if (row.transactions !== row.removed_transactions) {
      return {
        kind: 'incomplete',
        deleted,
        reason:
          `${row.transactions.toString()} record(s) matched but ` +
          `${row.removed_transactions.toString()} were deleted`,
      };
    }
    // The dedup identity has no count of its own because it has no table of
    // its own — it is columns on the transaction row. Asserted here rather
    // than assumed, so a future dedup side table cannot slip past unerased.
    if (row.dedup_identities !== row.removed_transactions) {
      return {
        kind: 'incomplete',
        deleted,
        reason:
          `${row.dedup_identities.toString()} dedup identities were scoped to ` +
          `${row.removed_transactions.toString()} erased records; the two must match, because a dedup ` +
          'identity that outlived its record would refuse a later commit as a duplicate of something gone',
      };
    }
    return { kind: 'erased', deleted };
  }
}
