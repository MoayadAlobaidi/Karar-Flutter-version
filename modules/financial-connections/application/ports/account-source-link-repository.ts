/**
 * `AccountSourceLinkRepository` — persistence for `account_source_links`,
 * declared inward and implemented over Prisma in
 * `infrastructure/persistence`.
 *
 * ## The one lookup that carries the whole design
 *
 * `findOwnByFingerprint` is what makes an exact external-reference match
 * possible, and its scope is exactly the scope the fingerprint is defined
 * over: **this principal, across every connection they hold**. That is the
 * mechanism by which an account created from a CSV import later receives API
 * data without becoming a second account — the new connection reports the
 * same source account, the fingerprint matches a link that already exists,
 * and the new link resolves to the account the old one resolves to.
 *
 * It deliberately returns every matching link rather than one. A subject may
 * legitimately hold several links to one source account — one per connection
 * — and a method that returned "the" match would have to choose, which is a
 * decision belonging to the use case rather than to a query.
 *
 * ## What no method here can express
 *
 * There is no lookup by external reference plaintext (the caller never has
 * it in a form the store could match), no lookup across subjects, and no way
 * to read a fingerprint out for any purpose other than passing it back in.
 * The repository returns entities; every read PATH in this module converts
 * them to `AccountSourceLinkView`, which carries neither the reference nor
 * the fingerprint.
 */

import type {
  AccountSourceLink,
  SourceAccountFingerprint,
} from '../../domain/account-source-link.js';
import type {
  AccountSourceLinkId,
  CanonicalAccountRef,
  FinancialConnectionId,
} from '../../domain/refs.js';
import type { ConnectionsPrincipal } from '../principal.js';

/** What an optimistic update did. `stale` means someone else moved first. */
export type SourceLinkUpdateOutcome =
  | { readonly kind: 'updated'; readonly link: AccountSourceLink }
  | { readonly kind: 'stale' }
  | { readonly kind: 'not_found' };

/**
 * What creating a link did.
 *
 * `duplicate` is the unique constraint firing under concurrency: two writers
 * raced to link the same source account through the same connection and
 * exactly one won. It is a normal outcome of a re-import, not an error — the
 * loser reads the winner's row and carries on.
 *
 * `conflicting_account` is the cross-connection guard firing: this source
 * account already resolves to a DIFFERENT account for this subject. That one
 * is never normal, and it carries the account it already resolves to so the
 * caller can say which.
 */
export type SourceLinkCreateOutcome =
  | { readonly kind: 'created'; readonly link: AccountSourceLink }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'conflicting_account'; readonly linkedAccountId: string };

/**
 * What one page of the principal's own source links asks for.
 *
 * **The bound and the narrowing travel together into the store.** This table
 * grows with every connection a person adds and every account each connection
 * reports, so "every link the principal owns" is a read whose size nothing in
 * the schema limits. Filtering after the read would leave that read unbounded
 * and would make the offset a cursor carries count rows in the unfiltered set
 * — a different set from the one the caller is walking.
 *
 * `null` on any filter means "do not narrow on this". A rail or a status
 * outside the vocabulary matches nothing rather than widening the answer.
 */
export interface AccountSourceLinkPageQuery {
  /** Narrow to the links feeding one account; `null` reads every link. */
  readonly accountRef: CanonicalAccountRef | null;
  /** Narrow to the links one connection feeds; `null` reads every connection. */
  readonly connectionId: FinancialConnectionId | null;
  /** Narrow to one rail; `null` reads every rail. */
  readonly rail: string | null;
  /** Narrow to one source status; `null` reads every status. */
  readonly status: string | null;
  /** How many rows the caller's cursor has already consumed. */
  readonly offset: number;
  /** How many rows to return. */
  readonly limit: number;
}

/**
 * One page, and whether another exists.
 *
 * `hasMore` comes from one extra row rather than from a COUNT: the caller's
 * only question is whether to ask again, and a count is a second pass over
 * the rows the page bound exists to avoid reading.
 */
export interface AccountSourceLinkPage {
  readonly links: readonly AccountSourceLink[];
  readonly hasMore: boolean;
}

export interface AccountSourceLinkRepository {
  /**
   * One page of the principal's own links, strongest priority first, `id`
   * breaking ties so the order is TOTAL. Two links written at the same
   * instant at the same priority are otherwise interchangeable, and a page
   * boundary falling between two interchangeable rows drops one and repeats
   * the other for whoever walks the cursor.
   */
  pageOwn(
    actor: ConnectionsPrincipal,
    query: AccountSourceLinkPageQuery,
  ): Promise<AccountSourceLinkPage>;

  findOwnById(
    actor: ConnectionsPrincipal,
    id: AccountSourceLinkId,
  ): Promise<AccountSourceLink | null>;

  /**
   * Every link this principal holds for one source account, across ALL their
   * connections — see the header for why the scope is the principal and not
   * the connection.
   */
  findOwnByFingerprint(
    actor: ConnectionsPrincipal,
    fingerprint: SourceAccountFingerprint,
  ): Promise<readonly AccountSourceLink[]>;

  create(
    actor: ConnectionsPrincipal,
    link: AccountSourceLink,
  ): Promise<SourceLinkCreateOutcome>;

  update(
    actor: ConnectionsPrincipal,
    expectedVersion: number,
    next: AccountSourceLink,
  ): Promise<SourceLinkUpdateOutcome>;

  /**
   * Remove every link feeding one of the principal's own accounts, returning
   * the exact number removed.
   *
   * **Idempotent by contract.** Called twice, the second call finds nothing
   * and answers zero. That is what lets an account erasure retry after a
   * partial failure and converge, without this module and the accounts module
   * needing to share a transaction — which they cannot, because no unit of
   * work crosses an application port.
   */
  eraseForAccount(
    actor: ConnectionsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<number>;
}
