/**
 * Phase 3.5 composition — jurisdiction, capability availability, and the
 * client bootstrap surface, built on the primitives the Phase 3 composition
 * already constructed (one Prisma handle, one audit use case, one clock).
 *
 * Only bootstrap mounts HTTP. Jurisdiction and capability are composed
 * because bootstrap's ports need real implementations behind them;
 * subject-policy composes nothing this phase — its selection reader exists
 * for capability-owned resolvers, and no capability is implemented.
 *
 * Every port is bound to a real implementation or to a deliberately denying
 * one. Nothing is stubbed to succeed: an unfinished seam reports absence or
 * fails closed, never a fabricated value.
 */

import type { DynamicModule } from '@nestjs/common';
import type { Clock, TenantId, UserId } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import type { RecordAuditEvent } from '@karar/audit';
import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';

import {
  DeclareOwnJurisdiction,
  GetActivePackVersion,
  JurisdictionApiModule,
  JurisdictionAuditTrail,
} from '@karar/jurisdiction';
import type { JurisdictionPrincipal } from '@karar/jurisdiction';
import { PrismaUserJurisdictionAssignmentRepository } from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-assignment-repositories.js';
import {
  PrismaJurisdictionDirectory,
  PrismaPackActivationLedger,
} from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-configuration-repositories.js';
import { Uuidv7IdSource as JurisdictionIdSource } from '@karar/jurisdiction/dist/infrastructure/persistence/uuidv7-id-source.js';
import type { PolicyEnvironment } from '@karar/jurisdiction-policy';

import {
  CapabilityAuditTrail,
  NoProvidersConfiguredSource,
  ResolveCapabilityAvailability,
  ResolveClientCapabilityView,
  productionRegistryView,
} from '@karar/capability';
import { ConsentGateAdapter } from '@karar/capability/dist/infrastructure/consent/consent-gate-adapter.js';
import { LicenceDirectoryAdapter } from '@karar/capability/dist/infrastructure/operating-entity/licence-directory-adapter.js';
import { PrismaCapabilityAvailabilityRepository } from '@karar/capability/dist/infrastructure/persistence/prisma-availability-repository.js';
import { PrismaTenantCapabilityEntitlementRepository } from '@karar/capability/dist/infrastructure/persistence/prisma-entitlement-repository.js';

import { BootstrapApiModule, GetBootstrap, SetTenantBinding } from '@karar/bootstrap';
import type {
  BootstrapSubject,
  ClientCapabilitiesResolution,
  EnrichmentSubject,
  JurisdictionResolution,
  OperatingEntityStateView,
  PolicyPackResolution,
} from '@karar/bootstrap/dist/application/ports/context-enrichment.js';
import type {
  BindSessionPort,
  ResolveTenantContextPort,
  RevokeSessionPort,
  SwitchTenantPort,
} from '@karar/bootstrap/dist/application/ports/tenant-context.js';
import type { AuditTrail } from '@karar/bootstrap/dist/application/ports/audit-trail.js';
import type { GetOwnConsentStatus } from '@karar/consent';
import { GetEffectiveOperatingEntitySummary } from '@karar/operating-entity';
import type {
  EntityLicenceRepository,
  OperatingEntityRepository,
  ResolveEffectiveOperatingEntity,
} from '@karar/operating-entity';
import { PrismaOperatingEntitySummaryReader } from '@karar/operating-entity/dist/infrastructure/persistence/prisma-repositories.js';

import { bootstrapPrincipalFrom } from '../auth/principal-adapters.js';
import {
  BootstrapAuditTrail,
  clientContextOf,
  type ClientContextSource,
} from './bootstrap-adapters.js';
import { toBootstrapCapability } from './capability-view-adapter.js';
import { governingJurisdictionFor } from './effective-jurisdiction.js';
import { JurisdictionCeilingSource } from './jurisdiction-ceiling-source.js';

export interface Phase35CompositionInput {
  readonly environment: PolicyEnvironment;
  readonly prisma: PrismaHandle;
  readonly recordAudit: RecordAuditEvent;
  readonly clock: Clock;
  /** For surfacing resolution failures that would otherwise read as "none". */
  readonly logger: PlatformLogger;
  /** Tenancy's Phase 3.5 use cases, constructed by the Phase 3 composition. */
  readonly resolveTenantContext: ResolveTenantContextPort;
  readonly switchTenant: SwitchTenantPort;
  /** Identity's binding mechanics, from the identity runtime's use cases. */
  readonly bindSession: BindSessionPort;
  readonly revokeSession: RevokeSessionPort;
  /** Phase 3 pieces the capability gates read through. */
  readonly consentStatus: GetOwnConsentStatus;
  readonly resolveEntity: ResolveEffectiveOperatingEntity;
  readonly entities: OperatingEntityRepository;
  readonly licences: EntityLicenceRepository;
  /** Identity's edge context — digests client facts for the security ledger. */
  readonly edgeContext: ClientContextSource;
}

export function composePhase35Modules(input: Phase35CompositionInput): DynamicModule[] {
  const { prisma, recordAudit, clock, environment, logger } = input;

  // Jurisdiction — reads, plus the ONE subject-facing write: a caller
  // declaring its own jurisdiction. Operator assignment, verification, and
  // pack activation remain unmounted with their permissions unseeded.
  const userAssignments = new PrismaUserJurisdictionAssignmentRepository(prisma);
  const jurisdictionDirectory = new PrismaJurisdictionDirectory(prisma.client);
  const activePackVersion = new GetActivePackVersion(
    new PrismaPackActivationLedger(prisma.client),
    jurisdictionDirectory,
  );
  // USER_DECLARED / UNVERIFIED are fixed inside the use case, so this binding
  // cannot be configured into a verification path.
  const declareOwnJurisdiction = new DeclareOwnJurisdiction(
    userAssignments,
    jurisdictionDirectory,
    new JurisdictionIdSource(),
    new JurisdictionAuditTrail(recordAudit, environment),
  );

  // Capability — its ceiling comes from the jurisdiction resolution above.
  const registry = productionRegistryView();
  const clientCapabilityView = new ResolveClientCapabilityView(
    registry,
    new ResolveCapabilityAvailability(
      registry,
      environment,
      new JurisdictionCeilingSource({ assignments: userAssignments, activePackVersion, clock }),
      new PrismaCapabilityAvailabilityRepository(prisma),
      new PrismaTenantCapabilityEntitlementRepository(prisma),
      new ConsentGateAdapter(input.consentStatus),
      new LicenceDirectoryAdapter(input.resolveEntity, input.entities, input.licences),
      new NoProvidersConfiguredSource(),
      new CapabilityAuditTrail(recordAudit, environment),
    ),
  );

  // Operating entity — the CLIENT-SAFE projection only. The reader SELECTs
  // the reviewed columns; the id it reads is never caller-supplied, it comes
  // from the principal's own binding via the resolution below.
  const entitySummary = new GetEffectiveOperatingEntitySummary(
    input.resolveEntity,
    new PrismaOperatingEntitySummaryReader(prisma.client),
  );

  const auditTrail: AuditTrail = new BootstrapAuditTrail(recordAudit, environment);

  const bootstrapDeps = {
    resolveTenantContext: input.resolveTenantContext,
    bindSession: input.bindSession,
    revokeSession: input.revokeSession,
    auditTrail,
    clock,

    jurisdiction: {
      // The assignment read is tenant+user RLS-scoped: without a bound tenant
      // there is no context to read under, so the state is NONE — the
      // fail-closed value, never null. A read that FAILED is a different
      // value again: UNAVAILABLE, so the caller is not told it has no
      // jurisdiction when the truth is that nobody could look.
      stateFor: async (subject: BootstrapSubject): Promise<JurisdictionResolution> => {
        try {
          const governing = await governingJurisdictionFor(userAssignments, clock, subject);
          return governing.kind === 'NONE' || governing.code === null
            ? { kind: 'NONE' }
            : { kind: governing.kind, assignment: { jurisdictionId: governing.code } };
        } catch (error) {
          logger.error({ err: error }, 'jurisdiction assignment could not be read');
          return { kind: 'UNAVAILABLE', retryable: true };
        }
      },
    },

    operatingEntity: {
      // Safe summary, explicit UNASSIGNED, or explicit UNAVAILABLE — never a
      // fabricated entity. A read failure degrades this section only; the
      // rest of the context is complete without it.
      effectiveFor: async (subject: BootstrapSubject): Promise<OperatingEntityStateView> => {
        // No bound tenant, no binding to resolve: nothing is assigned.
        if (subject.tenantId === null) return { kind: 'UNASSIGNED' };
        try {
          const summary = await entitySummary.execute({
            tenantId: subject.tenantId as TenantId,
            userId: subject.userId as UserId,
            at: clock.now(),
          });
          if (!summary.ok) {
            if (summary.error.kind === 'NO_EFFECTIVE_ENTITY') return { kind: 'UNASSIGNED' };
            logger.error({ err: summary.error }, 'operating-entity summary could not be read');
            return { kind: 'UNAVAILABLE' };
          }
          return {
            kind: 'ASSIGNED',
            entity: {
              id: summary.value.id,
              name: summary.value.legalName,
              jurisdictionRef: summary.value.registeredJurisdictionRef,
              contactReference: summary.value.dataProtectionContact,
            },
          };
        } catch (error) {
          logger.error({ err: error }, 'operating-entity summary read threw');
          return { kind: 'UNAVAILABLE' };
        }
      },
    },

    policyPack: {
      // Version and lifecycle only, keyed on the TYPED jurisdiction state —
      // the identifier inside it is data for pack selection, never a branch.
      statusFor: async (subject: EnrichmentSubject): Promise<PolicyPackResolution> => {
        if (subject.jurisdiction.kind === 'NONE') return { kind: 'NONE' };
        try {
          const active = await activePackVersion.execute({
            jurisdictionCode: subject.jurisdiction.assignment.jurisdictionId,
            environment,
          });
          if (!active.ok) {
            // A store failure is not "no pack", and an assignment pointing at
            // a code the register does not hold is a broken invariant, not an
            // absence. Both report UNAVAILABLE; only the store fault is worth
            // retrying.
            logger.error({ err: active.error }, 'active policy pack could not be read');
            return { kind: 'UNAVAILABLE', retryable: active.error.kind === 'STORE_FAILURE' };
          }
          return active.value.active
            ? {
                kind: 'ACTIVE',
                status: {
                  version: active.value.packVersion,
                  status: active.value.packLifecycleAtActivation,
                },
              }
            : { kind: 'NONE' };
        } catch (error) {
          logger.error({ err: error }, 'active policy pack read threw');
          return { kind: 'UNAVAILABLE', retryable: true };
        }
      },
    },

    capabilities: {
      // Already client-safe when it arrives: hidden capabilities and hidden
      // reasons are absent by contract. Only the shape is translated.
      resolveFor: async (subject: EnrichmentSubject): Promise<ClientCapabilitiesResolution> => {
        // An unbound session has no tenant scope to resolve against; that is
        // a real, resolved answer of "none", not a failure.
        if (subject.tenantId === null) return { kind: 'RESOLVED', capabilities: [] };
        try {
          const view = await clientCapabilityView.execute({
            subject: { tenantId: subject.tenantId as TenantId, userId: subject.userId as UserId },
            now: clock.now(),
          });
          if (!view.ok) {
            // An empty array here would be indistinguishable from "you
            // legitimately have none". Reporting UNAVAILABLE keeps the denial
            // and makes the outage visible to the client and to operations.
            logger.error({ err: view.error }, 'capability resolution failed');
            return {
              kind: 'UNAVAILABLE',
              retryable: view.error.kind !== 'UNKNOWN_CAPABILITY',
            };
          }
          return {
            kind: 'RESOLVED',
            capabilities: view.value.capabilities.map(toBootstrapCapability),
          };
        } catch (error) {
          logger.error({ err: error }, 'capability resolution threw');
          return { kind: 'UNAVAILABLE', retryable: true };
        }
      },
    },
  };

  return [
    BootstrapApiModule.register({
      useCases: {
        getBootstrap: new GetBootstrap(bootstrapDeps),
        setTenantBinding: new SetTenantBinding({
          resolveTenantContext: input.resolveTenantContext,
          bindSession: input.bindSession,
          revokeSession: input.revokeSession,
          switchTenant: input.switchTenant,
          auditTrail,
          clock,
        }),
      },
      principalSource: {
        fromRequest: bootstrapPrincipalFrom,
        clientContextOf: (request: unknown) => clientContextOf(input.edgeContext, request),
      },
    }),
    JurisdictionApiModule.register({
      useCases: { declareOwnJurisdiction },
      principalSource: {
        // The SAME server-side principal the bootstrap surface reads — derived
        // from the session row, never from query, header, or body. An unbound
        // session yields tenantId null and the controller refuses: there is no
        // RLS context to write an assignment under.
        fromRequest: (request: unknown): JurisdictionPrincipal | null => {
          const principal = bootstrapPrincipalFrom(request);
          return principal === null
            ? null
            : { userId: principal.userId, tenantId: principal.tenantId };
        },
      },
      clock,
    }),
  ];
}
