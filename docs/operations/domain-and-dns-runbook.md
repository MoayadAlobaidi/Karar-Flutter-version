# Domain and DNS Ownership and Renewal

**Status:** ACTIVE runbook · **Owner:** Operations Owner · **Version:** 0.2 · **Date:** 2026-08-16 · **Review:** every phase gate

**v0.2 (2026-08-16, Phase 3.5 close):** re-checked at the Phase 3.5 gate. **Nothing changed, and nothing was verified** — all seven §3 hardening rows remain **TO_VERIFY**, because no repository-verifiable evidence of any registrar or DNS setting exists and none was obtained. **Exactly three things are confirmed facts: the domain is registered, Cloudflare is the registrar, and Cloudflare is the authoritative DNS provider.** Everything else in §1 is `NOT_CONFIGURED` and everything in §3 is unverified. EV-427 therefore stays `PENDING` at the gate rather than being recorded against this file — **a self-written document is not evidence of a registrar setting**, which is the whole reason this row exists. Owner: Security Owner; target the Phase 4 gate, or immediately on any DNS record creation or proxy enablement. **Phase 3.5 is COMPLETE; Phase 4 is NOT STARTED**, and no DNS or hosting change is scheduled or made.

The operational companion to the `kararfinance.com` row in the
[asset inventory](../compliance/asset-inventory.md) and the Cloudflare row in
the [vendor and subprocessor register](../compliance/vendor-and-subprocessor-register.md).
It records who owns the domain, when it must be renewed, who is accountable
for that happening, what hardening has **not** been verified, and the rule
that governs every future DNS change.

This file follows the same discipline as
[`repository-security-settings.md`](repository-security-settings.md): a row
claims a setting is active only after someone has actually checked it.
Anything unchecked stays **TO_VERIFY**, and TO_VERIFY is not a synonym for
"probably fine".

**This file contains no account identifiers, no registrar or DNS API
credentials, no billing or invoice data, no registrant contact details, and no
screenshots.** Those live with the Platform Owner outside the repository; the
repository holds ownership, accountability, and posture only. The repository is
**public** — see [`evidence-handling.md`](../compliance/evidence-handling.md).

---

## 1. What is owned

| Fact | Value | Basis |
|---|---|---|
| Asset | `kararfinance.com` | Platform Owner confirmation, 2026-08-16 |
| Purpose | The global Karar master domain | Platform Owner confirmation |
| Registrar | Cloudflare Registrar | Platform Owner confirmation |
| Authoritative DNS provider | Cloudflare | Platform Owner confirmation |
| Registration status | `USER_CONFIRMED` — the Platform Owner states the domain is registered and held | Platform Owner confirmation; **not** independently verified from this repository |
| Hosting | `NOT_CONFIGURED` | No deployment exists (Phase 3.5: no cloud account, no environment) |
| Application traffic | `NOT_CONFIGURED` | No origin exists to route to |
| API | `NOT_CONFIGURED` | No API is deployed anywhere |
| Email | `NOT_CONFIGURED` | No mail is sent or received on the domain; the only mail sink in the platform is `LocalMailSink`, which refuses to construct outside `KARAR_ENV=local` (KAR-CTL-078) |
| Cloudflare proxy / CDN / WAF | `NOT_CONFIGURED` | Nothing is proxied because nothing is served |

**No DNS record is configured, and none may be added except as its own
reviewed change** — see §4. The absence is the current posture, exactly as the
absence of a cloud account is.

## 2. Ownership and accountability

| Responsibility | Role | Notes |
|---|---|---|
| Registrar account ownership, payment method, registrant identity | Platform Owner | Not recorded here; single-person reality carried as KAR-RSK-001 and EXC-001 |
| Renewal happening on time | Operations Owner | Accountable even when the registrar auto-renews — an auto-renew that silently fails is still a lapse |
| DNS zone content (records, proxy state, WAF) | Operations Owner | Nothing to administer today; the role exists before the work does, deliberately |
| Recording changes here and in the asset inventory | Compliance Owner | Rule 1 of the asset inventory: a real asset change enters the register in the same PR or gate cycle |
| Hardening verification (§3) | Security Owner | Each row carries its own verification owner |

All five roles currently resolve to one person ([control-owners.md](../compliance/control-owners.md)).
That is the risk, not a comfort: registrar and DNS control is a
project-ending single point of failure if the account is lost, and it is
governed by exactly the same key-person concentration as everything else
(KAR-RSK-001).

## 3. Hardening checklist — every row TO_VERIFY

None of the rows below can be verified from this repository. There is no
export, no API response, and no run record in-repo that demonstrates any of
them, so every row is **TO_VERIFY** and must stay TO_VERIFY until someone
checks the registrar and DNS account and records the observed value with a
date, the way the repository-settings rows are recorded.

| # | Control | Required state | Current status | Owner | How it gets verified |
|---|---|---|---|---|---|
| D1 | Multi-factor authentication on the registrar / DNS account | Enforced, with a phishing-resistant factor preferred | **TO_VERIFY** | Security Owner | Observe the account's security settings and record the observed value and date here |
| D2 | DNSSEC | Enabled at the zone, with the DS record published at the registry | **TO_VERIFY** | Operations Owner | Observe the zone's DNSSEC state; an independent `dig +dnssec` result may be recorded as a summary (no zone dump) |
| D3 | Registrar lock (transfer lock / `clientTransferProhibited`) | Enabled | **TO_VERIFY** | Operations Owner | Observe the domain's lock state; a public WHOIS/RDAP status summary may be recorded |
| D4 | Auto-renew | Enabled, with a funded payment method | **TO_VERIFY** | Operations Owner | Observe the renewal setting. **Never record the payment method, its identifiers, or any billing artefact** |
| D5 | Account recovery methods | At least two independent recovery paths, both under the Platform Owner's control, neither dependent on the other | **TO_VERIFY** | Platform Owner | Observe and record *that* recovery paths exist and are independent — never *what* they are |
| D6 | Role separation within the registrar / DNS account | Administrative and day-to-day roles separated once more than one person exists; single-person reality recorded until then | **TO_VERIFY** | Platform Owner | Observe the account's member/role list; separation is blocked by headcount, not by configuration (EXC-001) |
| D7 | Renewal and expiry notifications | Delivered to an address the Platform Owner monitors, and not to a mailbox hosted on this domain | **TO_VERIFY** | Operations Owner | Observe the notification setting; record the *fact*, never the address |

A row moves out of TO_VERIFY only by being checked, and the check is recorded
as the observed state plus a date in the **Current status** column — the
pattern [`repository-security-settings.md`](repository-security-settings.md)
already uses. Evidence for this checklist is **EV-427** in the
[evidence register](../compliance/evidence-register.md), which is `PENDING`
precisely because none of these verifications has happened.

**D7's second clause is not pedantry.** A domain whose renewal warnings are
delivered to a mailbox on that domain loses its warning channel at the same
moment it loses the domain. Email is `NOT_CONFIGURED` today, so the trap is
avoidable now and expensive to unwind later.

## 4. The change rule

**Nothing is configured on this domain, and each of the following is its own
separate, reviewed change** — never a side effect of another piece of work,
and never bundled together for convenience:

1. A DNS record of any kind (A, AAAA, CNAME, TXT, MX, SRV, CAA, NS).
2. Cloudflare proxying of any record (the orange-cloud state).
3. CDN behaviour, caching rules, or page rules.
4. WAF rules, rate limiting, or bot management.
5. Email — MX records, SPF, DKIM, DMARC, or any sending domain or subdomain.
6. TLS certificate issuance, including any certificate that would be issued
   automatically as a consequence of proxying.
7. Subdomain delegation to any other provider.

Each change carries, before it is made: what record or setting changes, why,
who reviewed it, what it exposes that was not exposed before, and how it is
reverted. Changes reach the domain through the same review discipline as
code changes (KAR-CTL-015, 016, 032, 093) even though they are not code —
the registrar is a configuration surface with production consequences, and
"it is only a DNS record" is how the legacy's transport findings started
(`docs/legacy/security-findings.md`).

**A CAA record is the one change worth planning before it is needed:** it is
the record that constrains which certificate authorities may issue for the
domain, and it is cheapest to set while no certificate exists. It remains
`NOT_CONFIGURED` today because setting it is a change under this same rule,
not because it is unimportant.

## 5. Renewal cadence

| Item | Cadence | Owner |
|---|---|---|
| Confirm the domain is registered and unexpired | Every phase gate | Operations Owner |
| Confirm auto-renew and the payment method are still valid (D4) | Every phase gate, and 90 days before any expiry once the expiry date is recorded | Operations Owner |
| Re-check the §3 hardening checklist | Every phase gate until all rows leave TO_VERIFY; annually thereafter, and on any registrar account change | Security Owner |
| Re-read this runbook against reality | Every phase gate | Compliance Owner |

The expiry date itself is deliberately **not** recorded in this public
repository as a precise date tied to an account; the gate check is
"confirmed unexpired, with renewal cover verified", recorded as a date and
an outcome.

## 6. What this domain does not do

Stated plainly so no reader infers more than exists:

- It serves no site, API, or application, and resolves to no Karar origin.
- It sends and receives no email.
- It is not a subprocessor boundary, a data-flow path, or a residency fact —
  no personal data, no customer data, and no traffic of any kind touches it
  (KAR-CTL-038, AC-015).
- Holding it implies **no** deployment readiness, no environment, and no
  production posture. The [asset inventory](../compliance/asset-inventory.md)
  records it as a registered name and nothing more.
