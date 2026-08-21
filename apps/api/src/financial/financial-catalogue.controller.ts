/**
 * The two reviewed catalogues: issuers and categories.
 *
 * BOTH ARE REFERENCE DATA WITH NO PRINCIPAL SCOPE. Neither table carries a
 * tenant, a user or a subject column; every principal reads the same rows.
 * Authentication is still required, because the whole financial surface is
 * authenticated and an unauthenticated reader has no business enumerating the
 * issuers this platform recognises.
 *
 * NEITHER HAS A WRITE PATH, HERE OR ANYWHERE. Both catalogues change by
 * reviewed migration, and `karar_app` holds SELECT and nothing else on them. A
 * runtime writer would be the first step toward one subject's typed bank name
 * becoming global reference data.
 *
 * MARKET PRESENCE IS ABSENT ON PURPOSE. `institution_markets` exists
 * (migration 0094) and the accounts module declares no reader for it, so
 * there is nothing this controller could call; an operation answering from
 * nothing would be a false claim about what the platform knows.
 */

import { Controller, Get, Inject, Query, Req, Res, UseGuards } from '@nestjs/common';

import type { Institution } from '@karar/financial-accounts';
import { isAssignable } from '@karar/transactions';
import type { FinancialCategory } from '@karar/transactions';

import { FinancialCapabilityGuard } from './capability.guard.js';
import { FinancialRateLimitGuard } from './rate-limit.guard.js';
import { categoryWire, type CategoryWire } from './dto/transactions.js';
import { institutionWire, type InstitutionWire } from './dto/accounts.js';
import { pageOf, readPageRequest, type Page } from './paging.js';
import {
  invalidCursorProblem,
  invalidLimitProblem,
  invalidRequestProblem,
  storeUnavailableProblem,
} from './problems.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { booleanQueryValue, enumQueryValue } from './request-input.js';
import {
  FINANCIAL_CLOCK,
  FINANCIAL_USE_CASES,
  MANUAL_ENTRY_LIMITS,
  type FinancialUseCases,
} from './use-cases.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

/**
 * The page bounds these reads are held to, taken from the CENTRAL policy. A
 * catalogue read is not itself an ingestion path, but it is a read on a
 * surface whose bounds are declared in one registry, and writing a number
 * here is exactly what that registry exists to prevent.
 */
const PAGE_BOUNDS = MANUAL_ENTRY_LIMITS;

const INSTITUTION_KINDS = [
  'BANK',
  'E_MONEY_ISSUER',
  'MOBILE_MONEY_OPERATOR',
  'TELCO_FINANCIAL_SERVICES',
  'PAYMENT_INSTITUTION',
  'FINTECH_WALLET',
  'CARD_ISSUER',
  'EXCHANGE_HOUSE',
  'OTHER',
] as const;

@UseGuards(FinancialCapabilityGuard, FinancialRateLimitGuard)
@Controller('financial')
export class FinancialCatalogueController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
    @Inject(FINANCIAL_CLOCK) private readonly clock: { now(): Date },
  ) {}

  @Get('institutions')
  async listInstitutions(
    @Req() request: unknown,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    requirePrincipal(this.principals, request);
    const page = readPageRequest(query, PAGE_BOUNDS);
    if (page === 'INVALID_LIMIT') refuse(invalidLimitProblem());
    if (page === 'INVALID_CURSOR') refuse(invalidCursorProblem());
    const kind = enumQueryValue(query, 'kind', INSTITUTION_KINDS);
    if (kind === 'INVALID') refuse(invalidRequestProblem('kind', 'is not a known issuer kind'));

    let all: readonly Institution[];
    try {
      all = await this.useCases.institutions.listSelectable();
    } catch {
      // The catalogue read is the one call here; a failure is a dependency
      // fault, and its own text never crosses the boundary.
      refuse(storeUnavailableProblem());
    }
    const filtered = kind === undefined ? all : all.filter((entry) => entry.kind === kind);
    const cut: Page<InstitutionWire> = pageOf(filtered.map(institutionWire), page);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }

  @Get('categories')
  async listCategories(
    @Req() request: unknown,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    requirePrincipal(this.principals, request);
    const page = readPageRequest(query, PAGE_BOUNDS);
    if (page === 'INVALID_LIMIT') refuse(invalidLimitProblem());
    if (page === 'INVALID_CURSOR') refuse(invalidCursorProblem());
    const assignableOnly = booleanQueryValue(query, 'assignable');
    if (assignableOnly === 'INVALID') {
      refuse(invalidRequestProblem('assignable', "must be 'true' or 'false'"));
    }

    let all: readonly FinancialCategory[];
    try {
      all = await this.useCases.categories.list();
    } catch {
      refuse(storeUnavailableProblem());
    }
    const now = this.clock.now();
    // `assignable` is computed with the module's own predicate, so a client
    // never has to derive "may I choose this?" from a retirement timestamp it
    // might compare in the wrong timezone.
    const rows = all.map((category) => categoryWire(category, isAssignable(category, now)));
    const filtered =
      assignableOnly === undefined ? rows : rows.filter((row) => row.assignable === assignableOnly);
    const cut: Page<CategoryWire> = pageOf(filtered, page);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }
}
