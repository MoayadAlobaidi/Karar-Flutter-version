/**
 * Rate-limit key derivation. Raw identifiers never become storage keys:
 * an e-mail address in a Redis key is an e-mail address in RDB snapshots,
 * MONITOR streams, and operator consoles. Every subject key is an
 * HMAC-SHA256 digest under a server pepper, truncated to 128 bits — plenty
 * against collisions, useless for reversal, and unlinkable without the
 * pepper.
 */

import { createHmac } from 'node:crypto';

import type { SecretValue } from '../config/secret-value.js';

/** 128-bit hex digest — the only shape subject keys take. */
export type RateLimitSubjectKey = string;

export class RateLimitKeyHasher {
  private readonly pepper: SecretValue;

  constructor(pepper: SecretValue) {
    this.pepper = pepper;
  }

  /** Digest of a normalized e-mail (the caller normalizes; digesting is here). */
  emailKey(normalizedEmail: string): RateLimitSubjectKey {
    return this.digest(`email:${normalizedEmail}`);
  }

  /** Digest of a canonical client IP (from the trusted-proxy resolver). */
  ipKey(clientIp: string): RateLimitSubjectKey {
    return this.digest(`ip:${clientIp}`);
  }

  /** Digest of an opaque identifier (account id, session id, inviter id). */
  idKey(id: string): RateLimitSubjectKey {
    return this.digest(`id:${id}`);
  }

  private digest(material: string): string {
    return createHmac('sha256', this.pepper.unwrap()).update(material).digest('hex').slice(0, 32);
  }
}

/** The full storage key for one (policy, subject) pair. */
export function storageKey(policyName: string, subjectKey: RateLimitSubjectKey): string {
  return `karar:rl:${policyName}:${subjectKey}`;
}
