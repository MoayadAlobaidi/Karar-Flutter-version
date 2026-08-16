# Assurance Claim Registry

**The mechanism behind architecture test 26.** CI cannot read legal prose, and this registry does not pretend it can. What CI asserts mechanically is the **link**: every technical or legal claim a `CapabilityDescriptor` or a referenced legal document makes must map to an entry here, carrying an evidence pointer and a named owner. **Whether the evidence supports the claim is a human review recorded in the entry — not a build step.**

Origin: legacy finding **P1** — a published consent notice described redaction behaviour the code did not implement, and that notice was the legal basis for a cross-border data transfer. *The code was defensible; the document was wrong.* What was missing was precisely a link and an owner.

---

## 1. Entry schema

| Field | |
|---|---|
| `id` | `AC-NNN`, stable |
| `claim` | The claim, quoted or precisely stated |
| `type` | `TECHNICAL` · `LEGAL` · `REGULATORY` |
| `scope` | Capability, module, or platform |
| `evidence` | Test ID, code path, document, or evidence label (CODE / RUNTIME / ABSENT) |
| `owner` | A named role accountable for the claim staying true |
| `status` | `VERIFIED` (evidence reviewed and found sufficient) · `PENDING` (mechanism not yet built) · `UNVERIFIED` (asserted, review not performed) |
| `reviewed` | Date of the last human review |

Rules:

1. A `CapabilityDescriptor` that cites a legal document must have an entry **per promised behaviour** in that document.
2. A claim with no evidence pointer **fails CI** (test 26). A claim whose status is `UNVERIFIED` does not fail CI — it fails the Phase 20 review, where every entry must be `VERIFIED` or carried as an explicit risk.
3. Removing a control without updating its entries is what test 26 exists to catch.

## 2. The registry

At Phase 0.5 no code exists, so **every technical entry is `PENDING`** — the honest status for a claim whose enforcing mechanism is designed but unbuilt. Documentation-level claims are `VERIFIED` at the docs level only.

| id | claim | type | scope | evidence | owner | status |
|---|---|---|---|---|---|---|
| AC-001 | No floating point anywhere in the money path | TECHNICAL | platform | test 7 | Platform | PENDING |
| AC-002 | `SEALED` never appears in projections, events, logs, analytics, or AI context | TECHNICAL | sealed-vault | test 13 | Platform | PENDING |
| AC-003 | Sealed reads require a `SealAccessGrant` at the type level | TECHNICAL | sealed-vault | test 14 | Platform | PENDING |
| AC-004 | Every table is RLS-enabled and FORCEd or explicitly allow-listed | TECHNICAL | platform | test 22 | Platform | PENDING |
| AC-005 | A capability with no availability row is `DISABLED` | TECHNICAL | capability-registry | resolver test | Platform | PENDING |
| AC-006 | Consent gates fail closed — no published disclosure ⇒ unavailable | TECHNICAL | consent | resolver gate-8 test | Platform | PENDING |
| AC-007 | Existence non-disclosure — identical responses and timings whether records exist or not | TECHNICAL | amanat | Amanat test suite | Platform | PENDING |
| AC-008 | Sealed-integrity canary plaintext contains no customer data | TECHNICAL | sealed-vault | canary purity test | Platform | PENDING |
| AC-009 | **Karar claims no regulatory approval, licence, certification, or clearance anywhere** | LEGAL | platform | documentation sweep (CODE) | Legal | VERIFIED (docs level, 2026-08-15) |
| AC-010 | **No Sharia review exists, and Zakat outputs are never represented as a fatwa** | LEGAL | zakat | `modules/zakat/MODULE.md`; product copy review **pending** | Legal | UNVERIFIED |
| AC-011 | **Karar does not custody customer funds and does not operate as a payment processor or stored-value wallet.** Billing may be orchestrated through approved external providers (`SubscriptionBillingProvider`), which execute settlement; Karar records subscription/entitlement state and verified billing events. Stricter per-capability rules: **no Zakat/Sadaqah payment execution; Amanat has no payment-provider dependency** | TECHNICAL + LEGAL | platform | ABSENT-verified port list; guard test pending | Platform | PENDING |
| AC-012 | **No legacy application code is the V2 foundation** | TECHNICAL | platform | [greenfield rule](../architecture/greenfield-rule.md); repository inspection (CODE) | Platform | VERIFIED (2026-08-16 — re-verified against the current tree at Phase 3.5: 508 TypeScript files across `modules/`, `packages/`, and `apps/`, and a repository-wide scan finds zero `Qarar` occurrences in any source file (`.ts`, `.dart`, `.sql`, `.prisma`, `.mjs`); the legacy is referenced only in Markdown prose. The prior basis — "repo contains documentation only" — was true at Phase 1 and is now false, though the claim itself still holds) |
| AC-013 | Every staff read of a customer record is audited, including empty results | TECHNICAL | audit | audit test | Platform | PENDING |
| AC-014 | AI never receives `SEALED` data — structurally excluded by input types | TECHNICAL | ai | test 13; type-level check | Platform | PENDING |
| AC-015 | Data-residency posture — **no claim is made** | REGULATORY | platform | [`data-residency.md`](../architecture/data-residency.md) — all labels ABSENT | Legal | VERIFIED (the claim *is* the absence) |
| AC-016 | Capability availability is deny-by-default: no capability resolves `AVAILABLE` unless every gate passes, and an absent or ambiguous configuration row denies | TECHNICAL | capability-registry | `modules/capability/__tests__/resolver.test.ts`; `modules/capability/__tests__/capability.integration.test.ts`; EV-406 | Platform | UNVERIFIED |
| AC-017 | Runtime configuration is restrict-only: no database row — availability, entitlement, or jurisdiction setting — can widen the ceiling the compile-time registry and the PolicyPack set | TECHNICAL | capability-registry | `modules/capability/__tests__/restrict-only.property.test.ts`; `tests/security/__tests__/phase-3-5-policy-surface.integration.test.ts`; EV-404 | Platform | UNVERIFIED |
| AC-018 | A `DRAFT` or unapproved PolicyPack never becomes operative outside a local environment, and an `APPROVED` claim without an approval reference is refused | TECHNICAL | jurisdiction | `packages/jurisdiction-policy/src/lifecycle.ts`; `modules/jurisdiction/__tests__/jurisdiction.integration.test.ts`; EV-402 | Platform | UNVERIFIED |
| AC-019 | Hidden capabilities and non-actionable denial reasons — legal, jurisdictional, entity, and licence grounds — never reach client output in any state | TECHNICAL | capability-registry | `modules/capability/__tests__/client-view.test.ts`; `modules/bootstrap/__tests__/leak-regression.test.ts`; `tests/security/__tests__/phase-3-5-policy-surface.integration.test.ts`; EV-408 | Platform | UNVERIFIED |
| AC-020 | A capability whose code is not implemented and deployed is denied regardless of any configuration route — availability row, entitlement, pack clearance, or expiry window | TECHNICAL | capability-registry | `modules/capability/__tests__/resolver.test.ts`; `tests/security/__tests__/phase-3-5-policy-surface.integration.test.ts`; EV-405 | Platform | UNVERIFIED |
| AC-021 | A session binds to a tenant only against an active membership, verified again at bind time, and the binding never comes from client input | TECHNICAL | tenancy | `modules/tenancy/__tests__/tenant-context.integration.test.ts`; `modules/bootstrap/__tests__/bootstrap-binding.integration.test.ts`; EV-411 | Platform | UNVERIFIED |

AC-016 to AC-021 are the Phase 3.5 claims. Each is `UNVERIFIED` rather than
`PENDING`: the enforcing mechanism exists and is exercised by the suites named,
which is more than `PENDING` says, and no human assurance review has been
recorded against it, which is less than `VERIFIED` requires. The `EV-4xx`
references are placeholders the compliance workstream defines in the evidence
register, one for one with the Phase 3.5 threat-model rows.

Entries are added as capabilities are: the seventeen-point checklist's legal-document point (16) and test 26 both route here.

## 3. Review cadence

Every entry is re-reviewed at each phase gate that touches its scope, and **all entries at Phase 20** — where `UNVERIFIED` becomes either `VERIFIED` or a named line in the risk-acceptance register. An entry nobody has reviewed in a year is treated as `UNVERIFIED` regardless of its recorded status.
