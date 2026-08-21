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
  /**
   * ---------------------------------------------------------------------
   * Financial surface (Phase 5). SECURITY/AVAILABILITY ceilings, not product
   * quotas: none of these is a subscription limit, a billing entitlement or a
   * jurisdiction rule, and none may ever be presented to a person as one.
   *
   * The numbers are derived from what the real client does and what an
   * admitted request costs the server, recorded per policy below. They are
   * ENGINEERING budgets, exactly as `packages/platform/src/ingestion/limits.ts`
   * says of its own — no legal or regulatory claim attaches to any of them.
   *
   * Resource limits and rate limits are complementary and BOTH apply: the
   * ingestion policy bounds what ONE admitted request may cost, and these
   * bound how many a principal may issue. The CSV parser proved the gap in
   * between — a request inside every byte bound that still became an
   * availability problem.
   *
   * Every financial policy fails CLOSED except the read: a write admitted
   * during a limiter outage is unbounded mutation of money records, which is
   * the same trade this file already makes for credential surfaces.
   * ---------------------------------------------------------------------
   */
  /**
   * Ordinary financial reads. One accounts screen is up to 20 requests
   * (page limit 100, maximum 20 pages), a categories load up to 20 more, an
   * account detail screen 4 concurrent reads, and every write invalidates one
   * to three of them. 300 per five minutes is roughly six full cold-start-plus-
   * browse cycles and still bounds bulk scraping of a person's records.
   *
   * The ONE financial policy that falls back rather than failing closed, on
   * the same reasoning as `refresh`: an authenticated, capability-cleared read
   * of one's own records has no guessing surface worth blanking every balance
   * screen for during a Redis outage, and the in-process fallback still bounds
   * volume per instance.
   */
  financialRead: {
    name: 'financial_read',
    limit: 300,
    windowMs: 5 * MINUTE_MS,
    onStoreFailure: 'fail_open_fallback',
  },
  /**
   * Ordinary financial writes: account create/correct, transaction
   * create/correct/delete, category assignment, import draft. Every one is a
   * hand-driven form submission, and the manual ingestion policy declares
   * `maxRows: 1`. 60 per five minutes is one write every five seconds
   * sustained — far above any human rate, far below a script's.
   */
  financialWrite: {
    name: 'financial_write',
    limit: 60,
    windowMs: 5 * MINUTE_MS,
    onStoreFailure: 'fail_closed',
  },
  /**
   * Statement source upload. Each admitted upload may carry
   * `csvStatementImport.maxBytes` = 10 MiB into encrypted object storage
   * BEFORE any parse, so 10 per hour caps one principal at 100 MiB/hour of
   * stored source bytes. The client issues exactly one upload per chosen file.
   */
  financialStatementUpload: {
    name: 'financial_statement_upload',
    limit: 10,
    windowMs: 60 * MINUTE_MS,
    onStoreFailure: 'fail_closed',
  },
  /**
   * Statement parse and preview. A parse is bounded by `maxRows` 50,000 and
   * `deadlineMs` 30,000, so up to 30 seconds of CPU each; 30 per hour caps one
   * principal at 15 minutes of parser time per hour. Higher than the upload
   * budget because the column-mapping screen legitimately re-parses the same
   * stored source after a mapping correction.
   */
  financialStatementParse: {
    name: 'financial_statement_parse',
    limit: 30,
    windowMs: 60 * MINUTE_MS,
    onStoreFailure: 'fail_closed',
  },
  /**
   * Statement commit and erase. Each opens one transaction writing up to
   * `maxBatchSize` 500 rows across two bounded contexts, or deletes stored
   * source bytes. The client issues exactly one per import, so 20 per hour is
   * twice the upload budget and covers idempotent retries.
   */
  financialCommit: {
    name: 'financial_commit',
    limit: 20,
    windowMs: 60 * MINUTE_MS,
    onStoreFailure: 'fail_closed',
  },
  /**
   * Transfer-match confirm and reject. Per-match state mutations a person taps
   * through a list whose page size is 50; 120 per hour clears two full pages
   * plus corrections, and bounds an enumeration that flips relationships in
   * bulk.
   */
  financialTransferDecision: {
    name: 'financial_transfer_decision',
    limit: 120,
    windowMs: 60 * MINUTE_MS,
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
