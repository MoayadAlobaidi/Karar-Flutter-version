/**
 * In-memory port fakes for the resolver and management use cases. Tests may
 * deliberately construct states production refuses (that is the point of a
 * fake); nothing here touches a database or leaves the test process.
 */

import { Result } from '@karar/shared-kernel';
import { RecordAuditEvent, type AuditEvent, type AuditEventId } from '@karar/audit';

import type {
  AvailabilityState,
  CapabilityAvailabilityRecord,
} from '../../domain/availability-state.js';
import type {
  AvailabilityFacts,
  CeilingFacts,
  ConsentFacts,
  EntitlementFacts,
  LicensingFacts,
} from '../../domain/resolution.js';
import type {
  EntitlementStatus,
  TenantCapabilityEntitlement,
} from '../../domain/entitlement.js';
import type {
  PolicyCeilingQuery,
  PolicyCeilingSource,
} from '../../application/ports/policy-ceiling-source.js';
import type { CapabilityAvailabilityRepository } from '../../application/ports/availability-repository.js';
import type {
  EntitlementPrincipal,
  TenantCapabilityEntitlementRepository,
} from '../../application/ports/entitlement-repository.js';
import type { ConsentGate, ConsentSubject } from '../../application/ports/consent-gate.js';
import type {
  LicenceDirectory,
  LicensingSubject,
} from '../../application/ports/licence-directory.js';
import type {
  ProviderAvailabilitySource,
  ProviderConnectionStatus,
} from '../../application/ports/provider-availability-source.js';
import type {
  AuthorizationDenied,
  PolicyPrincipal,
  PolicyService,
} from '../../application/ports/policy-service.js';
import type { IdSource } from '../../application/ports/id-source.js';
import { CapabilityAuditTrail } from '../../application/audit-trail.js';

export class FixedCeilingSource implements PolicyCeilingSource {
  constructor(private facts: CeilingFacts) {}

  set(facts: CeilingFacts): void {
    this.facts = facts;
  }

  effectivePolicyFor(query: PolicyCeilingQuery): Promise<CeilingFacts> {
    void query;
    return Promise.resolve(this.facts);
  }
}

export class ThrowingCeilingSource implements PolicyCeilingSource {
  effectivePolicyFor(): Promise<CeilingFacts> {
    return Promise.reject(new Error('policy ceiling unavailable'));
  }
}

export class InMemoryAvailabilityRepository implements CapabilityAvailabilityRepository {
  readonly rows: CapabilityAvailabilityRecord[] = [];

  factsFor(
    environment: string,
    scopeRef: string | null,
    capabilityId: string,
  ): Promise<AvailabilityFacts> {
    const candidates = this.rows.filter(
      (row) =>
        row.capabilityId === capabilityId &&
        row.environment === environment &&
        (row.jurisdictionRef === scopeRef || row.jurisdictionRef === null),
    );
    const effective =
      candidates.find((row) => row.jurisdictionRef !== null && scopeRef !== null) ??
      candidates.find((row) => row.jurisdictionRef === null) ??
      null;
    if (effective !== null) {
      return Promise.resolve({
        kind: 'ROW',
        rowId: effective.id,
        state: effective.state,
        version: effective.version,
      });
    }
    const elsewhere = this.rows.some(
      (row) => row.capabilityId === capabilityId && row.environment !== environment,
    );
    return Promise.resolve({ kind: 'NO_ROW', existsForOtherEnvironment: elsewhere });
  }

  findExact(
    environment: string,
    scopeRef: string | null,
    capabilityId: string,
  ): Promise<CapabilityAvailabilityRecord | null> {
    return Promise.resolve(
      this.rows.find(
        (row) =>
          row.environment === environment &&
          row.capabilityId === capabilityId &&
          row.jurisdictionRef === scopeRef,
      ) ?? null,
    );
  }

  insert(record: CapabilityAvailabilityRecord, at: Date): Promise<void> {
    void at;
    this.rows.push(record);
    return Promise.resolve();
  }

  updateState(
    id: string,
    expectedVersion: number,
    state: AvailabilityState,
    reason: string,
    actorRef: string,
    at: Date,
  ): Promise<'UPDATED' | 'VERSION_CONFLICT'> {
    void at;
    const index = this.rows.findIndex((row) => row.id === id && row.version === expectedVersion);
    if (index === -1) return Promise.resolve('VERSION_CONFLICT');
    const current = this.rows[index] as CapabilityAvailabilityRecord;
    this.rows[index] = { ...current, state, reason, actorRef, version: expectedVersion + 1 };
    return Promise.resolve('UPDATED');
  }
}

export class InMemoryEntitlementRepository implements TenantCapabilityEntitlementRepository {
  readonly rows: TenantCapabilityEntitlement[] = [];

  factsFor(principal: EntitlementPrincipal, capabilityId: string): Promise<EntitlementFacts> {
    const row = this.rows.find(
      (r) => r.tenantId === principal.tenantId && r.capabilityId === capabilityId,
    );
    if (row === undefined) return Promise.resolve({ kind: 'NONE' });
    return Promise.resolve({
      kind: 'ROW',
      rowId: row.id,
      status: row.status,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      version: row.version,
    });
  }

  findByCapability(
    principal: EntitlementPrincipal,
    capabilityId: string,
  ): Promise<TenantCapabilityEntitlement | null> {
    return Promise.resolve(
      this.rows.find(
        (r) => r.tenantId === principal.tenantId && r.capabilityId === capabilityId,
      ) ?? null,
    );
  }

  insert(
    principal: EntitlementPrincipal,
    entitlement: TenantCapabilityEntitlement,
    at: Date,
  ): Promise<void> {
    void principal;
    void at;
    this.rows.push(entitlement);
    return Promise.resolve();
  }

  transition(
    principal: EntitlementPrincipal,
    id: string,
    expectedVersion: number,
    change: {
      readonly status: EntitlementStatus;
      readonly sourceRef: string;
      readonly reason: string;
      readonly actorRef: string;
      readonly effectiveFrom: Date;
      readonly effectiveTo: Date | null;
    },
    at: Date,
  ): Promise<'UPDATED' | 'VERSION_CONFLICT'> {
    void at;
    const index = this.rows.findIndex(
      (r) => r.id === id && r.tenantId === principal.tenantId && r.version === expectedVersion,
    );
    if (index === -1) return Promise.resolve('VERSION_CONFLICT');
    const current = this.rows[index] as TenantCapabilityEntitlement;
    this.rows[index] = { ...current, ...change, version: expectedVersion + 1 };
    return Promise.resolve('UPDATED');
  }
}

export class FixedConsentGate implements ConsentGate {
  readonly queries: Array<{ purposeRef: string; scopeRef: string }> = [];

  constructor(private facts: ConsentFacts) {}

  set(facts: ConsentFacts): void {
    this.facts = facts;
  }

  statusFor(
    subject: ConsentSubject,
    purposeRef: string,
    scopeRef: string,
    at: Date,
  ): Promise<ConsentFacts> {
    void subject;
    void at;
    this.queries.push({ purposeRef, scopeRef });
    return Promise.resolve(this.facts);
  }
}

export class FixedLicenceDirectory implements LicenceDirectory {
  constructor(private facts: LicensingFacts) {}

  set(facts: LicensingFacts): void {
    this.facts = facts;
  }

  licensingContextFor(
    subject: LicensingSubject,
    scopeRef: string,
    at: Date,
  ): Promise<LicensingFacts> {
    void subject;
    void scopeRef;
    void at;
    return Promise.resolve(this.facts);
  }
}

export class FixedProviderSource implements ProviderAvailabilitySource {
  constructor(
    private readonly statuses: Readonly<Record<string, ProviderConnectionStatus>>,
    private readonly fallback: ProviderConnectionStatus = 'NOT_CONFIGURED',
  ) {}

  statusFor(providerKind: string, environment: string): Promise<ProviderConnectionStatus> {
    void environment;
    return Promise.resolve(this.statuses[providerKind] ?? this.fallback);
  }
}

export class AllowAllPolicyService implements PolicyService {
  authorize(): Promise<Result<void, AuthorizationDenied>> {
    return Promise.resolve(Result.ok(undefined));
  }
}

export class DenyAllPolicyService implements PolicyService {
  authorize(
    principal: PolicyPrincipal,
    permission: string,
  ): Promise<Result<void, AuthorizationDenied>> {
    void principal;
    return Promise.resolve(
      Result.err({
        kind: 'AUTHORIZATION_DENIED',
        permission,
        message: `permission '${permission}' is not seeded — absence denies`,
      }),
    );
  }
}

export class SequentialIdSource implements IdSource {
  private counter = 0;

  nextId(): string {
    this.counter += 1;
    return `00000000-0000-7000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

/** Captures every audit event in memory; construction mirrors production. */
export function recordingAuditTrail(environment = 'test'): {
  trail: CapabilityAuditTrail;
  events: AuditEvent[];
} {
  const events: AuditEvent[] = [];
  let counter = 0;
  const recorder = new RecordAuditEvent(
    {
      record(event: AuditEvent) {
        events.push(event);
        return Promise.resolve(Result.ok(event));
      },
    },
    {
      nextId(): AuditEventId {
        counter += 1;
        return `audit-${counter}` as AuditEventId;
      },
    },
  );
  return { trail: new CapabilityAuditTrail(recorder, environment), events };
}
