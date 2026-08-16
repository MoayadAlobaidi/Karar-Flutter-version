# Multi-Tenancy and Isolation

**ADRs:** 0008, 0022 · **Phase:** 3 (not 11) — implemented in Phase 3; implemented-state notes are marked per section

---

## 1. `tenant_id` from day one

Every tenant-owned table carries `tenant_id` from the first migration. Retrofitting tenancy means touching every table, every query, every index, and every test in a system that already holds data — and the retrofit is never quite complete.

The legacy is the demonstration. It added RLS across three migrations (V9, V30, V40) and, at HEAD, **24 of 69 tables still have no RLS** — 13 correctly public, 5 documented bootstrap exclusions, and **6 unexplained, with `users` among them**. Four tenant tables were passed over by V40 *without comment*: no migration, document, or test states a position either way.

That is the cost of Phase 11. Karar pays it at Phase 3 — and has: every Phase 3 table shipped in its own migration with RLS enabled and FORCEd, or with a written allow-list justification (§4). There was no retrofit because there was nothing to retrofit onto.

## 2. Four layers, none sufficient alone

```mermaid
graph TB
    R[Request] --> L1[1 · PolicyService / RBAC<br/>may this actor do this?]
    L1 --> L2[2 · Tenant-scoped repositories<br/>explicit filters inside the principal-context transaction]
    L2 --> L3[3 · PostgreSQL RLS<br/>THE BOUNDARY]
    L3 --> DB[(data)]
    L4[4 · Adversarial cross-tenant tests in CI] -.continuously verifies.-> L3
    style L3 fill:#e8f4e8
    style L4 fill:#fff4e8
```

### Layer 1 — RBAC

Permission checks in the use case. Answers *"may this actor perform this operation?"* — not *"whose data is this?"*

### Layer 2 — tenant-scoped repositories

Application-layer scoping in the repository. Convenient, and it catches honest mistakes early.

> **The repository filter is not the isolation mechanism.** It is convenience on top of RLS, which is the real boundary.

Stated explicitly because it is the most likely thing to be misremembered. An application-layer filter is defeated by any code path that forgets it — and there is always one.

**Implemented in Phase 3** as explicit `where` filters inside each repository's `withPrincipalContext` transaction, not as a Prisma client extension — the extension mechanism was considered and skipped because the transaction wrapper (§3) already forces every tenant-scoped query through one funnel, and a second implicit filter layer would obscure which mechanism a test is actually proving. The layer's status is unchanged: convenience, never the boundary.

### Layer 3 — PostgreSQL RLS

The actual boundary.

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON transactions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

The predicate form is deliberate (this is the landed Phase 3 pattern): `current_setting(name, true)` returns NULL instead of erroring when the GUC was never set, and `NULLIF(…, '')` treats the empty string — the wrapper's explicit "absent" binding (§3) — the same way. Either way the comparison is against NULL and matches no rows: **a transaction without principal context sees nothing**, rather than depending on which failure mode PostgreSQL happened to take.

| Rule | Why |
|---|---|
| Application role has **no `BYPASSRLS`** | A superuser connection makes every policy decorative |
| `FORCE` as well as `ENABLE` | Without `FORCE`, the table owner bypasses the policy |
| `SET LOCAL app.tenant_id` per transaction | Transaction-scoped; cannot leak across a pooled connection |
| Migrations run as a **separate role** | Migration needs privileges the application must never hold |
| `app.tenant_id` bound **from the caller's own record**, inside the transaction | **Never from client input.** Inherited from the legacy, which got this exactly right |

### Layer 4 — adversarial tests

CI creates two tenants with real data and asserts that tenant A cannot read, update, or delete tenant B's rows through any repository method or endpoint.

**Tests assert on non-empty expected data.** This is not pedantry. The legacy's tenant member roster has no bank-admin policy, so it returns empty for *everyone* — and, as its own audit records, *"an empty roster is indistinguishable from correct isolation, so the isolation claim on that endpoint has never actually been tested."* A test that passes because nothing came back has verified nothing.

**UPDATE and DELETE are exercised, not only SELECT.** The legacy proves isolation for 3 of 45 tables and *"UPDATE has never been exercised at all."*

**Implemented in Phase 3**, twice over: each module carries its own adversarial integration suite (for example `modules/tenancy/__tests__/tenancy-isolation.integration.test.ts`), and a cross-cutting suite at `tests/security/` (`cross-tenant-isolation` and `privilege-abuse`) attacks the module boundaries together on a scratch database. Both follow the same discipline: two tenants seeded with real rows, each tenant's own data proven **non-empty first**, then cross-tenant SELECT/INSERT/UPDATE/DELETE denied at the SQL, repository, and use-case layers — plus the FORCE-vs-owner probe, pooled-connection GUC hygiene across both the pg adapter and the Prisma client, privilege-escalation probes, and append-only ledgers holding even against the migrator role.

## 3. The tenant transaction wrapper

```ts
await withTenant(prisma, tenantId, userId, async (tx) => { /* every tenant-scoped query */ })
```

issuing:

```sql
BEGIN;
SELECT set_config('app.tenant_id', $1, true),  -- SET LOCAL semantics
       set_config('app.user_id',   $2, true), …;
-- queries
COMMIT;
```

> **Documented cost.** Prisma cannot set a session GUC per query outside an interactive transaction. All tenant-scoped queries therefore route through this wrapper, which costs connection overhead and constrains query style.

Accepted and recorded rather than worked around. The alternative is trusting the application layer, which is the failure mode RLS exists to prevent.

**Implemented in Phase 3** as `withPrincipalContext` ([`packages/platform/src/db/principal-context.ts`](../../packages/platform/src/db/principal-context.ts)), with `withTenant` as sugar for the common tenant+user case. The landed mechanism, precisely:

- **Four GUCs, one statement.** The transaction's first statement is a single parameterized `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), …` also binding `app.session_id` and `app.request_id`. `is_local => true` is `SET LOCAL`: the values die with the transaction, so a pooled connection cannot carry one caller's tenant into the next caller's query. GUC *names* are compile-time constants; *values* always travel as bind parameters.
- **Fail closed before any query.** Every call site declares which context keys it requires (default: `tenantId` and `userId`); a missing or malformed required value throws a typed `PrincipalContextError` before a connection is checked out. There is no fallback context and no partial execution. Call sites that legitimately run narrower (the token-scoped invitation lookup) must say so explicitly.
- **Absent optional keys bind to `''`, never skip.** Binding the empty string locally shadows any stale session-level value left on the pooled connection. Policies read GUCs via `NULLIF(current_setting(name, true), '')`, so an unset or empty GUC compares as NULL and matches **no rows** — unset context fails closed at the policy, not only in code.
- **Both persistence paths.** The wrapper runs over the Prisma handle (interactive transaction) and over the raw `PostgresPersistenceAdapter` identically; identity's account-keyed tables use the same GUCs through `public.karar_current_user_id()`.
- **Guarded by architecture test 9** (tenant scoping): persistence code touching principal-scoped tables must run under the principal context, and `SET SESSION` / `set_config(…, false)` on any `app.*` GUC is forbidden everywhere — a session-scoped binding would survive the transaction and defeat the pooling guarantee.

## 4. RLS coverage guard — architecture test 22

Every table in `public` is RLS-enabled **and** FORCEd, or appears on an explicit allow-list with a stated reason.

The guard detects **three** failure shapes:

| Shape | Legacy instance |
|---|---|
| **No RLS at all** | 24 tables; the legacy's guard did not test for this (RLS-01) |
| **Enabled but no policy** | The only shape the legacy's guard tested |
| **FORCEd but not enabled** | The admin audit log itself (RLS-02) — *"no existing guard detects that shape"* |

A new table shipping with no RLS **fails the build**. The allow-list is the only escape, and it requires a written reason and a reviewer.

**Implemented in Phase 3** — test 22 is active. The allow-list is [`packages/platform/db/rls-allow-list.json`](../../packages/platform/db/rls-allow-list.json): one entry per table with the reason and its compensating controls, and the guard fails on any table that is neither ENABLE+FORCE nor listed. Current coverage (CODE): 37 tables across the `public`, `platform`, and `audit` schemas — 17 RLS-enabled **and** FORCEd, 27 allow-listed, 7 deliberately both. The 7 are identity's bootstrap-armed tables (accounts, credentials, verification/reset codes, refresh-token lineage, the security ledger): authentication begins before a principal exists, so their policies carry an explicit no-principal arm — recorded in the allow-list with justification — while any transaction that *has* a user context stays confined to its own rows. Sessions and MFA tables carry no bootstrap arm at all.

## 5. Tenant kinds

| Kind | Description | Operating entity |
|---|---|---|
| First-party | Karar's own consumer product | Karar's entity — Karar is controller |
| White-label | A partner's branded deployment | **The partner's entity — the partner is controller, Karar is processor** |
| Internal | Demo, test, support | Karar's entity |

The controller/processor inversion is the central legal fact of a white-label deal, and it is **configuration, not code**. See [`operating-entity.md`](operating-entity.md).

## 6. Tenant resolution

Resolved at the infrastructure edge, before any use case runs, from — in order — the authenticated principal's tenant binding, the API client's tenant binding, or the request host for branded domains.

**Never from a client-supplied header or body field.** A `?tenantId=` parameter is not accepted anywhere, and its absence is asserted by test.

## 7. Cross-tenant operations

Some operations legitimately span tenants: platform metrics, capability availability management, projections.

They run through the **control plane**, against **projections**, under an explicitly elevated context that is audited and never available to a consumer request path. Elevation is scoped to the narrowest set of reads required — not the whole transaction.

The legacy's counter-example: its invitation redemption *"elevates the whole transaction to administrator authority rather than the three reads that need it"* (RLS-04).

## 8. Staff access — two layers, not one

The legacy's finding, quoted because it is the clearest statement of the problem:

> There is no endpoint that returns one customer's transactions to a staff member. **The database, however, grants a platform administrator session SELECT on every consumer financial table; only the absence of an endpoint prevents the read.** That is one layer, not two.

**Karar:**

- RLS plus revoked grants make the database the **second** layer. An admin session that reaches the database cannot read consumer financial rows.
- Admin data comes from **projections** in `readmodel`, which carry aggregates and operational state — never `SEALED` data, and never raw financial detail beyond what the role's permission grants.
- **Every staff read of a customer record is audited**, including reads that return nothing.
- For sealed data the rule is absolute: **no admin role holds a content-read permission at any level.**

## 9. The topology ladder does not change the domain

| Rung | Isolation |
|---|---|
| **L0** | Shared database, `tenant_id` + RLS |
| **L1** | Dedicated database, shared platform |
| **L2** | Dedicated deployment |
| **L3** | Dedicated cloud account/project/subscription, own KMS, IdP, connectors |

**Domain code is identical at every rung — on any approved cloud provider**, because it never names a database, provider, region, or key. A tenant maps to a `DeploymentProfile`; movement between rungs or providers is infrastructure resolution and Terraform. See [`deployment-topology.md`](deployment-topology.md) and [`infrastructure-portability.md`](infrastructure-portability.md).

## 10. What tenancy does not do

| | Why |
|---|---|
| Give a tenant admin access to consumer financial detail | Per-entitlement only, audited, never `SEALED` |
| Allow a tenant to enable a capability | Availability is platform-controlled and restrict-only |
| Allow a client to assert its own tenant | Resolved from the principal, at the edge |
| Make RLS optional in development | The same policies run locally. A control tested only in production is a control tested in production |
