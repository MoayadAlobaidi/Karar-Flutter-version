/**
 * `PaymentInstrumentEraserPort` — the port this module IMPLEMENTS for
 * `modules/financial-accounts`: "erase every instrument that spends from this
 * account".
 *
 * ## One declaration, aliased — not a second copy
 *
 * The port is declared by the module that CONSUMES it. `financial-accounts`
 * owns `DeleteOwnAccount` and needs these rows gone before it may report an
 * account deleted; this module SATISFIES that need, so the abstraction belongs
 * with the consumer and the implementer depends on it — the ordinary direction
 * of dependency inversion, and what "ports are declared inward" (architecture
 * test 5) asks for.
 *
 * **This file used to be a MIRROR**, written while the accounts module
 * declared `AccountSourceLinkEraserPort` and `FinancialRecordEraserPort` and
 * no instrument port at all. It restated the shape so the satisfying side —
 * `ErasePaymentInstruments` and
 * `infrastructure/adapters/financial-accounts-payment-instrument-eraser.ts` —
 * could be built and tested ahead of the declaration, and MODULE.md carried
 * the exact TypeScript the accounts module had to add. **The declaration has
 * now landed**, `DeleteOwnAccount` calls it, and the mirror is gone: the names
 * below are ALIASES of that one declaration.
 *
 * Aliasing rather than re-exporting a second shape is deliberate, and
 * `modules/transactions/application/ports/financial-record-lifecycle.ts`
 * records why after doing exactly this: two structurally identical
 * declarations do not FAIL when they drift, they diverge silently until an
 * adapter satisfies the local copy and no longer satisfies the real one.
 * There is no shape here to drift from the one in `@karar/financial-accounts`.
 *
 * ## What the aliasing changed about the signature, and what it did not
 *
 * The mirror took `accountId` as a plain string, because a mirror must not
 * depend on the module it mirrors. The real port takes that module's branded
 * `FinancialAccountId`, so a bare string — a user id, a tenant id, a
 * fabricated uuid — can no longer be passed where an account is meant. The
 * adapter still accepts this module's own `InstrumentsPrincipal` and a plain
 * string alongside the branded pair, so this module's suites can drive it
 * directly; that is a widening of what it accepts, never of what the port
 * promises.
 *
 * The dependency is one-way and the boundary rule is respected: this import
 * resolves through the other module's `public-api`, and `financial-accounts`
 * imports nothing from here.
 *
 * ## Why a separate port rather than a new kind on an existing one
 *
 * `financial-accounts` declares `FinancialRecordEraserPort` with a closed set
 * of erasable record kinds, and it has exactly ONE implementer
 * (`modules/transactions`) which a composition root binds once. Adding a kind
 * for instruments would make the transactions module responsible for erasing
 * this module's rows, or make a single port need two implementers. The
 * connections module reached the same conclusion for source links.
 */

import type {
  PaymentInstrumentEraserPort as AccountsPaymentInstrumentEraserPort,
  PaymentInstrumentErasureOutcome as AccountsPaymentInstrumentErasureOutcome,
} from '@karar/financial-accounts';

export type PaymentInstrumentEraserPort = AccountsPaymentInstrumentEraserPort;
export type PaymentInstrumentErasureOutcome = AccountsPaymentInstrumentErasureOutcome;
