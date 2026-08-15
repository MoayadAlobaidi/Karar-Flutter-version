/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); the parser and error
   therefore hang off the universal via declaration merging. */
import { KernelError } from './internal/kernel-error';
import { isUuid } from './internal/uuid';
import { Result } from './result';

/**
 * The tenant boundary as a type. A branded string: structurally a UUID string
 * at runtime, but not assignable from a bare `string` (or from a `UserId`), so
 * a repository method demanding a `TenantId` cannot be handed the wrong
 * identifier by accident.
 *
 * In the kernel because every module needs the tenant boundary without
 * knowing any other module (ADR-0003 admission rule); module-owned ids
 * (`TransactionId`, `BudgetId`, …) are deliberately not here.
 */
export type TenantId = string & { readonly __brand: 'TenantId' };

export namespace TenantId {
  /** Thrown by `of` for input that is not UUID-shaped. */
  export class InvalidTenantIdError extends KernelError {
    constructor(value: string) {
      super(`'${value}' is not a UUID-shaped tenant id`);
    }
  }

  /**
   * Brand a validated UUID string. Throws for anything not UUID-shaped — for
   * call sites whose input is already trusted. Boundary code validating
   * external input uses `parse`.
   */
  export function of(value: string): TenantId {
    if (!isUuid(value)) {
      throw new InvalidTenantIdError(value);
    }
    return value as TenantId;
  }

  /** Validate external input as an expected condition: a `Result`, never a throw. */
  export function parse(value: string): Result<TenantId, InvalidTenantIdError> {
    return isUuid(value)
      ? Result.ok(value as TenantId)
      : Result.err(new InvalidTenantIdError(value));
  }

  /** The underlying UUID string, for logging and persistence edges. */
  export function toString(id: TenantId): string {
    return id;
  }
}
