/**
 * The statement import as a record: create the draft, read where it is, page
 * through what the parse found, erase it.
 *
 * THE RETENTION DECISION IS RESOLVED AT CREATION, before a single durable
 * source byte can exist. An environment with no approved decision is refused
 * (422) rather than allowed to write and decide later, because "we will
 * decide the retention period once the data is in" is how data acquires a
 * period nobody chose.
 *
 * THE PREVIEW RETURNS NO ROW CONTENT. Counts, reconciliation status, and row
 * ERRORS — a 1-based data row number, one field from a closed safe
 * vocabulary, one reason code. No cell, no amount, no merchant, no balance,
 * no fingerprint. A person deciding whether to commit needs to know how many
 * rows are valid and which failed and why; none of that requires the file's
 * contents to be echoed back to them over HTTP.
 *
 * THE TRUNCATION IS VISIBLE. The underlying report is bounded by the central
 * policy's `maxReportedErrors`, and both `reportedErrorCount` and
 * `totalErrorCount` travel: collapsing them would turn a truncated report
 * into a complete-looking one.
 *
 * ERASURE DOES NOT REACH COMMITTED TRANSACTIONS. They are ordinary financial
 * records of the subject's, with their own deletion path. Removing them as a
 * side effect of tidying an import would delete data the person never asked
 * to lose.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import { StatementImportRuleError } from '@karar/statement-imports';

import {
  statementImportPreviewWire,
  statementImportStatusWire,
  statementImportWire,
} from './dto/imports.js';
import { hasStoredSource, importAwaitsDecision } from './import-state.js';
import { pageOf, readPageRequest } from './paging.js';
import {
  codedProblem,
  invalidCursorProblem,
  invalidLimitProblem,
  invalidRequestProblem,
} from './problems.js';
import { problemForImportsError } from './problems-imports.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { bodyOf, isUuid } from './request-input.js';
import { FINANCIAL_USE_CASES, type FinancialUseCases } from './use-cases.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

/**
 * Every bound this path obeys, from the CENTRAL registry
 * (packages/platform/src/ingestion/limits.ts): the reported-error ceiling the
 * preview is built under, and the page bounds it is read through. None of
 * them is a request field — a caller cannot raise the ceiling it is being
 * held to — and nothing here restates a number.
 */
const LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

@Controller('financial/statement-imports')
export class StatementImportsController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
  ) {}

  private importId(raw: string): string {
    if (!isUuid(raw)) refuse(invalidRequestProblem('importId', 'is not a reference'));
    return raw;
  }

  @Post()
  async create(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const source = bodyOf(body);
    const accountId = source['accountId'];
    if (!isUuid(accountId)) refuse(invalidRequestProblem('accountId', 'is not a reference'));
    const connectionId = source['connectionId'] ?? null;
    if (connectionId !== null && !isUuid(connectionId)) {
      refuse(invalidRequestProblem('connectionId', 'is not a reference'));
    }

    const result = await this.useCases.startStatementImport.execute(
      { accountId, connectionId: connectionId as string | null },
      principal,
    );
    if (!result.ok) refuse(problemForImportsError(result.error));
    reply
      .status(201)
      .send(
        statementImportWire(
          result.value,
          hasStoredSource(result.value),
          importAwaitsDecision(result.value),
        ),
      );
  }

  @Get(':importId')
  async read(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.importId(importId);
    // The module exposes exactly ONE read for a single import, and this is
    // it. The status shape is that read minus its row errors — deliberately
    // not the full import row, because no use case answers with one, and
    // reaching past the module for a repository call would be the first
    // deep import into it.
    const result = await this.useCases.previewStatementImport.execute(
      { importId: id, limits: LIMITS },
      principal,
    );
    if (!result.ok) refuse(problemForImportsError(result.error));
    reply.status(200).send(statementImportStatusWire(result.value));
  }

  @Get(':importId/preview')
  async preview(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Query() query: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.importId(importId);
    const page = readPageRequest(query, LIMITS);
    if (page === 'INVALID_LIMIT') refuse(invalidLimitProblem());
    if (page === 'INVALID_CURSOR') refuse(invalidCursorProblem());

    const result = await this.useCases.previewStatementImport.execute(
      { importId: id, limits: LIMITS },
      principal,
    );
    if (!result.ok) refuse(problemForImportsError(result.error));

    // The page is cut from the BOUNDED report, and both counts travel with
    // it, so a client can tell a full report from a truncated one.
    const cut = pageOf(result.value.rowErrors, page);
    reply
      .status(200)
      .send({ ...statementImportPreviewWire(result.value, cut.items), page: cut.page });
  }

  @Delete(':importId')
  async erase(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.importId(importId);

    let result;
    try {
      result = await this.useCases.eraseStatementImport.execute({ importId: id }, principal);
    } catch (error) {
      // A domain rule the use case does not convert into an error arm: an
      // import that produced canonical transactions cannot move to ERASED
      // while it still reports them, and the module THROWS rather than
      // returning. Answering 409 is the truthful translation — the import is
      // in a state this step is not legal from — and it is deliberately not
      // swallowed into a 200, which would tell a person their statement is
      // gone when nothing was erased. The module-level inconsistency (its own
      // header says erasure is legal from every state but COMMITTING and
      // ERASED) is reported to the module's owner rather than patched here.
      if (!(error instanceof StatementImportRuleError)) throw error;
      refuse(
        codedProblem(
          409,
          'Import not in the expected state',
          'IMPORT_NOT_IN_EXPECTED_STATE',
          'an import that produced transactions cannot be erased while it still reports them',
        ),
      );
    }
    if (!result.ok) refuse(problemForImportsError(result.error));
    reply.status(200).send({
      importId: result.value.importId,
      storedObjectDeleted: result.value.storedObjectDeleted,
      rowsDeleted: result.value.rowsDeleted,
    });
  }
}
