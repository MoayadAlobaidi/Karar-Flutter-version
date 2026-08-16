/**
 * Sha256InvitationTokenSource — 32 bytes of CSPRNG entropy, base64url on the
 * wire (shown once), sha256 hex at rest. Hashing is deliberately plain
 * sha256, not a password KDF: the input is a 256-bit random secret, not a
 * guessable password, so brute force is already infeasible and lookups stay
 * indexable.
 */

import { createHash, randomBytes } from 'node:crypto';

import type {
  InvitationTokenSource,
  IssuedInvitationToken,
} from '../../application/ports/invitation-token-source.js';

export class Sha256InvitationTokenSource implements InvitationTokenSource {
  issue(): IssuedInvitationToken {
    const rawToken = randomBytes(32).toString('base64url');
    return { rawToken, tokenHash: this.hashOf(rawToken) };
  }

  hashOf(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }
}
