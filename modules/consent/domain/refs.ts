/**
 * Reference types the consent module declares for itself (data-model.md §2:
 * cross-module references are raw values plus a locally-declared type in the
 * consuming module). `OperatingEntityRef` is this module's name for the
 * legal person a document belongs to and a grant is pinned to — a raw UUID,
 * never the operating-entity module's own ID type.
 */

declare const jurisdictionRefBrand: unique symbol;
export type JurisdictionRef = string & { readonly [jurisdictionRefBrand]: 'JurisdictionRef' };

declare const purposeRefBrand: unique symbol;
export type PurposeRef = string & { readonly [purposeRefBrand]: 'PurposeRef' };

declare const operatingEntityRefBrand: unique symbol;
/** Raw UUID reference to an operating entity (pinned on grants at creation). */
export type OperatingEntityRef = string & {
  readonly [operatingEntityRefBrand]: 'OperatingEntityRef';
};

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

export const OperatingEntityRef = {
  of(value: string): OperatingEntityRef {
    return requireRef('OperatingEntityRef', value) as OperatingEntityRef;
  },
};
