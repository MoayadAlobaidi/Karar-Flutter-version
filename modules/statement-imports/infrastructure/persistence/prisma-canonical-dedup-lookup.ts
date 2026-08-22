/**
 * `CanonicalDedupLookupPort` over Prisma.
 *
 * Reads `public.transactions` — rows `modules/transactions` owns — for one
 * question and one only: which occurrence ordinals of these content
 * identities are already recorded for this principal on this account.
 *
 * **It selects two columns.** `dedupFingerprint` and `occurrenceOrdinal`, and
 * nothing else. No amount, no date, no narrative, no transaction id. A
 * preview built on this can say "12 of these lines are already recorded"
 * without being able to say anything at all about the records they match, and
 * the `select` is what makes that structural rather than a promise about how
 * callers behave.
 *
 * Every statement runs inside `withPrincipalContext`, so the RLS policies on
 * `public.transactions` decide visibility. That is load-bearing here and not
 * merely conventional: this file reads another module's table, and the answer
 * it gives determines whether somebody's spending is recorded a second time.
 * The `where` clause naming tenant and user is Layer-2 convenience; the policy
 * is the boundary.
 *
 * ## Why the fingerprint list is chunked
 *
 * A statement can carry fifty thousand rows, and `IN (...)` with fifty
 * thousand parameters is a query planners' problem and a driver's problem
 * before it is a correctness problem. The chunk size is a local constant
 * because it is a property of the query rather than of the ingestion path —
 * `csvStatementImport.maxBatchSize` bounds what a COMMIT writes per batch,
 * which is a different question with a different answer.
 */

import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type {
  CanonicalDedupLookupPort,
  RecordedOccurrences,
} from '../../application/ports/canonical-dedup-lookup.js';
import type { ImportsPrincipal } from '../../application/principal.js';
import type { CanonicalAccountRef } from '../../domain/refs.js';

/** How many digests one `IN (...)` may carry. A query property, not a policy. */
const LOOKUP_CHUNK = 500;

export class PrismaCanonicalDedupLookupReader implements CanonicalDedupLookupPort {
  constructor(private readonly handle: PrismaHandle) {}

  private inContext<T>(
    actor: ImportsPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      { tenantId: actor.tenantId, userId: actor.userId },
      fn,
      { require: ['tenantId', 'userId'] },
    );
  }

  async recordedOccurrences(
    actor: ImportsPrincipal,
    accountRef: CanonicalAccountRef,
    fingerprintVersion: string,
    fingerprints: readonly string[],
  ): Promise<readonly RecordedOccurrences[]> {
    const unique = [...new Set(fingerprints)];
    if (unique.length === 0) return [];

    const byFingerprint = new Map<string, number[]>();
    await this.inContext(actor, async (tx) => {
      for (let offset = 0; offset < unique.length; offset += LOOKUP_CHUNK) {
        const chunk = unique.slice(offset, offset + LOOKUP_CHUNK);
        const rows = await tx.transaction.findMany({
          where: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            accountId: accountRef.accountId,
            fingerprintVersion,
            dedupFingerprint: { in: chunk },
          },
          select: { dedupFingerprint: true, occurrenceOrdinal: true },
        });
        for (const row of rows) {
          const ordinals = byFingerprint.get(row.dedupFingerprint) ?? [];
          ordinals.push(row.occurrenceOrdinal);
          byFingerprint.set(row.dedupFingerprint, ordinals);
        }
      }
    });

    return [...byFingerprint.entries()].map(([fingerprint, ordinals]) =>
      Object.freeze({
        fingerprint,
        ordinals: Object.freeze([...ordinals].sort((left, right) => left - right)),
      }),
    );
  }
}
