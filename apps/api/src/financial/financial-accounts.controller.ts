/**
 * The caller's own accounts and wallets: list, create by hand, read, update.
 *
 * THERE IS NO DELETE ROUTE, AND ITS ABSENCE IS THE DECISION. Deleting an
 * account cascades across three other modules through separate ports —
 * source links, payment instruments, financial records — and those erasures
 * are not one unit of work. A partial outcome is a real answer, the contract
 * for reporting it has not been chosen, and the composition root deliberately
 * does not even hold the use case (see use-cases.ts). A 200 that might mean
 * "some of it" would tell a person their data is gone while cards still spend
 * from the account.
 *
 * `origin` IS NOT A REQUEST FIELD. A manual account is MANUAL because the use
 * case fixes it, not because the caller said so; an account of origin
 * EXTERNAL_PROVIDER is not constructible anywhere in this platform, and there
 * is no field here through which one could be asked for.
 *
 * ABSENT AND NULL ARE DIFFERENT REQUESTS on the update path, and the body is
 * read key by key to keep them apart: a field the caller omitted is left
 * alone, and a field the caller sent as `null` is cleared. Spreading
 * `undefined` into the input would silently turn the first into the second.
 *
 * Thin by design (architecture test 6): read the principal from the injected
 * source, read the declared inputs, call one use case, map the Result.
 */

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import type { FinancialAccount } from '@karar/financial-accounts';

import { FinancialCapabilityGuard } from './capability.guard.js';
import { financialAccountWire } from './dto/accounts.js';
import { InstitutionLookup } from './institution-lookup.js';
import { offsetPage, readPageRequest } from './paging.js';
import { invalidCursorProblem, invalidLimitProblem, invalidRequestProblem } from './problems.js';
import { problemForAccountsError } from './problems-accounts.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { isUuid } from './request-input.js';
import { readAccountFilters, readCreateInput, readUpdateInput } from './account-input.js';
import { FINANCIAL_USE_CASES, type FinancialUseCases } from './use-cases.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

/**
 * The bounds this path is held to, from the CENTRAL registry
 * (packages/platform/src/ingestion/limits.ts). Creating an account by hand is
 * the manual-entry ingestion path — one record, entered by a person — so it
 * is bounded by the same declared policy as a manually entered transaction,
 * and its list route takes its page bounds from the same place. Nothing here
 * restates a number.
 */
const LIMITS = INGESTION_LIMIT_POLICIES.manualTransaction;

@UseGuards(FinancialCapabilityGuard)
@Controller('financial/accounts')
export class FinancialAccountsController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
  ) {}

  /** Resolves the issuers a page of accounts names, once for the whole page. */
  private async serialize(accounts: readonly FinancialAccount[]): Promise<unknown[]> {
    const lookup = new InstitutionLookup(this.useCases.institutions);
    await lookup.resolve(accounts.map((account) => account.institutionRef));
    return accounts.map((account) =>
      financialAccountWire(account, lookup.get(account.institutionRef)),
    );
  }

  @Get()
  async list(
    @Req() request: unknown,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const page = readPageRequest(query, LIMITS);
    if (page === 'INVALID_LIMIT') refuse(invalidLimitProblem());
    if (page === 'INVALID_CURSOR') refuse(invalidCursorProblem());
    const filters = readAccountFilters(query);
    if ('field' in filters) refuse(invalidRequestProblem(filters.field, filters.why));

    // The narrowing and the page go DOWN to the store together. The store
    // answers with at most one page, so the issuer catalogue below is
    // resolved for a page rather than for every account the caller owns —
    // and the offset the cursor carries counts rows in the filtered set,
    // which is the set the caller is actually walking.
    const result = await this.useCases.listOwnAccounts.execute(
      { ...filters, offset: page.offset, limit: page.limit },
      principal,
    );
    if (!result.ok) refuse(problemForAccountsError(result.error));

    const cut = offsetPage(result.value.accounts, page, result.value.hasMore);
    const items = await this.serialize(cut.items);
    reply.status(200).send({ items, page: cut.page });
  }

  @Post()
  async create(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const input = readCreateInput(body);
    if ('field' in input) refuse(invalidRequestProblem(input.field, input.why));

    const result = await this.useCases.createManualAccount.execute(input.value, principal);
    if (!result.ok) refuse(problemForAccountsError(result.error));
    const [serialized] = await this.serialize([result.value]);
    reply.status(201).send(serialized);
  }

  @Get(':accountId')
  async read(
    @Req() request: unknown,
    @Param('accountId') accountId: string,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    // Validated here because the module's reference constructors THROW on a
    // malformed value; a mistyped path parameter must be a 400, not a 500.
    if (!isUuid(accountId)) refuse(invalidRequestProblem('accountId', 'is not a reference'));

    const result = await this.useCases.readOwnAccount.execute(
      { accountId: accountId as never },
      principal,
    );
    if (!result.ok) refuse(problemForAccountsError(result.error));
    const [serialized] = await this.serialize([result.value]);
    reply.status(200).send(serialized);
  }

  @Patch(':accountId')
  async update(
    @Req() request: unknown,
    @Param('accountId') accountId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    if (!isUuid(accountId)) refuse(invalidRequestProblem('accountId', 'is not a reference'));
    const input = readUpdateInput(accountId, body);
    if ('field' in input) refuse(invalidRequestProblem(input.field, input.why));

    const result = await this.useCases.updateOwnAccount.execute(input.value, principal);
    if (!result.ok) refuse(problemForAccountsError(result.error));
    const [serialized] = await this.serialize([result.value]);
    reply.status(200).send(serialized);
  }
}
