/**
 * The four read-only views over the caller's own financial data: the balances
 * a source reported for an account, which sources feed it, what spends from
 * it, and how their data arrives at all.
 *
 * READ-ONLY, AND THAT IS STRUCTURAL RATHER THAN INCIDENTAL. There is no write
 * verb in this file and no use case in reach that could perform one: the
 * composition root does not hand this surface `RecordReportedBalance`,
 * `CreateManualConnection`, any payment-instrument write, or
 * `EraseAccountSourceLinks`. A route cannot be added here without first
 * adding the use case to the bundle, which is the review point.
 *
 * NONE OF THESE ROUTES 404s. All four are LISTS scoped to one of the caller's
 * own accounts, and an account that is not the caller's produces an empty
 * page — the same answer an account with no balances, no links or no
 * instruments produces. Telling those apart would make every one of them an
 * existence oracle over other people's accounts.
 *
 * WHAT NEVER LEAVES HERE. The source link's external account reference and
 * its keyed fingerprint are not in the module's read view at all, so this
 * file has no access to either; the instrument carries no balance, amount or
 * limit, because none exists; and no status on any of these rows may be
 * rendered as a live institution link — every row says so in its own `link`
 * block.
 */

import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from '@nestjs/common';

import { FinancialCapabilityGuard } from './capability.guard.js';
import { balanceSnapshotWire } from './dto/accounts.js';
import { accountSourceLinkWire, connectionSummaryWire } from './dto/connections.js';
import { paymentInstrumentWire } from './dto/instruments.js';
import { offsetPage, readPageRequest, type PageRequest } from './paging.js';
import { invalidCursorProblem, invalidLimitProblem, invalidRequestProblem } from './problems.js';
import { problemForAccountsError } from './problems-accounts.js';
import { problemForConnectionsError, problemForInstrumentsError } from './problems-views.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { isUuid, queryValue } from './request-input.js';
import { FINANCIAL_USE_CASES, MANUAL_ENTRY_LIMITS, type FinancialUseCases } from './use-cases.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

/** Page bounds from the CENTRAL registry; nothing here writes a number. */
const PAGE_BOUNDS = MANUAL_ENTRY_LIMITS;

/** A query value as the module page queries take it: the word, or nothing. */
function narrowing(value: string | undefined): string | null {
  return value ?? null;
}

@UseGuards(FinancialCapabilityGuard)
@Controller('financial')
export class FinancialViewsController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
  ) {}

  private paging(query: unknown): PageRequest {
    const page = readPageRequest(query, PAGE_BOUNDS);
    if (page === 'INVALID_LIMIT') refuse(invalidLimitProblem());
    if (page === 'INVALID_CURSOR') refuse(invalidCursorProblem());
    return page;
  }

  private accountId(raw: string): string {
    if (!isUuid(raw)) refuse(invalidRequestProblem('accountId', 'is not a reference'));
    return raw;
  }

  @Get('accounts/:accountId/balances')
  async balances(
    @Req() request: unknown,
    @Param('accountId') accountId: string,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.accountId(accountId);
    const page = this.paging(query);
    const balanceKind = queryValue(query, 'balanceKind');
    const sourceKind = queryValue(query, 'sourceKind');

    // This one DOES 404: the balances of an account are addressed through the
    // account, and the use case answers `account_not_found` for an id that is
    // not the caller's — the same answer an unknown id gets.
    const result = await this.useCases.listOwnBalanceSnapshots.execute(
      {
        accountId: id as never,
        balanceKind: narrowing(balanceKind),
        sourceKind: narrowing(sourceKind),
        offset: page.offset,
        limit: page.limit,
      },
      principal,
    );
    if (!result.ok) refuse(problemForAccountsError(result.error));

    const items = result.value.snapshots.map(balanceSnapshotWire);
    const cut = offsetPage(items, page, result.value.hasMore);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }

  @Get('accounts/:accountId/source-links')
  async sourceLinks(
    @Req() request: unknown,
    @Param('accountId') accountId: string,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.accountId(accountId);
    const page = this.paging(query);
    const rail = queryValue(query, 'rail');
    const status = queryValue(query, 'status');

    const result = await this.useCases.listOwnAccountSourceLinks.execute(
      {
        accountId: id,
        rail: narrowing(rail),
        status: narrowing(status),
        offset: page.offset,
        limit: page.limit,
      },
      principal,
    );
    if (!result.ok) refuse(problemForConnectionsError(result.error));

    const items = result.value.items.map(accountSourceLinkWire);
    const cut = offsetPage(items, page, result.value.hasMore);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }

  @Get('accounts/:accountId/payment-instruments')
  async paymentInstruments(
    @Req() request: unknown,
    @Param('accountId') accountId: string,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.accountId(accountId);
    const page = this.paging(query);
    const instrumentType = queryValue(query, 'instrumentType');
    const status = queryValue(query, 'status');
    const spendable = queryValue(query, 'spendable');
    if (spendable !== undefined && spendable !== 'true' && spendable !== 'false') {
      refuse(invalidRequestProblem('spendable', "must be 'true' or 'false'"));
    }

    const result = await this.useCases.listOwnPaymentInstruments.execute(
      {
        accountId: id,
        instrumentType: narrowing(instrumentType),
        status: narrowing(status),
        // Answered by the module's own spendability predicate, not by a
        // status list this file would have to keep in step with it.
        spendable: spendable === undefined ? null : spendable === 'true',
        offset: page.offset,
        limit: page.limit,
      },
      principal,
    );
    if (!result.ok) refuse(problemForInstrumentsError(result.error));

    const items = result.value.instruments.map(paymentInstrumentWire);
    const cut = offsetPage(items, page, result.value.hasMore);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }

  @Get('connections')
  async connections(
    @Req() request: unknown,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const page = this.paging(query);
    const rail = queryValue(query, 'rail');
    const status = queryValue(query, 'status');
    const institutionId = queryValue(query, 'institutionId');
    if (institutionId !== undefined && !isUuid(institutionId)) {
      refuse(invalidRequestProblem('institutionId', 'is not a reference'));
    }
    const result = await this.useCases.listOwnConnections.execute(
      {
        rail: narrowing(rail),
        status: narrowing(status),
        institutionId: narrowing(institutionId),
        offset: page.offset,
        limit: page.limit,
      },
      principal,
    );
    if (!result.ok) refuse(problemForConnectionsError(result.error));

    const items = result.value.connections.map(connectionSummaryWire);
    const cut = offsetPage(items, page, result.value.hasMore);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }
}
