/**
 * ListOwnAccounts — the acting principal lists THEIR OWN accounts.
 *
 * The input names a WINDOW and the ways to narrow it, and nothing else. It
 * carries no owner: the only question this use case can be asked is "what do
 * I have?", whose accounts these are comes from the principal context, and
 * the RLS policy on `public.financial_accounts` (migration 0088) is what
 * makes the answer true even if a future repository forgets its filter.
 *
 * **The narrowing and the page are handed to the store together, and that
 * pairing is the point.** A filter applied after the read makes the offset a
 * cursor carries count rows in the unfiltered set — a different set from the
 * one the caller is walking — and it makes the cost of one request a function
 * of how many accounts a person holds rather than of how many they asked for.
 *
 * The AZ2 lesson applies to the tests that cover this: the adversarial suite
 * asserts the legitimate owner's list comes back NON-EMPTY first, then
 * asserts every other principal sees nothing. An isolation test over an empty
 * table proves only that the table is empty.
 */

import { Result } from '@karar/shared-kernel';

import { storeFailure, type ListOwnAccountsError } from '../errors.js';
import type {
  FinancialAccountPage,
  FinancialAccountPageQuery,
  FinancialAccountRepository,
} from '../ports/financial-account-repository.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/** The window and the narrowing. Deliberately carries no owner identifier. */
export type ListOwnAccountsInput = FinancialAccountPageQuery;

export class ListOwnAccounts {
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async execute(
    input: ListOwnAccountsInput,
    actor: AccountsPrincipal,
  ): Promise<Result<FinancialAccountPage, ListOwnAccountsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      return Result.ok(await this.accounts.pageOwn(principal.value, input));
    } catch (error) {
      return Result.err(storeFailure('own-account listing', error));
    }
  }
}
