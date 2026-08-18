/**
 * `TransferMatchEraserPort` over this module's own `EraseTransferMatches` —
 * the second of the two files in this module that import another module, and
 * like the first it imports only that module's `public-api.ts` (architecture
 * test 3).
 *
 * ## Why the adapter lives here, on the implementing side
 *
 * The dependency runs ONE way and this file is what keeps it that way.
 * `modules/transactions` owns `DeleteOwnTransaction` and
 * `PrismaFinancialRecordEraser`; `modules/financial-accounts` owns
 * `DeleteOwnAccount`. Each owns a deletion path, so each declares the
 * interface its deletion path needs (ports are declared inward — architecture
 * test 5) and knows nothing else: neither knows that transfer matches exist,
 * what table holds them, or that this module is what satisfies the port. This
 * module knows all of that already, so it satisfies the interfaces here.
 * Putting the adapter in either of those modules would make the
 * `transfer_matches` schema their business and would be the first import
 * pointing the wrong way.
 *
 * **The declaration exists, and this is now wired to it.**
 * `@karar/transactions` declares `TransferMatchEraserPort` with BOTH scopes on
 * one port, because that module owns both deletion paths, and both call it:
 * `DeleteOwnTransaction` erases the matches naming a transaction before
 * removing it, and `PrismaFinancialRecordEraser` erases the matches touching
 * an account before deleting that account's records — which is the path
 * `modules/financial-accounts`' `DeleteOwnAccount` drives. This class
 * implements that declaration through the alias in
 * `application/ports/transfer-match-eraser.ts`, which used to be a mirror of
 * ports that did not exist yet; nothing about the methods below changed when
 * the real one landed, because the mirror was written to be exactly it.
 *
 * The signatures still accept this module's own `MatchingPrincipal` and plain
 * strings beside the transactions module's branded pair. That widens what the
 * adapter ACCEPTS so this module's suites can drive it directly; it does not
 * widen what the port promises.
 *
 * ## What crosses, and what does not
 *
 * In: a principal and an identifier. Out: an outcome kind and an exact row
 * count. **Nothing about the matches themselves crosses** — not which
 * transactions they related, not which accounts, not whether the person had
 * confirmed them. An erasure has one honest answer, "how many rows went", and
 * that is the whole of it.
 *
 * ## Why the failure reason is fixed text
 *
 * A deleting use case puts `reason` into a caller-visible message. The reason
 * a store did not answer comes from the database driver, and driver text can
 * carry a connection string with credentials, the failing SQL, or a fragment
 * of a person's record. So the reason is this module's own stable sentence,
 * chosen by the refusal's KIND and never interpolated from the throw, and the
 * original travels attached NON-ENUMERABLE for the one boundary allowed to log
 * it (`packages/platform/src/observability/logger.ts`). A field that must not
 * be serialized is safer as a field that cannot be.
 */

import type { TransactionId, TransactionsPrincipal } from '@karar/transactions';

import type { EraseTransferMatchesError } from '../../application/errors.js';
import type {
  TransferMatchEraserPort,
  TransferMatchErasureOutcome,
} from '../../application/ports/transfer-match-eraser.js';
import type { MatchingPrincipal } from '../../application/principal.js';
import type { EraseTransferMatches } from '../../application/use-cases/erase-transfer-matches.js';

/**
 * One sentence per refusal kind. Naming the kind rather than describing the
 * throw is what keeps this stable across a driver upgrade, and a caller that
 * keyed on driver prose would break when the driver changed under it.
 */
const REASONS: Readonly<Record<EraseTransferMatchesError['kind'], string>> = {
  store_failure:
    'the store holding the transfer matches did not answer, so no match is known to have been ' +
    'removed. The reason is deliberately not described here because it comes from the database ' +
    'driver; it is logged once at the boundary, against this request',
  missing_principal_context:
    'the erasure was refused for want of an authenticated, tenant-bound principal — transfer ' +
    'matches are only ever erased inside their own subject context, and there is no default one',
};

function failed(error: EraseTransferMatchesError): TransferMatchErasureOutcome {
  // `failed` rather than `incomplete`: the use case reports a refusal only
  // when its transaction raised, which rolls back, so nothing went and an
  // immediate retry is safe. That is a different instruction to the caller
  // than "some rows went", and conflating them would send someone hunting for
  // residue that does not exist.
  const outcome = { kind: 'failed' as const, reason: REASONS[error.kind] };
  Object.defineProperty(outcome, 'cause', {
    value: (error as { cause?: unknown }).cause ?? error,
    enumerable: false,
    writable: false,
  });
  return outcome;
}

export class TransactionsTransferMatchEraser implements TransferMatchEraserPort {
  constructor(private readonly erase: EraseTransferMatches) {}

  async eraseTransferMatchesForTransaction(
    actor: TransactionsPrincipal | MatchingPrincipal,
    transactionId: TransactionId | string,
  ): Promise<TransferMatchErasureOutcome> {
    const erased = await this.erase.forTransaction(
      { transactionId },
      TransactionsTransferMatchEraser.principalFrom(actor),
    );
    return erased.ok
      ? { kind: 'erased', transferMatchesDeleted: erased.value.transferMatchesDeleted }
      : failed(erased.error);
  }

  async eraseTransferMatchesForAccount(
    actor: TransactionsPrincipal | MatchingPrincipal,
    accountId: string,
  ): Promise<TransferMatchErasureOutcome> {
    const erased = await this.erase.forAccount(
      { accountId },
      TransactionsTransferMatchEraser.principalFrom(actor),
    );
    return erased.ok
      ? { kind: 'erased', transferMatchesDeleted: erased.value.transferMatchesDeleted }
      : failed(erased.error);
  }

  /**
   * The principals are structurally identical — both are a kernel `TenantId`
   * plus a kernel `UserId` — and are still restated field by field rather than
   * cast. A cast would keep compiling if either shape gained a field, and the
   * field it would most likely gain is one this module has no business
   * forwarding.
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
