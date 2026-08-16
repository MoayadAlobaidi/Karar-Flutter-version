# Backup and Recovery Policy

**Status:** DRAFT · **Owner:** Operations Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 3.5 gate (Phase 2 gate missed)

## Scope

Recoverability of Karar's data and systems. Today that means exactly one thing — the repository and its evidence trail; everything else is future-gated to the phases that create data worth recovering.

## Purpose

The legacy's operations lesson: RPO was evidenced, RTO never measured — backups existed, recovery was a hope. Karar's rule is that a backup is real when a restore has been performed, timed, and included the application coming back, not just the data.

## Requirements

- **R1.** Today's only recoverable asset is the repository (source, docs, compliance corpus). Full clones on the developer workstation plus the SCM host constitute the current redundancy; no canonical artefact may exist only in SCM-hosted state — wikis, issue threads, and settings screens are not canonical storage (KAR-CTL-046, KAR-RSK-011).
- **R2.** Evidence artefacts are exported from the interim store per phase, so vendor loss cannot orphan the compliance trail ([evidence-handling.md](../compliance/evidence-handling.md) §Store).
- **R3.** *Not yet operating — Phase 17:* every stateful service (PostgreSQL, object storage) gets automated backups with defined RPO/RTO per environment, recorded with the deployment profile.
- **R4.** *Not yet operating — Phase 17:* backups are encrypted with keys distinct from the primary's, per-environment; sealed-data backups remain sealed — backup access is not a side door around `SealAccessGrant`, and backup restoration never bypasses classification handling.
- **R5.** *Not yet operating — Phase 17:* restore verification runs on a schedule, and **includes application recovery** — the service starts against the restored data and passes its startup guards (boot identity, decryptability), not only a dump import.
- **R6.** *Not yet operating — Phase 20 gate:* a full DR restore is executed and its RTO **measured** before production launch; the measured number, not an aspiration, goes in the launch gate record.
- **R7.** *Not yet operating — Phase 20:* backup retention aligns with the retention-and-erasure-policy: backups containing personal data are part of the erasure design (strategy per ADR-0026 declarations), decided before production data exists, not litigated after.
- **R8.** *Not yet operating — Phase 13/20:* key material recoverability follows the cryptography policy's custody strategy — data backups without key continuity are noise for encrypted classes, and the custody drill proves the pair works together.
- **R9.** Restore tests and their timings are recorded as evidence per the [Type II evidence plan](../compliance/soc2/type-ii-evidence-plan.md); a backup job that has never restored is reported at gates as exactly that.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None current.

## Evidence

Today: clone-recoverability check records (when first performed at a gate). Later: backup job references, restore verification records, measured RTO. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-044, 045 (deferred), 046, 035 (custody linkage).
