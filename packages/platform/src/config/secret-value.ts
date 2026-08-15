/**
 * SecretValue — the only way a secret travels through typed configuration.
 *
 * Secrets are `SECRET`-classified (docs/security/data-classification.md): never
 * in logs, never in error messages, never in serialized output. Every rendering
 * path an accident could take — string coercion, JSON serialization,
 * `util.inspect` / `console.log` — yields the literal `'[redacted]'`. The real
 * value is only reachable through an explicit `unwrap()` call, which is
 * grep-able at call sites.
 */
export class SecretValue {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  /** Explicit, grep-able access to the underlying secret. */
  unwrap(): string {
    return this.#value;
  }

  toString(): string {
    return '[redacted]';
  }

  toJSON(): string {
    return '[redacted]';
  }

  /** `util.inspect` / `console.log` (symbol form avoids a node:util import). */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return '[redacted]';
  }

  /** String coercion in template literals and `+`. */
  [Symbol.toPrimitive](): string {
    return '[redacted]';
  }
}
