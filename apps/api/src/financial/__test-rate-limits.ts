/**
 * A REAL limiter for tests, not a no-op stub.
 *
 * The 27-route sweeps and the capability suite run against an actual
 * `RateLimitService` over the in-process limiter and the real policy table, so
 * a policy accidentally set to zero, or a subject key that collapses two
 * principals into one budget, surfaces in those suites too rather than only in
 * the one file that looks for it.
 */

import { SecretValue } from '@karar/platform/dist/config/index.js';
import {
  InProcessRateLimiter,
  RateLimitKeyHasher,
  RateLimitService,
} from '@karar/platform/dist/ratelimit/index.js';

import { FinancialRateLimits } from '../composition/financial-rate-limits.js';
import type { FinancialRateLimitPort } from './rate-limit-port.js';

export function testRateLimits(): FinancialRateLimitPort {
  return new FinancialRateLimits(
    new RateLimitService({ primary: new InProcessRateLimiter() }),
    new RateLimitKeyHasher(new SecretValue('test-pepper-at-least-sixteen-chars')),
  );
}
