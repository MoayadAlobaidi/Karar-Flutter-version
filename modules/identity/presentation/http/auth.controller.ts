/**
 * Registration, verification, login, refresh, logout. Controllers translate
 * transport to use-case calls and back — the enumeration-resistant response
 * shapes and generic errors are the USE CASES' outcomes; nothing here adds
 * or removes information.
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

import type { IdentityUseCases } from '../../infrastructure/composition/create-identity-runtime.js';
import { RequireOperationAllowed } from './operation-gate.js';
import { requireString } from '../dto/validate.js';
import { AccessTokenGuard, principalOf, type RequestWithPrincipal } from './access-token.guard.js';
import { IDENTITY_EDGE_CONTEXT, IDENTITY_USE_CASES, IdentityEdgeContext } from './identity-di.js';

import { UserId } from '@karar/shared-kernel';
import { toSessionResponse, GENERIC_ACCEPTED } from './responses.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(IDENTITY_USE_CASES) private readonly useCases: IdentityUseCases,
    @Inject(IDENTITY_EDGE_CONTEXT) private readonly edge: IdentityEdgeContext,
  ) {}

  @Post('register')
  @HttpCode(202)
  @UseGuards(RequireOperationAllowed('NEW_REGISTRATIONS'))
  async register(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const outcome = await this.useCases.registerAccount.execute({
      email: requireString(body, 'email'),
      password: requireString(body, 'password'),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      throw new PlatformError({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          outcome.error.kind === 'invalid_email'
            ? 'The e-mail address is not acceptable.'
            : `Password must be between ${outcome.error.minLength} and ${outcome.error.maxLength} characters.`,
        origin: 'application',
      });
    }
    return GENERIC_ACCEPTED;
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const outcome = await this.useCases.verifyEmail.execute({
      email: requireString(body, 'email'),
      code: requireString(body, 'code', { maxLength: 32 }),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      throw new UnauthorizedException('That code did not verify.');
    }
    return { status: 'verified' };
  }

  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    await this.useCases.resendVerification.execute({
      email: requireString(body, 'email'),
      client: this.edge.clientContext(request),
    });
    return GENERIC_ACCEPTED;
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(RequireOperationAllowed('PASSWORD_LOGIN'))
  async login(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const outcome = await this.useCases.login.execute({
      email: requireString(body, 'email'),
      password: requireString(body, 'password'),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (outcome.value.kind === 'mfa_required') {
      return {
        status: 'mfa_required',
        challengeToken: outcome.value.challengeToken,
        challengeExpiresAt: outcome.value.challengeExpiresAt.toISOString(),
      };
    }
    return toSessionResponse(outcome.value.session);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(RequireOperationAllowed('SESSION_REFRESH'))
  async refresh(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const outcome = await this.useCases.refreshSession.execute({
      refreshToken: requireString(body, 'refreshToken'),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      // 'invalid_token' and 'reuse_detected' are deliberately the same here.
      throw new UnauthorizedException('The refresh token is not valid.');
    }
    return {
      status: 'refreshed',
      accessToken: outcome.value.accessToken,
      accessTokenExpiresAt: outcome.value.accessTokenExpiresAt.toISOString(),
      refreshToken: outcome.value.refreshToken,
      refreshTokenExpiresAt: outcome.value.refreshTokenExpiresAt.toISOString(),
    };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async logout(@Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    await this.useCases.logout.execute({
      accountId: UserId.of(principal.accountId),
      sessionId: principal.sessionId,
      client: this.edge.clientContext(request),
    });
    return { status: 'logged_out' };
  }
}
