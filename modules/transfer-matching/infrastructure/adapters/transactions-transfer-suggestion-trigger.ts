/**
 * `TransferSuggestionTriggerPort` over this module's own
 * `GenerateTransferMatchSuggestions` — the third file in this module that
 * imports another module, and like the other two it imports only that module's
 * `public-api.ts` (architecture test 3).
 *
 * ## Why the adapter lives here, on the implementing side
 *
 * `modules/transactions` owns `CreateManualTransaction` and
 * `modules/statement-imports` owns `CommitStatementImport`. Each owns a write
 * path, so the interface each needs is declared where the path lives — once,
 * in `transactions` — and neither knows that transfer matches exist, what table
 * holds them, or that this module satisfies the port. This module knows all of
 * that already, so it satisfies the interface here. Putting the adapter in
 * either of those modules would make the `transfer_matches` schema their
 * business and would be the first import pointing the wrong way.
 *
 * ## One transaction at a time, and the order is not an accident
 *
 * A batch is walked in the order the caller wrote it. Both sides of one
 * movement usually arrive together in a statement import, and that is exactly
 * the case this ordering handles: the first side finds the second and a
 * `SUGGESTED` row is written; the second side then finds itself already in a
 * live match and stops before reading anything. One pair, one question, one
 * row — which is what "idempotent" means here, and it is the module's own
 * one-live-match rule producing it rather than any bookkeeping in this file.
 *
 * ## It never throws, and it never stops early on a refusal
 *
 * The port's contract is that a failure here must not fail the write, and both
 * call sites defend against a throw as well. So a refusal on one transaction
 * does not abandon the rest of the batch: the pass over each transaction is
 * independent, and one unreachable answer must not silently cost every later
 * transaction its question.
 *
 * A refusal that is a REAL failure — the store did not answer, the retention
 * decision is unresolved, visibility could not be established — is reported as
 * `unavailable`, once, in this module's own stable vocabulary. Never driver
 * text: a driver message can carry a connection string with credentials, the
 * failing SQL, or a fragment of a person's record, and the original throw
 * travels attached NON-ENUMERABLY for the one boundary allowed to log it.
 *
 * ## What crosses, and what does not
 *
 * In: a principal and identifiers of transactions that were written. Out: a
 * kind and a count of ROWS. **Nothing about the matches crosses** — not which
 * transactions were related, not which accounts, not an amount, not a total.
 * The caller learns that questions were asked, never what they were about.
 */

import type { TransactionsPrincipal } from '@karar/transactions';

import type {
  TransferSuggestionPassOutcome,
  TransferSuggestionTriggerPort,
} from '../../application/ports/transfer-suggestion-trigger.js';
import type { MatchingPrincipal } from '../../application/principal.js';
import type {
  GenerateTransferMatchSuggestions,
  GenerateTransferMatchSuggestionsError,
} from '../../application/use-cases/generate-transfer-match-suggestions.js';

/**
 * One sentence per refusal kind. Naming the KIND rather than describing the
 * throw is what keeps this stable across a driver upgrade, and a caller that
 * keyed on driver prose would break when the driver changed under it.
 */
const REASONS: Readonly<Record<GenerateTransferMatchSuggestionsError['kind'], string>> = {
  store_failure:
    'the store holding the transactions or the transfer matches did not answer, so no transfer ' +
    'was suggested. The reason is deliberately not described here because it comes from the ' +
    'database driver; it is logged once at the boundary, against this request',
  missing_principal_context:
    'the suggestion pass was refused for want of an authenticated, tenant-bound principal — both ' +
    'sides of a match are resolved under one, and there is no default one',
  transaction_access_unavailable:
    'whether these transactions are ones this subject owns could not be established, so nothing ' +
    'was suggested. The rule fails closed rather than pairing on an unverified reference',
  retention_unresolved:
    'no reviewed retention decision governs transfer matches here, so nothing durable may be ' +
    'written and no transfer was suggested',
};

function unavailable(error: GenerateTransferMatchSuggestionsError): TransferSuggestionPassOutcome {
  const outcome = { kind: 'unavailable' as const, reason: REASONS[error.kind] };
  Object.defineProperty(outcome, 'cause', {
    value: (error as { cause?: unknown }).cause ?? error,
    enumerable: false,
    writable: false,
  });
  return outcome;
}

export class TransactionsTransferSuggestionTrigger implements TransferSuggestionTriggerPort {
  constructor(private readonly generate: GenerateTransferMatchSuggestions) {}

  async suggestTransfersFor(
    actor: TransactionsPrincipal | MatchingPrincipal,
    transactionIds: readonly string[],
  ): Promise<TransferSuggestionPassOutcome> {
    const principal = TransactionsTransferSuggestionTrigger.principalFrom(actor);
    let written = 0;
    let refused: GenerateTransferMatchSuggestionsError | null = null;
    for (const transactionId of transactionIds) {
      const outcome = await this.generate.execute({ anchorTransactionId: transactionId }, principal);
      if (!outcome.ok) {
        // Remembered, not thrown, and the batch continues: one unreachable
        // answer must not cost every later transaction its question.
        refused ??= outcome.error;
        continue;
      }
      if (outcome.value.kind === 'suggested') written += 1;
    }
    // A batch that suggested nothing AND met a real failure reports the
    // failure. One that suggested something reports what it wrote: the rows
    // exist, and calling that unavailable would be false.
    return refused !== null && written === 0
      ? unavailable(refused)
      : { kind: 'considered', suggestionsWritten: written };
  }

  /**
   * The principals are structurally identical — both are a kernel `TenantId`
   * plus a kernel `UserId` — and are still restated field by field rather than
   * cast, exactly as the eraser adapter restates them. A cast would keep
   * compiling if either shape gained a field, and the field it would most
   * likely gain is one this module has no business forwarding.
   */
  private static principalFrom(
    actor: TransactionsPrincipal | MatchingPrincipal,
  ): MatchingPrincipal {
    const optional = actor as MatchingPrincipal;
    return {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...(optional.sessionId !== undefined ? { sessionId: optional.sessionId } : {}),
      ...(optional.requestId !== undefined ? { requestId: optional.requestId } : {}),
    };
  }
}
