/**
 * Typed application errors — expected outcomes as values (backend.md §9).
 * Unexpected infrastructure failures are caught at the use-case boundary and
 * surfaced as STORE_FAILURE / RESOLUTION_FAILED; malformed caller input is a
 * defect and throws `InvalidCapabilityInputError`.
 */

export interface UnknownCapability {
  readonly kind: 'UNKNOWN_CAPABILITY';
  readonly capabilityId: string;
  readonly message: string;
}

/**
 * A write was refused because it would configure MORE access than the
 * descriptor ceiling permits (an allowing state for unbuilt/undeployed code
 * or an undeclared jurisdiction). The refusal is itself audited — an
 * attempted expansion above the ceiling is a security-relevant denial.
 */
export interface AboveCeiling {
  readonly kind: 'ABOVE_CEILING';
  readonly capabilityId: string;
  readonly message: string;
}

export interface VersionConflict {
  readonly kind: 'VERSION_CONFLICT';
  readonly resource: string;
  readonly id: string;
  readonly expectedVersion: number;
  readonly message: string;
}

export interface NotFound {
  readonly kind: 'NOT_FOUND';
  readonly resource: string;
  readonly id: string;
}

export interface AlreadyExists {
  readonly kind: 'ALREADY_EXISTS';
  readonly resource: string;
  readonly id: string;
  readonly message: string;
}

export interface StoreFailure {
  readonly kind: 'STORE_FAILURE';
  readonly message: string;
}

/** A resolution input could not be read — the whole resolution fails closed. */
export interface ResolutionFailed {
  readonly kind: 'RESOLUTION_FAILED';
  readonly message: string;
}

export interface AuditAppendFailed {
  readonly kind: 'AUDIT_APPEND_FAILED';
  readonly message: string;
}

export class InvalidCapabilityInputError extends Error {
  override readonly name = 'InvalidCapabilityInputError';

  constructor(message: string) {
    super(message);
  }
}

export function requireNonEmpty(field: string, value: string): void {
  if (value.trim() === '') {
    throw new InvalidCapabilityInputError(`${field} must be a non-empty string`);
  }
}

export function toStoreFailure(error: unknown): StoreFailure {
  return {
    kind: 'STORE_FAILURE',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function toResolutionFailed(error: unknown): ResolutionFailed {
  return {
    kind: 'RESOLUTION_FAILED',
    message: error instanceof Error ? error.message : String(error),
  };
}
