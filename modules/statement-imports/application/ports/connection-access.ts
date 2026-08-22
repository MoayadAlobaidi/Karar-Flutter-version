/**
 * `ConnectionAccessPort` — the one question this module asks about the
 * connection an import names, declared inward and satisfied by an adapter
 * over `@karar/financial-connections`' repository in the composition root.
 *
 * ## Why it has to exist at all
 *
 * `connectionId` on a statement import is a PROVENANCE claim: it says this
 * file arrived through that route. The contract for the field says "the
 * caller's own USER_FILE_UPLOAD connection", and before this port existed
 * three of those four words were unenforced — the identifier was checked for
 * UUID SHAPE and written onto the row. A caller could stamp their own import
 * with a connection id that names nothing, or one of their own connections on
 * the `MANUAL` rail, which means "the person typed this in". An import
 * attributed to MANUAL is a statement that Karar received a file through a
 * route whose entire definition is that no file arrives on it, and at commit
 * it moved `last_successful_import_at` on that link. On a platform whose
 * promise is to say where each figure came from, provenance nobody checks is
 * worse than no provenance: it reads as verified.
 *
 * This is not, and never was, a cross-tenant hole. The connection column
 * carries no foreign key, so a bad value was not an existence oracle, and the
 * one write that reads it back is scoped by tenant, user, connection AND
 * account. What was wrong is that the row could claim something untrue about
 * the subject's own data.
 *
 * ## What it answers, and what it deliberately cannot
 *
 * Two facts: does this connection exist FOR THIS PRINCIPAL, and what rail is
 * it on. Nothing else — no display label (it is `HIGHLY_SENSITIVE_FINANCIAL`
 * and this module has no business decrypting it), no institution, no status,
 * no source link, no external account reference, no fingerprint.
 *
 * **There is no method here that takes an account.** That absence is a
 * decision, argued below, not a gap left for someone to fill: a port that
 * could ask "does this connection feed that account" is a port through which
 * a rule requiring the answer to be yes can be written, and such a rule is
 * unsatisfiable at the moment this module asks. Keeping the question
 * inexpressible is what stops the rule being reintroduced by someone reading
 * only the field's description.
 *
 * ### Why the connection is NOT required to be linked to the target account
 *
 * A connection is a ROUTE, not an attribute of an account. Migration 0088
 * removed the source column from `financial_accounts` precisely so that one
 * connection could feed many accounts and one account could be fed by many
 * connections (ADR-0028); a rule tying an import's connection to its account
 * would put that relationship back, one gate at a time.
 *
 * The relationship the platform does model is `account_source_links`, and it
 * cannot answer here. A link is minted from the SOURCE ACCOUNT the file
 * names — `ProposeAccountSourceLink` needs an external account reference —
 * and `StartStatementImport` runs before a single byte has been uploaded, let
 * alone parsed. Requiring a link at DRAFT would refuse the first import
 * through every connection anybody ever creates, which is the ordinary case,
 * not the edge one.
 *
 * `SourceObservationWriterPort` in `@karar/financial-connections` already
 * settles the question in the other direction and says so in its own
 * contract: zero moved links is an ORDINARY answer, and one of the ordinary
 * reasons it names is that the subject "never [had] linked the source account
 * at all". A gate here demanding what that contract calls optional would make
 * the two modules disagree about the same fact.
 *
 * So the untrue claim this module can refuse is "a file arrived on a rail
 * that carries no files", and it refuses that. "This route also feeds other
 * accounts of mine" is not untrue, and there is nothing here to refuse.
 */

import type { ImportsPrincipal } from '../principal.js';
import type { ConnectionRef } from '../../domain/refs.js';

/**
 * The rails a statement import may name, restated rather than imported.
 *
 * **The full rail vocabulary is deliberately NOT restated here.** The
 * connections module names thirteen rails and implements two, and this module
 * has exactly one question about any of them: may a file the subject uploaded
 * have arrived on it. Only `USER_FILE_UPLOAD` may — that is what the rail
 * MEANS — and `MANUAL` may not, because a hand-typed ledger is the one route
 * on which no file ever arrives.
 *
 * Naming only the affirmative set is stronger than restating all thirteen: a
 * rule in this module keyed on any other rail is not merely absent, it is
 * unwritable, because no name for one exists in this layer. A rail
 * implemented later reaches `isImportableRail` as an unrecognised string and
 * is refused, which is the fail-closed reading — widening this list is then a
 * reviewed change in the one place a reviewer would look.
 */
export const IMPORTABLE_CONNECTION_RAILS = ['USER_FILE_UPLOAD'] as const;
export type ImportableConnectionRail = (typeof IMPORTABLE_CONNECTION_RAILS)[number];

export function isImportableRail(rail: string): rail is ImportableConnectionRail {
  return (IMPORTABLE_CONNECTION_RAILS as readonly string[]).includes(rail);
}

export interface ConnectionSummary {
  readonly connectionRef: ConnectionRef;
  /**
   * A raw string rather than the union, deliberately — the same reasoning
   * `CanonicalAccountSummary.lifecycleState` carries. A rail the connections
   * module implements later must arrive here as an unrecognised value that
   * this module REFUSES, not as a type error that stops the build or, worse,
   * a silent widening that makes a new rail importable because nobody
   * narrowed it.
   */
  readonly rail: string;
}

export interface ConnectionAccessPort {
  /**
   * The connection, or `null` when it is not visible to this principal.
   *
   * `null` covers absent, another user's, another tenant's and never-minted,
   * indistinguishably — exactly as `resolveOwnAccount` does. Anything else
   * would turn a guessed identifier into a membership test over somebody
   * else's connection inventory, and "does this person hold a connection to
   * that bank" is a question about their finances even when the answer
   * carries no other field.
   */
  resolveOwnConnection(
    actor: ImportsPrincipal,
    connectionRef: ConnectionRef,
  ): Promise<ConnectionSummary | null>;
}
