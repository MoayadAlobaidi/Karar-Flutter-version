/**
 * The caller's own transactions: list, record by hand, read, correct, delete.
 *
 * THE PRINCIPAL IS AMBIENT FOR THIS MODULE, AND THAT IS WHY EVERY CALL IS
 * WRAPPED. The transactions module reads its principal through a
 * `PrincipalContextPort` rather than taking it as an argument, precisely so
 * that no input type can ever carry a `userId`. The obligation that moves to
 * this layer is establishing the ambient value for exactly the duration of
 * one call, which `withPrincipal` does over an `AsyncLocalStorage`. A field
 * set before an `await` and read after it would be correct only until two
 * requests overlap — see transactions-principal-context.ts.
 *
 * PAGINATION IS THE MODULE'S OWN. `ListOwnTransactions` returns a KEYSET
 * cursor over `(bookingDate DESC, id DESC)`; this surface passes it through
 * untouched rather than re-encoding it, because two decoders eventually
 * disagree about where a page ends. Filters the module does not implement are
 * applied to the page it returned — which is honest, and is why the page
 * envelope reports what was actually returned rather than a count nobody
 * computed.
 *
 * A DELETE CAN BE PARTIAL, AND SAYS SO. The transaction and the transfer
 * matches naming it live in different modules behind separate ports and are
 * not one unit of work. A partial application answers 200 with an outcome saying so, and the count that
 * was really erased; rounding it to 200 would tell a person their data is
 * gone when some of it is not.
 */

import {
  Body,
  Controller,
  Delete,
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

import { FinancialCapabilityGuard } from './capability.guard.js';
import { FinancialRateLimitGuard } from './rate-limit.guard.js';
import { transactionWire, type TransactionWire } from './dto/transactions.js';
import { ownTransactionViewWire } from './dto/transaction-view.js';
import { keysetPage, readCursor, readLimit } from './paging.js';
import { invalidCursorProblem, invalidLimitProblem, invalidRequestProblem } from './problems.js';
import { problemForTransactionsError } from './problems-transactions.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { isUuid, queryValue } from './request-input.js';
import { readCorrectionInput, readCreateTransactionInput } from './transaction-input.js';
import { readTransactionFilters } from './transaction-filters.js';
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
 * The bounds this ingestion path is held to, from the CENTRAL registry
 * (packages/platform/src/ingestion/limits.ts). Manual entry is one record at
 * a time, and its page bounds come from the same declared policy. Nothing
 * here restates a number.
 */
const LIMITS = INGESTION_LIMIT_POLICIES.manualTransaction;

@UseGuards(FinancialCapabilityGuard, FinancialRateLimitGuard)
@Controller('financial/transactions')
export class FinancialTransactionsController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
    @Inject(TRANSACTIONS_PRINCIPAL_CONTEXT) private readonly scope: TransactionsPrincipalScope,
  ) {}

  private transactionId(raw: string): string {
    if (!isUuid(raw)) refuse(invalidRequestProblem('transactionId', 'is not a reference'));
    return raw;
  }

  @Get()
  async list(
    @Req() request: unknown,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const limit = readLimit(queryValue(query, 'limit'), LIMITS);
    if (typeof limit !== 'number') refuse(invalidLimitProblem());
    const cursor = readCursor(queryValue(query, 'cursor'));
    if (typeof cursor !== 'string' && cursor !== null) refuse(invalidCursorProblem());
    const accountId = queryValue(query, 'accountId');
    if (accountId !== undefined && !isUuid(accountId)) {
      refuse(invalidRequestProblem('accountId', 'is not a reference'));
    }
    const filters = readTransactionFilters(query);
    if ('field' in filters) refuse(invalidRequestProblem(filters.field, filters.why));

    const result = await this.scope.withPrincipal(principal, () =>
      this.useCases.listOwnTransactions.execute({
        ...(accountId === undefined ? {} : { accountId }),
        ...(cursor === null ? {} : { cursor }),
        limit,
      }),
    );
    if (!result.ok) refuse(problemForTransactionsError(result.error));

    const items: TransactionWire[] = result.value.transactions
      .map(transactionWire)
      .filter((row) => filters.matches(row));
    reply.status(200).send(keysetPage(items, limit, result.value.nextCursor));
  }

  @Post()
  async create(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const input = readCreateTransactionInput(body);
    if ('field' in input) refuse(invalidRequestProblem(input.field, input.why));

    const result = await this.scope.withPrincipal(principal, () =>
      this.useCases.createManualTransaction.execute(input.value),
    );
    if (!result.ok) refuse(problemForTransactionsError(result.error));
    reply.status(201).send(transactionWire(result.value));
  }

  @Get(':transactionId')
  async read(
    @Req() request: unknown,
    @Param('transactionId') transactionId: string,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.transactionId(transactionId);

    const result = await this.scope.withPrincipal(principal, () =>
      this.useCases.readOwnTransaction.execute({ transactionId: id }),
    );
    if (!result.ok) refuse(problemForTransactionsError(result.error));
    reply.status(200).send(ownTransactionViewWire(result.value));
  }

  @Patch(':transactionId')
  async correct(
    @Req() request: unknown,
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.transactionId(transactionId);
    const input = readCorrectionInput(id, body);
    if ('field' in input) refuse(invalidRequestProblem(input.field, input.why));

    const result = await this.scope.withPrincipal(principal, () =>
      this.useCases.updateOwnTransaction.execute(input.value),
    );
    if (!result.ok) refuse(problemForTransactionsError(result.error));
    reply.status(200).send(transactionWire(result.value));
  }

  @Delete(':transactionId')
  async remove(
    @Req() request: unknown,
    @Param('transactionId') transactionId: string,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.transactionId(transactionId);

    const result = await this.scope.withPrincipal(principal, () =>
      this.useCases.deleteOwnTransaction.execute({ transactionId: id }),
    );
    if (result.ok) {
      reply.status(200).send({
        transactionId: result.value.transactionId,
        outcome: 'DELETED',
        transferMatchesDeleted: result.value.transferMatchesDeleted,
      });
      return;
    }
    // The two partial-application arms are neither a failure nor a success.
    // They answer 200 with a body that SAYS so, rather than a second status
    // code: a client that ignores 207 and one that ignores 200 behave
    // identically, so the outcome has to be data the caller must read. The
    // count is what was really erased and is never rounded up to what was
    // intended.
    if (
      result.error.kind === 'TRANSFER_MATCH_ERASURE_INCOMPLETE' ||
      result.error.kind === 'DELETION_PARTIALLY_APPLIED'
    ) {
      reply.status(200).send({
        transactionId: id,
        outcome: 'PARTIALLY_APPLIED',
        transferMatchesDeleted: result.error.transferMatchesDeleted,
        code: result.error.kind,
      });
      return;
    }
    refuse(problemForTransactionsError(result.error));
  }
}
