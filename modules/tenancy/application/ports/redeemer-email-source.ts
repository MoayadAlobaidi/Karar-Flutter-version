/**
 * RedeemerEmailSource — the AUTHENTICATED redeemer's verified email, as the
 * identity module knows it (identity_accounts is the source; the composition
 * root wires identity's implementation). Redemption matches the invitation's
 * stored normalized email against THIS value — never against anything the
 * client sent in the redemption request.
 */

import type { UserId } from '@karar/shared-kernel';

export interface RedeemerEmailSource {
  /** The verified email for the account, or null when none is verified. */
  verifiedEmailOf(userId: UserId): Promise<string | null>;
}
