/**
 * The reference types this module declares, and the one value type the whole
 * module is built around.
 *
 * Cross-module references carry a raw UUID plus a reference type declared
 * HERE (modules/provider-capabilities/MODULE.md; data-model.md §2), exactly as
 * `modules/financial-connections` and `modules/transactions` do for the same
 * anchors. A profile points at a catalogue row; it never imports that module's
 * identifier type and never holds a relation.
 *
 * ## There is no issuer NAME in this module, and its absence is the design
 *
 * A profile identifies an issuer by `InstitutionRef` and by nothing else. No
 * field here holds a trading name, a brand, a logo, a domain, a support
 * number, or a free-text label — because the moment one exists, this module is
 * a second issuer catalogue, and two catalogues disagree. `public.institutions`
 * (migration 0087) is where an issuer is named, once, under review; ADR-0028
 * is explicit that duplicating it is repaired only by a merge, and merging
 * issuer rows rewrites subject-owned account references across every tenant at
 * once.
 *
 * The consequence is the property rule 5 of this module's brief asks for: a
 * profile **cannot** name a provider, so no provider-specific vocabulary can
 * appear in it. Not "must not" — cannot. A test asserts the field set.
 */

/** RFC 9562 textual form, any version. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidReferenceError extends Error {
  override readonly name = 'InvalidReferenceError';
}

function requireUuid(kind: string, value: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new InvalidReferenceError(
      `${kind} requires a UUID in RFC 9562 textual form, got '${String(value)}'`,
    );
  }
  return value.toLowerCase();
}

/** What an `InstitutionRef` UUID points at. Closed set; extending it is reviewed. */
export const INSTITUTION_REFERENCE_TYPES = ['INSTITUTION_CATALOGUE_ENTRY'] as const;
export type InstitutionReferenceType = (typeof INSTITUTION_REFERENCE_TYPES)[number];

/**
 * A row in the reviewed institution catalogue (`public.institutions`, owned by
 * modules/financial-accounts), as a raw UUID plus its kind.
 *
 * Naming an institution here asserts nothing about that institution: not that
 * it is reachable, not that it exposes an interface to Karar, and above all
 * not that this platform is connected to it. None is (ADR-0028).
 */
export interface InstitutionRef {
  readonly referenceType: InstitutionReferenceType;
  readonly institutionId: string;
}

export const InstitutionRef = {
  of(
    institutionId: string,
    referenceType: InstitutionReferenceType = 'INSTITUTION_CATALOGUE_ENTRY',
  ): InstitutionRef {
    if (!INSTITUTION_REFERENCE_TYPES.includes(referenceType)) {
      throw new InvalidReferenceError(
        `InstitutionRef referenceType must be one of (${INSTITUTION_REFERENCE_TYPES.join(', ')}), got '${String(referenceType)}'`,
      );
    }
    return Object.freeze({
      referenceType,
      institutionId: requireUuid('InstitutionRef', institutionId),
    });
  },
};

/**
 * ISO 3166-1 alpha-2. **Country, never Jurisdiction.**
 *
 * jurisdiction-policy.md §1 keeps the two apart and migration 0094 follows it
 * exactly: Country is WHERE, geographically, carrying no business rule;
 * Jurisdiction is WHICH LEGAL REGIME GOVERNS and is the policy key. A
 * capability profile is a question about the first — which market an issuer's
 * interface serves — and answering it with a legal-regime code would import a
 * policy dimension into a description that asserts no legal fact, and would
 * multiply an issuer's profiles every time a free zone was declared.
 *
 * Branded so a two-letter string from anywhere else cannot be handed to a call
 * site expecting a market.
 */
export type CountryCode = string & { readonly __brand: 'ProviderCapabilityCountryCode' };

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export const CountryCode = {
  of(value: string): CountryCode {
    if (typeof value !== 'string' || !COUNTRY_CODE_PATTERN.test(value)) {
      throw new InvalidReferenceError(
        `CountryCode requires an ISO 3166-1 alpha-2 code in upper case, got '${String(value)}'`,
      );
    }
    return value as CountryCode;
  },
};

/**
 * A structured reference NAMING the evidence a review recorded.
 *
 * ## Why this type exists rather than a string
 *
 * This is the value that makes `VERIFIED` expensive. Migration 0094 already
 * refuses a bare regulatory claim at the database — the column holds either
 * the literal `UNVERIFIED` or a reference matching this exact shape, so
 * "regulated" without a reference is not a state that schema can express. The
 * same discipline has to survive in memory, or a reviewed configuration model
 * becomes the place the claim is made carelessly and the database only sees
 * the result.
 *
 * So: the shape is the SAME shape (`scheme:opaque-locator`), the brand makes
 * it nominal, and the only way to obtain one is to hand a matching string to
 * `of` or `tryOf`. `'UNVERIFIED'` does not match — it has no scheme separator
 * and is upper case — so the sentinel that means "nobody has looked" cannot be
 * smuggled in as evidence that somebody did.
 *
 * ## What it is NOT
 *
 * It is not the evidence, and nothing here reads, fetches or validates what it
 * points at. It is a locator a human reviewer can follow: a document register
 * entry, a signed agreement id, a regulator's licence-register reference, a
 * meeting record. Minting one is a review activity and never a code activity —
 * `packages/jurisdiction-policy`'s rule holds unchanged, absence of evidence
 * means not approved, and no function in this module creates a reference.
 */
export type EvidenceReference = string & { readonly __brand: 'EvidenceReference' };

/**
 * `scheme:locator`, mirroring `institution_markets_regulatory_evidence_check`
 * in migration 0094 character for character. A shared shape is what lets a
 * reviewed profile and a reviewed catalogue row cite the same document without
 * either side translating.
 */
export const EVIDENCE_REFERENCE_PATTERN = /^[a-z][a-z0-9-]{2,31}:[A-Za-z0-9._~/-]{1,128}$/;

/** The sentinel meaning nobody has looked. Deliberately not an `EvidenceReference`. */
export const NO_EVIDENCE = 'UNVERIFIED' as const;

export function isEvidenceReference(value: string): value is EvidenceReference {
  return typeof value === 'string' && EVIDENCE_REFERENCE_PATTERN.test(value);
}

export const EvidenceReference = {
  /**
   * For authored, reviewed configuration. A malformed literal in a reviewed
   * profile is a defect rather than an expected outcome, so this throws — the
   * kernel's rule (`Result` doc comment) applied to a call site that controls
   * its own input.
   */
  of(value: string): EvidenceReference {
    if (!isEvidenceReference(value)) {
      throw new InvalidReferenceError(
        'an evidence reference must be scheme:locator — a lower-case scheme of 3 to 32 ' +
          'characters, a colon, then an opaque locator of 1 to 128 characters. The value ' +
          'supplied is not quoted here: logging it belongs to the caller, and a reference can ' +
          'name an unpublished agreement',
      );
    }
    return value;
  },

  /**
   * For a reference arriving from outside authored configuration — a review
   * tool, an import, a form. Answers `undefined` rather than throwing, because
   * a malformed value from a boundary is an expected condition.
   */
  tryOf(value: string): EvidenceReference | undefined {
    return isEvidenceReference(value) ? value : undefined;
  },
};
