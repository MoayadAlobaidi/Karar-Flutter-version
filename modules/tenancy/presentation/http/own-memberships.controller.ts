/**
 * GET /tenancy/memberships — the caller's OWN memberships, across tenants.
 *
 * WHY IT EXISTS. Phase 3.5 built ListOwnMemberships and the 0080 SELF-arm it
 * reads through, but nothing mounted them: the bootstrap surface reports the
 * CURRENT binding, so a bound session had no way to learn which other tenants
 * it may switch to. Tenant switching was reachable only from an unbound
 * session's selection list. This route is that missing read, and NOTHING
 * else — no new domain logic, no new persistence, no widening.
 *
 * OWN MEANS OWN. There is no subject parameter and no tenant parameter. The
 * principal comes from the injected TenancySelfPrincipalSource (the session
 * row, server-side); the repository binds ONLY app.user_id, so the 0080 arm
 * admits exactly the caller's own rows and another user's id resolves to
 * nothing rather than to their memberships. A `?userId=`, `x-tenant-id`, or
 * body field is never consulted — there is no code path that could.
 *
 * DELIBERATELY TENANTLESS. Selection precedes binding, so this read must work
 * for a caller who holds no binding; and a caller who holds one must not have
 * the answer narrowed to it, or a bound session would still see no switch
 * target. Authentication is required; a tenant binding is not.
 *
 * Thin by design (architecture test 6): resolve the principal, call one use
 * case, map the Result.
 */

import { Controller, Get, Inject, Req, Res } from '@nestjs/common';

import type { ListOwnMemberships } from '../../application/use-cases/list-own-memberships.js';
import { authenticationRequiredProblem, problemForTenancyError } from './problems.js';
import {
  TENANCY_SELF_PRINCIPAL_SOURCE,
  type TenancySelfPrincipalSource,
} from './principal-source.js';
import { toMembershipResponse } from '../dto/tenancy-responses.js';

export const TENANCY_SELF_USE_CASES = 'karar.tenancy.self-use-cases';

export interface TenancySelfUseCases {
  readonly listOwnMemberships: ListOwnMemberships;
}

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

@Controller('tenancy')
export class OwnMembershipsController {
  constructor(
    @Inject(TENANCY_SELF_USE_CASES) private readonly useCases: TenancySelfUseCases,
    @Inject(TENANCY_SELF_PRINCIPAL_SOURCE)
    private readonly principalSource: TenancySelfPrincipalSource,
  ) {}

  @Get('memberships')
  async listOwnMemberships(@Req() request: unknown, @Res() reply: ReplyLike): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) {
      const problem = authenticationRequiredProblem();
      reply.status(problem.status).send(problem.body);
      return;
    }
    const result = await this.useCases.listOwnMemberships.execute(principal);
    if (!result.ok) {
      const problem = problemForTenancyError(result.error);
      reply.status(problem.status).send(problem.body);
      return;
    }
    // The use case has already dropped everything not ACTIVE at the evaluation
    // instant, so an empty array is a real answer: this caller has no usable
    // membership anywhere, not "the read did not happen" (that is the 503).
    reply.status(200).send({ memberships: result.value.map(toMembershipResponse) });
  }
}
