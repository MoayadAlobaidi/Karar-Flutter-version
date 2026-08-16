-- 0051_authorization_roles
--
-- public.roles + public.role_permissions — the role catalogue and its
-- permission mapping (authorization module; access-control.md §3). The eight
-- Phase 3 roles are seeded closed: USER, TENANT_MEMBER, TENANT_ADMIN,
-- SUPPORT, OPERATOR, SECURITY, PLATFORM_ADMIN, DISCLOSURE_APPROVER. A new
-- role is a reviewed forward migration plus the compile-time catalogue change
-- (DB seed == code catalogue is test-asserted).
--
-- scope records where an assignment of the role may bind (access-control.md:
-- two-layer staff access; tenancy.md §8): TENANT roles bind to one tenant and
-- NEVER carry platform authority; PLATFORM roles bind platform-wide
-- (tenant_id NULL on the assignment); BOTH is representable for future
-- delegated roles but no Phase 3 role uses it — deny-by-default keeps every
-- seeded role on the narrowest scope it needs.
--
-- The mapping is DENY-BY-DEFAULT: only grants the owning modules' MODULE.md
-- permission tables already document are seeded, each justified below.
-- Roles with NO grants are seeded deliberately and hold nothing:
--   USER            — a consumer's authority over their own data comes from
--                     identity + RLS self-scoping, not from an RBAC grant;
--                     the role exists so assignments are representable, and
--                     it grants no staff permission.
--   TENANT_MEMBER   — membership semantics live in tenant_members; the role
--                     grants no administrative permission.
--   SECURITY        — reads audit and security events (access-control.md §3);
--                     no permission-gated read path for those exists in
--                     Phase 3, so the role holds nothing yet. Absence denies.
--   DISCLOSURE_APPROVER — approves disclosure cases WITHOUT content access;
--                     amanat is a future capability, so nothing exists to
--                     grant. Notably absent even then: amanat.content.read
--                     will never exist for any role.
--
-- Seeded grants, with their documenting MODULE.md:
--   TENANT_ADMIN   → tenancy.member.read, tenancy.invitation.create,
--                    tenancy.invitation.revoke        (modules/tenancy)
--   SUPPORT        → users.profile.read               (modules/users)
--                    consent.status.read              (modules/consent)
--   OPERATOR       → controlplane.killswitch.operate  (modules/control-plane;
--                    restrict-only authority — the permission can only ever
--                    deny operations, never enable one)
--   PLATFORM_ADMIN → authorization.role.assign / .revoke (modules/authorization)
--                    entity.entity.manage / entity.migration.approve
--                                                     (modules/operating-entity)
--                    identity.session.revoke / identity.mfa.reset
--                                                     (modules/identity)
--                    users.status.update              (modules/users)
--                    consent.document.publish         (modules/consent)
--
-- RLS decision — ALLOW-LISTED (packages/platform/db/rls-allow-list.json),
-- both tables: static platform-global reference data with no subject or
-- tenant column; readable while resolving any principal, including staff
-- with no tenant binding. Compensating controls: karar_app holds SELECT
-- ONLY on both (writes are migration-only), pinned by 0054.
--
-- Data lifecycle (ADR-0026; canonical in modules/authorization/MODULE.md,
-- mirrored in packages/platform/db/DATA_LIFECYCLE.md), both tables:
--   Subject relationship: NON_PERSONAL — role names, scopes, and the
--     role→permission mapping; nothing re-identifies a person.
--   Purpose:              roles — name the grantable bundles of authority and
--     where they may bind; role_permissions — the reviewed mapping deny-by-
--     default resolves against.
--   Classification:       INTERNAL.
--   Retention:            life of the platform (access-control design
--     record); PolicyPack owns any bound (Phase 3.5).
--   Export treatment:     n/a — no subject owns a catalogue row.
--   Erasure strategy:     NON_PERSONAL_BY_DESIGN — catalogue rows carry no
--     personal data and no restorable linkage to any person.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE public.role_permissions,
-- then (after 0052's role_assignments) DROP TABLE public.roles — removing the
-- role catalogue, after which no assignment can resolve and everything denies.

CREATE TABLE public.roles (
  id          text        PRIMARY KEY
    CONSTRAINT roles_name_grammar_check
    CHECK (id ~ '^[A-Z][A-Z_]*$'),
  description text        NOT NULL
    CONSTRAINT roles_description_check CHECK (description <> ''),
  scope       text        NOT NULL
    CONSTRAINT roles_scope_check
    CHECK (scope IN ('PLATFORM', 'TENANT', 'BOTH')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.roles IS
  'INTERNAL. Role catalogue with binding scope (PLATFORM | TENANT | BOTH); '
  'seeded by migration only, mirrored by modules/authorization/domain/catalogue.ts. '
  'Allow-listed from RLS: static global reference data, SELECT-only for karar_app.';

CREATE TABLE public.role_permissions (
  role_id       text        NOT NULL
    CONSTRAINT role_permissions_role_id_fkey REFERENCES public.roles (id),
  permission_id text        NOT NULL
    CONSTRAINT role_permissions_permission_id_fkey REFERENCES public.permissions (id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE public.role_permissions IS
  'INTERNAL. Reviewed role -> permission mapping; the FK to permissions makes an '
  'absent permission structurally ungrantable. Seeded by migration only; '
  'allow-listed from RLS with SELECT-only karar_app grants.';

-- Read-only for the application on both tables (0054 pins the revokes).
GRANT SELECT ON public.roles            TO karar_app;
GRANT SELECT ON public.role_permissions TO karar_app;

INSERT INTO public.roles (id, description, scope) VALUES
  ('USER',                'Consumer principal; owns their own data. Own-data authority comes from identity + RLS, never from an RBAC grant.', 'PLATFORM'),
  ('TENANT_MEMBER',       'Member of a partner tenant; membership semantics live in tenant_members.',                                        'TENANT'),
  ('TENANT_ADMIN',        'Administers their tenant only; RLS-enforced; never platform authority.',                                          'TENANT'),
  ('SUPPORT',             'Reads customer metadata per permission; every read audited, including reads returning nothing.',                  'PLATFORM'),
  ('OPERATOR',            'Availability, kill switches, provider enablement — restrict-only authority.',                                     'PLATFORM'),
  ('SECURITY',            'Audit and security events; no content access. Holds nothing until those read paths exist.',                       'PLATFORM'),
  ('PLATFORM_ADMIN',      'Role and entity administration; grantable only by a PLATFORM_ADMIN peer (delegation rule).',                      'PLATFORM'),
  ('DISCLOSURE_APPROVER', 'Approves disclosure cases without seeing sealed content; amanat is future, so it holds nothing yet.',             'PLATFORM');

INSERT INTO public.role_permissions (role_id, permission_id) VALUES
  ('TENANT_ADMIN',   'tenancy.member.read'),
  ('TENANT_ADMIN',   'tenancy.invitation.create'),
  ('TENANT_ADMIN',   'tenancy.invitation.revoke'),
  ('SUPPORT',        'users.profile.read'),
  ('SUPPORT',        'consent.status.read'),
  ('OPERATOR',       'controlplane.killswitch.operate'),
  ('PLATFORM_ADMIN', 'authorization.role.assign'),
  ('PLATFORM_ADMIN', 'authorization.role.revoke'),
  ('PLATFORM_ADMIN', 'entity.entity.manage'),
  ('PLATFORM_ADMIN', 'entity.migration.approve'),
  ('PLATFORM_ADMIN', 'identity.session.revoke'),
  ('PLATFORM_ADMIN', 'identity.mfa.reset'),
  ('PLATFORM_ADMIN', 'users.status.update'),
  ('PLATFORM_ADMIN', 'consent.document.publish');
