/**
 * The one file that knows both the financial principal shape and the platform
 * rate limiter.
 *
 * `apps/api/src/financial` declares a port and never constructs a limiter,
 * never names Redis and never holds a pepper — the same discipline
 * `capability-gate.ts` states for the capability registry. This adapter is
 * where the two meet, and it does nothing but translate.
 *
 * THE SUBJECT KEY IS SERVER-DERIVED. It comes from the session's resolved
 * principal — tenant and user — and is HMAC'd under the server pepper before
 * it reaches the store, so no raw tenant id, user id, e-mail or account id ever
 * appears in a Redis key, a metric attribute or a log line. A caller cannot
 * name the budget it is charged to.
 *
 * IT IS TENANT-SCOPED. A person bound to two tenants gets two budgets: one
 * tenant's activity must not refuse the other's, because that refusal would
 * itself be a signal about the other tenant.
 */

import type {
  RateLimitKeyHasher,
  RateLimitPolicy,
  RateLimitService,
} from '@karar/platform/dist/ratelimit/index.js';

import type { FinancialRateLimitPort } from '../financial/rate-limit-port.js';
import type { FinancialPrincipal } from '../financial/principal.js';

export class FinancialRateLimits implements FinancialRateLimitPort {
  constructor(
    private readonly service: RateLimitService,
    private readonly keys: RateLimitKeyHasher,
  ) {}

  subjectKeyFor(principal: FinancialPrincipal): string {
    return this.keys.subjectKey(principal.tenantId, principal.userId);
  }

  assertWithinLimit(policy: RateLimitPolicy, subjectKey: string): Promise<void> {
    return this.service.assertWithinLimit(policy, subjectKey);
  }
}
