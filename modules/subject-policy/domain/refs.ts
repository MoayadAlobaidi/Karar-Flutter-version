/**
 * Reference types the subject-policy module declares for itself
 * (data-model.md §2: cross-module references are raw values plus a
 * locally-declared type in the consuming module). `ProfileRef` is this
 * module's name for the OWNING capability's profile — an opaque reference
 * into that capability's bounded context, never a content-bearing value;
 * the capability that owns the profile declares its own richer type.
 */

declare const jurisdictionRefBrand: unique symbol;
export type JurisdictionRef = string & { readonly [jurisdictionRefBrand]: 'JurisdictionRef' };

declare const profileRefBrand: unique symbol;
/** Opaque reference to a capability-owned profile (no content, ever). */
export type ProfileRef = string & { readonly [profileRefBrand]: 'ProfileRef' };

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

export const ProfileRef = {
  of(value: string): ProfileRef {
    return requireRef('ProfileRef', value) as ProfileRef;
  },
};
