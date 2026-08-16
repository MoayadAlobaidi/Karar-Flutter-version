/**
 * RequestScopedPolicyService — the ONLY sanctioned authorization cache: a
 * per-request memo. The composition root constructs ONE instance per request
 * (or per job/tool invocation) and discards it with the request; repeated
 * checks of the same (actor, permission) inside that horizon reuse the first
 * decision.
 *
 * Deliberately NOT a TTL cache, NOT shared across requests, NOT
 * invalidation-based: a revocation must be effective on the very next
 * request with nothing to expire (access-control.md §7 — roles re-derived
 * per request). Within one request the world is allowed to be a snapshot;
 * across requests it never is. Wiring this as a singleton would be a defect,
 * which is why the class name says what its lifetime must be.
 */

import type { PolicyActor } from './actor.js';
import type { PolicyDecision, PolicyService } from './policy-service.js';

export class RequestScopedPolicyService implements PolicyService {
  private readonly memo = new Map<string, Promise<PolicyDecision>>();

  constructor(private readonly inner: PolicyService) {}

  authorize(
    actor: PolicyActor,
    permission: string,
    resource?: Readonly<Record<string, string>>,
  ): Promise<PolicyDecision> {
    // Resource context participates in the key: a future resource-scoped
    // rule must never be served a memo from a different resource.
    const key = JSON.stringify([
      String(actor?.userId ?? ''),
      String(actor?.tenantId ?? ''),
      permission,
      resource ?? null,
    ]);
    const memoized = this.memo.get(key);
    if (memoized !== undefined) {
      return memoized;
    }
    const decision = this.inner.authorize(actor, permission, resource);
    this.memo.set(key, decision);
    return decision;
  }
}
