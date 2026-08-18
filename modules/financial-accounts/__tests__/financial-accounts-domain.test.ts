/**
 * Domain invariants and money exactness.
 *
 * Every fixture here is obviously synthetic — display names say so, the masks
 * are `0000`-shaped, and the identifiers are patterned UUIDs. Nothing in this
 * file resembles a real account, a real institution, or a real balance.
 */

import { describe, expect, it } from 'vitest';

import { Currency, Money, TenantId, UserId } from '@karar/shared-kernel';

import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CONSTRUCTIBLE_SOURCE_KINDS,
  SOURCE_KINDS,
  applyAccountEdit,
  checkCurrencyChange,
  checkProviderConnection,
  createFinancialAccount,
  isMask,
  resolveSupportedCurrency,
  type FinancialAccount,
} from '../domain/financial-account.js';
import {
  INSTITUTION_STATUSES,
  isSelectableForNewAccount,
  isValidInstitutionCode,
  type Institution,
} from '../domain/institution.js';
import { byMostRecentlyTrue, latestReported } from '../domain/balance-snapshot.js';
import type { BalanceSnapshot } from '../domain/balance-snapshot.js';
import type {
  BalanceSnapshotId,
  FinancialAccountId,
  InstitutionRef,
  ProviderConnectionRef,
  SourceReference,
} from '../domain/refs.js';

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const ACCOUNT_ID = 'fa000000-0000-4000-8000-0000000000f1' as FinancialAccountId;
const INSTITUTION_ID = '11111111-0000-4000-8000-000000000011' as InstitutionRef;
const NOW = new Date('2026-08-18T12:00:00.000Z');
const QAR = Currency.get('QAR');
const KWD = Currency.get('KWD');

function newAccountInput(overrides: Partial<Parameters<typeof createFinancialAccount>[0]> = {}) {
  return {
    id: ACCOUNT_ID,
    tenantId: TENANT_A,
    userId: USER_A1,
    institutionRef: null,
    userSuppliedInstitutionLabel: null,
    accountType: 'CURRENT' as const,
    currency: QAR,
    displayName: 'Synthetic Test Account One',
    mask: null,
    sourceKind: 'MANUAL' as const,
    createdAt: NOW,
    ...overrides,
  };
}

function builtAccount(
  overrides: Partial<Parameters<typeof createFinancialAccount>[0]> = {},
): FinancialAccount {
  const result = createFinancialAccount(newAccountInput(overrides));
  if (!result.ok) throw new Error(`fixture is not buildable: ${result.error.kind}`);
  return result.value;
}

describe('financial-accounts domain: vocabularies', () => {
  it('the account status vocabulary contains nothing that means connected or synced', () => {
    // The legacy connect-a-bank screen showed a Synced badge over a fabricated
    // row. This vocabulary is where that claim would have to live, so this is
    // where it is forbidden.
    expect([...ACCOUNT_STATUSES]).toEqual(['ACTIVE', 'ARCHIVED', 'CLOSED']);
    for (const status of ACCOUNT_STATUSES) {
      expect(/connect|sync|link/i.test(status)).toBe(false);
    }
  });

  it('EXTERNAL_PROVIDER is modelled but is not a constructible source kind', () => {
    expect([...SOURCE_KINDS]).toContain('EXTERNAL_PROVIDER');
    expect([...CONSTRUCTIBLE_SOURCE_KINDS]).toEqual(['MANUAL', 'CSV']);
    expect([...CONSTRUCTIBLE_SOURCE_KINDS]).not.toContain('EXTERNAL_PROVIDER');
  });

  it('the account type vocabulary covers the declared kinds and stays extensible', () => {
    expect([...ACCOUNT_TYPES]).toEqual([
      'CURRENT',
      'SAVINGS',
      'CREDIT_CARD',
      'CASH',
      'WALLET',
      'OTHER',
    ]);
  });

  it('institution status is ACTIVE or RETIRED, and only ACTIVE is selectable for a new account', () => {
    expect([...INSTITUTION_STATUSES]).toEqual(['ACTIVE', 'RETIRED']);
    const retired: Institution = {
      id: INSTITUTION_ID,
      code: 'QA_SYNTHETIC_TEST_ONE',
      displayNameEn: 'Synthetic Test Institution One',
      displayNameAr: 'مؤسسة اختبار اصطناعية واحد',
      status: 'RETIRED',
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(isSelectableForNewAccount(retired)).toBe(false);
    expect(isSelectableForNewAccount({ ...retired, status: 'ACTIVE' })).toBe(true);
    expect(isValidInstitutionCode('QA_SYNTHETIC_TEST_ONE')).toBe(true);
    expect(isValidInstitutionCode('a bank whose name someone typed')).toBe(false);
  });
});

describe('financial-accounts domain: the mask is a mask, structurally', () => {
  it('accepts short masked fragments', () => {
    for (const candidate of ['00', '0000', '*0000', '****0000', 'xx0000', '##00']) {
      expect(isMask(candidate)).toBe(true);
    }
  });

  it('refuses anything that could be part of a real account number', () => {
    for (const candidate of [
      '4111111111111111', // card-length digit run
      '0000000000000000',
      'QA00SYNT000000000000000000000', // IBAN-shaped
      '12345', // five digits is already more than a mask
      '***', // no digits at all
      '000 000',
      '',
    ]) {
      expect(isMask(candidate)).toBe(false);
    }
  });

  it('the factory refuses a full number in the mask field, naming the rule', () => {
    const refused = createFinancialAccount(newAccountInput({ mask: '4111111111111111' }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('mask_not_a_mask');
  });
});

describe('financial-accounts domain: currency', () => {
  it('resolves supported codes and refuses unsupported ones as a value, not a throw', () => {
    const supported = resolveSupportedCurrency('QAR');
    expect(supported.ok).toBe(true);
    if (supported.ok) expect(supported.value.exponent).toBe(2);

    const unsupported = resolveSupportedCurrency('XYZ');
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.error.kind).toBe('unsupported_currency');
      expect(unsupported.error.requestedCode).toBe('XYZ');
    }
  });

  it('an account currency may be corrected while no financial records exist', () => {
    const account = builtAccount();
    expect(checkCurrencyChange(account, KWD, false).ok).toBe(true);
  });

  it('an account currency is frozen once financial records exist', () => {
    const account = builtAccount();
    const refused = checkCurrencyChange(account, KWD, true);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.kind).toBe('currency_immutable_with_records');
      expect(refused.error.accountId).toBe(ACCOUNT_ID);
    }
  });

  it('a no-op currency change is always permitted, records or not', () => {
    const account = builtAccount();
    expect(checkCurrencyChange(account, QAR, true).ok).toBe(true);
  });

  it('applyAccountEdit refuses the frozen change and permits the free one', () => {
    const account = builtAccount();
    const frozen = applyAccountEdit(
      account,
      { currency: KWD },
      { hasFinancialRecords: true, at: NOW },
    );
    expect(frozen.ok).toBe(false);

    const permitted = applyAccountEdit(
      account,
      { currency: KWD },
      { hasFinancialRecords: false, at: NOW },
    );
    expect(permitted.ok).toBe(true);
    if (permitted.ok) {
      expect(permitted.value.currency.code).toBe('KWD');
      expect(permitted.value.version).toBe(2);
    }
  });
});

describe('financial-accounts domain: provider connections and institution naming', () => {
  it('a MANUAL account must not claim a provider connection', () => {
    const refused = checkProviderConnection(
      'MANUAL',
      'provider-connection-that-does-not-exist' as ProviderConnectionRef,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('provider_connection_mismatch');
  });

  it('a CSV account must not claim one either', () => {
    expect(
      checkProviderConnection('CSV', 'provider-connection' as ProviderConnectionRef).ok,
    ).toBe(false);
  });

  it('MANUAL and CSV with no connection are consistent, and EXTERNAL_PROVIDER needs one', () => {
    expect(checkProviderConnection('MANUAL', null).ok).toBe(true);
    expect(checkProviderConnection('CSV', null).ok).toBe(true);
    expect(checkProviderConnection('EXTERNAL_PROVIDER', null).ok).toBe(false);
  });

  it('every account the factory builds carries no provider connection', () => {
    for (const sourceKind of CONSTRUCTIBLE_SOURCE_KINDS) {
      const account = builtAccount({ sourceKind });
      expect(account.providerConnectionRef).toBeNull();
      expect(account.status).toBe('ACTIVE');
      expect(account.version).toBe(1);
    }
  });

  it('an institution is named one way or the other, never both', () => {
    const refused = createFinancialAccount(
      newAccountInput({
        institutionRef: INSTITUTION_ID,
        userSuppliedInstitutionLabel: 'Synthetic Unlisted Institution',
      }),
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('institution_named_twice');

    expect(createFinancialAccount(newAccountInput({ institutionRef: INSTITUTION_ID })).ok).toBe(
      true,
    );
    expect(
      createFinancialAccount(
        newAccountInput({ userSuppliedInstitutionLabel: 'Synthetic Unlisted Institution' }),
      ).ok,
    ).toBe(true);
    // Neither is legitimate: a cash account names no institution.
    expect(createFinancialAccount(newAccountInput({ accountType: 'CASH' })).ok).toBe(true);
  });

  it('an edit cannot reach the both-named state either', () => {
    const account = builtAccount({ institutionRef: INSTITUTION_ID });
    const refused = applyAccountEdit(
      account,
      { userSuppliedInstitutionLabel: 'Synthetic Unlisted Institution' },
      { hasFinancialRecords: false, at: NOW },
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('institution_named_twice');
  });
});

describe('financial-accounts domain: display text', () => {
  it('refuses empty and whitespace-only display names, and trims the rest', () => {
    for (const displayName of ['', '   ', '\t\n']) {
      const refused = createFinancialAccount(newAccountInput({ displayName }));
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.kind).toBe('invalid_display_text');
    }
    const trimmed = createFinancialAccount(
      newAccountInput({ displayName: '  Synthetic Test Account One  ' }),
    );
    expect(trimmed.ok).toBe(true);
    if (trimmed.ok) expect(trimmed.value.displayName).toBe('Synthetic Test Account One');
  });

  it('refuses display text longer than the schema admits', () => {
    const refused = createFinancialAccount(newAccountInput({ displayName: 'x'.repeat(121) }));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('invalid_display_text');
    expect(createFinancialAccount(newAccountInput({ displayName: 'x'.repeat(120) })).ok).toBe(
      true,
    );
  });
});

describe('financial-accounts domain: money exactness at the boundaries', () => {
  // These are the values a float-backed implementation gets wrong. If any of
  // them ever fails, the money path has stopped being exact.
  it('the classic float failure is exact in minor units', () => {
    const tenFils = Money.fromDecimalString('0.10', QAR);
    const twentyFils = Money.fromDecimalString('0.20', QAR);
    expect(tenFils.add(twentyFils).minorUnits).toBe(30n);
    expect(tenFils.add(twentyFils).toString()).toBe('QAR 0.30');
  });

  it('the exponent comes from the currency, never from an assumption about cents', () => {
    expect(Money.of(1000n, QAR).toString()).toBe('QAR 10.00');
    expect(Money.of(1000n, KWD).toString()).toBe('KWD 1.000');
  });

  it('a balance beyond the safe integer range survives storage arithmetic exactly', () => {
    // 2^53 is where a JavaScript number stops being able to count.
    const beyondSafeInteger = 9007199254740993n;
    const amount = Money.of(beyondSafeInteger, QAR);
    expect(amount.minorUnits).toBe(beyondSafeInteger);
    expect(amount.toWireString()).toBe('9007199254740993');
    expect(Number.isSafeInteger(Number(beyondSafeInteger))).toBe(false);
  });

  it('a negative balance is representable, because a credit card owes money', () => {
    const owed = Money.fromDecimalString('-1234.56', QAR);
    expect(owed.minorUnits).toBe(-123456n);
    expect(owed.isNegative()).toBe(true);
    expect(owed.toString()).toBe('QAR -1234.56');
  });

  it('excess precision is refused rather than rounded', () => {
    expect(() => Money.fromDecimalString('12.345', QAR)).toThrow();
    expect(Money.fromDecimalString('12.345', KWD).minorUnits).toBe(12345n);
  });

  it('cross-currency arithmetic throws instead of producing a plausible wrong number', () => {
    expect(() => Money.of(100n, QAR).add(Money.of(100n, KWD))).toThrow();
  });
});

describe('financial-accounts domain: balances are selected, never computed', () => {
  function snapshot(
    id: string,
    minorUnits: bigint,
    asOf: string,
    capturedAt: string,
  ): BalanceSnapshot {
    return {
      id: id as BalanceSnapshotId,
      tenantId: TENANT_A,
      userId: USER_A1,
      accountId: ACCOUNT_ID,
      amount: Money.of(minorUnits, QAR),
      asOf: new Date(asOf),
      sourceKind: 'MANUAL',
      sourceReference: 'synthetic-test-fixture' as SourceReference,
      capturedAt: new Date(capturedAt),
      createdAt: NOW,
    };
  }

  const older = snapshot(
    'b5000000-0000-4000-8000-0000000000b1',
    100_00n,
    '2026-07-31T00:00:00.000Z',
    '2026-08-01T00:00:00.000Z',
  );
  const newer = snapshot(
    'b5000000-0000-4000-8000-0000000000b2',
    250_00n,
    '2026-08-31T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z',
  );
  const sameAsOfLaterCapture = snapshot(
    'b5000000-0000-4000-8000-0000000000b3',
    999_00n,
    '2026-08-31T00:00:00.000Z',
    '2026-09-05T00:00:00.000Z',
  );

  it('the latest reported balance is one of the reported rows, unchanged', () => {
    const latest = latestReported([older, newer]);
    expect(latest?.id).toBe(newer.id);
    // The returned amount is byte-for-byte the reported figure, not a sum:
    // 100.00 + 250.00 would be 350.00, and that number appears nowhere.
    expect(latest?.amount.minorUnits).toBe(250_00n);
  });

  it('a later capture of the same as_of wins, because it is the more recent information', () => {
    expect(latestReported([newer, sameAsOfLaterCapture])?.id).toBe(sameAsOfLaterCapture.id);
    expect(byMostRecentlyTrue(sameAsOfLaterCapture, newer)).toBeLessThan(0);
  });

  it('no reported snapshots means no balance, not a computed zero', () => {
    expect(latestReported([])).toBeNull();
  });
});
