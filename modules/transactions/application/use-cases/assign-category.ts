/**
 * AssignCategory — attach a category to one of the principal's own
 * transactions, from a person or from a reviewed rule.
 *
 * **Manual override beats rule.** A `RULE` assignment against a transaction a
 * person has ever categorised is REFUSED with a typed
 * `USER_ASSIGNMENT_WINS` outcome — not skipped quietly, not queued as a
 * suggestion, not applied and then flagged. The rules path has to handle
 * being told no, which is the only version of this guarantee that survives
 * contact with a nightly re-classification job.
 *
 * A person may always assign, including over their own earlier choice and
 * over a rule's.
 *
 * Assignment appends and supersedes rather than updating in place, so "why is
 * this marked TRANSPORT?" is answerable from the chain — and so is "did
 * something overwrite what I chose?".
 *
 * **Deterministic only.** `RULE` means a reviewed, versioned, exact-match
 * rule fired; the input carries no score, no confidence, and no ranked
 * candidates, and there is no code path in this module that could produce
 * one. No AI, no LLM (MODULE.md).
 *
 * No `userId`, no `tenantId`: the principal comes from context.
 */

import { Clock, Result } from '@karar/shared-kernel';

import {
  activeAssignment,
  canSupersede,
  createAssignment,
  hasUserDecision,
  type AssignmentSource,
  type TransactionCategoryAssignment,
} from '../../domain/category-assignment.js';
import { CategoryCode, isAssignable } from '../../domain/category-catalogue.js';
import { ActorRef, TransactionId } from '../../domain/refs.js';
import {
  InvalidTransactionInputError,
  principalContextMissing,
  toStoreFailure,
  type CategoryUnknown,
  type NotFound,
  type PrincipalContextMissing,
  type StoreFailure,
  type UserAssignmentWins,
} from '../errors.js';
import {
  AssignmentConflictError,
  type CategoryAssignmentRepository,
  type FinancialCategoryCatalogue,
} from '../ports/category-repository.js';
import type { IdSource } from '../ports/id-source.js';
import type { PrincipalContextPort } from '../ports/principal-context.js';
import type { TransactionRepository } from '../ports/transaction-repository.js';

export interface AssignCategoryInput {
  readonly transactionId: string;
  readonly categoryCode: string;
  readonly assignmentSource: AssignmentSource;
  /** Required for a RULE assignment; refused for a USER one. */
  readonly ruleVersion?: string | null;
}

export type AssignCategoryError =
  | PrincipalContextMissing
  | NotFound
  | CategoryUnknown
  | UserAssignmentWins
  | StoreFailure;

export class AssignCategory {
  constructor(
    private readonly principals: PrincipalContextPort,
    private readonly transactions: TransactionRepository,
    private readonly assignments: CategoryAssignmentRepository,
    private readonly catalogue: FinancialCategoryCatalogue,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AssignCategoryInput,
  ): Promise<Result<TransactionCategoryAssignment, AssignCategoryError>> {
    const principal = this.principals.current();
    if (principal === null) return Result.err(principalContextMissing());
    const transactionId = TransactionId.of(input.transactionId);

    const code = CategoryCode.tryOf(input.categoryCode);
    if (code === null) {
      return Result.err(categoryUnknown(input.categoryCode, 'is not a well-formed category code'));
    }
    if (input.assignmentSource === 'RULE') {
      if (input.ruleVersion === undefined || input.ruleVersion === null || input.ruleVersion.trim() === '') {
        throw new InvalidTransactionInputError(
          "a RULE assignment must name the reviewed rule version that produced it; an unversioned rule result cannot be re-derived, which makes it indistinguishable from a guess",
        );
      }
    } else if (input.ruleVersion !== undefined && input.ruleVersion !== null) {
      throw new InvalidTransactionInputError(
        'a USER assignment must not carry a rule version — a person did not run a rule',
      );
    }

    const now = this.clock.now();

    try {
      // The transaction must be the principal's own. RLS already guarantees
      // it, and the explicit read makes the refusal a clean NOT_FOUND rather
      // than a foreign-key error surfacing from the write.
      const transaction = await this.transactions.findById(principal, transactionId);
      if (transaction === null) {
        return Result.err({ kind: 'NOT_FOUND', resource: 'transaction', id: transactionId });
      }

      const category = await this.catalogue.findByCode(code);
      if (category === null) {
        return Result.err(categoryUnknown(code, 'is not in the catalogue'));
      }
      if (!isAssignable(category, now)) {
        return Result.err(
          categoryUnknown(code, 'is retired; existing assignments still resolve, but no new one may be made'),
        );
      }

      const chain = await this.assignments.listChain(principal, transactionId);
      const current = activeAssignment(chain);
      if (!canSupersede(current, input.assignmentSource) || (input.assignmentSource === 'RULE' && hasUserDecision(chain))) {
        return Result.err({
          kind: 'USER_ASSIGNMENT_WINS',
          transactionId,
          message:
            'a person has categorised this transaction; a rule may not replace their decision. ' +
            'The refusal is explicit rather than a silent skip so the rules path cannot quietly become the last writer.',
        });
      }

      const assignment = createAssignment({
        id: this.ids.nextId(),
        transactionId,
        tenantId: principal.tenantId,
        userId: principal.userId,
        categoryCode: code,
        assignmentSource: input.assignmentSource,
        ruleVersion: input.assignmentSource === 'RULE' ? (input.ruleVersion as string) : null,
        assignedBy: ActorRef.of(principal.userId),
        assignedAt: now,
        status: 'ACTIVE',
        supersededById: null,
        supersededAt: null,
      });

      await this.assignments.assign(principal, {
        assignment,
        supersedesId: current === null ? null : current.id,
      });
      return Result.ok(assignment);
    } catch (error) {
      if (error instanceof AssignmentConflictError) {
        // A concurrent assignment moved the chain. Reported as a store
        // failure the caller retries, never resolved by leaving two ACTIVE
        // rows behind — two active categories is a state no read can explain.
        return Result.err(toStoreFailure(error));
      }
      return Result.err(toStoreFailure(error));
    }
  }
}

function categoryUnknown(categoryCode: string, detail: string): CategoryUnknown {
  return {
    kind: 'CATEGORY_UNKNOWN',
    categoryCode,
    message: `category '${categoryCode}' ${detail}`,
  };
}
