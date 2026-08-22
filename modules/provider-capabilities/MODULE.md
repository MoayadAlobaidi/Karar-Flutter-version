# Module: provider-capabilities

## Purpose

**What a financial institution's data interface COULD offer, as reviewed configuration and never as a live fact** (ADR-0028). No database table, no migration, no adapter, no HTTP client, no network call.

A capability profile is the written result of somebody reading a document — a published API specification, a regulator's open-finance mandate, a partnership term sheet, an issuer's support page — and recording what it said and **where anyone can check**. That is the whole concept. It is not a probe result, not a health check, not a cache, and above all not a permission.

The module exists because the alternative is worse than nothing. Without it, "which providers can we get data from?" is answered in a spreadsheet, in a slide, or in somebody's head, and the answer arrives in the product as a screen that says Connected. The legacy product's connect-a-bank screen did exactly that — a fabricated account row with an invented masked number and a Synced badge, which its own audit called the single most misleading surface in the product. Every rule below exists to make the corresponding sentence unsayable rather than discouraged.

**Six claims, each held by a type or a validator and each proved by a test:**

1. `VERIFIED` is **unconstructible** without an evidence reference — not validated, unconstructible.
2. The existence of a mobile app **never** implies an API, and the two facts live in two types with no function between them.
3. A profile **cannot** make an unavailable rail executable; only `modules/financial-connections` decides what may exist.
4. **Zero real providers ship**, and nothing in the registry is `VERIFIED`. Every fixture is synthetic.
5. **No provider-specific type, field, constant or conditional** exists in domain or application — and cannot, because a profile has no name field at all.
6. Only `MANUAL` and `USER_FILE_UPLOAD` are executable. Everything else is described and unavailable.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** ACTIVE — Phase 5 built the typed model: the four-state capability assertion whose `VERIFIED` arm requires an evidence reference, the closed vocabularies, the profile shape over vocabularies mirrored from `modules/financial-connections` and `modules/financial-accounts` and checked against them by test, the validator, the empty reviewed registry, one port, one use case, one adapter. **No table, no migration, no transport, and no provider integration of any kind**
- **Phase:** 5
- **Capability:** TRANSACTIONS — this module is an internal bounded context beneath that product capability, not a capability of its own. It is not independently purchasable, entitleable or deployable, and a second capability id would add a dimension the product does not have
- **Highest classification:** PUBLIC — see 'Data owned'

## Vocabulary

| Term | Means | Does NOT mean |
|---|---|---|
| **Capability profile** | one issuer's interface, in one market, for one segment, as a review recorded it | anything about whether data flows, or can |
| **Assertion** | one of four states about one capability; only `VERIFIED` claims anything | a live status, a probe, or a health check |
| **Evidence reference** | `scheme:locator` naming where a reviewer read it | the evidence itself — nothing here reads what it points at |
| **Consumer surface** | a channel the issuer offers **its own customers** | a data rail, an interface, or anything Karar can use |
| **Data rail** | a shape of arrangement, in a vocabulary mirroring `modules/financial-connections`' | that any such arrangement exists, or may be opened |
| **Described as available** | a reviewer read a document saying an interface offers this | executable, permitted, connected, or implemented |
| **Access stage** | how far a commercial or technical onboarding got | that data is flowing |
| **Market** | a country — geography (ISO 3166-1 alpha-2) | a jurisdiction, which is the legal policy key |

## Data owned

Every persistent dataset declares its full lifecycle (ADR-0026, architecture test 25). **This module owns none**, and the row below records the decision rather than leaving the table empty:

| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

**Why there is no table, argued rather than assumed.** A capability profile is reviewed configuration, and reviewed configuration is code in this repository for the same reason `packages/capability-registry` is: adding one is a reviewed change, never configuration, and the diff is the audit trail. A table would let a profile be created by an `UPDATE` nobody read — which is precisely the shape of the failure this module exists to prevent, since the single most damaging row anyone could write is a `VERIFIED` one.

The standing rule against creating an unused table for a future possibility applies with unusual force here, because there are **zero** real profiles. A table would be empty, and an empty table is not neutral: it acquires an RLS decision, an erasure strategy, a lifecycle declaration and a retention answer, all describing data that does not exist and may never.

The reference data a profile points at **already has its tables**, and they are the right ones: `public.institutions` (0087) names issuers once, and `public.institution_markets` (0094) records where each operates, under what reviewed status, with `provider_access_status` and its `AVAILABLE`-requires-evidence CHECK. Those hold facts about the world. This module holds facts about *our review of the world*, which is a different thing with a different owner and a different rate of change.

**If a table is ever needed** — because a review tool must write profiles outside a deploy — it belongs to whichever module owns that tool, it is `NON_PERSONAL` / `PUBLIC` like the two catalogues, and it carries `institution_markets`' evidence CHECK verbatim so the database refuses a `VERIFIED` row without a reference. It is not created here, and not before the tool exists.

## The rule that shapes everything: `VERIFIED` requires evidence, in the type

`CapabilityAssertion` is a discriminated union, and its `VERIFIED` arm requires `evidence: EvidenceReference` and `reviewedOn: CalendarDay` as **required fields**:

```ts
export interface CapabilityVerified {
  readonly state: 'VERIFIED';
  readonly evidence: EvidenceReference;
  readonly reviewedOn: CalendarDay;
}
```

This is the shape `modules/financial-accounts` uses for its retention decision, where `RetentionDecided` requires `basis` and `approvalReference` so that "we have a retention period" cannot be expressed without saying who approved it. The failure both prevent is the same, and it is not hypothetical: a state enum with an optional evidence field produces a `VERIFIED` value the first time somebody is in a hurry, and nothing about the value afterwards says the evidence was never supplied.

Four mechanisms hold it, and the first two are the guarantee:

1. **`EvidenceReference` is nominal.** A bare string is not one. The only way to obtain one is `EvidenceReference.of` / `.tryOf`, which accept exactly the shape `institution_markets_regulatory_evidence_check` already enforces in migration 0094 — `scheme:locator`, lower-case scheme of 3 to 32 characters. The literal `UNVERIFIED` does not match, so the sentinel meaning "nobody looked" cannot be passed off as evidence that somebody did.
2. **There is no constructor from a state word.** `verified` is the only function producing the state, and its first parameter is the reference. There is no `assertionFromState`, and adding one would have to invent evidence or make it optional.
3. **Three compile-time proofs** in `domain/capability-assertion.ts` evaluate to `never` — failing `pnpm typecheck` — if a `VERIFIED` value ever becomes constructible without evidence, if the brand is ever dropped, or if another arm acquires an evidence field.
4. **`__tests__/verified-requires-evidence.test.ts`** carries `@ts-expect-error` witnesses for each illegal construction. If one became legal the directive would go **unused**, which `tsc` reports as an error — so the proof cannot rot into a passing test.

## An app is not an API

Two types, no function between them. `ConsumerSurfaceProfile` records channels the issuer offers **its own customers** — `CONSUMER_MOBILE_APP`, `CONSUMER_WEB_PORTAL`, `USSD_OR_SMS_CHANNEL`, `BRANCH_OR_AGENT_NETWORK`, `CALL_CENTRE`. `DataRailProfile` records what a review found about each rail Karar might one day receive data on. Neither is a field of the other and nothing derives one from the other in either direction.

The assertion is written as data: `SURFACES_IMPLYING_A_DATA_RAIL` is a **frozen empty list**, and `impliesDataRail` answers `false` for every surface in the vocabulary. The empty list is the claim — the idiom `modules/financial-connections` uses for `STATUSES_IMPLYING_A_LIVE_INSTITUTION_LINK` — so a reviewer who wants an app to imply an API has to add a word directly beneath the paragraph explaining why they must not.

`__tests__/an-app-is-not-an-api.test.ts` builds the case that matters: an issuer with a `VERIFIED` consumer app, a `VERIFIED` USSD channel and a `VERIFIED` agent network, whose **thirteen data rails are every one `UNAVAILABLE`**. That is not a contrived combination. It is the ordinary shape of a telco financial arm in the launch market, and a model that cannot say it will say something false instead.

## A description is not a permission

`modules/financial-connections` owns what may exist. Its migration-0096 CHECK refuses every rail but `MANUAL` and `USER_FILE_UPLOAD` at the database, and its `NewFinancialConnection.rail` field is typed `ImplementedConnectionRail`. This module returns `ConnectionRail` — the **wide** vocabulary — because a description has to be able to describe a rail that does not work.

Three independent guarantees, in the order they fire:

1. **The compiler.** `ConnectionRail` is not assignable to `ImplementedConnectionRail`. A compile-time proof in `domain/data-rails.ts` fails the build if that stops being true, and a `@ts-expect-error` in the test fails the build if the assignment ever becomes legal.
2. **The gate.** `__tests__/described-rails-are-not-executable.test.ts` builds a profile describing **all thirteen rails as `VERIFIED` available** — the strongest thing a profile can say — then feeds every one to the **real** `checkRailImplemented` and the **real** `createFinancialConnection`, through a deliberate cast. Eleven are refused with `rail_not_implemented`; the two that pass do so because that module implemented them, not because a profile said anything.
3. **Reach.** This module **imports no other module at all — not even a type**. `__tests__/no-real-provider-anywhere.test.ts` asserts that over the source. There is no repository, no client, no ORM, no driver and no `@karar/platform` import here, so there is no expression that could produce a row.

**There is deliberately no local copy of `IMPLEMENTED_CONNECTION_RAILS`.** The vocabularies below are mirrored; the implemented SUBSET is not, and must not be. A copy of a closed vocabulary that drifts produces a compile error; a copy of a *permission* that drifts produces a connection nobody authorised. What may be created is asked of `modules/financial-connections` at the moment of asking, never remembered here.

`RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE` states the same thing as data and is **empty for `MANUAL` too**: a profile grants nothing at all. Manual entry works because that module implemented it, which would remain true if this module did not exist.

## No real provider, and no provider vocabulary

`REVIEWED_CAPABILITY_PROFILES` is `Object.freeze([])`. Not one profile describes a real institution — not `VERIFIED`, not `PENDING_PROVIDER_CONFIRMATION`, not `UNVERIFIED`. Migrations 0087 and 0094 seed their tables empty for the reason that applies here unchanged: naming an issuer is a commercial and legal act, saying what its interface offers is a larger one, and the review has not happened.

**Provider-specific vocabulary is unrepresentable rather than forbidden.** A profile carries an `InstitutionRef` — a UUID and a reference type — and **no name, brand, label, logo, domain, endpoint or base URL**. There is no field for one. Naming issuers is `public.institutions`' job, done once, under review; a second place to name them is a second catalogue, and two catalogues disagree in a way repairable only by a merge that rewrites subject-owned account references across every tenant at once (ADR-0028).

The test scans production source for real issuer, wallet and aggregator names, for a `switch` on an issuer, and for an equality comparison on one. Short or common letter runs are deliberately **not** in the forbidden list: the scan joins each file into one letter run, and a four-letter name would eventually fire on two adjacent identifiers and get edited away. A check people learn to silence is worse than one that catches less.

**The synthetic mobile-money case.** `__tests__/fixtures.ts` builds the shape ADR-0028 names — a telco financial arm, wallet-bearing, mobile-money, with a consumer app and **no data API** — over an issuer called TELCO ALPHA that does not exist, with an obviously fake UUID and an evidence locator whose scheme (`synthetic-review:`) resolves to nothing. Nothing had to be special-cased for it: `TELCO_FINANCIAL_SERVICES`, `WALLET`, `MOBILE_MONEY` and thirteen `UNAVAILABLE` rails are all words that already existed for general reasons. Fixtures live in `__tests__/`, which is outside `public-api.ts`, so no application can reach them.

## The vocabularies are mirrored, and the mirrors are checked

`DATA_RAILS`, `ACCOUNT_TYPES`, `WALLET_KINDS`, `INSTITUTION_KINDS` and the `PROFILED_BALANCE_KINDS` subset are **declared in this module's own `domain/`**, mirroring the closed vocabularies `modules/financial-connections` and `modules/financial-accounts` own.

**Why, since importing them would be shorter.** A domain layer may import only relative files and the pure packages (architecture test 1). That is not a lint nicety: a domain that reaches into another module's package stops being independently testable and replaceable, which is the coupling the layered rules exist to prevent — the same reasoning `modules/financial-connections` records for declaring its own `CanonicalAccountRef` instead of borrowing `FinancialAccountId`. So the duplication is the sanctioned cost.

**The cost is paid where it can be seen.** `__tests__/mirrored-vocabularies.test.ts` is the one file in the module allowed to hold both sides at once — a test may cross a boundary — and it asserts each mirror is EXACTLY the owner's list, member for member and **in order**, plus type-level proofs that each local union and its owner's are mutually assignable. A word added, removed or renamed over there fails the build here. Drift is not prevented by construction; it is made loud. The comment at each declaration says so, so the next reader does not helpfully re-import.

`DataRailProfile` is a total `Record<DataRail, CapabilityAssertion>`, which is why a profile cannot be silent about a rail — and the same totality applies to surfaces, balance kinds and statement formats. Silence and "nobody has looked" are different claims, and only the second one is a state.

## The two validator rules that are not bookkeeping

Most of `validateCapabilityProfile` is shape — no duplicates, whole counts, wallet kinds exactly when there is a wallet (ADR-0028's biconditional). Two rules carry the module's claim:

- **`AVAILABLE_RAIL_WITHOUT_REGULATORY_EVIDENCE`** — a rail may not be described as available while nobody has evidenced the issuer's regulatory standing in that market. The interesting claim must not outrun the load-bearing one.
- **`AVAILABLE_RAIL_WITH_UNUSABLE_CONSENT_METHOD`** — `EMBEDDED_CREDENTIAL_ENTRY` and `SCREEN_SCRAPING` are in the consent vocabulary so a review can write down that an issuer offers only those, and are excluded from `ACCEPTABLE_CONSENT_METHODS`. No credential of any kind is stored anywhere in this platform, there is no scraping and no browser automation (ADR-0028), so a rail reachable only that way is not available to Karar. Recording the method is right; recording an available rail beside it is not.

The validator deliberately does **not** refuse a rail that is unimplemented. Describing a published open-finance mandate accurately is legitimate; what must not happen is a caller treating the description as permission, and that is prevented by the type rather than by a validator.

## Events published

None, and none is planned. A change in what a document says an interface might offer is not an event about a subject's money.

## Events consumed

None.

## APIs exposed

None. There is no transport, and when one arrives it is a **reviewer** surface rather than a customer one — see `presentation/README.md`. No screen may render a described rail, an access stage or a `VERIFIED` assertion as available, supported, connected or synced.

## Permissions

None this phase. When a reviewer surface exists it needs a staff permission of its own; **no `USER`-role permission may ever read a profile**, because a profile answers a question no customer asked in words that would be read as a promise.

## Capability

TRANSACTIONS. See 'Ownership'.

## Jurisdictions and availability

None declared. A profile describes a **country** (geography), never a jurisdiction (the legal policy key), and nothing in this module branches on either — jurisdiction-policy.md §1, held exactly as migration 0094 holds it.

## Operating entities

None. Nothing here is a record with legal consequence, and nothing here pins one.

## Policy dependencies

None. This module reads no PolicyPack: a description of what a document says is not a decision that a pack makes.

## Legal documents

None. An evidence reference **names** a document; it is not one, and nothing here reads what it points at.

## Dependencies

**This module's production source imports no other module at all.** `@karar/shared-kernel` — a pure package with no I/O of any kind — is its only package dependency, for `Currency`, `CalendarDay` and `Result`.

| Dependency | Used for | Where |
|---|---|---|
| `@karar/shared-kernel` | `Currency`, `CalendarDay`, `Result` | domain and application |
| `@karar/financial-connections` | the real rail gate, and the vocabulary the mirror is checked against | **`__tests__/` only** |
| `@karar/financial-accounts` | the vocabularies the mirrors are checked against | **`__tests__/` only** |

The two module dependencies are declared in `package.json` because the tests need them to resolve, and they appear nowhere else. Neither module imports anything from here. Cross-module references carry a raw UUID plus a reference type declared **in this module** (`domain/refs.ts`): `InstitutionRef` for a catalogue row. It is not another module's identifier type, and no foreign key crosses a module boundary — there is no table here to put one in.

## Ports declared

| Port | Answers | Implemented by |
|---|---|---|
| `ReviewedProfileCataloguePort` | the reviewed profile for one issuer, market and segment — or `null`, which is the answer for every query today | `infrastructure/registry/reviewed-registry-profile-source.ts`, over the frozen empty registry |

**It is synchronous, and that is the design.** Every other port in this repository returns a `Promise` because every other port reaches a store. An async signature here would invite an implementation that fetches, and fetching an issuer's capabilities is the one thing this module exists to never do; a synchronous signature makes an HTTP client visibly the wrong shape for the hole. **It takes no principal**: a profile is `NON_PERSONAL` reference data about an organisation, so there is no subject predicate to authorize against and a principal parameter would suggest a boundary that does not exist.

## Projections

None.

## Tests

Eight files, **no database**. Every one is a pure unit test; the module has nothing to integrate with.

| File | Proves |
|---|---|
| `verified-requires-evidence.test.ts` | `VERIFIED` is unconstructible without a reference — three `@ts-expect-error` witnesses plus the evidence-reference shape and its redaction |
| `an-app-is-not-an-api.test.ts` | a verified consumer app beside thirteen unavailable rails; no surface implies a rail |
| `described-rails-are-not-executable.test.ts` | the real `checkRailImplemented` and `createFinancialConnection` refuse eleven of thirteen described rails, even through a cast |
| `synthetic-mobile-money-issuer.test.ts` | the telco-wallet shape is expressible with no provider-specific field, and the profile's exhaustive field set carries no name |
| `profile-validation.test.ts` | every rule, including the two that carry the claim |
| `no-real-provider-anywhere.test.ts` | the registry is empty and frozen; no real provider name, no issuer branching, no runtime import of another module, no ORM, no driver, no client |
| `describe-provider-capabilities.test.ts` | "nobody wrote it down" is distinct from "we could not look", and no throw text reaches a caller |
| `mirrored-vocabularies.test.ts` | each mirrored vocabulary is exactly its owner's, in order; and the compile-time proof that a described rail is not an executable one |

## Notes and known limitations

**Nothing here talks to anything, and that is not a stage.** There is no adapter to write later that would make this module reach an issuer. If a provider integration is ever built it belongs to `modules/financial-connections`, behind that module's rail gate and its database CHECK, and this module's role would be unchanged: it describes, it does not decide.

**The registry stays empty until a review happens.** The first real profile is a code change carrying an evidence reference, reviewed like any other. It is not a row, and it is not a spreadsheet import.

**No retention gate, deliberately.** `modules/financial-accounts`, `modules/financial-connections` and `modules/payment-instruments` each gate durable writes behind an unresolved financial-retention decision. This module writes nothing durable and holds no subject data, so there is no write to gate; adding a port that always answered the same thing would be a control that protects nothing while reading as one.

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
