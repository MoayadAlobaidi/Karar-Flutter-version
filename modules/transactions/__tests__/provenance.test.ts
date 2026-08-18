/**
 * Provenance completeness: every stored financial fact is explainable back to
 * manual input or to one exact CSV row.
 *
 * "Explainable" is mechanical here, not narrative. The tests assert that the
 * structure cannot represent an unexplainable fact — a CSV record that cannot
 * point at its line, a manual record claiming an import it never had, or a
 * fact whose processing versions are unrecorded and therefore not
 * reproducible.
 */

import { describe, expect, it } from 'vitest';

import { AccountRef, ActorRef, ImportRef, RowRef, TransactionId } from '../domain/refs.js';
import {
  createProvenance,
  InvalidProvenanceError,
  isExplainable,
  PROVENANCE_REQUIRED_FACTS,
  type TransactionProvenance,
} from '../domain/provenance.js';
import { NOW } from './fakes/synthetic-fixtures.js';

const TENANT = '11111111-1111-7111-8111-111111111111';
const USER = '22222222-2222-7222-8222-222222222222';
const TXN = TransactionId.of('33333333-3333-7333-8333-333333333333');
const ACCOUNT = AccountRef.of('44444444-4444-7444-8444-444444444444');
const ACTOR = ActorRef.of(USER);

const VERSIONS = {
  parserVersion: 'csv/rfc4180/2',
  mappingVersion: 'mapping/qnb-current/3',
  normalizationVersion: 'normalize/arabic-indic+accounting-negatives/1',
  fingerprintVersion: 'dedup/hmac-sha256/utc-day/v2',
} as const;

function csvProvenance(overrides: Partial<TransactionProvenance> = {}): TransactionProvenance {
  return createProvenance({
    id: 'prov-1',
    transactionId: TXN,
    tenantId: TENANT,
    userId: USER,
    revisionNumber: 1,
    sourceKind: 'CSV',
    importRef: ImportRef.of('import-2026-08-17-0001'),
    rowRef: RowRef.of('row:47'),
    actorRef: ACTOR,
    accountRef: ACCOUNT,
    versions: { ...VERSIONS },
    sourceDirection: 'DEBIT',
    directionMapping: 'SOURCE_DIRECTION_WORD',
    categoryAssignmentSource: 'NONE',
    createdAt: NOW,
    ...overrides,
  });
}

describe('a CSV-sourced fact points at the exact line it came from', () => {
  it('records import, row, actor, account and all four processing versions', () => {
    const provenance = csvProvenance();
    expect(provenance.importRef).toBe('import-2026-08-17-0001');
    expect(provenance.rowRef).toBe('row:47');
    expect(provenance.actorRef).toBe(ACTOR);
    expect(provenance.accountRef.accountId).toBe(ACCOUNT.accountId);
    expect(provenance.versions).toEqual(VERSIONS);
    expect(isExplainable(provenance)).toBe(true);
  });

  it('refuses a CSV fact with no row reference', () => {
    // Provenance that cannot point at a line does not make the fact
    // explainable; it only makes it look explained.
    expect(() => csvProvenance({ rowRef: null })).toThrow(InvalidProvenanceError);
  });

  it('refuses a CSV fact with no import reference', () => {
    expect(() => csvProvenance({ importRef: null })).toThrow(InvalidProvenanceError);
  });
});

describe('a manual fact claims no origin it does not have', () => {
  it('records neither import nor row', () => {
    const provenance = createProvenance({
      ...csvProvenance(),
      sourceKind: 'MANUAL',
      importRef: null,
      rowRef: null,
      sourceDirection: 'DEBIT',
      directionMapping: 'MANUAL_ENTRY',
    });
    expect(provenance.importRef).toBeNull();
    expect(provenance.rowRef).toBeNull();
    expect(isExplainable(provenance)).toBe(true);
  });

  it('refuses a manual fact carrying an import reference', () => {
    expect(() =>
      createProvenance({
        ...csvProvenance(),
        sourceKind: 'MANUAL',
        rowRef: null,
      }),
    ).toThrow(InvalidProvenanceError);
  });
});

describe('processing versions are recorded, never omitted', () => {
  for (const field of [
    'parserVersion',
    'mappingVersion',
    'normalizationVersion',
    'fingerprintVersion',
  ] as const) {
    it(`refuses a fact with no ${field}`, () => {
      // A missing version turns "why does this row import differently now?"
      // into an unanswerable question.
      expect(() => csvProvenance({ versions: { ...VERSIONS, [field]: '' } })).toThrow(
        InvalidProvenanceError,
      );
    });
  }

  it('records versions for manual entry too, rather than leaving them blank', () => {
    // A nullable version column would let "we do not know" hide as "not
    // applicable"; those are different answers.
    const provenance = createProvenance({
      ...csvProvenance(),
      sourceKind: 'MANUAL',
      importRef: null,
      rowRef: null,
      directionMapping: 'MANUAL_ENTRY',
      versions: {
        parserVersion: 'manual-entry/1',
        mappingVersion: 'manual-entry/1',
        normalizationVersion: 'manual-entry/1',
        fingerprintVersion: 'dedup/hmac-sha256/utc-day/v2',
      },
    });
    expect(Object.values(provenance.versions).every((value) => value !== '')).toBe(true);
  });
});

describe('the completeness checklist is exercised, not merely declared', () => {
  it('names every fact the invariant requires', () => {
    expect([...PROVENANCE_REQUIRED_FACTS]).toEqual([
      'sourceKind',
      'actorRef',
      'accountRef',
      'parserVersion',
      'mappingVersion',
      'normalizationVersion',
      'fingerprintVersion',
      'sourceDirection',
      'directionMapping',
      'categoryAssignmentSource',
    ]);
  });

  it('every named fact is actually present on a built record', () => {
    // Non-vacuity: a checklist that named a field the record does not carry
    // would pass every other test here while checking nothing.
    const provenance = csvProvenance();
    const flat: Record<string, unknown> = {
      ...provenance,
      ...provenance.versions,
      accountRef: provenance.accountRef.accountId,
    };
    for (const fact of PROVENANCE_REQUIRED_FACTS) {
      expect(flat[fact], `provenance is missing '${fact}'`).toBeDefined();
      expect(flat[fact]).not.toBe('');
    }
  });

  it('rejects a non-positive revision number', () => {
    expect(() => csvProvenance({ revisionNumber: 0 })).toThrow(InvalidProvenanceError);
  });
});

describe('the source frame is part of the origin story', () => {
  it('keeps the source direction and the mapping that interpreted it', () => {
    const inverted = csvProvenance({
      sourceDirection: 'CREDIT',
      directionMapping: 'SOURCE_SIGNED_AMOUNT_INVERTED',
    });
    expect(inverted.sourceDirection).toBe('CREDIT');
    expect(inverted.directionMapping).toBe('SOURCE_SIGNED_AMOUNT_INVERTED');
  });

  it('records NOT_STATED honestly rather than inventing a direction', () => {
    const unstated = csvProvenance({
      sourceDirection: 'NOT_STATED',
      directionMapping: 'SOURCE_SIGNED_AMOUNT',
    });
    expect(unstated.sourceDirection).toBe('NOT_STATED');
  });
});

describe('categorisation provenance carries no score', () => {
  it('has only the three deterministic sources', () => {
    for (const source of ['NONE', 'USER', 'RULE'] as const) {
      expect(csvProvenance({ categoryAssignmentSource: source }).categoryAssignmentSource).toBe(
        source,
      );
    }
  });

  it('has no confidence, score, or probability field anywhere on the record', () => {
    // Structural assertion: a scoring field is all it takes for "probably
    // groceries" to become "groceries" one release later.
    const keys = Object.keys({ ...csvProvenance(), ...csvProvenance().versions });
    for (const key of keys) {
      expect(key).not.toMatch(/score|confidence|probability|weight|rank/i);
    }
  });
});
