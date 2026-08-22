/**
 * Shared live-PostgreSQL fixtures for the cross-cutting security suites.
 *
 * Same discipline as the module adversarial suites (modules/tenancy/__tests__/
 * fixtures.ts): each suite bootstraps its own scratch database from zero and
 * drops it afterwards; tenants and founding members are seeded as the compose
 * bootstrap superuser (tenant provisioning is a control-plane operation, never
 * a runtime path); EVERYTHING else is written as karar_app under the exact
 * principal context the runtime uses — the seeding itself is the positive
 * control that the RLS write policies admit the legitimate shape.
 *
 * Every identifier and value below is deliberately synthetic: patterned UUIDs,
 * `.invalid`-TLD addresses (RFC 2606), and hash-shaped strings that are
 * visibly not real credentials. Nothing here may ever resemble a live secret.
 */

import pg from 'pg';

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  dropScratchDatabase,
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
  type ConnectionProfile,
  type DatabaseRole,
  type TransactionClient,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { skipUnlessDatabaseRequired } from '@karar/platform/dist/db/index.js';

// --- Synthetic principals (patterned, obviously non-production) -------------

export const TENANT_A = TenantId.of('aaaa0001-0000-4000-8000-000000000001');
export const TENANT_B = TenantId.of('bbbb0002-0000-4000-8000-000000000002');
export const USER_A1 = UserId.of('aaaa0001-0001-4000-8000-0000000000a1');
export const USER_A2 = UserId.of('aaaa0001-0002-4000-8000-0000000000a2');
export const USER_B1 = UserId.of('bbbb0002-0001-4000-8000-0000000000b1');
export const USER_B2 = UserId.of('bbbb0002-0002-4000-8000-0000000000b2');

export const ENTITY_ID = 'e0000000-0000-4000-8000-00000000000e';
export const DOCUMENT_ID = 'd0000000-0000-4000-8000-00000000000d';
export const DOCUMENT_VERSION_ID = 'd0000000-0000-4000-8000-0000000000d1';

export const INVITATION_A = 'aaaa0001-1111-4000-8000-000000000011';
export const INVITATION_B = 'bbbb0002-1111-4000-8000-000000000011';
export const ASSIGNMENT_A1_TENANT = 'aaaa0001-2222-4000-8000-000000000021';
export const ASSIGNMENT_A1_PLATFORM = 'aaaa0001-2222-4000-8000-000000000022';
export const ASSIGNMENT_B1_TENANT = 'bbbb0002-2222-4000-8000-000000000021';
export const CONSENT_A1 = 'aaaa0001-3333-4000-8000-000000000031';
export const CONSENT_B1 = 'bbbb0002-3333-4000-8000-000000000031';

/** sha256-shaped, visibly synthetic (a real token hash is never a repeat pattern). */
export const INVITATION_TOKEN_HASH_A = 'a1'.repeat(32);
export const INVITATION_TOKEN_HASH_B = 'b2'.repeat(32);
/** argon2-PHC-shaped but visibly fake: never verifiable, never a live secret. */
export const SYNTHETIC_PASSWORD_HASH =
  '$argon2id$v=19$m=1,t=1,p=1$c3ludGhldGljLXNhbHQ$c3ludGhldGljLW5vdC1hLXJlYWwtaGFzaA';

export const tenantA = TenantId.toString(TENANT_A);
export const tenantB = TenantId.toString(TENANT_B);
export const userA1 = UserId.toString(USER_A1);
export const userA2 = UserId.toString(USER_A2);
export const userB1 = UserId.toString(USER_B1);
export const userB2 = UserId.toString(USER_B2);

// --- Connection plumbing (ConnectionProfile.fromEnv; ports never hardcoded) --

export const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

export async function probePostgres(): Promise<string | null> {
  const client = new pg.Client({
    host: superuserMaintenanceProfile.host,
    port: superuserMaintenanceProfile.port,
    database: superuserMaintenanceProfile.database,
    user: superuserMaintenanceProfile.user,
    password: superuserMaintenanceProfile.password.unwrap(),
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (error) {
    await client.end().catch(() => {});
    const reason = error instanceof Error ? error.message : String(error);
    // ROUTED THROUGH THE GLOBAL REQUIREMENT, at the definition rather than at
    // each call site, so a suite added later inherits it. The run-level setup
    // opens a bare socket and therefore cannot see a wrong credential, a
    // missing database, or an exhausted connection limit; this probe opens a
    // real authenticated connection and hands what it finds to the one
    // decision that knows whether the run declared the database required.
    skipUnlessDatabaseRequired('security suite', reason);
    return reason;
  }
}

export function skipBanner(suite: string, why: string): string {
  return [
    '='.repeat(76),
    `${suite} SKIPPED — PostgreSQL is not reachable at ` +
      `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
    `(${why})`,
    'These suites are the cross-cutting adversarial evidence for Phase 3',
    'isolation; a skipped run proves nothing. Start the database and rerun:',
    '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
    `${'='.repeat(76)}\n`,
  ].join('\n');
}

export function appProfile(database: string): ConnectionProfile {
  const base = LocalPostgresConnectionProfile.fromEnv('app', { database });
  return { ...base, poolMax: 1 }; // one session, so pooled-reuse probes are honest
}

export function buildHandle(database: string): PrismaHandle {
  return createPrismaClient(appProfile(database));
}

export async function withAdapter<T>(
  database: string,
  role: DatabaseRole,
  fn: (adapter: PostgresPersistenceAdapter) => Promise<T>,
): Promise<T> {
  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv(role, { database }),
  );
  try {
    return await fn(adapter);
  } finally {
    await adapter.end();
  }
}

export const BIND_GUCS = `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`;

export interface GucContext {
  readonly tenantId?: string;
  readonly userId?: string;
}

/** Runs statements as karar_app inside ONE transaction with the given (possibly absent) GUCs. */
export async function asApp<T>(
  database: string,
  guc: GucContext,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return withAdapter(database, 'app', (adapter) =>
    adapter.withTransaction(async (tx) => {
      await tx.query(BIND_GUCS, [guc.tenantId ?? '', guc.userId ?? '']);
      return fn(tx);
    }),
  );
}

/** The error (never the value) of a statement expected to be refused. */
export async function refusalOf(
  database: string,
  guc: GucContext,
  sql: string,
  params: unknown[] = [],
): Promise<unknown> {
  return asApp(database, guc, (tx) =>
    tx.query(sql, params).then(
      () => null,
      (error: unknown) => error,
    ),
  );
}

// --- Provisioning and the two-tenant seed ------------------------------------

/** Bootstrap + migrate from zero, then seed tenants and founding members (superuser: control-plane operations). */
export async function provisionSecurityDatabase(database: string): Promise<void> {
  await bootstrapRolesAndDatabase({ database });
  await withAdapter(database, 'migrator', async (adapter) => {
    await migrateToLatest({ adapter });
  });
  await withAdapter(database, 'superuser', async (adapter) => {
    for (const [id, name] of [
      [tenantA, 'Security Suite Tenant A (synthetic)'],
      [tenantB, 'Security Suite Tenant B (synthetic)'],
    ]) {
      await adapter.query(
        `INSERT INTO public.tenants (id, type, name, status) VALUES ($1, 'FIRST_PARTY', $2, 'ACTIVE')`,
        [id, name],
      );
    }
    const members: Array<[string, string, string, string]> = [
      ['aaaa0001-4444-4000-8000-000000000041', tenantA, userA1, 'TENANT_ADMIN'],
      ['aaaa0001-4444-4000-8000-000000000042', tenantA, userA2, 'MEMBER'],
      ['bbbb0002-4444-4000-8000-000000000041', tenantB, userB1, 'TENANT_ADMIN'],
      ['bbbb0002-4444-4000-8000-000000000042', tenantB, userB2, 'MEMBER'],
    ];
    for (const [id, tenantId, userId, roleHint] of members) {
      await adapter.query(
        `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
         VALUES ($1, $2, $3, $4, 'ACTIVE', now())`,
        [id, tenantId, userId, roleHint],
      );
    }
  });
}

/**
 * Seeds the tenant-scoped rows AS karar_app under the runtime principal
 * contexts — the positive control that every WITH CHECK policy admits the
 * legitimate shape. Both suites call this; the isolation suite additionally
 * asserts the non-empty reads FIRST, before any denial.
 */
export async function seedTenantData(database: string): Promise<void> {
  // Profiles: self-insert policy — one context per subject.
  const profiles: Array<[string, string, string]> = [
    [userA1, tenantA, 'Security Suite Alice (synthetic)'],
    [userA2, tenantA, 'Security Suite Amir (synthetic)'],
    [userB1, tenantB, 'Security Suite Badr (synthetic)'],
    [userB2, tenantB, 'Security Suite Bushra (synthetic)'],
  ];
  for (const [userId, tenantId, displayName] of profiles) {
    await asApp(database, { tenantId, userId }, (tx) =>
      tx.query(
        `INSERT INTO public.user_profiles (user_id, tenant_id, display_name, locale)
         VALUES ($1, $2, $3, 'en')`,
        [userId, tenantId, displayName],
      ),
    );
  }

  // Invitations: creator-bound insert inside the creator's own tenant.
  const invitations: Array<[string, string, string, string, string]> = [
    [
      INVITATION_A,
      tenantA,
      userA1,
      'invite-target-a@security-suite.invalid',
      INVITATION_TOKEN_HASH_A,
    ],
    [
      INVITATION_B,
      tenantB,
      userB1,
      'invite-target-b@security-suite.invalid',
      INVITATION_TOKEN_HASH_B,
    ],
  ];
  for (const [id, tenantId, createdBy, email, tokenHash] of invitations) {
    await asApp(database, { tenantId, userId: createdBy }, (tx) =>
      tx.query(
        `INSERT INTO public.tenant_invitations (id, tenant_id, email, token_hash, expires_at, created_by)
         VALUES ($1, $2, $3, $4, now() + interval '1 day', $5)`,
        [id, tenantId, email, tokenHash, createdBy],
      ),
    );
  }

  // Role assignments: writes are bound to the transaction's principal
  // (privileged-write pattern, migration 0052) — the context IS the target.
  const tenantAssignments: Array<[string, string, string, string]> = [
    [ASSIGNMENT_A1_TENANT, userA1, 'TENANT_ADMIN', tenantA],
    [ASSIGNMENT_B1_TENANT, userB1, 'TENANT_ADMIN', tenantB],
  ];
  for (const [id, userId, roleId, tenantId] of tenantAssignments) {
    await asApp(database, { tenantId, userId }, (tx) =>
      tx.query(
        `INSERT INTO public.role_assignments (id, user_id, role_id, tenant_id, granted_by, reason, effective_from)
         VALUES ($1, $2, $3, $4, $2, 'security-suite seed (synthetic)', now())`,
        [id, userId, roleId, tenantId],
      ),
    );
  }
  // A platform-scoped assignment: tenant_id NULL, user-only context.
  await asApp(database, { userId: userA1 }, (tx) =>
    tx.query(
      `INSERT INTO public.role_assignments (id, user_id, role_id, tenant_id, granted_by, reason, effective_from)
       VALUES ($1, $2, 'SUPPORT', NULL, $2, 'security-suite seed (synthetic)', now())`,
      [ASSIGNMENT_A1_PLATFORM, userA1],
    ),
  );

  // Consent prerequisites are platform-global catalogue rows (allow-listed;
  // Layer 1 gates the runtime path): entity, document, version — then the
  // real classify+publish lifecycle UPDATE on the draft version.
  await asApp(database, {}, async (tx) => {
    await tx.query(
      `INSERT INTO public.operating_entities
         (id, legal_name, registration_number, registered_jurisdiction_ref, contracting_capacity,
          data_protection_contact, status, updated_at)
       VALUES ($1, 'Security Suite Entity (synthetic)', 'SYNTH-0001', 'jurisdiction:synthetic',
               true, 'dpo@security-suite.invalid', 'ACTIVE', now())`,
      [ENTITY_ID],
    );
    await tx.query(
      `INSERT INTO public.legal_documents (id, entity_id, jurisdiction_ref, purpose_refs, kind)
       VALUES ($1, $2, 'jurisdiction:synthetic', ARRAY['purpose:security-suite'], 'SECURITY_SUITE_TERMS')`,
      [DOCUMENT_ID, ENTITY_ID],
    );
    await tx.query(
      `INSERT INTO public.legal_document_versions (id, document_id, version, content_hash, storage_ref, author)
       VALUES ($1, $2, '1.0.0', $3, 'storage://security-suite/synthetic-terms-1.0.0', 'security-suite')`,
      [DOCUMENT_VERSION_ID, DOCUMENT_ID, 'c3'.repeat(32)],
    );
    await tx.query(
      `UPDATE public.legal_document_versions
          SET classification = 'NO_USER_ACTION_REQUIRED', reviewer = 'security-suite reviewer',
              reason = 'synthetic fixture publication', effective_at = now(), published_at = now()
        WHERE id = $1`,
      [DOCUMENT_VERSION_ID],
    );
  });

  // Consent grants: subject records under BOTH principal GUCs.
  const grants: Array<[string, string, string]> = [
    [CONSENT_A1, userA1, tenantA],
    [CONSENT_B1, userB1, tenantB],
  ];
  for (const [id, userId, tenantId] of grants) {
    await asApp(database, { tenantId, userId }, (tx) =>
      tx.query(
        // The pinning block (migration 0086) is not optional for a row created
        // from Phase 3.5 on: the seed pins a synthetic pack version and states
        // the no-elective-options case explicitly.
        `INSERT INTO public.consent_grants
           (id, user_id, tenant_id, operating_entity_id, jurisdiction_ref, purpose_ref,
            consent_version, legal_document_version_id, granted_at, status, evidence_reference,
            policy_pack_version, policy_pack_pin_state, subject_policy_selection_pin_state)
         VALUES ($1, $2, $3, $4, 'jurisdiction:synthetic', 'purpose:security-suite',
                 '1.0.0', $5, now(), 'ACTIVE', 'request:security-suite-seed',
                 'zz-security/v1', 'PINNED', 'NOT_APPLICABLE')`,
        [id, userId, tenantId, ENTITY_ID, DOCUMENT_VERSION_ID],
      ),
    );
  }
}

export async function dropDatabase(database: string): Promise<void> {
  const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
  try {
    await dropScratchDatabase(maintenance, database);
  } finally {
    await maintenance.end();
  }
}
