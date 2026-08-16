/**
 * PermissionGuard + requirePermission(permission) — Layer-1 enforcement at
 * the controller boundary. `@UseGuards(requirePermission('x.y.z'))` on a
 * route asks the central PolicyService before the handler runs: 401 when no
 * authenticated principal is attached, 403 (with the machine-readable denial
 * reason) when the permission is not held.
 *
 * The guard is ONE of the two mandatory enforcement points
 * (capability-registry.md §6): use cases call the exported application-level
 * `authorize()` helper as well, because HTTP is not the only caller — a
 * guard alone protects one of three entrances (HTTP, worker jobs, AI tools).
 *
 * Principals come EXCLUSIVELY from the injected AuthorizationPrincipalSource
 * (bound by the composition root to identity's authenticated request state).
 * Nothing here reads tenant or user identity from query, body, or headers.
 */

import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  mixin,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';

import type { PolicyActor } from '../../application/actor.js';
import type { PolicyService } from '../../application/policy-service.js';
import type { PermissionName } from '../../domain/catalogue.js';

/** DI token; the composition root binds the (request-scoped) PolicyService. */
export const AUTHORIZATION_POLICY_SERVICE = 'karar.authorization.policy-service';
/** DI token; the composition root binds identity's principal resolution. */
export const AUTHORIZATION_PRINCIPAL_SOURCE = 'karar.authorization.principal-source';

export interface AuthorizationPrincipalSource {
  /** The authenticated principal, or null when the request carries none. */
  fromRequest(request: unknown): PolicyActor | null;
}

export class PermissionGuard implements CanActivate {
  constructor(
    private readonly policy: PolicyService,
    private readonly principals: AuthorizationPrincipalSource,
    private readonly permission: PermissionName,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: unknown = context.switchToHttp().getRequest();
    const actor = this.principals.fromRequest(request);
    if (actor === null) {
      throw new UnauthorizedException('Authentication required.');
    }
    const decision = await this.policy.authorize(actor, this.permission);
    if (!decision.allowed) {
      throw new ForbiddenException({
        permission: this.permission,
        reason: decision.reason,
        message: `'${this.permission}' denied: ${decision.reason}`,
      });
    }
    return true;
  }
}

/**
 * Guard factory: `@UseGuards(requirePermission('tenancy.member.read'))`.
 * Returns a DI-constructed guard class bound to one catalogue permission —
 * the parameter type is PermissionName, so an unknown or wildcard permission
 * is a compile error at the call site, not a silent deny at runtime.
 */
export function requirePermission(permission: PermissionName): Type<CanActivate> {
  @Injectable()
  class ScopedPermissionGuard extends PermissionGuard {
    constructor(
      @Inject(AUTHORIZATION_POLICY_SERVICE) policy: PolicyService,
      @Inject(AUTHORIZATION_PRINCIPAL_SOURCE) principals: AuthorizationPrincipalSource,
    ) {
      super(policy, principals, permission);
    }
  }
  return mixin(ScopedPermissionGuard);
}
