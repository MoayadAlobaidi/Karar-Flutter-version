/**
 * Randomness for the identity flows (SecretSource port) — node:crypto CSPRNG
 * only, sized per material:
 *
 * - refresh/reset tokens: 32 random bytes, base64url (43 chars, 256 bits);
 * - verification codes: 8 chars of Crockford base32 (40 bits) — human-typable,
 *   protected by the 5-attempt cap, 30-minute expiry, and HMAC-peppered
 *   storage rather than by raw size;
 * - recovery codes: 26 chars of Crockford base32 over 17 random bytes —
 *   130 bits in the string, comfortably past the 128-bit requirement;
 * - row ids: UUID v7.
 */

import { randomBytes } from 'node:crypto';

import type { SecretSource } from '../../application/ports/crypto-ports.js';
import { uuidv7 } from './uuidv7.js';

// Crockford base32: no I/L/O/U, so transcription mistakes stay unambiguous.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function crockford(bytes: Uint8Array, chars: number): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      bits -= 5;
      out += CROCKFORD[(acc >> bits) & 31];
    }
    if (out.length === chars) break;
  }
  return out;
}

export class NodeSecretSource implements SecretSource {
  id(): string {
    return uuidv7();
  }

  refreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  resetToken(): string {
    return randomBytes(32).toString('base64url');
  }

  verificationCode(): string {
    return crockford(randomBytes(5), 8);
  }

  recoveryCode(): string {
    return crockford(randomBytes(17), 26);
  }
}
