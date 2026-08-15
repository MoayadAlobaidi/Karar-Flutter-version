# Shared Responsibility Model

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** Phase 17 (cloud onboarding) and each gate after

Who answers for what, across the parties Karar's operation will involve. **Today's column is the honest one: there is no cloud, no partner, no billing provider — every responsibility sits with Karar**, which mostly means "with the six roles in [control-owners.md](control-owners.md)". The other columns pre-draw the lines so vendor and partner contracts are negotiated against a model instead of improvised.

---

## Parties

| Party | Enters at | Legal posture |
|---|---|---|
| **Karar** (operating entity per `docs/architecture/operating-entity.md`) | Now | Controller for its own B2C customers |
| **Cloud provider** (GCP candidate, UNVERIFIED) | Phase 17 | Processor / infrastructure subprocessor |
| **Partner bank** (white-label) | Phase 11+ deals | **Controller** for its customers — the inversion: Karar becomes **processor**. This swap changes who answers data-subject requests, who notifies breaches, and whose privacy notice applies (ADR-0024 / operating-entity.md §2) |
| **External billing provider** | Phase 10 | Independent controller/processor for settlement; executes payment — Karar records subscription state and verified billing events only, and never custodies funds (AC-011) |

## Responsibility matrix

`K` = Karar · `C` = cloud provider · `B` = partner bank · `P` = billing provider · `—` = not applicable in that column

| Responsibility | Today (no cloud) | With cloud (17+) | White-label deal | Billing live |
|---|---|---|---|---|
| Physical facilities, hardware, host hypervisor | — (none exist) | C | C | C |
| Network fabric, region availability | — | C | C | C |
| Managed-service hardening (DB engine patching, KMS operation) | — | C | C | C |
| Workload configuration (Terraform, service config, RLS, backups-as-configured) | K | K | K | K |
| Application code, financial correctness, architecture controls | K | K | K | K |
| Encryption design, key custody strategy, canary | K | K (keys in C's KMS under K's custody policy) | K | K |
| Identity and access for Karar staff/systems | K | K | K | K |
| End-customer relationship, consent, privacy notice | K | K | **B** (their customers) — K executes as processor | K |
| Data-subject requests (export/erasure) | K | K | **B** decides, K executes per DPA | K |
| Breach notification to customers/regulators | K | K (C notifies K of infra breaches per DPA) | **B** notifies; K notifies B | P for settlement-side breaches; K for platform-side |
| Payment execution, settlement, card data | — (no payments) | — | — | **P** — card/settlement data never enters Karar |
| Subscription/entitlement state | K | K | K | K (records verified events from P) |
| Sealed payload confidentiality | K (design) | K — C stores ciphertext only; no provider role can read sealed content (ADR-0017) | K — the seal does not transfer | K |
| Compliance evidence for Karar's controls | K | K (+ C's audit reports as inherited evidence) | K + contract-defined | K + P's attestations for settlement |

## Rules

1. **Inherited controls are cited, not claimed.** When a cloud provider's SOC 2 / ISO certificate covers a layer, Karar's mapping records it as *inherited*, referencing the provider's report — never as Karar's own control operating.
2. **The controller/processor split per relationship is data, not prose** — it will live on `OperatingEntity.dataProtectionRole` per relationship (Phase 3, ADR-0024); this document is the narrative view of the same fact.
3. **No column may be filled by assumption.** The cloud column activates only when a provider is contracted (Phase 17) and its DPA and responsibility documentation are in the vendor register.
4. Every contract with a party above must be reconciled against this matrix before signature — a contract that contradicts a row changes the row or does not get signed.
