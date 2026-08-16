/**
 * The self-declaration use case and its route, against fakes.
 *
 * The properties under test are the ones that make a subject-facing write into
 * this table safe at all: the source and verification status are FIXED (a
 * caller cannot ask for VERIFIED), an unknown or retired identifier is
 * refused, an existing VERIFIED assignment is never superseded, history is
 * preserved rather than rewritten, the act is audited, and identity is never
 * read from the request. Live-PostgreSQL evidence for the RLS scoping and the
 * schema CHECKs lives in jurisdiction.integration.test.ts and migration 0072.
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import {
  DeclareOwnJurisdiction,
  type DeclareOwnJurisdictionInput,
} from '../application/use-cases/self-declaration.js';
import { JurisdictionAuditTrail, type AuditEntry } from '../application/audit-trail.js';
import type { JurisdictionRecord } from '../domain/reference.js';
import type { UserJurisdictionAssignment } from '../domain/assignment.js';
import type {
  JurisdictionDirectory,
  UserAssignmentPrincipal,
  UserJurisdictionAssignmentRepository,
} from '../application/ports/repositories.js';
import { JurisdictionApiModule } from '../presentation/jurisdiction-api.module.js';
import type { JurisdictionPrincipal } from '../presentation/http/principal-source.js';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const EARLIER = new Date('2026-01-01T00:00:00.000Z');
const TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER = UserId.of('11111111-0000-4000-8000-000000000001');
const PRINCIPAL: UserAssignmentPrincipal = { tenantId: TENANT, userId: USER };

function record(overrides: Partial<JurisdictionRecord> = {}): JurisdictionRecord {
  return {
    code: 'QA' as JurisdictionRecord['code'],
    countryCode: 'QA',
    type: 'NATIONAL',
    status: 'DRAFT',
    reviewStatus: 'PENDING_LEGAL_REVIEW',
    effectiveFrom: null,
    effectiveTo: null,
    provenance: 'test',
    ...overrides,
  };
}

class FakeDirectory implements JurisdictionDirectory {
  constructor(private readonly known: Record<string, JurisdictionRecord>) {}
  findJurisdiction(code: string): Promise<JurisdictionRecord | null> {
    return Promise.resolve(this.known[code] ?? null);
  }
  listJurisdictions(): Promise<readonly JurisdictionRecord[]> {
    return Promise.resolve(Object.values(this.known));
  }
  listCountries(): Promise<never[]> {
    return Promise.resolve([]);
  }
}

class FakeAssignments implements UserJurisdictionAssignmentRepository {
  readonly inserted: UserJurisdictionAssignment[] = [];
  readonly endedAt: Date[] = [];
  /** Principals the repository was asked to act for — RLS scoping evidence. */
  readonly principals: UserAssignmentPrincipal[] = [];

  constructor(private rows: UserJurisdictionAssignment[] = []) {}

  insert(principal: UserAssignmentPrincipal, assignment: UserJurisdictionAssignment) {
    this.principals.push(principal);
    this.inserted.push(assignment);
    this.rows = [...this.rows, assignment];
    return Promise.resolve();
  }
  endOpen(principal: UserAssignmentPrincipal, endsAt: Date): Promise<readonly string[]> {
    this.principals.push(principal);
    this.endedAt.push(endsAt);
    const open = this.rows.filter((row) => row.effectiveTo === null);
    this.rows = this.rows.map((row) => (row.effectiveTo === null ? { ...row, effectiveTo: endsAt } : row));
    return Promise.resolve(open.map((row) => row.id));
  }
  listForPrincipal(principal: UserAssignmentPrincipal): Promise<readonly UserJurisdictionAssignment[]> {
    this.principals.push(principal);
    return Promise.resolve(this.rows);
  }
}

class RecordingAudit extends JurisdictionAuditTrail {
  readonly entries: AuditEntry[] = [];
  constructor() {
    super(null as never, 'test');
  }
  override record(entry: AuditEntry) {
    this.entries.push(entry);
    return Promise.resolve(Result.ok(undefined));
  }
}

class FailingAudit extends JurisdictionAuditTrail {
  constructor() {
    super(null as never, 'test');
  }
  override record() {
    return Promise.resolve(
      Result.err({ kind: 'AUDIT_APPEND_FAILED' as const, message: 'audit store down (test)' }),
    );
  }
}

const ids = { nextId: () => 'ja-new' };

function existing(overrides: Partial<UserJurisdictionAssignment> = {}): UserJurisdictionAssignment {
  return {
    id: 'ja-old',
    userId: USER,
    tenantId: TENANT,
    jurisdictionCode: 'QA' as UserJurisdictionAssignment['jurisdictionCode'],
    source: 'USER_DECLARED',
    verificationStatus: 'UNVERIFIED',
    effectiveFrom: EARLIER,
    effectiveTo: null,
    reason: 'prior',
    assignedBy: `user:${String(USER)}`,
    createdAt: EARLIER,
    ...overrides,
  };
}

function useCaseWith(options: {
  rows?: UserJurisdictionAssignment[];
  known?: Record<string, JurisdictionRecord>;
  audit?: JurisdictionAuditTrail;
}) {
  const assignments = new FakeAssignments(options.rows ?? []);
  const audit = options.audit ?? new RecordingAudit();
  const useCase = new DeclareOwnJurisdiction(
    assignments,
    new FakeDirectory(options.known ?? { QA: record(), AE: record({ code: 'AE' as never, countryCode: 'AE' }) }),
    ids,
    audit,
  );
  return { useCase, assignments, audit };
}

const input: DeclareOwnJurisdictionInput = {
  principal: PRINCIPAL,
  jurisdictionCode: 'QA',
  now: NOW,
};

describe('DeclareOwnJurisdiction', () => {
  it('records USER_DECLARED / UNVERIFIED — the caller cannot ask for anything else', async () => {
    const { useCase, assignments } = useCaseWith({});

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the declaration to be recorded');
    expect(result.value.recorded).toBe(true);
    expect(assignments.inserted).toHaveLength(1);
    expect(assignments.inserted[0]).toMatchObject({
      source: 'USER_DECLARED',
      verificationStatus: 'UNVERIFIED',
      jurisdictionCode: 'QA',
      effectiveTo: null,
    });
    // The subject's own principal ref, as migration 0072 names for this case.
    expect(assignments.inserted[0]?.assignedBy).toBe(`user:${String(USER)}`);
  });

  it('writes ONLY under the calling principal — the subject is never a parameter', async () => {
    const { useCase, assignments } = useCaseWith({});

    await useCase.execute(input);

    expect(assignments.principals.length).toBeGreaterThan(0);
    for (const principal of assignments.principals) {
      expect(principal).toEqual(PRINCIPAL);
    }
  });

  it('refuses an unknown identifier rather than storing it as free text', async () => {
    const { useCase, assignments } = useCaseWith({});

    const result = await useCase.execute({ ...input, jurisdictionCode: 'ATLANTIS' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error.kind).toBe('UNKNOWN_JURISDICTION');
    expect(assignments.inserted).toHaveLength(0);
  });

  it('refuses a RETIRED register entry — no new assignment into a closed regime', async () => {
    const { useCase, assignments } = useCaseWith({
      known: { QA: record({ status: 'RETIRED' }) },
    });

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toMatchObject({
      kind: 'DECLARATION_NOT_PERMITTED',
      reason: 'JURISDICTION_NOT_DECLARABLE',
    });
    expect(assignments.inserted).toHaveLength(0);
  });

  it('NEVER supersedes a VERIFIED assignment — verification is not self-erasable', async () => {
    const { useCase, assignments } = useCaseWith({
      rows: [existing({ source: 'PROVIDER_VERIFIED', verificationStatus: 'VERIFIED' })],
    });

    const result = await useCase.execute({ ...input, jurisdictionCode: 'AE' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.error).toMatchObject({
      kind: 'DECLARATION_NOT_PERMITTED',
      reason: 'VERIFIED_ASSIGNMENT_EXISTS',
    });
    expect(assignments.inserted).toHaveLength(0);
    expect(assignments.endedAt).toHaveLength(0);
  });

  it('re-declaring the SAME jurisdiction is a no-op — no new window for an unchanged fact', async () => {
    const { useCase, assignments } = useCaseWith({ rows: [existing()] });

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the standing assignment');
    expect(result.value.recorded).toBe(false);
    expect(result.value.assignment.id).toBe('ja-old');
    expect(assignments.inserted).toHaveLength(0);
    expect(assignments.endedAt).toHaveLength(0);
  });

  it('changing jurisdiction ENDS the open row and inserts a successor — history is preserved', async () => {
    const { useCase, assignments } = useCaseWith({ rows: [existing()] });

    const result = await useCase.execute({ ...input, jurisdictionCode: 'AE' });

    expect(result.ok).toBe(true);
    expect(assignments.endedAt).toEqual([NOW]);
    expect(assignments.inserted).toHaveLength(1);
    expect(assignments.inserted[0]).toMatchObject({
      jurisdictionCode: 'AE',
      verificationStatus: 'UNVERIFIED',
      effectiveFrom: NOW,
    });
  });

  it('audits the declaration with its superseded window', async () => {
    const { useCase, audit } = useCaseWith({ rows: [existing()] });

    await useCase.execute({ ...input, jurisdictionCode: 'AE' });

    const entries = (audit as RecordingAudit).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'jurisdiction.user_assignment.self_declared',
      resourceType: 'user_jurisdiction_assignment',
      actorRef: `user:${String(USER)}`,
    });
    expect(entries[0]?.afterMetadata).toMatchObject({
      verificationStatus: 'UNVERIFIED',
      source: 'USER_DECLARED',
      supersededAssignmentIds: 'ja-old',
    });
  });

  it('surfaces an unwritable audit record loudly instead of reporting a clean success', async () => {
    const { useCase } = useCaseWith({ audit: new FailingAudit() });

    const result = await useCase.execute(input);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the audit failure to surface');
    expect(result.error.kind).toBe('AUDIT_APPEND_FAILED');
  });
});

describe('POST /jurisdiction/self-declaration', () => {
  async function appWith(principal: JurisdictionPrincipal | null) {
    const { useCase, assignments } = useCaseWith({});
    const moduleRef = await Test.createTestingModule({
      imports: [
        JurisdictionApiModule.register({
          useCases: { declareOwnJurisdiction: useCase },
          principalSource: { fromRequest: () => principal },
          clock: { now: () => NOW },
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return { app, assignments };
  }

  const bound: JurisdictionPrincipal = { userId: USER, tenantId: TENANT };

  it('declares, and answers with the UNVERIFIED state stated explicitly', async () => {
    const { app } = await appWith(bound);
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/jurisdiction/self-declaration',
          headers: { 'content-type': 'application/json' },
          payload: { jurisdictionId: 'QA' },
        });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        state: 'UNVERIFIED',
        jurisdictionId: 'QA',
        source: 'USER_DECLARED',
        effectiveFrom: NOW.toISOString(),
        recorded: true,
      });
    } finally {
      await app.close();
    }
  });

  it('ignores identity-shaped request values entirely — the session principal is the target', async () => {
    const { app, assignments } = await appWith(bound);
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/jurisdiction/self-declaration?userId=99999999-0000-4000-8000-000000000009',
          headers: {
            'content-type': 'application/json',
            'x-tenant-id': 'bbbbbbbb-0000-4000-8000-00000000000b',
          },
          payload: {
            jurisdictionId: 'QA',
            userId: '99999999-0000-4000-8000-000000000009',
            tenantId: 'bbbbbbbb-0000-4000-8000-00000000000b',
            verificationStatus: 'VERIFIED',
            source: 'PROVIDER_VERIFIED',
          },
        });

      expect(response.statusCode).toBe(200);
      // Neither the injected identity nor the requested verification survived.
      expect(assignments.principals.every((p) => p.userId === USER && p.tenantId === TENANT)).toBe(
        true,
      );
      expect(assignments.inserted[0]).toMatchObject({
        userId: USER,
        tenantId: TENANT,
        source: 'USER_DECLARED',
        verificationStatus: 'UNVERIFIED',
      });
    } finally {
      await app.close();
    }
  });

  it('answers 401 with no fallback principal', async () => {
    const { app, assignments } = await appWith(null);
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/jurisdiction/self-declaration',
          headers: { 'content-type': 'application/json' },
          payload: { jurisdictionId: 'QA' },
        });

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('AUTHENTICATION_REQUIRED');
      expect(assignments.inserted).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('refuses an UNBOUND session: there is no RLS context to write under', async () => {
    const { app, assignments } = await appWith({ userId: USER, tenantId: null });
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/jurisdiction/self-declaration',
          headers: { 'content-type': 'application/json' },
          payload: { jurisdictionId: 'QA' },
        });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('TENANT_BINDING_REQUIRED');
      expect(assignments.inserted).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('rejects a malformed or missing identifier before it reaches a query', async () => {
    const { app, assignments } = await appWith(bound);
    try {
      for (const payload of [{}, { jurisdictionId: '' }, { jurisdictionId: "QA'; DROP TABLE" }]) {
        const response = await app
          .getHttpAdapter()
          .getInstance()
          .inject({
            method: 'POST',
            url: '/jurisdiction/self-declaration',
            headers: { 'content-type': 'application/json' },
            payload,
          });
        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('INVALID_JURISDICTION_DECLARATION');
      }
      expect(assignments.inserted).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('answers 400 for an identifier the register does not hold', async () => {
    const { app } = await appWith(bound);
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/jurisdiction/self-declaration',
          headers: { 'content-type': 'application/json' },
          payload: { jurisdictionId: 'ATLANTIS' },
        });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('INVALID_JURISDICTION_DECLARATION');
    } finally {
      await app.close();
    }
  });
});
