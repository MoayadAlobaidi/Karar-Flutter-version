/**
 * Phase 3.5 adversarial suite — the jurisdiction, capability, and
 * tenant-binding surfaces, probed as an attacker with legitimate database
 * access rather than as a caller of the modules.
 *
 * DELIBERATE NON-DUPLICATION. The module suites already prove, on live
 * PostgreSQL, the scenarios this file therefore does not repeat:
 *   * DRAFT / unapproved pack activation refused outside local, retired-pack
 *     historical resolution, and policy_pack_activations append-only against
 *     the owner — modules/jurisdiction/__tests__/jurisdiction.integration.test.ts
 *   * the eight resolution gates including ENTITLEMENT_EXPIRED and the
 *     ceiling gates, availability/entitlement ledger immutability, and
 *     cross-tenant entitlement isolation — modules/capability/__tests__/
 *   * subject-selection cross-user/cross-tenant reads, options outside the
 *     pack, expiry, and the pack-version race —
 *     modules/subject-policy/__tests__/subject-policy.integration.test.ts
 *   * binding to a non-member or revoked tenant, and binding denials at the
 *     use-case seam — modules/bootstrap/__tests__/ and
 *     modules/tenancy/__tests__/tenant-context.integration.test.ts
 *
 * What is left is what no module owns, because each question spans two of
 * them or asks about the SHAPE of the schema rather than a code path:
 *   1. no configuration route can reach an unimplemented capability, and the
 *      database cannot express the gate that stops it;
 *   2. the hidden capability stays hidden in the one place a database row
 *      could plausibly reach — no row anywhere names it, and no column exists
 *      that could flip its exposure;
 *   3. jurisdiction_settings cannot express an enablement, by shape;
 *   4. a bound session whose membership was revoked — the honest data-reach
 *      answer, which is a residual, not a control;
 *   5. pooled-connection hygiene across a bind-then-switch sequence;
 *   6. the migration 0086 pinning block: an unpinned or falsely-historical
 *      legal-consequence row is refused, and a pin cannot be rewritten.
 *
 * Every probe reads its own rows NON-EMPTY first: an isolation result that
 * cannot tell denial from an empty table proves nothing (the AZ2 lesson).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CAPABILITY_REGISTRY } from '@karar/capability-registry';

import {
  CONSENT_A1,
  DOCUMENT_VERSION_ID,
  ENTITY_ID,
  asApp,
  dropDatabase,
  probePostgres,
  provisionSecurityDatabase,
  refusalOf,
  seedTenantData,
  skipBanner,
  tenantA,
  tenantB,
  userA1,
  userB1,
  withAdapter,
} from '../fixtures.js';

const database = `karar_sec_${process.pid}_phase35`;

/** The capability every probe below tries to reach. Unbuilt, like all of them. */
const TARGET_CAPABILITY = 'TRANSACTIONS';
const HIDDEN_CAPABILITY = 'AMANAT';

const AVAILABILITY_ROW = '99990001-0000-4000-8000-000000000001';
const ENTITLEMENT_ROW = '99990002-0000-4000-8000-000000000002';
const GRANT_UNPINNED = '99990003-0000-4000-8000-000000000003';

interface PgError extends Error {
  readonly sqlState?: string;
}

const expectSqlState = (failure: unknown, sqlState: string, what: string): void => {
  expect(failure, what).toBeInstanceOf(Error);
  expect({ what, sqlState: (failure as PgError).sqlState }).toEqual({ what, sqlState });
};

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(skipBanner('PHASE 3.5 POLICY SURFACE (security suite)', unreachable));
}

describe.skipIf(unreachable !== null)('Phase 3.5 policy surface (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionSecurityDatabase(database);
    await seedTenantData(database);

    // The attacker's best case: every configuration route set to its most
    // permissive value for a real capability, written as the schema owner so
    // no permission gate stands in the way.
    await withAdapter(database, 'migrator', async (adapter) => {
      await adapter.query(
        `INSERT INTO public.capability_availability
           (id, environment, jurisdiction_ref, capability_id, state, reason, actor_ref, updated_at)
         VALUES ($1, 'local', 'jurisdiction:synthetic', $2, 'AVAILABLE',
                 'adversarial seed: most permissive configuration', 'security-suite', now())`,
        [AVAILABILITY_ROW, TARGET_CAPABILITY],
      );
    });
    // The entitlement is tenant-scoped and RLS-FORCEd, so even the schema
    // owner writes it through the principal context — seeding it as the app
    // role under the tenant GUC is itself the positive control that the
    // WITH CHECK arm admits the legitimate shape.
    await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
      tx.query(
        `INSERT INTO public.tenant_capability_entitlements
           (id, tenant_id, capability_id, status, source_ref, reason, actor_ref,
            effective_from, effective_to, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', 'source:security-suite',
                 'adversarial seed: open window', 'security-suite',
                 now() - interval '1 day', NULL, now())`,
        [ENTITLEMENT_ROW, tenantA, TARGET_CAPABILITY],
      ),
    );
  }, 180_000);

  afterAll(async () => {
    await dropDatabase(database);
  }, 60_000);

  // -------------------------------------------------------------------------
  // 1. Capability resolution abuse — every configuration route at once
  // -------------------------------------------------------------------------

  it('NON-EMPTY FIRST: the permissive configuration rows really are there and readable', async () => {
    const availability = await asApp(database, {}, (tx) =>
      tx.query(`SELECT state FROM public.capability_availability WHERE id = $1`, [
        AVAILABILITY_ROW,
      ]),
    );
    expect({ rows: availability.rowCount, state: availability.rows[0]?.state }).toEqual({
      rows: 1,
      state: 'AVAILABLE',
    });

    const entitlement = await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
      tx.query(`SELECT status FROM public.tenant_capability_entitlements WHERE id = $1`, [
        ENTITLEMENT_ROW,
      ]),
    );
    expect({ rows: entitlement.rowCount, status: entitlement.rows[0]?.status }).toEqual({
      rows: 1,
      status: 'ACTIVE',
    });
  });

  it('the database cannot express the first gate: no column anywhere carries implementation or deployment state', async () => {
    // Gate 1 reads the compile-time descriptor and nothing else. The claim
    // "no configuration route exists" is only true if the database has no
    // column that could carry the answer — so look for one.
    const columns = await withAdapter(database, 'migrator', (adapter) =>
      adapter.query(
        `SELECT table_schema, table_name, column_name
           FROM information_schema.columns
          WHERE table_schema IN ('public', 'platform', 'audit')
            AND (column_name ILIKE '%implementation%'
                 OR column_name ILIKE '%deployment%'
                 OR column_name ILIKE '%deployed%'
                 OR column_name ILIKE '%implemented%')`,
      ),
    );
    expect({ what: 'implementation/deployment columns', rows: columns.rows }).toEqual({
      what: 'implementation/deployment columns',
      rows: [],
    });

    // …and the descriptor the gate does read says the capability is built and
    // deployed nowhere. The deployed-nowhere half is what this file is about:
    // no database row can express it, so no row can grant it either.
    const descriptor = CAPABILITY_REGISTRY[TARGET_CAPABILITY];
    expect({
      implementation: descriptor.implementation,
      deployedEnvironments: Object.keys(descriptor.deployment),
    }).toEqual({ implementation: 'IMPLEMENTED', deployedEnvironments: [] });
  });

  it('the closed capability vocabulary refuses a capability id that is not in the registry', async () => {
    const failure = await refusalOf(
      database,
      {},
      `INSERT INTO public.capability_availability
         (id, environment, jurisdiction_ref, capability_id, state, reason, actor_ref, updated_at)
       VALUES ($1, 'local', NULL, 'FUNDRAISING', 'AVAILABLE', 'r', 'a', now())`,
      ['99990004-0000-4000-8000-000000000004'],
    );
    // karar_app holds no permission-gated write path either; whichever refusal
    // arrives first, an unregistered capability never gets a row.
    expect(failure).toBeInstanceOf(Error);
    const rows = await withAdapter(database, 'migrator', (adapter) =>
      adapter.query(`SELECT 1 FROM public.capability_availability WHERE capability_id NOT IN
        ('TRANSACTIONS','BUDGETS','GOALS','INSIGHTS','AI_ADVISOR','ZAKAT','AMANAT')`),
    );
    expect(rows.rowCount).toBe(0);
  });

  it('extending an entitlement window is a versioned, ledgered UPDATE — not a silent edit', async () => {
    // Non-empty first: the ledger already carries the seeded state. It is
    // tenant-scoped and FORCEd, so it is read under the tenant's own context.
    const before = await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
      tx.query(
        `SELECT count(*)::int AS n FROM public.tenant_capability_entitlement_history
          WHERE entitlement_id = $1`,
        [ENTITLEMENT_ROW],
      ),
    );
    expect(before.rows[0]?.n).toBeGreaterThan(0);

    // A version that does not advance by exactly one is refused by the guard.
    const skipped = await refusalOf(
      database,
      { tenantId: tenantA, userId: userA1 },
      `UPDATE public.tenant_capability_entitlements
          SET effective_to = now() + interval '10 years', version = version + 5, updated_at = now()
        WHERE id = $1`,
      [ENTITLEMENT_ROW],
    );
    expectSqlState(skipped, 'P0001', 'entitlement version skip');
  });

  // -------------------------------------------------------------------------
  // 2. The hidden capability stays hidden
  // -------------------------------------------------------------------------

  it('the hidden capability is hidden in the registry and reachable through no configuration column', async () => {
    const descriptor = CAPABILITY_REGISTRY[HIDDEN_CAPABILITY];
    expect({
      clientExposure: descriptor.clientExposure,
      disclosureBearing: descriptor.disclosureBearing,
      declaredJurisdictions: descriptor.declaredJurisdictions.length,
    }).toEqual({ clientExposure: 'HIDDEN', disclosureBearing: true, declaredJurisdictions: 0 });

    // No column exists that a row could set to change client exposure: the
    // decision lives in reviewed code, so there is nothing to configure.
    const columns = await withAdapter(database, 'migrator', (adapter) =>
      adapter.query(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (column_name ILIKE '%client_exposure%'
                 OR column_name ILIKE '%visib%'
                 OR column_name ILIKE '%hidden%'
                 OR column_name ILIKE '%disclosure%')`,
      ),
    );
    expect({ what: 'client-exposure columns', rows: columns.rows }).toEqual({
      what: 'client-exposure columns',
      rows: [],
    });
  });

  it('no seeded row anywhere in the configuration tables names the hidden capability', async () => {
    const seeded = await withAdapter(database, 'migrator', (adapter) =>
      adapter.query(
        `SELECT 'availability' AS source, capability_id FROM public.capability_availability
           WHERE capability_id = $1
         UNION ALL
         SELECT 'entitlement', capability_id FROM public.tenant_capability_entitlements
           WHERE capability_id = $1
         UNION ALL
         SELECT 'selection', capability_id FROM public.subject_policy_selections
           WHERE capability_id = $1`,
        [HIDDEN_CAPABILITY],
      ),
    );
    expect({ what: 'rows naming the hidden capability', rows: seeded.rows }).toEqual({
      what: 'rows naming the hidden capability',
      rows: [],
    });
  });

  // -------------------------------------------------------------------------
  // 3. Jurisdiction settings cannot expand
  // -------------------------------------------------------------------------

  it('jurisdiction_settings has no column that can express an enablement', async () => {
    const columns = await withAdapter(database, 'migrator', (adapter) =>
      adapter.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'jurisdiction_settings'
          ORDER BY column_name`,
      ),
    );
    // Non-empty first: the table exists and has columns to reason about.
    expect(columns.rowCount).toBeGreaterThan(0);
    const names = columns.rows.map((r) => String(r.column_name));
    const enabling = names.filter((n) =>
      /enable|enabled|allow|allowed|grant|permit|available|cleared/i.test(n),
    );
    expect({ what: 'enabling columns in jurisdiction_settings', enabling }).toEqual({
      what: 'enabling columns in jurisdiction_settings',
      enabling: [],
    });
    // The restricting shape is present, so the emptiness above is a fact about
    // the design rather than about an empty table.
    expect(names.some((n) => /disable|suspend/i.test(n))).toBe(true);
  });

  it('the app role cannot write jurisdiction settings at all', async () => {
    const failure = await refusalOf(
      database,
      {},
      `UPDATE public.jurisdiction_settings SET version = version + 1`,
    );
    expectSqlState(failure, '42501', 'jurisdiction_settings UPDATE');
  });

  // -------------------------------------------------------------------------
  // 4. A bound session outliving its membership — the honest answer
  // -------------------------------------------------------------------------

  it('a still-bound context reads its tenant after the membership is revoked — the residual RLS cannot close', async () => {
    // Non-empty first: with membership intact, the bound context sees rows.
    const withMembership = await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
      tx.query(`SELECT count(*)::int AS n FROM public.user_profiles`),
    );
    expect(withMembership.rows[0]?.n).toBeGreaterThan(0);

    await withAdapter(database, 'superuser', (adapter) =>
      adapter.query(
        `UPDATE public.tenant_members SET state = 'REMOVED', effective_to = now()
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenantA, userA1],
      ),
    );

    // The GUCs still assert tenant A, because the session row still says so.
    // RLS is a row predicate; it has no membership to consult. This is the
    // documented residual (threat model, EV-412) — the compensating control is
    // re-verification at resolution time plus session revocation, proven in
    // modules/bootstrap/__tests__/bootstrap-use-cases.test.ts, not here.
    const afterRevocation = await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
      tx.query(`SELECT count(*)::int AS n FROM public.user_profiles`),
    );
    expect({
      residual: 'a bound context outlives its membership until the session is revoked',
      visible: (afterRevocation.rows[0]?.n ?? 0) > 0,
    }).toEqual({
      residual: 'a bound context outlives its membership until the session is revoked',
      visible: true,
    });

    // What the revocation DOES close immediately: the self-arm roster read no
    // longer offers tenant A as a membership the principal could bind to.
    const memberships = await asApp(database, { userId: userA1 }, (tx) =>
      tx.query(
        `SELECT tenant_id FROM public.tenant_members WHERE user_id = $1 AND state = 'ACTIVE'`,
        [userA1],
      ),
    );
    expect(memberships.rows.map((r) => String(r.tenant_id))).not.toContain(tenantA);

    // Restore, so later probes reason about a consistent world.
    await withAdapter(database, 'superuser', (adapter) =>
      adapter.query(
        `UPDATE public.tenant_members SET state = 'ACTIVE', effective_to = NULL
          WHERE tenant_id = $1 AND user_id = $2`,
        [tenantA, userA1],
      ),
    );
  });

  it('a bind-then-switch sequence leaves no principal behind on the pooled connection', async () => {
    // Non-empty first at each binding, then a context-free probe on the SAME
    // single-connection pool.
    await withAdapter(database, 'app', async (adapter) => {
      const bound = async (tenantId: string, userId: string): Promise<number> =>
        adapter.withTransaction(async (tx) => {
          await tx.query(
            `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
            [tenantId, userId],
          );
          const rows = await tx.query(`SELECT count(*)::int AS n FROM public.user_profiles`);
          return Number(rows.rows[0]?.n ?? 0);
        });

      expect(await bound(tenantA, userA1)).toBeGreaterThan(0);
      expect(await bound(tenantB, userB1)).toBeGreaterThan(0);

      const leaked = await adapter.withTransaction(async (tx) => {
        const guc = await tx.query(
          `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
                  current_setting('app.user_id', true) AS user_guc`,
        );
        const rows = await tx.query(`SELECT count(*)::int AS n FROM public.user_profiles`);
        return {
          tenant: guc.rows[0]?.tenant_guc ?? null,
          user: guc.rows[0]?.user_guc ?? null,
          visible: Number(rows.rows[0]?.n ?? 0),
        };
      });
      expect(leaked.tenant === null || leaked.tenant === '').toBe(true);
      expect(leaked.user === null || leaked.user === '').toBe(true);
      expect(leaked.visible).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. The pinning block (migration 0086)
  // -------------------------------------------------------------------------

  it('NON-EMPTY FIRST: the seeded consent grant carries a pinned pack version', async () => {
    const row = await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
      tx.query(
        `SELECT policy_pack_version, policy_pack_pin_state, subject_policy_selection_pin_state
           FROM public.consent_grants WHERE id = $1`,
        [CONSENT_A1],
      ),
    );
    expect({
      rows: row.rowCount,
      pinState: row.rows[0]?.policy_pack_pin_state,
      selectionState: row.rows[0]?.subject_policy_selection_pin_state,
    }).toEqual({ rows: 1, pinState: 'PINNED', selectionState: 'NOT_APPLICABLE' });
    expect(String(row.rows[0]?.policy_pack_version ?? '')).not.toBe('');
  });

  it('a new consent grant cannot claim to predate the policy-pack machinery', async () => {
    const failure = await refusalOf(
      database,
      { tenantId: tenantA, userId: userA1 },
      `INSERT INTO public.consent_grants
         (id, user_id, tenant_id, operating_entity_id, jurisdiction_ref, purpose_ref,
          consent_version, legal_document_version_id, granted_at, status, evidence_reference,
          policy_pack_pin_state, subject_policy_selection_pin_state)
       VALUES ($1, $2, $3, $4, 'jurisdiction:synthetic', 'purpose:unpinned', '1.0.0', $5,
               now(), 'ACTIVE', 'request:adversarial', 'PRE_POLICY_PACK', 'NOT_APPLICABLE')`,
      [GRANT_UNPINNED, userA1, tenantA, ENTITY_ID, DOCUMENT_VERSION_ID],
    );
    expectSqlState(failure, '23514', 'consent grant claiming to predate PolicyPacks');
  });

  it('a consent grant cannot claim to be pinned while carrying no version', async () => {
    const failure = await refusalOf(
      database,
      { tenantId: tenantA, userId: userA1 },
      `INSERT INTO public.consent_grants
         (id, user_id, tenant_id, operating_entity_id, jurisdiction_ref, purpose_ref,
          consent_version, legal_document_version_id, granted_at, status, evidence_reference,
          policy_pack_pin_state, subject_policy_selection_pin_state)
       VALUES ($1, $2, $3, $4, 'jurisdiction:synthetic', 'purpose:unpinned', '1.0.0', $5,
               now(), 'ACTIVE', 'request:adversarial', 'PINNED', 'NOT_APPLICABLE')`,
      [GRANT_UNPINNED, userA1, tenantA, ENTITY_ID, DOCUMENT_VERSION_ID],
    );
    expectSqlState(failure, '23514', 'consent grant PINNED with no version');
  });

  it('omitting the pin state fails closed rather than defaulting to the historical case', async () => {
    const failure = await refusalOf(
      database,
      { tenantId: tenantA, userId: userA1 },
      `INSERT INTO public.consent_grants
         (id, user_id, tenant_id, operating_entity_id, jurisdiction_ref, purpose_ref,
          consent_version, legal_document_version_id, granted_at, status, evidence_reference)
       VALUES ($1, $2, $3, $4, 'jurisdiction:synthetic', 'purpose:unpinned', '1.0.0', $5,
               now(), 'ACTIVE', 'request:adversarial')`,
      [GRANT_UNPINNED, userA1, tenantA, ENTITY_ID, DOCUMENT_VERSION_ID],
    );
    expectSqlState(failure, '23502', 'consent grant with no pin state at all');
  });

  it('the pinned version cannot be rewritten — not by the app role, not by the owner', async () => {
    const asAppRole = await refusalOf(
      database,
      { tenantId: tenantA, userId: userA1 },
      `UPDATE public.consent_grants SET policy_pack_version = 'forged/v9' WHERE id = $1`,
      [CONSENT_A1],
    );
    expectSqlState(asAppRole, 'P0001', 'app rewriting a pinned pack version');

    const asOwner = await withAdapter(database, 'migrator', async (adapter) =>
      adapter
        .withTransaction(async (tx) => {
          await tx.query(
            `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
            [tenantA, userA1],
          );
          return tx.query(
            `UPDATE public.consent_grants SET policy_pack_version = 'forged/v9' WHERE id = $1`,
            [CONSENT_A1],
          );
        })
        .then(
          () => null,
          (error: unknown) => error,
        ),
    );
    expectSqlState(asOwner, 'P0001', 'owner rewriting a pinned pack version');

    const survived = await asApp(database, { tenantId: tenantA, userId: userA1 }, (tx) =>
      tx.query(`SELECT policy_pack_version FROM public.consent_grants WHERE id = $1`, [CONSENT_A1]),
    );
    expect(survived.rows[0]?.policy_pack_version).not.toBe('forged/v9');
  });

  it('a data-protection role assignment can never claim a subject election', async () => {
    const failure = await refusalOf(
      database,
      {},
      `INSERT INTO public.data_protection_role_assignments
         (id, operating_entity_id, purpose_ref, jurisdiction_ref, role, effective_from,
          created_by, policy_pack_version, policy_pack_pin_state, subject_policy_selection_pin_state)
       VALUES ($1, $2, 'purpose:adversarial', 'jurisdiction:synthetic', 'CONTROLLER', now(),
               'security-suite', 'zz-security/v1', 'PINNED', 'PINNED')`,
      ['99990005-0000-4000-8000-000000000005', ENTITY_ID],
    );
    expectSqlState(failure, '23514', 'role assignment claiming a subject election');
  });
});
