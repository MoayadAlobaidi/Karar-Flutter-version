/**
 * The two ports this module IMPLEMENTS for `modules/financial-accounts`:
 * "does this account have any financial record?" and "erase every financial
 * record on this account".
 *
 * ## One declaration, aliased — not a second copy
 *
 * These ports are declared by the module that CONSUMES them. Accounts needs to
 * know whether records exist before it lets a currency change, and needs them
 * gone before it reports an account deleted. This module SATISFIES that need,
 * so the abstraction belongs with the consumer and the implementer depends on
 * it — the ordinary direction of dependency inversion.
 *
 * They were briefly declared in both modules. The two were structurally
 * identical, so TypeScript accepted the adapters either way and nothing broke;
 * that is exactly what made it worth collapsing. Two declarations of one
 * contract do not fail when they drift — they diverge silently until an adapter
 * satisfies the local copy and no longer satisfies the real one. The collapse
 * proved the point immediately: it surfaced call sites here that were passing
 * unbranded strings where the real port requires a `FinancialAccountId`.
 *
 * The names below are ALIASES of the accounts-side declarations, not restated
 * shapes. Aliasing rather than re-exporting is deliberate: this module's
 * application layer names the contracts its infrastructure fulfils, which is
 * what "ports are declared inward" (architecture test 5) asks for, while the
 * single definition stays in the module that owns it. There is no shape here
 * to drift from that one.
 *
 * The dependency is one-way and the boundary rule is respected: this import
 * resolves through the other module's `public-api`, and financial-accounts
 * imports nothing from here.
 *
 * ## Why the account id is a branded FinancialAccountId
 *
 * It crosses as the accounts module's own branded identifier, so a bare string
 * — a user id, a tenant id, a fabricated uuid — cannot be passed where an
 * account is meant. An earlier revision of this module kept the id generic to
 * avoid naming the other module's type; collapsing the duplicate ports removed
 * the reason for that, and the branding is worth more than the avoidance.
 *
 * ## Why presence answers a boolean and not a count
 *
 * Accounts needs one fact: may this account's currency still change? The rule
 * is "not while any financial record exists", so `hasAnyRecord` answers
 * exactly that and stops. A count would tell the caller how much this person
 * transacts — a behavioural signal about a `HIGHLY_SENSITIVE_FINANCIAL`
 * dataset that the currency rule has no use for — and a row, or anything
 * derived from narrative, amount, or date, would hand another context the
 * data this module encrypts at rest.
 *
 * ## Why erasure reports an outcome and exact per-kind counts
 *
 * "Erased" is a claim the caller has to be able to check, and a partial
 * erasure is the state a person would most want to know about. So a
 * successful erasure is one arm carrying counts per kind, a partial one is a
 * different arm carrying what DID go, and a failure carries neither. A
 * boolean, or a single total, could not distinguish "there was nothing to
 * erase" from "one table was missed" — and a missed table is residue of
 * exactly the data a subject asked to be rid of.
 */

import type {
  ErasableFinancialRecordKind as AccountsErasableFinancialRecordKind,
  FinancialRecordEraserPort as AccountsFinancialRecordEraserPort,
  FinancialRecordErasureCounts as AccountsFinancialRecordErasureCounts,
  FinancialRecordErasureOutcome as AccountsFinancialRecordErasureOutcome,
  FinancialRecordPresence as AccountsFinancialRecordPresence,
  FinancialRecordPresencePort as AccountsFinancialRecordPresencePort,
} from '@karar/financial-accounts';

export type ErasableFinancialRecordKind = AccountsErasableFinancialRecordKind;
export type FinancialRecordEraserPort = AccountsFinancialRecordEraserPort;
export type FinancialRecordErasureCounts = AccountsFinancialRecordErasureCounts;
export type FinancialRecordErasureOutcome = AccountsFinancialRecordErasureOutcome;
export type FinancialRecordPresence = AccountsFinancialRecordPresence;
export type FinancialRecordPresencePort = AccountsFinancialRecordPresencePort;

export { ERASABLE_FINANCIAL_RECORD_KINDS, NO_RECORDS_ERASED } from '@karar/financial-accounts';
