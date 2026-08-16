import { describe, expect, it } from 'vitest';

import {
  ENTITY_MIGRATION_STATUSES,
  isTerminalMigrationStatus,
  migrationTransitionAllowed,
} from '../domain/entity-migration.js';
import { licenceStatusRequiresEvidence } from '../domain/entity-licence.js';
import { isPermittedInJurisdiction } from '../domain/operating-entity.js';
import { roleAssignmentActiveAt } from '../domain/role-assignment.js';
import { JurisdictionRef } from '../domain/refs.js';
import type { OperatingEntityId } from '../domain/operating-entity.js';

// The EntityMigration state machine (operating-entity.md §5): the full
// transition matrix, asserted exhaustively — every pair is either in the
// diagram or refused.
describe('entity migration state machine', () => {
  const allowed: Array<[string, string]> = [
    ['PROPOSED', 'RECONSENT_EVALUATED'],
    ['RECONSENT_EVALUATED', 'AWAITING_ACCEPTANCE'],
    ['RECONSENT_EVALUATED', 'MIGRATED'],
    ['AWAITING_ACCEPTANCE', 'MIGRATED'],
    ['AWAITING_ACCEPTANCE', 'BLOCKED'],
  ];

  it('permits exactly the transitions the diagram names', () => {
    for (const from of ENTITY_MIGRATION_STATUSES) {
      for (const to of ENTITY_MIGRATION_STATUSES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(
          migrationTransitionAllowed(from, to),
          `${from} -> ${to} should be ${expected ? 'allowed' : 'refused'}`,
        ).toBe(expected);
      }
    }
  });

  it('terminal states permit nothing — history is never rewritten', () => {
    for (const terminal of ['MIGRATED', 'BLOCKED'] as const) {
      expect(isTerminalMigrationStatus(terminal)).toBe(true);
      for (const to of ENTITY_MIGRATION_STATUSES) {
        expect(migrationTransitionAllowed(terminal, to)).toBe(false);
      }
    }
  });
});

describe('licence status honesty', () => {
  it('EVIDENCED requires evidence; the claim vocabulary does not', () => {
    expect(licenceStatusRequiresEvidence('EVIDENCED')).toBe(true);
    expect(licenceStatusRequiresEvidence('CLAIMED_UNVERIFIED')).toBe(false);
    expect(licenceStatusRequiresEvidence('EXPIRED')).toBe(false);
    expect(licenceStatusRequiresEvidence('REVOKED')).toBe(false);
  });
});

describe('temporal windows', () => {
  const qa = JurisdictionRef.of('jurisdiction:qa');
  const sa = JurisdictionRef.of('jurisdiction:sa');
  const entityId = '00000000-0000-7000-8000-000000000001' as OperatingEntityId;
  const permission = {
    id: 'p1',
    entityId,
    jurisdictionRef: qa,
    permittedFrom: new Date('2026-01-01T00:00:00Z'),
    permittedTo: new Date('2026-06-01T00:00:00Z'),
    basisReference: 'contract:qa-1',
  };

  it('a permission covers its window and nothing else', () => {
    expect(isPermittedInJurisdiction([permission], qa, new Date('2026-03-01T00:00:00Z'))).toBe(
      true,
    );
    expect(isPermittedInJurisdiction([permission], qa, new Date('2025-12-31T23:59:59Z'))).toBe(
      false,
    );
    expect(isPermittedInJurisdiction([permission], qa, new Date('2026-06-01T00:00:00Z'))).toBe(
      false,
    );
    expect(isPermittedInJurisdiction([permission], sa, new Date('2026-03-01T00:00:00Z'))).toBe(
      false,
    );
  });

  it('an open-ended role assignment stays active; an ended one stops', () => {
    const open = { effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: null };
    const ended = {
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
      effectiveTo: new Date('2026-02-01T00:00:00Z'),
    };
    expect(roleAssignmentActiveAt(open, new Date('2030-01-01T00:00:00Z'))).toBe(true);
    expect(roleAssignmentActiveAt(ended, new Date('2026-01-15T00:00:00Z'))).toBe(true);
    expect(roleAssignmentActiveAt(ended, new Date('2026-02-01T00:00:00Z'))).toBe(false);
  });
});
