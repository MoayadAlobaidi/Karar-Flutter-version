/**
 * `SourceObservationWriterPort` over Prisma — one delivery recorded against
 * the links it arrived through, on a transaction somebody else opened.
 *
 * ## Why a class named for an import's freshness lives in this module
 *
 * It writes `public.account_source_links`, and this module owns that table.
 * The write used to live in `modules/statement-imports`' commit unit of work,
 * where it was recorded as the one remaining cross-module write rather than
 * left to be discovered; this is the move that closes it, on the same
 * precedent as `FinancialAccountsSourceLinkEraser` — that class also lives
 * here and satisfies a need another module has, so that module never reaches
 * into these rows.
 *
 * ## It opens no transaction, and that is the entire point
 *
 * `PrismaAccountSourceLinkRepository` wraps every statement in its OWN
 * `withPrincipalContext` transaction. A statement commit cannot be built out
 * of those: the canonical records, the staged rows' links back to them, the
 * import's state moves and this observation have to land as ONE unit, or a
 * link claims a successful import that rolled back. So the caller opens the
 * unit, binds its principal into it, and this joins it. The handle arrives
 * opaque and is cast back HERE, by the layer that knows what it is — the same
 * discipline `PrismaStatementCommitWriter` and the outbox recorder use.
 *
 * **RLS is still the boundary.** The GUCs are already bound on the caller's
 * transaction, so the policy on this table decides which rows this statement
 * can reach; the tenant and user columns in the predicate below are Layer-2
 * convenience, and removing them would change nothing about which rows move.
 *
 * ## One statement, and why it is a set-based UPDATE rather than a fold
 *
 * The domain's `recordSourceObservation` folds an observation into a link and
 * `RecordSourceObservation` persists the result — read, decide, write, under
 * optimistic concurrency. That is the right shape for a caller acting ON a
 * link, and the wrong shape here for three reasons the port sets out: it
 * needs a link id and a version an importer does not have, reading the link
 * back would decrypt an external account reference nothing on this path
 * should hold, and a lost update inside somebody's commit could only be
 * answered by failing their import or by retrying inside the widest
 * transaction in the platform.
 *
 * So the columns the fold would have produced are written directly, in one
 * statement, over the links the delivery describes. The set is exactly the
 * observation window, the coverage and the concurrency token; every column
 * that says WHAT a link is — the account, the connection, the fingerprint,
 * the status, the match basis, the confirmation — is absent from `data`, so
 * this file could not move one if a later edit tried.
 *
 * `version: { increment: 1 }` is not bookkeeping. `account_source_links_guard`
 * raises SQLSTATE `KAR22` on any UPDATE that does not advance the token by
 * exactly one, so a write without it does not silently skip the increment —
 * it aborts the caller's whole transaction. Prisma's atomic increment
 * advances each matched row from its own value, which is what makes one
 * statement over several rows correct.
 *
 * `updated_at` is deliberately absent too: the guard assigns it `now()` on
 * every UPDATE, so a value passed here would be written and immediately
 * overwritten, which reads like a decision this file did not take.
 *
 * ## The rows it will not move, and why skipping beats raising
 *
 * `account_source_links_observation_order_check` refuses a `last_observed_at`
 * earlier than `first_observed_at`. A link first seen AFTER this delivery
 * landed is a clock problem — a skewed host, a restored row — and it is not
 * the importer's to answer. Raising would abort somebody's statement commit
 * over a freshness report about a different module's row, so the predicate
 * excludes such links instead and the count says how many actually moved.
 * The same predicate covers `..._import_within_observation_check`, which is
 * the identical comparison against the same instant.
 *
 * ## No refusal is expected, and one arriving must not travel as driver text
 *
 * Between the predicate above, the increment, and the columns absent from
 * `data`, every rule this table enforces is already satisfied before the
 * statement runs: nothing here can trip `KAR20`, `KAR21`, `KAR22` or `KAR23`,
 * and neither CHECK on the observation window can fire. So a database refusal
 * reaching this catch is a DEFECT — in this file, the schema, or the guard —
 * and it is reported as one, in this module's own sentence naming the
 * SQLSTATE.
 *
 * The reason it is not simply rethrown is where it would land. This runs
 * inside another module's statement commit, and driver text can carry a
 * connection string, the failing SQL, or a fragment of the ciphertext of an
 * external account reference — the protected value this module exists to keep
 * from leaving. So the original rides along NON-ENUMERABLE for the one
 * boundary allowed to log it, exactly as `FinancialAccountsSourceLinkEraser`
 * does with the reasons it reports.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaTransactionClient } from '@karar/platform/dist/db/principal-context.js';

import type {
  ObservedSourceDelivery,
  SourceObservationWriteUnit,
  SourceObservationWriterPort,
} from '../../application/ports/source-observation-writer.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import { FinancialConnectionsStoreError } from '../../domain/errors.js';
import { sqlStateOf } from './prisma-account-source-link-repository.js';
import { calendarDayToDate } from './row-mappers.js';

export class PrismaSourceObservationWriter implements SourceObservationWriterPort {
  async recordDeliveryObserved(
    unit: SourceObservationWriteUnit,
    actor: ConnectionsPrincipal,
    delivery: ObservedSourceDelivery,
  ): Promise<number> {
    const { start, end } = delivery.historyCoverage;
    if (start.isAfter(end)) {
      // A range that ends before it begins describes nothing, and it is a
      // defect in the caller rather than a fact about anyone's data. It
      // throws rather than being reported, because the alternative is letting
      // `account_source_links_history_coverage_order` fire inside somebody
      // else's transaction: both abort, and only one of them says what
      // happened without quoting the driver.
      throw new FinancialConnectionsStoreError(
        'a delivery cannot cover a history range that ends before it begins',
      );
    }

    const tx = unit.unit as PrismaTransactionClient;
    try {
      const written = await tx.accountSourceLink.updateMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
          connectionId: delivery.connectionId,
          accountId: delivery.accountRef.accountId,
          accountReferenceType: delivery.accountRef.referenceType,
          firstObservedAt: { lte: delivery.observedAt },
        },
        data: {
          lastObservedAt: delivery.observedAt,
          lastSuccessfulImportAt: delivery.observedAt,
          historyCoverageStart: calendarDayToDate(start),
          historyCoverageEnd: calendarDayToDate(end),
          version: { increment: 1 },
        },
      });
      return written.count;
    } catch (error) {
      const sqlState = sqlStateOf(error);
      if (sqlState === null) throw error;
      throw storeRefusal(sqlState, error);
    }
  }
}

/**
 * A refusal this module did not expect, as this module's own sentence.
 *
 * The SQLSTATE is named because it is the one part of a database refusal that
 * is a stable identifier rather than prose — the same reason the repository
 * reads it structurally instead of matching a message.
 */
function storeRefusal(sqlState: string, cause: unknown): FinancialConnectionsStoreError {
  const refusal = new FinancialConnectionsStoreError(
    `recording a source delivery was refused by the database with SQLSTATE ${sqlState}; an ` +
      'observation satisfies every rule on account_source_links before it runs, so this is a ' +
      'defect rather than an outcome. The refusal itself is deliberately not quoted here',
  );
  Object.defineProperty(refusal, 'cause', {
    value: cause,
    enumerable: false,
    writable: false,
  });
  return refusal;
}
