/**
 * AccessTokenGuard — bearer authentication for the identity surface. The
 * token proves signature and freshness; AuthenticateRequest re-reads account
 * and session state from the DATABASE on every request (access-control.md
 * §7: revocation is immediate; session state never lives in process memory).
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../../application/use-cases/authenticate-request.js';
import type { IdentityUseCases } from '../../infrastructure/composition/create-identity-runtime.js';
import { IDENTITY_USE_CASES, type IdentityRequestLike } from './identity-di.js';

export interface RequestWithPrincipal extends IdentityRequestLike {
  identityPrincipal?: AuthenticatedPrincipal;
}

/** The principal the guard attached; controllers read it via this helper. */
export function principalOf(request: RequestWithPrincipal): AuthenticatedPrincipal {
  const principal = request.identityPrincipal;
  if (principal === undefined) {
    // A controller using this helper without the guard is a wiring defect.
    throw new UnauthorizedException('Authentication required.');
  }
  return principal;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(IDENTITY_USE_CASES) private readonly useCases: IdentityUseCases) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication required.');
    }
    const outcome = await this.useCases.authenticateRequest.execute(value.slice('Bearer '.length));
    if (!outcome.ok) {
      throw new UnauthorizedException('Authentication required.');
    }
    request.identityPrincipal = outcome.value;
    return true;
  }
}
