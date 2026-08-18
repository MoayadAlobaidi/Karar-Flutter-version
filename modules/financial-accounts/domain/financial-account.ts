/**
 * The financial account: what a subject holds, as the subject or their
 * statement declared it. Pure — time arrives as an argument, identity comes
 * from a port, and nothing here reads a clock, a database, or a network.
 *
 * ## What this type cannot hold, and why that is the design
 *
 * There is no account-number field, no IBAN field, no PAN field, no CVV
 * field, and no credential field. The only identifying fragment is `mask`,
 * and `isMask` admits at most four digits — so a full card number (13-19
 * digits) and an IBAN (15-34 alphanumerics) are both unrepresentable. This
 * is a structural property asserted by test, not a validation a future call
 * site can forget.
 *
 * **The shape rule now lives HERE and only here.** Until Phase 5's
 * remediation the same regular expression was also a CHECK constraint on a
 * plaintext `mask` column; encrypting the column removed the database's
 * ability to inspect the characters, so the CHECK could not survive. What
 * did survive is the property that actually mattered: AES-256-GCM preserves
 * length, so migration 0088 bounds the mask CIPHERTEXT at eight bytes, and a
 * 13-to-19-digit PAN remains unrepresentable in that column no matter what a
 * caller sends. The database bounds the size; this file rules on the shape.
 *
 * ## The three fields that are HIGHLY_SENSITIVE_FINANCIAL
 *
 * `displayName`, `userSuppliedInstitutionLabel` and `mask` are `HsfField`
 * values, not strings: the account name a subject chose, the bank they typed,
 * and the tail of their card together identify a person's banking
 * relationships, and the table's classification has always said so. They are
 * held as plaintext in memory inside a wrapper that redacts on every
 * accidental rendering path, and they exist at rest only as ciphertext (see
 * `application/ports/hsf-field-encryption.ts`). Nothing in this file knows
 * about keys, nonces, or algorithms.
 *
 * ## Identity is the id, and nothing else
 *
 * Institution, account type, currency and wallet kind are **attributes**. None
 * of them, alone or combined, identifies an account. Two current accounts at
 * one bank in one currency is ordinary; two credit cards from one issuer is
 * ordinary; two mobile-money wallets from one issuer is ordinary. Nothing in
 * this file, and no constraint in migration 0088, makes any combination of
 * those unique — and none may be added (ADR-0028). A uniqueness rule there
 * does not tidy the model, it forbids a real person's real accounts and forces
 * them to lie about what they hold.
 *
 * ## Origin is not the current source
 *
 * `origin` records ONE fact: how this account first came to exist. It is
 * immutable and it does **not** say where data comes from now. An account may
 * be typed by hand, then receive CSV imports, then be linked to an API, then
 * be corrected by hand, and remain one account throughout — so this type
 * deliberately carries no connection reference and no current-source field.
 * The one-source shape this file used to have (`sourceKind` plus a bound
 * `providerConnectionRef`) was removed rather than reinterpreted, because a
 * field that claims an account has exactly one permanent data source is wrong
 * about accounts rather than merely imprecise. Current and historical sources
 * are many per account and live in account-source links, which this module
 * does not model.
 *
 * The corollary is enforced by absence: **a provider-origin account still
 * accepts user corrections.** No rule in this file consults `origin` before
 * allowing an edit.
 *
 * ## What an account does NOT claim
 *
 * A manually created account does not imply a synced provider. The legacy
 * product's connect-a-bank screen inserted a fabricated account row with an
 * invented masked number and a Synced status — its own audit called that the
 * single most misleading surface in the product
 * (modules/financial-accounts/MODULE.md). Nothing in this vocabulary can
 * express that claim: `ACCOUNT_STATUSES` describes the account's own
 * lifecycle and contains no value meaning connected or synced, and a test
 * asserts it never gains one.
 */

import { Currency, Result } from '@karar/shared-kernel';
import type { TenantId, UserId } from '@karar/shared-kernel';

import type {
  CurrencyImmutableWithRecords,
  FinancialAccountRuleViolation,
  InvalidDisplayText,
  MaskNotAMask,
  UnsupportedCurrency,
} from './errors.js';
import { HSF_FIELD_MAX_LENGTH, HsfField } from './hsf-field.js';
import type { FinancialAccountId, InstitutionRef } from './refs.js';

/**
 * The kinds of account a person actually holds. EXTENSIBLE by the same
 * controlled process the currency registry uses: add the value here, extend
 * the CHECK in a forward migration, and extend the vocabulary test that
 * asserts the two agree. `OTHER` exists so the list never has to be complete
 * before a user can record what they have.
 */
export const ACCOUNT_TYPES = [
  /** Current / checking. Named CURRENT because that is the launch-market term. */
  'CURRENT',
  'SAVINGS',
  'CREDIT_CARD',
  'CASH',
  'WALLET',
  'OTHER',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * The account's OWN lifecycle, and nothing else. No value here means
 * connected, linked, or synced, and none may be added: capability state is
 * shown honestly rather than implied by a status badge.
 */
export const ACCOUNT_STATUSES = ['ACTIVE', 'ARCHIVED', 'CLOSED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * How an account FIRST CAME TO EXIST, and nothing else — see 'Origin is not
 * the current source' above. `EXTERNAL_PROVIDER` is MODELLED AND UNREACHABLE
 * in Phase 5: no provider is integrated, no credential is stored, no
 * synchronisation cursor exists, and no code path produces this value. It is
 * declared so the schema and this vocabulary do not have to be rewritten when
 * a provider arrives — see `CONSTRUCTIBLE_ACCOUNT_ORIGINS`.
 */
export const ACCOUNT_ORIGINS = ['MANUAL', 'CSV', 'EXTERNAL_PROVIDER'] as const;
export type AccountOrigin = (typeof ACCOUNT_ORIGINS)[number];

/**
 * The origins an account can actually be created with this phase. The factory
 * below accepts only these, so `EXTERNAL_PROVIDER` is unreachable by TYPE
 * rather than by discipline — a caller cannot pass it without a cast, and a
 * database CHECK refuses the row besides.
 */
export const CONSTRUCTIBLE_ACCOUNT_ORIGINS = ['MANUAL', 'CSV'] as const;
export type ConstructibleAccountOrigin = (typeof CONSTRUCTIBLE_ACCOUNT_ORIGINS)[number];

/**
 * Which kind of wallet, for `WALLET` accounts only.
 *
 * A wallet holds a balance, so it is an account rather than a separate kind of
 * thing; what it needs beyond a bank account is this one attribute, because a
 * payroll wallet and a prepaid wallet behave differently, and a reader should
 * not have to infer which one from a display name.
 *
 * **Categories, never a provider.** No value names a telco, a bank, or a
 * fintech, and no code path may branch on which issuer a wallet belongs to
 * (ADR-0028). **Crypto is out of scope and `WALLET` does not model it:** no
 * value here means a crypto or custodial-token wallet and none may be added —
 * such a holding has no ISO 4217 minor-unit exponent, so admitting one would
 * make every amount on the row a lie about what it measures.
 */
export const WALLET_KINDS = [
  'MOBILE_MONEY',
  'E_MONEY',
  'PREPAID',
  'PAYROLL',
  'SUPER_APP',
  'OTHER',
] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];

/**
 * Whether this account's balance is something the subject HAS or OWES.
 *
 * It exists because the same signed number means opposite things on a savings
 * account and on a credit card, and every naive treatment of that number —
 * adding it to a total, calling it available, showing it in green — is wrong
 * for one of the two. `UNKNOWN` is an honest answer rather than a placeholder,
 * and it is the ground state: defaulting to `ASSET` would make every unstated
 * account silently count as money the person has, and a consumer that cannot
 * handle `UNKNOWN` must refuse to answer rather than assume.
 *
 * **Nothing in this module sums, nets, or totals balances using this.** A net
 * worth is a different concept with its own correctness problem — which
 * accounts, at which instants, in which currency, at whose rate — and it
 * arrives with its own name and its own honest label or not at all.
 *
 * Deliberately NOT derived from `accountType`: a rule that reads "CREDIT_CARD
 * means LIABILITY" is right almost always, and the exceptions it misclassifies
 * are invisible to the person, who cannot correct a value that was never
 * theirs to set.
 */
export const ACCOUNT_NATURES = ['ASSET', 'LIABILITY', 'UNKNOWN'] as const;
export type AccountNature = (typeof ACCOUNT_NATURES)[number];

export interface FinancialAccount {
  readonly id: FinancialAccountId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** A row in the reviewed catalogue, or null. Never both this and the label. */
  readonly institutionRef: InstitutionRef | null;
  /**
   * What the subject typed when their institution is not in the catalogue.
   * Subject-owned and classified HIGHLY_SENSITIVE_FINANCIAL: it lives on this
   * row, never enters the global catalogue, and is stored as ciphertext.
   */
  readonly userSuppliedInstitutionLabel: HsfField | null;
  readonly accountType: AccountType;
  /** Present if and only if `accountType` is `WALLET`. See `checkWalletKind`. */
  readonly walletKind: WalletKind | null;
  /** Has, owes, or nobody has said. Never inferred from `accountType`. */
  readonly nature: AccountNature;
  readonly currency: Currency;
  /** The name the subject gave the account. HSF; ciphertext at rest. */
  readonly displayName: HsfField;
  /** A masked fragment ONLY — see `isMask`. Never a full number. HSF. */
  readonly mask: HsfField | null;
  readonly status: AccountStatus;
  /**
   * How the account first came to exist. Immutable, and NOT the current data
   * source — the account may have many sources over its life, and none of them
   * is recorded here.
   */
  readonly origin: AccountOrigin;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency token; the store increments it by exactly one. */
  readonly version: number;
}

/**
 * Longest display text this module admits. One bound for every HSF field, so
 * the byte bound migration 0088 puts on the ciphertext is derivable from a
 * single number rather than from three that can drift apart.
 */
export const MAX_DISPLAY_TEXT_LENGTH = HSF_FIELD_MAX_LENGTH;

/**
 * A mask is at most four digits, optionally preceded by masking characters.
 *
 * This regular expression is now the ONLY place the shape is enforced. It
 * used to be mirrored by a CHECK on a plaintext column; encrypting that
 * column ended the database's ability to read the characters, so the mirror
 * was removed rather than left in place as a constraint that could no longer
 * fire. Migration 0088 keeps the part encryption does not hide — the length —
 * and eight ciphertext bytes is the exact bound this pattern implies.
 */
const MASK_SHAPE = /^[*xX#]{0,4}[0-9]{2,4}$/;

/**
 * Longest plaintext a mask can be under `MASK_SHAPE`: four masking characters
 * plus four digits. Exported because migration 0088's ciphertext bound is
 * this number, and a test asserts the two agree — AES-256-GCM does not change
 * length, so the column's byte bound and this character bound are the same
 * statement said twice.
 */
export const MAX_MASK_LENGTH = 8;

/**
 * True only for something that is a MASK. Deliberately strict: the point is
 * not to accept every plausible masking convention but to make it impossible
 * for a full account number, IBAN, or card number to be stored under a field
 * named for a fragment of one.
 */
export function isMask(candidate: string): boolean {
  return MASK_SHAPE.test(candidate);
}

/** Trimmed display text, or null when the input was absent. */
export function normalizeDisplayText(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

export function isAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as readonly string[]).includes(value);
}

export function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export function isAccountOrigin(value: string): value is AccountOrigin {
  return (ACCOUNT_ORIGINS as readonly string[]).includes(value);
}

export function isWalletKind(value: string): value is WalletKind {
  return (WALLET_KINDS as readonly string[]).includes(value);
}

export function isAccountNature(value: string): value is AccountNature {
  return (ACCOUNT_NATURES as readonly string[]).includes(value);
}

/**
 * Resolve a currency code against the platform's registry. Unknown codes are
 * an EXPECTED condition at a boundary (someone typed one), so this returns a
 * `Result` rather than throwing — the kernel's own `Currency.tryGet` rule.
 */
export function resolveSupportedCurrency(code: string): Result<Currency, UnsupportedCurrency> {
  const currency = Currency.tryGet(code);
  if (currency === undefined) {
    return Result.err({
      kind: 'unsupported_currency',
      requestedCode: code,
      message:
        `currency '${code}' is not supported — an amount in a currency whose minor-unit exponent ` +
        `the platform does not know is an amount nothing can interpret; supported codes are ` +
        `${Currency.codes().join(', ')} (adding one is a reviewed registry change plus a migration)`,
    });
  }
  return Result.ok(currency);
}

/**
 * Validates raw display text and wraps it. The refusals are EXPECTED outcomes
 * (someone typed nothing, or pasted an essay), so they are `Result` arms; the
 * `HsfField` construction that follows cannot fail, because these two checks
 * are exactly its preconditions.
 */
function checkDisplayText(
  field: InvalidDisplayText['field'],
  value: string,
): Result<HsfField, InvalidDisplayText> {
  const trimmed = value.trim();
  if (trimmed === '') {
    return Result.err({
      kind: 'invalid_display_text',
      field,
      message: `${field} is empty or whitespace only — an account a person cannot recognise in a list is not usable`,
    });
  }
  if (trimmed.length > MAX_DISPLAY_TEXT_LENGTH) {
    return Result.err({
      kind: 'invalid_display_text',
      field,
      message:
        `${field} is ${trimmed.length} characters, over the ${MAX_DISPLAY_TEXT_LENGTH}-character bound — ` +
        `the field is a name, and an unbounded one becomes a place to hide notes the classification does not cover`,
    });
  }
  return Result.ok(HsfField.of(trimmed));
}

function checkMask(mask: string | null): Result<HsfField | null, MaskNotAMask> {
  if (mask === null) return Result.ok(null);
  const trimmed = mask.trim();
  if (trimmed === '') return Result.ok(null);
  if (!isMask(trimmed)) {
    return Result.err({
      kind: 'mask_not_a_mask',
      message:
        'the supplied value is not a mask (at most four digits, optionally preceded by masking ' +
        'characters) — this module stores a masked fragment and never a full account number, ' +
        'IBAN, or card number, and refusing here is what keeps that true',
    });
  }
  return Result.ok(HsfField.of(trimmed));
}

/**
 * At most one way to name an institution. Both null is legitimate: a cash or
 * wallet account names no institution at all.
 */
function checkInstitutionNaming(
  institutionRef: InstitutionRef | null,
  label: HsfField | null,
): Result<void, FinancialAccountRuleViolation> {
  if (institutionRef !== null && label !== null) {
    return Result.err({
      kind: 'institution_named_twice',
      message:
        'an account names its institution either from the reviewed catalogue or with the label the ' +
        'subject typed, never both — the two mean different things to a reader, and a row carrying ' +
        'both leaves the question of which one is true',
    });
  }
  return Result.ok(undefined);
}

/**
 * The wallet invariant, exactly: **a wallet kind is present IF AND ONLY IF the
 * account type is `WALLET`.**
 *
 * Both directions are refusals and each fails differently. A `WALLET` with no
 * wallet kind is a wallet nobody can describe — a payroll wallet and a prepaid
 * wallet behave differently, and admitting the row half-stated pushes the guess
 * onto every later reader. A `CURRENT` or `CREDIT_CARD` carrying a wallet kind
 * is worse: it is a contradiction that reads as truth, and a caller that
 * branches on "has a wallet kind" instead of on the type will treat a bank
 * account as a wallet without anything looking wrong. A one-directional check
 * would catch only the first, so this is stated as an equality between two
 * booleans, mirroring the CHECK in migration 0095.
 */
export function checkWalletKind(
  accountType: AccountType,
  walletKind: WalletKind | null,
): Result<void, FinancialAccountRuleViolation> {
  const hasWalletKind = walletKind !== null;
  const isWallet = accountType === 'WALLET';
  if (hasWalletKind !== isWallet) {
    return Result.err({
      kind: 'wallet_kind_mismatch',
      accountType,
      message: isWallet
        ? 'a WALLET account must state which kind of wallet it is (MOBILE_MONEY, E_MONEY, PREPAID, ' +
          'PAYROLL, SUPER_APP, OTHER) — a payroll wallet and a prepaid wallet behave differently, ' +
          'and a wallet nobody can describe makes every later reader guess'
        : `a ${accountType} account must not carry a wallet kind — the contradiction reads as truth, ` +
          'and a caller branching on the presence of a wallet kind would treat this as a wallet',
    });
  }
  return Result.ok(undefined);
}

/**
 * The currency-immutability rule, stated where it can be reasoned about.
 *
 * A currency may be corrected while an account holds no financial records —
 * a person who picked the wrong one on a still-empty account should be able
 * to fix it. Once records exist the currency is frozen: reinterpreting stored
 * minor units under a different exponent would silently multiply or divide
 * every historical figure by ten. The enforcement point is the use case (it
 * is what knows whether records exist), and the database enforces it again
 * through the composite foreign key from the snapshot table (migration 0089),
 * so the rule holds even against a caller that skips this function.
 */
export function checkCurrencyChange(
  account: FinancialAccount,
  requested: Currency,
  hasFinancialRecords: boolean,
): Result<void, CurrencyImmutableWithRecords> {
  if (requested.code === account.currency.code) return Result.ok(undefined);
  if (!hasFinancialRecords) return Result.ok(undefined);
  return Result.err({
    kind: 'currency_immutable_with_records',
    accountId: account.id,
    message:
      `account ${account.id} holds financial records in ${account.currency.code} and cannot be changed to ` +
      `${requested.code} — stored minor units are scaled by their currency's exponent, so reinterpreting ` +
      `them under another currency would silently rescale every figure already recorded`,
  });
}

/** Everything the factory needs. Time and identity arrive as arguments. */
export interface NewFinancialAccount {
  readonly id: FinancialAccountId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly institutionRef: InstitutionRef | null;
  readonly userSuppliedInstitutionLabel: string | null;
  readonly accountType: AccountType;
  /** Required for `WALLET`, forbidden otherwise — see `checkWalletKind`. */
  readonly walletKind: WalletKind | null;
  /** Stated, never inferred. `UNKNOWN` is what a caller says when nobody knows. */
  readonly nature: AccountNature;
  readonly currency: Currency;
  readonly displayName: string;
  readonly mask: string | null;
  /** `EXTERNAL_PROVIDER` is not accepted — it is unreachable by type. */
  readonly origin: ConstructibleAccountOrigin;
  readonly createdAt: Date;
}

/**
 * Build an account, or say exactly why not. Every new account starts ACTIVE at
 * version 1 — the two facts a caller must not be able to set, because each of
 * them is a claim rather than an input.
 */
export function createFinancialAccount(
  input: NewFinancialAccount,
): Result<FinancialAccount, FinancialAccountRuleViolation> {
  const displayName = checkDisplayText('displayName', input.displayName);
  if (!displayName.ok) return displayName;

  let label: HsfField | null = null;
  if (input.userSuppliedInstitutionLabel !== null) {
    const checked = checkDisplayText(
      'userSuppliedInstitutionLabel',
      input.userSuppliedInstitutionLabel,
    );
    if (!checked.ok) return checked;
    label = checked.value;
  }

  const mask = checkMask(input.mask);
  if (!mask.ok) return mask;

  const naming = checkInstitutionNaming(input.institutionRef, label);
  if (!naming.ok) return naming;

  const wallet = checkWalletKind(input.accountType, input.walletKind);
  if (!wallet.ok) return wallet;

  return Result.ok(
    Object.freeze({
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      institutionRef: input.institutionRef,
      userSuppliedInstitutionLabel: label,
      accountType: input.accountType,
      walletKind: input.walletKind,
      nature: input.nature,
      currency: input.currency,
      displayName: displayName.value,
      mask: mask.value,
      status: 'ACTIVE' as AccountStatus,
      origin: input.origin as AccountOrigin,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      version: 1,
    }),
  );
}

/**
 * A requested edit. An absent key means "leave it alone"; an explicit `null`
 * means "clear it". `exactOptionalPropertyTypes` is what makes that
 * distinction real rather than a convention.
 */
export interface AccountEdit {
  readonly displayName?: string;
  readonly accountType?: AccountType;
  /**
   * Moved together with `accountType` when the two disagree: changing a wallet
   * into a current account without clearing the wallet kind is refused rather
   * than silently repaired, because guessing which of the two the person meant
   * is how an account quietly becomes something else.
   */
  readonly walletKind?: WalletKind | null;
  readonly nature?: AccountNature;
  readonly status?: AccountStatus;
  readonly mask?: string | null;
  readonly currency?: Currency;
  readonly institutionRef?: InstitutionRef | null;
  readonly userSuppliedInstitutionLabel?: string | null;
}

/**
 * Apply an edit, returning the next version of the account or the rule that
 * refused it. Pure: `at` is the caller's clock reading, and `version` moves
 * by exactly one because that is what the store's guard trigger demands.
 */
export function applyAccountEdit(
  account: FinancialAccount,
  edit: AccountEdit,
  context: { readonly hasFinancialRecords: boolean; readonly at: Date },
): Result<FinancialAccount, FinancialAccountRuleViolation> {
  let displayName = account.displayName;
  if (edit.displayName !== undefined) {
    const checked = checkDisplayText('displayName', edit.displayName);
    if (!checked.ok) return checked;
    displayName = checked.value;
  }

  let label = account.userSuppliedInstitutionLabel;
  if (edit.userSuppliedInstitutionLabel !== undefined) {
    if (edit.userSuppliedInstitutionLabel === null) {
      label = null;
    } else {
      const checked = checkDisplayText(
        'userSuppliedInstitutionLabel',
        edit.userSuppliedInstitutionLabel,
      );
      if (!checked.ok) return checked;
      label = checked.value;
    }
  }

  let mask = account.mask;
  if (edit.mask !== undefined) {
    const checked = checkMask(edit.mask);
    if (!checked.ok) return checked;
    mask = checked.value;
  }

  const institutionRef =
    edit.institutionRef !== undefined ? edit.institutionRef : account.institutionRef;
  const naming = checkInstitutionNaming(institutionRef, label);
  if (!naming.ok) return naming;

  const accountType = edit.accountType ?? account.accountType;
  const walletKind = edit.walletKind !== undefined ? edit.walletKind : account.walletKind;
  const wallet = checkWalletKind(accountType, walletKind);
  if (!wallet.ok) return wallet;

  let currency = account.currency;
  if (edit.currency !== undefined) {
    const allowed = checkCurrencyChange(account, edit.currency, context.hasFinancialRecords);
    if (!allowed.ok) return allowed;
    currency = edit.currency;
  }

  return Result.ok(
    Object.freeze({
      ...account,
      institutionRef,
      userSuppliedInstitutionLabel: label,
      accountType,
      walletKind,
      nature: edit.nature ?? account.nature,
      currency,
      displayName,
      mask,
      status: edit.status ?? account.status,
      updatedAt: context.at,
      version: account.version + 1,
    }),
  );
}
