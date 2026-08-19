/**
 * `DeterministicCategoryPort`, satisfied over `@karar/transactions`'
 * `MerchantRuleDirectory`.
 *
 * The rule directory does exact matching over already-normalised merchant
 * text and answers `null` when nothing matches. That is the whole contract,
 * and this adapter adds nothing to it: no fallback, no fuzzy pass, no
 * "closest" category, no model.
 *
 * The reason is scale rather than principle. A manual entry mislabelled by a
 * guess is one wrong label a person notices the next time they look. An
 * import mislabelled by a guess is four hundred wrong labels applied in one
 * action, on records the person did not type and cannot easily audit — and
 * every one of them then feeds whatever totals the product shows.
 *
 * `null` is therefore the ordinary answer, and it is honest: an uncategorised
 * transaction is a transaction nobody has categorised yet.
 */

import type { MerchantRuleDirectory } from '@karar/transactions';

import type {
  DeterministicCategoryMatch,
  DeterministicCategoryPort,
} from '../../application/ports/statement-commit.js';
import type { ImportsPrincipal } from '../../application/principal.js';

export class TransactionsDeterministicCategoryAdapter implements DeterministicCategoryPort {
  constructor(private readonly rules: MerchantRuleDirectory) {}

  async match(
    actor: ImportsPrincipal,
    normalizedNarrative: string,
  ): Promise<DeterministicCategoryMatch | null> {
    // The principal is accepted and not forwarded: the directory is a
    // catalogue of reviewed rules and carries no subject narrative, so it has
    // nothing to scope. It is a parameter here so the seam is the real one —
    // a per-subject rule set would need it, and the port would not change.
    void actor;
    const matched = await this.rules.match(normalizedNarrative);
    if (matched === null) return null;
    return { categoryCode: matched.categoryCode, ruleVersion: matched.ruleVersion };
  }
}
