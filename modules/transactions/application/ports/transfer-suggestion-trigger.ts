/**
 * `TransferSuggestionTriggerPort` — after transactions are written, let the
 * platform look for the movements among them, declared INWARD here and
 * implemented by the transfer-matching module.
 *
 * ## The gap this port closes
 *
 * A wallet top-up from a bank account is ONE movement of the person's own money
 * that appears in the data TWICE, once on each side (ADR-0028). Left unrelated
 * it reads as an expense AND an income, so a month in which somebody moved
 * their own money looks like a month in which they earned and spent it.
 *
 * `modules/transfer-matching` has held the whole rule for that since Phase 5 —
 * and until this port existed, **nothing ever asked it a question.** Its
 * `SuggestTransferMatch` takes two ids a caller has already chosen, and no
 * caller chose any. The pairs were therefore never proposed, and a person had
 * no way to be asked about a movement the platform could see.
 *
 * ## Why THIS module declares it
 *
 * Ports are declared inward, by the module that owns the path (architecture
 * test 5), and this module owns what a written transaction IS. It is the same
 * arrangement `TransferMatchEraserPort` uses in the other direction of the same
 * relationship: `modules/transfer-matching` depends on this module, this module
 * depends on nothing of it, and the two meet at a declaration this module owns
 * and that module satisfies.
 *
 * **One declaration, not two.** `modules/statement-imports` calls this port as
 * well, after a reviewed statement commit lands, and it imports THIS type
 * rather than restating it — for the reason `transfer-match-eraser.ts` records:
 * two structurally identical declarations do not fail when they drift, they
 * diverge silently until an adapter satisfies one copy and no longer satisfies
 * the other.
 *
 * ## A caller may NEVER name the pair
 *
 * The parameter is a list of transactions that were WRITTEN, never a pairing.
 * That is the load-bearing part of the shape: a caller that could name two ids
 * as a pair would be asserting a relationship between two records it did not
 * observe, and the implementation would be recording that assertion as though
 * the platform had found it. The counterpart is found on the other side of this
 * port, from the subject's own rows, under the subject's own principal — and
 * there is deliberately no HTTP verb anywhere that reaches either.
 *
 * ## What it produces, and what it may never produce
 *
 * A `SUGGESTED` relationship, or nothing. **Not a confirmation**: only the
 * subject's own decision makes a match authoritative, and the table refuses
 * `CONFIRMED` without a recorded decision instant. **Not a change to any
 * transaction**: this port hands over identifiers and receives counts, and the
 * implementer never reaches back into the records it relates — no
 * recategorisation, no correction, no status move, no net figure, no total.
 *
 * ## Failure here must NEVER fail the write
 *
 * A transaction is the person's record of what happened to their money. A
 * suggestion is a QUESTION the product asks about it. If the question cannot be
 * asked, the record still stands — so both call sites treat any outcome other
 * than success as nothing at all, and both defend against a throw as well. The
 * asymmetry with `TransferMatchEraserPort` is deliberate and is the reason this
 * port is allowed to be best-effort where that one is not: a missing erasure
 * leaves a statement about a person's money that is now FALSE, while a missing
 * suggestion leaves a question unasked. The safe state for a suggestion is
 * absence.
 *
 * ## Idempotent by contract
 *
 * A second call over the same transactions produces no second suggestion. The
 * implementer's own rule — one transaction belongs to at most one LIVE match,
 * enforced by two partial unique indexes, a guard trigger and an advisory-lock
 * claim — is what makes that true, so a retry after a partial failure converges
 * instead of compounding, and a transaction written twice through two paths is
 * asked about once.
 */

import type { TransactionsPrincipal } from './principal-context.js';

export type TransferSuggestionPassOutcome =
  /**
   * The pass ran. `suggestionsWritten` counts ROWS and nothing else — never an
   * amount, never a figure derived from one. It is ordinarily zero: most
   * transactions are not half of a movement between a person's own accounts.
   */
  | { readonly kind: 'considered'; readonly suggestionsWritten: number }
  /**
   * The pass could not run, or could not finish. Carries the implementer's OWN
   * stable vocabulary, never a store's — driver text can carry a connection
   * string, the failing SQL, or a fragment of a person's record. Callers treat
   * this exactly as they treat a throw: the write stands, and no question was
   * asked.
   */
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface TransferSuggestionTriggerPort {
  /**
   * Looks for a counterpart for each of these newly-written transactions and
   * writes a `SUGGESTED` relationship where the rule finds one.
   *
   * **Principal-scoped, like every port here.** The implementation resolves
   * every candidate under the caller's own principal context, so a pair across
   * two subjects is not merely filtered out — the rows of another subject are
   * invisible to the search that would have to find them.
   *
   * `transactionIds` are plain strings rather than this module's branded
   * `TransactionId`, because the second call site — a reviewed statement commit
   * in `modules/statement-imports` — already holds them as strings and a brand
   * here would buy a cast at that call site instead of a type at either.
   *
   * Implementations MUST NOT throw and MUST be idempotent. Both call sites
   * defend against a throw anyway, because a transaction that failed to be
   * recorded because a question could not be asked would be the worse failure
   * by a wide margin.
   */
  suggestTransfersFor(
    actor: TransactionsPrincipal,
    transactionIds: readonly string[],
  ): Promise<TransferSuggestionPassOutcome>;
}

/**
 * The trigger that asks nothing, named so that its presence is a decision
 * rather than an omission.
 *
 * It is the DEFAULT on both call sites, for the same two reasons the
 * categorisation workstream gives for `CATEGORISES_NOTHING`: a suite about
 * retention, dedup or timezones should not have to stand up a transfer-matching
 * repository, and adding this collaborator should not require editing fixtures
 * inside two other workstreams' modules.
 *
 * **A default on a collaborator is normally how a pipeline silently stops being
 * one**, so the hole is closed explicitly rather than trusted: a test reads the
 * composition root's own source and fails if the real trigger stops being
 * passed at either call site
 * (`modules/transfer-matching/__tests__/suggestion-generation.test.ts`).
 *
 * The default is safe in a way a no-op eraser would not be. A missing erasure
 * leaves a statement about a person's money that is now false; a missing
 * suggestion leaves a question unasked, and both transactions stand exactly as
 * their sources reported them. Absence is the conservative state here.
 */
export const SUGGESTS_NO_TRANSFERS: TransferSuggestionTriggerPort = Object.freeze({
  suggestTransfersFor(): Promise<TransferSuggestionPassOutcome> {
    return Promise.resolve({ kind: 'considered', suggestionsWritten: 0 });
  },
});
