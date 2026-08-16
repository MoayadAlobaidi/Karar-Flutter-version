/**
 * End-to-end tenant binding over live PostgreSQL with the REAL identity and
 * tenancy modules behind the ports (no fakes on the binding path): the §49
 * cases that only mean something against real rows and real sessions —
 *
 *   * one membership AUTO-BINDS on bootstrap GET, without rotation;
 *   * no membership → UNBOUND, and the tenant-bound tenancy surface stays
 *     unreachable (401-shaped) for that session;
 *   * a valid switch works end to end: NEW tokens, and the OLD sid is dead
 *     (an authenticateRequest with the old access token fails) with its
 *     refresh family revoked;
 *   * an arbitrary tenant is denied;
 *   * invitation redemption does NOT auto-bind (the Phase 3 behaviour still
 *     holds — binding comes only from bootstrap GET or POST);
 *   * bind and switch are audited with the old and new tenant;
 *   * the pooled connection carries no GUC afterwards.
 *
 * It also pins the STRUCTURAL claim the composition root depends on: the real
 * use cases are assigned to the port types this module declares, so a
 * mismatch fails the build rather than the wiring.
 */

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Result, TenantId, UserId } from '@karar/shared-kernel';
import {
  RecordAuditEvent,
  type AuditEvent,
  type AuditEventIdSource,
  type AuditWriteError,
  type AuditWriter,
} from '@karar/audit';
import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { InMemoryTestEncryptionProvider } from '@karar/platform/dist/keys/index.js';
import { LocalMailSink } from '@karar/platform/dist/notifications/index.js';
import { InProcessRateLimiter } from '@karar/platform/dist/ratelimit/index.js';
import {
  createIdentityRuntime,
  loadIdentityConfig,
  LocalDevKeyProvider,
  type IdentityRuntime,
} from '@karar/identity';
import {
  GetOwnTenant,
  PrismaInvitationRepository,
  PrismaMembershipRepository,
  PrismaTenantRepository,
  RecordAuditEventAuditTrail,
  RedeemInvitation,
  ResolveTenantContext,
  Sha256InvitationTokenSource,
  SwitchTenant,
  type RedeemerEmailSource,
} from '@karar/tenancy';

import { GetBootstrap } from '../application/use-cases/get-bootstrap.js';
import { SetTenantBinding } from '../application/use-cases/set-tenant-binding.js';
import type {
  BindSessionPort,
  ResolveTenantContextPort,
  RevokeSessionPort,
  SwitchTenantPort,
} from '../application/ports/tenant-context.js';
import type { AuditTrail } from '../application/ports/audit-trail.js';
import type { BootstrapPrincipal } from '../application/principal.js';
import { enrichment, fixedClock } from './helpers/fakes.js';

const maintenance = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

async function probePostgres(): Promise<string | null> {
  const client = new pg.Client({
    host: maintenance.host,
    port: maintenance.port,
    database: maintenance.database,
    user: maintenance.user,
    password: maintenance.password.unwrap(),
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (error) {
    await client.end().catch(() => {});
    return error instanceof Error ? error.message : String(error);
  }
}

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      'BOOTSTRAP BINDING TESTS SKIPPED — PostgreSQL is not reachable',
      `(${unreachable})`,
      'These tests are the end-to-end evidence for session-tenant binding;',
      'a skipped run proves nothing. Start the local infrastructure and rerun:',
      '  POSTGRES_PORT=5433 REDIS_PORT=6380 docker compose up -d postgres redis --wait',
      '  POSTGRES_PORT=5433 KARAR_ENV=local pnpm --filter @karar/bootstrap test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_bootstrap`;
const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
const FOREIGN_TENANT = '99999999-0000-4000-8000-000000000009';
const PASSWORD = 'bootstrap-suite-password';
const CLIENT = { ipDigest: 'digest-1', userAgentSummary: 'Chrome on macOS' };
// After every seeded effective_from (which the seed stamps with now()).
const clock = new Clock.Fixed(new Date('2026-12-01T00:00:00.000Z'));

class CapturingAuditWriter implements AuditWriter {
  readonly events: AuditEvent[] = [];
  record(event: AuditEvent): Promise<Result<AuditEvent, AuditWriteError>> {
    this.events.push(event);
    return Promise.resolve(Result.ok(event));
  }
}

let auditCounter = 0;
const idSource: AuditEventIdSource = {
  nextId: () => {
    auditCounter += 1;
    return `00000000-0000-7000-8000-${String(auditCounter).padStart(12, '0')}` as ReturnType<
      AuditEventIdSource['nextId']
    >;
  },
};

let handle: PrismaHandle;
let identity: IdentityRuntime;
let auditWriter: CapturingAuditWriter;
let bootstrapAudit: AuditTrail;
let memberships: PrismaMembershipRepository;
let tenants: PrismaTenantRepository;
let invitations: PrismaInvitationRepository;
let resolveTenantContext: ResolveTenantContext;
let switchTenant: SwitchTenant;
let getOwnTenant: GetOwnTenant;
const tokenSource = new Sha256InvitationTokenSource();

/**
 * THE STRUCTURAL CLAIM, checked by the compiler: the real use cases satisfy
 * the ports this module declares. If identity or tenancy changes a signature,
 * this assignment stops compiling — before any composition root breaks.
 */
function portsFrom(runtime: IdentityRuntime) {
  const bindSession: BindSessionPort = runtime.useCases.bindSessionTenant;
  const revokeSession: RevokeSessionPort = runtime.useCases.revokeSession;
  const resolve: ResolveTenantContextPort = resolveTenantContext;
  const switchPort: SwitchTenantPort = switchTenant;
  return { bindSession, revokeSession, resolve, switchPort };
}

function bootstrapUseCases() {
  const { bindSession, revokeSession, resolve, switchPort } = portsFrom(identity);
  return {
    get: new GetBootstrap({
      resolveTenantContext: resolve,
      bindSession,
      revokeSession,
      ...enrichment(),
      auditTrail: bootstrapAudit,
      clock: fixedClock,
    }),
    post: new SetTenantBinding({
      resolveTenantContext: resolve,
      bindSession,
      revokeSession,
      switchTenant: switchPort,
      auditTrail: bootstrapAudit,
      clock: fixedClock,
    }),
  };
}

async function registerAndLogin(email: string) {
  await identity.useCases.registerAccount.execute({ email, password: PASSWORD, client: CLIENT });
  const account = await identity.deps.accounts.findByEmail(email);
  if (account === null) throw new Error('account not created');
  await identity.deps.accounts.markEmailVerified(account.id, clock.now());
  const login = await identity.useCases.login.execute({ email, password: PASSWORD, client: CLIENT });
  if (!login.ok || login.value.kind !== 'session') throw new Error('expected a session');
  return { accountId: account.id, session: login.value.session };
}

/** The principal the composition root builds from the authenticated session. */
async function principalOf(accessToken: string): Promise<BootstrapPrincipal> {
  const authenticated = await identity.useCases.authenticateRequest.execute(accessToken);
  if (!authenticated.ok) throw new Error('expected an authenticated principal');
  const parsed = authenticated.value.tenantBinding;
  return {
    userId: UserId.of(authenticated.value.accountId),
    sessionId: authenticated.value.sessionId,
    tenantId: parsed === null ? null : TenantId.of(parsed),
    emailVerified: authenticated.value.emailVerified,
  };
}

async function seedMembership(userId: UserId, tenantId: TenantId, state = 'ACTIVE') {
  const adapter = new PostgresPersistenceAdapter(
    LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
  );
  try {
    await adapter.query(
      `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
       VALUES (gen_random_uuid(), $1, $2, 'MEMBER', $3, now() - interval '1 day')`,
      [TenantId.toString(tenantId), UserId.toString(userId), state],
    );
  } finally {
    await adapter.end();
  }
}

describe.skipIf(unreachable !== null)('bootstrap tenant binding (live PostgreSQL)', () => {
  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    const migrator = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    try {
      await migrateToLatest({ adapter: migrator });
    } finally {
      await migrator.end();
    }
    const superuser = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    try {
      await superuser.query(
        `INSERT INTO public.tenants (id, type, name, status)
         VALUES ($1, 'FIRST_PARTY', 'Tenant A', 'ACTIVE'), ($2, 'WHITE_LABEL', 'Tenant B', 'ACTIVE')`,
        [TenantId.toString(TENANT_A), TenantId.toString(TENANT_B)],
      );
    } finally {
      await superuser.end();
    }

    handle = createPrismaClient({
      ...LocalPostgresConnectionProfile.fromEnv('app', { database }),
      poolMax: 1, // one session, so the pooled-GUC probe is honest
    });
    auditWriter = new CapturingAuditWriter();
    const recordAudit = new RecordAuditEvent(auditWriter, idSource);
    identity = createIdentityRuntime({
      config: loadIdentityConfig('local', {}),
      prisma: handle,
      recordAudit,
      notifications: new LocalMailSink({ env: 'local' }),
      encryption: new InMemoryTestEncryptionProvider(),
      rateLimiter: new InProcessRateLimiter(),
      tokenKeys: new LocalDevKeyProvider({ env: 'local' }),
      clock,
    });
    memberships = new PrismaMembershipRepository(handle);
    tenants = new PrismaTenantRepository(handle);
    invitations = new PrismaInvitationRepository(handle);
    const tenancyAudit = new RecordAuditEventAuditTrail(recordAudit, 'local-test');
    bootstrapAudit = tenancyAudit;
    resolveTenantContext = new ResolveTenantContext(memberships, tenants, clock);
    switchTenant = new SwitchTenant(
      memberships,
      tenants,
      identity.useCases.rebindSessionTenant,
      identity.useCases.revokeSession,
      tenancyAudit,
      clock,
    );
    getOwnTenant = new GetOwnTenant(tenants, memberships);
  }, 180_000);

  afterAll(async () => {
    await handle.end();
    const admin = new PostgresPersistenceAdapter(maintenance);
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  it('ONE membership AUTO-BINDS on GET /platform/bootstrap — without rotation: the same access token keeps working and now carries the binding', async () => {
    const { accountId, session } = await registerAndLogin('autobind@example.com');
    await seedMembership(accountId, TENANT_A);

    const before = await principalOf(session.accessToken);
    expect(before.tenantId).toBeNull();

    const view = await bootstrapUseCases().get.execute(before, CLIENT);
    expect(view.ok).toBe(true);
    if (!view.ok) throw new Error('expected a bootstrap view');
    expect(view.value.binding).toEqual({
      kind: 'BOUND',
      tenant: { tenantId: TenantId.toString(TENANT_A), name: 'Tenant A', roleHint: 'MEMBER' },
    });

    // NO rotation: the SAME token authenticates and the binding is visible
    // to the very next per-request read.
    const after = await principalOf(session.accessToken);
    expect(after.sessionId).toBe(session.sessionId);
    expect(after.tenantId).toBe(TenantId.toString(TENANT_A));

    // …and the SAME refresh token still rotates (its family was untouched).
    const refreshed = await identity.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: CLIENT,
    });
    expect(refreshed.ok).toBe(true);

    // Audited, with the tenant that was bound.
    const auto = auditWriter.events.find(
      (event) =>
        event.action === 'platform.bootstrap.auto_bind' &&
        event.actorRef === `user:${UserId.toString(accountId)}`,
    );
    expect(auto?.outcome).toBe('SUCCESS');
    expect(auto?.afterMetadata).toMatchObject({ tenantId: TenantId.toString(TENANT_A) });
    // The identity-side ledger event exists too.
    const bound = auditWriter.events.find(
      (event) =>
        event.action === 'identity.session.tenant_bound' &&
        event.actorRef === `user:${UserId.toString(accountId)}`,
    );
    expect(bound?.outcome).toBe('SUCCESS');
  });

  it('NO membership → UNBOUND, nothing is bound, and the tenant-bound tenancy surface stays unreachable for that session', async () => {
    const { session } = await registerAndLogin('unbound@example.com');
    const principal = await principalOf(session.accessToken);

    const view = await bootstrapUseCases().get.execute(principal, CLIENT);
    expect(view.ok && view.value.binding).toEqual({ kind: 'UNBOUND' });

    // The session row is still unbound after the call.
    expect((await principalOf(session.accessToken)).tenantId).toBeNull();

    // The composition builds no tenant-bound principal from a null binding,
    // so the tenant-bound use case answers the 401-shaped denial.
    const denied = await getOwnTenant.execute({
      tenantId: null as unknown as TenantId,
      userId: principal.userId,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error('expected a denial');
    expect(denied.error.kind).toBe('missing_principal_context');
  });

  it('SEVERAL memberships → TENANT_SELECTION_REQUIRED, and nothing is bound until an explicit selection', async () => {
    const { accountId, session } = await registerAndLogin('selection@example.com');
    await seedMembership(accountId, TENANT_A);
    await seedMembership(accountId, TENANT_B);

    const view = await bootstrapUseCases().get.execute(
      await principalOf(session.accessToken),
      CLIENT,
    );
    expect(view.ok).toBe(true);
    if (!view.ok) throw new Error('expected a bootstrap view');
    expect(view.value.binding.kind).toBe('TENANT_SELECTION_REQUIRED');
    if (view.value.binding.kind !== 'TENANT_SELECTION_REQUIRED') throw new Error('unexpected');
    expect(view.value.binding.choices.map((choice) => choice.tenantId).sort()).toEqual(
      [TenantId.toString(TENANT_A), TenantId.toString(TENANT_B)].sort(),
    );
    expect((await principalOf(session.accessToken)).tenantId).toBeNull();
  });

  it('POST first bind then SWITCH end to end: new tokens come back, the OLD sid is dead, and the old refresh family is revoked', async () => {
    const { accountId, session } = await registerAndLogin('switch@example.com');
    await seedMembership(accountId, TENANT_A);
    await seedMembership(accountId, TENANT_B);
    const { post } = bootstrapUseCases();

    // First bind — no rotation, no tokens in the answer.
    const bound = await post.execute(
      { tenantId: TenantId.toString(TENANT_A) },
      await principalOf(session.accessToken),
      CLIENT,
    );
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error('expected a bind');
    expect(bound.value.kind).toBe('bound');
    expect((await principalOf(session.accessToken)).tenantId).toBe(TenantId.toString(TENANT_A));

    // Switch — full rotation.
    const switched = await post.execute(
      { tenantId: TenantId.toString(TENANT_B) },
      await principalOf(session.accessToken),
      CLIENT,
    );
    expect(switched.ok).toBe(true);
    if (!switched.ok) throw new Error('expected a switch');
    if (switched.value.kind !== 'switched') throw new Error('expected the switched shape');
    expect(switched.value.session.sessionId).not.toBe(session.sessionId);

    // THE OLD SID IS DEAD: authenticateRequest with the old access token fails.
    const oldPrincipal = await identity.useCases.authenticateRequest.execute(session.accessToken);
    expect(oldPrincipal.ok).toBe(false);
    // The old refresh token dies with its revoked family.
    const oldRefresh = await identity.useCases.refreshSession.execute({
      refreshToken: session.refreshToken,
      client: CLIENT,
    });
    expect(oldRefresh.ok).toBe(false);

    // The NEW session authenticates and carries the NEW binding.
    const newPrincipal = await identity.useCases.authenticateRequest.execute(
      switched.value.session.accessToken,
    );
    expect(newPrincipal.ok).toBe(true);
    if (!newPrincipal.ok) throw new Error('expected authentication');
    expect(newPrincipal.value.tenantBinding).toBe(TenantId.toString(TENANT_B));
    const newRefresh = await identity.useCases.refreshSession.execute({
      refreshToken: switched.value.session.refreshToken,
      client: CLIENT,
    });
    expect(newRefresh.ok).toBe(true);

    // Audited with old AND new tenant, on both sides of the seam.
    const rebound = auditWriter.events.find(
      (event) =>
        event.action === 'identity.session.tenant_rebound' &&
        event.actorRef === `user:${UserId.toString(accountId)}`,
    );
    expect(rebound?.afterMetadata).toMatchObject({
      oldTenantId: TenantId.toString(TENANT_A),
      newTenantId: TenantId.toString(TENANT_B),
    });
    const surface = auditWriter.events.find(
      (event) =>
        event.action === 'platform.tenant_binding.switched' &&
        event.actorRef === `user:${UserId.toString(accountId)}`,
    );
    expect(surface?.beforeMetadata).toMatchObject({ tenantId: TenantId.toString(TENANT_A) });
    expect(surface?.afterMetadata).toMatchObject({ tenantId: TenantId.toString(TENANT_B) });
  });

  it('an ARBITRARY tenant is denied on POST, and the session binding is untouched', async () => {
    const { accountId, session } = await registerAndLogin('arbitrary@example.com');
    await seedMembership(accountId, TENANT_A);
    const { post } = bootstrapUseCases();

    const denied = await post.execute(
      { tenantId: FOREIGN_TENANT },
      await principalOf(session.accessToken),
      CLIENT,
    );
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error('expected a denial');
    expect(denied.error.kind).toBe('membership_required');
    expect((await principalOf(session.accessToken)).tenantId).toBeNull();
  });

  it('a REVOKED (REMOVED) membership is denied and never becomes a binding', async () => {
    const { accountId, session } = await registerAndLogin('revoked@example.com');
    await seedMembership(accountId, TENANT_A, 'REMOVED');
    const { get, post } = bootstrapUseCases();

    const view = await get.execute(await principalOf(session.accessToken), CLIENT);
    expect(view.ok && view.value.binding).toEqual({ kind: 'UNBOUND' });

    const denied = await post.execute(
      { tenantId: TenantId.toString(TENANT_A) },
      await principalOf(session.accessToken),
      CLIENT,
    );
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error('expected a denial');
    expect(denied.error.kind).toBe('membership_required');
    expect((await principalOf(session.accessToken)).tenantId).toBeNull();
  });

  it('invitation REDEMPTION does not auto-bind: the Phase 3 behaviour still holds — binding comes only from bootstrap', async () => {
    const email = 'redeemer@example.com';
    const { accountId, session } = await registerAndLogin(email);

    // Seed an invitation for this address (creation is the tenant admin's
    // path and is proven in the tenancy suite; what matters here is the
    // redemption's effect on the SESSION).
    const raw = 'invitation-token-for-the-bootstrap-suite';
    const superuser = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    try {
      await superuser.query(
        `INSERT INTO public.tenant_invitations
           (id, tenant_id, email, token_hash, role_hint, expires_at, attempts, max_attempts, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, 'MEMBER', now() + interval '2 years', 0, 5, $4)`,
        [TenantId.toString(TENANT_A), email, tokenSource.hashOf(raw), UserId.toString(accountId)],
      );
    } finally {
      await superuser.end();
    }

    const emails: RedeemerEmailSource = {
      verifiedEmailOf: () => Promise.resolve(email),
    };
    const redeem = new RedeemInvitation(
      invitations,
      tokenSource,
      emails,
      bootstrapAudit as RecordAuditEventAuditTrail,
      clock,
    );
    const redeemed = await redeem.execute({ token: raw }, { userId: accountId });
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) throw new Error('expected redemption');
    expect(redeemed.value.tenantId).toBe(TenantId.toString(TENANT_A));

    // THE POINT: the membership now exists, but the SESSION is still unbound.
    const principal = await principalOf(session.accessToken);
    expect(principal.tenantId).toBeNull();

    // Only the bootstrap surface binds it.
    const view = await bootstrapUseCases().get.execute(principal, CLIENT);
    expect(view.ok && view.value.binding.kind).toBe('BOUND');
    expect((await principalOf(session.accessToken)).tenantId).toBe(TenantId.toString(TENANT_A));
  });

  it('pooled-context hygiene: after every bind and switch above, the pool carries no GUC and unscoped reads see nothing', async () => {
    const probe = await handle.client.$queryRawUnsafe<
      Array<{
        tenant_guc: string | null;
        user_guc: string | null;
        sessions: string;
        members: string;
      }>
    >(
      `SELECT current_setting('app.tenant_id', true) AS tenant_guc,
              current_setting('app.user_id', true) AS user_guc,
              (SELECT count(*) FROM public.sessions)::text AS sessions,
              (SELECT count(*) FROM public.tenant_members)::text AS members`,
    );
    const row = probe[0];
    expect(row?.tenant_guc === null || row?.tenant_guc === '').toBe(true);
    expect(row?.user_guc === null || row?.user_guc === '').toBe(true);
    expect(row?.sessions).toBe('0');
    expect(row?.members).toBe('0');
  });
});
