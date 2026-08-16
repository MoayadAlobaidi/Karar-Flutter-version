/**
 * The authenticated principal as the consent endpoints need it. The identity
 * workstream's authentication guard resolves the session and attaches
 * `request.principal` — the subject's OWN identity, resolved at the edge
 * from the session, never from a client-asserted header or body field
 * (tenancy.md §5). These endpoints therefore act for the caller and nobody
 * else; a request without a resolved principal is unauthenticated, full
 * stop.
 */

import { UnauthorizedException } from '@nestjs/common';
import { TenantId, UserId } from '@karar/shared-kernel';

import type { ConsentPrincipal } from '../application/ports/consent-grant-repository.js';

/** The shape the authentication guard attaches to the request. */
export interface RequestPrincipal {
  readonly userId: string;
  readonly tenantId: string;
}

export function requirePrincipal(request: {
  principal?: RequestPrincipal | undefined;
}): ConsentPrincipal {
  const attached = request.principal;
  if (attached === undefined) {
    throw new UnauthorizedException('authentication required');
  }
  const userId = UserId.parse(attached.userId);
  const tenantId = TenantId.parse(attached.tenantId);
  if (!userId.ok || !tenantId.ok) {
    throw new UnauthorizedException('authenticated principal is malformed');
  }
  return { userId: userId.value, tenantId: tenantId.value };
}
