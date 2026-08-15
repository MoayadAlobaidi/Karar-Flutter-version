/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); the parser and error
   therefore hang off the universal via declaration merging. */
import { KernelError } from './internal/kernel-error';
import { isUuid } from './internal/uuid';
import { Result } from './result';

/**
 * A person as the subject of audit, consent, and ownership. A branded string:
 * structurally a UUID string at runtime, but not assignable from a bare
 * `string` (or from a `TenantId`).
 *
 * In the kernel because `UserId` appears in audit, consent, and nearly every
 * tenant-owned aggregate across every module (ADR-0003) — forcing each domain
 * to declare its own `OwnerRef` would duplicate without isolating.
 */
export type UserId = string & { readonly __brand: 'UserId' };

export namespace UserId {
  /** Thrown by `of` for input that is not UUID-shaped. */
  export class InvalidUserIdError extends KernelError {
    constructor(value: string) {
      super(`'${value}' is not a UUID-shaped user id`);
    }
  }

  /**
   * Brand a validated UUID string. Throws for anything not UUID-shaped — for
   * call sites whose input is already trusted. Boundary code validating
   * external input uses `parse`.
   */
  export function of(value: string): UserId {
    if (!isUuid(value)) {
      throw new InvalidUserIdError(value);
    }
    return value as UserId;
  }

  /** Validate external input as an expected condition: a `Result`, never a throw. */
  export function parse(value: string): Result<UserId, InvalidUserIdError> {
    return isUuid(value) ? Result.ok(value as UserId) : Result.err(new InvalidUserIdError(value));
  }

  /** The underlying UUID string, for logging and persistence edges. */
  export function toString(id: UserId): string {
    return id;
  }
}
