/**
 * ApplyMerchantRules — run the reviewed rules over one of the principal's own
 * transactions that is already stored, and write the assignment only if
 * writing it would change something.
 *
 * The two write paths categorise as they commit: `CreateManualTransaction`
 * puts the assignment in the same database transaction as the record, and the
 * CSV canonical commit puts it in the import's single unit of work. This use
 * case is the THIRD thing a rules pipeline needs and the one most systems
 * leave out — the re-run. New rules ship; transactions committed last month
 * were evaluated against a corpus that did not contain them; somebody has to
 * be able to run the pass again.
 *
 * A re-run is where every rules engine gets dangerous, so the two properties
 * that make it safe are the whole design of this file.
 *
 * ## 1. A person's decision wins, and a re-run cannot touch it
 *
 * The refusal is not implemented here. This use case writes through
 * `AssignCategory`, which reads the chain and refuses a `RULE` assignment
 * against a transaction any person has ever categorised — the domain's
 * `canSupersede` plus `hasUserDecision`, with the schema's one-ACTIVE-row
 * index underneath. Routing the write through it rather than reimplementing
 * the check means there is exactly ONE enforcement point, and a pass that
 * wanted to bypass precedence would have to stop calling the use case
 * entirely rather than merely forget a condition.
 *
 * The typed `USER_ASSIGNMENT_WINS` refusal comes back here and becomes
 * `USER_DECISION_STANDS` — an outcome the caller must discriminate, not an
 * error and not a silent skip. A bulk pass has to keep going past it, and it
 * has to be able to report how many it left alone.
 *
 * ## 2. Running it twice changes nothing the second time
 *
 * The mechanism is the `ALREADY_APPLIED` short-circuit below, and it is
 * load-bearing rather than an optimisation. Without it, a second pass over an
 * unchanged corpus would find the same match, call `AssignCategory`, and be
 * allowed — `canSupersede` permits `RULE` over `RULE` — so every run would
 * append a row that supersedes an identical row. After a month of nightly
 * runs the chain that exists to answer "did something overwrite my category?"
 * would be thirty rows of the same answer, and the question would be
 * unanswerable by the record built to answer it.
 *
 * So: an ACTIVE `RULE` assignment whose category AND rule version already
 * equal what the corpus decided is left exactly as it is. Nothing is written,
 * no row is superseded, and the outcome says so.
 *
 * ## What a re-run does when the CORPUS changed
 *
 * It supersedes, visibly. The previous rule assignment stays in the chain as
 * `SUPERSEDED`, still naming the rule version that produced it, and the new
 * row names the new one — so "the rules changed and this re-categorised" is
 * readable from the record rather than being a thing that happened silently.
 * That is what versioned rule semantics buy: history is appended to, never
 * rewritten.
 *
 * And when the corpus changed such that NOTHING now matches, an existing rule
 * assignment is LEFT ALONE (`NO_RULE_MATCHED`). Retracting a category is a
 * destructive act with a person's screens attached to it; "no rule matched"
 * is a reason to leave a transaction uncategorised, never a reason to
 * un-categorise one that already is.
 *
 * No `userId`, no `tenantId`: the principal comes from context, and every
 * read and write below is scoped to it.
 */

import { Result } from '@karar/shared-kernel';

import type { CategoryCode } from '../../domain/category-catalogue.js';
import { TransactionId } from '../../domain/refs.js';
import {
  principalContextMissing,
  toStoreFailure,
  type NotFound,
  type PrincipalContextMissing,
  type StoreFailure,
} from '../errors.js';
import type { MerchantRuleEvaluator } from '../merchant-rule-evaluator.js';
import type { CategoryAssignmentRepository } from '../ports/category-repository.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';
import type { AssignCategory } from './assign-category.js';

export interface ApplyMerchantRulesInput {
  readonly transactionId: string;
}

/**
 * What the pass did, as four outcomes a caller must tell apart.
 *
 * They are four rather than a boolean because a bulk run has to report
 * "categorised 12, already correct 380, left the person's own alone 6, no
 * rule matched 2" — and collapsing any pair of those loses the one fact
 * somebody will ask about. In particular `ALREADY_APPLIED` and `ASSIGNED`
 * must stay distinct: a re-run that reports 392 assignments when it wrote 12
 * is a re-run nobody can tell apart from one that rewrote everything.
 */
export type MerchantRuleApplication =
  | {
      readonly kind: 'ASSIGNED';
      readonly transactionId: string;
      readonly categoryCode: CategoryCode;
      readonly ruleVersion: string;
    }
  | {
      readonly kind: 'ALREADY_APPLIED';
      readonly transactionId: string;
      readonly categoryCode: CategoryCode;
      readonly ruleVersion: string;
    }
  | { readonly kind: 'USER_DECISION_STANDS'; readonly transactionId: string }
  | { readonly kind: 'NO_RULE_MATCHED'; readonly transactionId: string };

export type ApplyMerchantRulesError = PrincipalContextMissing | NotFound | StoreFailure;

export class ApplyMerchantRules {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
    private readonly assignments: CategoryAssignmentRepository,
    private readonly evaluator: MerchantRuleEvaluator,
    private readonly assign: AssignCategory,
  ) {}

  async execute(
    input: ApplyMerchantRulesInput,
  ): Promise<Result<MerchantRuleApplication, ApplyMerchantRulesError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());
    const transactionId = TransactionId.of(input.transactionId);

    let decision;
    let active;
    try {
      // The transaction must be the principal's own. RLS already guarantees
      // it; the explicit read makes another subject's id a clean NOT_FOUND
      // instead of a pass that quietly evaluates rules against nothing — and
      // it is what stops this use case from being an existence oracle over
      // somebody else's transaction inventory.
      const transaction = await this.transactions.findById(principal, transactionId);
      if (transaction === null) {
        return Result.err({ kind: 'NOT_FOUND', resource: 'transaction', id: transactionId });
      }

      decision = await this.evaluator.evaluate({
        // Plaintext leaves the HSF wrapper only here, into a pure function
        // that compares characters. `reveal()` is the grep-able access this
        // module requires for exactly that reason.
        merchant: transaction.merchant?.reveal() ?? null,
        description: transaction.description.reveal(),
      });
      // No rule matched. The transaction stays as it is — uncategorised if it
      // was uncategorised, and still carrying its existing assignment if it
      // had one. There is no fallback category to fall back to.
      if (decision === null) {
        return Result.ok({ kind: 'NO_RULE_MATCHED', transactionId });
      }

      active = await this.assignments.findActive(principal, transactionId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }

    // THE IDEMPOTENCE GATE. Same category, same rule version, already placed
    // by a rule: there is nothing to write, so nothing is written. See the
    // header for what a missing gate does to the supersession chain.
    if (
      active !== null &&
      active.assignmentSource === 'RULE' &&
      active.categoryCode === decision.categoryCode &&
      active.ruleVersion === decision.ruleVersion
    ) {
      return Result.ok({
        kind: 'ALREADY_APPLIED',
        transactionId,
        categoryCode: decision.categoryCode,
        ruleVersion: decision.ruleVersion,
      });
    }

    const assigned = await this.assign.execute({
      transactionId,
      categoryCode: decision.categoryCode,
      assignmentSource: 'RULE',
      ruleVersion: decision.ruleVersion,
    });
    if (assigned.ok) {
      return Result.ok({
        kind: 'ASSIGNED',
        transactionId,
        categoryCode: decision.categoryCode,
        ruleVersion: decision.ruleVersion,
      });
    }

    const refusal = assigned.error;
    switch (refusal.kind) {
      // The whole guarantee, arriving as a value. A person categorised this
      // transaction; the rule is told no and the pass moves on with the fact
      // recorded rather than swallowed.
      case 'USER_ASSIGNMENT_WINS':
        return Result.ok({ kind: 'USER_DECISION_STANDS', transactionId });
      case 'NOT_FOUND':
        return Result.err(refusal);
      case 'PRINCIPAL_CONTEXT_MISSING':
        return Result.err(refusal);
      // A rule naming a code that is not in the catalogue, or naming a
      // retired one, is a defect in the reviewed corpus rather than an
      // outcome a caller can act on — the FK on the assignment table would
      // refuse the write anyway. It surfaces as a store failure so it is
      // loud, because a rule that can never apply should be found and fixed,
      // not counted as "no match" for the rest of the corpus's life.
      case 'CATEGORY_UNKNOWN':
        return Result.err({
          kind: 'STORE_FAILURE',
          message:
            `a reviewed merchant rule assigns category '${refusal.categoryCode}', which the ` +
            `catalogue does not offer: ${refusal.message}. The corpus and the catalogue are both ` +
            'changed by reviewed migration, so this is a disagreement between two migrations rather ' +
            'than anything a caller did',
        });
      default:
        return Result.err(refusal satisfies StoreFailure);
    }
  }
}
