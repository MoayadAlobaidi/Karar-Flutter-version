/**
 * The institution catalogue, as the domain sees it.
 *
 * An `Institution` is a NAME the product may show and an account may point
 * at. It is not a connection, not an integration, and not a claim that this
 * platform can reach the institution in any way.
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
 * Catalogue lifecycle. Withdrawal is `RETIRED`, never a removed row: accounts
 * created while an institution was listed must still render a name.
 */
export const INSTITUTION_STATUSES = ['ACTIVE', 'RETIRED'] as const;
export type InstitutionStatus = (typeof INSTITUTION_STATUSES)[number];

export interface Institution {
  readonly id: InstitutionRef;
  /** Country-prefixed machine code, e.g. `QA_EXAMPLE_BANK`. Never a sentence. */
  readonly code: string;
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
const INSTITUTION_CODE_SHAPE = /^[A-Z]{2}_[A-Z0-9_]{2,32}$/;

export function isValidInstitutionCode(code: string): boolean {
  return INSTITUTION_CODE_SHAPE.test(code);
}

export function isInstitutionStatus(value: string): value is InstitutionStatus {
  return (INSTITUTION_STATUSES as readonly string[]).includes(value);
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
