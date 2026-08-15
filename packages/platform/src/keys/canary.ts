/**
 * The sealed-integrity canary contract (ADR-0017; data-model.md §9;
 * docs/security/sealed-access.md).
 *
 * Mandatory regardless of custody model: one synthetic sealed record per
 * jurisdiction-KEK, decrypted on a schedule. It is the only mechanism that
 * detects key loss or key unavailability **without violating the seal** —
 * for sealed data, loss is otherwise unrecoverable and undetectable, found
 * at the worst possible moment (legacy ENC-2).
 *
 * Contract, verbatim from the ADR:
 * - the plaintext is **synthetic only** — it contains no customer-derived
 *   data, enforced here by the mandatory 'KARAR-CANARY-' marker prefix and
 *   at Phase 13 by the canary-purity architecture test;
 * - a verify run exercises the **complete path**: envelope fetch, DEK
 *   unwrap, key-version resolution via the envelope's KeyVersionRef, and
 *   live access to the key provider — a cached key satisfying decryption
 *   would defeat the point;
 * - it **never logs plaintext** — success or failure, logs carry the canary
 *   ref, the key version, timings, and the outcome only;
 * - failure **alerts**; a canary nobody watches is decoration.
 */

import type { KeyRef, KeyVersionRef } from './refs.js';

/** Every canary plaintext starts with this; nothing customer-derived ever does. */
export const CANARY_PLAINTEXT_PREFIX = 'KARAR-CANARY-';

export class CanaryPlaintextError extends Error {
  override readonly name = 'CanaryPlaintextError';
}

/**
 * Rejects any candidate canary plaintext that does not carry the synthetic
 * marker prefix. Deliberately strict: the guard exists so a refactor can
 * never route customer content into a canary record.
 */
export function assertSyntheticCanaryPlaintext(plaintext: string): void {
  if (!plaintext.startsWith(CANARY_PLAINTEXT_PREFIX)) {
    throw new CanaryPlaintextError(
      `canary plaintext must start with '${CANARY_PLAINTEXT_PREFIX}'; ` +
        'a canary record is synthetic only and never holds customer-derived data (ADR-0017)',
    );
  }
}

export interface CanaryVerifyOutcome {
  readonly ok: boolean;
  /** The key version the envelope resolved to during this run. */
  readonly keyVersion: KeyVersionRef;
  /** Wall-clock duration of the full decrypt path, for alert thresholds. */
  readonly durationMs: number;
  /** Failure kind when not ok; never plaintext, never key material. */
  readonly failure?: string;
}

/** One canary: a synthetic sealed record for one jurisdiction-KEK. */
export interface IntegrityCanaryContract {
  /** The KEK this canary proves access to. */
  readonly canaryRef: KeyRef;
  /** Synthetic plaintext; always 'KARAR-CANARY-…' (assertSyntheticCanaryPlaintext). */
  readonly syntheticPlaintext: string;
  /** Verification schedule as an ISO-8601 repeating interval, e.g. 'R/PT6H'. */
  readonly schedule: string;
  /**
   * Runs one verification: full-path decrypt (provider access, key-version
   * resolution, unwrap, decrypt), compares against `syntheticPlaintext`, and
   * reports. Implementations must not log or embed plaintext in the outcome.
   */
  verify(): Promise<CanaryVerifyOutcome>;
}

/**
 * Builds the declarative part of a canary contract, enforcing the synthetic
 * marker at construction. The `verify` implementation arrives with the vault
 * (Phase 13); constructing the contract earlier lets deployment profiles
 * declare their canaries now.
 */
export function integrityCanaryContract(
  canaryRef: KeyRef,
  syntheticPlaintext: string,
  schedule: string,
  verify: IntegrityCanaryContract['verify'],
): IntegrityCanaryContract {
  assertSyntheticCanaryPlaintext(syntheticPlaintext);
  return Object.freeze({ canaryRef, syntheticPlaintext, schedule, verify });
}
