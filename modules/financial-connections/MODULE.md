# Module: financial-connections

## Purpose

**How Karar receives financial data, and which source feeds which account.** Two subject-owned tables: `public.financial_connections` (0096) and `public.account_source_links` (0097).

**A connection is not an account** (ADR-0028). An account is where a balance sits; a connection is the route a fact travels to get here. One connection may feed **many** accounts — a single uploaded statement legitimately covers a current account and the credit card printed beneath it — and one person may hold **several** connections to one institution, because two statements downloaded from one bank in two different months are two arrivals of data and not one. Neither is expressible if the source is a column on the account, which is what migration 0088 removed.

**`account_source_links` is the seam the redesign exists for.** While the account carried its own source, a CSV-created account that later received API data had to become a SECOND account, and the person's history split in two with nothing to tell them it had happened. The relationship is many-to-many in both directions and neither direction is optional.

**Nothing here computes anything.** No balance, no merged view, no reconciliation, no precedence resolution, no insight. Source priority and authority are stored; which source wins is a different concept with its own correctness problem and its own name.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 implemented the connection and source-link core: both tables (RLS ENABLEd and FORCEd on tenant and user), the rail vocabulary with its database-enforced implemented subset, the keyed per-subject source-account fingerprint, and the exact/probable linking decision. **No ingestion endpoint and no transport layer exist yet**, and no connection can be created on a rail nobody built
- **Phase:** 5
- **Capability:** TRANSACTIONS — this module is an internal bounded context beneath that product capability, not a capability of its own. The reasoning `modules/financial-accounts` records applies unchanged: a connection is not independently purchasable, entitleable or deployable, and a second capability id would add a dimension the product does not have
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `financial_connections` | `SUBJECT_OWNED` | how Karar receives financial data for this subject — the rail, its availability, and the institution it relates to. Never an account, and never a credential | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: the financial-data retention decision is a legal one and has not been taken.** No period is written here. Durable creation fails closed until a PolicyPack decision exists, **enforced by `FinancialConnectionRetentionDecisionPort` in `CreateManualConnection`** and not merely declared; LOCAL and TEST run on a clearly synthetic fixture with no legal effect | included — the subject's export contains their own connections | `CASCADE_DELETE` |
| `account_source_links` | `SUBJECT_OWNED` | which connection feeds which account, with the protected external identity that lets the same source account be recognised again, the basis on which it was linked, and what this platform has actually observed the source provide | `HIGHLY_SENSITIVE_FINANCIAL` | as above — unresolved, fails closed, enforced in `ProposeAccountSourceLink` | included (see below) — the subject's export contains which sources feed their accounts, **excluding** the encrypted external reference and the fingerprint | `CASCADE_DELETE` |

**Why two fields are held back from an export that is otherwise complete.** `source_account_reference` is another party's identifier **for** the subject, and `source_account_fingerprint` is a keyed value whose only power is saying that two rows are about the same external account. Putting either in a file on a laptop is precisely what the ciphertext column and the per-subject key exist to prevent, and neither is a fact about the subject that the subject does not already know — the person knows their own account number; what they do not have is a copy of it sitting in a downloaded archive. Every other column is exported.

**What `CASCADE_DELETE` reaches.** For `financial_connections` it is the connection row **and every source link it fed**, by `ON DELETE CASCADE` on `account_source_links_connection_fkey` (0097), with the exact count reported by `DeleteOwnConnection` rather than assumed. It does **not** reach accounts, transactions, or anything a source delivered: those are the person's financial records and they survive the route that carried them. What the person loses is the *recognition* of the source accounts that connection carried — a later import through a new connection has no prior fingerprint to match, so it arrives as a probable match and asks rather than linking automatically. That is a question, not a duplicate account.

For `account_source_links` the cascade is the link row itself, reached from the connection above or from the account side through `EraseAccountSourceLinks`, which `DeleteOwnAccount` now calls through `AccountSourceLinkEraserPort` before it removes the account row; see 'The inward port `financial-accounts` declares, and this module satisfies'.

## The rail vocabulary, and the gate underneath it

Thirteen rails are **named**: `MANUAL`, `USER_FILE_UPLOAD`, `OPEN_FINANCE_API`, `DIRECT_BANK_OR_WALLET_API`, `LICENSED_AGGREGATOR_API`, `HOST_TO_HOST_SFTP`, `ISO_20022_FILE`, `SWIFT_MT_FILE`, `OFX_QFX_FILE`, `QIF_FILE`, `PDF_STATEMENT`, `SECURE_EMAIL_STATEMENT`, `DEVICE_SIGNAL`. Naming them costs nothing and shapes the model correctly; a vocabulary invented later would have to be retrofitted onto rows already written, which means rewriting other people's financial records to fit a word chosen afterwards.

**Only `MANUAL` and `USER_FILE_UPLOAD` may be created, and the DATABASE is what says so.**

```sql
CONSTRAINT financial_connections_rail_implemented_check
  CHECK (rail IN ('MANUAL', 'USER_FILE_UPLOAD'))
```

Not "the use case validates it", not "the type restricts it" — the row does not exist, including for a direct SQL `INSERT` by `karar_app`, a fixture, a backfill, or an ingestion path written by someone who never read this file. The vocabulary CHECK and the gate CHECK are **separate on purpose**: implementing a rail widens the gate and leaves the vocabulary untouched, so "we can describe this rail" and "this rail works" never become one edit.

**Status cannot claim more than the rail supports.** `financial_connections_active_requires_implemented_rail` refuses `ACTIVE` outside the implemented set, and it names that set *independently* of the gate — so widening one does not silently widen the other. `NOT_IMPLEMENTED` is **modelled and unreachable**, exactly as `financial_accounts.origin_kind = 'EXTERNAL_PROVIDER'` is: no row may carry an unimplemented rail, and `financial_connections_not_implemented_status_matches_rail` refuses the status for an implemented one, so no row in this table describes an unimplemented rail because there is no such row at all.

**No status means connected.** There is no `CONNECTED`, `SYNCED`, `LINKED`, `AUTHORIZED` or `PAIRED` value, and `impliesLiveInstitutionLink` answers `false` for every value in the vocabulary — a function rather than a sentence, so the claim is checkable and a value added later has nowhere to be handled. `ACTIVE` on a `MANUAL` connection means the person may type entries; on a `USER_FILE_UPLOAD` connection, that they may upload a file. **No provider is integrated, none exposes an interface to Karar, and no surface may render any of this as a bank connection.** The legacy's connect-a-bank screen inserted a fabricated account with a Synced badge and its own audit called that the single most misleading surface in the product; nothing in this schema can express that claim.

## No credential of any kind, and how an absence is proved

There is **no** username, password, mPIN, OTP, recovery code, security answer, cookie, session token, access token, refresh token, client secret, certificate, device binding, scraping state or synchronisation cursor column anywhere in this module — and no free-text or JSON column one could be hidden inside. Every column is an identifier, a value from a closed vocabulary, an encryption parameter, a timestamp, or an encrypted field.

A `CHECK` cannot assert the absence of a column, so the guarantee is asserted the only way it can be: `__tests__/no-credential-columns.integration.test.ts` reads `information_schema.columns` for both tables and compares the column set against an **EXHAUSTIVE** expected list. Any column added — credential-shaped or not — fails that test until someone changes the list deliberately, and a second assertion refuses any column name matching the credential vocabulary outright. `domain/refs.ts` carries the same rule at the type level: there is no reference type for a secret either, because a reference to a credential is still a design that has a credential in it.

## External identity protection

**Three mechanisms, because the obvious single answer is wrong in a different way each time.**

**1. The reference is ciphertext.** `source_account_reference` exists only as ciphertext + nonce + auth tag, with the algorithm and key version per row (ADR-0017) and tenant, user, table, row id and field bound as AEAD associated data. There is no plaintext column. **No full account number, IBAN, PAN or wallet phone number is stored** — but note carefully what does *not* provide that guarantee: a byte bound cannot tell a 24-character opaque provider token from a 24-character IBAN, so the length argument `modules/financial-accounts` uses for its mask column is simply not available here. The rule is a **domain** rule applied before anything is encrypted (`domain/external-account-reference.ts`): an ISO 13616 IBAN shape is refused, any run of eight or more consecutive digits is refused (eight is the shortest thing that must go — an E.164 subscriber number — and everything longer is caught by the same rule), and the value must be an identifier token rather than prose. The 96-byte ciphertext bound is the *other* half: it keeps the column from becoming narrative storage.

**2. Equality is a keyed, per-subject, versioned fingerprint** — never a plain hash, never the ciphertext.

- **Keyed**, because `sha256(accountReference)` is a confirmation oracle over an identifier that names a real account outside Karar: read the column, guess a number in a known format, get a definitive yes. That is exactly the behaviour the ciphertext exists to prevent, handed back in a form that survives encryption.
- **Per subject**, because a single platform key would make the same external reference under two people produce the same digest — a cross-subject join key inside a shared table, derivable across a whole database without decrypting anything.
- **Versioned**, because the definition (including the normalisation ruleset) will change, and the version participates in the unique constraint so a bump starts a fresh namespace instead of colliding with old values.

The construction is `subjectKey = HMAC-SHA256(rootKey, "karar/financial-connections/source-account/v1|tenant|user")`, then `value = HMAC-SHA256(subjectKey, canonicalEncoding(scheme, normalizedReference))`, length-prefixed. Version `source-account/hmac-sha256/opaque-reference/v1`. Equality against the ciphertext is impossible by construction and that is deliberate: a fresh nonce per encryption means the same reference encrypts differently every time, and a deterministic ciphertext would restore the oracle in the one place this table cannot afford it.

**Cross-subject non-correlation is proven, not claimed.** `__tests__/source-account-fingerprint.test.ts` fingerprints one external reference under three principals — two members of ONE tenant and one in another — and asserts all three values differ, while the same principal and reference is asserted stable. The same-tenant pair is the important one: a tenant-only derivation would pass the cross-tenant check and fail the household case.

**Nothing about the CONNECTION enters the digest**, and that absence is the mechanism rather than an oversight. ADR-0028's rule is that an exact match *within one principal* may link automatically, so the value must be comparable across that principal's connections — which is precisely how a CSV-created account later receives API data without becoming a second account.

**3. Neither value leaves.** Every read path returns `AccountSourceLinkView`, which carries neither the reference nor the fingerprint; `__tests__/protected-values-never-exposed.test.ts` asserts that at runtime over `Object.keys` and scans this module's production source for a logging call. The ciphertext is kept anyway because equality is not the only question it answers: a fingerprint-version bump has to be recomputable from the original, and "which source account is this link about?" must remain answerable to an operator under due process rather than being permanently unanswerable to everyone including the subject.

## Uniqueness, and the constraint this is deliberately not

```sql
CONSTRAINT account_source_links_source_account_key
  UNIQUE (tenant_id, user_id, connection_id, source_account_fingerprint_version,
          source_account_fingerprint)
```

One source account, one link, per connection — so a repeated import updates a link instead of creating a second one, under concurrency and not merely usually. `tenant_id` and `user_id` are implied by `connection_id` and are named anyway: a unique index is enforced globally regardless of RLS, so stating the subject makes the constraint subject-scoped structurally rather than cryptographically.

The version column is named `source_account_fingerprint_version` rather than the shorter `fingerprint_version`, and the prefix is load-bearing: `public.transactions` (0090) carries a `fingerprint_version` of its own for a **different** fingerprint over **different** inputs, and that module asserts against the live catalogue that no other table carries the dedup identity's column names. Two unrelated fingerprints sharing one column name would break that assertion and would make any future audit query over `fingerprint_version` silently mix two vocabularies.

**It is NOT `(institution, account type, currency)` in any arrangement.** That combination is exactly what a real person legitimately duplicates — two current accounts at one bank in one currency, two credit cards from one issuer — and a merge rule built on it silently joins two accounts that were never the same. This table carries no institution, account-type or currency column at all, so the constraint is **unwritable** rather than merely absent, and the schema test asserts both the missing columns and the exact set of unique indexes that exist.

**One source account never maps to two canonical accounts, across every connection.** The unique constraint reaches only within one connection, and the failure that matters spans them: a CSV link pointing source account X at account A while an API link points the same X at account B is one person's history split in two. `account_source_links_guard` refuses any INSERT or UPDATE that would leave one principal holding two non-declined links with the same fingerprint and different `account_id`s (SQLSTATE `KAR23`). It runs `SECURITY INVOKER`, so the rows informing the answer are the caller's own — which is also exactly the scope the fingerprint is defined over.

## Linking rules

| Basis | What it means | What happens |
|---|---|---|
| `EXACT_EXTERNAL_REFERENCE` | the incoming reference fingerprints identically to one this principal already holds | **may link automatically**, to the account the source already resolves to |
| `PROBABLE` | anything less — a similar name, a matching tail, a plausible currency and balance | **may not link automatically**: born `PENDING_CONFIRMATION`, feeds nothing, and becomes `LINKED` only through `ConfirmProbableSourceLink`, which records the instant the SUBJECT decided |

The database enforces the second row rather than trusting the use case:

```sql
CONSTRAINT account_source_links_probable_requires_confirmation
  CHECK (source_status NOT IN ('LINKED', 'DORMANT')
         OR match_basis = 'EXACT_EXTERNAL_REFERENCE'
         OR subject_confirmed_at IS NOT NULL)
```

A wrong automatic link merges two accounts that were never the same, or splits one person's history across two. Neither is visible to the person it happens to, and neither is repairable from the outside once transactions have accumulated on both sides — which is why the asymmetry is not caution for its own sake.

**A declined match is kept, not deleted.** Without the row, the same wrong suggestion returns on every import. Declined rows are excluded from the cross-connection guard for the same reason: a refusal is a record of what did *not* happen, and a person may decline a match against one account and later accept one against another.

**A settled link cannot be re-pointed.** `account_source_links_guard` allows `account_id` to move only while the link is `PENDING_CONFIRMATION` or `DECLINED` (SQLSTATE `KAR21`); once confirmed, moving it would move every fact that arrived through that source, silently.

**Nothing here can merge on institution, type or currency** — it never sees any of them. `CanonicalAccountAccessPort` returns an account's existence and lifecycle state and nothing else.

## Ports this module declares

| Port | Answers | Implemented by |
|---|---|---|
| `HsfFieldEncryptionPort` | encrypt/decrypt one HSF field, binding tenant, user, table, row id and field as associated data | `infrastructure/providers` locally; a key-management-backed adapter (ADR-0017) elsewhere. `resolveHsfFieldEncryptionPort` **throws** in dev, staging and production when no approved provider is wired |
| `SourceAccountFingerprintPort` | the keyed, per-subject, versioned equality value for one external reference | `infrastructure/providers` locally (root key in process memory); a key-management-backed adapter elsewhere |
| `FinancialConnectionRetentionDecisionPort` | `DECIDED` \| `PENDING_LEGAL_REVIEW` \| `UNAVAILABLE` \| `NOT_APPLICABLE` for one durable dataset | a labelled synthetic fixture in LOCAL only; a policy-pack reader elsewhere. `NOT_APPLICABLE` is a refusal for both datasets — a subject's data routes and the encrypted identifiers behind them are not outside retention law |
| `CanonicalAccountAccessPort` | does this account exist for this principal, and is it linkable? Existence and lifecycle state, **no narrative** | `infrastructure/adapters`, over `@karar/financial-accounts`' `public-api.ts` |
| `SourceObservationWriterPort` | one delivery that ARRIVED through a link, recorded on a transaction the CALLER opened. Answers how many links moved, and nothing else | `PrismaSourceObservationWriter` in `infrastructure/persistence`. Called by `modules/statement-imports` inside its statement-commit unit of work; see the section below |
| `FinancialConnectionRepository`, `AccountSourceLinkRepository`, `IdSource` | persistence and identity | `infrastructure/persistence` |

**One port this module IMPLEMENTS rather than declares:** `AccountSourceLinkEraserPort`, declared by `@karar/financial-accounts` and satisfied by `FinancialAccountsSourceLinkEraser` in `infrastructure/adapters/`. See 'The inward port `financial-accounts` declares, and this module satisfies'.

**One port declared here for another module to CALL:** `SourceObservationWriterPort`. The two run in opposite directions and both keep the dependency one-way — the interface belongs to whichever module cannot import the other, and the implementation belongs to whichever module owns the rows.

## The inward port `financial-accounts` declares, and this module satisfies

**This module depends on `@karar/financial-accounts`; that module must not depend on this one.** Erasing an account has to reach source links — `account_source_links.account_id` is a raw uuid with no foreign key back, because no FK crosses a module boundary — but the interface belongs to the module that owns the deletion path (architecture test 5: ports are declared inward). This module **cannot and does not** add it; it implements it.

**Declared: `modules/financial-accounts/application/ports/account-source-link-eraser.ts`**

```ts
export type AccountSourceLinkErasureOutcome =
  | { readonly kind: 'erased'; readonly accountSourceLinksDeleted: number }
  | { readonly kind: 'incomplete'; readonly accountSourceLinksDeleted: number; readonly reason: string }
  | { readonly kind: 'failed'; readonly reason: string };

export interface AccountSourceLinkEraserPort {
  /** Idempotent by contract: a second call finds nothing and answers zero. */
  eraseAccountSourceLinks(
    actor: AccountsPrincipal,
    accountId: FinancialAccountId,
  ): Promise<AccountSourceLinkErasureOutcome>;
}
```

**Satisfied: `infrastructure/adapters/financial-accounts-source-link-eraser.ts`** — `FinancialAccountsSourceLinkEraser`, a delegation to `EraseAccountSourceLinks` and nothing more. It never puts driver text in `reason`: the reason is fixed text chosen by the refusal's kind, and the original throw rides along non-enumerably for the boundary logger, because driver text can carry a connection string, the failing SQL, or a fragment of the ciphertext of an external account reference.

`DeleteOwnAccount` calls it **first of everything it removes** — before `PaymentInstrumentEraserPort`, before `FinancialRecordEraserPort`, and before the account row — folding every count into the outcome it reports. Links first because a link is the route by which new records arrive, and it is the only one of the three that can put a row in the database: cut the route before erasing the records that travel down it, or an import through a still-live link can write rows into the gap that the account delete then orphans. A **separate** port rather than a new kind on `ERASABLE_FINANCIAL_RECORD_KINDS`, because `FinancialRecordEraserPort` has exactly one implementer (`modules/transactions`) and a composition root can bind only one — adding a kind would make one module responsible for erasing another's rows. All three erasers are **required** constructor arguments of `DeleteOwnAccount`; none has a do-nothing default, so a composition root that binds this module and forgets to pass the eraser fails to compile rather than silently skipping the erasure.

**Failure semantics.** A throw or any non-`erased` outcome means the account is **not** deleted and the counts reported are honest about what did and did not go: a source-link refusal answers `source_link_erasure_incomplete` with nothing else attempted, an instrument refusal answers `instrument_erasure_incomplete` carrying the source-link count, and a record-eraser refusal answers `erasure_incomplete` carrying both the source-link and the instrument counts, because by then those rows really have gone. A partial state is never reported as completion.

**Proven, not asserted.** `__tests__/account-erasure.integration.test.ts` creates an account, links two sources to it (one exact, one confirmed probable), deletes the account through the accounts module's own `DeleteOwnAccount`, and counts the surviving rows **as the bootstrap superuser with RLS bypassed** — because counting as `karar_app` would prove the rows are hidden, not that they are gone. For one phase this port did not exist and an account deleted through `DeleteOwnAccount` left its links behind; the gap was recorded here in exactly this place, which is what made it fixable.

## The port this module declares for ingestion to call, and the write it took back

**`modules/statement-imports` depends on this module; this module must not depend back.** When a person's uploaded statement arrives through one of their connections, the link that carried it should record that it delivered — the observation window, the days the data covered. Those are columns in `account_source_links`, behind this module's RLS policy, its guard trigger and its cascade.

For one phase the ingestion module wrote them itself, with an `updateMany` inside its statement-commit transaction. It was recorded honestly on both sides as the one remaining cross-module write rather than left to be discovered, and that is what made it fixable. It is now a port.

**Declared: `application/ports/source-observation-writer.ts`**

```ts
export interface SourceObservationWriteUnit {
  readonly unit: unknown;
}

export interface ObservedSourceDelivery {
  readonly connectionId: FinancialConnectionId;
  readonly accountRef: CanonicalAccountRef;
  /** Moves last_observed_at AND last_successful_import_at: this port reports a delivery that WORKED. */
  readonly observedAt: Date;
  readonly historyCoverage: HistoryCoverage;
}

export interface SourceObservationWriterPort {
  /** Joins the caller's open unit, adds no transaction, answers how many links moved. */
  recordDeliveryObserved(
    unit: SourceObservationWriteUnit,
    actor: ConnectionsPrincipal,
    delivery: ObservedSourceDelivery,
  ): Promise<number>;
}
```

**Why the transaction is a parameter.** A statement commit must land as ONE unit — the canonical records, the staged rows' links, the import's state moves and this observation — or a link claims a successful import that rolled back. `AccountSourceLinkRepository.update` opens its OWN transaction, so it cannot be part of somebody else's unit of work; the caller opens one, binds its principal into it, and `PrismaSourceObservationWriter` joins it. `SourceObservationWriteUnit` is opaque (`unknown`) so the ORM stays out of the application layer, and the adapter that created the handle and the adapter that joins it are the only code that knows what it is. Same shape, same reason, as `ImportedRecordCommitPort` in `modules/transactions` and the transactional outbox itself (ADR-0012).

**Why not `RecordSourceObservation`.** That use case takes a link id and the version the caller read, and folds the observation through the domain. An importer has neither: finding the link would mean reading rows whose whole point is that nobody reads them — the encrypted external reference and the keyed fingerprint — and a lost optimistic update inside somebody's commit could only be answered by failing their import or retrying inside the widest transaction in the platform. The port is a set-based write instead, and the columns it may touch are exactly the ones the fold would have produced.

**An observation is a report, never a decision** — the same rule `RecordSourceObservation` states, made unreachable rather than merely intended. Nothing through this port creates a link, points one at another account, changes a status, a match basis, a priority or an authority, or records a confirmation. Nothing is read back: it cannot be used to learn that a link exists, let alone anything about the source account behind it. The only answer is a count, and **zero is ordinary** — a person may import a file through no connection at all, and an import must not fail because the route it came in by is gone.

**Two things the owning side does that the direct write did not.** It advances `version` in the same statement, because `account_source_links_guard` raises `KAR22` on any UPDATE that does not — the old write never set it, so every link it actually matched would have aborted somebody's import, and it only looked correct because no test had a link for it to match. And it excludes links whose `first_observed_at` is AFTER the delivery, because `account_source_links_observation_order_check` would refuse those: a clock problem on one row of this table is not a person's statement import's to fail over, so such a link is left alone and the count says so.

**Proven, not asserted.** `__tests__/source-observation-writer.integration.test.ts` links two source accounts from one connection to one account, records a delivery on a transaction it opens itself, and reads the rows back **as the bootstrap superuser with RLS bypassed**: both links moved, the token advanced by exactly one, and every column that says what a link IS — account, connection, fingerprint, status, subject confirmation, priority, capabilities — is byte-for-byte what it was. It then proves the writer opens no transaction of its own by rolling the caller's back and finding the links untouched.

## Events published

None. This module publishes no event this phase. When it does, the payload rule is identifier-only and the external reference and fingerprint are not identifiers — neither may ever appear in one.

## Permissions

| Permission | Role(s) |
|---|---|
| `accounts.connection.read` | `USER` |
| `accounts.connection.write` | `USER` |

**Permissions deliberately absent:** no staff endpoint returns one customer's connections or source links, and none may be added — a source link says which institutions a person deals with and, through the fingerprint, which of their accounts are the same account.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. This module imports `@karar/financial-accounts` in **exactly two files**, both under `infrastructure/adapters/` — `financial-accounts-canonical-account-access.ts` and `financial-accounts-source-link-eraser.ts` — and imports the package root, never a subpath. `modules/financial-accounts` imports nothing from here.

**`modules/statement-imports` depends on this module, and this module imports nothing from it.** That direction is what decides where `SourceObservationWriterPort` is declared: the contract for these rows is declared here and called from there, because the reverse import would be a cycle. `modules/statement-imports/__tests__/module-boundary.test.ts` asserts both halves — that it names this module as a dependency, and that nothing here imports `@karar/statement-imports`.

Cross-module references carry a raw UUID plus a reference type declared **in this module** (`domain/refs.ts`): `CanonicalAccountRef` for an account, `InstitutionRef` for a catalogue entry. Neither is another module's identifier type, and no foreign key crosses a module boundary.

## Notes and known limitations

**No transport, no ingestion.** There is no HTTP surface, no CSV parser and no import pipeline here. This module is the model those will write into.

**Retention fixture constants are borrowed.** `LocalSyntheticRetentionDecisionProvider` resolves `ACCOUNT_SYNTHETIC_*` from `@karar/financial-retention-local-fixtures`, because there is one unresolved financial-retention decision and it governs these datasets too. Dedicated `CONNECTION_SYNTHETIC_*` constants would be tidier and belong to that package's owner; they are **not** created here, because the entire point of that package is that this module cannot hold such values.

**Nothing here resolves a conflict between two sources.** `source_priority` and `source_authority` are recorded and applied nowhere. When two sources report different figures for one account, choosing between them is a reconciliation decision with its own correctness problem — which as-of instants, whose rounding, which currency — and it must arrive under its own name rather than being assembled from these columns by whoever needs an answer first.

**All fixtures use synthetic issuer and account names.** No real bank, telco, wallet provider or exchange house is named anywhere in this module, and none may be.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
