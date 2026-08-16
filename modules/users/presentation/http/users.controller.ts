/**
 * The users HTTP surface: read own profile, update approved fields, request
 * account disable. Controllers translate transport to use-case calls and back
 * — no business logic (architecture test 6).
 *
 * The acting principal comes EXCLUSIVELY from the injected PrincipalSource
 * (server-side session state). Query strings, headers, and bodies are never
 * consulted for tenant or user identity — `?tenantId=`, `x-tenant-id`, and a
 * body `tenantId` are ignored by construction, and tests assert exactly that.
 * The PATCH body is reduced to the two approved fields before the use case
 * ever sees it; everything else in the body does not exist to this surface.
 */

import { Body, Controller, Get, Inject, Patch, Post, Req, Res } from '@nestjs/common';

import type { GetOwnProfile } from '../../application/use-cases/get-own-profile.js';
import type {
  UpdateOwnProfile,
  UpdateOwnProfileInput,
} from '../../application/use-cases/update-own-profile.js';
import type { RequestAccountDisable } from '../../application/use-cases/request-account-disable.js';
import type { PrincipalActor } from '../../application/principal.js';
import { authenticationRequiredProblem, problemForUsersError } from './problems.js';
import { USERS_PRINCIPAL_SOURCE, type PrincipalSource } from './principal-source.js';
import { toDisableRequestedResponse, toUserProfileResponse } from '../dto/user-profile-response.js';

export const USERS_USE_CASES = 'karar.users.use-cases';

export interface UsersUseCases {
  readonly getOwnProfile: GetOwnProfile;
  readonly updateOwnProfile: UpdateOwnProfile;
  readonly requestAccountDisable: RequestAccountDisable;
}

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

@Controller('users')
export class UsersController {
  constructor(
    @Inject(USERS_USE_CASES) private readonly useCases: UsersUseCases,
    @Inject(USERS_PRINCIPAL_SOURCE) private readonly principalSource: PrincipalSource,
  ) {}

  private principal(request: unknown): PrincipalActor | null {
    return this.principalSource.fromRequest(request);
  }

  @Get('me')
  async getMe(@Req() request: unknown, @Res() reply: ReplyLike): Promise<void> {
    const principal = this.principal(request);
    if (principal === null) {
      const problem = authenticationRequiredProblem();
      reply.status(problem.status).send(problem.body);
      return;
    }
    const result = await this.useCases.getOwnProfile.execute(principal);
    if (!result.ok) {
      const problem = problemForUsersError(result.error);
      reply.status(problem.status).send(problem.body);
      return;
    }
    reply.status(200).send(toUserProfileResponse(result.value));
  }

  @Patch('me')
  async patchMe(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = this.principal(request);
    if (principal === null) {
      const problem = authenticationRequiredProblem();
      reply.status(problem.status).send(problem.body);
      return;
    }
    // Approved fields only: everything else in the body is dropped here.
    const raw = (body ?? {}) as Record<string, unknown>;
    const input: UpdateOwnProfileInput = {
      ...(typeof raw.displayName === 'string' ? { displayName: raw.displayName } : {}),
      ...(typeof raw.locale === 'string' ? { locale: raw.locale } : {}),
    };
    const result = await this.useCases.updateOwnProfile.execute(input, principal);
    if (!result.ok) {
      const problem = problemForUsersError(result.error);
      reply.status(problem.status).send(problem.body);
      return;
    }
    reply.status(200).send(toUserProfileResponse(result.value));
  }

  @Post('me/disable-request')
  async requestDisable(
    @Req() request: unknown,
    @Body() body: unknown,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = this.principal(request);
    if (principal === null) {
      const problem = authenticationRequiredProblem();
      reply.status(problem.status).send(problem.body);
      return;
    }
    const raw = (body ?? {}) as Record<string, unknown>;
    const result = await this.useCases.requestAccountDisable.execute(
      { ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}) },
      principal,
    );
    if (!result.ok) {
      const problem = problemForUsersError(result.error);
      reply.status(problem.status).send(problem.body);
      return;
    }
    reply
      .status(202)
      .send(toDisableRequestedResponse(result.value.change, result.value.auditFailure === null));
  }
}
