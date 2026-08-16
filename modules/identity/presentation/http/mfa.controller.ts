/**
 * MFA surface. Enrol/confirm/disable require an authenticated session;
 * challenge and recovery complete a login and are authenticated by the
 * short-lived challenge token instead. Secrets and recovery codes appear in
 * exactly one response each (enrol, confirm) and nowhere else, ever.
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
import { toSessionResponse } from './responses.js';

@Controller('auth/mfa')
export class MfaController {
  constructor(
    @Inject(IDENTITY_USE_CASES) private readonly useCases: IdentityUseCases,
    @Inject(IDENTITY_EDGE_CONTEXT) private readonly edge: IdentityEdgeContext,
  ) {}

  @Post('enroll')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async enroll(@Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    const outcome = await this.useCases.enrollMfa.execute({
      accountId: UserId.of(principal.accountId),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      throw new PlatformError({
        code: ErrorCode.CONFLICT,
        message: 'MFA is already enrolled for this account.',
        origin: 'application',
      });
    }
    return {
      status: 'enrolment_started',
      secret: outcome.value.secret,
      otpauthUrl: outcome.value.otpauthUrl,
    };
  }

  @Post('confirm')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async confirm(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    const outcome = await this.useCases.confirmMfa.execute({
      accountId: UserId.of(principal.accountId),
      code: requireString(body, 'code', { maxLength: 16 }),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      if (outcome.error.kind === 'no_pending_enrolment') {
        throw new PlatformError({
          code: ErrorCode.CONFLICT,
          message: 'There is no pending MFA enrolment to confirm.',
          origin: 'application',
        });
      }
      throw new UnauthorizedException('That code did not verify.');
    }
    return { status: 'confirmed', recoveryCodes: outcome.value.recoveryCodes };
  }

  @Post('challenge')
  @HttpCode(200)
  async challenge(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const outcome = await this.useCases.verifyMfaChallenge.withTotp({
      challengeToken: requireString(body, 'challengeToken'),
      code: requireString(body, 'code', { maxLength: 16 }),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      throw new UnauthorizedException('The challenge did not verify.');
    }
    return toSessionResponse(outcome.value.session);
  }

  @Post('recovery')
  @HttpCode(200)
  async recovery(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const outcome = await this.useCases.verifyMfaChallenge.withRecoveryCode({
      challengeToken: requireString(body, 'challengeToken'),
      recoveryCode: requireString(body, 'recoveryCode', { maxLength: 64 }),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      throw new UnauthorizedException('The challenge did not verify.');
    }
    return toSessionResponse(outcome.value.session);
  }

  @Post('disable')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  async disable(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const principal = principalOf(request);
    const outcome = await this.useCases.disableMfa.execute({
      accountId: UserId.of(principal.accountId),
      code: requireString(body, 'code', { maxLength: 64 }),
      client: this.edge.clientContext(request),
    });
    if (!outcome.ok) {
      if (outcome.error.kind === 'not_enrolled') {
        throw new PlatformError({
          code: ErrorCode.CONFLICT,
          message: 'MFA is not enrolled for this account.',
          origin: 'application',
        });
      }
      throw new UnauthorizedException('That code did not verify.');
    }
    return { status: 'disabled' };
  }
}
