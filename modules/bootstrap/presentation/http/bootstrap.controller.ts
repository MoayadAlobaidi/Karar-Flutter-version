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
 */

import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';

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
      reply.status(problem.status).send(problem.body);
      return;
    }
    const result = await this.useCases.getBootstrap.execute(
      principal,
      this.principalSource.clientContextOf(request),
    );
    if (!result.ok) {
      const problem = problemForBootstrapError(result.error);
      reply.status(problem.status).send(problem.body);
      return;
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
      reply.status(problem.status).send(problem.body);
      return;
    }
    const raw = (body ?? {}) as Record<string, unknown>;
    const result = await this.useCases.setTenantBinding.execute(
      // Exactly one body field crosses the boundary — the selection.
      { tenantId: raw.tenantId },
      principal,
      this.principalSource.clientContextOf(request),
    );
    if (!result.ok) {
      const problem = problemForBootstrapError(result.error);
      reply.status(problem.status).send(problem.body);
      return;
    }
    reply.status(200).send(toTenantBindingResponse(result.value));
  }
}
