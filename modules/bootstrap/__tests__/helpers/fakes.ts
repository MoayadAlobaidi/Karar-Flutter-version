/**
 * Fakes for the bootstrap use-case and controller suites: every port this
 * module declares, with recording so the tests can assert WHICH seam was
 * reached (a denial that never touches the binding seam is a different
 * guarantee from a denial that binds and rolls back).
 *
 * The enrichment fakes deliberately model the CLIENT-SAFE contract: they
 * return the shapes the real resolvers promise. The leak-regression suite
 * supplies hostile variants that try to smuggle extra fields through.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import type { AuditTrail, AuditTrailEntry } from '../../application/ports/audit-trail.js';
import type {
  BindSessionPort,
  ContextDenial,
  ResolveTenantContextPort,
  RevokeSessionPort,
  SwitchTenantPort,
  SwitchedSessionView,
  TenantChoiceView,
  TenantResolutionView,
} from '../../application/ports/tenant-context.js';
import type {
  ClientCapabilitiesPort,
  ClientCapabilityView,
  JurisdictionContextPort,
  JurisdictionStateView,
  OperatingEntityReferencePort,
  OperatingEntityStateView,
  PolicyPackStatusPort,
  PolicyPackStatusView,
} from '../../application/ports/context-enrichment.js';
import type { BootstrapPrincipal } from '../../application/principal.js';

export const USER = UserId.of('11111111-0000-4000-8000-000000000001');
export const SESSION = '55555555-0000-4000-8000-000000000055';
export const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
export const TENANT_B = TenantId.of('bbbbbbbb-0000-4000-8000-00000000000b');
export const FOREIGN_TENANT = '99999999-0000-4000-8000-000000000009';

export const CHOICE_A: TenantChoiceView = {
  tenantId: TenantId.toString(TENANT_A),
  name: 'Tenant A',
  roleHint: 'MEMBER',
};
export const CHOICE_B: TenantChoiceView = {
  tenantId: TenantId.toString(TENANT_B),
  name: 'Tenant B',
  roleHint: 'TENANT_ADMIN',
};

export const CLIENT = { ipDigest: 'digest-1', userAgentSummary: 'Chrome on macOS' };

export function principal(overrides: Partial<BootstrapPrincipal> = {}): BootstrapPrincipal {
  return {
    userId: USER,
    sessionId: SESSION,
    tenantId: null,
    emailVerified: true,
    ...overrides,
  };
}

export const NEW_SESSION: SwitchedSessionView = {
  sessionId: '66666666-0000-4000-8000-000000000066',
  accessToken: 'new-access-token',
  accessTokenExpiresAt: new Date('2026-08-16T13:00:00.000Z'),
  refreshToken: 'new-refresh-token',
  refreshTokenExpiresAt: new Date('2026-08-23T12:00:00.000Z'),
  absoluteExpiresAt: new Date('2026-09-16T12:00:00.000Z'),
};

/** Resolution fake; `queue` lets a test answer differently per call (races). */
export class FakeResolve implements ResolveTenantContextPort {
  calls = 0;
  constructor(private readonly queue: TenantResolutionView[]) {}

  execute(): Promise<Result<TenantResolutionView, ContextDenial>> {
    const next = this.queue[Math.min(this.calls, this.queue.length - 1)];
    this.calls += 1;
    if (next === undefined) throw new Error('no resolution queued');
    return Promise.resolve(Result.ok(next));
  }
}

export class FailingResolve implements ResolveTenantContextPort {
  execute(): Promise<Result<TenantResolutionView, ContextDenial>> {
    return Promise.resolve(Result.err({ kind: 'store_failure' }));
  }
}

export class FakeBind implements BindSessionPort {
  readonly bound: string[] = [];
  constructor(private readonly denial: ContextDenial | null = null) {}

  execute(input: { readonly tenantId: TenantId }): Promise<Result<unknown, ContextDenial>> {
    if (this.denial !== null) return Promise.resolve(Result.err(this.denial));
    this.bound.push(TenantId.toString(input.tenantId));
    return Promise.resolve(Result.ok({ kind: 'bound' }));
  }
}

export class UnreachableBind implements BindSessionPort {
  execute(): Promise<Result<unknown, ContextDenial>> {
    throw new Error('the binding seam must not be reached here');
  }
}

export class FakeRevoke implements RevokeSessionPort {
  readonly revoked: string[] = [];

  execute(input: { readonly sessionId: string }): Promise<Result<unknown, ContextDenial>> {
    this.revoked.push(input.sessionId);
    return Promise.resolve(Result.ok({ kind: 'revoked' }));
  }
}

export class UnreachableRevoke implements RevokeSessionPort {
  execute(): Promise<Result<unknown, ContextDenial>> {
    throw new Error('revocation must not be reached here');
  }
}

export class FakeSwitch implements SwitchTenantPort {
  readonly targets: string[] = [];
  constructor(
    private readonly outcome:
      | { readonly ok: true; readonly previousTenantId: string | null }
      | { readonly ok: false; readonly denial: ContextDenial },
  ) {}

  execute(input: {
    readonly targetTenantId: string;
  }): Promise<
    Result<
      {
        readonly session: SwitchedSessionView;
        readonly previousTenantId: string | null;
        readonly tenantId: string;
      },
      ContextDenial
    >
  > {
    this.targets.push(input.targetTenantId);
    if (!this.outcome.ok) return Promise.resolve(Result.err(this.outcome.denial));
    return Promise.resolve(
      Result.ok({
        session: NEW_SESSION,
        previousTenantId: this.outcome.previousTenantId,
        tenantId: input.targetTenantId,
      }),
    );
  }
}

export class UnreachableSwitch implements SwitchTenantPort {
  execute(): Promise<never> {
    throw new Error('the switch seam must not be reached here');
  }
}

export class RecordingAudit implements AuditTrail {
  readonly entries: AuditTrailEntry[] = [];

  record(entry: AuditTrailEntry) {
    this.entries.push(entry);
    return Promise.resolve(Result.ok(undefined));
  }
}

/** The audit store is down: every append fails (fail-closed evidence). */
export class FailingAudit implements AuditTrail {
  readonly attempted: AuditTrailEntry[] = [];

  record(entry: AuditTrailEntry) {
    this.attempted.push(entry);
    return Promise.resolve(
      Result.err({ kind: 'audit_unavailable' as const, message: 'audit store down (test)' }),
    );
  }
}

export const JURISDICTION: JurisdictionStateView = {
  kind: 'VERIFIED',
  assignment: { jurisdictionId: 'IQ' },
};
export const ENTITY: OperatingEntityStateView = {
  kind: 'ASSIGNED',
  entity: {
    id: 'ee000000-0000-4000-8000-0000000000ee',
    name: 'Karar Operating Entity',
    jurisdictionRef: 'QA',
    contactReference: 'mailbox:privacy',
  },
};
export const POLICY_PACK: PolicyPackStatusView = { version: 'iq/v1', status: 'ACTIVE' };
export const CAPABILITIES: readonly ClientCapabilityView[] = Object.freeze([
  Object.freeze({
    id: 'TRANSACTIONS',
    status: 'UNAVAILABLE',
    requirements: Object.freeze([{ kind: 'IDENTITY_VERIFICATION' }]),
  }),
]);

export function enrichment(overrides?: {
  readonly jurisdiction?: JurisdictionContextPort;
  readonly operatingEntity?: OperatingEntityReferencePort;
  readonly policyPack?: PolicyPackStatusPort;
  readonly capabilities?: ClientCapabilitiesPort;
}) {
  return {
    jurisdiction: overrides?.jurisdiction ?? {
      stateFor: () => Promise.resolve(JURISDICTION),
    },
    operatingEntity: overrides?.operatingEntity ?? {
      effectiveFor: () => Promise.resolve(ENTITY),
    },
    policyPack: overrides?.policyPack ?? {
      statusFor: () => Promise.resolve({ kind: 'ACTIVE' as const, status: POLICY_PACK }),
    },
    capabilities: overrides?.capabilities ?? {
      resolveFor: () => Promise.resolve({ kind: 'RESOLVED' as const, capabilities: CAPABILITIES }),
    },
  };
}

/**
 * The failure side of each enrichment port — a dependency that did not
 * answer. Used by the negative suite to prove a failing port produces 503 and
 * NOT a 200 with an empty list.
 */
export const unavailableEnrichment = {
  jurisdiction: {
    stateFor: () => Promise.resolve({ kind: 'UNAVAILABLE' as const, retryable: true }),
  },
  policyPack: {
    statusFor: () => Promise.resolve({ kind: 'UNAVAILABLE' as const, retryable: true }),
  },
  capabilities: {
    resolveFor: () => Promise.resolve({ kind: 'UNAVAILABLE' as const, retryable: false }),
  },
  operatingEntity: {
    effectiveFor: () => Promise.resolve({ kind: 'UNAVAILABLE' as const }),
  },
};

export const fixedClock = { now: () => new Date('2026-08-16T12:00:00.000Z') };
