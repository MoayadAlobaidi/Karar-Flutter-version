# Module: payment-instruments

## Purpose

**What SPENDS from a balance-bearing financial account** (ADR-0028). One subject-owned table: `public.payment_instruments` (0098).

A physical card, a virtual card, a prepaid card, a tokenized card or a QR payment identity is a **way money leaves an account**. The account is where the money is. That distinction is the entire module, and the schema is shaped so that nothing can express the alternative.

**A CARD IS NOT A BALANCE, AND THIS TABLE CANNOT HOLD ONE.** ADR-0028 names the failure exactly: _"two virtual cards on one wallet look like two more balances, and the person's money appears to triple"_. The fix is not a display rule and not a filter in a query — it is that the row describing a card has nowhere to put a figure, so no reader, no export, no projection and no later engineer can total one by accident.

**Nothing here computes anything.** No balance, no limit, no spend, no per-card share of a wallet. There is no `Money` import in the module, no `reduce`, no `aggregate`, no `count` on the repository, and the account-access port cannot answer a balance question because its summary type has two fields and neither is a number.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 implemented the instrument core: the table (RLS ENABLEd and FORCEd on tenant and user), the closed type and status vocabularies, the encrypted mask with its domain shape rule, the many-instruments-to-one-account relationship, and the identity trigger that freezes which account an instrument spends from. The inward erasure port is **declared by `@karar/financial-accounts` and wired**, so deleting an account now takes its instruments with it — see 'The inward port financial-accounts declares'. **No controller lives in this module**; `GET /financial/accounts/{accountId}/payment-instruments` is mounted in `apps/api/src/financial/financial-views.controller.ts`
- **Phase:** 5
- **Capability:** TRANSACTIONS — this module is an internal bounded context beneath that product capability, not a capability of its own. The reasoning `modules/financial-accounts` records applies unchanged: an instrument is not independently purchasable, entitleable or deployable, and a second capability id would add a dimension the product does not have
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `payment_instruments` | `SUBJECT_OWNED` | what spends from a balance-bearing account — the instrument's kind, its own lifecycle, and a bounded encrypted mask that lets the person recognise it. Never a balance, never a payment credential | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: the financial-data retention decision is a legal one and has not been taken.** No period is written here. Durable creation fails closed until a PolicyPack decision exists, **enforced by `PaymentInstrumentRetentionDecisionPort` in `RecordPaymentInstrument`** and not merely declared; LOCAL and TEST run on a clearly synthetic fixture with no legal effect | included — the subject's export contains their own instruments, mask included: it is a fragment the person already sees embossed on their own card, and the eight-byte bound means it cannot be more | `CASCADE_DELETE` |

**Why the mask is exported when `financial-connections` holds its external reference back.** The two look similar and are not. A source-account reference is *another party's* identifier for the subject and would put a correlatable identity in a file on a laptop; an instrument mask is two to four digits the person reads off their own card every time they use it. Exporting it tells them nothing they do not already know, and withholding it would produce an export in which the person cannot tell their own two cards apart.

**What `CASCADE_DELETE` reaches.** The instrument row and nothing else. An instrument never held an account, a transaction or a balance, so deleting one removes a record of *how* money leaves an account and leaves every record of money actually leaving it untouched. In the other direction — deleting an ACCOUNT — the cascade must reach the instruments that spend from it, and now **it does**: see the section below.

## A card is not a balance — how the absence is enforced

A `CHECK` cannot assert that a column does not exist, so the guarantee is layered:

1. **The schema has no such column.** Migration 0098 creates eighteen columns and not one of them is numeric except `version`, the optimistic-concurrency token.
2. **`__tests__/no-instrument-balance-columns.integration.test.ts` reads `information_schema.columns` and compares against an EXHAUSTIVE list.** Any column added — money-shaped or not — fails that test until someone edits the list deliberately. A test that only looked for the word `balance` would pass on `head_room`, `float_minor`, or a `jsonb` column called `attributes`.
3. **A TYPE scan.** No `numeric`, `money`, `double precision`, `real`, `bigint` or `smallint` column exists, and the only `integer` is `version`. A balance would have to be one of those, or a string — and a string balance is caught by (2).
4. **No `json`, `jsonb`, `hstore`, `xml` or array column**, because a free-form column is a balance store with better manners.
5. **`__tests__/no-money-arithmetic.test.ts` scans this module's own production source** for a `Money` import, a money-named identifier, a `reduce`, an `aggregate`, a `groupBy`, a `_sum`, or a `SUM(`. It strips comments and string literals first, deliberately: this module's prose talks about balances constantly because explaining their absence is most of what it does, and a scan over raw text would make the documentation the thing that fails.
6. **`__tests__/many-instruments-one-account.integration.test.ts` asks the live catalogue** whether any view, materialized view or generated column derives anything from this table, and whether any foreign key joins it to the accounts table in either direction. All three answer nothing.

**Many instruments, one account — and no constraint that forbids it.** Two virtual cards spending from one wallet are two rows against one `account_id`, which is ordinary rather than exceptional. There is therefore **no** uniqueness over `(account_id, instrument_type)`, over `(account_id, mask)`, or over any arrangement of the two: each forbids something a real person actually has. The **primary key is the only unique index on the table**, asserted as an exact set rather than by checking that the tempting constraints are merely absent. The mask could not participate in one in any case — a fresh nonce per encryption makes the ciphertext non-deterministic.

**Exactly one account per instrument, frozen.** `account_id` is `NOT NULL`, singular, and immutable after insert:

```sql
-- payment_instruments_guard, SQLSTATE KAR30
IF NEW.account_id IS DISTINCT FROM OLD.account_id ... RAISE EXCEPTION ... USING ERRCODE = 'KAR30';
```

An instrument re-pointed at another account keeps its id, its name and its history while silently changing what it draws on — the same defect as deleting it and creating another, by a verb that leaves no trace. The rule is held three times: the edit type has no `accountId` field (unexpressible), `applyInstrumentEdit` refuses a caller who reached for it through a cast, and the trigger refuses a writer that bypassed the module entirely.

## No PAN, no CVV, no token, no wallet credential

Three independent mechanisms, because each alone is defeatable:

1. **The mask is ciphertext, bounded at EIGHT bytes.** AES-256-GCM preserves length, so eight ciphertext bytes is eight plaintext characters, and no 13-to-19-digit PAN, no IBAN and no MSISDN fits. This is the argument `modules/financial-accounts` makes for its account mask, and it holds here for the same reason: the column is too small to contain the thing it must never contain. (`modules/financial-connections` could **not** use this argument for its opaque source reference, because a legitimate provider token is legitimately as long as an IBAN. A mask has no legitimate long form, so here the argument is available and is used.)

2. **The domain refuses PAN-shaped input before anything is encrypted.** `domain/instrument-mask.ts` applies the reasoning `modules/financial-connections/domain/external-account-reference.ts` established — reject long digit runs and identifier shapes at the door — and is stricter, because a mask must *match* a shape rather than merely fail to look forbidden:
   - a 12-to-19-digit run is refused as `looks_like_a_card_number`, **checked first**, so a sixteen-digit input is never filed as a formatting mistake;
   - any run of eight or more consecutive digits is refused (eight is the shortest thing that must go — an E.164 subscriber number);
   - the value must match `^[*xX#•]{0,4}[0-9]{2,4}$`.

   A caller supplying a real PAN is refused **before a key is used**, proved in `__tests__/use-cases.test.ts` by asserting that the account port was never even asked.

3. **No column exists a credential could live in.** No expiry, no CVV, no track data, no network token, no provisioning handle, no `jsonb`, no unbounded text. The column-set test refuses all of them and a vocabulary scan refuses a column *named* for one. `domain/refs.ts` carries the same rule at the type level: there is no reference type for a payment credential either, because a reference to a credential is still a design that has a credential in it.

**`expires_on` is deliberately absent, and it is the interesting absence.** A card expiry is one of the three fields that make a card usable card-not-present (number, expiry, CVV). Holding two of the three is not two-thirds of a breach; it is the part of one that is cheapest to complete. It is also not a fact this product needs — nothing here charges anything. `EXPIRED` is a *status* a person or an issuer sets, which is the fact the product actually uses.

**`TOKENIZED_CARD` names the fact that a token exists in the world**, typically in a phone's secure element put there by an issuer this platform has no relationship with. It does not mean a token is stored here, and no column could hold one.

## No status means connected

`INSTRUMENT_STATUSES` is `ACTIVE | SUSPENDED | EXPIRED | CANCELLED`. There is no `PROVISIONED`, `TOKENIZED`, `SYNCED`, `LINKED` or `AUTHORIZED` value and none may be added: **no issuer named anywhere in this platform exposes an interface to Karar**, and a status column is exactly where that fiction would first be written down (ADR-0028). `impliesLiveIssuerLink` answers `false` for every member of the vocabulary — a function rather than a sentence, so the claim is checkable and a value added later has nowhere to be handled. The database refuses the words outright (`payment_instruments_status_check`), proved by inserting each of them as `karar_app`.

`CANCELLED` and `EXPIRED` are terminal. A cancelled card does not come back, and a card that expired was replaced by a *different* card — which is a different instrument with its own row, not this one revived. Permitting the reverse would let one row's history describe two physical objects.

## Custom SQLSTATEs

`KAR` is outside every class the standard and PostgreSQL assign (migration 0090 records the reasoning). Codes in use elsewhere: `KAR01`, `KAR02` (transactions), `KAR10`, `KAR11` (categories/assignments), `KAR20`–`KAR23` (account source links). **This module owns `KAR30` and `KAR31`:**

| SQLSTATE | Raised when |
|---|---|
| `KAR30` | the instrument's identity was rewritten — the subject, **the account it spends from**, what kind of instrument it is, or when it was recorded |
| `KAR31` | an update did not advance the optimistic-concurrency token by exactly one |

Read structurally by callers, never by matching message text: a message is prose that a later edit rewrites, and a mapping that depends on it fails silently the day somebody improves the wording.

## The inward port `financial-accounts` declares, and this module satisfies

**This module depends on `@karar/financial-accounts`; that module must not depend on this one.** Erasing an account has to reach payment instruments — `payment_instruments.account_id` is a raw uuid with no foreign key back, because no FK crosses a module boundary — but the interface belongs to the module that owns the deletion path (architecture test 5: ports are declared inward). This module **cannot and does not** add it.

**The gap this section used to record is closed.** It read: *"until the declaration below lands, an account deleted through `DeleteOwnAccount` LEAVES ITS INSTRUMENTS BEHIND"* — recorded here for the same reason `modules/financial-connections/MODULE.md` recorded the identical gap for source links before it was closed, because writing it down is what made it fixable. `@karar/financial-accounts` now declares the port, `DeleteOwnAccount` calls it, and `__tests__/account-deletion-erasure.integration.test.ts` proves the whole path against live PostgreSQL with the instruments counted as the bootstrap superuser — RLS bypassed, so what is proved is "gone" and not "hidden".

**Declared, in `modules/financial-accounts/application/ports/payment-instrument-eraser.ts`**

```ts
export type PaymentInstrumentErasureOutcome =
  | { readonly kind: 'erased'; readonly paymentInstrumentsDeleted: number }
  | { readonly kind: 'incomplete'; readonly paymentInstrumentsDeleted: number; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

export interface PaymentInstrumentEraserPort {
  /** Idempotent by contract: a second call finds nothing and answers zero. */
  erasePaymentInstruments(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<PaymentInstrumentErasureOutcome>;
}
```

**The argument is REQUIRED at `DeleteOwnAccount`'s constructor**, as every cross-module eraser now is. This file previously recorded it as optional with a do-nothing default, on the reasoning that zero is the true answer for a deployment composing no instruments at all. That reasoning traded a real hazard for a hypothetical convenience: the default cannot tell a deployment that has no instruments from one that has them and forgot a line of wiring, and in the second case it erases nothing, reports success, and leaves the cards that spent from a deleted account in the database. The default is gone. A suite with genuinely no instruments hands in a **named** no-op instead — `ERASES_NO_INSTRUMENTS` — which a reader can see and a reviewer can question.

**Called from `DeleteOwnAccount`**, beside `AccountSourceLinkEraserPort` and with the same failure semantics: a throw or any non-`erased` outcome means the account is **not** deleted, the counts reported are honest about what did and did not go, and the account row survives so a retry has something to finish. The refusal has its own kind, `instrument_erasure_incomplete`, because three erasures are three ports with three implementers and an operator needs to know which store refused.

**The ordering that module chose, and the reason it is not arbitrary.** Source links, then instruments, then financial records, then the account row. An instrument is a way to SPEND from the account, so it is a route by which new records are caused, and routes are cut before records. It goes AFTER the link rather than before because the link is the only one of the two that can put a row in the database: **no issuer named anywhere in this platform exposes an interface to Karar**, `impliesLiveIssuerLink` answers `false` for every status this module permits, and a spend on a card becomes a record only by arriving through a source link. It goes BEFORE the records because links and instruments are the parts a subject can re-supply and a year of transactions is not.

**Satisfied here: `infrastructure/adapters/financial-accounts-payment-instrument-eraser.ts`** — `FinancialAccountsPaymentInstrumentEraser`, a delegation to `ErasePaymentInstruments` and nothing more, taking that module's `AccountsPrincipal` and branded `FinancialAccountId` at the call boundary. It never puts driver text in `reason`: the reason is fixed text chosen by the refusal's kind, and the original throw rides along non-enumerably for the boundary logger. `application/ports/payment-instrument-eraser.ts` was a **mirror** of the declaration and is now an **alias** of it — one declaration, in the module that consumes it, because two structurally identical declarations do not fail when they drift, they diverge silently until an adapter satisfies the local copy and no longer satisfies the real one.

**A separate port rather than a new kind on `ERASABLE_FINANCIAL_RECORD_KINDS`**, for the reason `modules/financial-connections` gives about source links: `FinancialRecordEraserPort` has exactly one implementer (`modules/transactions`) and a composition root can bind only one — adding a kind would make one module responsible for erasing another's rows.

## Ports this module declares

| Port | Answers | Implemented by |
|---|---|---|
| `HsfFieldEncryptionPort` | encrypt/decrypt one HSF field, binding tenant, user, table, row id and field as associated data | `infrastructure/providers` locally; a key-management-backed adapter (ADR-0017) elsewhere. `resolveHsfFieldEncryptionPort` **throws** in dev, staging and production when no approved provider is wired |
| `PaymentInstrumentRetentionDecisionPort` | `DECIDED` \| `PENDING_LEGAL_REVIEW` \| `UNAVAILABLE` \| `NOT_APPLICABLE` for the one durable dataset | a labelled synthetic fixture in LOCAL only; a policy-pack reader elsewhere. `NOT_APPLICABLE` is a refusal — a record of which cards a person holds is not outside retention law |
| `BalanceBearingAccountAccessPort` | does this account exist for this principal, and may it receive an instrument? Existence and lifecycle state, **no narrative and no figure** | `infrastructure/adapters`, over `@karar/financial-accounts`' `public-api.ts` |
| `PaymentInstrumentRepository`, `IdSource` | persistence and identity | `infrastructure/persistence` |

`BalanceBearingAccountAccessPort` is named for the invariant it protects. ADR-0028's hierarchy is explicit — a financial account or wallet is *where a balance sits*, a payment instrument is *what spends from it* — so **resolving an account through this port IS the balance-bearing check**: every row in `public.financial_accounts` is by definition a place a balance sits. What the check rules out is the case that matters, an instrument pointing at another **instrument**; the reference type is a closed set with one member, so an instrument id cannot arrive in an account's clothing.

## Events published

None. This module publishes no event this phase. When it does, the payload rule is identifier-only — a mask is not an identifier and may never appear in one.

## Permissions

_None._ Every operation here is owner self-service: a principal reads and writes their OWN instruments and no other principal's. What denies is the principal resolved exclusively from the session's server-side tenant binding, `BalanceBearingAccountAccessPort` (`application/ports/balance-bearing-account-access.ts`) resolving the balance-bearing account an instrument spends from as one the caller owns, and RLS bound per transaction. `USER` holds nothing in the permission catalogue and that is the design, not an omission (`modules/authorization/domain/catalogue.ts`: "Own-data authority comes from identity + RLS, never from an RBAC grant"). A permission granted to `USER` and to no other role would therefore be a check that its only possible holder always passes — ceremony rather than a boundary. access-control.md §2 records the two authorisation models and which one governs here.

**Permissions deliberately absent:** no staff endpoint returns one customer's instruments, and none may be added — the list says which products a person holds and which accounts they spend from.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. This module imports `@karar/financial-accounts` in **three production files** — `infrastructure/adapters/financial-accounts-balance-bearing-account-access.ts`, `infrastructure/adapters/financial-accounts-payment-instrument-eraser.ts`, and `application/ports/payment-instrument-eraser.ts`, which aliases the port that module declares rather than restating it — and imports the package root, never a subpath. `modules/financial-accounts` imports nothing from here.

Cross-module references carry a raw UUID plus a reference type declared **in this module** (`domain/refs.ts`): `BalanceBearingAccountRef` for an account. It is not another module's identifier type, and no foreign key crosses a module boundary.

## Notes and known limitations

**No transport in this module.** The one mounted operation, `GET /financial/accounts/{accountId}/payment-instruments`, lives in `apps/api/src/financial/financial-views.controller.ts` with every other controller. The rule it carries is this module's own: a screen may list a person's instruments beside an account, and it may never render a figure against one — the balance belongs to the account, and two cards on one wallet share it.

**No duplicate detection, deliberately.** Two virtual cards on one wallet may legitimately share a type and even a four-digit tail, and there is no value here that could tell a genuine second card from a re-entry — the mask is a fragment, not an identity. Guessing would merge two real cards into one row; a uniqueness constraint would refuse a real second card. So neither happens, and the person's own list is what tells them whether they already recorded it.

**Retention fixture constants are borrowed.** `LocalSyntheticRetentionDecisionProvider` resolves `ACCOUNT_SYNTHETIC_*` from `@karar/financial-retention-local-fixtures`, because there is one unresolved financial-retention decision and it governs this dataset too. Dedicated `INSTRUMENT_SYNTHETIC_*` constants would be tidier and belong to that package's owner; they are **not** created here, because the entire point of that package is that this module cannot hold such values.

**All fixtures use synthetic names and visibly fake masks.** No real bank, telco, card scheme, wallet provider or exchange house is named anywhere in this module, and none may be. The masks are `**00` and `**11`.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
