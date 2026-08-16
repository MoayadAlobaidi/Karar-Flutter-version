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

import { GetActivePackVersion } from '@karar/jurisdiction';
import { PrismaUserJurisdictionAssignmentRepository } from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-assignment-repositories.js';
import {
  PrismaJurisdictionDirectory,
  PrismaPackActivationLedger,
} from '@karar/jurisdiction/dist/infrastructure/persistence/prisma-configuration-repositories.js';
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
  EnrichmentSubject,
  JurisdictionStateView,
} from '@karar/bootstrap/dist/application/ports/context-enrichment.js';
import type {
  BindSessionPort,
  ResolveTenantContextPort,
  RevokeSessionPort,
  SwitchTenantPort,
} from '@karar/bootstrap/dist/application/ports/tenant-context.js';
import type { AuditTrail } from '@karar/bootstrap/dist/application/ports/audit-trail.js';
import type { GetOwnConsentStatus } from '@karar/consent';
import type {
  EntityLicenceRepository,
  OperatingEntityRepository,
  ResolveEffectiveOperatingEntity,
} from '@karar/operating-entity';

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

  // Jurisdiction — reads only. Assignment and activation writes have no HTTP
  // surface this phase and their permissions are deliberately unseeded.
  const userAssignments = new PrismaUserJurisdictionAssignmentRepository(prisma);
  const activePackVersion = new GetActivePackVersion(
    new PrismaPackActivationLedger(prisma.client),
    new PrismaJurisdictionDirectory(prisma.client),
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
      // fail-closed value, never null.
      stateFor: async (subject: BootstrapSubject): Promise<JurisdictionStateView> => {
        const governing = await governingJurisdictionFor(userAssignments, clock, subject);
        return governing.kind === 'NONE' || governing.code === null
          ? { kind: 'NONE' }
          : { kind: governing.kind, assignment: { jurisdictionId: governing.code } };
      },
    },

    operatingEntity: {
      // The operating-entity module resolves the effective entity, but the
      // safe id/name projection this port wants is not on its read surface
      // yet. Reporting absence is honest; inventing a name is not. Completing
      // it is entry work for the phase that needs the reference displayed.
      effectiveFor: () => Promise.resolve(null),
    },

    policyPack: {
      // Version and lifecycle only, keyed on the TYPED jurisdiction state —
      // the identifier inside it is data for pack selection, never a branch.
      statusFor: async (subject: EnrichmentSubject) => {
        if (subject.jurisdiction.kind === 'NONE') return null;
        const active = await activePackVersion.execute({
          jurisdictionCode: subject.jurisdiction.assignment.jurisdictionId,
          environment,
        });
        if (!active.ok) {
          // A store failure is not "no pack": say so, then report absence.
          logger.error({ err: active.error }, 'active policy pack could not be read');
          return null;
        }
        return active.value.active
          ? { version: active.value.packVersion, status: active.value.packLifecycleAtActivation }
          : null;
      },
    },

    capabilities: {
      // Already client-safe when it arrives: hidden capabilities and hidden
      // reasons are absent by contract. Only the shape is translated.
      resolveFor: async (subject: EnrichmentSubject) => {
        if (subject.tenantId === null) return [];
        const view = await clientCapabilityView.execute({
          subject: { tenantId: subject.tenantId as TenantId, userId: subject.userId as UserId },
          now: clock.now(),
        });
        if (!view.ok) {
          // An empty array would be indistinguishable from "you legitimately
          // have none". The response still denies (correct), but the failure
          // must not be invisible to operations.
          logger.error({ err: view.error }, 'capability resolution failed; reporting none');
          return [];
        }
        return view.value.capabilities.map(toBootstrapCapability);
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
  ];
}
