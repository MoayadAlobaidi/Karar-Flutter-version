/**
 * Reference types this module declares for itself (data-model.md §2:
 * cross-module and cross-dimension references are raw values plus a
 * locally-declared type in the consuming module — never an imported ID type).
 *
 * `TenantId` and `UserId` are the two kernel universals and come from
 * `@karar/shared-kernel`; everything else an operating entity points at —
 * jurisdictions, purposes, licence types, legal bases — travels as a branded
 * reference string. A reference asserts existence of a naming scheme, never
 * a legal fact (ADR-0024: licences assert nothing; resolution is Phase 3.5).
 */

declare const jurisdictionRefBrand: unique symbol;
/** Reference into the jurisdiction dimension, e.g. 'jurisdiction:qa'. */
export type JurisdictionRef = string & { readonly [jurisdictionRefBrand]: 'JurisdictionRef' };

declare const purposeRefBrand: unique symbol;
/** Reference to a processing purpose, e.g. 'purpose:ai-processing'. */
export type PurposeRef = string & { readonly [purposeRefBrand]: 'PurposeRef' };

/** Thrown for blank reference input at call sites that control their input. */
export class InvalidReferenceError extends Error {
  override readonly name = 'InvalidReferenceError';
}

function requireRef(kind: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidReferenceError(`${kind} requires a non-empty reference string`);
  }
  return value;
}

export const JurisdictionRef = {
  of(value: string): JurisdictionRef {
    return requireRef('JurisdictionRef', value) as JurisdictionRef;
  },
};

export const PurposeRef = {
  of(value: string): PurposeRef {
    return requireRef('PurposeRef', value) as PurposeRef;
  },
};
