/**
 * authorize() — the application-level enforcement helper for use cases,
 * exported alongside the HTTP guard because HTTP IS NOT THE ONLY CALLER
 * (capability-registry.md §6): worker jobs and AI tools invoke use cases
 * directly, and a guard that exists only at the HTTP edge protects one of
 * three entrances. A use case calls this at its top; the guard calls the
 * same PolicyService at the controller boundary — both, deliberately.
 */

import { Result } from '@karar/shared-kernel';

import type { PolicyActor } from './actor.js';
import type { PolicyService } from './policy-service.js';
import type { NotAuthorized } from './errors.js';

export async function authorize(
  policy: PolicyService,
  actor: PolicyActor,
  permission: string,
  resource?: Readonly<Record<string, string>>,
): Promise<Result<void, NotAuthorized>> {
  const decision = await policy.authorize(actor, permission, resource);
  if (!decision.allowed) {
    return Result.err({
      kind: 'not_authorized',
      permission,
      reason: decision.reason,
      message: `'${permission}' denied: ${decision.reason}`,
    });
  }
  return Result.ok(undefined);
}
