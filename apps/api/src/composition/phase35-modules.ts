/**
 * Phase 3.5 composition — jurisdiction, capability availability, the client
 * bootstrap surface, and the Phase 4 client-contract reads, built on the
 * primitives the Phase 3 composition already constructed (one Prisma handle,
 * one audit use case, one clock).
 *
 * Capability is composed because bootstrap's ports need real implementations
 * behind them; subject-policy composes nothing this phase — its selection
 * reader exists for capability-owned resolvers, and no capability is
 * implemented.
 *
 * The Phase 4 additions are READS the client already had code for and no
 * contract to call: the caller's own memberships (so a bound session can
 * offer a switch target), the declarable jurisdiction references (so the
 * declaration screen can offer a chooser instead of a free-text field), and
 * the legal-document content path (so consent text is server-supplied rather
 * than an internal locator the client cannot fetch). None of them writes.
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
  ListDeclarableJurisdictions,
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

import { ListOwnMemberships, TenancySelfApiModule } from '@karar/tenancy';
import { PrismaMembershipRepository } from '@karar/tenancy';

import { ConsentDocumentContentApiModule, GetLegalDocumentContent } from '@karar/consent';
import { PrismaLegalDocumentRepository } from '@karar/consent/dist/infrastructure/persistence/prisma-legal-document-repository.js';
import { OperatingEntityDirectoryAdapter } from '@karar/consent/dist/infrastructure/operating-entity/operating-entity-directory-adapter.js';
import { legalDocumentContentSourceFor } from '@karar/consent/dist/infrastructure/content/local-seed-content-source.js';
import { Sha256ContentDigest } from '@karar/consent/dist/infrastructure/providers/sha256-content-digest.js';

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
import type { FinancialCapabilityResolution } from './financial-capability-gate.js';
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

export interface Phase35Composition {
  readonly modules: DynamicModule[];
  /**
   * The capability resolver the bootstrap document is projected from, handed
   * onward so the Phase 5 financial gate refuses from the SAME facts rather
   * than from a second lookup of its own.
   */
  readonly capabilityResolution: FinancialCapabilityResolution;
}

export function composePhase35Modules(input: Phase35CompositionInput): Phase35Composition {
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
  // The READ side of the same narrow surface: which register entries the
  // declaration above would accept, projected client-safe. It reads the same
  // SELECT-only directory and writes nothing; the declarability rule is one
  // shared domain predicate, so the offered set cannot drift from the
  // accepted one.
  const listDeclarableJurisdictions = new ListDeclarableJurisdictions(jurisdictionDirectory);

  // Tenancy, SELF scope: the caller's own memberships across tenants. Phase
  // 3.5 built the use case and the 0080 self-arm it reads through; nothing
  // mounted them, so a bound session could see no switch target. The
  // repository is constructed on the SAME app-role Prisma handle as every
  // other repository here — a second instance over one handle, not a second
  // connection.
  const listOwnMemberships = new ListOwnMemberships(new PrismaMembershipRepository(prisma), clock);

  // Consent, document CONTENT: the text a subject must read before accepting,
  // with its language.
  //
  // The source is chosen by ENVIRONMENT, and only `local` gets one that
  // returns bytes — a synthetic fixture that says so in its own first line.
  // Every deployed environment gets `NoContentSourceConfigured`, which
  // retrieves nothing, so the endpoint reports that absence rather than
  // substituting prose. There is still no document store and no reviewed legal
  // text; the fixture exists so a developer can exercise the read-and-accept
  // path locally, not so the product has wording.
  //
  // The selector is not the gate that matters. The fixture bytes live in a
  // private fixtures package that is a devDependency of no production
  // closure, so a deployed install has no copy of the text to serve — this
  // line cannot be reached past into serving synthetic prose, because in a
  // deployed artefact there is none. That package is named in exactly one
  // place, the consent module's content-source selection, which is also where
  // its local/test refusal sits, next to the bytes; naming it here as well
  // would widen the set of production files that mention it, which
  // modules/consent/__tests__/production-closure.test.ts holds to one. The
  // digest holds whatever a source returns to the hash the published version
  // pinned, so the fixture has to match the database rather than assert its
  // own integrity.
  const legalDocuments = new PrismaLegalDocumentRepository(prisma.client);
  const getLegalDocumentContent = new GetLegalDocumentContent(
    legalDocuments,
    new OperatingEntityDirectoryAdapter(input.resolveEntity),
    legalDocumentContentSourceFor(environment),
    new Sha256ContentDigest(),
  );

  // Capability — its ceiling comes from the jurisdiction resolution above.
  //
  // The resolver is named rather than inlined because it is SHARED: the
  // bootstrap document's client view is projected from it, and the Phase 5
  // financial gate refuses execution from it (composition/financial-capability-gate.ts).
  // One instance, one set of facts — so "the client was told the capability is
  // not navigable" and "the route refuses" cannot drift apart.
  const registry = productionRegistryView();
  const capabilityResolution = new ResolveCapabilityAvailability(
    registry,
    environment,
    new JurisdictionCeilingSource({ assignments: userAssignments, activePackVersion, clock }),
    new PrismaCapabilityAvailabilityRepository(prisma),
    new PrismaTenantCapabilityEntitlementRepository(prisma),
    new ConsentGateAdapter(input.consentStatus),
    new LicenceDirectoryAdapter(input.resolveEntity, input.entities, input.licences),
    new NoProvidersConfiguredSource(),
    new CapabilityAuditTrail(recordAudit, environment),
  );
  const clientCapabilityView = new ResolveClientCapabilityView(registry, capabilityResolution);

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

  const modules: DynamicModule[] = [
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
    TenancySelfApiModule.register({
      useCases: { listOwnMemberships },
      principalSource: {
        // The SAME server-side principal every other surface here reads. The
        // tenant binding is deliberately dropped: this read must work before
        // one exists, and must not be narrowed to one when it does — a bound
        // session that could only see its current tenant would have no switch
        // target, which is the gap this surface closes.
        fromRequest: (request: unknown) => {
          const principal = bootstrapPrincipalFrom(request);
          return principal === null
            ? null
            : { userId: principal.userId, sessionId: principal.sessionId };
        },
      },
    }),
    ConsentDocumentContentApiModule.register({ getLegalDocumentContent }),
    JurisdictionApiModule.register({
      useCases: { declareOwnJurisdiction, listDeclarableJurisdictions },
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

  return { modules, capabilityResolution };
}
