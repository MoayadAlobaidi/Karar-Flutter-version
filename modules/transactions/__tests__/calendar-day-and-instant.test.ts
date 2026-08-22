/**
 * ADR-0027 in this module: a calendar day is not an instant, and the two are
 * kept apart everywhere a booked date travels.
 *
 * The failure every assertion here exists to prevent is one wrong day. A
 * purchase booked on 12 August that reads as the 11th is not a cosmetic
 * defect: at a month boundary it moves to the previous MONTH, so a statement
 * for August gains or loses a line depending on where it is read, and two
 * people looking at one account see different totals while both read the data
 * correctly.
 *
 * **The host timezone is varied deliberately.** These tests run on a machine
 * in Asia/Qatar (+03) against a PostgreSQL server whose own default zone is
 * Asia/Qatar, so a bug that only shows at a non-UTC offset would show HERE
 * rather than in production — and the sweeps below add offsets on both sides
 * of UTC, including +14 and -11, so that "it works where it was written" is
 * not what is being proved.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { CalendarDay, Currency, Money } from '@karar/shared-kernel';
import type { TenantId, UserId } from '@karar/shared-kernel';

import { decodeCursor, encodeCursor } from '../application/pagination.js';
import type { FingerprintInput } from '../application/ports/dedup-fingerprint.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import { HsfField } from '../domain/hsf-field.js';
import { AccountRef, TransactionId } from '../domain/refs.js';
import { createTransaction, InvalidTransactionError } from '../domain/transaction.js';
import { valuesOf } from '../domain/revision.js';
import {
  toTransaction,
  TransactionStoreError,
  type TransactionRow,
} from '../infrastructure/persistence/row-mappers.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import {
  DEDUP_FINGERPRINT_VERSION,
  fingerprintsEqual,
  LocalKeyedDedupFingerprintProvider,
} from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import { EVENT_OCCURRED_AT, NOW, QAR, SOURCE_TIMEZONE, syntheticMerchant } from './fakes/synthetic-fixtures.js';

/**
 * Offsets on both sides of UTC and at both extremes, plus UTC itself.
 *
 * +14 and -11 are the ends of the real range, and they are the cases where a
 * date read as an instant is a full day out rather than a few hours. Two
 * half-hour and three-quarter-hour zones are included because an offset that
 * is not a whole number of hours breaks any arithmetic that assumes one.
 */
const HOST_ZONES = [
  'UTC',
  'Asia/Qatar',
  'America/Los_Angeles',
  'Pacific/Kiritimati',
  'Pacific/Niue',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Australia/Eucla',
] as const;

/**
 * Runs `body` with the process pretending to sit in `zone`, then restores.
 *
 * It AWAITS the body rather than returning its promise, and that is not a
 * detail: without the await the zone is restored the moment the body first
 * suspends, so everything after the first `await` runs under the real host
 * zone and the sweep silently tests one offset eleven times. It did exactly
 * that on the first run here.
 */
async function inHostZone<T>(zone: string, body: () => T | Promise<T>): Promise<T> {
  const original = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

/**
 * The days that break naive implementations, and why each is here.
 *
 * A UTC day boundary catches the ordinary off-by-one. A month boundary is
 * where that off-by-one changes which STATEMENT a line belongs to. A year
 * boundary does the same to an annual total. The leap days catch the other
 * classic: 29 February is a real date in 2024 and not one in 2100, and an
 * implementation that rolls an invalid date forward turns a wrong date into a
 * plausible one.
 */
const BOUNDARY_DAYS = [
  ['an ordinary day', 2026, 8, 12],
  ['the first of a month', 2026, 9, 1],
  ['the last of a 31-day month', 2026, 8, 31],
  ['the last of a 30-day month', 2026, 9, 30],
  ['new year, the first', 2027, 1, 1],
  ['new year, the eve', 2026, 12, 31],
  ['a leap day', 2024, 2, 29],
  ['the day after a leap day', 2024, 3, 1],
  ['the last of February in a common year', 2026, 2, 28],
  ['the last of February in a century that is not a leap year', 2100, 2, 28],
  ['the last of February in a century that IS a leap year', 2000, 2, 29],
] as const;

const TENANT = '11111111-1111-7111-8111-111111111111';
const USER = '22222222-2222-7222-8222-222222222222';
const ROW_ID = '33333333-3333-7333-8333-333333333333';
const ACCOUNT_ID = '44444444-4444-7444-8444-444444444444';
const ROOT_KEY = Buffer.alloc(32, 7);

const FIXED_PRINCIPAL: TransactionsPrincipal = {
  tenantId: TENANT as TenantId,
  userId: USER as UserId,
};
const ACCOUNT = AccountRef.of(ACCOUNT_ID);

const encryption = new LocalAesGcmFieldEncryptionProvider({
  key: Buffer.alloc(32, 3),
  keyVersion: 'karar-ref:key-version:test-hsf@v1',
});

/**
 * A stored row as the driver would hand it over, with a REAL ciphertext so
 * the mapper runs its whole path rather than a date-shaped slice of it.
 */
async function storedRow(overrides: Partial<TransactionRow> = {}): Promise<TransactionRow> {
  const description = await encryption.encryptField(
    FIXED_PRINCIPAL,
    HsfField.of(syntheticMerchant('card purchase')),
    { table: 'transactions', rowId: ROW_ID, field: 'description' },
  );
  return {
    id: ROW_ID,
    tenantId: TENANT,
    userId: USER,
    accountId: ACCOUNT_ID,
    accountReferenceType: 'FINANCIAL_ACCOUNT',
    amountMinor: -4500n,
    currencyCode: 'QAR',
    originalAmountMinor: null,
    originalCurrencyCode: null,
    bookingDate: '2026-08-12',
    valueDate: null,
    eventOccurredAt: null,
    sourceTimezone: null,
    hsfAlgorithm: description.algorithm,
    hsfKeyVersion: description.keyVersion,
    descriptionCiphertext: description.ciphertext,
    descriptionNonce: description.nonce,
    descriptionAuthTag: description.authTag,
    merchantCiphertext: null,
    merchantNonce: null,
    merchantAuthTag: null,
    noteCiphertext: null,
    noteNonce: null,
    noteAuthTag: null,
    sourceKind: 'MANUAL',
    status: 'POSTED',
    dedupFingerprint: 'fingerprint',
    fingerprintVersion: DEDUP_FINGERPRINT_VERSION,
    occurrenceOrdinal: 1,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    ...overrides,
  };
}

function transactionFields(overrides: Record<string, unknown> = {}) {
  return {
    id: TransactionId.of(ROW_ID),
    tenantId: TENANT as TenantId,
    userId: USER as UserId,
    accountRef: ACCOUNT,
    amount: Money.of(-4500n, QAR),
    bookingDate: CalendarDay.of(2026, 8, 12),
    valueDate: null,
    eventOccurredAt: null,
    sourceTimezone: null,
    merchant: null,
    description: HsfField.of(syntheticMerchant('card purchase')),
    note: null,
    originalAmount: null,
    sourceKind: 'MANUAL' as const,
    status: 'POSTED' as const,
    createdAt: NOW,
    version: 1,
    ...overrides,
  };
}

describe('a booked day is the same day for every reader', () => {
  it.each(BOUNDARY_DAYS)(
    'reads %s back unchanged from every driver shape, in every host timezone',
    async (_label, year, month, day) => {
      const iso = CalendarDay.of(year, month, day).toString();
      for (const zone of HOST_ZONES) {
        await inHostZone(zone, async () => {
          // The three shapes a `date` column arrives in. The first is what
          // Prisma's client builds; the second is what node-postgres builds,
          // and on any non-UTC host the two are different INSTANTS naming the
          // same day; the third is the unambiguous text PostgreSQL sent.
          const asPrismaDate = new Date(`${iso}T00:00:00.000Z`);
          const asNodePgDate = new Date(year, month - 1, day);
          for (const [shape, value] of [
            ['prisma UTC midnight', asPrismaDate],
            ['node-postgres local midnight', asNodePgDate],
            ['raw text', iso],
          ] as const) {
            const transaction = await toTransaction(
              encryption,
              FIXED_PRINCIPAL,
              await storedRow({ bookingDate: value, valueDate: value }),
            );
            expect(
              transaction.bookingDate.toString(),
              `${iso} via ${shape} in ${zone}`,
            ).toBe(iso);
            expect(transaction.valueDate?.toString(), `${iso} value date via ${shape} in ${zone}`).toBe(
              iso,
            );
          }
        });
      }
    },
  );

  it('12 August stays 12 August even where reading UTC components would say the 11th', async () => {
    // The concrete regression. node-postgres hands back midnight LOCAL, so in
    // Asia/Qatar the instant is 2026-08-11T21:00:00Z: an implementation that
    // read getUTCDate() would store the 11th, and August would be one line
    // short at the month boundary two rows down.
    await inHostZone('Asia/Qatar', async () => {
      const localMidnight = new Date(2026, 7, 12);
      expect(localMidnight.getUTCDate(), 'the trap this test exists for').toBe(11);
      const transaction = await toTransaction(
        encryption,
        FIXED_PRINCIPAL,
        await storedRow({ bookingDate: localMidnight }),
      );
      expect(transaction.bookingDate.toString()).toBe('2026-08-12');
    });
  });

  it('1 September stays in September, where a shift changes the statement', async () => {
    // At a month boundary the same off-by-one moves the row into a different
    // statement, which is the failure ADR-0027 opens with.
    await inHostZone('Pacific/Kiritimati', async () => {
      const localMidnight = new Date(2026, 8, 1);
      const transaction = await toTransaction(
        encryption,
        FIXED_PRINCIPAL,
        await storedRow({ bookingDate: localMidnight }),
      );
      expect(transaction.bookingDate.month).toBe(9);
      expect(transaction.bookingDate.toString()).toBe('2026-09-01');
    });
    await inHostZone('Pacific/Niue', async () => {
      const utcMidnight = new Date('2026-09-01T00:00:00.000Z');
      const transaction = await toTransaction(
        encryption,
        FIXED_PRINCIPAL,
        await storedRow({ bookingDate: utcMidnight }),
      );
      expect(transaction.bookingDate.month).toBe(9);
      expect(transaction.bookingDate.toString()).toBe('2026-09-01');
    });
  });

  it('refuses a date column it cannot read, rather than guessing a day', async () => {
    await expect(
      toTransaction(encryption, FIXED_PRINCIPAL, await storedRow({ bookingDate: 'not-a-date' })),
    ).rejects.toBeInstanceOf(TransactionStoreError);
    // An instant-shaped string is refused too: whoever wrote it still has to
    // decide which zone turns it into a day, and truncating would decide for
    // them (CalendarDay.parse).
    await expect(
      toTransaction(
        encryption,
        FIXED_PRINCIPAL,
        await storedRow({ bookingDate: '2026-08-12T00:00:00Z' }),
      ),
    ).rejects.toBeInstanceOf(TransactionStoreError);
    await expect(
      toTransaction(encryption, FIXED_PRINCIPAL, await storedRow({ bookingDate: new Date('nope') })),
    ).rejects.toBeInstanceOf(TransactionStoreError);
  });
});

describe('an instant is admitted only when the source supplied one', () => {
  it('keeps the source instant and its stated zone exactly as given', () => {
    const transaction = createTransaction(
      transactionFields({ eventOccurredAt: EVENT_OCCURRED_AT, sourceTimezone: SOURCE_TIMEZONE }),
    );
    expect(transaction.eventOccurredAt?.toISOString()).toBe(EVENT_OCCURRED_AT.toISOString());
    expect(transaction.sourceTimezone).toBe(SOURCE_TIMEZONE);
    // And the day beside it is untouched by the instant: the two are separate
    // facts, not two renderings of one.
    expect(transaction.bookingDate.toString()).toBe('2026-08-12');
  });

  it('leaves the instant absent when the source stated none — nothing infers it', () => {
    const transaction = createTransaction(transactionFields());
    expect(transaction.eventOccurredAt).toBeNull();
    expect(transaction.sourceTimezone).toBeNull();
    // Specifically NOT midnight on the booked day, which is the value a
    // convenience default would have produced.
    expect(transaction.eventOccurredAt).not.toEqual(transaction.bookingDate.toUtcMidnight());
  });

  it('refuses a timezone with no instant to qualify', () => {
    expect(() => createTransaction(transactionFields({ sourceTimezone: 'Asia/Qatar' }))).toThrow(
      InvalidTransactionError,
    );
  });

  it('refuses a zone string that names no zone', () => {
    expect(() =>
      createTransaction(
        transactionFields({ eventOccurredAt: EVENT_OCCURRED_AT, sourceTimezone: 'Doha/Standard' }),
      ),
    ).toThrow(InvalidTransactionError);
  });

  it('refuses a Date where a calendar day belongs', () => {
    // Type erasure at a boundary — a JSON body, a driver row, a fixture — is
    // how an instant reaches a day-shaped field, so the constructor checks.
    expect(() =>
      createTransaction(transactionFields({ bookingDate: new Date('2026-08-12T00:00:00Z') })),
    ).toThrow(InvalidTransactionError);
    expect(() =>
      createTransaction(
        transactionFields({
          bookingDate: CalendarDay.of(2026, 8, 12),
          valueDate: new Date('2026-08-13T00:00:00Z'),
        }),
      ),
    ).toThrow(InvalidTransactionError);
  });

  it('carries both into the revision snapshot, so a rewrite would be visible', () => {
    const values = valuesOf(
      createTransaction(
        transactionFields({ eventOccurredAt: EVENT_OCCURRED_AT, sourceTimezone: SOURCE_TIMEZONE }),
      ),
    );
    expect(values.eventOccurredAt?.toISOString()).toBe(EVENT_OCCURRED_AT.toISOString());
    expect(values.sourceTimezone).toBe(SOURCE_TIMEZONE);
    expect(values.bookingDate.toString()).toBe('2026-08-12');
  });
});

describe('the keyset cursor names a day, not an instant', () => {
  it('round-trips a day through the encoding', () => {
    const encoded = encodeCursor({
      bookingDate: CalendarDay.of(2026, 8, 12),
      id: TransactionId.of(ROW_ID),
    });
    const decoded = decodeCursor(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.bookingDate.toString()).toBe('2026-08-12');
    expect(decoded.value.id).toBe(ROW_ID);
  });

  it('round-trips identically from every host timezone', async () => {
    const cursor = {
      bookingDate: CalendarDay.of(2026, 12, 31),
      id: TransactionId.of(ROW_ID),
    };
    const encodings = await Promise.all(
      HOST_ZONES.map((zone) => inHostZone(zone, () => encodeCursor(cursor))),
    );
    expect(new Set(encodings).size, 'a cursor must not depend on where it was minted').toBe(1);
  });

  it('refuses a cursor minted under the old instant encoding', () => {
    // The old encoding was an ISO instant. Accepting it would resume the page
    // at a position that means something slightly different, which on a
    // transaction list is a row the user never sees.
    const legacy = Buffer.from(`2026-08-12T00:00:00.000Z|${ROW_ID}`, 'utf8').toString('base64url');
    const decoded = decodeCursor(legacy);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error.kind).toBe('INVALID_CURSOR');
  });
});

describe('dedup fingerprint: the day is the input, and nothing else moved', () => {
  const provider = new LocalKeyedDedupFingerprintProvider({ rootKey: ROOT_KEY });

  function input(overrides: Partial<FingerprintInput> = {}): FingerprintInput {
    return {
      accountRef: ACCOUNT,
      bookingDate: CalendarDay.of(2026, 8, 12),
      amountMinorUnits: -4500n,
      currencyCode: 'QAR',
      normalizedNarrative: syntheticMerchant('corner shop'),
      ...overrides,
    };
  }

  /**
   * The exact digest this definition produces for a fixed key, a fixed
   * subject, and a fixed movement.
   *
   * Pinned as a literal on purpose. Every other assertion in this file
   * compares two digests to each other, which would still pass if the whole
   * construction changed underneath; this one fails the moment the encoding,
   * the field order, the key derivation, or the day rendering moves — which
   * is precisely when the version identifier is supposed to move with it.
   */
  const EXPECTED_DIGEST = '2e2fe3e1593a6656fc76a3b8ffeb52555f6ab24183a6ef9297f764e77ccdc868';

  it('produces the exact expected digest, from any host timezone', async () => {
    for (const zone of HOST_ZONES) {
      const digest = await inHostZone(zone, () => provider.fingerprint(FIXED_PRINCIPAL, input()));
      expect(digest.value, `digest differed in ${zone}`).toBe(EXPECTED_DIGEST);
      expect(digest.version).toBe('dedup/hmac-sha256/calendar-day/v3');
    }
  });

  it('digests the day as its own YYYY-MM-DD string, with no timezone in the path', async () => {
    // The construction restated independently of the implementation: if the
    // provider ever reaches for a clock, a zone, or a different rendering of
    // the day, these two stop agreeing.
    const parts = [
      'FINANCIAL_ACCOUNT',
      ACCOUNT_ID,
      '2026-08-12',
      '-4500',
      'QAR',
      syntheticMerchant('corner shop'),
    ];
    const encoding = parts.map((part) => `${part.length}:${part}`).join('|');
    const subjectKey = createHmac('sha256', ROOT_KEY)
      .update(`karar/transactions/dedup/v1|${TENANT}|${USER}`, 'utf8')
      .digest();
    const independently = createHmac('sha256', subjectKey).update(encoding, 'utf8').digest('hex');
    expect((await provider.fingerprint(FIXED_PRINCIPAL, input())).value).toBe(independently);
    expect(independently).toBe(EXPECTED_DIGEST);
  });

  it.each(BOUNDARY_DAYS)(
    'fingerprints %s identically however the day was constructed',
    async (_label, year, month, day) => {
      const fromComponents = await provider.fingerprint(
        FIXED_PRINCIPAL,
        input({ bookingDate: CalendarDay.of(year, month, day) }),
      );
      const fromString = await provider.fingerprint(
        FIXED_PRINCIPAL,
        input({ bookingDate: CalendarDay.parse(CalendarDay.of(year, month, day).toString()) }),
      );
      expect(fromString.value).toBe(fromComponents.value);

      // Both neighbours are different content. Without this the "identical"
      // assertion above would pass for an implementation that ignored the day
      // altogether.
      for (const neighbour of [-1, 1]) {
        const shifted = CalendarDay.fromInstant(
          new Date(Date.UTC(year, month - 1, day + neighbour)),
          'UTC',
        );
        const other = await provider.fingerprint(FIXED_PRINCIPAL, input({ bookingDate: shifted }));
        expect(other.value, `${shifted.toString()} collided with the neighbouring day`).not.toBe(
          fromComponents.value,
        );
      }
    },
  );

  it('gives one content identity two namespaces when the version moves', async () => {
    // Same content, two definitions. The digest bytes may well be equal —
    // the value is a MAC over content, and content did not change — so what
    // keeps the two apart is that identity is the PAIR (version, value), and
    // fingerprint_version is a column in transactions_dedup_key. That is why
    // a version bump starts a fresh namespace instead of colliding, and it is
    // asserted against live PostgreSQL in the integration suite.
    const current = await provider.fingerprint(FIXED_PRINCIPAL, input());
    const underPredecessor = { version: 'dedup/hmac-sha256/utc-day/v2', value: current.value };
    expect(fingerprintsEqual(current, underPredecessor)).toBe(false);
    expect(current.version).not.toBe(underPredecessor.version);
  });

  it('is unchanged by the source instant and its zone', async () => {
    // Structural, because FingerprintInput has no field for either: an input
    // carrying them does not compile, and at runtime the extra properties
    // cannot reach the digest.
    const withInstant = {
      ...input(),
      eventOccurredAt: EVENT_OCCURRED_AT,
      sourceTimezone: SOURCE_TIMEZONE,
    } as FingerprintInput;
    const withoutInstant = await provider.fingerprint(FIXED_PRINCIPAL, input());
    expect((await provider.fingerprint(FIXED_PRINCIPAL, withInstant)).value).toBe(
      withoutInstant.value,
    );
  });

  it('is unchanged by how many times that content occurred', async () => {
    // The ordinal is a column beside the digest, not a field inside it, so
    // there is no input to vary — the same absence, restated here beside the
    // instant so the two exclusions are read together.
    const withOrdinal = { ...input(), occurrenceOrdinal: 7 } as FingerprintInput;
    expect((await provider.fingerprint(FIXED_PRINCIPAL, withOrdinal)).value).toBe(EXPECTED_DIGEST);
  });

  it('names a currency registry entry, so the fixture is not a fiction', () => {
    // Guards the pinned digest above: it is computed over 'QAR', and a QAR
    // that stopped being a supported currency would make the constant a
    // record of nothing.
    expect(Currency.get('QAR').code).toBe('QAR');
  });
});
