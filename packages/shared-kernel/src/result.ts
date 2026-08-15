/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); supporting types and
   combinators therefore hang off the universal via declaration merging. */

/**
 * An expected outcome as a value: success carrying `value`, or failure
 * carrying `error` (docs/architecture/backend.md §9).
 *
 * The rule that decides between `Result` and `throw`: **expected outcomes are
 * `Result`; exceptions are for the unexpected only.** "Insufficient funds",
 * "unknown currency code in a request", "validation failed" are outcomes the
 * caller must handle, so they are values in the signature. A violated
 * precondition — adding QAR to KWD, a malformed amount literal at a call site
 * that controls its input — is a defect, and defects throw (see the kernel's
 * `KernelError` note on each universal). A `Result` in a signature is a
 * promise that every arm is a legitimate outcome worth handling.
 */
export type Result<T, E> = Result.Ok<T> | Result.Err<E>;

export namespace Result {
  export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
  }

  export interface Err<E> {
    readonly ok: false;
    readonly error: E;
  }

  export function ok<T>(value: T): Ok<T> {
    return Object.freeze({ ok: true as const, value });
  }

  export function err<E>(error: E): Err<E> {
    return Object.freeze({ ok: false as const, error });
  }

  export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
    return result.ok;
  }

  export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
    return !result.ok;
  }

  /** Transform the success value; an error passes through untouched. */
  export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    return result.ok ? ok(fn(result.value)) : result;
  }

  /** Transform the error; a success passes through untouched. */
  export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    return result.ok ? result : err(fn(result.error));
  }

  /** The success value, or `fallback` when the result is an error. */
  export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
    return result.ok ? result.value : fallback;
  }

  /** Chain a result-producing step; the first error short-circuits. */
  export function andThen<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => Result<U, E>,
  ): Result<U, E> {
    return result.ok ? fn(result.value) : result;
  }
}
