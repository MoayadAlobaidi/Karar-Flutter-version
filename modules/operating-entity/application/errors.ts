/**
 * The expected-failure vocabulary shared by this module's use cases. Every
 * arm is a legitimate outcome the caller must handle (`Result`, backend.md
 * §9); defects — blank required fields, unknown vocabulary values at trusted
 * call sites — throw instead.
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

/**
 * The state change persisted but its audit record did not. Surfaced loudly
 * as an error — never swallowed, never logged-and-forgotten (legacy AZ5);
 * the caller decides whether its operation stands without a trail.
 */
export interface AuditAppendFailed {
  readonly kind: 'AUDIT_APPEND_FAILED';
  readonly message: string;
}

export interface InvalidTransition {
  readonly kind: 'INVALID_TRANSITION';
  readonly from: string;
  readonly to: string;
  readonly message: string;
}

/** Thrown (not returned) for defective input at a trusted call site. */
export class InvalidOperatingEntityInputError extends Error {
  override readonly name = 'InvalidOperatingEntityInputError';
}

export function requireNonEmpty(field: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidOperatingEntityInputError(`'${field}' requires a non-empty value`);
  }
  return value;
}

export function toStoreFailure(error: unknown): StoreFailure {
  return {
    kind: 'STORE_FAILURE',
    message: error instanceof Error ? error.message : String(error),
  };
}
