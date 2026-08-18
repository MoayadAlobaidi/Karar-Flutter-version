# Vendor and Subprocessor Register

**Status:** ACTIVE register · **Owner:** Compliance Owner · **Version:** 0.3 · **Date:** 2026-08-18 · **Review:** every phase gate; per-vendor review dates below

**v0.3 (2026-08-18, Phase 4):** the Phase 4 additions recorded, and the unflattering half recorded with them. Two existing rows are sharpened to name the host the build actually resolves from and now asserts — **registry.npmjs.org** for Node packages and **pub.dev** for Dart packages — because the earlier lockfile check proved that pub.dev *appeared* rather than that it was the only host, and a package silently redirected to a private mirror left the suite green. The **mobile dependency surface** is recorded below as its own table: six directly-declared packages and one federated platform interface, all exact-pinned. **Every one of them entered the build before any security review**, which is a departure from rule 1 and is written here as such rather than smoothed into the existing rows. GitHub's row gains Actions as the surface that now *builds and inspects artifacts* rather than only running tests.

**What was NOT added, because it does not exist.** Phase 4 built a mobile client and created no cloud account, no hosting, no DNS record, no email or push provider, no crash-reporting or analytics vendor, no advertising identifier, no app-store or developer-programme account, and no Apple Team ID. The client ships no third-party SDK that transmits anything anywhere. A register of a client application usually grows a telemetry vendor at this point; this one did not, and that absence is the entry.

**CI-005 is still open and is now falling due.** Its due date is the Phase 4 gate, which has not been held. No vendor security review has been performed in this phase, the Phase 1 baseline still stands for GitHub, npm, pub.dev, Docker Hub, and the base-image publishers, and KAR-CTL-047 stays DESIGNED. Adding seven suppliers on top of an unreviewed set widens the nonconformity rather than leaving it where it was.

**v0.2 (2026-08-16, Phase 3.5):** Cloudflare added as a current vendor — **domain registrar and authoritative DNS provider only**, explicitly **not** a financial-data processor or subprocessor, with the conditions that would change that classification stated in its row and in rule 6.

**Review-date lapse, corrected and raised (CI-005).** An earlier draft of this changelog claimed review dates had been carried forward; they had not. All five pre-existing rows still read "Next review: Phase 2 gate" and had passed **two** closed gates in that state, which rule 3 defines as a gate finding — and no finding was raised at either gate. What has now actually been done, stated precisely: a **register-level re-read** on 2026-08-16 (every row checked against what each vendor does and what data reaches it — nothing had changed), next dates set to the Phase 4 gate, and the lapse logged as a nonconformity in [continual-improvement.md](iso27001/continual-improvement.md). **No new vendor security review was performed**: the Phase 1 baseline still stands for GitHub, npm, pub.dev, Docker Hub, and the base-image publishers, and KAR-CTL-047 stays DESIGNED for exactly that reason. A re-read is not a review, and this register will not pretend otherwise.

Every third party Karar's build or (future) operation depends on. **No vendor processes personal data today, because Karar holds none** — DPA status is therefore N/A across the board, and flips to REQUIRED the moment a vendor would touch personal data (KAR-CTL-048: DPA before data, not after).

---

## Current vendors

| Vendor | Service | Data shared today | Classification | DPA status | Security review | Next review | Notes |
|---|---|---|---|---|---|---|---|
| GitHub | SCM, CI (Actions), interim evidence references; from Phase 4 also the **build and artifact-inspection surface** for both mobile platforms (Gradle assemblies, packaged iOS bundles, merged-manifest and APK assertions) | Source code, documentation, CI logs, transient unsigned build artifacts | INTERNAL | N/A — no personal data processed | Baseline: platform 2FA, **public** repo (write-restricted), branch protection on `main` (verified 2026-08-15, EV-007) | **Re-read 2026-08-16 (register level, Phase 3.5)** — next: Phase 4 gate | Single-vendor concentration risk KAR-RSK-011. The Phase 1 security baseline is unchanged and no new review was performed; the "Phase 2 gate" date this row previously carried lapsed through two gates unraised (CI-005) |
| npm registry (`registry.npmjs.org`) | Node package consumption | Download requests only (package names, IPs inherent to any fetch) | PUBLIC/INTERNAL | N/A | Supply-chain controls KAR-CTL-025–028 apply to what we pull, not what we send | **Re-read 2026-08-16 (register level, Phase 3.5)** — next: Phase 4 gate | No publishing account in use; consumption only, so the review depth stays proportionate (rule 1). 2026-08-18: the workspace lockfile records integrity digests per package, and one **exact-pinned override** is in force — `deepmerge-ts` 8.0.1, forcing `@prisma/config`'s transitive dependency off a line carrying GHSA-ggr8-5vv4-36mx / CVE-2026-40345. The override is exact rather than ranged deliberately: a range under a security override would let a future lockfile refresh pull an unreviewed release in under the authority of a security fix |
| pub.dev | Dart/Flutter package consumption | Download requests only | PUBLIC/INTERNAL | N/A | Same as npm | **Re-read 2026-08-16 (register level, Phase 3.5)** — next: Phase 4 gate | Flutter toolchain dependency; consumption only. 2026-08-18 (Phase 4): pub.dev became the surface that supplies **code shipped inside a customer-facing artifact**, which is a materially different exposure from a build-time tool, so the depth-proportionate-to-data rule now reads oddly here — nothing is *sent*, and what is *received* runs on a device. The build asserts pub.dev is the **only** host in `apps/mobile/pubspec.lock` with per-package checksums, and every Flutter CI step runs `--enforce-lockfile`; a redirect of one package to a private mirror is what that assertion exists to catch, because it used to pass |
| Docker Hub | Container image pulls (local Compose, CI) | Pull requests only | PUBLIC/INTERNAL | N/A | Version-pinned images; digest pinning target (KAR-CTL-028) | **Re-read 2026-08-16 (register level, Phase 3.5)** — next: Phase 4 gate | Rate limits also an availability consideration for CI |
| Container base-image publishers (e.g. postgres, node official images) | Upstream images consumed via registry | None | PUBLIC | N/A | Pinning + SCA over resulting dependency tree | **Re-read 2026-08-16 (register level, Phase 3.5)** — next: Phase 4 gate | Listed separately from the registry because trust attaches to the publisher, not the mirror |
| Cloudflare | **Domain registrar and authoritative DNS provider for `kararfinance.com` — nothing else** | **None.** No hosting, no proxying, no CDN, no WAF, no email, and no DNS record is configured, so no Karar traffic, request, or datum reaches Cloudflare beyond the registration and zone-holding relationship itself | PUBLIC (a domain name and its zone are public facts) | N/A — no personal data, and no data of any class, is processed | Baseline recorded, not verified: registrar and DNS ownership is USER_CONFIRMED; MFA, DNSSEC, registrar lock, auto-renew, recovery methods, role separation, and renewal notifications are all **TO_VERIFY** ([domain runbook](../operations/domain-and-dns-runbook.md) §3, EV-427 PENDING) | Phase 3.5 gate, then every gate until the §3 checklist clears | **Not a financial-data processor and not a subprocessor.** See below for exactly what would change that |

### Cloudflare's classification, and what would change it

Cloudflare is recorded as a **registrar and DNS vendor**. It is deliberately
**not** classified as a financial-data processor, a personal-data processor, or
a subprocessor, because today it handles neither: a registration record and an
authoritative zone with no records in it carry no Karar data, and DNS
resolution of a name that points nowhere reveals nothing about a customer
Karar does not have.

The classification changes — and the vendor must be re-reviewed *before* the
change is made, not after — on any of the following:

1. **Any DNS record is published** that resolves to a Karar origin. Cloudflare
   then holds resolution metadata for real traffic even while proxying is off,
   and becomes an availability dependency.
2. **Proxying (the orange-cloud state), CDN, or WAF is enabled** on any record.
   Cloudflare then terminates TLS and sees request content — at that point it
   is unambiguously a processor of whatever those requests carry, up to and
   including `HIGHLY_SENSITIVE_FINANCIAL` data, and a **DPA is required before
   the switch is flipped** (KAR-CTL-048).
3. **Email is configured** on the domain (MX, or any sending path), which puts
   contact identifiers and message content in scope.
4. **Any Cloudflare compute, storage, queue, or edge product is adopted**
   (Workers, R2, KV, D1, Access, Tunnel, or similar). Each is a distinct
   adoption decision with its own security review under rule 1 below, never an
   extension of "we already use Cloudflare".
5. **Karar acquires customers whose personal data would flow through any of the
   above**, at which point Cloudflare becomes a subprocessor to be disclosed
   under rule 5 and to appear in customer-facing subprocessor lists.

Until one of those happens, the honest statement is the narrow one: Cloudflare
holds the name and answers for the zone, and that is the whole relationship.
The Cloudflare account's own hardening is nonetheless material despite the
narrow data scope — losing registrar control loses the domain — which is why
the runbook's checklist exists and why every row in it is TO_VERIFY rather
than assumed.

## Phase 4 — the mobile dependency surface

Recorded as its own table because these suppliers differ in kind from the ones above: a registry or a base image is consumed at build time, whereas **this code is compiled into an artifact that would run on a customer's device**. The exposure is therefore not "what data reaches the vendor" — none does — but "what this code can do once it is inside our application", which the depth-proportionate rule was not written for and which rule 1 should be read against at the next review.

All are exact-pinned with a committed lockfile, asserted by a test that also fails on a nested-block (`git:`/`path:`/`hosted:`) bypass, on the **removal** of a named security-critical package, and on any `dependency_overrides` section. **None has had a security review.** They are open-source packages whose publishers are not contracted parties, hold no Karar data, and owe Karar nothing.

| Package | What it does in the artifact | Why it is here rather than folded into the pub.dev row | Security review |
|---|---|---|---|
| `flutter_secure_storage` | The **only** place session tokens are written: iOS/macOS Keychain, Android Keystore-backed storage | It is the custody boundary for the highest-classification thing the client holds. Carries its own record with a named owner and review triggers | **None performed.** Version floor also drives `compileSdk` 37, so it constrains the build as well as the runtime |
| `local_auth` | The platform authenticator behind the application lock | It decides whether the lock opens, and it contributes two permissions to the shipped manifest. Carries its own record with a named owner | **None performed.** It had drifted to a caret range with nothing failing, which is why the pinning test names it individually |
| `dio` | HTTP transport; interceptor composition, typed timeouts, cancellation | It sees every request and response, including credentials in flight; TLS validation is delegated to the platform stack and **not** pinned | **None performed** |
| `go_router` | Declarative routing | It executes the single redirect that decides whether protected content renders | **None performed** |
| `flutter_riverpod` | The only composition mechanism; no service locator, no global mutable instance | Every dependency the client resolves passes through it | **None performed** |
| `shared_preferences` | Non-sensitive preferences only (locale, theme) | Named because of what it is **no longer** allowed to hold: the application-lock flag and the session-abandonment marker moved to a dedicated fail-closed store after this package's swallow-and-fall-back-to-memory behaviour composed into a fail-open | **None performed** |
| `shared_preferences_platform_interface` | The federated platform interface behind the above | Declared directly rather than depended on transitively, because the security-state adapter's tests register a fake platform to make a real platform fault reachable — a test reaching into a transitive package depends on it whether the manifest admits it or not | **None performed.** Must move with `shared_preferences` |

Also pinned and recorded, without their own rows because they carry no security decision: `intl`, `cupertino_icons`, and `meta`.

**The honest summary of this table:** seven suppliers entered a customer-facing artifact before anyone reviewed any of them, under a rule (rule 1) that requires the review *before first use*. Pinning them exactly proves that what builds is what was read; it says nothing about whether what was read is safe. Two of the seven — the token store and the authenticator — are the two that would matter most if it were not.

## Planned vendors

Recorded now so their gating conditions are visible before anyone is committed:

| Vendor (class) | Phase | Data that would be shared | Preconditions before adoption |
|---|---|---|---|
| Cloud provider (GCP is the candidate — **UNVERIFIED** per `docs/architecture/country-deployment-matrix.md`) | 17 | Eventually all platform data classes except `SEALED` plaintext (sealed stays sealed; provider stores ciphertext) | Residency posture (KAR-RSK-006), DPA, shared-responsibility mapping, `DeploymentProfile` fit |
| AI provider | 7 (mock first), 17 (real) | Facts-only prompt context; machine identifiers redacted; never `SEALED` | `AIProcessingPolicy` typed clause, consent gate fail-closed, capped spend per environment, DPA |
| Billing provider (`SubscriptionBillingProvider`) | 10 | Subscription/entitlement state; settlement data stays with the provider (AC-011 — Karar does not custody funds) | Contract + DPA, shared-responsibility row, no Zakat/Sadaqah payment execution |
| Bank connectivity / verification providers | 5+ | Per-connector; classification HIGHLY_SENSITIVE_FINANCIAL | Connector review, DPA, jurisdiction check |
| Email / push providers | 16+ | Contact identifiers, notification content (minimized) | DPA, content-minimization rules |
| Independent security assessor / penetration tester | 20 | Access under controlled scope | Engagement terms; ISO 27002 8.34 protections |

## Rules

1. **Adoption:** a vendor is added here with a security review *before* first use (KAR-CTL-047); the review's depth is proportionate to the data shared.
2. **DPA:** required before any personal data flows (KAR-CTL-048, roadmap non-engineering gate "DPAs with every processor").
3. **Review dates** are checked at each phase gate; a lapsed review is a gate finding.
4. **Exit:** removing a vendor records the leaving date and how any held data or credentials were closed out.
5. Subprocessors of our vendors are tracked once Karar has customers whose data those subprocessors could touch — today the chain stops at the vendors above because nothing personal flows at all.
6. **A vendor's classification is scoped to what it actually handles today, and a broader product from the same vendor is a new adoption**, not an extension of the existing row. Cloudflare is the live example: registrar and DNS is the recorded scope, and proxy, CDN, WAF, email, or any compute/storage product is a separate reviewed decision under rule 1 with its own DPA question under rule 2.
