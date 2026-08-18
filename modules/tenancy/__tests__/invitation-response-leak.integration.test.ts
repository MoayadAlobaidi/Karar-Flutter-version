/**
 * INVITATION RESPONSES CARRY NO BEARER MATERIAL — the executable form of the
 * claim the response DTOs make in prose ("Invitation responses never carry the
 * token hash; the raw token appears exactly once, in the creation response",
 * presentation/dto/tenancy-responses.ts).
 *
 * WHY A HASH LEAK WOULD MATTER. `tenant_invitations.token_hash` is not merely
 * private data: under the 0044 policies it is the LOOKUP KEY. A redeemer's
 * transaction binds `app.invitation_token_hash` and the row that hash names
 * becomes visible to them. So the hash is not "the safe form of the token" at
 * this boundary — inside this system it is close to a second copy of it. A
 * response that echoed it would hand any reader of any invitation response the
 * exact value the redemption path indexes on.
 *
 * The existing evidence stops one step short: tenancy-isolation asserts that
 * what is STORED is a sha256 and not the raw token. Nothing asserted that what
 * is SENT omits it. This suite asserts the omission on the real serialized
 * bytes of every invitation-bearing response the surface can produce.
 *
 * Everything under the controller is real: the real use cases over the real
 * Prisma repositories and the real sha256 token source, against a migrated
 * scratch database, through the real TenancyApiModule on Fastify — so the
 * bytes inspected are the bytes a client would receive. The two doubles are
 * the seams the composition root owns (the principal source, which reads the
 * session row, and the redeemer's verified-email source, which belongs to
 * identity) plus the permissive PolicyService the sibling suites use, so what
 * is proven here is this module's own behaviour.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock, Result, TenantId, UserId } from '@karar/shared-kernel';
import { PostgresPersistenceAdapter } from '@karar/platform/dist/db/index.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  appProfile,
  asApp,
  buildAuditTrail,
  buildHandle,
  dropDatabase,
  probePostgres,
  provisionDatabase,
  skipBanner,
  superuserMaintenanceProfile,
  TENANT_A,
  USER_A1,
  USER_NEW,
} from './fixtures.js';
import { PrismaTenantRepository } from '../infrastructure/persistence/prisma-tenant-repository.js';
import { PrismaMembershipRepository } from '../infrastructure/persistence/prisma-membership-repository.js';
import { PrismaInvitationRepository } from '../infrastructure/persistence/prisma-invitation-repository.js';
import { Sha256InvitationTokenSource } from '../infrastructure/providers/sha256-invitation-token-source.js';
import { PermissiveForTestsPolicyService } from '../application/testing/permissive-policy-service.js';
import { CreateInvitation } from '../application/use-cases/create-invitation.js';
import { RevokeInvitation } from '../application/use-cases/revoke-invitation.js';
import { RedeemInvitation } from '../application/use-cases/redeem-invitation.js';
import { GetOwnTenant } from '../application/use-cases/get-own-tenant.js';
import { ListMembers } from '../application/use-cases/list-members.js';
import type { RedeemerEmailSource } from '../application/ports/redeemer-email-source.js';
import { TenancyApiModule } from '../presentation/tenancy-api.module.js';
import type { OperationGate } from '../presentation/http/operation-gate.js';
import type { TenancyPrincipalSource } from '../presentation/http/principal-source.js';

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    skipBanner(
      'INVITATION RESPONSE LEAK TESTS',
      superuserMaintenanceProfile.host,
      superuserMaintenanceProfile.port,
      unreachable,
    ),
  );
}

const database = `karar_test_${process.pid}_invitation_responses`;
const NOW = new Date('2026-08-16T12:00:00.000Z');
const INVITED_EMAIL = 'invited.person@example.com';

/** The eight fields the invitation wire shape declares — and no ninth. */
const INVITATION_FIELDS = [
  'createdAt',
  'email',
  'expiresAt',
  'id',
  'redeemedAt',
  'revokedAt',
  'roleHint',
  'tenantId',
] as const;

const tokens = new Sha256InvitationTokenSource();
const permissive = new PermissiveForTestsPolicyService();
const clock = new Clock.Fixed(NOW);

/** The invitation routes carry a kill-switch guard; open it so the responses
 * under test are actually produced. Restriction is asserted elsewhere. */
const openKillSwitches: OperationGate = {
  assertOperationAllowed: () => Promise.resolve(Result.ok(undefined)),
};

let handle: PrismaHandle;
let auditAdapter: PostgresPersistenceAdapter;

function emailSource(byUser: Record<string, string | null>): RedeemerEmailSource {
  return {
    verifiedEmailOf: (userId) => Promise.resolve(byUser[UserId.toString(userId)] ?? null),
  };
}

/**
 * The real controller over the real use cases, mounted through the real
 * module. `redeemerEmails` is the only per-test variation.
 */
async function appWith(redeemerEmails: RedeemerEmailSource): Promise<NestFastifyApplication> {
  const memberships = new PrismaMembershipRepository(handle);
  const invitations = new PrismaInvitationRepository(handle);
  const { auditTrail } = buildAuditTrail(auditAdapter);
  const principalSource: TenancyPrincipalSource = {
    // The session-resolved principal, exactly as the composition root supplies
    // it — never read from the request the tests send.
    fromRequest: () => ({ tenantId: TENANT_A, userId: USER_A1 }),
    redeemerFromRequest: () => ({ userId: USER_NEW }),
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      TenancyApiModule.register({
        useCases: {
          getOwnTenant: new GetOwnTenant(new PrismaTenantRepository(handle), memberships),
          listMembers: new ListMembers(memberships, permissive),
          createInvitation: new CreateInvitation(
            invitations,
            memberships,
            permissive,
            tokens,
            auditTrail,
            clock,
          ),
          revokeInvitation: new RevokeInvitation(
            invitations,
            memberships,
            permissive,
            auditTrail,
            clock,
          ),
          redeemInvitation: new RedeemInvitation(
            invitations,
            tokens,
            redeemerEmails,
            auditTrail,
            clock,
          ),
        },
        principalSource,
        killSwitches: openKillSwitches,
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

interface Answer {
  statusCode: number;
  /** The RAW bytes the client receives — not a re-serialization of an object. */
  raw: string;
  body: Record<string, unknown>;
}

async function post(
  url: string,
  payload: Record<string, unknown>,
  emails: RedeemerEmailSource = emailSource({}),
): Promise<Answer> {
  const app = await appWith(emails);
  try {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'POST', url, payload, headers: { 'content-type': 'application/json' } });
    return {
      statusCode: response.statusCode,
      raw: response.payload,
      body: response.json() as Record<string, unknown>,
    };
  } finally {
    await app.close();
  }
}

/** Reads the row's secret back, under the inviting tenant's own context. */
async function storedTokenHash(invitationId: string): Promise<string | undefined> {
  return asApp(
    database,
    { tenantId: TenantId.toString(TENANT_A), userId: UserId.toString(USER_A1) },
    async (tx) =>
      (
        await tx.query<{ token_hash: string }>(
          'SELECT token_hash FROM public.tenant_invitations WHERE id = $1',
          [invitationId],
        )
      ).rows[0]?.token_hash,
  );
}

/**
 * The whole property in one place, so every invitation-bearing surface is held
 * to the same standard and a newly added one can be pointed at it.
 */
function expectNoBearerMaterial(answer: Answer, secrets: { hash: string; rawToken?: string }): void {
  expect(answer.raw).not.toContain('tokenHash');
  expect(answer.raw).not.toContain('token_hash');
  // The value itself, not just the field name: a rename would not make the
  // leak safe, and a mapper that spread the row under a different key would
  // still be caught here.
  expect(answer.raw).not.toContain(secrets.hash);
  if (secrets.rawToken !== undefined) {
    expect(answer.raw).not.toContain(secrets.rawToken);
  }
}

function expectClosedInvitationShape(invitation: Record<string, unknown>): void {
  expect(Object.keys(invitation).sort()).toEqual([...INVITATION_FIELDS]);
}

describe.skipIf(unreachable !== null)('invitation responses (live PostgreSQL)', () => {
  beforeAll(async () => {
    await provisionDatabase(database);
    handle = buildHandle(database);
    auditAdapter = new PostgresPersistenceAdapter(appProfile(database));
  }, 60_000);

  afterAll(async () => {
    await handle?.end();
    await auditAdapter?.end();
    await dropDatabase(database);
  });

  it('POST /tenancy/invitations returns the invitation and the raw token — and NOT the hash', async () => {
    const created = await post('/tenancy/invitations', {
      email: INVITED_EMAIL,
      roleHint: 'MEMBER',
    });

    expect(created.statusCode).toBe(201);
    // NON-EMPTY FIRST: a broken surface that answered `{}` would satisfy every
    // "does not contain" assertion below while proving nothing at all.
    const invitation = created.body.invitation as Record<string, unknown>;
    expect(invitation.email).toBe(INVITED_EMAIL);
    expect(String(invitation.id)).toMatch(/^[0-9a-f-]{36}$/i);
    const rawToken = String(created.body.token);
    expect(rawToken.length).toBeGreaterThan(20);

    // The secret genuinely exists and is genuinely at rest: the row holds
    // sha256(token). Without this, "the response omits the hash" could be true
    // merely because no hash was ever computed.
    const hash = await storedTokenHash(String(invitation.id));
    expect(hash).toBe(tokens.hashOf(rawToken));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // THE PROPERTY, on the bytes that leave the process.
    expectNoBearerMaterial(created, { hash: String(hash) });
    // The raw token appears here and ONLY here — this is the one response the
    // contract allows it in, so it is asserted present rather than absent.
    expect(created.raw).toContain(rawToken);

    expectClosedInvitationShape(invitation);
    // The envelope is closed too: exactly the invitation and the once-shown
    // token, so a future `...result.value` spread cannot quietly add a third.
    expect(Object.keys(created.body).sort()).toEqual(['invitation', 'token']);
  });

  it('POST /tenancy/invitations/:id/revoke returns the invitation with neither hash nor token', async () => {
    const created = await post('/tenancy/invitations', { email: 'revoked.person@example.com' });
    expect(created.statusCode).toBe(201);
    const invitationId = String((created.body.invitation as Record<string, unknown>).id);
    const rawToken = String(created.body.token);
    const hash = String(await storedTokenHash(invitationId));

    const revoked = await post(`/tenancy/invitations/${invitationId}/revoke`, {});

    expect(revoked.statusCode).toBe(200);
    const invitation = revoked.body.invitation as Record<string, unknown>;
    // Non-empty first: this really is the invitation, and really is revoked.
    expect(invitation.id).toBe(invitationId);
    expect(invitation.revokedAt).not.toBeNull();

    // Neither the hash NOR the raw token: the token was shown once, at
    // creation, and a revocation answer is not a second chance to read it.
    expectNoBearerMaterial(revoked, { hash, rawToken });
    expectClosedInvitationShape(invitation);
    expect(Object.keys(revoked.body).sort()).toEqual(['invitation']);
  });

  it('POST /tenancy/invitations/redeem answers without echoing the presented token or its hash', async () => {
    const created = await post('/tenancy/invitations', { email: INVITED_EMAIL });
    expect(created.statusCode).toBe(201);
    const invitationId = String((created.body.invitation as Record<string, unknown>).id);
    const rawToken = String(created.body.token);
    const hash = String(await storedTokenHash(invitationId));

    const redeemed = await post(
      '/tenancy/invitations/redeem',
      { token: rawToken },
      emailSource({ [UserId.toString(USER_NEW)]: INVITED_EMAIL }),
    );

    expect(redeemed.statusCode).toBe(200);
    // Non-empty first: the redemption really happened, for the real redeemer.
    expect(redeemed.body.tenantId).toBe(TenantId.toString(TENANT_A));
    const membership = redeemed.body.membership as Record<string, unknown>;
    expect(membership.userId).toBe(UserId.toString(USER_NEW));
    expect(membership.state).toBe('ACTIVE');

    // The redemption answer is the caller's new membership — never a receipt
    // of the credential they presented. Echoing either form would put bearer
    // material into logs, proxies, and client storage for no benefit.
    expectNoBearerMaterial(redeemed, { hash, rawToken });
    // The privilege evidence the use case returns is internal assurance, not
    // client data: it names GUCs and the database role and stays inside.
    expect(redeemed.raw).not.toContain('privilegeEvidence');
    expect(redeemed.raw).not.toContain('karar_app');
    expect(Object.keys(redeemed.body).sort()).toEqual(['membership', 'tenantId']);
  });

  it('reports a redemption failure without disclosing whether the token exists', async () => {
    const created = await post('/tenancy/invitations', { email: 'mismatch@example.com' });
    const invitationId = String((created.body.invitation as Record<string, unknown>).id);
    const rawToken = String(created.body.token);
    const hash = String(await storedTokenHash(invitationId));

    // A real token, the wrong redeemer: the denial must not become an oracle
    // by quoting back the material it looked up.
    const denied = await post(
      '/tenancy/invitations/redeem',
      { token: rawToken },
      emailSource({ [UserId.toString(USER_NEW)]: 'someone.else@example.com' }),
    );

    expect(denied.statusCode).toBe(409);
    expect(denied.body.code).toBe('INVITATION_NOT_REDEEMABLE');
    expectNoBearerMaterial(denied, { hash, rawToken });
    // Nor the invitee's address, which the caller has not proven any right to.
    expect(denied.raw).not.toContain('mismatch@example.com');
  });
});
