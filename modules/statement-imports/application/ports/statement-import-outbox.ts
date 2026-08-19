/**
 * `StatementImportOutboxPort` — the identifier-only notice a commit enqueues,
 * on the commit's OWN transaction.
 *
 * ## Why the transaction is a parameter
 *
 * The transactional outbox exists so that a state change and its event commit
 * or roll back together (ADR-0012). There is no path that publishes an event
 * for a change that did not commit, and none that commits a change whose
 * event is lost — and the only way to keep that true is for the envelope
 * INSERT to share the caller's transaction. A port that opened its own
 * connection would be a second transaction, which is the exact failure the
 * outbox pattern exists to remove.
 *
 * `CommitUnit` is opaque on purpose. The application layer holds a handle it
 * cannot use; the adapter that created it knows what it is. That keeps the
 * ORM out of this layer (architecture test 4) without pretending the
 * transaction does not exist.
 *
 * ## Identifier-only, and there is no exemption to widen it
 *
 * The notice carries an import id, an account id, a count and an instant. No
 * merchant, no amount, no currency, no date range, no narrative, no account
 * name, no filename. An event payload leaves this database — to a relay, a
 * bus, a consumer, a log — and a `HIGHLY_SENSITIVE_FINANCIAL` event carrying
 * anything beyond identifiers needs a catalogue exemption naming an owner, a
 * reason and a reviewer. This one needs none, because it carries nothing.
 *
 * A count is not a value: "this import produced 312 transactions" says
 * nothing about any of them. It is included because a consumer needs to know
 * whether anything happened at all, and a notice that cannot answer that is a
 * notice nobody can act on.
 *
 * ## The catalogue entry does not exist yet
 *
 * `packages/api-contracts/events/catalogue.json` belongs to the platform and
 * this module cannot add to it. `makeEnvelope` refuses an uncatalogued name,
 * so no production path can publish this notice until the lead adds the entry
 * — which is the correct failure mode, and is recorded in MODULE.md rather
 * than worked around here.
 */

import type { StatementImportCommittedNotice } from './statement-commit.js';
import type { ImportsPrincipal } from '../principal.js';

/**
 * An opaque handle to the ONE database transaction a commit runs in.
 *
 * `unit` is deliberately `unknown`: the adapter that created it casts it back
 * to whatever it actually is, and no other code can do anything with it. A
 * typed transaction client here would put the ORM in the application layer.
 */
export interface CommitUnit {
  readonly unit: unknown;
}

export interface StatementImportOutboxPort {
  /**
   * Records the notice on the caller's transaction.
   *
   * Throws rather than returning a failure arm: a notice that could not be
   * recorded must roll the commit back, because the alternative is a set of
   * financial records nothing downstream is ever told about.
   */
  record(
    unit: CommitUnit,
    actor: ImportsPrincipal,
    notice: StatementImportCommittedNotice,
  ): Promise<void>;
}
