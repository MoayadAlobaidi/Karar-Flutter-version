/**
 * Platform error codes — infrastructure and transport conditions only.
 *
 * This is deliberately not a business-error vocabulary: "insufficient funds"
 * or "budget exceeded" are expected domain outcomes, carried as `Result`
 * values in module signatures (see the kernel's `Result` doc), and their
 * codes belong to the owning module's contract. Nothing here anticipates
 * them; a business code appearing in this list is a review failure.
 */
export const ErrorCode = Object.freeze({
  /** The request was understood but its content failed validation. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** The request carries no usable authenticated principal. */
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  /** The authenticated principal may not perform this operation. */
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  /** The platform's own configuration is unusable; the request had no chance. */
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  /** A dependency (database, provider, queue) did not respond usefully. */
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  /** A platform kill switch restricts this operation (restrict-only, operator-set). */
  OPERATION_RESTRICTED: 'OPERATION_RESTRICTED',
  /** The request conflicts with current state (versioning, uniqueness, concurrency). */
  CONFLICT: 'CONFLICT',
  /** The addressed resource does not exist for this caller. */
  NOT_FOUND: 'NOT_FOUND',
  /** The caller exceeded a rate or quota limit. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Anything unexpected. The safe default for unknown failures. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const);

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
