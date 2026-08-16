/**
 * Argon2id password hashing (PasswordHasher port). Never reversible
 * "encryption", never a fast hash (docs/security/secrets.md §11).
 *
 * PARAMETER EVIDENCE — benchmarked on the development machine this phase
 * targets (Apple Silicon, argon2 0.45.1 native binding, Node 25.9,
 * single-thread), interactive-login budget ~100-250ms per verification:
 *
 *   m=19456 (19 MiB)  t=2 p=1 → hash  19.5ms, verify  19.4ms  (OWASP floor; too fast for our budget)
 *   m=65536 (64 MiB)  t=3 p=1 → hash 108.0ms, verify 108.3ms
 *   m=131072 (128 MiB) t=2 p=1 → hash 160.5ms, verify 156.9ms  ← CHOSEN (v1)
 *   m=131072 (128 MiB) t=3 p=1 → hash 236.1ms, verify 232.1ms
 *   m=262144 (256 MiB) t=2 p=1 → hash 319.1ms, verify 315.9ms  (over budget)
 *
 * Version 1 = {memoryCost: 131072 (128 MiB), timeCost: 2, parallelism: 1}:
 * squarely inside the budget with the most memory-hardness the budget buys
 * (memory beats iterations against GPU/ASIC guessing). Parameters are
 * VERSIONED: the set that produced a hash is stored beside it
 * (password_credentials.params_version), `needsRehash` reports staleness,
 * and the login flow rehashes while the plaintext is legitimately in hand —
 * so a future set upgrade is a new entry here, never a migration crisis.
 */

import argon2 from 'argon2';

import type { PasswordHasher } from '../../application/ports/crypto-ports.js';

export interface Argon2Params {
  readonly memoryCost: number;
  readonly timeCost: number;
  readonly parallelism: number;
}

/** Append-only registry: version -> parameter set. NEVER edit an existing entry. */
export const ARGON2_PARAM_SETS: Readonly<Record<number, Argon2Params>> = Object.freeze({
  1: Object.freeze({ memoryCost: 131072, timeCost: 2, parallelism: 1 }),
});

export const CURRENT_ARGON2_PARAMS_VERSION = 1;

export class Argon2PasswordHasher implements PasswordHasher {
  private readonly paramsVersion: number;
  private readonly params: Argon2Params;
  /** A real hash of an unguessable value, so dummy verifications cost the same. */
  private dummyHashPromise: Promise<string> | undefined;

  constructor(options: { readonly paramsVersion?: number } = {}) {
    this.paramsVersion = options.paramsVersion ?? CURRENT_ARGON2_PARAMS_VERSION;
    const params = ARGON2_PARAM_SETS[this.paramsVersion];
    if (params === undefined) {
      throw new Error(`unknown argon2 params_version ${this.paramsVersion}`);
    }
    this.params = params;
  }

  async hash(password: string): Promise<{ passwordHash: string; paramsVersion: number }> {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.params.memoryCost,
      timeCost: this.params.timeCost,
      parallelism: this.params.parallelism,
    });
    return { passwordHash, paramsVersion: this.paramsVersion };
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      // Library-provided constant-time comparison over the PHC string.
      return await argon2.verify(passwordHash, password);
    } catch {
      // A malformed stored hash verifies as false, never as an exception a
      // caller could distinguish (and never with the hash in a message).
      return false;
    }
  }

  needsRehash(paramsVersion: number): boolean {
    return paramsVersion < this.paramsVersion;
  }

  async dummyVerify(): Promise<void> {
    this.dummyHashPromise ??= argon2.hash(`dummy:${Math.random()}:${Date.now()}`, {
      type: argon2.argon2id,
      memoryCost: this.params.memoryCost,
      timeCost: this.params.timeCost,
      parallelism: this.params.parallelism,
    });
    const dummyHash = await this.dummyHashPromise;
    await argon2.verify(dummyHash, 'definitely-not-the-password');
  }
}
