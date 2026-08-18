/**
 * ListOwnAccountSourceLinks — which sources feed the subject's accounts.
 *
 * **Returns views, never entities**, and that is the guarantee rather than a
 * convention: `AccountSourceLinkView` carries no `sourceAccountReference` and
 * no `fingerprint`, so the two protected values have no path out of this
 * module through a read. The first is another party's identifier for this
 * person; the second is a keyed value whose only power is saying that two
 * rows are about the same external account. A test asserts the absence at
 * runtime over `Object.keys`, because a type that is merely narrower is
 * erased before anything ships.
 *
 * Scoping by account is optional: with no account named, the answer is every
 * source feeding anything the subject owns.
 */

import { Result } from '@karar/shared-kernel';

import {
  toAccountSourceLinkView,
  type AccountSourceLinkView,
} from '../../domain/account-source-link.js';
import { CanonicalAccountRef } from '../../domain/refs.js';
import { storeFailure, type ListOwnAccountSourceLinksError } from '../errors.js';
import type { AccountSourceLinkRepository } from '../ports/account-source-link-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface ListOwnAccountSourceLinksInput {
  /** Absent means every link the subject owns. */
  readonly accountId?: string;
}

export class ListOwnAccountSourceLinks {
  constructor(private readonly links: AccountSourceLinkRepository) {}

  async execute(
    input: ListOwnAccountSourceLinksInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<readonly AccountSourceLinkView[], ListOwnAccountSourceLinksError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      const found =
        input.accountId === undefined
          ? await this.links.listOwn(principal.value)
          : await this.links.listOwnForAccount(
              principal.value,
              CanonicalAccountRef.of(input.accountId),
            );
      return Result.ok(found.map(toAccountSourceLinkView));
    } catch (error) {
      return Result.err(storeFailure('own account source link listing', error));
    }
  }
}
