/**
 * Rate-limit policies (backend.md §10, legacy API-01 HIGH).
 *
 * Every limited surface declares its policy HERE, with an explicit
 * store-failure mode — what happens when Redis is down is a security
 * decision made per endpoint at design time, never improvised in a handler:
 *
 * - `fail_closed`: the request is refused with DEPENDENCY_UNAVAILABLE (503).
 *   Chosen for every credential-guessing surface (login, verification,
 *   reset, MFA): an attacker who can take the limiter down must not thereby
 *   gain an unlimited guessing window.
 * - `fail_open_fallback`: the request proceeds under a small in-process
 *   sliding-window fallback. Chosen ONLY for refresh: refresh presents an
 *   unguessable 256-bit token (no guessing surface worth protecting at the
 *   cost of signing everyone out during a Redis outage), and the fallback
 *   still bounds volume per instance. The fallback is per-process, not
 *   distributed — a documented, deliberately-small degradation, metered so
 *   an outage is visible.
 */

export type StoreFailureMode = 'fail_closed' | 'fail_open_fallback';

export interface RateLimitPolicy {
  /** Stable policy name; part of the storage key and the metric attributes. */
  readonly name: string;
  /** Maximum requests per window. */
  readonly limit: number;
  /** Sliding window length in milliseconds. */
  readonly windowMs: number;
  readonly onStoreFailure: StoreFailureMode;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The platform's declared policies. Identity consumes most of these;
 * `invitationSend` is exported for the tenancy workstream's invitation flow.
 */
export const RATE_LIMIT_POLICIES = {
  /** Login attempts per account digest. */
  loginPerAccount: {
    name: 'login_account',
    limit: 10,
    windowMs: 15 * MINUTE_MS,
    onStoreFailure: 'fail_closed',
  },
  /** Login attempts per client IP digest. */
  loginPerIp: {
    name: 'login_ip',
    limit: 30,
    windowMs: 15 * MINUTE_MS,
    onStoreFailure: 'fail_closed',
  },
  /** Verification e-mails sent per account digest. */
  verificationSend: {
    name: 'verification_send',
    limit: 3,
    windowMs: HOUR_MS,
    onStoreFailure: 'fail_closed',
  },
  /** Password-reset e-mails sent per account digest. */
  resetSend: {
    name: 'reset_send',
    limit: 3,
    windowMs: HOUR_MS,
    onStoreFailure: 'fail_closed',
  },
  /** MFA code/recovery verification attempts per account digest. */
  mfaVerify: {
    name: 'mfa_verify',
    limit: 10,
    windowMs: 15 * MINUTE_MS,
    onStoreFailure: 'fail_closed',
  },
  /** Refresh-token presentations per session/account digest. */
  refresh: {
    name: 'refresh',
    limit: 60,
    windowMs: 15 * MINUTE_MS,
    onStoreFailure: 'fail_open_fallback',
  },
  /** Tenant invitations sent per inviter digest (consumed by the tenancy module). */
  invitationSend: {
    name: 'invitation_send',
    limit: 20,
    windowMs: HOUR_MS,
    onStoreFailure: 'fail_closed',
  },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName =
  (typeof RATE_LIMIT_POLICIES)[keyof typeof RATE_LIMIT_POLICIES]['name'];

/**
 * The path a rate-limit (or any edge) policy is selected FROM: decoded and
 * normalized, never the raw URI (legacy API-01 — `//login` and `/login%2f`
 * must select the same policy as `/login`). Strips query and fragment,
 * percent-decodes (an undecodable path keeps its raw form rather than
 * throwing at the edge), collapses duplicate slashes, removes the trailing
 * slash, lowercases.
 */
export function normalizePolicyPath(rawUrl: string): string {
  const withoutQuery = rawUrl.split(/[?#]/, 1)[0] ?? '';
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    // Malformed escapes: normalize what we can; the raw form still cannot
    // collide with a decoded one after the steps below.
  }
  let path = decoded.replace(/\/{2,}/g, '/').toLowerCase();
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}
