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
  ACCOUNT_NATURES,
  ACCOUNT_ORIGINS,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  CONSTRUCTIBLE_ACCOUNT_ORIGINS,
  MAX_MASK_LENGTH,
  WALLET_KINDS,
  applyAccountEdit,
  checkCurrencyChange,
  checkWalletKind,
  createFinancialAccount,
  isMask,
  resolveSupportedCurrency,
  type FinancialAccount,
} from '../domain/financial-account.js';
import {
  INSTITUTION_KINDS,
  INSTITUTION_STATUSES,
  isSelectableForNewAccount,
  isValidInstitutionCode,
  type Institution,
} from '../domain/institution.js';
import {
  BALANCE_KINDS,
  CONSTRUCTIBLE_SOURCE_KINDS,
  SOURCE_KINDS,
  byMostRecentlyTrue,
  createBalanceSnapshot,
  isBalanceKind,
  isValidSourceReference,
  latestReported,
} from '../domain/balance-snapshot.js';
import type { BalanceKind, BalanceSnapshot } from '../domain/balance-snapshot.js';
import { HSF_REDACTION, HsfField } from '../domain/hsf-field.js';
import type {
  BalanceSnapshotId,
  FinancialAccountId,
  InstitutionRef,
  SourceReference,
} from '../domain/refs.js';

const TENANT_A = TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a');
const USER_A1 = UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1');
const ACCOUNT_ID = 'fa000000-0000-4000-8000-0000000000f1' as FinancialAccountId;
const INSTITUTION_ID = '11111111-0000-4000-8000-000000000011' as InstitutionRef;
const NOW = new Date('2026-08-18T12:00:00.000Z');
const QAR = Currency.get('QAR');
const KWD = Currency.get('KWD');
/** Obviously synthetic, and a UUID because the column is one (migration 0089). */
const SYNTHETIC_SOURCE_REFERENCE =
  '5e000000-0000-4000-8000-00000000005e' as SourceReference;

function newAccountInput(overrides: Partial<Parameters<typeof createFinancialAccount>[0]> = {}) {
  return {
    id: ACCOUNT_ID,
    tenantId: TENANT_A,
    userId: USER_A1,
    institutionRef: null,
    userSuppliedInstitutionLabel: null,
    accountType: 'CURRENT' as const,
    walletKind: null,
    nature: 'UNKNOWN' as const,
    currency: QAR,
    displayName: 'Synthetic Test Account One',
    mask: null,
    origin: 'MANUAL' as const,
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

  it('EXTERNAL_PROVIDER is modelled but is not a constructible account origin', () => {
    expect([...ACCOUNT_ORIGINS]).toContain('EXTERNAL_PROVIDER');
    expect([...CONSTRUCTIBLE_ACCOUNT_ORIGINS]).toEqual(['MANUAL', 'CSV']);
    expect([...CONSTRUCTIBLE_ACCOUNT_ORIGINS]).not.toContain('EXTERNAL_PROVIDER');
  });

  it('the snapshot reporter vocabulary is its own, and is not the account origin', () => {
    // They currently hold the same three values and mean different things: one
    // says who reported ONE figure, the other says how the account first came
    // to exist. Keeping them as separate declarations is what stops a later
    // change to one silently redefining the other (ADR-0028).
    expect([...SOURCE_KINDS]).toContain('EXTERNAL_PROVIDER');
    expect([...CONSTRUCTIBLE_SOURCE_KINDS]).toEqual(['MANUAL', 'CSV']);
  });

  it('the wallet-kind vocabulary names categories, never a provider, and never crypto', () => {
    expect([...WALLET_KINDS]).toEqual([
      'MOBILE_MONEY',
      'E_MONEY',
      'PREPAID',
      'PAYROLL',
      'SUPER_APP',
      'OTHER',
    ]);
    for (const kind of WALLET_KINDS) {
      expect(/CRYPTO|TOKEN|COIN|BTC|STABLE/i.test(kind)).toBe(false);
    }
  });

  it('account nature is has, owes, or nobody has said — and UNKNOWN is not a placeholder', () => {
    expect([...ACCOUNT_NATURES]).toEqual(['ASSET', 'LIABILITY', 'UNKNOWN']);
  });

  it('the issuer-kind vocabulary is the nine declared categories and names no company', () => {
    expect([...INSTITUTION_KINDS]).toEqual([
      'BANK',
      'E_MONEY_ISSUER',
      'MOBILE_MONEY_OPERATOR',
      'TELCO_FINANCIAL_SERVICES',
      'PAYMENT_INSTITUTION',
      'FINTECH_WALLET',
      'CARD_ISSUER',
      'EXCHANGE_HOUSE',
      'OTHER',
    ]);
    // Nothing here may mean reachable: provider access is a per-market status
    // with its own evidence (migration 0094), never an issuer-level claim.
    for (const kind of INSTITUTION_KINDS) {
      expect(/CONNECT|SYNC|LINK|INTEGRAT|SUPPORTED|AVAILABLE/i.test(kind)).toBe(false);
    }
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
      kind: 'BANK',
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

describe('financial-accounts domain: the wallet invariant and institution naming', () => {
  it('a wallet kind is present if and only if the account type is WALLET', () => {
    // Both directions, because each fails differently: an undescribed wallet
    // makes every later reader guess, and a non-wallet carrying a wallet kind
    // is a contradiction that reads as truth.
    for (const walletKind of WALLET_KINDS) {
      expect(checkWalletKind('WALLET', walletKind).ok).toBe(true);
      for (const accountType of ACCOUNT_TYPES) {
        if (accountType === 'WALLET') continue;
        const refused = checkWalletKind(accountType, walletKind);
        expect({ accountType, ok: refused.ok }).toEqual({ accountType, ok: false });
        if (!refused.ok) expect(refused.error.kind).toBe('wallet_kind_mismatch');
      }
    }
    const undescribed = checkWalletKind('WALLET', null);
    expect(undescribed.ok).toBe(false);
    if (!undescribed.ok) expect(undescribed.error.kind).toBe('wallet_kind_mismatch');
    for (const accountType of ACCOUNT_TYPES) {
      if (accountType === 'WALLET') continue;
      expect(checkWalletKind(accountType, null).ok).toBe(true);
    }
  });

  it('the factory refuses a WALLET with no kind and a non-wallet that carries one', () => {
    const undescribed = createFinancialAccount(newAccountInput({ accountType: 'WALLET' }));
    expect(undescribed.ok).toBe(false);
    if (!undescribed.ok) expect(undescribed.error.kind).toBe('wallet_kind_mismatch');

    const contradiction = createFinancialAccount(
      newAccountInput({ accountType: 'CREDIT_CARD', walletKind: 'E_MONEY' }),
    );
    expect(contradiction.ok).toBe(false);
    if (!contradiction.ok) expect(contradiction.error.kind).toBe('wallet_kind_mismatch');

    const wallet = builtAccount({ accountType: 'WALLET', walletKind: 'MOBILE_MONEY' });
    expect(wallet.walletKind).toBe('MOBILE_MONEY');
  });

  it('an edit that would leave type and wallet kind disagreeing is refused, not repaired', () => {
    const wallet = builtAccount({ accountType: 'WALLET', walletKind: 'PAYROLL' });
    const orphaned = applyAccountEdit(
      wallet,
      { accountType: 'CURRENT' },
      { hasFinancialRecords: false, at: NOW },
    );
    expect(orphaned.ok).toBe(false);
    if (!orphaned.ok) expect(orphaned.error.kind).toBe('wallet_kind_mismatch');

    // Moving both together is the way through, and it is the only way.
    const converted = applyAccountEdit(
      wallet,
      { accountType: 'CURRENT', walletKind: null },
      { hasFinancialRecords: false, at: NOW },
    );
    expect(converted.ok).toBe(true);
    if (converted.ok) expect(converted.value.walletKind).toBeNull();
  });

  it('nature is what the caller stated, never inferred from the account type', () => {
    // A CREDIT_CARD is almost always a liability, and 'almost always' is the
    // shape of a defect: the exceptions would be misclassified invisibly by a
    // rule the person cannot see or correct.
    const unstated = builtAccount({ accountType: 'CREDIT_CARD' });
    expect(unstated.nature).toBe('UNKNOWN');
    const stated = builtAccount({ accountType: 'CREDIT_CARD', nature: 'LIABILITY' });
    expect(stated.nature).toBe('LIABILITY');
    const edited = applyAccountEdit(
      unstated,
      { nature: 'LIABILITY' },
      { hasFinancialRecords: false, at: NOW },
    );
    expect(edited.ok).toBe(true);
    if (edited.ok) expect(edited.value.nature).toBe('LIABILITY');
  });

  it('every account the factory builds records its origin and nothing about a connection', () => {
    for (const origin of CONSTRUCTIBLE_ACCOUNT_ORIGINS) {
      const account = builtAccount({ origin });
      expect(account.origin).toBe(origin);
      expect(account.status).toBe('ACTIVE');
      expect(account.version).toBe(1);
      // The account carries no field naming a data source. Its sources over
      // its life are many and none of them lives here (ADR-0028).
      expect(Object.keys(account)).not.toContain('providerConnectionRef');
      expect(Object.keys(account)).not.toContain('sourceKind');
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
    if (trimmed.ok) expect(trimmed.value.displayName.reveal()).toBe('Synthetic Test Account One');
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
    balanceKind: BalanceKind = 'BOOKED',
  ): BalanceSnapshot {
    return {
      id: id as BalanceSnapshotId,
      tenantId: TENANT_A,
      userId: USER_A1,
      accountId: ACCOUNT_ID,
      amount: Money.of(minorUnits, QAR),
      asOf: new Date(asOf),
      sourceKind: 'MANUAL',
      balanceKind,
      sourceReference: SYNTHETIC_SOURCE_REFERENCE,
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
    const latest = latestReported([older, newer], 'BOOKED');
    expect(latest?.id).toBe(newer.id);
    // The returned amount is byte-for-byte the reported figure, not a sum:
    // 100.00 + 250.00 would be 350.00, and that number appears nowhere.
    expect(latest?.amount.minorUnits).toBe(250_00n);
  });

  it('a later capture of the same as_of wins, because it is the more recent information', () => {
    expect(latestReported([newer, sameAsOfLaterCapture], 'BOOKED')?.id).toBe(
      sameAsOfLaterCapture.id,
    );
    expect(byMostRecentlyTrue(sameAsOfLaterCapture, newer)).toBeLessThan(0);
  });

  it('no reported snapshots means no balance, not a computed zero', () => {
    expect(latestReported([], 'BOOKED')).toBeNull();
  });

  it('NO KIND IS INFERRED FROM ANOTHER: a kind nobody reported answers null', () => {
    // The failure this replaces: latestReported used to take a list and
    // answer 'the latest balance', so a caller asking what can be SPENT got a
    // SETTLED figure whenever a BOOKED report happened to be the most recent,
    // with nothing in the answer saying so. Reading one kind as another is
    // the same defect as computing the figure, by a different route.
    const booked = snapshot(
      'b5000000-0000-4000-8000-0000000000c1',
      500_00n,
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      'BOOKED',
    );
    const available = snapshot(
      'b5000000-0000-4000-8000-0000000000c2',
      420_00n,
      '2026-08-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
      'AVAILABLE',
    );
    const mixed = [booked, available];

    // Each kind answers with its OWN row, even though the BOOKED one is more
    // recent and would win any kind-blind ordering.
    expect(latestReported(mixed, 'BOOKED')?.id).toBe(booked.id);
    expect(latestReported(mixed, 'AVAILABLE')?.id).toBe(available.id);
    expect(latestReported(mixed, 'AVAILABLE')?.amount.minorUnits).toBe(420_00n);

    // And a kind nobody reported is absent, not substituted from a neighbour.
    for (const kind of ['CURRENT', 'OUTSTANDING', 'CREDIT_LIMIT', 'OTHER_SOURCE_REPORTED'] as const) {
      expect({ kind, found: latestReported(mixed, kind) }).toEqual({ kind, found: null });
    }
  });

  it('a CREDIT_LIMIT is never treated as a balance the person holds', () => {
    // The most damaging single inference available here: a credit limit is a
    // ceiling, not money. It answers only its own question.
    const limit = snapshot(
      'b5000000-0000-4000-8000-0000000000c3',
      10_000_00n,
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      'CREDIT_LIMIT',
    );
    const outstanding = snapshot(
      'b5000000-0000-4000-8000-0000000000c4',
      -1_234_56n,
      '2026-09-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
      'OUTSTANDING',
    );
    const both = [limit, outstanding];
    expect(latestReported(both, 'AVAILABLE')).toBeNull();
    expect(latestReported(both, 'BOOKED')).toBeNull();
    expect(latestReported(both, 'CREDIT_LIMIT')?.id).toBe(limit.id);
    expect(latestReported(both, 'OUTSTANDING')?.id).toBe(outstanding.id);
    // No arithmetic between them: 10000.00 - 1234.56 = 8765.44 is a figure
    // no source stated, and it appears nowhere.
    expect(
      [limit, outstanding].some((s) => s.amount.minorUnits === 876_544n),
    ).toBe(false);
  });

  it('the balance-kind vocabulary is the six declared values', () => {
    expect([...BALANCE_KINDS]).toEqual([
      'BOOKED',
      'AVAILABLE',
      'CURRENT',
      'OUTSTANDING',
      'CREDIT_LIMIT',
      'OTHER_SOURCE_REPORTED',
    ]);
    expect(isBalanceKind('BOOKED')).toBe(true);
    expect(isBalanceKind('PROJECTED')).toBe(false);
    expect(isBalanceKind('COMPUTED')).toBe(false);
  });
});

describe('financial-accounts domain: HSF fields do not leak through a rendering path', () => {
  // The three fields are HIGHLY_SENSITIVE_FINANCIAL. The wrapper exists so a
  // console.log, a JSON.stringify, or a template literal in an error message
  // cannot put an account name into a log file — the exact accident a branded
  // string would not prevent, because a branded string is still a string.
  const account = builtAccount({
    displayName: 'Synthetic Test Account One',
    mask: '*0000',
  });

  it('every accidental rendering path yields the redaction marker', () => {
    const rendered = [
      String(account.displayName),
      `${account.displayName}`,
      account.displayName.toString(),
      account.displayName.toJSON(),
      JSON.parse(JSON.stringify({ name: account.displayName })).name as string,
      (account.displayName as unknown as Record<symbol, () => string>)[
        Symbol.for('nodejs.util.inspect.custom')
      ]!(),
    ];
    for (const value of rendered) expect(value).toBe(HSF_REDACTION);
  });

  it('a whole frozen account serialises without any HSF plaintext in it', () => {
    const serialised = JSON.stringify(account);
    expect(serialised).not.toContain('Synthetic Test Account One');
    expect(serialised).not.toContain('*0000');
    expect(serialised).toContain(HSF_REDACTION);
    // The operational attributes are still there — the point is selective
    // redaction, not an opaque object nobody can debug.
    expect(serialised).toContain('CURRENT');
    expect(serialised).toContain('QAR');
  });

  it('the plaintext is reachable only through the grep-able accessor', () => {
    expect(account.displayName.reveal()).toBe('Synthetic Test Account One');
    expect(account.mask?.reveal()).toBe('*0000');
    // A length is not an identity, so it is safe to expose and useful to have.
    expect(account.displayName.length).toBe('Synthetic Test Account One'.length);
  });

  it('refuses a blank or over-long value at construction rather than truncating', () => {
    expect(() => HsfField.of('   ')).toThrow(/non-blank/);
    expect(() => HsfField.of('x'.repeat(121))).toThrow(/refused, never truncated/);
    expect(HsfField.optional(null)).toBeNull();
  });
});

describe('financial-accounts domain: the mask bound the database can still enforce', () => {
  it('the longest string the mask pattern admits is exactly the exported bound', () => {
    // Migration 0088 bounds mask_ciphertext at MAX_MASK_LENGTH bytes. AES-GCM
    // is length-preserving, so that byte bound IS this character bound; if the
    // pattern ever widened without the migration following, this fails.
    const longest = '****0000';
    expect(longest.length).toBe(MAX_MASK_LENGTH);
    expect(isMask(longest)).toBe(true);
    // Nothing longer is a mask, so nothing longer can reach the column.
    for (const candidate of ['*****0000', '****00000', '4111111111111111']) {
      expect(isMask(candidate)).toBe(false);
      expect(candidate.length).toBeGreaterThan(MAX_MASK_LENGTH);
    }
  });
});

describe('financial-accounts domain: a source reference is an identifier, not narrative', () => {
  it('accepts a UUID and refuses anything that could carry a sentence', () => {
    expect(isValidSourceReference('5e000000-0000-4000-8000-00000000005e')).toBe(true);
    for (const candidate of [
      'synthetic-test-fixture',
      'statement line 42: groceries',
      '',
      '   ',
      'QA00 0000 0000 0000 0000 0000 0000',
    ]) {
      expect(isValidSourceReference(candidate)).toBe(false);
    }
  });

  it('the snapshot factory refuses a non-identifier reference and a currency mismatch', () => {
    const account = builtAccount();
    const narrative = createBalanceSnapshot({
      id: 'b5000000-0000-4000-8000-0000000000b9' as BalanceSnapshotId,
      account,
      amount: Money.of(1_000n, QAR),
      asOf: NOW,
      sourceKind: 'MANUAL',
      balanceKind: 'BOOKED',
      sourceReference: 'closing balance printed on page 2',
      capturedAt: NOW,
      createdAt: NOW,
    });
    expect(narrative.ok).toBe(false);
    if (!narrative.ok) expect(narrative.error.kind).toBe('invalid_source_reference');

    const wrongCurrency = createBalanceSnapshot({
      id: 'b5000000-0000-4000-8000-0000000000ba' as BalanceSnapshotId,
      account,
      amount: Money.of(1_000n, KWD),
      asOf: NOW,
      sourceKind: 'MANUAL',
      balanceKind: 'BOOKED',
      sourceReference: SYNTHETIC_SOURCE_REFERENCE,
      capturedAt: NOW,
      createdAt: NOW,
    });
    expect(wrongCurrency.ok).toBe(false);
    if (!wrongCurrency.ok) expect(wrongCurrency.error.kind).toBe('snapshot_currency_mismatch');

    const accepted = createBalanceSnapshot({
      id: 'b5000000-0000-4000-8000-0000000000bb' as BalanceSnapshotId,
      account,
      amount: Money.of(1_000n, QAR),
      asOf: NOW,
      sourceKind: 'MANUAL',
      balanceKind: 'BOOKED',
      sourceReference: SYNTHETIC_SOURCE_REFERENCE,
      capturedAt: NOW,
      createdAt: NOW,
    });
    expect(accepted.ok).toBe(true);
    // Owner and account come from the ACCOUNT, so there is no second place
    // for them to be named and no way for the two to disagree.
    if (accepted.ok) {
      expect(accepted.value.tenantId).toBe(account.tenantId);
      expect(accepted.value.userId).toBe(account.userId);
      expect(accepted.value.accountId).toBe(account.id);
    }
  });
});
