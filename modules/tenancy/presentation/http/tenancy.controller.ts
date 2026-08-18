/**
 * The tenancy HTTP surface: read own tenant/membership, list members, create
 * / revoke / redeem invitations. Controllers translate transport to use-case
 * calls and back — no business logic (architecture test 6).
 *
 * Principals come EXCLUSIVELY from the injected TenancyPrincipalSource.
 * Query strings, headers, and bodies are never consulted for tenant or user
 * identity — tests assert that a `?tenantId=`, `x-tenant-id` header, and
 * body `tenantId` are all ignored.
 *
 * FAILURES ARE THROWN, never written to the reply. The HTTP entrypoint's error
 * boundary is the ONE writer of an RFC 7807 document and the only place its
 * `application/problem+json` media type is set (apps/api/src/errors/
 * problem-response.ts); a problem this surface authored travels there as the
 * body of an HttpException and is forwarded verbatim, code and all. The reply
 * object below answers successes only.
 */

import {
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import type { GetOwnTenant } from '../../application/use-cases/get-own-tenant.js';
import type { ListMembers } from '../../application/use-cases/list-members.js';
import type { CreateInvitation } from '../../application/use-cases/create-invitation.js';
import type { RevokeInvitation } from '../../application/use-cases/revoke-invitation.js';
import type { RedeemInvitation } from '../../application/use-cases/redeem-invitation.js';
import { authenticationRequiredProblem, problemForTenancyError } from './problems.js';
import { RequireOperationAllowed } from './operation-gate.js';
import { TENANCY_PRINCIPAL_SOURCE, type TenancyPrincipalSource } from './principal-source.js';
import {
  toInvitationResponse,
  toMembershipResponse,
  toTenantResponse,
} from '../dto/tenancy-responses.js';

export const TENANCY_USE_CASES = 'karar.tenancy.use-cases';

export interface TenancyUseCases {
  readonly getOwnTenant: GetOwnTenant;
  readonly listMembers: ListMembers;
  readonly createInvitation: CreateInvitation;
  readonly revokeInvitation: RevokeInvitation;
  readonly redeemInvitation: RedeemInvitation;
}

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthenticated(): HttpException {
  const problem = authenticationRequiredProblem();
  return new HttpException(problem.body, problem.status);
}

@Controller('tenancy')
export class TenancyController {
  constructor(
    @Inject(TENANCY_USE_CASES) private readonly useCases: TenancyUseCases,
    @Inject(TENANCY_PRINCIPAL_SOURCE) private readonly principalSource: TenancyPrincipalSource,
  ) {}

  @Get('tenant')
  async getTenant(@Req() request: unknown, @Res() reply: ReplyLike): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) throw unauthenticated();
    const result = await this.useCases.getOwnTenant.execute(principal);
    if (!result.ok) {
      const problem = problemForTenancyError(result.error);
      throw new HttpException(problem.body, problem.status);
    }
    reply.status(200).send({
      tenant: toTenantResponse(result.value.tenant),
      membership: toMembershipResponse(result.value.membership),
    });
  }

  @Get('members')
  async listMembers(@Req() request: unknown, @Res() reply: ReplyLike): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) throw unauthenticated();
    const result = await this.useCases.listMembers.execute(principal);
    if (!result.ok) {
      const problem = problemForTenancyError(result.error);
      throw new HttpException(problem.body, problem.status);
    }
    reply.status(200).send({ members: result.value.map(toMembershipResponse) });
  }

  @Post('invitations')
  @UseGuards(RequireOperationAllowed('TENANT_INVITATIONS'))
  async createInvitation(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) throw unauthenticated();
    const raw = (body ?? {}) as Record<string, unknown>;
    const result = await this.useCases.createInvitation.execute(
      {
        email: typeof raw.email === 'string' ? raw.email : '',
        ...(typeof raw.roleHint === 'string' ? { roleHint: raw.roleHint } : {}),
        ...(typeof raw.expiresInHours === 'number' ? { expiresInHours: raw.expiresInHours } : {}),
      },
      principal,
    );
    if (!result.ok) {
      const problem = problemForTenancyError(result.error);
      throw new HttpException(problem.body, problem.status);
    }
    reply.status(201).send({
      invitation: toInvitationResponse(result.value.invitation),
      // Shown once, never retrievable again — only its sha256 is at rest.
      token: result.value.token,
    });
  }

  @Post('invitations/:invitationId/revoke')
  async revokeInvitation(
    @Req() request: unknown,
    @Param('invitationId') invitationId: string,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = this.principalSource.fromRequest(request);
    if (principal === null) throw unauthenticated();
    if (!UUID_SHAPE.test(invitationId)) {
      const problem = problemForTenancyError({
        kind: 'invitation_not_found',
        message: 'no open invitation with that id exists in the bound tenant',
      });
      throw new HttpException(problem.body, problem.status);
    }
    const result = await this.useCases.revokeInvitation.execute(invitationId, principal);
    if (!result.ok) {
      const problem = problemForTenancyError(result.error);
      throw new HttpException(problem.body, problem.status);
    }
    reply.status(200).send({ invitation: toInvitationResponse(result.value.invitation) });
  }

  @Post('invitations/redeem')
  @UseGuards(RequireOperationAllowed('TENANT_INVITATIONS'))
  async redeemInvitation(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    // Redemption requires authentication but NOT an existing tenant binding.
    const redeemer = this.principalSource.redeemerFromRequest(request);
    if (redeemer === null) throw unauthenticated();
    const raw = (body ?? {}) as Record<string, unknown>;
    const result = await this.useCases.redeemInvitation.execute(
      { token: typeof raw.token === 'string' ? raw.token : '' },
      redeemer,
    );
    if (!result.ok) {
      const problem = problemForTenancyError(result.error);
      throw new HttpException(problem.body, problem.status);
    }
    reply.status(200).send({
      tenantId: result.value.tenantId,
      membership: toMembershipResponse(result.value.membership),
    });
  }
}
