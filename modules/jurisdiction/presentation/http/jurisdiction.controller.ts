/**
 * The jurisdiction module's ONLY HTTP surface: POST /jurisdiction/self-declaration.
 *
 * ONE narrow write. There is deliberately NO operator assignment endpoint, NO
 * verification endpoint, and NO PolicyPack activation endpoint here — those
 * are control-plane surfaces (ADR-0021) and mounting them on the consumer API
 * is exactly the re-plumbing that decision exists to prevent.
 *
 * Thin by design (architecture test 6): read the principal from the injected
 * source, read exactly ONE body field, call one use case, map the Result. The
 * declared code is reference DATA the use case validates against the register;
 * nothing here branches on a jurisdiction identifier (architecture test 12).
 */

import { Body, Controller, Inject, Post, Req, Res } from '@nestjs/common';

import type { DeclareOwnJurisdiction } from '../../application/use-cases/self-declaration.js';
import {
  authenticationRequiredProblem,
  invalidDeclarationProblem,
  problemForDeclarationError,
  tenantBindingRequiredProblem,
} from './problems.js';
import {
  JURISDICTION_PRINCIPAL_SOURCE,
  type JurisdictionPrincipalSource,
} from './principal-source.js';
import { toDeclarationResponse } from '../dto/declaration-response.js';

export const JURISDICTION_USE_CASES = 'karar.jurisdiction.use-cases';

export interface JurisdictionUseCases {
  readonly declareOwnJurisdiction: DeclareOwnJurisdiction;
}

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

/** The register's codes are short reference tokens; anything else is refused
 * before it reaches a query, so an oversized or shaped payload cannot travel. */
const CODE_SHAPE = /^[A-Za-z0-9-]{2,32}$/;

@Controller('jurisdiction')
export class JurisdictionController {
  constructor(
    @Inject(JURISDICTION_USE_CASES) private readonly useCases: JurisdictionUseCases,
    @Inject(JURISDICTION_PRINCIPAL_SOURCE)
    private readonly principalSource: JurisdictionPrincipalSource,
    @Inject('karar.jurisdiction.clock') private readonly clock: { now(): Date },
  ) {}

  @Post('self-declaration')
  async declare(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) {
      const problem = authenticationRequiredProblem();
      reply.status(problem.status).send(problem.body);
      return;
    }
    if (principal.tenantId === null) {
      const problem = tenantBindingRequiredProblem(principal.requestId);
      reply.status(problem.status).send(problem.body);
      return;
    }

    // Exactly one body field crosses the boundary — the declared code.
    const raw = (body ?? {}) as Record<string, unknown>;
    const declared = raw.jurisdictionId;
    if (typeof declared !== 'string' || !CODE_SHAPE.test(declared)) {
      const problem = invalidDeclarationProblem(
        "'jurisdictionId' is required and must be a jurisdiction reference code",
        principal.requestId,
      );
      reply.status(problem.status).send(problem.body);
      return;
    }

    const result = await this.useCases.declareOwnJurisdiction.execute({
      principal: { tenantId: principal.tenantId, userId: principal.userId },
      jurisdictionCode: declared,
      now: this.clock.now(),
    });
    if (!result.ok) {
      const problem = problemForDeclarationError(result.error, principal.requestId);
      reply.status(problem.status).send(problem.body);
      return;
    }
    reply.status(200).send(toDeclarationResponse(result.value));
  }
}
