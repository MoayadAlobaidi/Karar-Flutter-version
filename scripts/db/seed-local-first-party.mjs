#!/usr/bin/env node
// Local/dev seed: the synthetic FIRST-PARTY tenant (Phase 3.5, KAR-RSK-021).
//
// Creates the tenant row that KARAR_FIRST_PARTY_TENANT_ID names (local
// default: the documented synthetic id exported by the platform config), so
// GrantFirstPartyMembership and the bootstrap flow have a first-party tenant
// to bind against in local development.
//
// WHY DIRECT SQL AS THE BOOTSTRAP SUPERUSER (justification, stated once):
// tenant provisioning is a control-plane operation with NO runtime path in
// this phase — migration 0041 grants karar_app SELECT only on public.tenants,
// and FORCEd RLS with no INSERT policy blocks every non-BYPASSRLS role
// including the migrator. The tenancy test fixtures seed tenants the same
// way for the same reason. Membership creation is deliberately NOT done
// here: that is the audited GrantFirstPartyMembership use case's job,
// invoked by suites and (Phase 4 entry work) by the registration flow.
//
// Operating-entity default assignment: NOT seeded here. Creating an
// operating entity requires the operating-entity module's use cases
// (PolicyService authorization + audit + repositories) — not trivially
// invocable from a seed script; wiring tenants.default_operating_entity_id
// is documented as a lead-integration step (modules/tenancy/MODULE.md).
//
// Idempotent: an existing tenant row is verified (FIRST_PARTY + ACTIVE) and
// left untouched; a conflicting row fails loudly.
//
// Usage:
//   POSTGRES_PORT=5433 KARAR_ENV=local node scripts/db/seed-local-first-party.mjs

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const platformDist = join(root, 'packages', 'platform', 'dist');

const { LOCAL_FIRST_PARTY_TENANT_ID } = await import(join(platformDist, 'config', 'index.js'));
const { LocalPostgresConnectionProfile, PostgresPersistenceAdapter } = await import(
  join(platformDist, 'db', 'index.js')
);

const env = process.env.KARAR_ENV ?? 'local';
if (env !== 'local' && env !== 'dev') {
  console.error(
    `seed-local-first-party: refusing to run with KARAR_ENV=${env} — this seed is for local/dev only; ` +
      'real environments provision their first-party tenant through the control plane.',
  );
  process.exit(1);
}

const tenantId = process.env.KARAR_FIRST_PARTY_TENANT_ID ?? LOCAL_FIRST_PARTY_TENANT_ID;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_SHAPE.test(tenantId)) {
  console.error('seed-local-first-party: KARAR_FIRST_PARTY_TENANT_ID must be a UUID.');
  process.exit(1);
}

const adapter = new PostgresPersistenceAdapter(
  LocalPostgresConnectionProfile.fromEnv('superuser', {}),
);

try {
  const existing = await adapter.query('SELECT type, status FROM public.tenants WHERE id = $1', [
    tenantId,
  ]);
  const row = existing.rows[0];
  if (row !== undefined) {
    if (row.type !== 'FIRST_PARTY' || row.status !== 'ACTIVE') {
      console.error(
        `seed-local-first-party: tenant ${tenantId} exists but is ${row.type}/${row.status} — ` +
          'refusing to touch it; resolve the conflict manually.',
      );
      process.exit(1);
    }
    console.log(`seed-local-first-party: first-party tenant ${tenantId} already present.`);
  } else {
    await adapter.query(
      `INSERT INTO public.tenants (id, type, name, status)
       VALUES ($1, 'FIRST_PARTY', 'Karar', 'ACTIVE')`,
      [tenantId],
    );
    console.log(`seed-local-first-party: created first-party tenant ${tenantId}.`);
  }
  console.log(
    'seed-local-first-party: note — tenants.default_operating_entity_id stays NULL here; ' +
      'binding an operating entity is a lead-integration step through the operating-entity module.',
  );
} finally {
  await adapter.end();
}
