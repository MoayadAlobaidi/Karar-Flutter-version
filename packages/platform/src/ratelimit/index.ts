// @karar/platform ratelimit — distributed sliding-window rate limiting with
// per-policy, design-time store-failure modes (backend.md §10; API-01).
export {
  RATE_LIMIT_POLICIES,
  normalizePolicyPath,
  type RateLimitPolicy,
  type RateLimitPolicyName,
  type StoreFailureMode,
} from './policy.js';
export { RateLimitKeyHasher, storageKey, type RateLimitSubjectKey } from './keys.js';
export {
  slideWindow,
  type RateLimitCheck,
  type RateLimitDecision,
  type RateLimiter,
} from './limiter.js';
export { InProcessRateLimiter } from './in-process-rate-limiter.js';
export {
  RateLimitStoreError,
  RedisSlidingWindowRateLimiter,
  createRateLimitRedisClient,
  type RedisEvalClient,
} from './redis-rate-limiter.js';
export {
  RATE_LIMIT_METRIC_NAMES,
  RateLimitService,
  type RateLimitServiceOptions,
} from './rate-limit-service.js';
