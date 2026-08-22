/**
 * `DeterministicCategoryPort`, satisfied over `@karar/transactions`'
 * `MerchantRuleEvaluator`.
 *
 * The evaluator is the SAME object `CreateManualTransaction` categorises
 * through. That is the point of this file being three lines of delegation: a
 * merchant must categorise identically whether a person typed it or a
 * statement carried it, and the only way to guarantee that is for there to be
 * one implementation of "which category is this?" rather than one per caller.
 * This adapter exists to translate a port shape, not to make a decision.
 *
 * It adds nothing to the evaluator's contract: no fallback, no fuzzy pass, no
 * "closest" category, no model. The reason is scale rather than principle. A
 * manual entry mislabelled by a guess is one wrong label a person notices the
 * next time they look. An import mislabelled by a guess is four hundred wrong
 * labels applied in one action, on records the person did not type and cannot
 * easily audit — and every one of them then feeds whatever totals the product
 * shows.
 *
 * `null` is therefore the ordinary answer, and it is honest: an uncategorised
 * transaction is a transaction nobody has categorised yet.
 *
 * The narrative crossing this seam is UNTRUSTED EXTERNAL CONTENT (ADR-0029) —
 * a merchant string out of a bank's CSV. The evaluator normalises and
 * compares it as inert characters and nothing on the far side interprets it,
 * builds SQL from it, or hands it to a path or a command.
 */

import type { MerchantRuleEvaluator } from '@karar/transactions';

import type {
  DeterministicCategoryMatch,
  DeterministicCategoryPort,
} from '../../application/ports/statement-commit.js';
import type { ImportsPrincipal } from '../../application/principal.js';

export class TransactionsDeterministicCategoryAdapter implements DeterministicCategoryPort {
  constructor(private readonly evaluator: MerchantRuleEvaluator) {}

  async match(
    actor: ImportsPrincipal,
    narrative: { readonly merchant: string | null; readonly description: string | null },
  ): Promise<DeterministicCategoryMatch | null> {
    // The principal is accepted and not forwarded: the corpus is a catalogue
    // of reviewed rules with no tenant, user or account column at all
    // (migration 0092), so it has nothing to scope. It is a parameter here so
    // the seam is the real one — a per-subject rule set would need it, and
    // the port would not change. What IS subject-scoped is everything either
    // side of this call: the staged rows were read under this principal's
    // RLS, and the assignment lands on a transaction written under it.
    void actor;
    const decided = await this.evaluator.evaluate(narrative);
    if (decided === null) return null;
    return { categoryCode: decided.categoryCode, ruleVersion: decided.ruleVersion };
  }
}
