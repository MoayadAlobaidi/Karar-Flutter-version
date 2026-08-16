/**
 * Expected-failure vocabulary for the subject-policy use cases (`Result`
 * arms the caller must handle; defects throw). Each denial arm is a
 * distinct restrict-only refusal, not a generic 400: an option outside the
 * pack, a capability without subject policy, and a pack version that moved
 * under the recording are different legal situations.
 */

export interface StoreFailure {
  readonly kind: 'STORE_FAILURE';
  readonly message: string;
}

export interface NotFound {
  readonly kind: 'NOT_FOUND';
  readonly resource: string;
  readonly id: string;
}

/** State change persisted but its audit record did not — surfaced loudly. */
export interface AuditAppendFailed {
  readonly kind: 'AUDIT_APPEND_FAILED';
  readonly message: string;
}

/** The capability id is not in the production registry (or the pinned Id set). */
export interface CapabilityUnknown {
  readonly kind: 'CAPABILITY_UNKNOWN';
  readonly capabilityId: string;
  readonly message: string;
}

/** The capability declares NO subject policy — no selection may exist for it. */
export interface NoSubjectPolicyDeclared {
  readonly kind: 'NO_SUBJECT_POLICY_DECLARED';
  readonly capabilityId: string;
  readonly message: string;
}

/** The option set could not be resolved — nothing to validate against: fail closed. */
export interface OptionSetUnresolved {
  readonly kind: 'OPTION_SET_UNRESOLVED';
  readonly capabilityId: string;
  readonly reason: string;
  readonly message: string;
}

/** The elected option is outside the pack-permitted set (restrict-only). */
export interface OptionNotPermitted {
  readonly kind: 'OPTION_NOT_PERMITTED';
  readonly capabilityId: string;
  readonly profileRef: string;
  readonly profileVersion: string;
  readonly message: string;
}

/**
 * The pack version the caller elected under is not the applicable one —
 * either stale input (AT_RESOLUTION) or a concurrent pack change detected
 * by the pin re-check (AT_PIN). Nothing is recorded either way.
 */
export interface PackVersionMismatch {
  readonly kind: 'PACK_VERSION_MISMATCH';
  readonly capabilityId: string;
  readonly expectedPackVersion: string;
  readonly applicablePackVersion: string;
  readonly detected: 'AT_RESOLUTION' | 'AT_PIN';
  readonly message: string;
}

/** Withdrawal refused: only an ACTIVE selection can be withdrawn. */
export interface SelectionNotActive {
  readonly kind: 'SELECTION_NOT_ACTIVE';
  readonly selectionId: string;
  readonly status: string;
  readonly message: string;
}

/** Thrown (not returned) for defective input at a trusted call site. */
export class InvalidSelectionInputError extends Error {
  override readonly name = 'InvalidSelectionInputError';
}

export function requireNonEmpty(field: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidSelectionInputError(`'${field}' requires a non-empty value`);
  }
  return value;
}

export function toStoreFailure(error: unknown): StoreFailure {
  return {
    kind: 'STORE_FAILURE',
    message: error instanceof Error ? error.message : String(error),
  };
}
