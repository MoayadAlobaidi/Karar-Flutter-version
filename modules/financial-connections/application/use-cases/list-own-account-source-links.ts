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
 *
 * **The answer is a PAGE, and the store cuts it.** This table grows with
 * every connection a person adds and every account each one reports, so
 * "every link the subject owns" has no ceiling; reading it whole and trimming
 * afterwards would bound the response while leaving the read — and the
 * decryption of every row's protected field — unbounded. The narrowing goes
 * down with the bound for the same reason: an offset counted in the
 * unfiltered set names a position in a set the caller is not walking.
 */

import { Result } from '@karar/shared-kernel';

import {
  toAccountSourceLinkView,
  type AccountSourceLinkView,
} from '../../domain/account-source-link.js';
import { CanonicalAccountRef, FinancialConnectionId } from '../../domain/refs.js';
import { storeFailure, type ListOwnAccountSourceLinksError } from '../errors.js';
import type { AccountSourceLinkRepository } from '../ports/account-source-link-repository.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface ListOwnAccountSourceLinksInput {
  /** Absent means every link the subject owns. */
  readonly accountId?: string;
  /** Narrow to the links one connection feeds; `null` reads every connection. */
  readonly connectionId: string | null;
  /** Narrow to one rail; `null` reads every rail. */
  readonly rail: string | null;
  /** Narrow to one source status; `null` reads every status. */
  readonly status: string | null;
  /** How many rows the caller's cursor has already consumed. */
  readonly offset: number;
  /** How many rows to return. */
  readonly limit: number;
}

/** One page of views, and whether another page exists. */
export interface ListOwnAccountSourceLinksPage {
  readonly items: readonly AccountSourceLinkView[];
  readonly hasMore: boolean;
}

export class ListOwnAccountSourceLinks {
  constructor(private readonly links: AccountSourceLinkRepository) {}

  async execute(
    input: ListOwnAccountSourceLinksInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<ListOwnAccountSourceLinksPage, ListOwnAccountSourceLinksError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      const page = await this.links.pageOwn(principal.value, {
        accountRef:
          input.accountId === undefined ? null : CanonicalAccountRef.of(input.accountId),
        connectionId:
          input.connectionId === null ? null : FinancialConnectionId.of(input.connectionId),
        rail: input.rail,
        status: input.status,
        offset: input.offset,
        limit: input.limit,
      });
      return Result.ok({
        items: page.links.map(toAccountSourceLinkView),
        hasMore: page.hasMore,
      });
    } catch (error) {
      return Result.err(storeFailure('own account source link listing', error));
    }
  }
}
