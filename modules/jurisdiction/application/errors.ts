/**
 * The expected-failure vocabulary shared by this module's use cases. Every
 * arm is a legitimate outcome the caller must handle (`Result`, backend.md
 * §9); defects — blank required fields, unknown vocabulary values at trusted
 * call sites — throw instead.
 */

import type {
  ActivationDenialReason,
  PackValidationFinding,
  PolicyEnvironment,
} from '@karar/jurisdiction-policy';

export interface StoreFailure {
  readonly kind: 'STORE_FAILURE';
  readonly message: string;
}

export interface NotFound {
  readonly kind: 'NOT_FOUND';
  readonly resource: string;
  readonly id: string;
}

/**
 * The state change persisted but its audit record did not. Surfaced loudly
 * as an error — never swallowed, never logged-and-forgotten (legacy AZ5);
 * the caller decides whether its operation stands without a trail.
 */
export interface AuditAppendFailed {
  readonly kind: 'AUDIT_APPEND_FAILED';
  readonly message: string;
}

/** The named jurisdiction is not in the register — assignments and
 * activations fail closed rather than inventing a regime. */
export interface UnknownJurisdiction {
  readonly kind: 'UNKNOWN_JURISDICTION';
  readonly code: string;
}

/** The (source, verification) pair is not a legal combination: a user
 * declaration is never verified by itself, and a provider verification is
 * what VERIFIED means (migration 0072 CHECKs). */
export interface VerificationSourceMismatch {
  readonly kind: 'VERIFICATION_SOURCE_MISMATCH';
  readonly source: string;
  readonly verificationStatus: string;
  readonly message: string;
}

/** The pure lifecycle predicate refused the activation (DRAFT or unapproved
 * outside local, retired pack, approval claim without evidence). */
export interface ActivationDenied {
  readonly kind: 'ACTIVATION_DENIED';
  readonly packVersion: string;
  readonly environment: PolicyEnvironment;
  readonly reasons: readonly ActivationDenialReason[];
}

/** The pack failed structural validation — an invalid pack never activates. */
export interface PackInvalid {
  readonly kind: 'PACK_INVALID';
  readonly packVersion: string;
  readonly findings: readonly PackValidationFinding[];
}

/** The requested version is already the active one for this environment. */
export interface AlreadyActive {
  readonly kind: 'ALREADY_ACTIVE';
  readonly packVersion: string;
}

/** Retirement named a version that is not the active one (or none is). */
export interface NotActive {
  readonly kind: 'NOT_ACTIVE';
  readonly packVersion: string;
  readonly activeVersion: string | null;
}

/** Thrown (not returned) for defective input at a trusted call site. */
export class InvalidJurisdictionInputError extends Error {
  override readonly name = 'InvalidJurisdictionInputError';
}

export function requireNonEmpty(field: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidJurisdictionInputError(`'${field}' requires a non-empty value`);
  }
  return value;
}

export function toStoreFailure(error: unknown): StoreFailure {
  return {
    kind: 'STORE_FAILURE',
    message: error instanceof Error ? error.message : String(error),
  };
}
