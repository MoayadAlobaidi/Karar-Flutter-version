# Access Control

---

## 1. Layers

| Layer | Question |
|---|---|
| **Authentication** | Who is this? |
| **Capability availability** | Does this capability exist for this context at all? |
| **Authorization — owner self-service** | Is this principal acting on their OWN record? |
| **Authorization — RBAC** | May this actor act on a subject OTHER than themselves, or on the platform? |
| **Tenant isolation (RLS)** | Whose data is this? |
| **Sealed grants** | Is there an explicit, approved grant to read this payload? |

**Availability comes before authorization.** A capability unavailable in a jurisdiction is unreachable regardless of the actor's permissions — asking "may this admin read it?" is meaningless if the capability has no legal basis to exist there.

**The two authorisation rows are two models, not two steps.** An operation is governed by one or the other: the owner reading their own account is decided by identity, ownership and RLS and no permission is consulted, while a staff or platform operation is decided by the closed permission catalogue. §2 says which is which, and why a permission that only the owner could hold would decide nothing.

## 2. Two authorisation models

Karar authorises in **two different ways**. They are not two layers of one mechanism and they are not interchangeable; keeping them apart is what stops the system acquiring checks that decide nothing.

| Model | Governs | The question | What denies |
|---|---|---|---|
| **Owner self-service** | A principal acting on their OWN records | Is this the owner, and is this their row? | The session-bound principal, the application-layer ownership ports, RLS, and the capability gate ahead of all three |
| **RBAC** | Staff, cross-subject, and platform operations | May this actor act on a subject OTHER than themselves, or on the platform? | The closed permission catalogue, resolved deny-by-default by `PolicyService` |

**RBAC is not the general case with self-service as an exception — it is the mechanism for acting on somebody else.** The catalogue says so structurally: `USER` is granted **nothing at all** (`modules/authorization/domain/catalogue.ts`: "Own-data authority comes from identity + RLS, never from an RBAC grant"), and `users.profile.read` — the one permission whose name sounds self-scoped — is granted to `SUPPORT`, for reading *other people's* profiles.

### Permission naming

```
<capability>.<resource>.<action>
```

`users.profile.read` · `amanat.record.create` · `amanat.case.approve`

A permission exists because a reviewed migration seeded it **and** the compile-time catalogue lists it — an integration test asserts the two are equal, so they cannot drift silently. **A module file mentioning a name does not create a right**, and a supplementary architecture check (`scripts/checks/architecture.mjs`, `module-permissions-in-catalogue`) now refuses a `MODULE.md` permission table that names an identifier the catalogue does not define.

**`MODULE.md` states which permissions deliberately do not exist**, which is as much a design statement as the ones that do:

> Amanat: **no `amanat.content.read` for any admin role.** Not restricted — absent.

### The financial surface is owner self-service, and declares no permission

Six bounded contexts — `financial-accounts`, `financial-connections`, `payment-instruments`, `transactions`, `transfer-matching`, `statement-imports` — mount 27 operations over 21 `/financial/*` paths, and **not one of them declares a permission.** Every operation there is the owner acting on their own record, which is the model RBAC does not govern.

Twelve permissions were declared across those six `MODULE.md` files until this phase — `accounts.account.read` / `.write`, `accounts.connection.read` / `.write`, `accounts.instrument.read` / `.write`, `accounts.transfer.read` / `.write`, `transactions.transaction.read` / `.write`, `transactions.import.read` / `.write`. **None was in the catalogue, none was seeded by any migration, and no code ever consulted one.** Each would have been held by `USER` and by nobody else, so a policy check against it would have been a tautology for the only role that could hold it — ceremony, not safety. They have been **removed rather than annotated**: a permission table that lists rights nothing grants and nothing checks documents authority the system does not have, and that claim is the thing being withdrawn. Adding the twelve to the catalogue instead was considered and rejected for the same reason; the model that governs this surface is the one below.

**What actually denies there** is four things, and together they are the owner self-service model in full:

| Control | What it refuses |
|---|---|
| The principal | Subject and tenant come **exclusively** from the session's server-side binding, resolved in one file (`apps/api/src/financial/principal.ts`). No principal answers **401**; a session bound to no tenant answers **403** — different remedies, deliberately distinguished. No `userId` or `tenantId` is read from a path, query, header, or body, because no code path exists that would consult one |
| Ownership ports | Every write resolves its target through an application-layer port that answers only about records the caller owns — `FinancialAccountAccessPort`, `CanonicalAccountAccessPort`, `BalanceBearingAccountAccessPort`, `MatchableTransactionAccessPort`. Each returns `null` for absent, another user's, another tenant's, and never-minted **alike**, so a foreign id answers **404** identically to an unknown one and the surface is not an existence oracle |
| RLS | Every repository binds the principal's RLS context per transaction — the boundary that still holds when the layers above it are wrong |
| The capability gate | Whether the capability exists for this context at all, which §1 puts **before** any question of authority. A server-side capability gate for this surface is being added in this phase by a separate workstream |

### `requirePermission` is mounted nowhere, and that is a fact about the whole repository

The `requirePermission(...)` guard factory in `modules/authorization/presentation/http/` is **declared and has no production call site anywhere in the repository**; the only code that mints one is the authorization module's own guard test. The Phase 3 and 3.5 modules — `tenancy`, `authorization`, `operating-entity`, `consent`, `jurisdiction`, `capability`, `control-plane` — enforce **inside their use cases**, calling `PolicyService.authorize(...)` before acting, because HTTP is not the only caller.

So the financial surface is **not skipping a control that other surfaces apply at the route: nothing applies it at the route.** Any text describing route-level `requirePermission` as the convention is describing an aspiration rather than the tree; [`../architecture/extension-pattern.md`](../architecture/extension-pattern.md) §5 states the convention actually followed, and names the divergence.

### The staff permissions that do not exist

**There is no staff permission that returns one customer's accounts, connections, source links, instruments, transactions, statement imports or transfer matches, and none may be added.** Each of those sets is a different disclosure about the same person. A source link says which institutions someone deals with and, through its fingerprint, which of their accounts are the same account; an instrument list says which products they hold and which accounts they spend from; a transfer-match set says which of their accounts feed which, and how often; a statement import is the raw file a bank sent them.

Removing the twelve does not touch that prohibition and must not be read as touching it. The twelve were `USER`-scoped and were never staff rights; **what is forbidden is adding a staff one**, and that is unchanged. And **no `?userId=` or `?tenantId=` parameter is accepted anywhere on the mounted surface** — not in a path, a query, a header or a body. That is proved three ways rather than asserted: a mutation-checked source scan, a contract check that no operation declares such a parameter, and a runtime request carrying `?userId=`, `?tenantId=` and `x-tenant-id` that returns byte-for-byte what the same request returns without them.

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

**No permission check runs at a route.** `requirePermission(...)` exists and is mounted nowhere; the modules that enforce permissions do it in the use case, through `PolicyService.authorize(...)`. The rows above describe where enforcement happens, not a second route-level permission gate — see §2.

### Phase 3.5 additions

Six enforcement points arrived with jurisdiction, capability, and tenant
binding. Each is listed by the artifact that does the enforcing, in the order a
request meets them.

| Point | Enforces |
|---|---|
| Session tenant binding | Which tenant a session may act as. Set from a **server-side membership read, never from the request**; null → value only, and a change of tenant is a switch that revokes the old session and its refresh family |
| Capability resolver, gate 1 | Whether the code exists at all. Reads the compile-time descriptor only — **no configuration row, pack, or entitlement is consulted first**, so unbuilt code cannot be made available |
| PolicyPack ceiling | The **maximum** capability set for a jurisdiction. A ceiling, not a grant: clearing a capability permits the later gates to run, it never skips them |
| `jurisdiction_settings` | Restriction only. The table has **no column that can express an enablement**, and the merge is subtractive — an absent row restricts nothing |
| Tenant capability entitlement | Per-tenant availability, RLS-scoped and **validated temporally at read time**, so a lapsed window denies regardless of the stored status |
| Client-safe view | What a client is told. A separate projection: `HIDDEN` capabilities are **omitted in every state**, and legal, jurisdictional, entity, and licence denial reasons never appear |

Two rules hold across all six. **Every gate denies by default** — an absent
row, an unresolved question, or a store outage is a denial, never a permission.
And **nothing downstream can widen what an upstream gate allowed**: the merge
across registry, pack, settings, availability, and entitlement is restrict-only,
asserted as a property over randomized inputs in
`modules/capability/__tests__/restrict-only.property.test.ts`.

### Phase 4 additions — the client edge

Three surfaces arrived with the Flutter client. None of them widens anything; each narrows what a caller can ask for.

| Point | Enforces |
|---|---|
| The tenantless self surface | `GET /tenancy/memberships` answers only from the caller's own principal, and is mounted through a module whose principal source **drops the tenant id** — so it cannot be handed a tenant-bound principal by a wiring mistake. It exists because a session must be able to present a choice before it is bound to anything |
| Resolution-scoped entity read | The operating-entity summary is derived from the caller's own binding. A caller **cannot name an entity id** and cannot enumerate the register, and the reader selects four columns so licence, contract and administrative detail never enter the process |
| Self-declaration, which grants nothing | A subject may declare a jurisdiction. The record is `USER_DECLARED` / `UNVERIFIED` by module constant and by schema CHECK, it cannot supersede a verified assignment, and an unverified state is itself a denial at the capability ceiling — so declaring **changes which denial the subject sees and nothing else**. The offered set and the accepted set share one predicate, so what may be declared and what will be accepted cannot drift apart |
| Legal-document content, which is not an oracle | `GET /consent/documents/{documentId}/content` serves a document's text hash-verified against the version that published it. **An unknown document and another entity's document receive byte-identical answers**, so the endpoint cannot be used to probe which documents exist or whom they belong to. Content whose SHA-256 does not match the published version is a 503 with nothing served — a mismatch is refused rather than reconciled |

Two client-side properties belong here rather than in the client's own documentation, because they are access-control facts. **The client decides no availability**: it renders an allowlisted subset of what the server returned and holds no notion of a capability the server omitted ([`../architecture/capability-registry.md` §5](../architecture/capability-registry.md)). And **the client asserts no tenant**: binding always comes from a server-side membership read, and the client sends a selection, never a claim ([`../architecture/tenancy.md` §6](../architecture/tenancy.md)).

**The local device gate is not one of these layers, and it must not be read as one.** The application lock is a local authenticator over an already-issued session: it fails closed, it is loaded from a store with no in-memory fallback so an unreadable lock state stops the launch rather than reading as "off", and **an unlock grants no session and never substitutes for signing in**. It has never been exercised on a device ([`../phases/phase-04.md`](../phases/phase-04.md)). Server-side revocation remains the only mechanism that ends a session's authority; a device that cannot confirm its own credential deletion can be made safe only by revoking that session server-side, which is not built in this phase.

Records with legal consequence pin the policy that produced them at creation
(data-model.md §5): jurisdiction, operating entity, PolicyPack version, and —
where the capability has elective options — the subject-selection version. The
pins are schema-enforced and immutable by trigger, and architecture test 21
refuses a merge that leaves one unpinned or a null unexplained.

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
