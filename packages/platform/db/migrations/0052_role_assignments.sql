-- 0052_role_assignments
--
-- public.role_assignments — who holds which role, in which scope, since when,
-- granted by whom, and (immutably) when it was revoked (authorization module;
-- access-control.md §3, §7: roles are re-derived from the database per
-- request, so a revocation here is effective on the next authorization with
-- no cache to wait out).
--
-- Scope model: tenant_id NULL = a PLATFORM-scoped assignment (staff roles);
-- tenant_id set = a TENANT-scoped assignment that applies ONLY when the
-- caller's bound tenant matches (a tenant role never implies platform
-- authority, and never crosses tenants — resolver semantics test-asserted in
-- modules/authorization/__tests__). Role↔scope consistency (a TENANT role
-- must carry a tenant_id, a PLATFORM role must not) is enforced by the
-- AssignRole use case against the compile-time catalogue; a mis-scoped row
-- smuggled past it still never authorizes cross-scope, because the resolver
-- applies scope semantics at read time. Recorded as a decision: no
-- cross-table trigger duplicates the rule here.
--
-- RLS decision, recorded (this table is NOT allow-listed — it carries subject
-- data and gets ENABLE + FORCE):
--   SELECT — two arms:
--     (a) tenant arm: rows of the caller's own bound tenant, mirroring the
--         tenant_members roster (who holds which role in MY tenant is
--         tenant-visible; which principals may LIST it is Layer 1);
--     (b) self arm: the caller's own PLATFORM-scoped rows (tenant_id IS NULL
--         AND user_id = app.user_id).
--   The PolicyService resolver runs inside the CALLER's principal context and
--   resolves the CALLER's roles only (user_id = app.user_id), which both arms
--   cover: own tenant-scoped rows via (a), own platform-scoped rows via (b).
--   A caller's assignments in OTHER tenants are deliberately invisible in
--   this context — exactly the rows that must not apply there.
--   INSERT/UPDATE — the privileged-write pattern the identity module recorded
--   in 0030: the use case authorizes the ACTOR under the actor's own context
--   first (Layer 1: authorization.role.assign / .revoke plus the
--   PLATFORM_ADMIN delegation rule), then performs the write in a transaction
--   bound to the TARGET principal. The policies therefore bind writes to the
--   transaction's principal: a transaction can only ever create or revoke
--   assignments FOR the principal it is explicitly scoped to, never scatter
--   them across users. WHO may reach that write path is Layer 1's decision —
--   RLS bounds the blast radius and keeps accountability (granted_by /
--   revoked_by record the acting principal as data; the GUC is bound from
--   server-side session state, never client input — tenancy.md §6).
--   DELETE — no policy and no grant: a revoked assignment is evidence that
--   authority existed; removal is REVOKED status, never an absent row.
--
-- Immutable after revoke: the guard trigger permits exactly one UPDATE shape
-- — ACTIVE → REVOKED setting revoked_at / revoked_by / effective_to and
-- nothing else — and raises on any edit of a REVOKED row, any un-revoke, and
-- any DELETE/TRUNCATE, even for the table owner (two-mechanism reasoning,
-- data-model.md §10).
--
-- Uniqueness: at most one ACTIVE assignment per (user, role, scope). Partial
-- unique index NULLS NOT DISTINCT so two ACTIVE platform-scoped rows
-- (tenant_id NULL) collide too; revoked history rows never block a re-grant.
--
-- Data lifecycle (ADR-0026; canonical in modules/authorization/MODULE.md,
-- mirrored in packages/platform/db/DATA_LIFECYCLE.md):
--   Subject relationship: SUBJECT_DERIVED — the row records an administrative
--     decision about a principal; user_id/granted_by/revoked_by are opaque
--     identity references (no FK) that resolve to nothing once the referenced
--     subject is erased.
--   Purpose:              authorization accountability and resolution — who
--     could do what, in which scope, from when to when, granted and revoked
--     by whom.
--   Classification:       CONFIDENTIAL.
--   Retention:            from PolicyPack per jurisdiction (Phase 3.5);
--     interim policy-configuration placeholder 13 months after revocation,
--     never a code constant.
--   Export treatment:     included — a subject's export lists the roles they
--     held and hold; grantor references are opaque UUIDs.
--   Erasure strategy:     RETAIN_WITH_BASIS — who held privileged authority
--     is a security accountability record that survives account closure for
--     the retention period; subject linkage dies with the erased identity.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER + DROP FUNCTION +
-- DROP TABLE public.role_assignments — destroying the record of who held
-- authority, which is why it would need a security review, not an
-- engineering decision.

CREATE TABLE public.role_assignments (
  id             uuid        PRIMARY KEY,
  user_id        uuid        NOT NULL,  -- identity_accounts.id; raw cross-module reference, no FK
  role_id        text        NOT NULL
    CONSTRAINT role_assignments_role_id_fkey REFERENCES public.roles (id),
  tenant_id      uuid            NULL,  -- NULL = platform-scoped; raw cross-module reference, no FK
  status         text        NOT NULL DEFAULT 'ACTIVE'
    CONSTRAINT role_assignments_status_check
    CHECK (status IN ('ACTIVE', 'REVOKED')),
  granted_by     uuid        NOT NULL,  -- acting principal; raw reference, no FK
  reason         text        NOT NULL
    CONSTRAINT role_assignments_reason_check CHECK (reason <> ''),
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz     NULL,
  revoked_at     timestamptz     NULL,
  revoked_by     uuid            NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_assignments_effective_window_check
    CHECK (effective_to IS NULL OR effective_to > effective_from),
  -- Status and revocation evidence move together, both directions.
  CONSTRAINT role_assignments_revocation_consistency_check
    CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL)),
  CONSTRAINT role_assignments_revoker_consistency_check
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

COMMENT ON TABLE public.role_assignments IS
  'CONFIDENTIAL. Role assignments (tenant_id NULL = platform scope). RLS ENABLE+FORCE: '
  'tenant-roster + self-platform SELECT arms; writes bound to the transaction principal '
  '(privileged-write pattern, 0030). Immutable after revoke; no DELETE. '
  'Lifecycle: 0052 header + DATA_LIFECYCLE.md.';

-- At most one ACTIVE assignment per (user, role, scope) — NULLS NOT DISTINCT
-- so platform-scoped duplicates collide; revoked rows never block a re-grant.
CREATE UNIQUE INDEX role_assignments_active_unique
  ON public.role_assignments (user_id, role_id, tenant_id) NULLS NOT DISTINCT
  WHERE status = 'ACTIVE';

-- Resolution hot path: the caller's active assignments.
CREATE INDEX role_assignments_user_idx
  ON public.role_assignments (user_id, status);
CREATE INDEX role_assignments_tenant_idx
  ON public.role_assignments (tenant_id);

ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_assignments FORCE ROW LEVEL SECURITY;

-- (a) tenant arm — my tenant's assignments; (b) self arm — my own
-- platform-scoped assignments. Missing GUCs see nothing (fail closed).
CREATE POLICY role_assignments_visibility_select ON public.role_assignments
  FOR SELECT TO karar_app
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR (tenant_id IS NULL AND user_id = public.karar_current_user_id())
  );

-- Writes are bound to the TARGET principal the transaction is scoped to
-- (privileged-write pattern): an assignment row can only be created FOR the
-- bound principal, in the bound scope.
CREATE POLICY role_assignments_target_bound_insert ON public.role_assignments
  FOR INSERT TO karar_app
  WITH CHECK (
    user_id = public.karar_current_user_id()
    AND (
      tenant_id IS NULL
      OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );

CREATE POLICY role_assignments_target_bound_update ON public.role_assignments
  FOR UPDATE TO karar_app
  USING (user_id = public.karar_current_user_id())
  WITH CHECK (user_id = public.karar_current_user_id());

-- No DELETE policy. Grants below omit DELETE; 0054 pins the revoke.
GRANT SELECT, INSERT, UPDATE ON public.role_assignments TO karar_app;

-- Guard: the only permitted UPDATE is the revocation transition — ACTIVE →
-- REVOKED setting revoked_at / revoked_by / effective_to, everything else
-- exactly as granted. Revoked rows are immutable; DELETE and TRUNCATE raise
-- even for the table owner.
CREATE FUNCTION public.role_assignments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'role_assignments rows are authorization evidence: DELETE is not permitted, even for the table owner (revocation is a status)'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF OLD.status = 'REVOKED' THEN
    RAISE EXCEPTION 'role_assignment % is revoked and immutable; grant a successor assignment instead',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.status IS DISTINCT FROM 'REVOKED' THEN
    RAISE EXCEPTION 'the only permitted update of role_assignment % is the revocation transition (ACTIVE -> REVOKED)',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR NEW.effective_to IS NULL THEN
    RAISE EXCEPTION 'revoking role_assignment % requires revoked_at, revoked_by, and effective_to',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  IF NEW.id             IS DISTINCT FROM OLD.id
    OR NEW.user_id        IS DISTINCT FROM OLD.user_id
    OR NEW.role_id        IS DISTINCT FROM OLD.role_id
    OR NEW.tenant_id      IS DISTINCT FROM OLD.tenant_id
    OR NEW.granted_by     IS DISTINCT FROM OLD.granted_by
    OR NEW.reason         IS DISTINCT FROM OLD.reason
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'role_assignment % may only be revoked, never edited; the grant columns are immutable',
      OLD.id USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER role_assignments_guard
  BEFORE UPDATE OR DELETE ON public.role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.role_assignments_guard();

CREATE FUNCTION public.role_assignments_no_truncate() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'role_assignments rows are authorization evidence: TRUNCATE is not permitted, even for the table owner'
    USING ERRCODE = 'raise_exception';
END;
$$;

CREATE TRIGGER role_assignments_no_truncate
  BEFORE TRUNCATE ON public.role_assignments
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.role_assignments_no_truncate();
