# Acceptable Use Policy

**Status:** DRAFT · **Owner:** Security Owner · **Approver:** Platform Owner (pending) · **Version:** 0.1 · **Effective:** — (not yet approved) · **Review:** Phase 2 gate

## Scope

Anyone with access to Karar assets — accounts, the repository, CI, and endpoints used for Karar work. Today that population is one person and one workstation; the rules are written to survive being read by the fifth hire, and acceptance becomes an onboarding act at the first.

## Purpose

The unglamorous layer: how the accounts and machines that build Karar are used, so that the platform's careful design is not undone by an unlocked laptop or a personal-account push.

## Requirements

- **R1.** Karar work happens under Karar-designated accounts; access is personal and never shared or lent. Credentials follow [`docs/security/secrets.md`](../security/secrets.md) — a password manager, MFA everywhere it exists, recovery codes stored off the primary device.
- **R2.** Endpoints used for Karar work run full-disk encryption, an up-to-date OS, and are not shared devices; local secrets live only in git-ignored `.env` files.
- **R3.** Screens lock when unattended; sessions to SCM, registries, and (future) environments are not left authenticated on shared or public machines. No sensitive material is worked on where it can be shoulder-read in public spaces.
- **R4.** Endpoints stay current: OS and security updates applied promptly; a device that cannot be kept current is retired from Karar use.
- **R5.** No software from untrusted sources on Karar endpoints; project dependencies enter only through the pinned, scanned toolchain (secure-development-policy §R8), never installed ad hoc into the project from a browser download.
- **R6.** No removable media for project data; the repository and its remotes are the transport. Cloud personal-storage accounts are not project storage.
- **R7.** Device disposal or reassignment: the disk is wiped (or the encryption key destroyed) before the device leaves Karar use, and the event is recorded in the [asset inventory](../compliance/asset-inventory.md).
- **R8.** What may never be put anywhere: real customer or personal data (none exists — keep it that way, `SECURITY.md`), secrets in the repository or logs, sealed-class material in any tool, prompt, or service. Pasting project code into arbitrary external tools follows the same dependency discipline — an external service processing Karar material is a vendor question (vendor-security-policy §R1), not a personal convenience.
- **R9.** *Not yet operating — first hire:* acceptance of this policy is recorded at onboarding, and the return-of-assets rule (SoA 5.11) activates with employment relationships.
- **R10.** Suspected compromise of an endpoint or account is reported and handled per the incident-response policy immediately — rotation first, embarrassment never a factor.

## Exceptions

Via the [exceptions register](../compliance/exceptions-register.md). None current.

## Evidence

Asset-inventory records (device lifecycle); later: onboarding acceptance records. Register: [evidence-register.md](../compliance/evidence-register.md).

## Related controls

KAR-CTL-007, 036, 038, 046; SoA 6.7, 7.7–7.14, 8.1.
