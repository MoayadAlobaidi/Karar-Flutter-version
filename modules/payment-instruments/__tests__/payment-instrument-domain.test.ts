/**
 * The instrument aggregate's rules, proved against the type rather than
 * against the intention behind it.
 *
 * Three of them are guarantees this module exists for:
 *
 *   1. **No balance, ever.** `PaymentInstrument` has exactly one numeric
 *      field and it is the concurrency token. Asserted over `Object.keys` at
 *      runtime, so a field added to the interface fails here even if every
 *      other suite still passes.
 *   2. **Exactly one account, frozen.** The edit type carries no account id,
 *      so re-pointing is unexpressible; a caller reaching for it through a
 *      cast is refused; and the database refuses it again (SQLSTATE KAR30,
 *      proved in the schema suite).
 *   3. **No status means connected.** `impliesLiveIssuerLink` answers `false`
 *      for every member of the closed vocabulary, checked exhaustively rather
 *      than sampled.
 */

import { describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import {
  CONSTRUCTIBLE_INSTRUMENT_STATUSES,
  INSTRUMENT_STATUSES,
  INSTRUMENT_TYPES,
  applyInstrumentEdit,
  canTransition,
  createPaymentInstrument,
  impliesLiveIssuerLink,
  isSpendableStatus,
  type InstrumentStatus,
  type PaymentInstrument,
} from '../domain/payment-instrument.js';
import { HSF_REDACTION } from '../domain/hsf-field.js';
import { BalanceBearingAccountRef, type PaymentInstrumentId } from '../domain/refs.js';

const TENANT = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const INSTRUMENT_ID = 'cccccccc-0000-7000-8000-00000000000c' as PaymentInstrumentId;
const WALLET_ID = 'dddddddd-0000-7000-8000-00000000000d';
const OTHER_ACCOUNT_ID = 'eeeeeeee-0000-7000-8000-00000000000e';
const AT = new Date('2026-08-19T09:00:00.000Z');

function build(overrides: Partial<Parameters<typeof createPaymentInstrument>[0]> = {}) {
  return createPaymentInstrument({
    id: INSTRUMENT_ID,
    tenantId: TENANT,
    userId: USER,
    accountId: WALLET_ID,
    instrumentType: 'VIRTUAL_CARD',
    mask: '**00',
    displayLabel: 'Synthetic Test Instrument One',
    recordedAt: AT,
    ...overrides,
  });
}

function unwrap(result: ReturnType<typeof build>): PaymentInstrument {
  if (!result.ok) throw new Error(`expected a built instrument, got ${result.error.kind}`);
  return result.value;
}

describe('a payment instrument has no balance and cannot acquire one', () => {
  it('carries exactly one numeric field, and it is the concurrency token', () => {
    const instrument = unwrap(build());
    const numericFields = Object.entries(instrument)
      .filter(([, value]) => typeof value === 'number')
      .map(([key]) => key);
    expect(numericFields).toEqual(['version']);
  });

  it('carries no field named for money, a limit, or a denomination', () => {
    // A name scan beside the type scan: `availableHeadroom: string` would slip
    // past the numeric check above and is exactly the shape a later
    // convenience takes.
    const instrument = unwrap(build());
    const forbidden = [
      'balance',
      'amount',
      'minor',
      'limit',
      'available',
      'headroom',
      'currency',
      'total',
      'net',
      'spent',
      'remaining',
      'credit',
      'expiry',
      'expires',
      'cvv',
      'token',
      'pan',
    ];
    for (const key of Object.keys(instrument)) {
      for (const word of forbidden) {
        expect(
          key.toLowerCase().includes(word),
          `PaymentInstrument.${key} matches the forbidden vocabulary ('${word}')`,
        ).toBe(false);
      }
    }
  });

  it('renders both protected fields as a redaction, never as their value', () => {
    const instrument = unwrap(build());
    expect(String(instrument.mask)).toBe(HSF_REDACTION);
    expect(String(instrument.displayLabel)).toBe(HSF_REDACTION);
    expect(JSON.stringify(instrument)).not.toContain('**00');
    expect(JSON.stringify(instrument)).not.toContain('Synthetic Test Instrument One');
    // And the plaintext is still reachable where the code names it.
    expect(instrument.mask.reveal()).toBe('**00');
  });
});

describe('an instrument spends from exactly one account', () => {
  it('records the account as a singular reference with a declared kind', () => {
    const instrument = unwrap(build());
    expect(instrument.accountRef).toEqual(
      BalanceBearingAccountRef.of(WALLET_ID, 'FINANCIAL_ACCOUNT'),
    );
  });

  it('an edit cannot carry an account id — the field does not exist', () => {
    // The rule as a type. A caller reaching for it through a cast lands on the
    // assertion below; a writer bypassing the use case lands on the trigger.
    const instrument = unwrap(build());
    const edited = applyInstrumentEdit(
      instrument,
      { displayLabel: 'Synthetic Test Instrument Renamed' },
      AT,
    );
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.value.accountRef.accountId).toBe(WALLET_ID);
      expect(edited.value.accountRef.accountId).not.toBe(OTHER_ACCOUNT_ID);
    }
    const edit = { accountId: OTHER_ACCOUNT_ID } as unknown as { displayLabel?: string };
    // A property the edit type does not declare is simply not read: the
    // account survives untouched rather than being quietly reassigned.
    const ignored = applyInstrumentEdit(instrument, edit, AT);
    expect(ignored.ok).toBe(true);
    if (ignored.ok) expect(ignored.value.accountRef.accountId).toBe(WALLET_ID);
  });

  it('two instruments on ONE account are two objects with one accountRef', () => {
    // The ADR-0028 case, at the type level: two virtual cards on one wallet.
    const first = unwrap(build({ mask: '**00' }));
    const second = unwrap(
      build({
        id: 'cccccccc-0000-7000-8000-00000000000f' as PaymentInstrumentId,
        mask: '**11',
        displayLabel: 'Synthetic Test Instrument Two',
      }),
    );
    expect(first.id).not.toBe(second.id);
    expect(first.accountRef.accountId).toBe(second.accountRef.accountId);
    // And there is nothing to add. Neither object carries a figure, so "two
    // cards" cannot become "two balances" by any operation available here.
    expect(Object.keys(first).filter((k) => typeof (first as never)[k] === 'number')).toEqual([
      'version',
    ]);
  });
});

describe('the instrument vocabularies', () => {
  it('names categories and never an issuer, a scheme or a provider', () => {
    expect([...INSTRUMENT_TYPES]).toEqual([
      'PHYSICAL_CARD',
      'VIRTUAL_CARD',
      'PREPAID_CARD',
      'TOKENIZED_CARD',
      'QR_PAYMENT_IDENTITY',
      'OTHER',
    ]);
  });

  it('no status implies a live issuer link — checked over every member', () => {
    for (const status of INSTRUMENT_STATUSES) {
      expect({ status, implies: impliesLiveIssuerLink(status) }).toEqual({
        status,
        implies: false,
      });
    }
    // And the vocabulary contains none of the words that would.
    for (const status of INSTRUMENT_STATUSES) {
      expect(
        ['CONNECTED', 'SYNCED', 'LINKED', 'AUTHORIZED', 'PROVISIONED', 'TOKENIZED'].includes(
          status,
        ),
      ).toBe(false);
    }
  });

  it('only ACTIVE is spendable, and the answer is stated rather than inferred', () => {
    expect(INSTRUMENT_STATUSES.filter(isSpendableStatus)).toEqual(['ACTIVE']);
  });

  it('a dead instrument cannot be recorded as new', () => {
    expect([...CONSTRUCTIBLE_INSTRUMENT_STATUSES]).toEqual(['ACTIVE', 'SUSPENDED']);
    for (const status of ['EXPIRED', 'CANCELLED'] as const) {
      const built = build({ status: status as never });
      expect(built.ok).toBe(false);
      if (!built.ok) expect(built.error.kind).toBe('unknown_vocabulary_value');
    }
  });

  it('CANCELLED and EXPIRED are terminal', () => {
    for (const terminal of ['CANCELLED', 'EXPIRED'] as const) {
      for (const target of INSTRUMENT_STATUSES) {
        expect({ terminal, target, allowed: canTransition(terminal, target) }).toEqual({
          terminal,
          target,
          allowed: terminal === target,
        });
      }
    }
  });

  it('a refused transition names both ends and is a Result, not a throw', () => {
    const cancelled = applyInstrumentEdit(unwrap(build()), { status: 'CANCELLED' }, AT);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    const revived = applyInstrumentEdit(cancelled.value, { status: 'ACTIVE' }, AT);
    expect(revived.ok).toBe(false);
    if (!revived.ok && revived.error.kind === 'status_transition_not_available') {
      expect(revived.error.from).toBe('CANCELLED');
      expect(revived.error.to).toBe('ACTIVE');
    } else {
      throw new Error('expected a status_transition_not_available refusal');
    }
  });
});

describe('editing an instrument', () => {
  it('refuses a mask that is a card number, before anything is encrypted', () => {
    const edited = applyInstrumentEdit(unwrap(build()), { mask: '1111222233334444' }, AT);
    expect(edited.ok).toBe(false);
    if (!edited.ok) {
      expect(edited.error.kind).toBe('instrument_mask_not_storable');
      expect(edited.error.message).not.toContain('1111222233334444');
    }
  });

  it('refuses a blank label rather than deriving one', () => {
    const edited = applyInstrumentEdit(unwrap(build()), { displayLabel: '   ' }, AT);
    expect(edited.ok).toBe(false);
    if (!edited.ok) expect(edited.error.kind).toBe('invalid_display_text');
  });

  it('returns the SAME object when nothing changed, so no version is burned', () => {
    const instrument = unwrap(build());
    const edited = applyInstrumentEdit(
      instrument,
      { displayLabel: 'Synthetic Test Instrument One', mask: '**00', status: 'ACTIVE' },
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(edited.ok).toBe(true);
    if (edited.ok) {
      expect(edited.value).toBe(instrument);
      expect(edited.value.version).toBe(1);
    }
  });

  it('advances the version by exactly one on a real change', () => {
    const instrument = unwrap(build());
    const edited = applyInstrumentEdit(instrument, { status: 'SUSPENDED' as InstrumentStatus }, AT);
    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.value.version).toBe(instrument.version + 1);
  });
});
