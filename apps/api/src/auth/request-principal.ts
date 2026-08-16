/**
 * Request principal enrichment — the composition-root bridge between the
 * identity module's authentication and every module that consumes a
 * principal (users, tenancy, consent, authorization).
 *
 * A global guard that NEVER denies: when the request carries a valid bearer
 * token it attaches the resolved principal to the request; when it does not,
 * it attaches nothing and lets each module's own enforcement answer 401
 * (fail closed at the consumer, exactly once, in module code). Identity's
 * own controllers are skipped — they authenticate themselves through
 * `AccessTokenGuard` and must not pay a second session lookup.
 *
 * Tenant identity comes EXCLUSIVELY from the session row's server-side
 * `tenant_binding` (surfaced by AuthenticateRequest), never from a query,
 * header, or body value — the tenancy.md §6 rule holds by construction
 * because nothing here reads any request field except the Authorization
 * header.
 */

import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { TenantId, UserId, type Result } from '@karar/shared-kernel';
import type { AuthenticatedPrincipal } from '@karar/identity';

/** The composed principal the module adapters read. */
export interface KararRequestPrincipal {
  readonly userId: UserId;
  readonly tenantId: TenantId | null;
  readonly sessionId: string;
  /** From the same authenticated read; the bootstrap surface reports it. */
  readonly emailVerified: boolean;
}

/** Request keys this guard owns. `principal` is the consent module's contract. */
export interface EnrichedRequest {
  headers: Record<string, string | string[] | undefined>;
  kararPrincipal?: KararRequestPrincipal;
  principal?: { readonly userId: string; readonly tenantId: string };
}

interface AuthenticateRequestPort {
  execute(accessToken: string): Promise<Result<AuthenticatedPrincipal, { kind: string }>>;
}

@Injectable()
export class PrincipalEnrichmentGuard implements CanActivate {
  constructor(
    private readonly authenticate: AuthenticateRequestPort,
    /** Controller classes that authenticate themselves (identity's). */
    private readonly selfAuthenticating: ReadonlySet<unknown>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.selfAuthenticating.has(context.getClass())) {
      return true;
    }
    const request = context.switchToHttp().getRequest<EnrichedRequest>();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value !== 'string' || !value.startsWith('Bearer ')) {
      return true;
    }
    // A thrown infrastructure error (database unreachable) is deliberately
    // NOT caught: a bearer-carrying request that cannot be authenticated must
    // fail, not proceed anonymously (fail closed at the boundary).
    const outcome = await this.authenticate.execute(value.slice('Bearer '.length));
    if (!outcome.ok) {
      return true;
    }

    const userId = UserId.parse(outcome.value.accountId);
    if (!userId.ok) {
      return true; // malformed principal: attach nothing, consumers answer 401
    }
    let tenantId: TenantId | null = null;
    if (outcome.value.tenantBinding !== null) {
      const parsed = TenantId.parse(outcome.value.tenantBinding);
      if (!parsed.ok) {
        return true; // a corrupt binding must not half-authenticate a request
      }
      tenantId = parsed.value;
    }

    request.kararPrincipal = {
      userId: userId.value,
      tenantId,
      sessionId: outcome.value.sessionId,
      emailVerified: outcome.value.emailVerified,
    };
    if (tenantId !== null) {
      request.principal = {
        userId: UserId.toString(userId.value),
        tenantId: TenantId.toString(tenantId),
      };
    }
    return true;
  }
}
