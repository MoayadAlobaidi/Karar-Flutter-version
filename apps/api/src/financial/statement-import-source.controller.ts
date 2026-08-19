/**
 * The three steps that move a statement through the pipeline: upload the
 * bytes, parse them under a stated mapping, commit the reviewed result.
 *
 * THE BYTE BOUND IS ENFORCED HERE, TWICE, FROM THE CENTRAL POLICY.
 * `INGESTION_LIMIT_POLICIES.csvStatementImport.maxBytes` is checked against
 * the declared `Content-Length` BEFORE a byte is read — the cheap refusal —
 * and against the accumulated length WHILE reading, on every chunk, because
 * `Content-Length` is a claim by the client and a chunked upload makes none.
 * The stream is torn down the moment the running total crosses the bound.
 * Nothing is truncated to fit: a statement cut short is a wrong financial
 * record that looks exactly like a right one.
 *
 * EVERY OTHER BOUND COMES FROM THE SAME PLACE AND IS NOT A REQUEST FIELD. The
 * parse's row, column, field-byte, buffered-row, buffered-byte, deadline and
 * reported-error ceilings are handed to the use case as the declared policy —
 * a caller cannot raise the ceiling it is being held to, because there is no
 * field through which to ask.
 *
 * PARSING WRITES NO FINANCIAL RECORD. It stages rows and moves the import to
 * REVIEW_REQUIRED. Only the commit writes, and it is one unit of work and
 * idempotent: a retry after an ambiguous response answers with
 * `alreadyCommitted` and writes nothing.
 *
 * THERE IS NO MAPPING-UPDATE ROUTE. The mapping is an ARGUMENT to the parse,
 * not a stored draft, so correcting it means parsing again with the corrected
 * mapping. An endpoint that appeared to save a mapping and changed nothing
 * would be worse than its absence.
 */

import { Body, Controller, Inject, Param, Post, Req, Res } from '@nestjs/common';

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';

import {
  CSV_MEDIA_TYPE,
  StatementSourceTooLargeError,
  boundedBytes,
  declaredLengthExceedsBound,
  isByteStream,
  isUnsupportedBody,
} from './csv-body.js';
import { statementImportWire } from './dto/imports.js';
import { hasStoredSource, importAwaitsDecision } from './import-state.js';
import { readParseInput } from './import-input.js';
import { codedProblem, invalidRequestProblem } from './problems.js';
import { problemForImportsError } from './problems-imports.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { refuse, requirePrincipal } from './refuse.js';
import { bodyOf, isUuid } from './request-input.js';
import { FINANCIAL_USE_CASES, type FinancialUseCases } from './use-cases.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

interface RequestLike {
  readonly headers: Record<string, string | string[] | undefined>;
}

/** Every bound this ingestion path obeys, from the CENTRAL registry. */
const LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

@Controller('financial/statement-imports')
export class StatementImportSourceController {
  constructor(
    @Inject(FINANCIAL_USE_CASES) private readonly useCases: FinancialUseCases,
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
  ) {}

  private importId(raw: string): string {
    if (!isUuid(raw)) refuse(invalidRequestProblem('importId', 'is not a reference'));
    return raw;
  }

  @Post(':importId/source')
  async upload(
    @Req() request: RequestLike,
    @Param('importId') importId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.importId(importId);
    if (isUnsupportedBody(body) || !isByteStream(body)) {
      refuse(
        codedProblem(
          415,
          'Unsupported media type',
          'UNSUPPORTED_MEDIA_TYPE',
          `this path accepts ${CSV_MEDIA_TYPE} and nothing else`,
        ),
      );
    }
    // CHECK ONE: the declared length, before a byte is read.
    const declared = request.headers['content-length'];
    if (declaredLengthExceedsBound(typeof declared === 'string' ? declared : undefined)) {
      refuse(this.tooLarge());
    }

    let result;
    try {
      // CHECK TWO: the accumulated length, on every chunk, inside the stream
      // the use case consumes. The bound the use case is also given is the
      // same number, from the same policy.
      result = await this.useCases.storeImportSource.execute(
        {
          importId: id,
          content: boundedBytes(body),
          mediaType: CSV_MEDIA_TYPE,
          maxBytes: LIMITS.maxBytes,
        },
        principal,
      );
    } catch (error) {
      if (error instanceof StatementSourceTooLargeError) refuse(this.tooLarge());
      throw error;
    }
    if (!result.ok) refuse(problemForImportsError(result.error));
    reply.status(200).send(this.serialize(result.value));
  }

  @Post(':importId/parse')
  async parse(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.importId(importId);
    const input = readParseInput(body);
    if ('field' in input) refuse(invalidRequestProblem(input.field, input.why));

    const result = await this.useCases.parseStatementSource.execute(
      {
        importId: id,
        mapping: input.value.mapping,
        statedBalance: input.value.statedBalance,
        // Every parse bound, from the declared policy. Not a request field.
        limits: LIMITS,
      },
      principal,
    );
    if (!result.ok) refuse(problemForImportsError(result.error));
    reply.status(200).send(this.serialize(result.value));
  }

  @Post(':importId/commit')
  async commit(
    @Req() request: unknown,
    @Param('importId') importId: string,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(this.principals, request);
    const id = this.importId(importId);
    const expectedVersion = bodyOf(body)['expectedVersion'];
    if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion)) {
      refuse(invalidRequestProblem('expectedVersion', 'is required and must be an integer'));
    }

    const result = await this.useCases.commitStatementImport.execute(
      { importId: id, expectedVersion },
      principal,
    );
    if (!result.ok) refuse(problemForImportsError(result.error));
    reply.status(200).send({
      importId: result.value.importId,
      committedTransactionCount: result.value.committedTransactionCount,
      // True means this was an idempotent retry and nothing was written a
      // second time — the honest answer to a caller that never saw the first.
      alreadyCommitted: result.value.alreadyCommitted,
      transactionIds: [...result.value.transactionIds],
    });
  }

  private tooLarge(): ReturnType<typeof codedProblem> {
    return {
      status: 413,
      body: {
        type: 'about:blank',
        title: 'Statement too large',
        status: 413,
        code: 'SOURCE_TOO_LARGE',
        detail: 'the statement exceeds the declared byte bound for this ingestion path',
        reason: 'SOURCE_TOO_LARGE',
        limitBytes: LIMITS.maxBytes,
      },
    };
  }

  private serialize(value: Parameters<typeof statementImportWire>[0]): unknown {
    return statementImportWire(value, hasStoredSource(value), importAwaitsDecision(value));
  }
}
