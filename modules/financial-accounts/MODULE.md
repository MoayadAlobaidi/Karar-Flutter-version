# Module: financial-accounts

## Purpose

Financial accounts and the source-reported balance snapshots attached to them, plus the platform's reviewed institution catalogue.

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
| `financial_accounts` | `SUBJECT_OWNED` | the accounts a subject holds, as the subject or their statement declared them — the anchor every transaction and import is scoped to | `HIGHLY_SENSITIVE_FINANCIAL` | **unresolved: the financial-data retention decision is a legal one and has not been taken.** No period is written here. Non-local ingestion fails closed until a PolicyPack decision exists; LOCAL and TEST run on a clearly synthetic fixture with no legal effect | included — the subject's export contains their own accounts | `CASCADE_DELETE` |
| `financial_account_balance_snapshots` | `SUBJECT_OWNED` | balances **as a source reported them** at a stated moment, never a figure this platform computed | `HIGHLY_SENSITIVE_FINANCIAL` | as above — unresolved, fails closed outside LOCAL/TEST | included alongside the account | `CASCADE_DELETE` |
| `institutions` | `NON_PERSONAL` | reviewed catalogue of institutions an account may name; platform reference data owned by no tenant and no subject | `PUBLIC` | the catalogue outlives any account referencing it; no subject-derived bound applies | n/a (no subject owns a catalogue row) | `NON_PERSONAL_BY_DESIGN` |

**Why the institution catalogue is `NON_PERSONAL_BY_DESIGN` and not `RETAIN_WITH_BASIS`.** The Phase 0 stub said `RETAIN_WITH_BASIS`, which is the strategy for data that *is* subject-linked and is kept anyway on a declared basis. That is the wrong shape here, and keeping it because the stub said so would have been the easy answer rather than the correct one. The table is structurally incapable of subject linkage: it carries no tenant id, no user id, no account id and no free text a subject supplied. **A user-supplied institution label never enters this table** — it is stored on the account, subject-owned and treated as `HIGHLY_SENSITIVE_FINANCIAL`, precisely so that an unlisted bank name typed by one person cannot become global reference data. The distinction is enforced by schema, not by convention, and is asserted by test.

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
