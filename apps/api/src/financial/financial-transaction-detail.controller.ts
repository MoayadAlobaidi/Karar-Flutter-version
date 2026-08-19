/**
 * Two things you can say about one of the caller's own transactions: what
 * category it belongs to, and where its values came from.
 *
 * THE CATEGORY ROUTE WRITES ONLY A PERSON'S OWN CHOICE. `assignmentSource` is
 * fixed to USER here and is not a request field: a RULE assignment is written
 * by the deterministic categoriser during an import, and a client claiming to
 * be one would put a label a machine invented onto a financial record while
 * the audit trail said a person chose it. There is no confidence, no score
 * and no suggestion, because none exists in this platform.
 *
 * THE PROVENANCE ROUTE IS THE ONE WITH THE SHARPEST OMISSIONS. It never
 * carries the dedup fingerprint (a per-subject keyed MAC — publishing it
 * makes this route a confirmation oracle over somebody's spending), the
 * occurrence ordinal, the import's row reference, any raw source cell or
 * header, or the acting actor reference. The serializer in dto/transactions.ts
 * is where those absences are made, and the contract closes the shape so a
 * field added later cannot slip through.
 */

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import type { AssignmentSource } from '@karar/transactions';

import { FinancialCapabilityGuard } from './capability.guard.js';
import { categoryAssignmentWire, provenanceWire } from './dto/transactions.js';
import { pageOf, readPageRequest } from './paging.js';
import { invalidCursorProblem, invalidLimitProblem, invalidRequestProblem } from './problems.js';
import { problemForTransactionsError } from './problems-transactions.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { bodyOf, isUuid } from './request-input.js';
import {
  TRANSACTIONS_PRINCIPAL_CONTEXT,
  type TransactionsPrincipalScope,
} from './transactions-principal-context.js';
import { FINANCIAL_USE_CASES, type FinancialUseCases } from './use-cases.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

/**
 * The bounds these paths are held to, from the CENTRAL registry
 * (packages/platform/src/ingestion/limits.ts): the field-byte bound for the
 * one text field the category route accepts, and the page bounds for the
 * provenance read. Nothing here restates a number.
 */
const LIMITS = INGESTION_LIMIT_POLICIES.manualTransaction;

/** A person's own choice. The only source this route can write. */
const USER_ASSIGNMENT: AssignmentSource = 'USER';

const CATEGORY_CODE = /^[A-Z][A-Z0-9_]{1,31}(\.[A-Z][A-Z0-9_]{1,31}){0,2}$/;

@UseGuards(FinancialCapabilityGuard)
@Controller('financial/transactions')
export class FinancialTransactionDetailController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
    @Inject(TRANSACTIONS_PRINCIPAL_CONTEXT) private readonly scope: TransactionsPrincipalScope,
  ) {}

  private transactionId(raw: string): string {
    if (!isUuid(raw)) refuse(invalidRequestProblem('transactionId', 'is not a reference'));
    return raw;
  }

  @Put(':transactionId/category')
  async assignCategory(
    @Req() request: unknown,
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.transactionId(transactionId);
    const source = bodyOf(body);
    const categoryCode = source['categoryCode'];
    if (typeof categoryCode !== 'string' || !CATEGORY_CODE.test(categoryCode)) {
      refuse(invalidRequestProblem('categoryCode', 'is not a catalogue code'));
    }
    if (Buffer.byteLength(categoryCode, 'utf8') > LIMITS.maxFieldBytes) {
      refuse(invalidRequestProblem('categoryCode', 'exceeds the declared field byte bound'));
    }

    const result = await this.scope.withPrincipal(principal, () =>
      this.useCases.assignCategory.execute({
        transactionId: id,
        categoryCode,
        // Fixed, never read from the body: a rule-sourced assignment is not
        // something a client may claim to be.
        assignmentSource: USER_ASSIGNMENT,
      }),
    );
    if (!result.ok) refuse(problemForTransactionsError(result.error));
    reply.status(200).send(categoryAssignmentWire(result.value));
  }

  @Get(':transactionId/provenance')
  async listProvenance(
    @Req() request: unknown,
    @Param('transactionId') transactionId: string,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.transactionId(transactionId);
    const page = readPageRequest(query, LIMITS);
    if (page === 'INVALID_LIMIT') refuse(invalidLimitProblem());
    if (page === 'INVALID_CURSOR') refuse(invalidCursorProblem());

    const result = await this.scope.withPrincipal(principal, () =>
      this.useCases.readOwnTransaction.execute({ transactionId: id }),
    );
    if (!result.ok) refuse(problemForTransactionsError(result.error));

    const cut = pageOf(result.value.provenance.map(provenanceWire), page);
    reply.status(200).send({ items: cut.items, page: cut.page });
  }
}
