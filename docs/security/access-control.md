# Access Control

---

## 1. Layers

| Layer | Question |
|---|---|
| **Authentication** | Who is this? |
| **Capability availability** | Does this capability exist for this context at all? |
| **Authorization (RBAC)** | May this actor perform this operation? |
| **Tenant isolation (RLS)** | Whose data is this? |
| **Sealed grants** | Is there an explicit, approved grant to read this payload? |

**Availability comes before authorization.** A capability unavailable in a jurisdiction is unreachable regardless of the actor's permissions — asking "may this admin read it?" is meaningless if the capability has no legal basis to exist there.

## 2. Permission naming

```
<capability>.<resource>.<action>
```

`transactions.transaction.read` · `amanat.record.create` · `amanat.case.approve`

**`MODULE.md` states which permissions deliberately do not exist**, which is as much a design statement as the ones that do:

> Amanat: **no `amanat.content.read` for any admin role.** Not restricted — absent.

## 3. Roles

### Consumer

| Role | |
|---|---|
| `USER` | Owns their own data |
| `TENANT_MEMBER` | A member of a partner tenant |

### Partner staff

| Role | Scope |
|---|---|
| `TENANT_ADMIN` | Their tenant only. RLS-enforced. Never platform authority |

The legacy got the mechanism right — `app.tenant_id` bound from the caller's own record inside the transaction, never from client input — and the policy wrong: `tenant_users` has no bank-admin policy, so the roster returns empty for everyone, and **an empty roster is indistinguishable from correct isolation**. Karar's tests assert non-empty expected data.

### Platform staff — via the control plane only

| Role | May |
|---|---|
| `SUPPORT` | Read customer metadata per permission. **Every read audited, including reads returning nothing** |
| `OPERATOR` | Availability, kill switches, provider enablement — **restrict-only** |
| `SECURITY` | Audit and security events. **No content access** |
| `PLATFORM_ADMIN` | Role and entity administration |
| `DISCLOSURE_APPROVER` | Approve disclosure cases. **Cannot read sealed content** |

**No platform role can read `SEALED` content.** `DISCLOSURE_APPROVER` approves a release without seeing what is released — the package is generated after authorization, under a `DISCLOSURE` grant scoped to the recipient, not to the approver.

## 4. Staff access needs two layers

The legacy's finding, quoted because it is the clearest statement of the problem:

> There is no endpoint that returns one customer's transactions to a staff member. **The database, however, grants a platform administrator session SELECT on every consumer financial table; only the absence of an endpoint prevents the read.** That is one layer, not two.

**Karar:**

1. No endpoint returns raw consumer financial detail to staff.
2. **RLS plus revoked grants mean an admin session reaching the database cannot read those rows either.**
3. Admin data comes from **projections**.
4. **Every staff read is audited**, including empty results.

## 5. Sealed access

```ts
read(ref: SealedPayloadRef, grant: SealAccessGrant): Promise<SealedPayload>
```

| Grant | Who | Requires |
|---|---|---|
| `OWNER` | The subject, living | Step-up authentication |
| `DISCLOSURE` | A verified recipient | Full workflow: verification → waiting period → approval. Scope-limited, expiring |
| `LEGAL_ORDER` | Break-glass | **Dual approval + security notification** |

**`SUPPORT`, `ADMIN`, `ANALYTICS`, and `AI` grant types do not exist.**

See [`sealed-access.md`](sealed-access.md).

## 6. Enforcement points

| Point | Enforces |
|---|---|
| Edge guard | Authn, rate limit, context resolution |
| `@RequiresCapability` | Availability at the controller boundary |
| Inside the use case | Availability **and** permission — **because HTTP is not the only caller** |
| Repository | Tenant scope |
| **PostgreSQL RLS** | Tenant isolation — the actual boundary |
| `SealedRecordStore` | Grant, at the type level |

## 7. Sessions

| Rule | Why |
|---|---|
| Short-lived access tokens, rotating refresh | |
| **Roles re-derived from the database per request** | Revocation is immediate. Carried forward from the legacy |
| **Server-side revocation for all sessions** | Legacy AUTHN-07: admin sign-out is client-side only |
| **Disabling an account revokes its refresh tokens** | Legacy AUTHN-08: re-enabling resurrects every prior session |
| Admin sessions: MFA, shorter lifetime, reauthentication for production | |
| Admin session state is **not** in process memory | Legacy AUTHN-16: pending tokens in one JVM's heap |

## 8. Break-glass

`LEGAL_ORDER` grants and other emergency access require: dual approval, a recorded reason and legal basis, time limits, **a security notification that cannot be suppressed by the actor**, and post-hoc review.

**Break-glass is designed and deferred** — no implementation exists in v1. It is listed among the deferred decisions, behind the grant type that already exists.
