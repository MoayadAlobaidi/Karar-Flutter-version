# Sealed Access

**The operational and security procedures for `SEALED` data.** Architecture is in [`../architecture/sealed-data.md`](../architecture/sealed-data.md).

---

## 1. The rule

> **No sealed payload is read without a `SealAccessGrant`, and the grant is a required, non-nullable argument.**

```ts
read(ref: SealedPayloadRef, grant: SealAccessGrant): Promise<SealedPayload>
```

There is no overload without one. **Compiler-enforced, not policy-enforced** — a developer cannot accidentally read sealed data, because the code does not compile without a grant they had to obtain deliberately.

## 2. Grant types

| Type | Subject | Requires | Scope | Expiry |
|---|---|---|---|---|
| `OWNER` | The data subject, living | Step-up authentication | Their own records | Short |
| `DISCLOSURE` | A verified recipient | Death verification → recipient verification → waiting period → **human approval** | The authorized package only | Defined at authorization |
| `LEGAL_ORDER` | Break-glass | **Dual approval + security notification** | As ordered | Short, explicit |

**`SUPPORT`, `ADMIN`, `ANALYTICS`, and `AI` do not exist as grant types.** Not "exist but restricted" — absent from the type. There is no permission an operator could be granted that would produce one.

## 3. Minting a grant

Minting is itself an audited, policy-checked, approval-bearing operation:

1. Resolve `EffectivePolicy` for the jurisdiction.
2. Verify the workflow state permits it — for `DISCLOSURE`, the case must be `Authorized`.
3. Verify the approval policy was satisfied, including the human-approver requirement.
4. Record purpose, recipient, scope, expiry, approval chain, and **releasing operating entity**.
5. Emit a security event.
6. Write the audit record **before** the grant becomes usable.

## 4. Defense in depth

| Layer | Mechanism |
|---|---|
| Type system | Grant required, non-nullable |
| Application | Grant validated against workflow state and policy |
| **Database** | RLS on `sealed_payloads` requires a grant GUC — **a SQL-level mistake in application code returns nothing, not ciphertext** |
| Network | Post-extraction: separate segment and service account |
| Keys | Separate KMS key ring, jurisdiction-scoped |
| Audit | Every attempt, successful or refused |

## 5. Audit — every attempt

Recorded for **both** successes and refusals:

```
actor · grant_ref (or absence) · purpose · record_ref
releasing_entity · outcome · timestamp · source
```

**A refused attempt is the more interesting record.** A successful one was authorized; a refused one may be the first sign of something wrong.

Surfaced in Super Admin as **Sealed Access Events** — a first-class security view, alongside Administrators, Roles, Sessions, Audit, Security Events, and Data Requests.

## 6. Key loss detection — the canary

Sealed data cannot be monitored by reading it. The canary is the only mechanism that detects key loss without violating the seal.

| Property | |
|---|---|
| One synthetic sealed record **per jurisdiction-KEK** | |
| Holds **known plaintext containing no customer data** | Asserted by architecture test |
| Decrypted on a schedule | |
| Failure raises a **security event**, not a log line | |

Without it, a KEK failure is discovered at the worst possible moment: a verified, authorised disclosure to a bereaved family, after every gate has been passed.

## 7. Escrow and recovery

**KEK escrow under split control** — no single operator can reconstruct a KEK alone — with a **documented, rehearsed, timed** recovery drill.

**Hard gates before any production `SEALED` data exists:**

1. Vault extracted into a dedicated security boundary.
2. Escrow in place, recovery drill executed and timed.
3. Canary running in staging and production.

All three are Phase 20 prerequisites, verified before Amanat ships.

## 8. Incident response

| Signal | Response |
|---|---|
| Canary decryption fails | **SEV-1.** Halt sealed writes. Initiate escrow recovery. Do not attempt reads |
| Refused access attempts spike | Security review. Possible credential compromise |
| A grant is minted outside a workflow | **SEV-1.** Assume application compromise |
| Vault boundary reached from an unexpected source | **SEV-1.** Network isolation review |
| A sealed value appears in a log, event, or projection | **SEV-1.** Containment, then root-cause the failed architecture test |

**A sealed value leaving its boundary is a SEV-1 regardless of how few records are involved.** The classification is a promise, and the promise is breached at n=1.

## 9. What operations can do without any grant

Enough to run the capability:

| | |
|---|---|
| Count records by status, tenant, jurisdiction | |
| See case ages and queue depth | |
| Approve or reject disclosure cases | |
| Read every audit and security event | |
| Disable the capability in a jurisdiction instantly | |
| Rebuild `amanat_case_operational` | |

**Never:** an obligation's amount, counterparty, description, evidence, or instructions — **and never a sum.**

## 10. Prohibited

| | |
|---|---|
| A read path without a grant | |
| A `SUPPORT`, `ADMIN`, `ANALYTICS`, or `AI` grant type | |
| Sealed data in a projection, event, log, analytic, or AI context | |
| Sealed data cached or persisted on a device | |
| A search index over sealed content | |
| Sealed content in a disclosure package beyond the authorized scope | |
| Production sealed data without extraction, escrow, and canary | |
| **Reclassifying anything out of `SEALED`** | The promise has no downgrade path |
