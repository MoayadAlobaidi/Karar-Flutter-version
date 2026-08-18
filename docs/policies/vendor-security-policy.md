# Vendor Security Policy

**Status:** DRAFT · **Owner:** Compliance Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 4 gate (Phase 2 target missed; re-affirmed but not content-reviewed at Phase 3.5)

## Scope

Every third party Karar depends on: SCM/CI, package registries, image sources today; cloud, AI, billing, connectivity providers as phases add them. The record of them all: [vendor-and-subprocessor-register.md](../compliance/vendor-and-subprocessor-register.md).

## Purpose

Vendors are attack surface, dependency, and (eventually) data processors. Each is adopted deliberately, recorded, reviewed, and exits cleanly — and none touches personal data before a DPA exists, which today is trivially satisfied because no personal data exists at all.

## Requirements

- **R1.** A vendor enters the register **before or with** first use, with: service, data shared, classification, DPA status, review date, and a security review proportionate to the data shared (KAR-CTL-047).
- **R2.** The proportionality rule, concretely: a package registry consumed anonymously needs supply-chain controls (secure-development-policy §R8), not a questionnaire; a future cloud provider holding `HIGHLY_SENSITIVE_FINANCIAL` ciphertext needs its audit reports read, its shared-responsibility line drawn, and its DPA executed before onboarding.
- **R3.** **No personal data flows to any vendor without an executed DPA** (KAR-CTL-048) — a production-blocking roadmap gate ("DPAs with every processor"), enforced by sequence: the DPA precedes the data, never follows it.
- **R4.** Vendor selection respects the residency question while it is open (KAR-RSK-006): until the data-residency determination exists, no vendor commitment may foreclose the answer — provider-portable design (`DeploymentProfile`) is the technical half of this rule.
- **R5.** Dependencies-as-vendors: registries and base-image publishers are governed by pinning, SCA, and SBOM controls (KAR-CTL-025, 027, 028); a new package ecosystem or registry is a register entry, not a silent addition.
- **R6.** Concentration is tracked as risk: the SCM/CI/evidence single-vendor condition is KAR-RSK-011, mitigated per backup-and-recovery-policy §R1–R2 and reviewed at gates.
- **R7.** Register review dates are honored at each phase gate; a lapsed review is a gate finding (KAR-CTL-047).
- **R8.** Vendor exit is recorded: date, credential closure, disposition of any held data; for processors, contractual deletion confirmed per the DPA.
- **R9.** *Not yet operating — Phase 11+:* white-label partner banks are not vendors but controllers Karar processes for — the inverted relationship follows the [shared-responsibility model](../compliance/shared-responsibility-model.md) and operating-entity bindings (ADR-0024), with contracts reconciled against that model before signature.
- **R10.** Inherited controls from a vendor's certifications are cited as inherited, never claimed as Karar's own (shared-responsibility model rule 1).

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None current.

## Evidence

Register review records; vendor security reviews; later: DPA references (instrument reference only, per evidence-handling). Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-047, 048, 025, 027, 028, 046.
