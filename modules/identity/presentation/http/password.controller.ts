/**
 * Password lifecycle: forgot (generic always), reset (token-consuming, signs
 * everything out), change (authenticated, requires current password, signs
 * everything ELSE out). Session-revocation policy lives in the use cases.
 */

import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ErrorCode, PlatformError } from '@karar/platform/dist/errors/index.js';
import { UserId } from '@karar/shared-kernel';

import type { IdentityUseCases } from '../../infrastructure/composition/create-identity-runtime.js';

import { requireString } from '../dto/validate.js';
import { AccessTokenGuard, principalOf, type RequestWithPrincipal } from './access-token.guard.js';
import { IDENTITY_EDGE_CONTEXT, IDENTITY_USE_CASES, IdentityEdgeContext } from './identity-di.js';
import { GENERIC_ACCEPTED } from './responses.js';

function invalidPassword(minLength: number, maxLength: number): PlatformError {
  return new PlatformError({
    code: ErrorCode.VALIDATION_ERROR,
    message: `Password must be between ${minLength} and ${maxLength} characters.`,
    origin: 'application',
  });
}

@Controller('auth')
export class PasswordController {
  constructor(
    @Inject(IDENTITY_USE_CASES) private readonly useCases: IdentityUseCases,
    @Inject(IDENTITY_EDGE_CONTEXT) private readonly edge: IdentityEdgeContext,
  ) {}

  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    await this.useCases.forgotPassword.execute({
      email: requireString(body, 'email'),
      client: this.edge.clientContext(request),
    });
    return GENERIC_ACCEPTED;
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const outcome = await this.useCases.resetPassword.execute({
      token: requireString(body, 'token'),
      newPassword: requireString(body, 'newPassword'),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      if (outcome.error.kind === 'invalid_password') {
        throw invalidPassword(outcome.error.minLength, outcome.error.maxLength);
      }
      throw new UnauthorizedException('The reset token is not valid.');
    }
    return { status: 'reset' };
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async changePassword(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    const outcome = await this.useCases.changePassword.execute({
      accountId: UserId.of(principal.accountId),
      currentSessionId: principal.sessionId,
      currentPassword: requireString(body, 'currentPassword'),
      newPassword: requireString(body, 'newPassword'),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      if (outcome.error.kind === 'invalid_password') {
        throw invalidPassword(outcome.error.minLength, outcome.error.maxLength);
      }
      throw new UnauthorizedException('The current password is not correct.');
    }
    // The token version moved: the caller should refresh to a fresh access
    // token; this session's refresh chain remains valid.
    return { status: 'changed' };
  }
}
