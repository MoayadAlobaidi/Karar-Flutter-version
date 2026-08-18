/**
 * The bootstrap HTTP surface: GET /platform/bootstrap and
 * POST /platform/tenant-binding. Controllers translate transport to
 * use-case calls and back — no business logic (architecture test 6).
 *
 * Principals come EXCLUSIVELY from the injected BootstrapPrincipalSource.
 * GET consults no request value at all beyond the principal; POST reads
 * exactly ONE body field (`tenantId`) and hands it to the use case as a
 * SELECTION for server-side membership verification. `?tenantId=` and
 * `x-tenant-id` are ignored everywhere — tests attack all three vectors.
 *
 * Kill switches: deliberately none. The switch-id registry is CLOSED (no
 * new ids in this phase), and no existing id covers tenant binding;
 * restricting bootstrap would blind clients without restricting any
 * write surface it fronts.
 *
 * FAILURES ARE THROWN, never written to the reply. The HTTP entrypoint's error
 * boundary is the ONE writer of an RFC 7807 document and the only place its
 * `application/problem+json` media type is set (apps/api/src/errors/
 * problem-response.ts); a problem this surface authored travels there as the
 * body of an HttpException and is forwarded verbatim, code and all. The reply
 * object below answers successes only.
 */

import { Body, Controller, Get, HttpException, Inject, Post, Req, Res } from '@nestjs/common';

import type { GetBootstrap } from '../../application/use-cases/get-bootstrap.js';
import type { SetTenantBinding } from '../../application/use-cases/set-tenant-binding.js';
import { authenticationRequiredProblem, problemForBootstrapError } from './problems.js';
import {
  BOOTSTRAP_PRINCIPAL_SOURCE,
  type BootstrapPrincipalSource,
} from './principal-source.js';
import { toBootstrapResponse, toTenantBindingResponse } from '../dto/bootstrap-responses.js';

export const BOOTSTRAP_USE_CASES = 'karar.bootstrap.use-cases';

export interface BootstrapUseCases {
  readonly getBootstrap: GetBootstrap;
  readonly setTenantBinding: SetTenantBinding;
}

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

@Controller('platform')
export class BootstrapController {
  constructor(
    @Inject(BOOTSTRAP_USE_CASES) private readonly useCases: BootstrapUseCases,
    @Inject(BOOTSTRAP_PRINCIPAL_SOURCE)
    private readonly principalSource: BootstrapPrincipalSource,
  ) {}

  @Get('bootstrap')
  async getBootstrap(@Req() request: unknown, @Res() reply: ReplyLike): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) {
      const problem = authenticationRequiredProblem();
      throw new HttpException(problem.body, problem.status);
    }
    const result = await this.useCases.getBootstrap.execute(
      principal,
      this.principalSource.clientContextOf(request),
    );
    if (!result.ok) {
      const problem = problemForBootstrapError(result.error, principal.requestId);
      throw new HttpException(problem.body, problem.status);
    }
    reply.status(200).send(toBootstrapResponse(result.value));
  }

  @Post('tenant-binding')
  async setTenantBinding(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) {
      const problem = authenticationRequiredProblem();
      throw new HttpException(problem.body, problem.status);
    }
    const raw = (body ?? {}) as Record<string, unknown>;
    const result = await this.useCases.setTenantBinding.execute(
      // Exactly one body field crosses the boundary — the selection.
      { tenantId: raw.tenantId },
      principal,
      this.principalSource.clientContextOf(request),
    );
    if (!result.ok) {
      const problem = problemForBootstrapError(result.error, principal.requestId);
      throw new HttpException(problem.body, problem.status);
    }
    reply.status(200).send(toTenantBindingResponse(result.value));
  }
}
