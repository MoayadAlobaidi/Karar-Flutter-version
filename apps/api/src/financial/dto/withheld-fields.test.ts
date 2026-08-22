// WHAT THE SERIALIZERS WITHHOLD, ASSERTED ON A REAL OBJECT.
//
// The contract closes every response shape with `additionalProperties: false`
// and the runtime conformance suite holds real bodies to it. This is the
// other half: the closure only bites for a field the serializer PRODUCES, and
// a serializer that spread its input would produce whatever the domain gains
// next. So each shape here is built from a read model that deliberately
// carries the dangerous values, and the assertion is on the exact key set —
// not on "does not contain", which passes when nothing was produced at all.
//
// The dangerous values are the ones an incident would be about: a per-subject
// keyed fingerprint (a confirmation oracle over somebody's spending), an
// external account reference, encryption metadata, an object-storage handle,
// and the tenant and user ids of a row the caller already owns.
import { CalendarDay, Currency, Money } from '@karar/shared-kernel';
import { describe, expect, it } from 'vitest';

import { balanceSnapshotWire, financialAccountWire } from './accounts.js';
import { accountSourceLinkWire, connectionSummaryWire } from './connections.js';
import { paymentInstrumentWire } from './instruments.js';
import { provenanceWire, transactionWire } from './transactions.js';
import { transferMatchWire } from './matches.js';

const QAR = Currency.get('QAR');
const AT = new Date('2026-08-19T09:00:00.000Z');
const DAY = CalendarDay.parse('2026-08-19');

/** A holder-sensitive field, as the domain hands one over. */
function hsf(value: string): { reveal(): string; toJSON(): string } {
  return { reveal: () => value, toJSON: () => '[HIGHLY_SENSITIVE_FINANCIAL redacted]' };
}

/** Everything a serializer must not emit, seeded into the input it is given. */
const POISON = {
  tenantId: 'c0f0aaaa-0000-4000-8000-00000000c001',
  userId: 'c0f0bbbb-0000-4000-8000-00000000c002',
  ciphertext: new Uint8Array([1, 2, 3]),
  nonce: new Uint8Array([4, 5, 6]),
  authTag: new Uint8Array([7, 8, 9]),
  algorithm: 'AES-256-GCM',
  keyVersion: 'karar-ref:key-version:local@v1',
  fingerprint: { version: 'v1', value: 'f'.repeat(64) },
  objectRef: 'store://karar-internal-bucket/statement/v1',
};

function keysOf(value: unknown): string[] {
  return Object.keys(value as Record<string, unknown>).sort();
}

/** Every string that appears anywhere in the serialized body. */
function serialized(value: unknown): string {
  return JSON.stringify(value);
}

describe('an account never carries tenancy or key material', () => {
  const account = {
    id: 'c0f01111-0000-4000-8000-00000000c003',
    ...POISON,
    institutionRef: null,
    userSuppliedInstitutionLabel: hsf('My bank'),
    accountType: 'CURRENT',
    walletKind: null,
    nature: 'ASSET',
    currency: QAR,
    displayName: hsf('Everyday'),
    mask: hsf('**1234'),
    status: 'ACTIVE',
    origin: 'MANUAL',
    createdAt: AT,
    updatedAt: AT,
    version: 1,
  };

  it('emits exactly the declared field set', () => {
    // An exact set, not an absence check: a serializer that produced nothing
    // would satisfy "does not contain" and fail this.
    expect(keysOf(financialAccountWire(account as never, null))).toEqual([
      'accountId',
      'accountType',
      'createdAt',
      'currency',
      'displayName',
      'institution',
      'link',
      'mask',
      'nature',
      'origin',
      'status',
      'updatedAt',
      'userSuppliedInstitutionLabel',
      'version',
      'walletKind',
    ]);
  });

  it('carries no tenant, user, ciphertext, nonce, auth tag, algorithm or key version', () => {
    const body = serialized(financialAccountWire(account as never, null));
    for (const secret of [POISON.tenantId, POISON.userId, POISON.algorithm, POISON.keyVersion]) {
      expect(body).not.toContain(secret);
    }
  });

  it('DISCLOSES the holder-sensitive fields to their owner, deliberately', () => {
    // The other failure mode: a forgotten `reveal()` ships the redaction
    // marker to the person whose own account it is.
    const wire = financialAccountWire(account as never, null);
    expect(wire.displayName).toBe('Everyday');
    expect(wire.mask).toBe('**1234');
    expect(serialized(wire)).not.toContain('HIGHLY_SENSITIVE_FINANCIAL');
  });

  it('says NOT_LINKED, and says it is not a live institution link', () => {
    const wire = financialAccountWire(account as never, null);
    expect(wire.link).toEqual({
      state: 'NOT_LINKED',
      impliesLiveInstitutionLink: false,
      providerAccessStatus: 'NOT_IMPLEMENTED',
    });
  });
});

describe('money and dates are typed the way the ledger needs them', () => {
  const snapshot = {
    id: 'c0f02222-0000-4000-8000-00000000c004',
    ...POISON,
    accountId: 'c0f01111-0000-4000-8000-00000000c003',
    amount: Money.of('-123456', QAR),
    asOf: AT,
    sourceKind: 'MANUAL',
    balanceKind: 'AVAILABLE',
    sourceReference: 'c0f03333-0000-4000-8000-00000000c005',
    capturedAt: AT,
    createdAt: AT,
  };

  it('emits an exact minor-unit STRING with its currency and exponent', () => {
    const wire = balanceSnapshotWire(snapshot as never);
    expect(wire.amount).toEqual({ minorUnits: '-123456', currency: 'QAR', exponent: 2 });
    // Never a JSON number: a number is a float, and a float is not a ledger
    // value. The serialized body must not contain a bare numeric amount.
    expect(serialized(wire)).toContain('"minorUnits":"-123456"');
  });

  it('never carries the source’s own reference for the figure', () => {
    expect(keysOf(balanceSnapshotWire(snapshot as never))).toEqual([
      'accountId',
      'amount',
      'asOf',
      'availability',
      'balanceKind',
      'capturedAt',
      'snapshotId',
      'sourceKind',
    ]);
  });

  it('serializes a BOOKING DAY as a day and an INSTANT as an instant', () => {
    const transaction = {
      id: 'c0f04444-0000-4000-8000-00000000c006',
      ...POISON,
      accountRef: { referenceType: 'FINANCIAL_ACCOUNT', accountId: POISON.tenantId },
      amount: Money.of('-500', QAR),
      bookingDate: DAY,
      valueDate: null,
      eventOccurredAt: AT,
      sourceTimezone: 'Asia/Qatar',
      merchant: null,
      description: hsf('Coffee'),
      note: null,
      originalAmount: null,
      sourceKind: 'MANUAL',
      status: 'POSTED',
      createdAt: AT,
      version: 1,
    };
    const wire = transactionWire(transaction as never);
    // A calendar day, with no time and no zone (ADR-0027).
    expect(wire.bookingDate).toBe('2026-08-19');
    // A true instant, with an explicit offset.
    expect(wire.eventOccurredAt).toBe('2026-08-19T09:00:00.000Z');
    // The sign is restated in words so a client cannot mis-read the minus.
    expect(wire.direction).toBe('MONEY_OUT');
    expect(wire.amount.minorUnits).toBe('-500');
  });
});

describe('provenance never carries the dedup fingerprint', () => {
  it('reports the ALGORITHM version and the existence of an import, nothing more', () => {
    const provenance = {
      id: 'c0f05555-0000-4000-8000-00000000c007',
      transactionId: 'c0f04444-0000-4000-8000-00000000c006',
      ...POISON,
      revisionNumber: 1,
      sourceKind: 'CSV',
      importRef: 'import-42',
      rowRef: 'row-17',
      actorRef: POISON.userId,
      accountRef: { referenceType: 'FINANCIAL_ACCOUNT', accountId: POISON.tenantId },
      versions: {
        parserVersion: 'statement-csv/v1',
        mappingVersion: 'statement-csv/mapping/v1',
        normalizationVersion: 'statement-csv/normalization/v1',
        fingerprintVersion: 'dedup/v1',
      },
      sourceDirection: 'DEBIT',
      directionMapping: 'SOURCE_DIRECTION_WORD',
      categoryAssignmentSource: 'RULE',
      createdAt: AT,
    };
    const wire = provenanceWire(provenance as never);
    expect(keysOf(wire)).toEqual([
      'accountId',
      'availability',
      'categoryAssignmentSource',
      'createdAt',
      'directionMapping',
      'importedFromStatement',
      'revisionNumber',
      'sourceDirection',
      'sourceKind',
      'versions',
    ]);
    // Existence, never the handle: a row reference addresses staged source
    // content, and an actor reference identifies a principal.
    expect(wire.importedFromStatement).toBe(true);
    const body = serialized(wire);
    expect(body).not.toContain('import-42');
    expect(body).not.toContain('row-17');
    // The algorithm version is safe and useful; a fingerprint is neither.
    expect(wire.versions.fingerprintVersion).toBe('dedup/v1');
  });
});

describe('a source link never carries the external reference or its fingerprint', () => {
  it('emits exactly the safe projection', () => {
    const link = {
      id: 'c0f06666-0000-4000-8000-00000000c008',
      accountRef: { referenceType: 'FINANCIAL_ACCOUNT', accountId: POISON.tenantId },
      connectionId: 'c0f07777-0000-4000-8000-00000000c009',
      connectionRail: 'USER_FILE_UPLOAD',
      sourceAuthority: 'UNVERIFIED',
      matchBasis: 'PROBABLE',
      status: 'LINKED',
      subjectConfirmedAt: AT,
      sourcePriority: 100,
      observation: { firstObservedAt: AT, lastObservedAt: AT, lastSuccessfulImportAt: null },
      historyCoverage: { start: DAY, end: DAY },
      capabilities: { balance: 'NOT_OBSERVED', pendingTransactions: 'NOT_PROVIDED' },
      createdAt: AT,
      updatedAt: AT,
      version: 1,
    };
    const wire = accountSourceLinkWire(link as never);
    expect(keysOf(wire)).toEqual([
      'accountId',
      'availability',
      'capabilities',
      'connectionId',
      'createdAt',
      'historyCoverage',
      'link',
      'matchBasis',
      'observation',
      'rail',
      'sourceAuthority',
      'sourceLinkId',
      'sourcePriority',
      'status',
      'subjectConfirmedAt',
      'updatedAt',
      'version',
    ]);
    // Freshness is observation, not health: an import that never succeeded is
    // null rather than approximated.
    expect(wire.observation.lastSuccessfulImportAt).toBeNull();
    expect(wire.historyCoverage).toEqual({ start: '2026-08-19', end: '2026-08-19' });
    expect(wire.link.impliesLiveInstitutionLink).toBe(false);
  });

  it('a connection summary says nothing is connected', () => {
    const connection = {
      id: 'c0f07777-0000-4000-8000-00000000c009',
      ...POISON,
      institutionRef: null,
      rail: 'MANUAL',
      status: 'ACTIVE',
      displayLabel: hsf('Typed by me'),
      createdAt: AT,
      updatedAt: AT,
      version: 1,
    };
    const wire = connectionSummaryWire(connection as never);
    // ACTIVE means the connection ACCEPTS what the subject supplies. The
    // claim beside it is what stops a client rendering "Connected".
    expect(wire.status).toBe('ACTIVE');
    expect(wire.availability).toBe('EXECUTABLE');
    expect(wire.link).toEqual({
      impliesLiveInstitutionLink: false,
      providerAccessStatus: 'NOT_IMPLEMENTED',
    });
    expect(serialized(wire)).not.toContain(POISON.tenantId);
  });
});

describe('an instrument has no balance, and a match has no amount', () => {
  it('emits version as the only number on an instrument', () => {
    const instrument = {
      id: 'c0f08888-0000-4000-8000-00000000c010',
      ...POISON,
      accountRef: { referenceType: 'FINANCIAL_ACCOUNT', accountId: POISON.tenantId },
      instrumentType: 'VIRTUAL_CARD',
      status: 'ACTIVE',
      mask: hsf('**4321'),
      displayLabel: hsf('Travel card'),
      version: 3,
      createdAt: AT,
      updatedAt: AT,
    };
    const wire = paymentInstrumentWire(instrument as never);
    const numbers = Object.entries(wire).filter(([, value]) => typeof value === 'number');
    expect(numbers).toEqual([['version', 3]]);
    expect(wire.spendable).toBe(true);
    expect(wire.issuerLink.impliesLiveIssuerLink).toBe(false);
  });

  it('emits no amount, total or rate on a transfer match', () => {
    const match = {
      id: 'c0f09999-0000-4000-8000-00000000c011',
      ...POISON,
      outflow: {
        transactionRef: { referenceType: 'TRANSACTION', transactionId: POISON.userId },
        accountRef: { referenceType: 'FINANCIAL_ACCOUNT', accountId: POISON.tenantId },
        currencyCode: 'QAR',
      },
      inflow: {
        transactionRef: { referenceType: 'TRANSACTION', transactionId: POISON.tenantId },
        accountRef: { referenceType: 'FINANCIAL_ACCOUNT', accountId: POISON.userId },
        currencyCode: 'QAR',
      },
      state: 'SUGGESTED',
      suggestionBasis: 'EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW',
      suggestionWindow: 'equal-and-opposite/same-currency/P3D/v1',
      subjectDecidedAt: null,
      firstSuggestedAt: AT,
      version: 1,
      createdAt: AT,
      updatedAt: AT,
    };
    const wire = transferMatchWire(match as never);
    const numbers = Object.entries(wire).filter(([, value]) => typeof value === 'number');
    expect(numbers).toEqual([['version', 1]]);
    // A suggestion changes nothing until a person decides.
    expect(wire.authoritative).toBe(false);
    expect(wire.subjectDecidedAt).toBeNull();
    expect(keysOf(wire.outflow)).toEqual(['accountId', 'currency', 'transactionId']);
  });
});
