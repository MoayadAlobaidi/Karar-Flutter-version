/**
 * Session surface: list own live sessions (the FORCEd RLS owner policy is
 * the actual scope — the query cannot see anyone else's rows), revoke one,
 * revoke all others. Metadata is what the store holds: digests and
 * summaries, nothing raw.
 */

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ErrorCode, PlatformError } from '@karar/platform/dist/errors/index.js';
import { UserId } from '@karar/shared-kernel';

import type { IdentityUseCases } from '../../infrastructure/composition/create-identity-runtime.js';
import { toSessionId } from '../../application/use-cases/session-lifecycle.js';

import { AccessTokenGuard, principalOf, type RequestWithPrincipal } from './access-token.guard.js';
import { IDENTITY_EDGE_CONTEXT, IDENTITY_USE_CASES, IdentityEdgeContext } from './identity-di.js';

@Controller('auth/sessions')
@UseGuards(AccessTokenGuard)
export class SessionsController {
  constructor(
    @Inject(IDENTITY_USE_CASES) private readonly useCases: IdentityUseCases,
    @Inject(IDENTITY_EDGE_CONTEXT) private readonly edge: IdentityEdgeContext,
  ) {}

  @Get()
  async list(@Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    const sessions = await this.useCases.listSessions.execute({
      accountId: UserId.of(principal.accountId),
      currentSessionId: principal.sessionId,
    });
    return {
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
        current: session.current,
        userAgentSummary: session.userAgentSummary,
      })),
    };
  }

  @Delete(':sessionId')
  @HttpCode(200)
  async revoke(@Param('sessionId') sessionId: string, @Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    const outcome = await this.useCases.revokeSession.execute({
      accountId: UserId.of(principal.accountId),
      sessionId: toSessionId(sessionId),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      throw new PlatformError({
        code: ErrorCode.NOT_FOUND,
        message: 'No live session with that id belongs to this account.',
        origin: 'application',
      });
    }
    return { status: 'revoked' };
  }

  @Post('revoke-others')
  @HttpCode(200)
  async revokeOthers(@Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    const outcome = await this.useCases.revokeOtherSessions.execute({
      accountId: UserId.of(principal.accountId),
      currentSessionId: principal.sessionId,
      client: this.edge.clientContext(request),
    });
    return { status: 'revoked', revokedCount: outcome.revokedCount };
  }
}
