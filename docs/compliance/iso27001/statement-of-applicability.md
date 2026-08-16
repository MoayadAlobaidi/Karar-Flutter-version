# Statement of Applicability

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.3 · **Date:** 2026-08-16 · **Review:** every phase gate (deltas per gate report §5)

**v0.3 (2026-08-16, Phase 3):** four rows moved to IMPLEMENTED on the strength of matrix-IMPLEMENTED [P3] controls (5.16, 5.17, 8.3, 8.5); 5.15, 5.34, 8.2, 8.10, 8.15 annotated without a status change. Deltas listed under the tally.

**v0.2 (2026-08-15, Phase 2):** seven rows moved to IMPLEMENTED on the strength of matrix-IMPLEMENTED controls (5.13, 5.33, 8.9, 8.11, 8.12, 8.15, 8.28); 8.3, 8.10, 8.16, 8.24, 8.32 annotated without a status change. Deltas listed under the tally.

All 93 controls of ISO/IEC 27002:2022 (Annex A of ISO/IEC 27001:2022), by identifier, with a short **Karar-language name** (paraphrased — not the standard's text), an applicability status, and a justification. Where a Karar control implements the Annex A control, the KAR-CTL ID links into the [control matrix](../control-matrix.md), whose status detail is authoritative.

**Status vocabulary (SoA-specific):**

| Status | Meaning here |
|---|---|
| `APPLICABLE` | In scope now; Karar's treatment is designed/underway in the current phase |
| `PLANNED` | In scope; treatment begins at the named phase — not pretended before then |
| `IMPLEMENTED` | A mechanism exists today (Phase-1 tooling); evidence still pending |
| `OPERATING` | Running with reviewed evidence — **no control holds this status yet** |
| `NOT_APPLICABLE` | Excluded, with the reason stated and a revisit trigger where one exists |

---

## Organizational (5.1–5.37)

| ID | Karar-language name | Status | Justification / linkage |
|---|---|---|---|
| 5.1 | Security policy set defined and approved | APPLICABLE | 14 policies DRAFT ([policy-index](../policy-index.md)); approval at Phase 2 gate. KAR-CTL-001 |
| 5.2 | Security responsibilities assigned to roles | APPLICABLE | [control-owners.md](../control-owners.md). KAR-CTL-002 |
| 5.3 | Conflicting duties separated | APPLICABLE | SoD triggers defined; current single-person reality carried as EXC-001/KAR-RSK-002 — applicable and honestly deficient |
| 5.4 | Management holds people to the policies | APPLICABLE | Platform Owner approval/acceptance duties; gate sign-off |
| 5.5 | Relationships with authorities | PLANNED (20) | Regulator engagement is a production-readiness gate; premature contact would imply claims Karar does not make |
| 5.6 | Contact with security community/advisories | PLANNED (2) | Today only scanner-fed advisories; a deliberate advisory intake lands with vulnerability management Phase 2 |
| 5.7 | Threat intelligence informs defenses | PLANNED (2) | Threat model exists; a recurring intel loop starts with vuln management. KAR-CTL-021 partial |
| 5.8 | Security built into project management | APPLICABLE | Phase gates + MODULE.md-first intake. KAR-CTL-004, 024 |
| 5.9 | Inventory of information and supporting assets | APPLICABLE | [asset-inventory.md](../asset-inventory.md) |
| 5.10 | Acceptable use and handling rules for assets | APPLICABLE | [acceptable-use-policy](../../policies/acceptable-use-policy.md); classification handling matrix |
| 5.11 | Assets returned on exit | PLANNED (first hire) | No employment relationships exist; rule activates with them |
| 5.12 | Information classified by sensitivity | APPLICABLE | Six-class scheme, canonical (`docs/security/data-classification.md`). KAR-CTL-033 |
| 5.13 | Information carries its classification label | IMPLEMENTED | 2026-08-15: every Phase 2 table carries a six-field lifecycle row including its class (`packages/platform/db/DATA_LIFECYCLE.md`, `modules/audit/MODULE.md`, enforced by architecture test 25); event catalogue fields carry classes. KAR-CTL-033, 061 (IMPLEMENTED [P2]); labelling extends to each new surface as it lands |
| 5.14 | Information transfer rules | APPLICABLE | Today's only transfer surface is authenticated TLS to SCM/registries; classification matrix defines in-transit rules for the future system |
| 5.15 | Access control rules established | APPLICABLE | [access-control-policy](../../policies/access-control-policy.md); layered model in `docs/security/access-control.md`. KAR-CTL-007. 2026-08-16: the application layer now enforces the rules as code — deny-by-default RBAC against a closed migration-seeded catalogue, central PolicyService (KAR-CTL-072, IMPLEMENTED [P3]) |
| 5.16 | Identity lifecycle managed | IMPLEMENTED | One SCM identity today, managed (KAR-CTL-007). 2026-08-16: application identity lifecycle exists as tested code — registration with verification, password lifecycle, session revocation (individual and bulk), token-version invalidation of outstanding tokens (KAR-CTL-010, 067, 068, IMPLEMENTED [P3]); account disable/enable use cases exist but their permissions are deliberately unseeded pending an invoking surface (migration 0050 header). Local/test execution only — nothing operates anywhere |
| 5.17 | Authentication material protected | IMPLEMENTED | `docs/security/secrets.md`; per-env stores still DESIGNED (KAR-CTL-036); scanning (KAR-CTL-026). 2026-08-16: application authentication material now protected by real mechanisms — argon2id with versioned parameters and rehash-on-login, refresh and invitation tokens sha256-only at rest, verification/reset codes as HMAC digests, TOTP secrets encrypted via the `EncryptionProvider` (KAR-CTL-066, 068, 069, 074, IMPLEMENTED [P3]) |
| 5.18 | Access rights provisioned and reviewed | APPLICABLE | Reviews at gates. KAR-CTL-014 |
| 5.19 | Supplier security managed | APPLICABLE | [vendor-security-policy](../../policies/vendor-security-policy.md) + register. KAR-CTL-047 |
| 5.20 | Security terms in supplier agreements | PLANNED (production) | Standard vendor ToS today; negotiated terms/DPAs when personal data or custom contracts exist. KAR-CTL-048 |
| 5.21 | ICT supply chain risk managed | APPLICABLE | SCA, SBOM, pinning. KAR-CTL-025, 027, 028 |
| 5.22 | Suppliers monitored and changes reviewed | APPLICABLE | Register review dates; per-gate check. KAR-CTL-047 |
| 5.23 | Security in cloud service use | APPLICABLE | GitHub is today's cloud service, governed via register; platform cloud selection Phase 17 with shared-responsibility mapping |
| 5.24 | Incident management prepared | APPLICABLE | [incident-response-policy](../../policies/incident-response-policy.md) DRAFT. KAR-CTL-042 |
| 5.25 | Events assessed and classified | APPLICABLE | Severity model defined (SEV-1 at n=1 for sealed exposure) |
| 5.26 | Incidents responded to per procedure | APPLICABLE | Procedure drafted; untested pre-operations, stated in policy |
| 5.27 | Incidents feed learning | APPLICABLE | Post-incident review → [continual-improvement.md](continual-improvement.md) |
| 5.28 | Evidence collected and preserved | APPLICABLE | [evidence-handling.md](../evidence-handling.md) incl. incident evidence rules |
| 5.29 | Security maintained during disruption | PLANNED (20) | BC policy DRAFT; substance requires operations. KAR-CTL-045 |
| 5.30 | ICT continuity readiness | PLANNED (20) | DR runbook executed + RTO measured are Phase 20 gates |
| 5.31 | Legal/regulatory requirements identified | APPLICABLE | Roadmap non-engineering gates; jurisdiction docs; residency open (KAR-RSK-006). KAR-CTL-006 |
| 5.32 | Intellectual property respected | APPLICABLE | Greenfield rule (no legacy code, AC-012); dependency licenses visible via SBOM. KAR-CTL-022 |
| 5.33 | Records protected | IMPLEMENTED | Git history + evidence retention rules (KAR-CTL-046, still DESIGNED). 2026-08-15: a purpose-built records-protection mechanism now exists — the append-only audit store with grant- and trigger-enforced immutability (KAR-CTL-056, IMPLEMENTED [P2]); local/test execution only, no operating history |
| 5.34 | Privacy and PII obligations met | PLANNED (5/16/prod) | **No PII is held today** (KAR-CTL-038); ADR-0026 lifecycle + consent controls activate Phases 3–16. 2026-08-16: the consent mechanism itself landed — fail-closed gates, reviewed re-consent classification with no default, immutable entity/jurisdiction-pinned grants (KAR-CTL-049, 076, IMPLEMENTED [P3]); the row stays PLANNED because no personal data is processed and the deriving lifecycle/export/erasure mechanisms remain Phases 5/16 |
| 5.35 | Independent review of security | PLANNED (20) | Independent assessment by a party that did not build the system — hard Phase 20 gate; nothing in-house substitutes |
| 5.36 | Compliance with policies verified | APPLICABLE | Phase gates check policy adherence. KAR-CTL-004, 005 |
| 5.37 | Operating procedures documented | PLANNED (2) | Developer docs exist; operational runbooks arrive with things to operate |

## People (6.1–6.8)

| ID | Karar-language name | Status | Justification / linkage |
|---|---|---|---|
| 6.1 | Background checks before engagement | PLANNED (first hire) | No hires exist; rule activates with the first |
| 6.2 | Security duties in employment terms | PLANNED (first hire) | Same trigger |
| 6.3 | Awareness and training | APPLICABLE | Solo: the docs corpus + CONTRIBUTING are the training surface; formal onboarding per `docs/onboarding/developer.md` at hire |
| 6.4 | Consequences for violations | PLANNED (first hire) | Meaningless solo; defined with employment terms |
| 6.5 | Duties surviving exit | PLANNED (first hire) | Same trigger |
| 6.6 | Confidentiality agreements | PLANNED (first hire/contractor) | Includes external reviewers touching non-public material |
| 6.7 | Remote working secured | APPLICABLE | All work is remote by structure; acceptable-use-policy endpoint rules |
| 6.8 | Security events reported | APPLICABLE | SECURITY.md private channel. KAR-CTL-043 |

## Physical (7.1–7.14)

| ID | Karar-language name | Status | Justification / linkage |
|---|---|---|---|
| 7.1 | Security perimeters around facilities | NOT_APPLICABLE | No offices, data centers, or facilities are operated. Revisit: any premises, or Phase 17 (provider facilities inherited per shared-responsibility model) |
| 7.2 | Controlled physical entry | NOT_APPLICABLE | Same reason and trigger |
| 7.3 | Secured rooms and work areas | NOT_APPLICABLE | Same |
| 7.4 | Physical surveillance/monitoring | NOT_APPLICABLE | Same |
| 7.5 | Protection from physical/environmental threats | NOT_APPLICABLE | Same |
| 7.6 | Working rules in secure areas | NOT_APPLICABLE | Same |
| 7.7 | Clear desk and screen | APPLICABLE | Screen lock + no unattended unlocked session; acceptable-use-policy §R3 |
| 7.8 | Equipment placed and protected sensibly | APPLICABLE | One workstation; physical care rules in acceptable-use-policy |
| 7.9 | Assets protected off premises | APPLICABLE | The workstation *is* off-premises by structure: FDE, lock, no shared use (acceptable-use-policy) |
| 7.10 | Storage media controlled | APPLICABLE | Encrypted disk; no removable media for project data (acceptable-use-policy §R6) |
| 7.11 | Supporting utilities resilience | NOT_APPLICABLE | No facilities; provider-inherited at Phase 17 |
| 7.12 | Cabling protected | NOT_APPLICABLE | No cabling plant exists |
| 7.13 | Equipment maintained | APPLICABLE | Workstation kept on current OS/security updates (acceptable-use-policy §R4) |
| 7.14 | Equipment wiped before disposal/reuse | APPLICABLE | Disposal rule in acceptable-use-policy §R7; recorded in asset inventory on the event |

## Technological (8.1–8.34)

| ID | Karar-language name | Status | Justification / linkage |
|---|---|---|---|
| 8.1 | Endpoint devices secured | APPLICABLE | FDE, lock, updates, separation of concerns on the one workstation (acceptable-use-policy) |
| 8.2 | Privileged access tightly held | APPLICABLE | SCM admin = one person today, recorded; control-plane model for the future (KAR-CTL-013). 2026-08-16: application privileged access is now code-governed — PLATFORM_ADMIN-only role assignment with the peer-delegation rule, audited with actor and reason (KAR-CTL-073, IMPLEMENTED [P3]); no privileged HTTP surface exists until the control plane (ADR-0021) |
| 8.3 | Access to information restricted | IMPLEMENTED | Repository is public by decision (read); write access maintainer-only. No restricted-class information is held in it by rule. 2026-08-15: database-layer restriction real — DML-only `karar_app` vs schema-owning `karar_migrator`, denials proven (KAR-CTL-053). 2026-08-16: application-layer restriction delivered — RLS ENABLE+FORCE with fail-closed transaction-local principal context on every tenant-scoped table (37 tables: 17 FORCEd, 27 allow-listed with justification), deny-by-default RBAC, token-scoped invitation redemption (KAR-CTL-010, 011, 071, 072, IMPLEMENTED [P3]); adversarial suites prove denials on non-empty data. Local/test execution only |
| 8.4 | Source code access controlled | APPLICABLE | Write access maintainer-only; branch protection on `main` verified 2026-08-15 (EV-007): PR-only, 8 required checks, admins bound. KAR-CTL-007, 008 |
| 8.5 | Strong authentication | IMPLEMENTED | MFA on SCM (verification EV-007). 2026-08-16: application authentication exists as tested code — argon2id credential storage, TOTP MFA with one-time recovery codes, ledger-derived non-resetting lockout, fail-closed pre-auth rate limits, trusted-proxy discipline (KAR-CTL-010, 066, 069, 070, IMPLEMENTED [P3]); nothing operates in any environment |
| 8.6 | Capacity managed | PLANNED (17) | Nothing to capacity-manage; CI quotas trivial |
| 8.7 | Malware defenses | APPLICABLE | Endpoint hygiene + no-untrusted-downloads rule (acceptable-use-policy §R5); pinned dependencies reduce the realistic vector |
| 8.8 | Technical vulnerabilities managed | **IMPLEMENTED** | Phase-1 CI runs dependency scanning per-PR (report-only pending its blocking threshold — KAR-CTL-025), CodeQL static analysis (KAR-CTL-029, [C1]), and automated update PRs (dependabot); runtime/platform vuln management PLANNED with runtimes. The mechanism exists; the blocking decision is the open piece |
| 8.9 | Configuration managed | IMPLEMENTED | All config in git via PR. 2026-08-15: typed, boot-validated, fail-fast runtime configuration delivered (KAR-CTL-051, IMPLEMENTED [P2]); errors name fields, never values. IaC skeleton remains DESIGNED (KAR-CTL-031) |
| 8.10 | Information deleted when no longer needed | PLANNED (5) | ADR-0026 lifecycle declarations + erasure strategies. KAR-CTL-037. 2026-08-15: every Phase 2 table already carries its declared retention and erasure strategy (`packages/platform/db/DATA_LIFECYCLE.md`); the deriving mechanism is still Phase 5. 2026-08-16: every Phase 3 table likewise declared; consent grants are deliberately retained immutable evidence — withdrawal preserves the row (KAR-CTL-076); retention values remain policy-configuration placeholders pending Phase 3.5 PolicyPacks |
| 8.11 | Data masked where full values are not needed | IMPLEMENTED | 2026-08-15: log/event/audit-metadata redaction delivered (`[redacted:*]` markers, HSF stored redacted — KAR-CTL-040, 057, IMPLEMENTED [P2]). Admin projections instead of raw tables remain Phase 8 |
| 8.12 | Data leakage prevented | IMPLEMENTED | Secret scanning was the first live layer (KAR-CTL-026); 2026-08-15: classification-driven event/log rules landed (SEALED identifier-only without exemption, `SecretValue` redaction — KAR-CTL-052, 061, IMPLEMENTED [P2]). Egress-side DLP for a running system remains with runtimes |
| 8.13 | Backups taken and tested | PLANNED (17) | Nothing to back up but git, covered by clone recoverability (KAR-CTL-046); real backups with restore verification at Phase 17+, KAR-CTL-044 |
| 8.14 | Redundant processing capability | PLANNED (17/20) | KAR-CTL-045 |
| 8.15 | Logs produced and protected | IMPLEMENTED | 2026-08-15: structured classification-redacting logs and the append-only audit store with immutability enforcement delivered (KAR-CTL-040, 056, 063, IMPLEMENTED [P2]); staff-read auditing remains Phase 8 (KAR-CTL-039, DEFERRED). 2026-08-16: security-event surfaces widened — append-only `authentication_security_events` ledger, kill-switch history via SECURITY DEFINER trigger, audited authorization denials (KAR-CTL-075, 077, IMPLEMENTED [P3]). Local/test execution only — nothing runs anywhere to produce logs continuously |
| 8.16 | Systems monitored for anomalies | PLANNED (20) | KAR-CTL-041; a single alert recipient will not count as on-call. 2026-08-15, partial: the signal substrate exists (metrics, traces, truthful `/readyz`, outbox lag/DLQ metrics — KAR-CTL-058, 062, 063) but nothing watches, alerts, or pages, so this row does not advance (KAR-RSK-003) |
| 8.17 | Clocks synchronized | PLANNED (17) | Relevant when distributed runtime exists |
| 8.18 | Privileged utilities restricted | PLANNED (17) | Runtime concern; control-plane gateway design already excludes ad-hoc production tooling |
| 8.19 | Software on operational systems controlled | PLANNED (17) | No operational systems; endpoint software per acceptable-use-policy |
| 8.20 | Networks secured | PLANNED (17) | KAR-CTL-032 |
| 8.21 | Network services secured | PLANNED (17) | KAR-CTL-032; DB transport `verify-full` per `docs/security/secrets.md` §10 |
| 8.22 | Networks segregated | PLANNED (17/20) | Sealed vault into its own boundary before production sealed data (ADR-0017) |
| 8.23 | Web access filtered | NOT_APPLICABLE | No managed corporate network or endpoint fleet exists to filter. Revisit: ≥3 staff or managed endpoints |
| 8.24 | Cryptography used properly, keys managed | APPLICABLE | [cryptography-and-key-management-policy](../../policies/cryptography-and-key-management-policy.md); ADR-0017; implementation Phases 13/20 (KAR-CTL-034, 035). 2026-08-15: **design only** — custody, provenance, rotation, and canary contracts exist as code with tests (KAR-CTL-064, 065, DESIGNED); no key management operates, no cloud KMS, no production keys, and this row deliberately does not advance |
| 8.25 | Development follows a secure lifecycle | APPLICABLE | [secure-development-policy](../../policies/secure-development-policy.md); CI gates land Phase 1 (KAR-CTL-020, 021) |
| 8.26 | Security requirements set for applications | APPLICABLE | Threat model drives requirements; MODULE.md intake (KAR-CTL-021, 024) |
| 8.27 | Secure architecture principles applied | APPLICABLE | 26 ADRs + architecture tests as enforcement (KAR-CTL-019, 020) |
| 8.28 | Secure coding practiced | IMPLEMENTED | Standards in secure-development-policy. 2026-08-15: the first application code exists and the enforcement bites it — lint/type checks, CodeQL (KAR-CTL-029), architecture tests at Phase 2 scope (KAR-CTL-020), typed error and Result discipline in the platform code itself |
| 8.29 | Security testing through development | APPLICABLE | Architecture tests + scans in merge-blocking CI from Phase 1 (KAR-CTL-016, 020) |
| 8.30 | Outsourced development supervised | NOT_APPLICABLE | No third-party development organization is engaged; AI-assisted work happens inside the same SDLC controls under maintainer review. Revisit: any contracted development |
| 8.31 | Development, test, production separated | PLANNED (17–19) | Ladder designed (`docs/architecture/environments.md`); staging is a hard pre-production gate (KAR-CTL-018, 030) |
| 8.32 | Changes controlled | APPLICABLE | PR-only flow + merge-blocking CI (KAR-CTL-015, 016); branch protection verified 2026-08-15 (EV-007); EXC-001 qualifies the approval leg. 2026-08-15: schema change is now controlled the same way — checksum-verified forward-only migrations with the destructive-op guard (KAR-CTL-054, 055) |
| 8.33 | Test data selected and protected | APPLICABLE | Synthetic-only rule, currently true by construction (KAR-CTL-038) |
| 8.34 | Systems protected during audits/tests | PLANNED (20) | Pen-test scoping at Phase 20; no system exists to protect or test |

## Tally (v0.3)

| Status | Count |
|---|---|
| APPLICABLE | 43 |
| PLANNED | 28 |
| NOT_APPLICABLE | 10 |
| IMPLEMENTED | 12 |
| OPERATING | 0 |
| **Total** | **93** |

Every NOT_APPLICABLE row states its reason and (where one exists) a revisit trigger; the 7.x exclusions and the ISMS scope exclusions are the same facts viewed twice, deliberately.

**Phase 2 deltas (2026-08-15):** PLANNED → IMPLEMENTED: 5.13, 8.11, 8.12, 8.15. APPLICABLE → IMPLEMENTED: 5.33, 8.9, 8.28. Annotated without status change: 8.3 (DB roles), 8.10 (declarations exist, deriving mechanism Phase 5), 8.16 (signals exist, watching does not), 8.24 (design only, deliberately not advanced), 8.32 (EV-007 verified; migration discipline). Every move tracks a matrix-IMPLEMENTED control per this file's rule; IMPLEMENTED here still means evidence pending, and no row holds OPERATING.

**Phase 3 deltas (2026-08-16):** APPLICABLE → IMPLEMENTED: 5.16 (application identity lifecycle), 5.17 (application authentication material), 8.3 (application-layer restriction: FORCE RLS, deny-by-default RBAC), 8.5 (application authentication). Annotated without status change: 5.15 (RBAC enforcement of established rules), 5.34 (consent mechanism landed; no personal data processed, row stays PLANNED), 8.2 (peer-gated delegation; no privileged HTTP surface), 8.10 (Phase 3 lifecycle rows; retention placeholders pending Phase 3.5), 8.15 (security-event ledger, kill-switch history). 8.24 again deliberately not advanced — MFA secrets encrypt through the provider seam under a local-only dev provider; no key management operates, no cloud KMS, no production keys. Every move tracks a matrix-IMPLEMENTED [P3] control per this file's rule; IMPLEMENTED here still means evidence pending, and no row holds OPERATING.
