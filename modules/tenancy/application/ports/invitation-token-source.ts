/**
 * InvitationTokenSource — bearer-token material for invitations. Randomness
 * lives behind this port (infrastructure); the application layer never
 * generates or hashes secrets itself.
 *
 * Contract: `issue()` returns a fresh 32-byte-entropy token exactly once —
 * the raw form goes to the creator's response and NOWHERE else (not at rest,
 * not in logs, not in audit metadata); only `tokenHash` (sha256, hex) is
 * stored. `hashOf` recomputes the hash of a presented token at redemption.
 */

export interface IssuedInvitationToken {
  /** Returned once to the creator; never persisted. */
  readonly rawToken: string;
  /** sha256 hex of rawToken — the only stored form. */
  readonly tokenHash: string;
}

export interface InvitationTokenSource {
  issue(): IssuedInvitationToken;
  hashOf(rawToken: string): string;
}
