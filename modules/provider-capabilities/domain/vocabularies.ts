/**
 * The closed vocabularies a capability profile is written in.
 *
 * Every list here is CATEGORIES and never an individual issuer, product,
 * brand, aggregator, standards body member or country-specific scheme. That is
 * the rule ADR-0028 states for the institution catalogue, and it binds harder
 * here: a capability profile is exactly where a provider name would be most
 * tempting to introduce, because a profile describes one provider's interface.
 * It does not name one. It points at a catalogue row (`domain/refs.ts`) and
 * describes it in words that fit every issuer of that shape.
 *
 * A test scans this module's production source for provider vocabulary and
 * fails on any of it.
 */

// ---------------------------------------------------------------------------
// Vocabularies MIRRORED from the modules that own the concepts.
//
// WHY THESE ARE DECLARED HERE AND NOT IMPORTED — read this before "fixing" it.
//
// `AccountType`, `WalletKind` and `InstitutionKind` are owned by
// `modules/financial-accounts`, and it is tempting to `import type` them so
// the two can never disagree. A domain layer may import only relative files
// and the pure packages (architecture test 1), and the rule is not a lint
// nicety: a domain that reaches into another module's package stops being
// independently testable and replaceable, which is the coupling the layered
// rules exist to prevent. The same reasoning `modules/financial-connections`
// records for declaring its own `CanonicalAccountRef` rather than borrowing
// `FinancialAccountId` applies to a closed vocabulary too.
//
// So the duplication is the sanctioned cost, and the cost is paid where it can
// be seen: `__tests__/mirrored-vocabularies.test.ts` imports the owning
// modules — a TEST may cross a boundary — and asserts each list below is
// EXACTLY the owner's, member for member and in order. A word added, removed
// or renamed over there fails the build here, so the lists cannot drift
// silently; they can only drift loudly.
//
// The rule for the next reader: do not re-import the owning module. If a
// vocabulary genuinely has to be shared by modules that have never heard of
// each other, that is a kernel question and needs an ADR.
// ---------------------------------------------------------------------------

/**
 * The account types an interface may be described as covering. Mirrors
 * `ACCOUNT_TYPES` in `modules/financial-accounts/domain/financial-account.ts`.
 */
export const ACCOUNT_TYPES = [
  'CURRENT',
  'SAVINGS',
  'CREDIT_CARD',
  'CASH',
  'WALLET',
  'OTHER',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as readonly string[]).includes(value);
}

/**
 * The wallet kinds an interface may be described as covering. Mirrors
 * `WALLET_KINDS` in the same file. **Categories, never a provider**, and
 * crypto is out of scope exactly as it is there: such a holding has no ISO
 * 4217 minor-unit exponent, so admitting one would make every currency in a
 * profile a lie about what it measures.
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

export function isWalletKind(value: string): value is WalletKind {
  return (WALLET_KINDS as readonly string[]).includes(value);
}

/**
 * What the issuer IS. Mirrors `INSTITUTION_KINDS` in
 * `modules/financial-accounts/domain/institution.ts`. **Categories, never an
 * individual issuer**, and not a capability flag: nothing here means
 * integrated, connected, reachable or supported.
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

export function isInstitutionKind(value: string): value is InstitutionKind {
  return (INSTITUTION_KINDS as readonly string[]).includes(value);
}

/**
 * Who the interface serves. A retail data interface and a corporate host-to-host
 * arrangement at the same issuer are different interfaces with different
 * onboarding, different limits and different evidence, so they are different
 * profiles rather than one profile with a caveat.
 */
export const CUSTOMER_SEGMENTS = ['RETAIL', 'SME', 'CORPORATE', 'GOVERNMENT', 'OTHER'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export function isCustomerSegment(value: string): value is CustomerSegment {
  return (CUSTOMER_SEGMENTS as readonly string[]).includes(value);
}

/**
 * How a person would authorise data to reach Karar, IF a rail ever existed.
 *
 * Two of these are describable and permanently unacceptable, and naming them
 * is the reason the list is not shorter. An issuer whose only route is "type
 * your banking password into our screen" is a real issuer, and a review has to
 * be able to write that down — precisely so the profile can also record that
 * the answer is no. Omitting the words would leave a reviewer reaching for the
 * nearest acceptable one.
 */
export const CONSENT_METHODS = [
  /** Nothing to authorise: the person is entering their own figures. */
  'NONE_REQUIRED',
  'SUBJECT_TYPED_ENTRY',
  'SUBJECT_UPLOADED_FILE',
  /** The person authorises at the issuer, on the issuer's own surface. */
  'REDIRECT_TO_ISSUER',
  /** The person approves in the issuer's own app; Karar sees no secret. */
  'DECOUPLED_ISSUER_APP_APPROVAL',
  /** A signed instruction on paper or its regulated electronic equivalent. */
  'OFFLINE_WRITTEN_MANDATE',
  /** Describable, never acceptable — see ACCEPTABLE_CONSENT_METHODS. */
  'EMBEDDED_CREDENTIAL_ENTRY',
  /** Describable, never acceptable. */
  'SCREEN_SCRAPING',
  /** Nobody has established how it would work. The honest ground state. */
  'UNKNOWN',
] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export function isConsentMethod(value: string): value is ConsentMethod {
  return (CONSENT_METHODS as readonly string[]).includes(value);
}

/**
 * The consent methods this platform could ever use.
 *
 * `EMBEDDED_CREDENTIAL_ENTRY` and `SCREEN_SCRAPING` are absent and must stay
 * absent. ADR-0028 is unambiguous: no bank or wallet username, password, mPIN,
 * OTP, recovery code, cookie, session state or access token is stored
 * anywhere, there is no scraping, no browser automation and no bank-app
 * reverse engineering. Both excluded methods require exactly the thing that
 * does not exist here, so an issuer offering only one of them offers this
 * platform nothing — which is what the validator concludes.
 *
 * `UNKNOWN` is absent for a different reason: it is not a method, it is the
 * absence of an answer, and a profile that has not established consent has not
 * established an available rail either.
 */
export const ACCEPTABLE_CONSENT_METHODS = [
  'NONE_REQUIRED',
  'SUBJECT_TYPED_ENTRY',
  'SUBJECT_UPLOADED_FILE',
  'REDIRECT_TO_ISSUER',
  'DECOUPLED_ISSUER_APP_APPROVAL',
  'OFFLINE_WRITTEN_MANDATE',
] as const;
export type AcceptableConsentMethod = (typeof ACCEPTABLE_CONSENT_METHODS)[number];

export function isAcceptableConsentMethod(value: ConsentMethod): value is AcceptableConsentMethod {
  return (ACCEPTABLE_CONSENT_METHODS as readonly string[]).includes(value);
}

/**
 * Statement formats an issuer's customers can obtain. FORMATS, not products:
 * a container and its layout, described the way a standard describes it.
 *
 * Describing a format here is not a claim that this platform parses it. Only
 * CSV is implemented, on the `USER_FILE_UPLOAD` rail, and that fact belongs to
 * `modules/financial-connections` rather than to a profile.
 */
export const STATEMENT_FORMATS = [
  'CSV',
  'XLSX',
  'PDF',
  'OFX',
  'QFX',
  'QIF',
  'ISO_20022_CAMT',
  'SWIFT_MT940',
  'OTHER',
] as const;
export type StatementFormat = (typeof STATEMENT_FORMATS)[number];

export function isStatementFormat(value: string): value is StatementFormat {
  return (STATEMENT_FORMATS as readonly string[]).includes(value);
}

/** The window a described quota is expressed over. */
export const RATE_WINDOWS = ['MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH'] as const;
export type RateWindow = (typeof RATE_WINDOWS)[number];

export function isRateWindow(value: string): value is RateWindow {
  return (RATE_WINDOWS as readonly string[]).includes(value);
}

/**
 * How far a commercial or technical onboarding has actually got.
 *
 * `APPLIED` and `GRANTED` are the two that assert something happened between
 * this platform and an issuer, so the validator requires the paired assertion
 * to be `VERIFIED` — which requires an evidence reference, which is the whole
 * mechanism. `NOT_OFFERED` and `OFFERED` describe the issuer and assert
 * nothing about Karar, so they need nothing.
 *
 * **No value here means data is flowing.** `GRANTED` means credentials to a
 * sandbox or a production programme were issued to somebody; whether any rail
 * is implemented is a separate question with a separate owner, and a screen
 * may not read this field as Connected.
 */
export const ACCESS_STAGES = ['NOT_OFFERED', 'OFFERED', 'APPLIED', 'GRANTED'] as const;
export type AccessStage = (typeof ACCESS_STAGES)[number];

export function isAccessStage(value: string): value is AccessStage {
  return (ACCESS_STAGES as readonly string[]).includes(value);
}

/** The stages that assert something happened between this platform and an issuer. */
export const ACCESS_STAGES_REQUIRING_EVIDENCE: readonly AccessStage[] = Object.freeze([
  'APPLIED',
  'GRANTED',
]);

export function accessStageRequiresEvidence(stage: AccessStage): boolean {
  return ACCESS_STAGES_REQUIRING_EVIDENCE.includes(stage);
}
