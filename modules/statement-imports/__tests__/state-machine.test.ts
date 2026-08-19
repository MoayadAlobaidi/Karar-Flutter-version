/**
 * The import lifecycle, and the one rule the whole module exists for: no
 * canonical transaction before review.
 *
 * The interesting assertions here are the NEGATIVE ones. `PARSING ->
 * COMMITTED` and `SOURCE_STORED -> COMMITTING` both move forward, so an
 * ordering rule would permit them — and both write a person's financial
 * records from a file nobody read.
 */

import { describe, expect, it } from 'vitest';

import {
  IMPORT_STATES,
  LEGAL_IMPORT_TRANSITIONS,
  checkTransition,
  isLegalTransition,
  isTerminalImportState,
  mayHaveCommittedTransactions,
  type ImportState,
} from '../domain/import-state.js';
import {
  NO_ROWS,
  StatementImportRuleError,
  startImport,
  transitionTo,
  type StatementImport,
} from '../domain/statement-import.js';
import { CanonicalAccountRef, StatementImportId } from '../domain/refs.js';
// The marker is IMPORTED, never typed. `tsc` emits these tests into the same
// dist/ a deployment ships, so a fixture value written here travels exactly as
// far as one written in source — which the retention closure test proves by
// scanning every dist/ in the production closure.
import { SYNTHETIC_RETENTION_MARKER } from '@karar/financial-retention-local-fixtures';

const AT = new Date('2026-08-12T09:00:00.000Z');

const DECIDED = {
  state: 'DECIDED' as const,
  decidedAt: AT,
  retentionPeriod: 'P0D',
  basis: `${SYNTHETIC_RETENTION_MARKER}: test fixture`,
  packVersion: `synthetic-local/${SYNTHETIC_RETENTION_MARKER}`,
};

function draft(): StatementImport {
  return startImport({
    id: StatementImportId.of('11111111-0000-4000-8000-000000000001'),
    tenantId: 'aaaaaaaa-0000-4000-8000-00000000000a',
    userId: 'a1a1a1a1-0000-4000-8000-0000000000a1',
    accountRef: CanonicalAccountRef.of('acc00000-0000-4000-8000-00000000000a'),
    connectionRef: null,
    retention: DECIDED,
    createdAt: AT,
  });
}

/** Walks an import to a state through the legal path, for a test's setup. */
function at(state: ImportState): StatementImport {
  let current = draft();
  const path: Record<ImportState, readonly ImportState[]> = {
    DRAFT: [],
    SOURCE_STORED: ['SOURCE_STORED'],
    PARSING: ['SOURCE_STORED', 'PARSING'],
    REVIEW_REQUIRED: ['SOURCE_STORED', 'PARSING', 'REVIEW_REQUIRED'],
    COMMITTING: ['SOURCE_STORED', 'PARSING', 'REVIEW_REQUIRED', 'COMMITTING'],
    COMMITTED: ['SOURCE_STORED', 'PARSING', 'REVIEW_REQUIRED', 'COMMITTING', 'COMMITTED'],
    REJECTED: ['REJECTED'],
    FAILED: ['FAILED'],
    DUPLICATE: ['SOURCE_STORED', 'DUPLICATE'],
    ERASED: ['ERASED'],
  };
  for (const step of path[state]) {
    current = transitionTo(current, step, AT, {
      ...(step === 'DUPLICATE' || step === 'FAILED'
        ? { refusalCode: 'SOURCE_ALREADY_IMPORTED' as const }
        : {}),
      ...(step === 'REVIEW_REQUIRED' || step === 'COMMITTING' || step === 'COMMITTED'
        ? {
            versions: {
              parserVersion: 'p/1',
              mappingVersion: 'm/1',
              normalizationVersion: 'n/1',
              fingerprintVersion: 'f/1',
            },
          }
        : {}),
    });
  }
  return current;
}

describe('the legal-transition list', () => {
  it('names every state, so a state added later cannot be silently unreachable', () => {
    expect(Object.keys(LEGAL_IMPORT_TRANSITIONS).sort()).toEqual([...IMPORT_STATES].sort());
  });

  it('permits the happy path and nothing that skips review', () => {
    expect(isLegalTransition('DRAFT', 'SOURCE_STORED')).toBe(true);
    expect(isLegalTransition('SOURCE_STORED', 'PARSING')).toBe(true);
    expect(isLegalTransition('PARSING', 'REVIEW_REQUIRED')).toBe(true);
    expect(isLegalTransition('REVIEW_REQUIRED', 'COMMITTING')).toBe(true);
    expect(isLegalTransition('COMMITTING', 'COMMITTED')).toBe(true);
  });

  it.each([
    ['PARSING', 'COMMITTED'],
    ['PARSING', 'COMMITTING'],
    ['SOURCE_STORED', 'COMMITTING'],
    ['SOURCE_STORED', 'COMMITTED'],
    ['SOURCE_STORED', 'REVIEW_REQUIRED'],
    ['DRAFT', 'PARSING'],
    ['DRAFT', 'COMMITTED'],
    ['REVIEW_REQUIRED', 'COMMITTED'],
  ] as const)('REFUSES %s -> %s, which would skip review', (from, to) => {
    expect(isLegalTransition(from, to)).toBe(false);
    expect(checkTransition(from, to)).not.toBeNull();
  });

  it('refuses a state transitioning to itself', () => {
    for (const state of IMPORT_STATES) {
      expect(isLegalTransition(state, state)).toBe(false);
    }
  });

  it('lets every terminal state go only to ERASED', () => {
    for (const state of IMPORT_STATES) {
      if (!isTerminalImportState(state) || state === 'ERASED') continue;
      expect(LEGAL_IMPORT_TRANSITIONS[state]).toEqual(['ERASED']);
    }
    expect(LEGAL_IMPORT_TRANSITIONS.ERASED).toEqual([]);
  });

  it('lets a failed commit return to review, because no subset was written', () => {
    expect(isLegalTransition('COMMITTING', 'REVIEW_REQUIRED')).toBe(true);
  });

  it('permits erasure from every settled state, including COMMITTED', () => {
    for (const state of IMPORT_STATES) {
      // COMMITTING is the one exception, and it is not an oversight: a commit
      // in flight is a database transaction that is still running, and
      // erasing the import out from under it would race the write it is
      // making. The commit settles first — to COMMITTED, FAILED, or back to
      // REVIEW_REQUIRED — and every one of those may then be erased.
      if (state === 'ERASED' || state === 'COMMITTING') continue;
      expect(isLegalTransition(state, 'ERASED')).toBe(true);
    }
    expect(isLegalTransition('COMMITTING', 'ERASED')).toBe(false);
  });
});

describe('no canonical transaction before review', () => {
  it('answers true for exactly the two committing states', () => {
    for (const state of IMPORT_STATES) {
      expect(mayHaveCommittedTransactions(state)).toBe(
        state === 'COMMITTING' || state === 'COMMITTED',
      );
    }
  });

  it('refuses a transition that reports committed transactions in any other state', () => {
    const parsing = at('PARSING');
    expect(() =>
      transitionTo(parsing, 'REVIEW_REQUIRED', AT, {
        versions: {
          parserVersion: 'p/1',
          mappingVersion: 'm/1',
          normalizationVersion: 'n/1',
          fingerprintVersion: 'f/1',
        },
        counts: { ...NO_ROWS, committedTransactionCount: 3 },
      }),
    ).toThrow(StatementImportRuleError);
  });

  it('permits them once the commit is running', () => {
    const committing = at('COMMITTING');
    const committed = transitionTo(committing, 'COMMITTED', AT, {
      counts: { ...NO_ROWS, committedTransactionCount: 3 },
    });
    expect(committed.counts.committedTransactionCount).toBe(3);
    expect(committed.committedAt).toEqual(AT);
  });
});

describe('retention gates the lifecycle, not only the bytes', () => {
  it('refuses SOURCE_STORED while the retention question is open', () => {
    // A row read back in the UNDECIDED state — the shape the database column
    // defaults to. The factory cannot produce one, which is the point.
    const undecided: StatementImport = { ...draft(), retention: { state: 'UNDECIDED' } };
    expect(() => transitionTo(undecided, 'SOURCE_STORED', AT)).toThrow(StatementImportRuleError);
  });

  it('still permits REJECTED, FAILED and ERASED, so nothing gets stuck', () => {
    const undecided: StatementImport = { ...draft(), retention: { state: 'UNDECIDED' } };
    for (const state of ['REJECTED', 'FAILED', 'ERASED'] as const) {
      expect(() => transitionTo(undecided, state, AT)).not.toThrow();
    }
  });
});

describe('versions and concurrency tokens', () => {
  it('advances the version by exactly one on every transition', () => {
    const one = draft();
    const two = transitionTo(one, 'SOURCE_STORED', AT);
    const three = transitionTo(two, 'PARSING', AT);
    expect([one.version, two.version, three.version]).toEqual([1, 2, 3]);
  });

  it('freezes the value it returns, so no caller can mutate an import in place', () => {
    const one = draft();
    expect(Object.isFrozen(one)).toBe(true);
  });
});
