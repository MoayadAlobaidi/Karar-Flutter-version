/**
 * Reading the account routes' inputs, and refusing everything else.
 *
 * WHY THIS IS NOT IN THE CONTROLLER. Two of these routes have a wide body,
 * and the reading of a wide body is where the interesting refusals live:
 * absent-versus-null, a value outside a module's vocabulary, a text field
 * longer than the declared field bound. Keeping it here leaves the controller
 * as what it should be — principal, input, use case, Result — and gives the
 * refusals a place where each one can say why it exists.
 *
 * ABSENT AND NULL ARE DIFFERENT REQUESTS, and the update reader keeps them
 * apart by asking whether the KEY is present rather than whether the value is
 * defined. Under `exactOptionalPropertyTypes` that distinction is real in the
 * type system too: spreading `undefined` into an optional field would turn
 * "leave it alone" into "clear it", silently, on somebody's account.
 *
 * THE VOCABULARIES ARE THE MODULES' OWN. Every enum check below reads the
 * exported constant rather than a copy, so a value the domain adds is
 * accepted here the moment it exists and a value it removes stops being
 * accepted at the same moment. A restated list would drift, and the drift
 * would show up as a 500 from a domain refusal rather than a 400 from this
 * layer.
 *
 * THE TEXT BOUND COMES FROM THE CENTRAL POLICY.
 * `INGESTION_LIMIT_POLICIES.manualTransaction.maxFieldBytes` bounds a single
 * field on the manual-entry path; nothing here writes a number of its own.
 */

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import {
  ACCOUNT_NATURES,
  ACCOUNT_ORIGINS,
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  MAX_DISPLAY_TEXT_LENGTH,
  MAX_MASK_LENGTH,
  WALLET_KINDS,
} from '@karar/financial-accounts';
import type {
  AccountNature,
  AccountStatus,
  AccountType,
  CreateManualAccountInput,
  FinancialAccount,
  Institution,
  InstitutionRef,
  UpdateOwnAccountInput,
  WalletKind,
} from '@karar/financial-accounts';

import { bodyOf, hasKey, isUuid, queryValue } from './request-input.js';

/** The declared bounds for the manual-entry path, from the central registry. */
const LIMITS = INGESTION_LIMIT_POLICIES.manualTransaction;

/** A refusal that names the field and the expectation, and never the value. */
export interface InputRefusal {
  readonly field: string;
  readonly why: string;
}

export type Read<T> = { readonly value: T } | InputRefusal;

function refusal(field: string, why: string): InputRefusal {
  return { field, why };
}

/**
 * A text field, bounded twice: by the domain's own display length, and by the
 * transport's declared field-byte bound. The second is not redundant — a
 * 120-character limit is not a 120-byte limit once anything is written in
 * Arabic, and the transport bound is what stops an oversized field before it
 * reaches a use case.
 */
function readText(raw: unknown, field: string): Read<string> {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return refusal(field, 'is required and must be a non-empty string');
  }
  if (raw.length > MAX_DISPLAY_TEXT_LENGTH) {
    return refusal(field, `must be at most ${String(MAX_DISPLAY_TEXT_LENGTH)} characters`);
  }
  if (Buffer.byteLength(raw, 'utf8') > LIMITS.maxFieldBytes) {
    return refusal(field, 'exceeds the declared field byte bound for this path');
  }
  return { value: raw };
}

function readEnum<T extends string>(
  raw: unknown,
  field: string,
  vocabulary: readonly T[],
): Read<T> {
  return typeof raw === 'string' && (vocabulary as readonly string[]).includes(raw)
    ? { value: raw as T }
    : refusal(field, 'is not a value this platform recognises');
}

function readCurrency(raw: unknown): Read<string> {
  return typeof raw === 'string' && /^[A-Z]{3}$/.test(raw)
    ? { value: raw }
    : refusal('currency', 'must be an ISO 4217 alphabetic code');
}

function readMask(raw: unknown): Read<string | null> {
  if (raw === null) return { value: null };
  if (typeof raw !== 'string' || raw === '') {
    return refusal('mask', 'must be a masked tail or null');
  }
  return raw.length > MAX_MASK_LENGTH
    ? refusal('mask', `must be at most ${String(MAX_MASK_LENGTH)} characters`)
    : { value: raw };
}

function readOptionalLabel(raw: unknown): Read<string | null> {
  if (raw === null) return { value: null };
  return readText(raw, 'userSuppliedInstitutionLabel');
}

function readInstitutionRef(raw: unknown): Read<InstitutionRef | null> {
  if (raw === null || raw === undefined) return { value: null };
  return isUuid(raw)
    ? { value: raw as InstitutionRef }
    : refusal('institutionId', 'is not a reference');
}

/** The create body. `origin` and `status` are absent by design, not omitted. */
export function readCreateInput(body: unknown): Read<CreateManualAccountInput> {
  const source = bodyOf(body);

  const accountType = readEnum<AccountType>(source['accountType'], 'accountType', ACCOUNT_TYPES);
  if ('field' in accountType) return accountType;
  const currency = readCurrency(source['currency']);
  if ('field' in currency) return currency;
  const displayName = readText(source['displayName'], 'displayName');
  if ('field' in displayName) return displayName;
  const institutionRef = readInstitutionRef(source['institutionId']);
  if ('field' in institutionRef) return institutionRef;
  const label = readOptionalLabel(source['userSuppliedInstitutionLabel'] ?? null);
  if ('field' in label) return label;
  const mask = readMask(source['mask'] ?? null);
  if ('field' in mask) return mask;

  let walletKind: WalletKind | null = null;
  if (source['walletKind'] !== undefined && source['walletKind'] !== null) {
    const read = readEnum<WalletKind>(source['walletKind'], 'walletKind', WALLET_KINDS);
    if ('field' in read) return read;
    walletKind = read.value;
  }
  let nature: AccountNature | undefined;
  if (source['nature'] !== undefined) {
    const read = readEnum<AccountNature>(source['nature'], 'nature', ACCOUNT_NATURES);
    if ('field' in read) return read;
    nature = read.value;
  }

  return {
    value: {
      accountType: accountType.value,
      walletKind,
      ...(nature === undefined ? {} : { nature }),
      currencyCode: currency.value,
      displayName: displayName.value,
      institutionRef: institutionRef.value,
      userSuppliedInstitutionLabel: label.value,
      mask: mask.value,
    },
  };
}

/**
 * The update body.
 *
 * Every optional field is read only when its KEY is present, so omitting a
 * field leaves it alone and sending it as `null` clears it. `origin` has no
 * branch here at all: it is immutable, and a field that silently did nothing
 * would be worse than its absence.
 */
export function readUpdateInput(accountId: string, body: unknown): Read<UpdateOwnAccountInput> {
  const source = bodyOf(body);
  const expectedVersion = source['expectedVersion'];
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion)) {
    return refusal('expectedVersion', 'is required and must be an integer');
  }

  const patch: Record<string, unknown> = {};
  if (hasKey(source, 'displayName')) {
    const read = readText(source['displayName'], 'displayName');
    if ('field' in read) return read;
    patch['displayName'] = read.value;
  }
  if (hasKey(source, 'accountType')) {
    const read = readEnum<AccountType>(source['accountType'], 'accountType', ACCOUNT_TYPES);
    if ('field' in read) return read;
    patch['accountType'] = read.value;
  }
  if (hasKey(source, 'walletKind')) {
    if (source['walletKind'] === null) patch['walletKind'] = null;
    else {
      const read = readEnum<WalletKind>(source['walletKind'], 'walletKind', WALLET_KINDS);
      if ('field' in read) return read;
      patch['walletKind'] = read.value;
    }
  }
  if (hasKey(source, 'nature')) {
    const read = readEnum<AccountNature>(source['nature'], 'nature', ACCOUNT_NATURES);
    if ('field' in read) return read;
    patch['nature'] = read.value;
  }
  if (hasKey(source, 'status')) {
    const read = readEnum<AccountStatus>(source['status'], 'status', ACCOUNT_STATUSES);
    if ('field' in read) return read;
    patch['status'] = read.value;
  }
  if (hasKey(source, 'mask')) {
    const read = readMask(source['mask']);
    if ('field' in read) return read;
    patch['mask'] = read.value;
  }
  if (hasKey(source, 'currency')) {
    const read = readCurrency(source['currency']);
    if ('field' in read) return read;
    patch['currencyCode'] = read.value;
  }
  if (hasKey(source, 'institutionId')) {
    const read = readInstitutionRef(source['institutionId']);
    if ('field' in read) return read;
    patch['institutionRef'] = read.value;
  }
  if (hasKey(source, 'userSuppliedInstitutionLabel')) {
    const read = readOptionalLabel(source['userSuppliedInstitutionLabel']);
    if ('field' in read) return read;
    patch['userSuppliedInstitutionLabel'] = read.value;
  }

  return {
    value: {
      accountId: accountId as UpdateOwnAccountInput['accountId'],
      expectedVersion,
      ...patch,
    } as UpdateOwnAccountInput,
  };
}

/** A predicate over the caller's OWN accounts. It narrows; it never widens. */
export interface AccountFilters {
  matches(account: FinancialAccount, institution: Institution | null): boolean;
}

export function readAccountFilters(query: unknown): AccountFilters | InputRefusal {
  const institutionId = queryValue(query, 'institutionId');
  if (institutionId !== undefined && !isUuid(institutionId)) {
    return refusal('institutionId', 'is not a reference');
  }
  const checks: Array<[string, readonly string[]]> = [
    ['institutionKind', []],
    ['accountType', ACCOUNT_TYPES],
    ['walletKind', WALLET_KINDS],
    ['nature', ACCOUNT_NATURES],
    ['status', ACCOUNT_STATUSES],
    ['origin', ACCOUNT_ORIGINS],
  ];
  const values = new Map<string, string>();
  for (const [name, vocabulary] of checks) {
    const value = queryValue(query, name);
    if (value === undefined) continue;
    if (vocabulary.length > 0 && !vocabulary.includes(value)) {
      return refusal(name, 'is not a value this platform recognises');
    }
    values.set(name, value);
  }
  const currency = queryValue(query, 'currency');
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    return refusal('currency', 'must be an ISO 4217 alphabetic code');
  }

  return {
    matches(account, institution) {
      if (institutionId !== undefined && account.institutionRef !== institutionId) return false;
      const kind = values.get('institutionKind');
      // A kind filter is a fact about the ISSUER, so an account naming no
      // catalogue issuer matches no kind rather than matching every one.
      if (kind !== undefined && (institution === null || institution.kind !== kind)) return false;
      const type = values.get('accountType');
      if (type !== undefined && account.accountType !== type) return false;
      const wallet = values.get('walletKind');
      if (wallet !== undefined && account.walletKind !== wallet) return false;
      const nature = values.get('nature');
      if (nature !== undefined && account.nature !== nature) return false;
      const status = values.get('status');
      if (status !== undefined && account.status !== status) return false;
      const origin = values.get('origin');
      if (origin !== undefined && account.origin !== origin) return false;
      if (currency !== undefined && account.currency.code !== currency) return false;
      return true;
    },
  };
}
