// Country reference data (jurisdiction-policy.md §1): where, geographically.
//
// A country entry is DATA, never policy — it answers formatting and default
// questions (display key, default currency) and carries no business rule, no
// consent requirement, no capability clearance, and no legal conclusion. The
// policy key is Jurisdiction (usually 1:1 with country, not always), and
// conflating the two is the exact mistake this package exists to prevent.
//
// The set below is a small honest reference set: the launch focus (QA) plus
// the GCC countries the roadmap and tests name. Growing it is a data change;
// nothing anywhere branches on membership.

/** ISO 3166-1 alpha-2 code, branded to keep it out of jurisdiction slots. */
export type CountryCode = string & { readonly __brand: 'CountryCode' };

const COUNTRY_CODE_SHAPE = /^[A-Z]{2}$/;

/** Brands a well-formed alpha-2 code; a malformed literal is a defect and throws. */
export function countryCode(value: string): CountryCode {
  if (!COUNTRY_CODE_SHAPE.test(value)) {
    throw new Error(`'${value}' is not an ISO 3166-1 alpha-2 country code`);
  }
  return value as CountryCode;
}

export const COUNTRY_STATUSES = ['ACTIVE', 'RETIRED'] as const;
/** ISO lifecycle of the CODE itself (codes get retired), not a product state. */
export type CountryStatus = (typeof COUNTRY_STATUSES)[number];

export interface Country {
  readonly code: CountryCode;
  /** Localization key; display names live in locale bundles, not here. */
  readonly displayNameKey: string;
  /** ISO 4217 reference for formatting defaults — not a currency POLICY. */
  readonly defaultCurrency: string;
  readonly status: CountryStatus;
}

function country(code: string, displayNameKey: string, defaultCurrency: string): Country {
  return Object.freeze({
    code: countryCode(code),
    displayNameKey,
    defaultCurrency,
    status: 'ACTIVE',
  });
}

export const COUNTRIES: readonly Country[] = Object.freeze([
  country('QA', 'country.qa', 'QAR'),
  country('SA', 'country.sa', 'SAR'),
  country('AE', 'country.ae', 'AED'),
  country('OM', 'country.om', 'OMR'),
  country('KW', 'country.kw', 'KWD'),
  country('BH', 'country.bh', 'BHD'),
]);

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((entry) => entry.code === code);
}
