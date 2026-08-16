/**
 * The acting principal as the authorization layer sees it. `tenantId` is
 * OPTIONAL — platform staff act with no tenant binding — and both identifiers
 * are re-validated at runtime even though the branded types already promise
 * the shape: HTTP is not the only caller, and a cast is not an
 * authentication (fail closed, no default principal exists).
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

export interface PolicyActor {
  readonly userId: UserId;
  /** Absent = platform context (no tenant binding). */
  readonly tenantId?: TenantId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

export interface InvalidActor {
  readonly kind: 'invalid_actor';
  readonly message: string;
}

export function requirePolicyActor(
  actor: PolicyActor | null | undefined,
): Result<PolicyActor, InvalidActor> {
  if (
    actor === null ||
    actor === undefined ||
    typeof actor.userId !== 'string' ||
    !UserId.parse(actor.userId).ok ||
    (actor.tenantId !== undefined &&
      (typeof actor.tenantId !== 'string' || !TenantId.parse(actor.tenantId).ok))
  ) {
    return Result.err({
      kind: 'invalid_actor',
      message:
        'authorization requires an authenticated principal — denied (fail closed, no default principal exists)',
    });
  }
  return Result.ok(actor);
}
