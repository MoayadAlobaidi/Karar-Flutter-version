/**
 * Phase 3 module composition — the ONLY place the identity, users, tenancy,
 * consent, authorization, and control-plane modules meet their
 * infrastructure. main.ts calls this once and mounts the returned dynamic
 * modules; tests and the boot path share the same wiring.
 *
 * Composition rules honored here:
 * - Repositories are built on the ONE app-role Prisma handle
 *   (`createPrismaClient`); the audit writer shares main's
 *   PostgresPersistenceAdapter. Everything connects lazily — booting without
 *   PostgreSQL or Redis must succeed (probes report readiness; guarded
 *   operations fail closed at call time). The ONE exception is the rate-limit
 *   store's socket, returned as `rateLimitStore` for main.ts to open before
 *   it listens: the limiter has no offline queue, so a connection still being
 *   established when the first login arrives would fail closed on a store
 *   that is up. Opening it is still not REQUIRING it — a store that is down
 *   leaves the boot alone and shows up as `redis: 'down'` in /readyz.
 * - The kill-switch gate is ONE CheckKillSwitch instance: it satisfies
 *   identity's and tenancy's own OperationGate ports structurally and is the
 *   KILL_SWITCH_PORT the control-plane module exports.
 * - Local-only providers (mail sink, dev encryption, dev signing keys) THROW
 *   outside KARAR_ENV=local — no real providers exist yet, and pretending
 *   otherwise would be a silent security hole (threat model, Phase 3
 *   residuals).
 * - No caching around authorization: RbacPolicyService re-reads grants per
 *   decision, so a revocation takes effect immediately.
 */

import type { DynamicModule } from '@nestjs/common';
import type { Clock, UserId } from '@karar/shared-kernel';
import type { AppConfig } from '@karar/platform/dist/config/index.js';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';
import { redisEndpointFromEnv } from '@karar/platform/dist/config/index.js';
import {
  LocalPostgresConnectionProfile,
  type PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient } from '@karar/platform/dist/db/prisma.js';
import {
  TRUSTED_PROXIES_ENV_VAR,
  TrustedProxyPolicy,
  parseTrustedProxySpec,
} from '@karar/platform/dist/http/index.js';
import { LocalDevEncryptionProvider } from '@karar/platform/dist/keys/index.js';
import { LocalMailSink } from '@karar/platform/dist/notifications/index.js';
import {
  RateLimitRedisConnection,
  RedisSlidingWindowRateLimiter,
  createRateLimitRedisClient,
} from '@karar/platform/dist/ratelimit/index.js';

import { RecordAuditEvent } from '@karar/audit';
import { PostgresAuditWriter } from '@karar/audit/dist/infrastructure/persistence/postgres-audit-writer.js';
import { Uuidv7AuditEventIdSource } from '@karar/audit/dist/infrastructure/persistence/uuidv7-audit-event-id-source.js';

import {
  AuthController,
  IdentityApiModule,
  LocalDevKeyProvider,
  MfaController,
  PasswordController,
  SessionsController,
  createIdentityRuntime,
  loadIdentityConfig,
} from '@karar/identity';
import {
  GetOwnProfile,
  PrismaUserProfileRepository,
  RecordAuditEventAuditTrail as UsersAuditTrail,
  RequestAccountDisable,
  UpdateOwnProfile,
  UsersApiModule,
} from '@karar/users';
import {
  CreateInvitation,
  GetOwnTenant,
  ListMembers,
  PrismaInvitationRepository,
  PrismaMembershipRepository,
  PrismaTenantRepository,
  RecordAuditEventAuditTrail as TenancyAuditTrail,
  RedeemInvitation,
  ResolveTenantContext,
  RevokeInvitation,
  SwitchTenant,
  Sha256InvitationTokenSource,
  TenancyApiModule,
} from '@karar/tenancy';
import {
  ConsentApiModule,
  ConsentAuditTrail,
  GetOwnConsentStatus,
  ListApplicableDocuments,
  RecordOwnAcceptance,
  WithdrawOwnConsent,
} from '@karar/consent';
import { PrismaConsentGrantRepository } from '@karar/consent/dist/infrastructure/persistence/prisma-consent-grant-repository.js';
import { PrismaLegalDocumentRepository } from '@karar/consent/dist/infrastructure/persistence/prisma-legal-document-repository.js';
import { Uuidv7IdSource } from '@karar/consent/dist/infrastructure/persistence/uuidv7-id-source.js';
import { OperatingEntityDirectoryAdapter } from '@karar/consent/dist/infrastructure/operating-entity/operating-entity-directory-adapter.js';
import { ResolveEffectiveOperatingEntity } from '@karar/operating-entity';
import {
  PrismaEntityAssignmentRepository,
  PrismaEntityLicenceRepository,
  PrismaOperatingEntityRepository,
} from '@karar/operating-entity/dist/infrastructure/persistence/prisma-repositories.js';
import { IdentityEdgeContext } from '@karar/identity/dist/presentation/http/identity-di.js';
import {
  AuthorizationModule,
  PrismaRoleAssignmentRepository,
  RbacPolicyService,
} from '@karar/authorization';
import { CheckKillSwitch, ControlPlaneModule, PrismaKillSwitchStore } from '@karar/control-plane';

import {
  policyActorFrom,
  sessionOnlyPrincipalFrom,
  tenantBoundPrincipalFrom,
} from '../auth/principal-adapters.js';
import { PrincipalEnrichmentGuard } from '../auth/request-principal.js';
import { JurisdictionConsentPinSource } from './consent-pin-source.js';
import { composePhase35Modules } from './phase35-modules.js';
import { composePhase5Modules } from './phase5-modules.js';

export interface ShutdownResource {
  readonly name: string;
  close(): Promise<void>;
}

export interface Phase3Composition {
  readonly modules: DynamicModule[];
  readonly enrichmentGuard: PrincipalEnrichmentGuard;
  readonly resources: ShutdownResource[];
  /**
   * The rate-limit store's connection: main.ts opens it before listening and
   * hands it to the readiness probes. It is drained through `resources` too.
   */
  readonly rateLimitStore: RateLimitRedisConnection;
}

export interface Phase3CompositionInput {
  readonly config: AppConfig;
  /** The raw environment, handed through main.ts exactly once. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** main's app-role adapter; the audit writer shares its pool. */
  readonly dbAdapter: PostgresPersistenceAdapter;
  /** The platform logger, for composition-level failures that must not be silent. */
  readonly logger: PlatformLogger;
}

export function composePhase3Modules(input: Phase3CompositionInput): Phase3Composition {
  const { config, env, dbAdapter, logger } = input;
  const clock: Clock = { now: () => new Date() };

  const prisma = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { env }));
  const recordAudit = new RecordAuditEvent(
    new PostgresAuditWriter(dbAdapter),
    new Uuidv7AuditEventIdSource(),
  );

  // Identity — runtime outside Nest (create-identity-runtime.ts contract).
  const redis = createRateLimitRedisClient(redisEndpointFromEnv(env));
  const rateLimitStore = new RateLimitRedisConnection(redis, {
    // Reconnect attempts during an outage are a retry log, not an incident —
    // readiness carries the state. They stay at debug so the outage does not
    // drown the signal, and never reach ioredis's own console.error.
    onConnectionError: (error) => {
      logger.debug({ err: error }, 'rate-limit store connection error');
    },
  });
  const identityRuntime = createIdentityRuntime({
    config: loadIdentityConfig(config.env, env),
    prisma,
    recordAudit,
    notifications: new LocalMailSink({ env: config.env }),
    encryption: new LocalDevEncryptionProvider({ env: config.env }),
    rateLimiter: new RedisSlidingWindowRateLimiter(redis),
    tokenKeys: new LocalDevKeyProvider({ env: config.env }),
    clock,
  });
  const trustedProxies = new TrustedProxyPolicy(
    parseTrustedProxySpec(env[TRUSTED_PROXIES_ENV_VAR]),
  );

  // Control plane — one CheckKillSwitch serves every gate and the exported port.
  const killSwitches = new CheckKillSwitch(new PrismaKillSwitchStore(prisma), clock);

  // Authorization — deny-by-default engine, re-read per decision (no cache).
  const policyService = new RbacPolicyService(new PrismaRoleAssignmentRepository(prisma), clock);

  // Users.
  const profiles = new PrismaUserProfileRepository(prisma);
  const usersAudit = new UsersAuditTrail(recordAudit, config.env);
  const usersUseCases = {
    getOwnProfile: new GetOwnProfile(profiles),
    updateOwnProfile: new UpdateOwnProfile(profiles, clock),
    requestAccountDisable: new RequestAccountDisable(profiles, usersAudit, clock),
  };

  // Tenancy. The redeemer's verified email comes from identity's account
  // store through the port TENANCY declared — identity is the system of
  // record for verified addresses.
  const tenants = new PrismaTenantRepository(prisma);
  const memberships = new PrismaMembershipRepository(prisma);
  const invitations = new PrismaInvitationRepository(prisma);
  const invitationTokens = new Sha256InvitationTokenSource();
  const tenancyAudit = new TenancyAuditTrail(recordAudit, config.env);
  const redeemerEmails = {
    verifiedEmailOf: async (userId: UserId): Promise<string | null> => {
      const account = await identityRuntime.deps.accounts.findById(userId);
      return account !== null && account.emailVerifiedAt !== null ? account.email : null;
    },
  };
  const tenancyUseCases = {
    getOwnTenant: new GetOwnTenant(tenants, memberships),
    listMembers: new ListMembers(memberships, policyService),
    createInvitation: new CreateInvitation(
      invitations,
      memberships,
      policyService,
      invitationTokens,
      tenancyAudit,
      clock,
    ),
    revokeInvitation: new RevokeInvitation(
      invitations,
      memberships,
      policyService,
      tenancyAudit,
      clock,
    ),
    redeemInvitation: new RedeemInvitation(
      invitations,
      invitationTokens,
      redeemerEmails,
      tenancyAudit,
      clock,
    ),
  };

  // Tenancy, Phase 3.5: membership resolution and tenant binding. The
  // identity module owns the session mechanics; tenancy verifies membership
  // server-side and drives them through the ports it declared.
  const resolveTenantContext = new ResolveTenantContext(memberships, tenants, clock);
  const switchTenant = new SwitchTenant(
    memberships,
    tenants,
    identityRuntime.useCases.rebindSessionTenant,
    identityRuntime.useCases.revokeSession,
    tenancyAudit,
    clock,
  );

  // Consent — consumer endpoints only; publication/classification have no
  // HTTP surface this phase.
  const documents = new PrismaLegalDocumentRepository(prisma.client);
  const grants = new PrismaConsentGrantRepository(prisma);
  const resolveEntity = new ResolveEffectiveOperatingEntity(
    new PrismaEntityAssignmentRepository(prisma.client),
  );
  const entityDirectory = new OperatingEntityDirectoryAdapter(resolveEntity);
  const consentAudit = new ConsentAuditTrail(recordAudit, config.env);
  const consentIds = new Uuidv7IdSource();
  const consentUseCases = {
    listApplicableDocuments: new ListApplicableDocuments(documents, entityDirectory),
    recordOwnAcceptance: new RecordOwnAcceptance(
      grants,
      documents,
      entityDirectory,
      consentIds,
      consentAudit,
    ),
    withdrawOwnConsent: new WithdrawOwnConsent(grants, consentAudit),
    getOwnConsentStatus: new GetOwnConsentStatus(grants, documents, entityDirectory),
    // Migration 0086: a grant written from Phase 3.5 on must pin the policy
    // provenance it was accepted under. The resolver lives at this edge; the
    // consent module only records what it decided.
    policyPinSource: new JurisdictionConsentPinSource(prisma, config.env, clock),
  };

  const enrichmentGuard = new PrincipalEnrichmentGuard(
    identityRuntime.useCases.authenticateRequest,
    new Set([AuthController, PasswordController, MfaController, SessionsController]),
  );

  const modules: DynamicModule[] = [
    IdentityApiModule.forRoot({ runtime: identityRuntime, trustedProxies, killSwitches }),
    UsersApiModule.register({
      useCases: usersUseCases,
      principalSource: { fromRequest: tenantBoundPrincipalFrom },
    }),
    TenancyApiModule.register({
      useCases: tenancyUseCases,
      principalSource: {
        fromRequest: tenantBoundPrincipalFrom,
        redeemerFromRequest: sessionOnlyPrincipalFrom,
      },
      killSwitches,
    }),
    ConsentApiModule.register(consentUseCases),
    AuthorizationModule.register({
      policyService,
      principalSource: { fromRequest: policyActorFrom },
    }),
    ControlPlaneModule.register({ killSwitchPort: killSwitches }),
    ...composePhase35Modules({
      environment: config.env,
      prisma,
      recordAudit,
      clock,
      logger,
      resolveTenantContext,
      switchTenant,
      bindSession: identityRuntime.useCases.bindSessionTenant,
      revokeSession: identityRuntime.useCases.revokeSession,
      consentStatus: consentUseCases.getOwnConsentStatus,
      resolveEntity,
      entities: new PrismaOperatingEntityRepository(prisma.client),
      licences: new PrismaEntityLicenceRepository(prisma.client),
      edgeContext: new IdentityEdgeContext(trustedProxies, identityRuntime.deps.digester),
    }),
    // Phase 5: the financial surface. Its composition resolves every
    // encryption, retention and source-store port through the modules' OWN
    // fail-closed resolvers, so a deployed environment with no approved
    // provider refuses to boot here rather than discovering it at the first
    // write (phase5-modules.ts states the ordering that makes that hold).
    ...composePhase5Modules({
      environment: config.env,
      prisma,
      clock,
      producer: config.service.name,
    }),
  ];

  return {
    modules,
    enrichmentGuard,
    rateLimitStore,
    resources: [
      { name: 'prisma', close: () => prisma.end() },
      // QUIT when the socket is live, dropped when it is not — see
      // RateLimitRedisConnection.close().
      { name: 'redis', close: () => rateLimitStore.close() },
    ],
  };
}
