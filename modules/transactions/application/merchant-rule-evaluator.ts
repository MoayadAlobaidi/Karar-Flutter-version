/**
 * `MerchantRuleEvaluator` — the ONE place merchant text becomes a category.
 *
 * Both write paths that can produce a categorised transaction go through this
 * object and no other: `CreateManualTransaction` (a person types a movement)
 * and the reviewed CSV canonical commit in `modules/statement-imports` (four
 * hundred lines at once, through the `DeterministicCategoryPort` seam its
 * adapter fills from here). There is deliberately no second implementation,
 * because two implementations of "which category is this?" is two answers to
 * the same question, and the day they diverge is the day the same merchant
 * categorises one way when typed and another way when imported — with nothing
 * in either record to say why.
 *
 * ## What it does, and the short list of what it is not allowed to do
 *
 * It reads the reviewed corpus through `MerchantRuleDirectory`, hands it and
 * the narrative to the pure functions in `domain/merchant-rules.ts`, and
 * returns what they decided. It applies no fallback, consults no clock, reads
 * no country, no currency and no amount, and keeps no state between calls —
 * so two evaluations of the same narrative against the same corpus return the
 * same decision, in either order, on any machine.
 *
 * **No AI, no LLM, no scoring, no confidence, no ranking** (MODULE.md). The
 * return type has no numeric field and cannot acquire one without a reviewed
 * change to the domain type it re-exports.
 *
 * ## The narrative is untrusted external content (ADR-0029)
 *
 * `merchant` and `description` arrive from a bank's file or a person's
 * keyboard. Nothing here interprets them: they are handed to a pure function
 * that lower-cases and rewrites characters, and then compared with `===` and
 * `startsWith` against literal reviewed tokens. No SQL is built from them —
 * the corpus read takes no parameters at all — no path, no command, no
 * template, no evaluation.
 *
 * ## Why the corpus is re-read on every evaluation
 *
 * Because a cached corpus is a clock. `merchant_rules` is `SELECT`-only to
 * the application role and changes exclusively by reviewed migration, so a
 * snapshot would usually be correct — but "usually" plus a process that has
 * been up since before the last deploy is how one server categorises under
 * the old corpus and its neighbour under the new one, for the same input, on
 * the same day. Re-reading makes the corpus a parameter of the call rather
 * than a property of the process's age.
 */

import {
  decideMerchantCategory,
  type MerchantNarrative,
  type MerchantRuleDecision,
} from '../domain/merchant-rules.js';
import type { MerchantRuleDirectory } from './ports/category-repository.js';

export class MerchantRuleEvaluator {
  constructor(private readonly rules: MerchantRuleDirectory) {}

  /**
   * The category a reviewed rule assigns to this narrative, or `null`.
   *
   * `null` is the ordinary answer and the honest one: no rule matched, so the
   * transaction stays uncategorised. It is never "OTHER", never the closest
   * thing, and never a suggestion queued for later — an absent category is a
   * true statement about a transaction, and a guessed one is a false
   * statement that looks identical to a true one on every screen that renders
   * it.
   *
   * Takes no principal. The corpus has no subject column to scope by
   * (migration 0092), and the narrative is passed in by a caller that already
   * proved the transaction is the principal's own — this object never reads a
   * transaction, so it has nothing to scope.
   */
  async evaluate(narrative: MerchantNarrative): Promise<MerchantRuleDecision | null> {
    const rules = await this.rules.listActiveRules();
    return decideMerchantCategory(narrative, rules);
  }
}

/**
 * An evaluator over an EMPTY corpus. Matches nothing, ever.
 *
 * It exists so that the one place `CreateManualTransaction` can be built
 * without a real corpus — a suite that is about retention gates, or dedup
 * ordinals, or timezone handling, and has no business seeding merchant rules
 * — says so at the call site instead of passing `null` or a mock.
 *
 * It is NOT a production default in disguise. `CreateManualTransaction`
 * accepts it only because a required eighth constructor argument would have
 * meant editing a fixture in another workstream's module; the composition
 * root passes the real evaluator, and
 * `__tests__/merchant-rule-pipeline.test.ts` reads the composition root's
 * source and FAILS if it stops doing so. That test is what makes the default
 * safe: forgetting the argument in production is caught by an assertion
 * rather than by nobody noticing categories stopped appearing.
 */
export const CATEGORISES_NOTHING: MerchantRuleEvaluator = new MerchantRuleEvaluator({
  listActiveRules: () => Promise.resolve(Object.freeze([])),
});

export type { MerchantNarrative, MerchantRuleDecision };
