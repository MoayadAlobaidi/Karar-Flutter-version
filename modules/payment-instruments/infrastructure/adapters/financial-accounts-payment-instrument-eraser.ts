/**
 * `PaymentInstrumentEraserPort` over this module's own
 * `ErasePaymentInstruments` — the second of the two files in this module that
 * import `@karar/financial-accounts`, and like the first it imports only that
 * module's `public-api.ts` (architecture test 3).
 *
 * ## Why the adapter lives here, on the implementing side
 *
 * The dependency runs ONE way and this file is what keeps it that way.
 * `modules/financial-accounts` owns the deletion path, so it declares the
 * interface its deletion path needs (ports are declared inward —
 * architecture test 5) and knows nothing else: it does not know that payment
 * instruments exist, what table holds them, or that this module is what
 * satisfies the port. This module knows all of that already, so it satisfies
 * the interface here. Putting the adapter in the accounts module instead
 * would make the `payment_instruments` schema that module's business and
 * would be the first import pointing the wrong way.
 *
 * **The declaration exists, and this is now wired to it.**
 * `@karar/financial-accounts` declares `PaymentInstrumentEraserPort` beside
 * `AccountSourceLinkEraserPort` and `FinancialRecordEraserPort`, and
 * `DeleteOwnAccount` calls it — after the source links and before the
 * financial records, for the reasons that file gives. This class implements
 * that declaration through the alias in
 * `application/ports/payment-instrument-eraser.ts`, which used to be a mirror
 * of a port that did not exist yet; nothing about the method below changed
 * when the real one landed, because the mirror was written to be exactly it.
 *
 * The signature still accepts this module's own `InstrumentsPrincipal` and a
 * plain string beside the accounts module's branded pair. That widens what
 * the adapter ACCEPTS so this module's suites can drive it directly; it does
 * not widen what the port promises, and a caller reaching it through the port
 * can only pass an `AccountsPrincipal` and a `FinancialAccountId`.
 *
 * ## What crosses, and what does not
 *
 * In: the accounts module's `AccountsPrincipal` and its branded
 * `FinancialAccountId`. Out: an outcome kind and an exact row count.
 * **Nothing about the instruments themselves crosses** — not the mask, not
 * the label, not the type, not how many of each. An erasure has one honest
 * answer, "how many rows went", and that is the whole of it.
 *
 * ## Why the failure reason is fixed text
 *
 * `DeleteOwnAccount` puts `reason` into a caller-visible message. The reason
 * a store did not answer comes from the database driver, and driver text can
 * carry a connection string with credentials, the failing SQL, or a fragment
 * of the ciphertext of a card mask. So the reason is this module's own stable
 * sentence, chosen by the refusal's KIND and never interpolated from the
 * throw, and the original travels attached NON-ENUMERABLE for the one
 * boundary allowed to log it
 * (`packages/platform/src/observability/logger.ts`). A field that must not be
 * serialized is safer as a field that cannot be.
 */

import type { AccountsPrincipal, FinancialAccountId } from '@karar/financial-accounts';

import type { ErasePaymentInstrumentsError } from '../../application/errors.js';
import type {
  PaymentInstrumentEraserPort,
  PaymentInstrumentErasureOutcome,
} from '../../application/ports/payment-instrument-eraser.js';
import type { InstrumentsPrincipal } from '../../application/principal.js';
import type { ErasePaymentInstruments } from '../../application/use-cases/erase-payment-instruments.js';

/**
 * One sentence per refusal kind. Naming the kind rather than describing the
 * throw is what keeps this stable across a driver upgrade, and a caller that
 * keyed on driver prose would break when the driver changed under it.
 */
const REASONS: Readonly<Record<ErasePaymentInstrumentsError['kind'], string>> = {
  store_failure:
    'the store holding the payment instruments did not answer, so no instrument is known to ' +
    'have been removed. The reason is deliberately not described here because it comes from the ' +
    'database driver; it is logged once at the boundary, against this request',
  missing_principal_context:
    'the erasure was refused for want of an authenticated, tenant-bound principal — instruments ' +
    'are only ever erased inside their own subject context, and there is no default one',
};

export class FinancialAccountsPaymentInstrumentEraser implements PaymentInstrumentEraserPort {
  constructor(private readonly erase: ErasePaymentInstruments) {}

  async erasePaymentInstruments(
    actor: AccountsPrincipal | InstrumentsPrincipal,
    accountId: FinancialAccountId | string,
  ): Promise<PaymentInstrumentErasureOutcome> {
    // The two principals are structurally identical — both are a kernel
    // TenantId plus a kernel UserId — and are still restated field by field
    // rather than cast, for the reason given in
    // `financial-accounts-balance-bearing-account-access.ts`: a cast would
    // keep compiling if either shape gained a field, and the field it would
    // most likely gain is one this module has no business forwarding.
    const principal: InstrumentsPrincipal = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
      ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
    };
    const erased = await this.erase.execute({ accountId }, principal);
    if (erased.ok) {
      return {
        kind: 'erased',
        paymentInstrumentsDeleted: erased.value.paymentInstrumentsDeleted,
      };
    }
    // `failed` rather than `incomplete`: the use case reports a refusal only
    // when its transaction raised, which rolls back, so nothing went and an
    // immediate retry is safe. That is a different instruction to the caller
    // than "some rows went", and conflating them would send someone hunting
    // for residue that does not exist.
    const failure = { kind: 'failed' as const, reason: REASONS[erased.error.kind] };
    Object.defineProperty(failure, 'cause', {
      value: (erased.error as { cause?: unknown }).cause ?? erased.error,
      enumerable: false,
      writable: false,
    });
    return failure;
  }
}
