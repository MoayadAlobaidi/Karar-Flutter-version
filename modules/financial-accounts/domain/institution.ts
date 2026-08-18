/**
 * The institution catalogue, as the domain sees it.
 *
 * An `Institution` is an ISSUER the product may name and an account may point
 * at. It is not a connection, not an integration, and not a claim that this
 * platform can reach the institution in any way.
 *
 * **One issuer, globally.** Where an issuer operates is a separate, per-country
 * concern (`public.institution_markets`, migration 0094) and never a reason to
 * create a second catalogue row: a group operating in four countries is one
 * issuer with four market rows, because the alternative scatters accounts
 * across near-duplicate rows whose only repair is a merge, and merging
 * catalogue rows rewrites subject-owned account references across every tenant
 * at once (ADR-0028). This type therefore carries no country, no jurisdiction,
 * and no market state.
 *
 * **This type has no `tenantId`, no `userId`, and no subject-supplied text,
 * and it never will.** The catalogue is `NON_PERSONAL` and
 * `NON_PERSONAL_BY_DESIGN` (modules/financial-accounts/MODULE.md), which is
 * only credible if subject linkage is impossible rather than merely unusual —
 * so the type is as narrow as the table (migration 0087). A user whose bank
 * is not listed records that on their OWN account row
 * (`userSuppliedInstitutionLabel`), which is subject-owned and classified
 * `HIGHLY_SENSITIVE_FINANCIAL`, precisely so one person's typed bank name
 * cannot become global reference data every other tenant reads. Tests assert
 * that this interface stays that narrow.
 */

import type { InstitutionRef } from './refs.js';

/**
 * What the issuer IS. The vocabulary exists because a mobile-money wallet from
 * a telco and a current account at a bank are different products with
 * different rules, and a catalogue that cannot tell them apart forces the
 * difference to be guessed from a display name.
 *
 * **Categories, never an individual issuer.** No value here names a company,
 * and no domain or application code may branch on which issuer a row is
 * (ADR-0028). **Not a capability flag either:** nothing here means integrated,
 * connected, reachable, or supported — provider access is a per-market status
 * carrying its own evidence (migration 0094), and no interface may infer one
 * from the other.
 */
export const INSTITUTION_KINDS = [
  'BANK',
  'E_MONEY_ISSUER',
  'MOBILE_MONEY_OPERATOR',
  'TELCO_FINANCIAL_SERVICES',
  'PAYMENT_INSTITUTION',
  'FINTECH_WALLET',
  'CARD_ISSUER',
  'EXCHANGE_HOUSE',
  'OTHER',
] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

/**
 * Catalogue lifecycle. Withdrawal is `RETIRED`, never a removed row: accounts
 * created while an institution was listed must still render a name.
 */
export const INSTITUTION_STATUSES = ['ACTIVE', 'RETIRED'] as const;
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];

export interface Institution {
  readonly id: InstitutionRef;
  /**
   * Stable machine code. Deliberately carries no country prefix: an issuer's
   * countries are market rows, and a code that names one would make a single
   * multi-market issuer look like several. Never a sentence.
   */
  readonly code: string;
  /** What kind of issuer this is. Never a claim that Karar can reach it. */
  readonly kind: InstitutionKind;
  /**
   * Both display names are required. An Arabic-first product that lets a
   * catalogue entry ship English-only has already decided which language is
   * optional; requiring both is that decision, inverted.
   */
  readonly displayNameEn: string;
  readonly displayNameAr: string;
  readonly status: InstitutionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Shape of the machine code, mirroring the CHECK in migration 0087. */
const INSTITUTION_CODE_SHAPE = /^[A-Z][A-Z0-9_]{2,47}$/;

export function isValidInstitutionCode(code: string): boolean {
  return INSTITUTION_CODE_SHAPE.test(code);
}

export function isInstitutionStatus(value: string): value is InstitutionStatus {
  return (INSTITUTION_STATUSES as readonly string[]).includes(value);
}

export function isInstitutionKind(value: string): value is InstitutionKind {
  return (INSTITUTION_KINDS as readonly string[]).includes(value);
}

/**
 * Only an `ACTIVE` catalogue entry may be attached to a NEW account. An
 * existing account keeps pointing at a `RETIRED` one — the institution did
 * not stop existing when the platform stopped offering it, and rewriting
 * history to hide that would make old records unreadable.
 */
export function isSelectableForNewAccount(institution: Institution): boolean {
  return institution.status === 'ACTIVE';
}
