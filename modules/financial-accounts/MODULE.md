# Module: financial-accounts

## Purpose

Financial accounts and wallets, the source-reported balance snapshots attached to them, and the platform's reviewed issuer catalogue with its per-country market presence.

**A person does not have one bank and one account, and this model says so** (ADR-0028). Two current accounts at one bank in one currency, a savings account in another currency, several credit cards from one issuer, one or more mobile-money wallets from one operator, a payroll wallet, an e-money wallet from a fintech, and cash are all ordinary, and **every one of them is a separate account row**. Institution, account type, currency and wallet kind are attributes; the account id is the only identity. There is no uniqueness constraint over `institution + user`, `institution + type`, `institution + currency`, `institution + type + currency`, or `issuer + wallet kind` — each of those forbids something real, and their absence is asserted against live PostgreSQL by `__tests__/financial-accounts-multiplicity.integration.test.ts`, which creates the whole awkward portfolio and then reads the catalogue to confirm no such index exists.

**A wallet is an account.** A mobile-money or e-money wallet holds a balance, so it is a `financial_accounts` row with `accountType = WALLET` and a required `walletKind` — the invariant is exact and biconditional: **`walletKind` is present if and only if `accountType = WALLET`**, stated in `domain/financial-account.ts` and enforced by `financial_accounts_wallet_kind_iff_wallet` (migration 0095). **Crypto is out of scope and `WALLET` does not model it.**

**Origin is not the current source.** An account records an immutable `origin` — `MANUAL`, `CSV`, or the modelled-and-unreachable `EXTERNAL_PROVIDER` — meaning only *how it first came to exist*. It does not say where the account's data comes from now: an account may be typed, then imported into, then linked, then corrected by hand and remain one account throughout. The one-source shape this module used to carry (`sourceKind` plus a bound `providerConnectionRef`) was removed rather than reinterpreted, and **a provider-origin account still accepts user corrections** — nothing in the schema, the domain, or the repository makes an edit conditional on origin. Current and historical sources are many per account and live in account-source links, which **this module does not own and does not model**.

**An account may come into existence three ways, and only two of them are implemented.** Manual account creation is a first-class path: a user creates, edits and deletes an account directly, and that is the path a cash account or an unlisted institution takes. CSV statement ingestion may create an account as part of a reviewed import. A third seam exists for future external providers and is **NOT_IMPLEMENTED** — it is modelled so the schema does not have to be rewritten later, not because anything can use it.

**There is no bank connection, and nothing here fabricates one.** No provider is integrated, no credential is stored, no synchronisation cursor exists, and no code path can produce a Connected or Synced status. **A manually created account does not imply a synced provider** — it is a record the user typed, and the surfaces that display it say so. The legacy product's connect-a-bank screen inserted a fabricated account row with an invented masked number and a Synced badge; its own audit called that the single most misleading surface in the product, and it is not carried forward in any form.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 implemented the account core: `public.financial_accounts` and `public.financial_account_balance_snapshots` (both RLS ENABLEd and FORCEd on tenant and user), the reviewed `public.institutions` catalogue, and manual create, read, update and delete as first-class use cases. **No ingestion endpoint and no transport layer exist yet**, and no account can be created by any provider connection
- **Phase:** 5
- **Capability:** TRANSACTIONS — this module is an internal bounded context beneath that product capability, not a capability of its own

**Why not `FINANCIAL_ACCOUNTS`.** This file previously named a capability that does not exist. The closed production registry declares `TRANSACTIONS` and has no `FINANCIAL_ACCOUNTS` id, so the name here resolved to nothing and any reader checking it against the registry would have found a hole. Accounts are not independently purchasable, entitleable or deployable — a user who has accounts but not transactions has nothing, and the reverse is incoherent — so a second capability id would add a dimension the product does not have while widening the surface that availability, entitlement and PolicyPack clearing all have to reason about. Adding one would need an ADR, a capability-map change, a registry change, and an analysis of its bootstrap and client exposure; none of that is warranted to describe a bounded context. Module boundaries and capability ids are deliberately different things here.
- **Highest classification:** HIGHLY_SENSITIVE_FINANCIAL

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25):

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| `financial_accounts` | `SUBJECT_OWNED` | the accounts a subject holds, as the subject or their statement declared them — the anchor every transaction and import is scoped to | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: the financial-data retention decision is a legal one and has not been taken.** No period is written here. Durable creation fails closed until a PolicyPack decision exists, **enforced by `FinancialAccountRetentionDecisionPort` in `CreateManualAccount`** and not merely declared; LOCAL and TEST run on a clearly synthetic fixture with no legal effect | included — the subject's export contains their own accounts | `CASCADE_DELETE` |
| `financial_account_balance_snapshots` | `SUBJECT_OWNED` | balances **as a source reported them** at a stated moment, each stating WHICH balance was quoted (`balanceKind`), never a figure this platform computed and never a kind inferred from another | `HIGHLY_SENSITIVE_FINANCIAL` | as above — unresolved, fails closed, enforced in `RecordReportedBalance` | included alongside the account | `CASCADE_DELETE` |

| `institutions` | `NON_PERSONAL` | reviewed catalogue of the ISSUERS an account may name — one row per issuer globally; platform reference data owned by no tenant and no subject | `PUBLIC` | the catalogue outlives any account referencing it; no subject-derived bound applies | n/a (no subject owns a catalogue row) | `NON_PERSONAL_BY_DESIGN` |
| `institution_markets` | `NON_PERSONAL` | where a reviewed issuer operates, per **country** — market status, the regulatory evidence reference (or the literal `UNVERIFIED`), the reviewed display information, and the provider-access status that apply there | `PUBLIC` | the catalogue outlives any account naming the issuer; no subject-derived bound applies | n/a (no subject owns a catalogue row) | `NON_PERSONAL_BY_DESIGN` |

**What `CASCADE_DELETE` reaches, stated because it used to reach less than it claimed.** For `financial_accounts` the cascade is the account row, its balance snapshots (by foreign key), **and** every account-scoped row other modules hold: the financial records in `modules/transactions`, erased through `FinancialRecordEraserPort`, and the account-source links in `modules/financial-connections`, erased through `AccountSourceLinkEraserPort` — both before the account row is removed. Until the Phase 5 remediation neither of those happened at all — see 'Deletion deletes everything, and is not atomic' below.

**One issuer, many markets, and why that is a second table.** `institutions` identifies an issuer once, globally, and carries its `kind` (`BANK`, `E_MONEY_ISSUER`, `MOBILE_MONEY_OPERATOR`, `TELCO_FINANCIAL_SERVICES`, `PAYMENT_INSTITUTION`, `FINTECH_WALLET`, `CARD_ISSUER`, `EXCHANGE_HOUSE`, `OTHER`). Where it operates is `institution_markets`, keyed on `(institution, country)`. A group operating in four countries is **one issuer with four market rows**, never four issuers: the alternative scatters accounts across near-duplicate catalogue rows whose only repair is a merge, and merging catalogue rows rewrites subject-owned account references across every tenant at once.

**Country is not Jurisdiction, and market presence keys on country.** Country (migration 0070) is *where, geographically* — an ISO 3166-1 code carrying no business rule. Jurisdiction (0071) is *which legal regime governs* — the policy key, usually but not always one per country (`AE` and `AE-DIFC` are one country and two regimes). `institution_markets` therefore has a `country_code` and **no jurisdiction column**, and its absence is asserted by test. `country_code` is a raw reference rather than a foreign key because no FK crosses a module boundary.

**No row asserts a legal fact, and no row implies a connection.** `regulatory_status_evidence_ref` holds either a reference that *names* its evidence or the literal `UNVERIFIED`, which is the default — a bare regulatory claim has no representation. `provider_access_status` is `NOT_IMPLEMENTED` everywhere and `AVAILABLE` is refused by CHECK unless evidence is named. **No issuer named in this catalogue exposes an API to Karar, none is integrated, no credential is stored anywhere in this module, and no interface may render any of these values as "Connected".** No provider-specific column, type, or branch exists in this module, and no code path may branch on which issuer a row is. Both catalogue tables ship **empty**; every fixture uses synthetic issuer names.

**Balance snapshots are reported facts, and one kind is never inferred from another.** A source does not report "the balance" — it reports a specific one, so every snapshot carries a `balanceKind` (`BOOKED`, `AVAILABLE`, `CURRENT`, `OUTSTANDING`, `CREDIT_LIMIT`, `OTHER_SOURCE_REPORTED`). The column is `NOT NULL` **with no `DEFAULT`** and the field is required on `NewBalanceSnapshot` and `RecordReportedBalanceInput`: a default would be a guess written on the caller's behalf and stored as though a source had said it. Nothing derives `AVAILABLE` from `BOOKED`, derives `BOOKED` from `AVAILABLE`, or reads a `CREDIT_LIMIT` as money the person holds — `latestReported` requires the caller to name the kind it is asking about and answers `null` for a kind nobody reported, rather than substituting a neighbour. **An `AVAILABLE` and a `BOOKED` figure for one account at one `as_of` are two legitimate rows**; no unique constraint collapses them, and its absence is asserted. Nothing in this module derives a balance by summing transactions, and nothing labels a derived figure as source-reported; `__tests__/balance-kind-not-inferred.test.ts` scans the module's production source for both guarantees. `accountNature` (`ASSET`, `LIABILITY`, `UNKNOWN`) exists so a credit-card liability is not treated as cash — and nothing here sums, nets, or totals balances using it. `UNKNOWN` is the honest default rather than a placeholder; a consumer that cannot handle it must refuse to answer rather than assume.

**Why the institution catalogue is `NON_PERSONAL_BY_DESIGN` and not `RETAIN_WITH_BASIS`.** (The catalogue is also the one dataset here for which a retention answer of `NOT_APPLICABLE` would be correct — and it has no runtime write path to gate, which is why no caller can legitimately receive that answer.) The Phase 0 stub said `RETAIN_WITH_BASIS`, which is the strategy for data that *is* subject-linked and is kept anyway on a declared basis. That is the wrong shape here, and keeping it because the stub said so would have been the easy answer rather than the correct one. The table is structurally incapable of subject linkage: it carries no tenant id, no user id, no account id and no free text a subject supplied. **A user-supplied institution label never enters this table** — it is stored on the account, subject-owned and treated as `HIGHLY_SENSITIVE_FINANCIAL`, precisely so that an unlisted bank name typed by one person cannot become global reference data. The distinction is enforced by schema, not by convention, and is asserted by test.

## The three encrypted columns, and the one that stopped being free text

`financial_accounts.display_name`, `.user_supplied_institution_label` and `.mask` are `HIGHLY_SENSITIVE_FINANCIAL` and **exist only as ciphertext**: each is a `ciphertext` / `nonce` / `auth_tag` triple, with `hsf_algorithm` and `hsf_key_version` per row (migration 0088). No plaintext column exists for any of them. An account name plus an unlisted bank name plus a four-digit tail identifies a person's banking relationships; `modules/transactions` stored its narrative this way from its first line, and this module storing the same class of value as `text` was the weaker of two treatments under one classification.

Two consequences are recorded because they look like losses until the reason is visible:

- **The mask CHECK could not survive.** A `CHECK (mask ~ '^[*xX#]{0,4}[0-9]{2,4}$')` cannot read a ciphertext, so it was removed rather than kept as a rule that can no longer fire. The shape rule now lives only in `domain/financial-account.ts`. What survives at the database is the property that mattered: AES-256-GCM is length-preserving, so an eight-byte bound on `mask_ciphertext` is an eight-character bound on the mask — the exact maximum the pattern admits — and a 13-to-19-digit PAN remains structurally unrepresentable.
- **`financial_account_balance_snapshots.source_reference` is now a `uuid`**, not 200 characters of text. It names the artefact that reported a figure; the only legitimate content was always an identifier, and a free-text column on an HSF table is a place a statement line can be written by someone trying to be helpful. Encrypting it would have hidden narrative rather than made it unrepresentable, and would have broken the one operation the column has (equality). Migration 0089's header carries the full argument.

## Ports this module declares and does not implement

| Port | Answers | Implemented by |
|---|---|---|
| `HsfFieldEncryptionPort` | encrypt/decrypt one HSF field, binding tenant, user, table, row id and field as associated data | `infrastructure/providers` locally; a key-management-backed adapter (ADR-0017) elsewhere. `resolveHsfFieldEncryptionPort` **throws** in dev, staging and production when no approved provider is wired |
| `FinancialAccountRetentionDecisionPort` | `DECIDED` \| `PENDING_LEGAL_REVIEW` \| `UNAVAILABLE` \| `NOT_APPLICABLE` for one durable dataset | a labelled synthetic fixture in LOCAL only; a policy-pack reader elsewhere. `NOT_APPLICABLE` is a refusal for both datasets here — a subject's financial records are not outside retention law |
| `FinancialRecordPresencePort` | does this account hold any financial record? A boolean, never rows and never a count | `modules/transactions` |
| `FinancialRecordEraserPort` | erase every account-scoped financial record, returning exact per-kind counts | `modules/transactions` |
| `AccountSourceLinkEraserPort` | erase every source link feeding an account, returning the exact count | `modules/financial-connections` |

The domain imports none of these implementers. `FinancialRecordPresencePort` exists because currency immutability was enforced against balance snapshots alone, so an account with transactions and no snapshot could be re-denominated — silently rescaling every amount by ten between a two-decimal and a three-decimal currency.

## Deletion deletes everything, and is not atomic

`DeleteOwnAccount` used to claim it removed "everything scoped to" an account while removing the account and its snapshots only. Transactions, revisions, provenance and category assignments carry a raw `account_id` with no foreign key back here (no FK crosses a module boundary) and survived orphaned; so did the account-source links in `modules/financial-connections`, which additionally hold the encrypted external account reference for the source account — a protected external identity retained about a subject who had asked to be rid of it, and a live route by which the next import would have re-created the account just deleted. Both are now erased, through `FinancialRecordEraserPort` and `AccountSourceLinkEraserPort`, before the account row is deleted.

**The order is source links, then financial records, then the account row.** A source link is the route by which new records arrive for an account: cut the route first and nothing can be delivered afterwards, whereas erasing the records first leaves a live link an import can use to write fresh rows in the gap before the account row goes — rows the delete would then orphan while reporting success. Stopping after the links also loses less: an account that keeps every record but loses its links is coherent, retryable, and rebuildable by asking the subject again.

**Cross-module deletion is not atomic and this module does not claim it is.** Each eraser runs in its own module's principal-scoped transaction; the account delete runs in this module's, and no unit of work spans all three — one would require passing a live transaction handle through an application port. The residual window is narrowed by ordering (visibility and version are checked before anything is erased), closed on retry (both erasers are idempotent by contract), and reported honestly: a source-link refusal answers `source_link_erasure_incomplete` with nothing else attempted, a record refusal answers `erasure_incomplete` carrying the source links that already went, and a successful erasure followed by a failed account delete answers `deletion_partially_applied`. None of them is ever reported as success.

**Neither eraser's `reason` may carry store text outward.** Driver text can hold a connection string, the failing SQL, or a fragment of the row being erased; a refusal from this path therefore carries a stable message of this module's own and attaches the original throw NON-ENUMERABLY for the one boundary allowed to log it (`__tests__/error-redaction.test.ts` is the standing check on that shape).

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `AccountCreated` | `HIGHLY_SENSITIVE_FINANCIAL` | projections, audit | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `accounts.account.read` | `USER` |
| `accounts.account.write` | `USER` |

**Permissions deliberately absent:** No staff endpoint returns one customer's accounts.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**Manual account create, edit, and delete are first-class `IMPLEMENTED`** (challenge C9). The legacy exposes a single GET and creates accounts only as a side effect of statement commit — while a compulsory consent document promises customers they can delete individual accounts. That contradiction (legacy C4/M7) must not ship here.

**The connect-a-bank mock is not carried forward.** The legacy's screen *inserts a fabricated account row into local state with an invented masked number and a Synced status* — its own audit calls it *the single most misleading surface in the product*. Capability state is shown honestly.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
