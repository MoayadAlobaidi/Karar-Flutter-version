-- 0081_tenants_member_select
--
-- MEMBER-arm SELECT policy on public.tenants (tenancy module;
-- modules/tenancy/MODULE.md; Phase 3.5 session-tenant binding, KAR-RSK-021).
--
-- WHY THIS ARM EXISTS: the 0080 self-arm lets an authenticated-but-unbound
-- principal list their own membership rows, but a membership row carries only
-- tenant_id — and the 0041 policy exposes a tenants row only when
-- app.tenant_id already names it, which is circular before binding. Tenant
-- SELECTION needs the tenant's safe display fields (name) and its status
-- (a SUSPENDED/CLOSED tenant must invalidate the choice and the binding), so
-- resolution with only app.user_id bound must be able to read exactly the
-- tenants the principal actively belongs to. Binding app.tenant_id
-- speculatively to fetch these rows would fabricate the very context the
-- session-binding design says may come only from the session row; this arm
-- is the honest alternative.
--
-- Policy shape (ORed with 0041's own-row arm): SELECT passes when EITHER
--   * id = app.tenant_id (0041 — the bound tenant's own row), OR
--   * an ACTIVE tenant_members row links this tenant to app.user_id (this
--     arm). The subquery evaluates under tenant_members' OWN policies, where
--     the 0080 self-arm admits precisely the caller's rows — a caller with
--     no user GUC sees nothing here either (fail closed by composition).
--
-- ADVERSARIAL EXPECTATION (asserted in
-- modules/tenancy/__tests__/tenant-context.integration.test.ts, non-empty
-- case FIRST): a principal bound only to app.user_id reads the tenant rows
-- of their own ACTIVE memberships non-empty, and reads ZERO tenant rows they
-- hold no active membership in — the register is never enumerable. Only
-- ACTIVE memberships open the arm: an INVITED/SUSPENDED/REMOVED membership
-- exposes nothing.
--
-- Data lifecycle: unchanged — no new table, no new column; the 0041/ADR-0026
-- declaration for public.tenants continues to apply.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be
-- DROP POLICY tenants_member_select ON public.tenants — after which tenant
-- selection cannot display or status-check candidate tenants.

CREATE POLICY tenants_member_select ON public.tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.tenant_members m
       WHERE m.tenant_id = public.tenants.id
         AND m.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
         AND m.state = 'ACTIVE'
    )
  );
