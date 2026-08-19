/**
 * `SourceObservationWriterPort` — one delivery that arrived through a source
 * link, recorded on a database transaction the CALLER already opened.
 *
 * ## Why this port exists
 *
 * `modules/statement-imports` turns a person's uploaded statement into
 * financial records, and when the file arrived through one of their
 * connections the link that carried it should say so: this platform heard
 * from that source, at this instant, covering these days. Those columns live
 * in `public.account_source_links` — a table THIS module owns, behind this
 * module's RLS policy, its guard trigger and its cascade. So the ingestion
 * module declares nothing about that table; it says a delivery landed, and
 * this module decides what that means in rows.
 *
 * It used to write the row itself. That was recorded honestly as the one
 * remaining cross-module write rather than left to be discovered, and it is
 * what this port closes.
 *
 * ## Why not `AccountSourceLinkRepository.update`, or `RecordSourceObservation`
 *
 * Three reasons, and each of them alone would be enough.
 *
 * `update` opens its OWN transaction through `withPrincipalContext`, and a
 * statement commit must land as ONE unit with the canonical records, the
 * staged rows' links and the import's state moves. A second transaction is
 * exactly the failure the ingestion module's unit of work exists to remove.
 *
 * It also takes a link id and the version the caller read. An importer has
 * neither: it knows which connection the file came through and which account
 * it is for, and finding the link from that means reading rows whose whole
 * point is that nobody reads them — the encrypted external account reference
 * and the keyed fingerprint. A port that made the importer read a link back
 * would put those two values on a code path that has no business holding
 * them.
 *
 * And a read-modify-write under optimistic concurrency can LOSE. Losing means
 * a `stale` outcome, and inside somebody's commit the only honest responses to
 * that are to abort the import or to ignore the loss — the first fails a
 * person's statement over a freshness report, the second is a retry loop
 * inside the widest transaction in the platform. A set-based update has
 * neither problem: it advances the token in the same statement that reads it.
 *
 * ## So the transaction itself is the parameter
 *
 * The caller opens exactly one unit of work, binds its principal into it, and
 * hands the open handle here. This write joins that unit: one commit, one
 * rollback, no subset. That is the same reasoning the transactional outbox
 * uses (ADR-0012) and the same shape `ImportedRecordCommitPort` has in
 * `modules/transactions` — a write that must not be able to land without
 * another write shares its transaction rather than trusting a sequence of
 * calls.
 *
 * **Freshness is TRANSACTIONAL here, deliberately, and the direction is what
 * decides it.** A stale `last_successful_import_at` after a commit is a
 * report that lags; a fresh one after a rollback is a claim that this
 * platform imported something it did not. Only the second is a lie, and the
 * only way to make it unwritable is to put the observation in the transaction
 * whose success it describes. Nothing about it is expensive: it is one
 * statement against an indexed predicate, with no key provider, no policy
 * pack and no service call behind it.
 *
 * `SourceObservationWriteUnit` is opaque on purpose. The application layer
 * holds a handle it cannot use; the adapter that created it, and the adapter
 * that joins it, know what it is. That keeps the ORM out of this layer
 * (architecture test 4) without pretending the transaction is not there.
 *
 * ## The direction, and why the port is declared on this side
 *
 * `modules/statement-imports` depends on this module; this module must not
 * depend back, or the two would form a cycle. So the contract for rows this
 * module owns is declared HERE and called from there — the same resolution
 * `ImportedRecordCommitPort` reached for the canonical transactions, and the
 * mirror image of `AccountSourceLinkEraserPort`, which `financial-accounts`
 * declares because it owns the deletion path while this module owns the rows.
 *
 * ## What this port cannot express, which is most of what a link is
 *
 * **An observation is a report, never a decision** — `RecordSourceObservation`
 * says it for this module's own callers and it is the same rule here. Nothing
 * reachable through this port can create a link, point one at a different
 * account, change its status, its match basis, its priority or its authority,
 * or record that a person confirmed anything. A code path where "we heard
 * from the source" promotes a probable match to a linked one is how a guess
 * becomes automatic with nobody having decided to allow it, and the narrow
 * shape below is what makes that unreachable rather than merely unintended.
 *
 * Nothing is returned except a count. There is no read here at all: this port
 * cannot be used to learn that a link exists, which connection feeds an
 * account, or anything about the source account behind it.
 */

import type { CanonicalAccountRef, FinancialConnectionId } from '../../domain/refs.js';
import type { HistoryCoverage } from '../../domain/account-source-link.js';
import type { ConnectionsPrincipal } from '../principal.js';

/**
 * An opaque handle to a database transaction the caller already opened.
 *
 * `unit` is deliberately `unknown`: the adapter that created it casts it back
 * to whatever it actually is, and no other code can do anything with it. A
 * typed transaction client here would put the ORM in the application layer.
 */
export interface SourceObservationWriteUnit {
  readonly unit: unknown;
}

/**
 * One delivery of data that actually arrived through a link.
 *
 * The link is addressed by WHAT IT IS FOR — this principal's connection,
 * feeding this account — rather than by id, because that is what a caller
 * delivering data honestly knows. A principal may hold more than one link
 * from one connection to one account (one per source account behind it), and
 * every one of them delivered, so every one of them is moved.
 *
 * `historyCoverage` is required and not nullable. A delivery that covered no
 * days is not a delivery worth reporting, and writing an empty range would
 * claim a source provided history it did not; a caller with nothing to say
 * does not call.
 */
export interface ObservedSourceDelivery {
  readonly connectionId: FinancialConnectionId;
  readonly accountRef: CanonicalAccountRef;
  /**
   * When the delivery landed.
   *
   * It moves `last_observed_at` AND `last_successful_import_at`, because this
   * port reports a delivery that WORKED — data arrived and was kept. There is
   * no way through here to say "we heard from the source but nothing came of
   * it", which would be a different fact needing its own name and its own
   * caller.
   */
  readonly observedAt: Date;
  /** The calendar days the delivered data covered (ADR-0027). */
  readonly historyCoverage: HistoryCoverage;
}

export interface SourceObservationWriterPort {
  /**
   * Records the delivery against every link it describes, on the caller's
   * open unit, and answers how many links moved.
   *
   * Adds no transaction of its own and commits nothing: the caller's unit
   * decides whether any of this survives, and a throw aborts that unit.
   *
   * **Zero is an ordinary answer, not a failure.** A person may import a file
   * without any connection, delete the connection it arrived through, or
   * never have linked the source account at all — and an import must not fail
   * because the route it came in by is gone. Implementations report the count
   * and raise nothing for it; a caller is free to ignore the number, and the
   * ingestion module does.
   */
  recordDeliveryObserved(
    unit: SourceObservationWriteUnit,
    actor: ConnectionsPrincipal,
    delivery: ObservedSourceDelivery,
  ): Promise<number>;
}
