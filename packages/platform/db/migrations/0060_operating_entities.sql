-- 0060_operating_entities
--
-- The OperatingEntity dimension (ADR-0024; docs/architecture/operating-entity.md):
-- which legal person provides the service and bears responsibility. Two tables:
--
--   public.operating_entities             — the legal-person register
--   public.entity_jurisdiction_permissions — where an entity may lawfully
--                                            contract/operate, with the basis
--                                            reference for that claim
--
-- Neither table asserts any legal fact about any regulator. A row records a
-- DECISION taken by the platform operator, with a basis reference pointing at
-- the contract, legal opinion, or registration that carries the actual claim.
--
-- RLS decision — ALLOW-LISTED, deliberately (rls-allow-list.json):
-- these are PLATFORM-GLOBAL legal reference records, not tenant-owned domain
-- rows. They carry no tenant_id because one entity serves many tenants and
-- jurisdictions (ADR-0024: entity is orthogonal to tenant); a tenant predicate
-- would be a fabrication. Compensating controls, table by table below: write
-- paths are platform-operator-only through the operating-entity module's
-- PolicyService authorization port, karar_app DML is the minimum the use
-- cases need (no DELETE anywhere), and consumer read paths go through
-- purpose-built queries that expose only the resolution a caller needs
-- (effective entity, permitted-in-jurisdiction) — consumers never enumerate
-- the register.
--
-- Data lifecycle (ADR-0026, all six fields; canonical rows in
-- modules/operating-entity/MODULE.md, mirrored in
-- packages/platform/db/DATA_LIFECYCLE.md):
--   public.operating_entities
--     Subject relationship: NON_PERSONAL — legal persons, not natural ones;
--       data_protection_contact is a role mailbox reference, not a person.
--     Purpose:              legal accountability — who contracts, who is
--       liable, who releases disclosed data.
--     Classification:       INTERNAL.
--     Retention:            RETAIN_WITH_BASIS — corporate/legal records
--       outlive any product concern; PolicyPack owns any bounded number from
--       Phase 3.5, never a code constant.
--     Export treatment:     n/a — no subject owns a legal-person row.
--     Erasure strategy:     RETAIN_WITH_BASIS.
--   public.entity_jurisdiction_permissions
--     Subject relationship: NON_PERSONAL. Purpose: record where an entity may
--       lawfully operate, with the basis reference for the claim.
--     Classification: INTERNAL. Retention: RETAIN_WITH_BASIS (as above).
--     Export treatment: n/a. Erasure strategy: RETAIN_WITH_BASIS.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TABLE
-- public.entity_jurisdiction_permissions; DROP TABLE
-- public.operating_entities; — destroying the register that every pinned
-- operating_entity_at_creation reference resolves against, which is why it
-- would need the same review as destroying any legal record.

CREATE TABLE public.operating_entities (
  id                          uuid        PRIMARY KEY,
  legal_name                  text        NOT NULL CHECK (legal_name <> ''),
  registration_number         text        NOT NULL CHECK (registration_number <> ''),
  registered_jurisdiction_ref text        NOT NULL CHECK (registered_jurisdiction_ref <> ''),
  contracting_capacity        boolean     NOT NULL,             -- may it hold consumer contracts?
  data_protection_contact     text        NOT NULL CHECK (data_protection_contact <> ''),
  status                      text        NOT NULL
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'RETIRED')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL,
  -- One registration number per registry: the pair is what the real-world
  -- registry keys on, not the number alone. Named explicitly so the Prisma
  -- mapping can reference it without relying on default-name truncation.
  CONSTRAINT operating_entities_registry_key
    UNIQUE (registered_jurisdiction_ref, registration_number)
);

COMMENT ON TABLE public.operating_entities IS
  'Legal persons providing the service (ADR-0024). Platform-global register; '
  'allow-listed from RLS with compensating controls (rls-allow-list.json). '
  'A row asserts nothing about any regulator.';

CREATE TABLE public.entity_jurisdiction_permissions (
  id              uuid        PRIMARY KEY,
  entity_id       uuid        NOT NULL REFERENCES public.operating_entities (id),
  jurisdiction_ref text       NOT NULL CHECK (jurisdiction_ref <> ''),
  permitted_from  timestamptz NOT NULL,
  permitted_to    timestamptz     NULL,
  -- The contract, legal opinion, or registration carrying the actual claim.
  -- NOT NULL: a permission row without a basis would assert a legal fact
  -- from nowhere, which this dimension exists to prevent.
  basis_reference text        NOT NULL CHECK (basis_reference <> ''),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL,
  CHECK (permitted_to IS NULL OR permitted_to > permitted_from)
);

COMMENT ON TABLE public.entity_jurisdiction_permissions IS
  'Where an operating entity may lawfully contract/operate, per the '
  'referenced basis. Capability gating on these rows is Phase 3.5 '
  '(capability-registry.md); nothing enables on this table alone.';

CREATE INDEX entity_jurisdiction_permissions_entity_idx
  ON public.entity_jurisdiction_permissions (entity_id, jurisdiction_ref);

-- Grant convention (db/migrations/README.md): minimal DML, table by table.
-- No DELETE anywhere: these are legal records; retirement is a status, an
-- ended window is an updated permitted_to — never a vanished row.
GRANT SELECT, INSERT, UPDATE ON public.operating_entities TO karar_app;
GRANT SELECT, INSERT, UPDATE ON public.entity_jurisdiction_permissions TO karar_app;
