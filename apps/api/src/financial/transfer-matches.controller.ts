/**
 * Transfer matches: what the platform suggested, and what the person decided.
 *
 * THERE IS NO SUGGEST ROUTE HERE, AND THAT IS THE DECISION. A suggestion is
 * produced by the platform from the subject's own transactions under the
 * equal-and-opposite rule; a client-driven "match these two" verb would let a
 * person assert a relationship that rule refuses, and its contract has not
 * been chosen. The composition root does not hand this surface
 * `SuggestTransferMatch`, so the route cannot appear without the review that
 * should precede it.
 *
 * REJECTION IS NOT DELETION, AND IT IS ALSO HOW A CONFIRMATION IS WITHDRAWN.
 * CONFIRMED -> REJECTED is a legal transition, so there is no separate
 * un-confirm verb pretending the decision never happened. The row is kept,
 * which is what stops the same pair being suggested again as though nobody
 * had ever looked at it.
 *
 * THE DECISION TIME COMES FROM THE SERVER'S CLOCK and is never accepted from
 * the caller: a client-supplied decision time is a client-supplied fact about
 * a person's intent.
 *
 * NO AMOUNT LEAVES THIS SURFACE. The match carries none — the figures live on
 * the two transactions it names — and the serializer has no field for one.
 */

import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import { MATCH_STATES } from '@karar/transfer-matching';
import type { MatchState } from '@karar/transfer-matching';

import { transferMatchWire } from './dto/matches.js';
import { pageOf, readPageRequest } from './paging.js';
import { invalidCursorProblem, invalidLimitProblem, invalidRequestProblem } from './problems.js';
import { problemForMatchingError } from './problems-matching.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { bodyOf, isUuid, queryValue } from './request-input.js';
import { FINANCIAL_USE_CASES, type FinancialUseCases } from './use-cases.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

/**
 * The page bounds this read is held to, from the CENTRAL registry
 * (packages/platform/src/ingestion/limits.ts). Confirming or rejecting a
 * match ingests nothing — the body is one integer — so the manual-entry
 * policy is what bounds this path, and nothing here restates a number.
 */
const LIMITS = INGESTION_LIMIT_POLICIES.manualTransaction;

@Controller('financial/transfer-matches')
export class TransferMatchesController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
  ) {}

  private matchId(raw: string): string {
    if (!isUuid(raw)) refuse(invalidRequestProblem('matchId', 'is not a reference'));
    return raw;
  }

  private expectedVersion(body: unknown): number {
    const value = bodyOf(body)['expectedVersion'];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      refuse(invalidRequestProblem('expectedVersion', 'is required and must be an integer'));
    }
    return value;
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
    const state = queryValue(query, 'state');
    if (state !== undefined && !(MATCH_STATES as readonly string[]).includes(state)) {
      refuse(invalidRequestProblem('state', 'is not a value this platform recognises'));
    }

    const result = await this.useCases.listOwnTransferMatches.execute(
      { state: (state ?? null) as MatchState | null },
      principal,
    );
    if (!result.ok) refuse(problemForMatchingError(result.error));

    const cut = pageOf(result.value.map(transferMatchWire), page);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }

  @Post(':matchId/confirmation')
  async confirm(
    @Req() request: unknown,
    @Param('matchId') matchId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.matchId(matchId);
    const expectedVersion = this.expectedVersion(body);

    const result = await this.useCases.confirmTransferMatch.execute(
      { matchId: id, expectedVersion },
      principal,
    );
    if (!result.ok) refuse(problemForMatchingError(result.error));
    reply.status(200).send(transferMatchWire(result.value));
  }

  @Post(':matchId/rejection')
  async reject(
    @Req() request: unknown,
    @Param('matchId') matchId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.matchId(matchId);
    const expectedVersion = this.expectedVersion(body);

    const result = await this.useCases.rejectTransferMatch.execute(
      { matchId: id, expectedVersion },
      principal,
    );
    if (!result.ok) refuse(problemForMatchingError(result.error));
    reply.status(200).send(transferMatchWire(result.value));
  }
}
