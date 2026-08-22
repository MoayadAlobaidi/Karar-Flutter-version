# Domain and DNS Ownership and Renewal

**Status:** ACTIVE runbook · **Owner:** Operations Owner · **Version:** 0.3 · **Date:** 2026-08-17 · **Review:** every phase gate

**v0.3 (2026-08-17, Phase 4 close):** re-read at the Phase 4 gate. **Nothing about DNS or hosting changed in Phase 4, and nothing was verified.** All seven §3 hardening rows remain **TO_VERIFY**; the three confirmed facts are unchanged — the domain is registered, Cloudflare is the registrar, and Cloudflare is the authoritative DNS provider. Everything else in §1 stays `NOT_CONFIGURED`. EV-427 therefore stays `PENDING` for a second consecutive gate rather than being recorded against this file: **a self-written document is not evidence of a registrar setting**, which is the whole reason the row exists, and a second gate passing without evidence is a fact worth stating rather than a formality. Owner: Security Owner; the target moves to the Phase 5 gate, or immediately on any DNS record creation or proxy enablement.

Phase 4 built a Flutter client, and a reader could reasonably assume a client implies an endpoint. It does not. **No environment was provisioned, no record was created, and no API host exists.** The client's build guard *refuses* to produce a DEV, STAGING or PRODUCTION package without an explicit HTTPS endpoint that is not a developer-machine address, which is the opposite of a deployment: the only packages this repository can currently build are LOCAL ones ([`../architecture/flutter.md` §8a](../architecture/flutter.md)).

**Phase 4 is COMPLETE and merged; Phase 5 is IN PROGRESS and has produced no deployable surface** ([`../phases/phase-04.md`](../phases/phase-04.md), [`../phases/phase-05.md`](../phases/phase-05.md)). **Nothing in this runbook changed during Phase 4 or at its merge: no DNS record, proxy setting, WAF rule, Pages, Workers or Access configuration, or hosting configuration was created, altered, or verified.** EV-427 therefore remains `PENDING` and is now overdue — its target was the Phase 4 gate, all seven §3 hardening rows are still `TO_VERIFY`, and the Security Owner must discharge it against the registrar account itself rather than against this document.

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

## 3. Hardening checklist — two rows now observed, five still TO_VERIFY

None of these rows can be verified from *this repository*, and that has not
changed. Two of them, however, are verifiable from **outside** it: the registry
and the public DNS answer for a domain are authoritative statements by parties
other than us, and D2 and D3 already named those exact sources as acceptable.
So D2 and D3 now carry an observed value and the date it was observed, taken
from the registry's own WHOIS record and from a live DNS query — not from
anything written here.

**The other five need the registrar account itself and are unchanged.** MFA,
auto-renew, recovery methods, role separation and notification delivery are
settings inside an account, visible to whoever holds it and to nobody else. No
external query can see them, and no amount of repository prose can substitute.

**One of the two observed rows is a FAILURE, and it is recorded as one.**
Verifying a control is not the same as passing it; D2 is verified and not met.

| # | Control | Required state | Current status | Owner | How it gets verified |
|---|---|---|---|---|---|
| D1 | Multi-factor authentication on the registrar / DNS account | Enforced, with a phishing-resistant factor preferred | **TO_VERIFY** | Security Owner | Observe the account's security settings and record the observed value and date here |
| D2 | DNSSEC | Enabled at the zone, with the DS record published at the registry | **VERIFIED NOT MET, 2026-08-22** — the registry's WHOIS record for `kararfinance.com` reads `DNSSEC: unsigned`, and `dig DS kararfinance.com` returns no delegation-signer record. The zone is not signed and no DS is published | Operations Owner | Observe the zone's DNSSEC state; an independent `dig +dnssec` result may be recorded as a summary (no zone dump) |
| D3 | Registrar lock (transfer lock / `clientTransferProhibited`) | Enabled | **VERIFIED MET, 2026-08-22** — the registry's WHOIS record carries exactly one status, `clientTransferProhibited`. The transfer lock is on | Operations Owner | Observe the domain's lock state; a public WHOIS/RDAP status summary may be recorded |
| D4 | Auto-renew | Enabled, with a funded payment method | **TO_VERIFY** | Operations Owner | Observe the renewal setting. **Never record the payment method, its identifiers, or any billing artefact** |
| D5 | Account recovery methods | At least two independent recovery paths, both under the Platform Owner's control, neither dependent on the other | **TO_VERIFY** | Platform Owner | Observe and record *that* recovery paths exist and are independent — never *what* they are |
| D6 | Role separation within the registrar / DNS account | Administrative and day-to-day roles separated once more than one person exists; single-person reality recorded until then | **TO_VERIFY** | Platform Owner | Observe the account's member/role list; separation is blocked by headcount, not by configuration (EXC-001) |
| D7 | Renewal and expiry notifications | Delivered to an address the Platform Owner monitors, and not to a mailbox hosted on this domain | **TO_VERIFY** | Operations Owner | Observe the notification setting; record the *fact*, never the address |

A row moves out of TO_VERIFY only by being checked, and the check is recorded
as the observed state plus a date in the **Current status** column — the
pattern [`repository-security-settings.md`](repository-security-settings.md)
already uses. Evidence for this checklist is **EV-427** in the
[evidence register](../compliance/evidence-register.md). It stays `PENDING`:
its closure condition is **all seven** rows carrying an observed value, and
five of them still have none. Two rows moving is progress on that row, not
that row.

### What the registry actually said, 2026-08-22

Recorded because a status cell is a conclusion and this is what it was drawn
from. Public registry and DNS data only; no account was accessed and no
credential was used.

| Observation | Value | Bears on |
|---|---|---|
| Registrar of record | Cloudflare, Inc. | §1 — was Platform Owner confirmation, now independently corroborated |
| Authoritative nameservers | `eric.ns.cloudflare.com`, `lucy.ns.cloudflare.com` | §1 — DNS provider corroborated |
| Domain status | `clientTransferProhibited` (and no other status) | D3 |
| DNSSEC | `unsigned`; no DS record at the registry | D2 |
| Registry expiry | 2027-08-15 | §5 renewal cadence — a real date now exists, so D4's 90-day pre-expiry check has something to count from. It does **not** tell us auto-renew is on |
| `A` record for `kararfinance.com` | none | §1 — corroborates `NOT_CONFIGURED`; nothing is published on this name |

**Registration status is no longer only `USER_CONFIRMED`.** The registry
answers that the name exists, is held at Cloudflare, and is paid through
2027-08-15. That corroborates the Platform Owner's statement from a source
outside this project. It says nothing about who controls the account, which is
what D1 and D5 are for.

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
