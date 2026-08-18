/**
 * ListOwnAccounts — the acting principal lists THEIR OWN accounts.
 *
 * There is no input type at all, and that is the point: the only question
 * this use case can be asked is "what do I have?". Whose accounts these are
 * comes from the principal context, and the RLS policy on
 * `public.financial_accounts` (migration 0088) is what makes the answer true
 * even if a future repository forgets its filter.
 *
 * The AZ2 lesson applies to the tests that cover this: the adversarial suite
 * asserts the legitimate owner's list comes back NON-EMPTY first, then
 * asserts every other principal sees nothing. An isolation test over an empty
 * table proves only that the table is empty.
 */

import { Result } from '@karar/shared-kernel';

import type { FinancialAccount } from '../../domain/financial-account.js';
import { storeFailure, type ListOwnAccountsError } from '../errors.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

export class ListOwnAccounts {
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async execute(
    actor: AccountsPrincipal,
  ): Promise<Result<readonly FinancialAccount[], ListOwnAccountsError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      return Result.ok(await this.accounts.listOwn(principal.value));
    } catch (error) {
      return Result.err(storeFailure('own-account listing', error));
    }
  }
}
