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
 * digits) and an IBAN (15-34 alphanumerics) are both unrepresentable, in the
 * type and in the column behind it (migration 0088). This is a structural
 * property asserted by test, not a validation a future call site can forget.
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
import type { FinancialAccountId, InstitutionRef, ProviderConnectionRef } from './refs.js';

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
 * How an account came to exist. `EXTERNAL_PROVIDER` is MODELLED AND
 * UNREACHABLE in Phase 5: no provider is integrated, no credential is stored,
 * no synchronisation cursor exists, and no code path produces this value. It
 * is declared so the schema and this vocabulary do not have to be rewritten
 * when a provider arrives — see `CONSTRUCTIBLE_SOURCE_KINDS`.
 */
export const SOURCE_KINDS = ['MANUAL', 'CSV', 'EXTERNAL_PROVIDER'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * The source kinds an account can actually be created with this phase. The
 * factory below accepts only these, so `EXTERNAL_PROVIDER` is unreachable by
 * TYPE rather than by discipline — a caller cannot pass it without a cast,
 * and a database CHECK refuses the row besides.
 */
export const CONSTRUCTIBLE_SOURCE_KINDS = ['MANUAL', 'CSV'] as const;
export type ConstructibleSourceKind = (typeof CONSTRUCTIBLE_SOURCE_KINDS)[number];

export interface FinancialAccount {
  readonly id: FinancialAccountId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** A row in the reviewed catalogue, or null. Never both this and the label. */
  readonly institutionRef: InstitutionRef | null;
  /**
   * What the subject typed when their institution is not in the catalogue.
   * Subject-owned and classified HIGHLY_SENSITIVE_FINANCIAL: it lives on this
   * row and never enters the global catalogue.
   */
  readonly userSuppliedInstitutionLabel: string | null;
  readonly accountType: AccountType;
  readonly currency: Currency;
  readonly displayName: string;
  /** A masked fragment ONLY — see `isMask`. Never a full number. */
  readonly mask: string | null;
  readonly status: AccountStatus;
  readonly sourceKind: SourceKind;
  /** Always null in Phase 5. Never a credential — see `ProviderConnectionRef`. */
  readonly providerConnectionRef: ProviderConnectionRef | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency token; the store increments it by exactly one. */
  readonly version: number;
}

/** Longest display text the schema admits (migration 0088). */
export const MAX_DISPLAY_TEXT_LENGTH = 120;

/**
 * A mask is at most four digits, optionally preceded by masking characters.
 * Identical to the CHECK in migration 0088, and a test asserts the two stay
 * identical — a domain rule the database disagrees with protects nothing.
 */
const MASK_SHAPE = /^[*xX#]{0,4}[0-9]{2,4}$/;

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

export function isSourceKind(value: string): value is SourceKind {
  return (SOURCE_KINDS as readonly string[]).includes(value);
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

function checkDisplayText(
  field: InvalidDisplayText['field'],
  value: string,
): Result<string, InvalidDisplayText> {
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
  return Result.ok(trimmed);
}

function checkMask(mask: string | null): Result<string | null, MaskNotAMask> {
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
  return Result.ok(trimmed);
}

/**
 * At most one way to name an institution. Both null is legitimate: a cash or
 * wallet account names no institution at all.
 */
function checkInstitutionNaming(
  institutionRef: InstitutionRef | null,
  label: string | null,
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
 * A MANUAL or CSV account must not claim a provider connection. In Phase 5
 * the only reachable arm is the refusal, because nothing constructs
 * `EXTERNAL_PROVIDER`; the rule is written in full anyway so the invariant is
 * already correct when a provider does arrive.
 */
export function checkProviderConnection(
  sourceKind: SourceKind,
  providerConnectionRef: ProviderConnectionRef | null,
): Result<void, FinancialAccountRuleViolation> {
  const claimsConnection = providerConnectionRef !== null;
  const isProviderSourced = sourceKind === 'EXTERNAL_PROVIDER';
  if (claimsConnection !== isProviderSourced) {
    return Result.err({
      kind: 'provider_connection_mismatch',
      message: isProviderSourced
        ? 'an EXTERNAL_PROVIDER account carries a provider connection reference by definition'
        : `a ${sourceKind} account must not claim a provider connection — no provider is integrated, ` +
          'and an account the user typed must never be presented as one a bank confirmed',
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
  readonly currency: Currency;
  readonly displayName: string;
  readonly mask: string | null;
  /** `EXTERNAL_PROVIDER` is not accepted — it is unreachable by type. */
  readonly sourceKind: ConstructibleSourceKind;
  readonly createdAt: Date;
}

/**
 * Build an account, or say exactly why not. Every new account starts ACTIVE
 * at version 1 with no provider connection — the three facts a caller must
 * not be able to set, because each of them is a claim rather than an input.
 */
export function createFinancialAccount(
  input: NewFinancialAccount,
): Result<FinancialAccount, FinancialAccountRuleViolation> {
  const displayName = checkDisplayText('displayName', input.displayName);
  if (!displayName.ok) return displayName;

  let label: string | null = null;
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

  // Belt and braces: the type already forbids EXTERNAL_PROVIDER here, and the
  // rule is evaluated anyway so a cast that smuggles one past the compiler
  // still fails.
  const provider = checkProviderConnection(input.sourceKind, null);
  if (!provider.ok) return provider;

  return Result.ok(
    Object.freeze({
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      institutionRef: input.institutionRef,
      userSuppliedInstitutionLabel: label,
      accountType: input.accountType,
      currency: input.currency,
      displayName: displayName.value,
      mask: mask.value,
      status: 'ACTIVE' as AccountStatus,
      sourceKind: input.sourceKind as SourceKind,
      providerConnectionRef: null,
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
      accountType: edit.accountType ?? account.accountType,
      currency,
      displayName,
      mask,
      status: edit.status ?? account.status,
      updatedAt: context.at,
      version: account.version + 1,
    }),
  );
}
