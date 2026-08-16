/**
 * Digest strategy (CredentialDigester port), one decision per material class:
 *
 * - LOW-entropy one-time material (8-char verification codes, ~40 bits):
 *   HMAC-SHA256 under the server-side verification pepper
 *   (`KARAR_VERIFICATION_PEPPER`). A plain hash of 40-bit material is
 *   offline-guessable from a leaked row; the pepper makes a database copy
 *   useless without the config secret. Reset tokens share the pepper for one
 *   uniform one-time-code shape (they are 256-bit, so this is margin).
 * - HIGH-entropy material (32-byte refresh tokens, 128-bit recovery codes):
 *   plain SHA-256 — preimage search is already infeasible, and a
 *   pepper-independent digest keeps token verification working during a
 *   pepper rotation.
 * - Client IP addresses: HMAC-SHA256 under the separate digest pepper
 *   (`KARAR_DIGEST_PEPPER`) — the ONLY form an address is ever stored in;
 *   correlatable within the platform, meaningless outside it.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { SecretValue } from '@karar/platform/dist/config/index.js';

import type { CredentialDigester } from '../../application/ports/crypto-ports.js';

export class NodeCredentialDigester implements CredentialDigester {
  constructor(
    private readonly verificationPepper: SecretValue,
    private readonly digestPepper: SecretValue,
  ) {}

  verificationCodeDigest(code: string): string {
    return this.hmac(this.verificationPepper, `verification:${code}`);
  }

  resetTokenDigest(token: string): string {
    return this.hmac(this.verificationPepper, `reset:${token}`);
  }

  refreshTokenDigest(token: string): string {
    return createHash('sha256').update(`refresh:${token}`).digest('hex');
  }

  recoveryCodeDigest(code: string): string {
    return createHash('sha256').update(`recovery:${code}`).digest('hex');
  }

  ipDigest(clientIp: string): string {
    return this.hmac(this.digestPepper, `ip:${clientIp}`).slice(0, 32);
  }

  digestsEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'utf8');
    const bufferB = Buffer.from(b, 'utf8');
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  private hmac(pepper: SecretValue, material: string): string {
    return createHmac('sha256', pepper.unwrap()).update(material).digest('hex');
  }
}
