/**
 * The ONE place a PostgreSQL session is configured, used by both pools.
 *
 * ## Why this file exists
 *
 * There were two `pg.Pool` constructions with different options: the raw
 * adapter set `application_name`, `statement_timeout`, `lock_timeout` and TLS;
 * the Prisma factory set none of them. Two builders for one concept drift
 * silently, and they had — which is how a session setting could be true on one
 * path and false on the other while every test passed.
 *
 * ## Why the timezone is a STARTUP parameter and not a statement
 *
 * `TimeZone` is set through the connection `options` string, which PostgreSQL
 * applies when it starts the session. That matters more than it looks:
 *
 * - A pool hands out connections that were opened at arbitrary times, and it
 *   opens new ones whenever demand rises or a server drops an idle client. A
 *   `SET TimeZone` issued once after construction reaches the connections that
 *   existed then and misses every connection created afterwards — a defect
 *   that would appear only under load, which is the worst time to find it.
 * - Issuing `SET TimeZone` per checkout would be correct but costs a round
 *   trip on every acquisition, and it is still skippable by any code path that
 *   forgets. A startup parameter cannot be forgotten, because the server
 *   applies it before the session is usable.
 *
 * ## Why UTC is pinned rather than assumed
 *
 * Prisma reports `timestamptz` values shifted by the session's UTC offset,
 * while the `pg` driver reports the same row correctly. Reading one row inside
 * one transaction, the two disagreed by exactly the server's offset. Every
 * Prisma time-window predicate was therefore wrong by that offset on any
 * server whose session timezone was not UTC: a fresh grant read as not yet
 * effective, and — the direction that matters — a time-bounded window read as
 * still open for `offset` hours after it should have closed.
 *
 * The database server's own `timezone` setting is NOT the fix. It is a
 * property of somebody's machine, container image or managed-instance default;
 * it is not in this repository, it is not reviewed, and it changes without a
 * commit. Nothing in a financial ledger may depend on it. So each session
 * states its own timezone and `assertSessionTimeZoneIsUtc` proves it, rather
 * than trusting a deployment to have been configured correctly.
 */

import type pg from 'pg';

import type { ConnectionProfile } from './connection-profile.js';

/** The only timezone any Karar session runs in. */
export const REQUIRED_SESSION_TIME_ZONE = 'UTC';

/**
 * Startup parameters, applied by the server before the session is usable.
 *
 * Written as `-c <guc>=<value>` pairs. There is deliberately no way for a
 * caller to add to this string: a session setting that varies by call site is
 * the thing this module exists to prevent.
 */
export const SESSION_STARTUP_OPTIONS = `-c timezone=${REQUIRED_SESSION_TIME_ZONE}`;

/**
 * The pool configuration for a profile — everything both pools must agree on.
 *
 * `statement_timeout` and `lock_timeout` are driver-level startup parameters
 * too, so a session carries them without a per-checkout round trip.
 */
export function poolConfigFor(profile: ConnectionProfile): pg.PoolConfig {
  return {
    host: profile.host,
    port: profile.port,
    database: profile.database,
    user: profile.user,
    // The only place the secret is revealed; the driver keeps it internal.
    password: profile.password.unwrap(),
    max: profile.poolMax,
    application_name: `karar:${profile.name}`,
    statement_timeout: profile.statementTimeoutMs,
    lock_timeout: profile.lockTimeoutMs,
    options: SESSION_STARTUP_OPTIONS,
    // Local profiles run without TLS; cloud profiles map their SslConfig to
    // driver TLS options when a cloud deployment phase adds them
    // (database-portability.md, section 2).
    ...(profile.ssl.mode === 'disable' ? {} : { ssl: true }),
  };
}

/** What the session actually reported, when it was not what was required. */
export class SessionTimeZoneError extends Error {
  override readonly name = 'SessionTimeZoneError';
  readonly reported: string;

  constructor(reported: string) {
    super(
      `PostgreSQL session reports TimeZone='${reported}', not '${REQUIRED_SESSION_TIME_ZONE}'. ` +
        'Every session is opened with a startup parameter that pins it, so this means the ' +
        'connection did not come through the platform pool configuration. Timestamps read on ' +
        'this session would be shifted by the offset, silently and in both directions',
    );
    this.reported = reported;
  }
}

/**
 * Proves the session is in UTC, rather than assuming the startup parameter
 * took effect.
 *
 * A startup parameter can be overridden by a `PGOPTIONS` environment variable,
 * by an `ALTER ROLE ... SET`, or by a connection that never came through
 * `poolConfigFor` at all. The assertion costs one round trip at readiness and
 * turns each of those into a loud failure instead of arithmetic that is wrong
 * by a whole-hour offset.
 */
export async function assertSessionTimeZoneIsUtc(session: {
  query(text: string): Promise<{ rows: Array<Record<string, unknown>> }>;
}): Promise<void> {
  const result = await session.query('SHOW TimeZone');
  const reported = String(result.rows[0]?.['TimeZone'] ?? '');
  if (reported !== REQUIRED_SESSION_TIME_ZONE) throw new SessionTimeZoneError(reported);
}
