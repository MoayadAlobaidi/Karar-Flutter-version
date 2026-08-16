-- 0050_authorization_permissions
--
-- public.permissions — the platform permission catalogue (authorization
-- module; modules/authorization/MODULE.md; access-control.md §2). One row per
-- permission name, `<capability>.<resource>.<action>`, and the name IS the
-- primary key: permissions are identities, not configuration. The catalogue
-- is SEEDED HERE, BY MIGRATION, with the Phase 3 set and nothing else — a new
-- permission is a reviewed forward migration plus the matching compile-time
-- catalogue change in modules/authorization/domain/catalogue.ts (a test
-- asserts DB seed == code catalogue, so the two cannot drift silently).
--
-- No wildcards, structurally: the grammar CHECK refuses '*' and anything that
-- is not exactly three lowercase dot-separated segments. Deny-by-default
-- needs an enumerable universe of permissions; a wildcard row would make the
-- universe unenumerable.
--
-- Permissions deliberately absent (access-control.md §2), restated where the
-- catalogue lives: no `amanat.content.read` for any role — not restricted,
-- ABSENT. No permission returns credential material. No permission grants a
-- cross-tenant consumer-data read (platform views arrive with the control
-- plane, via projections, under audited elevation). identity.account.disable
-- / identity.account.enable are documented in modules/identity/MODULE.md but
-- have no invoking surface in Phase 3, so they are NOT seeded — deny-by-
-- default means their absence denies; they arrive by forward migration with
-- the surface that calls them.
--
-- RLS decision — ALLOW-LISTED (packages/platform/db/rls-allow-list.json):
-- this is a static, platform-global reference catalogue. It names no subject
-- and no tenant — there is nothing to scope a policy on. Compensating
-- controls: karar_app holds SELECT ONLY (writes are migration-only, as
-- karar_migrator), and 0054 pins the revokes. The catalogue must be readable
-- while resolving ANY principal's authorization, including platform staff
-- with no tenant binding.
--
-- Data lifecycle (ADR-0026; canonical in modules/authorization/MODULE.md,
-- mirrored in packages/platform/db/DATA_LIFECYCLE.md):
--   Subject relationship: NON_PERSONAL — permission names and descriptions;
--     no subject data can be re-identified from a catalogue row.
--   Purpose:              enumerate the universe of grantable permissions so
--     deny-by-default has a closed world to deny against.
--   Classification:       INTERNAL.
--   Retention:            life of the platform; the catalogue is part of the
--     access-control design record. PolicyPack owns any bound (Phase 3.5).
--   Export treatment:     n/a — no subject owns a catalogue row.
--   Erasure strategy:     NON_PERSONAL_BY_DESIGN — rows hold permission
--     names, capability labels, and descriptions only; nothing links to a
--     person, so there is nothing to erase or anonymize.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.permissions
-- (after 0051's role_permissions, which references it) — removing the
-- catalogue deny-by-default resolves against, which denies everything.

CREATE TABLE public.permissions (
  id         text        PRIMARY KEY
    -- <capability>.<resource>.<action>, lowercase, exactly three segments.
    -- The grammar refuses wildcards by construction.
    CONSTRAINT permissions_name_grammar_check
    CHECK (id ~ '^[a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*$'),
  capability text        NOT NULL,
  description text       NOT NULL
    CONSTRAINT permissions_description_check CHECK (description <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The capability column is derivable from the name; the CHECK keeps the
  -- denormalization honest instead of trusting seed discipline.
  CONSTRAINT permissions_capability_prefix_check
    CHECK (capability = split_part(id, '.', 1))
);

COMMENT ON TABLE public.permissions IS
  'INTERNAL. Platform permission catalogue (<capability>.<resource>.<action>); '
  'seeded by migration only, mirrored by modules/authorization/domain/catalogue.ts. '
  'Allow-listed from RLS: static global reference data, SELECT-only for karar_app.';

-- Read-only for the application: the catalogue changes by migration, never
-- at runtime (0054 pins the revokes).
GRANT SELECT ON public.permissions TO karar_app;

-- The Phase 3 catalogue. Names match the owning modules' MODULE.md permission
-- tables exactly; each description names the operation the permission gates.
INSERT INTO public.permissions (id, capability, description) VALUES
  ('identity.session.revoke',        'identity',      'Revoke another principal''s sessions (admin mechanism; modules/identity/MODULE.md)'),
  ('identity.mfa.reset',             'identity',      'Reset another principal''s MFA enrolment (admin mechanism; modules/identity/MODULE.md)'),
  ('users.profile.read',             'users',         'Read a customer profile as staff — every read audited, including empty results (modules/users/MODULE.md)'),
  ('users.status.update',            'users',         'Change a customer account status as staff (modules/users/MODULE.md)'),
  ('tenancy.member.read',            'tenancy',       'List the members of one''s own tenant (modules/tenancy/MODULE.md)'),
  ('tenancy.invitation.create',      'tenancy',       'Invite an email into one''s own tenant (modules/tenancy/MODULE.md)'),
  ('tenancy.invitation.revoke',      'tenancy',       'Revoke an open invitation in one''s own tenant (modules/tenancy/MODULE.md)'),
  ('entity.entity.manage',           'entity',        'Maintain the operating-entity register: entities, jurisdiction permissions, licences, bindings (modules/operating-entity/MODULE.md)'),
  ('entity.migration.approve',       'entity',        'Approve and progress an entity-binding migration (modules/operating-entity/MODULE.md)'),
  ('consent.document.publish',       'consent',       'Create, classify, and publish legal-document versions (modules/consent/MODULE.md)'),
  ('consent.status.read',            'consent',       'Read a subject''s consent status as staff — audited (modules/consent/MODULE.md)'),
  ('controlplane.killswitch.operate','controlplane',  'Activate or deactivate a restrict-only kill switch (modules/control-plane/MODULE.md)'),
  ('authorization.role.assign',      'authorization', 'Grant a catalogue role to a principal (modules/authorization/MODULE.md; PLATFORM_ADMIN delegation rule applies)'),
  ('authorization.role.revoke',      'authorization', 'Revoke a principal''s role assignment (modules/authorization/MODULE.md)');
