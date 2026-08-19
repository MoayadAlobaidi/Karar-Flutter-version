# Module: transfer-matching

## Purpose

**A relationship between TWO of one subject's transactions that are one movement of their own money** (ADR-0028). One subject-owned table: `public.transfer_matches` (0099).

A wallet top-up from a bank account is ONE movement that appears in the data TWICE, once on each side. Left alone it reads as an expense and an income, so — ADR-0028 — _"a month in which someone moved their own money looks like a month in which they earned and spent it"_.

**The fix is a relationship, not a rewrite.** Both transactions stay exactly as their sources reported them; this table says the two are two sides of one thing. Nothing here nets them off, totals them, recategorises them, or produces a conclusion.

**A SUGGESTED match changes NOTHING.** It is a question the product asks, and nothing may read it as an answer. Only the person's confirmation makes a match authoritative, and the database is what says so.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 implemented the matching core: the table (RLS ENABLEd and FORCEd on tenant and user), the six-part suggestion rule with its declared window, the confirm/reject state machine with the subject-decision CHECK, the one-live-match-per-transaction guard, and the two erasure scopes. The inward erasure port is **declared by `@karar/transactions` and wired at both call sites**, so a deleted transaction and a deleted account both take their matches with them — see 'The inward port transactions declares'. **No transport layer and no automatic suggestion pass exist yet**
- **Phase:** 5
- **Capability:** TRANSACTIONS — this module is an internal bounded context beneath that product capability, not a capability of its own. The reasoning `modules/financial-accounts` records applies unchanged: a transfer match is not independently purchasable, entitleable or deployable, and a second capability id would add a dimension the product does not have
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `transfer_matches` | `SUBJECT_OWNED` | which two of the subject's transactions are one movement of their own money, on what basis it was suggested, and whether the subject confirmed it. Never an amount, never a total, never a conclusion | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: the financial-data retention decision is a legal one and has not been taken.** No period is written here. Durable creation fails closed until a PolicyPack decision exists, **enforced by `TransferMatchRetentionDecisionPort` in `SuggestTransferMatch`** and not merely declared; LOCAL and TEST run on a clearly synthetic fixture with no legal effect | included — the subject's export contains which of their movements are transfers between their own accounts, and whether they confirmed each one | `CASCADE_DELETE` |

**Why this is `HIGHLY_SENSITIVE_FINANCIAL` when it holds no money.** The row carries identifiers, two currency codes, a state and a decision instant — no amount at all. It is still the most structural thing this platform knows about a person's finances: it says which of their accounts feed which, and how often. "It is only a relationship" is exactly the argument that would leave a subject's financial structure ungoverned.

**What `CASCADE_DELETE` reaches.** The match row and nothing else — never a transaction, never an account. In the other direction it is what must reach these rows, from two places at once, and both wirings now **exist**: see below.

## Only the person's confirmation makes a match authoritative

```sql
CONSTRAINT transfer_matches_confirmed_requires_subject_decision
  CHECK (match_state <> 'CONFIRMED' OR subject_decided_at IS NOT NULL)
```

Not "the use case sets it", not "the type requires it" — the row does not exist without it, including for a direct SQL `UPDATE` by `karar_app`, a fixture, a backfill, or an ingestion path written by someone who never read this file. `__tests__/schema.integration.test.ts` proves it by making exactly the move a well-meaning backfill would: flipping the state and leaving the instant alone.

The converse is enforced too:

```sql
CONSTRAINT transfer_matches_decision_instant_matches_state
  CHECK ((match_state = 'SUGGESTED') = (subject_decided_at IS NULL))
```

so a suggestion cannot be dressed up as a decision by writing the column and leaving the state alone, and a decided state can never lack its instant.

**Why the asymmetry is not caution for its own sake.** A wrong automatic match makes two real movements disappear from a person's record of what they earned and spent. Nothing on any screen says a pairing happened, so the person cannot see it, cannot question it, and cannot undo what they never knew occurred. A suggestion the person answers "no" to costs them a tap.

**The decision instant comes from the clock, never from the caller.** `ConfirmTransferMatch` and `RejectTransferMatch` take it from the platform's `Clock`; no input type carries a `decidedAt` field, and a test asserts none ever gains one. A caller-supplied decision instant is a *claim* about when somebody decided something, and this column exists to be a *fact*.

**A rejection is KEPT, not deleted.** Without the row, the same wrong suggestion returns on every import and the person answers the same question forever. `REJECTED` is excluded from every live-state rule, so a person may reject one pairing and later accept a different one involving the same transaction — which is the ordinary case, not an edge: the product suggested the wrong counterpart and the right one is still out there.

## The suggestion rule

A pair may be `SUGGESTED` when ALL of these hold, **in this order**:

| # | Rule | Held by |
|---|---|---|
| 1 | two **different transactions** | `checkSuggestable` + `transfer_matches_two_distinct_transactions` |
| 2 | on two **different accounts** | `checkSuggestable` + `transfer_matches_two_distinct_accounts` |
| 3 | both **POSTED** | `SuggestTransferMatch`, through `MatchableTransactionAccessPort` |
| 4 | the **same currency** | `checkSuggestable` + `transfer_matches_same_currency_only` |
| 5 | exactly **equal and opposite** | `domain/equal-and-opposite.ts` |
| 6 | booking dates **within the declared window** | `domain/suggestion-window.ts` |

**The order of 4 and 5 is load-bearing rather than cosmetic.** Comparing minor units across currencies would treat 100 of one and 100 of another as equal-and-opposite — a fabricated exchange rate of exactly 1.0. `__tests__/suggestion-rules.test.ts` asserts the ordering directly, with a pair whose minor units are identical and whose currencies are not.

**Rule 2 is why a refund is not a transfer.** Two equal-and-opposite entries on ONE account are a reversal, a refund or a correction. Calling one a transfer would erase a genuine refund from the person's record.

**Rule 6's window is a NAMED, VERSIONED constant**, never a number typed at a call site: `SUGGESTION_WINDOW_DAYS = 3`, `SUGGESTION_WINDOW_VERSION = 'equal-and-opposite/same-currency/P3D/v1'`. Every stored row records **which window suggested it** in `suggestion_window`, so widening the window later cannot silently reinterpret a question a person has already answered. The tests assert against the constant rather than against `3`, so widening it changes one line in the domain and the suite keeps testing the shipped rule.

Three calendar days each way covers a same-day transfer posting overnight, a weekend, and a value-date difference — it is a **judgement**, and the honest framing is that it is the smallest window that does not routinely miss real transfers. What makes the judgement tolerable is not the number: a suggestion inside the window changes nothing, so a slightly-too-wide window produces a question, where an auto-matching rule would produce a silent error.

**Booking dates are `CalendarDay`, never instants (ADR-0027).** Comparing them in hours would require inventing a midnight in some timezone for each, and the invented offsets would move the window by a day for readers at a different offset — a transfer that matched in Doha would not match in London.

## Cross-currency cannot be suggested

```sql
CONSTRAINT transfer_matches_same_currency_only
  CHECK (outflow_currency_code = inflow_currency_code)
```

Both currency codes are stored — deliberately as **two columns rather than one shared column**, because the rule is that two independent facts must AGREE, and a single column would assert the agreement instead of checking it. A currency code is a denomination and not an amount; no arithmetic is possible over it and none is attempted.

ADR-0028: cross-currency movements are not auto-matched without a **source-stated** FX relationship. **No such relationship exists anywhere in this platform** — no source states one, no column holds one, no rate table is reachable from this module, and `domain/refs.ts` records why there is no FX reference type either. So cross-currency simply cannot be suggested, and the constraint is that sentence made unwritable rather than merely intended.

**When a source-stated FX relationship one day exists**, the remedy is a forward migration adding the column that carries the SOURCE'S OWN statement plus a widened CHECK that requires it. It is never a code path that picks a rate: a rate this platform chose would turn "the person moved their own money" into "the person moved their own money and lost 0.4% of it, according to us".

Proved twice: in the domain, and end-to-end over two REAL accounts in two currencies with two REAL transactions whose minor units are identical.

## A fee is not part of the transfer

A top-up of 100 with a 2 fee is **three transactions and one match**: the outflow of 100, the inflow of 100, and a separate fee of 2 that stays an ordinary expense matched to nothing.

Nothing special-cases that, and **that is the point** — the equal-and-opposite rule finds no counterpart for the fee, and a match names exactly two transactions with no room for a third. `__tests__/movement-end-to-end.integration.test.ts` creates all three through `@karar/transactions`' own use case, matches the principal, and then asserts the fee is matched to nothing, is still `POSTED`, and still carries its own amount. It also asserts the fee is *refused* if anybody tries to pair it, so the guarantee is a rule rather than an omission.

The same test asserts the other half: **the match changes NEITHER transaction.** Both come back at `version: 1` with their amounts and statuses exactly as written — no correction, no recategorisation, no rewrite.

## One transaction, at most one live match

A transaction matched twice would have its movement explained away twice, and the person would see one real movement disappear from what they earned and spent. Enforced in **three** layers, because no two of them are enough:

- **Two PARTIAL unique indexes** over the non-`REJECTED` rows, one per side. These settle a concurrent race properly — two writers contend for the same index entry and exactly one wins — and cover the common case.
- **`transfer_matches_guard` (SQLSTATE `KAR42`)** for the case no index can express: the same transaction as the OUTFLOW of one match and the INFLOW of another. It runs `SECURITY INVOKER`, so the rows informing the answer are the caller's own.
- **`transfer_matches_lock_transaction_pair`** — the mutual exclusion that makes that guard right *under concurrency* rather than only when nobody else is writing.

### The cross-side residual this section used to record is closed

It read: _"the trigger performs a `SELECT`, so two concurrent inserts that cross sides can both pass it before either commits … it is a repository decision and it has not been taken"_. The defect was real: a `SELECT` cannot see a row another session has written and not yet committed, so two writers proposing A→B and B→A at the same instant both found nothing, both passed the guard, and both committed. The indexes did not catch it either — the two rows collide on no single index entry, which is exactly why the crossing needed a trigger in the first place.

The decision taken is **transaction-scoped advisory locks over both transactions**, claimed by `PrismaTransferMatchRepository.create` inside the same transaction as the insert. Three parts of it are load-bearing:

| Choice | Why that one |
|---|---|
| `pg_advisory_xact_lock`, not a row lock and not a lease | there is no row to lock — the conflict is between two rows that do not exist yet. PostgreSQL releases the claim when the transaction ends: `COMMIT`, `ROLLBACK`, a statement timeout, a killed backend, alike. Nothing is written to take it, so there is nothing to clean up and no lease that can expire while the work is still running |
| both locks taken in ascending **lock key** order | two sessions taking the same two locks in opposite orders deadlock. Sorting the two transaction **ids** looks like the fix and is not: the lock is over a HASH of the id, the hash is not monotonic in the id, so an order over ids is not an order over locks — three sessions holding `{A,B}`, `{B,C}`, `{C,A}` can still wait in a ring. The suite runs exactly that ring |
| the ordering lives in the **database function**, not in the repository | the two writers a crossing pits against each other disagree about which transaction is the outflow, so any ordering derived from the sides would let both proceed. The function is symmetric in its arguments, and a PL/pgSQL loop is what makes the order real — a `SELECT` calling the lock function in its target list evaluates it once per row in an order the planner chooses, and `ORDER BY` sorts the *result* rather than the calls |

**SERIALIZABLE with a bounded retry was the alternative, and was not chosen.** It would work. It would also put a retry loop in the one place this module must not have one: a retried suggestion is a second attempt to write a row about a person's money, and "how many times may this be retried, and what does the caller see on the last one" is a question with no good answer here. The claim has no such question — the loser is refused once, in this module's own vocabulary.

**The loser receives the SAME typed refusal the serial path produces**: `transaction_already_matched`, naming the match it lost to and whether the collision was on the same side or across the two. Never a `store_failure`, never a driver error. That is the requirement the mechanism exists to satisfy rather than a side effect of it — a caller cannot act on "the store did not answer", and a bulk suggestion pass is built entirely on the difference between _already spoken for, skip it_ and _the store broke, stop_.

**The claim is not the rule, and the difference is stated rather than glossed.** It is mutual exclusion between writers; the indexes and the guard are what decide who may exist. A writer that skips it — a direct `INSERT`, an importer nobody has written yet — is still refused. It merely reopens the race for itself.

Because the trigger is `BEFORE INSERT`, it fires before the unique index is checked, so even the same-side collision arrives as `KAR42` rather than `23505`. That ordering is deliberate: the caller gets a structured code instead of an index name it would have to parse, and the index remains the concurrency backstop. It is also why the repository reads **which** collision it was off the surviving row rather than off the SQLSTATE — deriving the label from the code would report every race loser as a crossing, including the ones that were not. The schema suite asserts both — the code that actually fires, and the indexes' existence and partiality.

**Proved against live PostgreSQL, not asserted.** `__tests__/one-live-match-under-concurrency.integration.test.ts` gives every contender its own `PrismaHandle` — its own pool, its own backend — and starts them with `Promise.all`, because two promises on one pooled connection queue instead of racing. It covers the same transaction proposed twice as the outflow and twice as the inflow, both crossings, six unrelated pairs that must all still succeed (a lock taken over the wrong thing would pass every other assertion while turning every suggestion into a queue of one), a rejection that must not block a later pairing, and the three-way waiting ring. The crossed-side race runs **50 consecutive times**, counting how often both committed, how many refusals were store failures, and how many deadlocked. Removing the claim from the repository moves that count from 0/50 to 47/50 both-committed — which is the only evidence that the test tests anything.

## A match may never span two subjects or two tenants

Three layers, and the middle one is the only one that catches a caller holding a real foreign identifier:

1. **The row carries ONE `tenant_id` and ONE `user_id`.** Two subjects are not expressible.
2. **Both sides are resolved through `MatchableTransactionAccessPort`, under the CALLER'S OWN principal context.** Another subject's transaction resolves as `null` — indistinguishably from an id nobody minted, so the refusal is not an oracle. RLS would *not* catch this alone: the row being written carries the caller's subject and satisfies the policy; what is wrong is what it points at.
3. **The RLS policy keys on BOTH GUCs**, `USING` and `WITH CHECK` alike.

`__tests__/isolation.integration.test.ts` proves all three, and asserts that a cross-subject attempt and a never-minted id produce the *same kind and the same message*.

## Custom SQLSTATEs

`KAR` is outside every class the standard and PostgreSQL assign (migration 0090 records the reasoning). Codes in use elsewhere: `KAR01`, `KAR02` (transactions), `KAR10`, `KAR11` (categories/assignments), `KAR20`–`KAR23` (account source links), `KAR30`, `KAR31` (payment instruments). **This module owns `KAR40`–`KAR43`:**

| SQLSTATE | Raised when |
|---|---|
| `KAR40` | the match identity was rewritten — the subject, either transaction reference, either account, or either currency. The person's confirmation was given about THAT movement, and relabelling the row would silently transfer their answer to another one |
| `KAR41` | an update did not advance the optimistic-concurrency token by exactly one |
| `KAR42` | one of these transactions already belongs to a live match — including the crossed-side case no index can express |
| `KAR43` | a state transition nobody can make: a rejection reopened, or a decided match returned to `SUGGESTED` |

Read structurally by callers, never by matching message text: a message is prose that a later edit rewrites, and a mapping that depends on it fails silently the day somebody improves the wording.

## Nothing here computes an insight, a total, a net worth or a category change

ADR-0028 ends with the sentence this module is shaped by: _"Nothing here computes an insight, a score, a budget or a net worth. This ADR establishes relationships, not conclusions."_

- **The table has no amount, no net, no total, no category and no score column**, and the only integer is `version`. Asserted against `information_schema` with an EXHAUSTIVE column list.
- **A STORED match side has three fields** — the transaction reference, the account reference and the currency code. The amount and the booking date belong to `MatchCandidateSide`, which exists only while a suggestion is being decided. Keeping them would put a figure on a row whose whole design is that it has none, and something would eventually total them.
- **`__tests__/no-money-arithmetic.test.ts` PINS the one exception.** This module performs exactly ONE arithmetic operation: the unary negation in `isEqualAndOpposite`, which answers a boolean and produces no intermediate figure. The test asserts that negation is the only one in the module, that the single division (calendar days, in the window file) divides TIME rather than money, and that no file sums, reduces, aggregates or imports `Money`. A blanket ban the code has to violate somewhere is a ban that gets deleted; a pinned exception is one a reviewer sees.
- **`outflow + inflow === 0n` is deliberately NOT how the comparison is written.** That would be an addition producing an intermediate net figure, and an intermediate net figure is precisely the thing that must not exist.
- **The repository has no `count`, `aggregate`, `groupBy` or `_sum`.** "How much did I move between my own accounts this month" is an insight: it needs amounts this table does not store, a period nobody stated, and a treatment of unconfirmed matches nobody has decided.
- **Nothing reaches back into the transactions it relates.** No `assignCategory`, no `correct`, no `commit` — asserted by the same scan.

## The inward port `transactions` declares, and this module satisfies

**This module depends on `@karar/transactions`; that module must not depend on this one.** The four cross-module references on a match — two transaction ids, two account ids — are raw uuids with no foreign keys back, because **no foreign key crosses a module boundary** (data-model.md §2). So nothing in the database makes a deletion reach these rows.

**A dangling match is not cosmetic.** It asserts that two movements were one movement while one of them no longer exists, so the surviving side is still explained away as a transfer and a real expense stays hidden from the person's own record of what they spent.

**The gap this section used to record is closed.** It read: *"until the declarations below land, a transaction deleted through `DeleteOwnTransaction` and an account deleted through `DeleteOwnAccount` BOTH LEAVE THEIR MATCHES BEHIND"* — recorded here for the same reason `modules/financial-connections/MODULE.md` recorded the identical gap for source links before it was closed. `@karar/transactions` now declares the port, both call sites use it, and `__tests__/deletion-erasure.integration.test.ts` proves both paths against live PostgreSQL over real confirmed matches, counted as the bootstrap superuser — RLS bypassed, so what is proved is "gone" and not "hidden".

**Declared, in `modules/transactions/application/ports/transfer-match-eraser.ts`**

```ts
export type TransferMatchErasureOutcome =
  | { readonly kind: 'erased'; readonly transferMatchesDeleted: number }
  | { readonly kind: 'incomplete'; readonly transferMatchesDeleted: number; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

export interface TransferMatchEraserPort {
  /** Idempotent by contract: a second call finds nothing and answers zero. */
  eraseTransferMatchesForTransaction(
    actor: TransactionsPrincipal,
    transactionId: TransactionId,
  ): Promise<TransferMatchErasureOutcome>;

  /** Every match with either side on this account. Idempotent by contract. */
  eraseTransferMatchesForAccount(
    actor: TransactionsPrincipal,
    accountId: string,
  ): Promise<TransferMatchErasureOutcome>;
}
```

**Both scopes live on ONE port, in `modules/transactions`, because that module owns both deletion paths.** `modules/financial-accounts` could have declared the account-scoped half itself; it does not need to, because it never reaches a transfer match except through the record eraser, and a second declaration of one contract in a second module is duplication that diverges silently.

**Two call sites, and the second is the one that is easy to miss:**

1. `DeleteOwnTransaction` calls `eraseTransferMatchesForTransaction` **before** removing the transaction, with the same failure semantics `DeleteOwnAccount` uses for source links: a throw or any non-`erased` outcome means the transaction is not deleted (`TRANSFER_MATCH_ERASURE_INCOMPLETE`), and the counts reported are honest. A match erasure that succeeded while the transaction delete then failed answers `DELETION_PARTIALLY_APPLIED` rather than `NOT_FOUND` — the latter would tell a person nothing happened to a request that really did remove rows about their money.
2. `PrismaFinancialRecordEraser.eraseAccountScopedRecords` (which `modules/financial-accounts`' `DeleteOwnAccount` drives through `FinancialRecordEraserPort`) calls `eraseTransferMatchesForAccount` before deleting the account's records, and reports the count back in `financialRecordRelationshipsDeleted`, which the accounts module folds into `AccountDeleted`. A refusal there refuses the WHOLE record erasure — no record is deleted while a relationship naming it survives — which the accounts module reads as `erasure_incomplete` and answers by leaving the account row in place. **This is why the account-scoped method exists and is not derived from the transaction-scoped one:** that eraser deletes an account's transactions in bulk without enumerating their ids, and a caller with only the per-transaction method would have to read every id first, turning one statement into a scan of a person's entire history. The match row carries both account ids for exactly this reason, copied from a column `public.transactions` freezes by trigger (0090's `transactions_guard`) so it cannot drift.

**Satisfied here: `infrastructure/adapters/transactions-transfer-match-eraser.ts`** — `TransactionsTransferMatchEraser`, a delegation to `EraseTransferMatches` and nothing more, taking `TransactionsPrincipal` and the branded `TransactionId` at the call boundary. It never puts driver text in `reason`: the reason is fixed text chosen by the refusal's kind, and the original throw rides along non-enumerably for the boundary logger. `application/ports/transfer-match-eraser.ts` was a **mirror** of the declaration and is now an **alias** of it — one declaration, in the module that consumes it, because two structurally identical declarations do not fail when they drift, they diverge silently until an adapter satisfies the local copy and no longer satisfies the real one.

**A separate port rather than a new kind on `ERASABLE_FINANCIAL_RECORD_KINDS`**, for the reason `modules/financial-connections` gives about source links: `FinancialRecordEraserPort` has exactly one implementer (`modules/transactions`) and a composition root can bind only one — adding a kind would make one module responsible for erasing another's rows.

## Ports this module declares

| Port | Answers | Implemented by |
|---|---|---|
| `MatchableTransactionAccessPort` | does this transaction exist for this principal, and what are the five facts a suggestion needs — account, signed minor units, currency, booking day, status? **No narrative** | `infrastructure/adapters`, over `@karar/transactions`' `public-api.ts` |
| `TransferMatchRetentionDecisionPort` | `DECIDED` \| `PENDING_LEGAL_REVIEW` \| `UNAVAILABLE` \| `NOT_APPLICABLE` for the one durable dataset | a labelled synthetic fixture in LOCAL only; a policy-pack reader elsewhere. `NOT_APPLICABLE` is a refusal — a record of which of a person's movements were transfers is not outside retention law |
| `TransferMatchRepository`, `IdSource` | persistence and identity | `infrastructure/persistence` |

**There is no field-encryption port**, and that is a fact about the table rather than an omission: `transfer_matches` holds no `HIGHLY_SENSITIVE_FINANCIAL` narrative at all, because a relationship between two transactions needs none. The narrative stays in the transactions the match relates, unchanged and unrewritten. The adapter reads `Transaction` — which carries `merchant`, `description` and `note` as *decrypted* `HsfField`s because that module's own callers need them — and **drops all three at the boundary**, along with the provenance, the revisions, the original amount and the timezone. A suggestion pass runs over pairs, which is the worst possible place for a second read path into another context's subject narrative.

## Events published

None. This module publishes no event this phase. When it does, the payload rule is identifier-only, and a suggestion must never be published as though it were a fact: an event saying "these two are a transfer" before the person has answered would be the automatic match this module exists to prevent, arriving by another route.

## Permissions

_None._ Every operation here is owner self-service: a principal reads and writes their OWN matches and no other principal's. What denies is the principal resolved exclusively from the session's server-side tenant binding, `MatchableTransactionAccessPort` (`application/ports/matchable-transaction-access.ts`) resolving both legs as transactions the caller owns, and RLS bound per transaction. `USER` holds nothing in the permission catalogue and that is the design, not an omission (`modules/authorization/domain/catalogue.ts`: "Own-data authority comes from identity + RLS, never from an RBAC grant"). A permission granted to `USER` and to no other role would therefore be a check that its only possible holder always passes — ceremony rather than a boundary. access-control.md §2 records the two authorisation models and which one governs here.

**Permissions deliberately absent:** no staff endpoint returns one customer's transfer matches, and none may be added — the set says which of a person's accounts feed which, and how often.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. This module imports `@karar/transactions` in **three production files** — `infrastructure/adapters/transactions-matchable-transaction-access.ts`, `infrastructure/adapters/transactions-transfer-match-eraser.ts`, and `application/ports/transfer-match-eraser.ts`, which aliases the port that module declares rather than restating it — and imports the package root, never a subpath. `modules/transactions` imports nothing from here, and neither does `modules/financial-accounts`.

`@karar/financial-accounts` is a **devDependency only**, used by the test fixtures to create real accounts through that module's own use case. No production file in this module imports it.

Cross-module references carry a raw UUID plus a reference type declared **in this module** (`domain/refs.ts`): `TransactionRef` for a transaction, `MatchedAccountRef` for the account a side belongs to. Neither is another module's identifier type, and no foreign key crosses a module boundary.

## Notes and known limitations

**No automatic suggestion pass.** Nothing in this module scans a person's transactions looking for candidate pairs. `SuggestTransferMatch` takes two ids a caller has already chosen, and the ingestion or review workstream that will find candidates is not written. That is deliberate for this phase: the rule is complete and enforced, and the thing that finds candidates can be built against a model that already refuses everything it must.

**A writer that does not claim the pair is not protected by the claim.** The cross-side residual this file used to record is closed for every path that exists — `SuggestTransferMatch` through `PrismaTransferMatchRepository` is the only writer — and the *rule* is still enforced against any other, because the indexes and `transfer_matches_guard` refuse a crossing whoever writes it. What a skipping writer loses is the race, not the rule. Recorded here rather than in the closure above, because it is the shape of the remaining exposure and a future ingestion path is exactly where it would first matter.

**Nothing resolves a chain.** Three transactions that form A → B → C are two separate movements and two separate matches; nothing here recognises a chain, and a "transfer path" would be a derived conclusion with its own correctness problem and its own name.

**Retention fixture constants are borrowed.** `LocalSyntheticRetentionDecisionProvider` resolves `ACCOUNT_SYNTHETIC_*` from `@karar/financial-retention-local-fixtures`, because there is one unresolved financial-retention decision and it governs this dataset too. Dedicated `TRANSFER_MATCH_SYNTHETIC_*` constants would be tidier and belong to that package's owner; they are **not** created here, because the entire point of that package is that this module cannot hold such values.

**All fixtures use synthetic names and round amounts.** No real bank, telco, card scheme, wallet provider or exchange house is named anywhere in this module, and none may be.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
