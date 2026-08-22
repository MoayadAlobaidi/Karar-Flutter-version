/**
 * ReadOwnAccount — one account, if it is the caller's.
 *
 * The input is an account id and nothing else. A guessed id, another user's
 * account inside the same tenant, and another tenant's account all produce
 * the SAME `account_not_found` — the shared constant in `../errors.js`, so no
 * arm can drift into an oracle that tells a guesser their guess was real.
 */

import { Result } from '@karar/shared-kernel';

import type { FinancialAccount } from '../../domain/financial-account.js';
import type { FinancialAccountId } from '../../domain/refs.js';
import { ACCOUNT_NOT_FOUND, storeFailure, type ReadOwnAccountError } from '../errors.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/** Deliberately carries no owner identifier — the principal is context. */
export interface ReadOwnAccountInput {
  readonly accountId: FinancialAccountId;
}

export class ReadOwnAccount {
  constructor(private readonly accounts: FinancialAccountRepository) {}

  async execute(
    input: ReadOwnAccountInput,
    actor: AccountsPrincipal,
  ): Promise<Result<FinancialAccount, ReadOwnAccountError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;
    try {
      const account = await this.accounts.findOwnById(principal.value, input.accountId);
      if (account === null) return Result.err(ACCOUNT_NOT_FOUND);
      return Result.ok(account);
    } catch (error) {
      return Result.err(storeFailure('own-account read', error));
    }
  }
}
