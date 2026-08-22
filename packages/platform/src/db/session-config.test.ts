/**
 * Every session runs in UTC, proved against a live server rather than assumed.
 *
 * WHY THIS SUITE EXISTS. Prisma reported `timestamptz` values shifted by the
 * session's UTC offset while the `pg` driver reported the same row correctly,
 * so every Prisma time-window predicate was wrong by that offset on any server
 * whose session timezone was not UTC. Eleven integration tests across
 * authorization, control-plane and subject-policy failed on a UTC+3 server and
 * passed on a UTC one — the kind of defect that is invisible in CI (whose
 * container runs UTC) and appears only on somebody's laptop or in whichever
 * managed instance was provisioned with a local timezone.
 *
 * The assertions below deliberately do NOT set the server's timezone first.
 * They read whatever the server is configured with and require the SESSION to
 * be UTC regardless, because that is the actual guarantee: nothing in a
 * financial ledger may depend on a setting that lives on somebody's machine
 * rather than in this repository.
 */

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { PostgresPersistenceAdapter } from './adapter.js';
import { skipUnlessDatabaseRequired } from './connection-budget.js';
import { LocalPostgresConnectionProfile, maintenanceDatabase } from './connection-profile.js';
import { createPrismaClient } from './prisma.js';
import {
  REQUIRED_SESSION_TIME_ZONE,
  SESSION_STARTUP_OPTIONS,
  SessionTimeZoneError,
  assertSessionTimeZoneIsUtc,
  poolConfigFor,
} from './session-config.js';

const profile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

/**
 * Reachability, ROUTED THROUGH THE GLOBAL REQUIREMENT.
 *
 * This probe used to swallow its exception and return `false`, and this file
 * was named in `scripts/checks/integration-required-setup.mts` as the one
 * test of the Prisma-session timezone pinning. The global setup closed the
 * case where the port is shut: it opens a socket before collection and fails
 * the run. It cannot close the case where the port ANSWERS and the connection
 * still fails — a wrong role password, a missing maintenance database, an
 * exhausted connection limit, an auth method the client cannot satisfy. Every
 * one of those left this suite skipping green inside a run that had declared
 * the database required.
 *
 * `skipUnlessDatabaseRequired` is the single decision the rest of the
 * repository's fixtures already ask. It throws under `KARAR_INTEGRATION=1`
 * with the suite named and the driver's own reason attached, and returns a
 * skip otherwise — so a developer without a database still runs the pure
 * assertions above, and a verification run cannot.
 */
async function unreachableReason(): Promise<string | null> {
  const client = new pg.Client({
    host: profile.host,
    port: profile.port,
    database: profile.database,
    user: profile.user,
    password: profile.password.unwrap(),
  });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (error) {
    await client.end().catch(() => {});
    return error instanceof Error ? error.message : String(error);
  }
}

const skipped = skipUnlessDatabaseRequired(
  'platform session-config suite (live PostgreSQL)',
  await unreachableReason(),
);

describe('pool configuration', () => {
  it('pins the session timezone as a startup parameter, not a statement', () => {
    // A startup parameter is applied by the server before the session is
    // usable, so a connection opened later — under load, or to replace one the
    // server dropped — cannot miss it. A `SET` issued once after construction
    // would reach only the connections that existed at that moment.
    expect(poolConfigFor(profile).options).toBe(SESSION_STARTUP_OPTIONS);
    expect(SESSION_STARTUP_OPTIONS).toContain(REQUIRED_SESSION_TIME_ZONE);
  });

  it('gives both pools the same session defaults', () => {
    // The Prisma factory previously set none of these. Two builders for one
    // concept drift silently, which is how a session property became true on
    // one path and false on the other while every test passed.
    const config = poolConfigFor(profile);
    expect(config.application_name).toBe(`karar:${profile.name}`);
    expect(config.statement_timeout).toBe(profile.statementTimeoutMs);
    expect(config.lock_timeout).toBe(profile.lockTimeoutMs);
    expect(config.max).toBe(profile.poolMax);
  });
});

describe.skipIf(skipped)('every session is UTC on a live server', () => {
  const adapter = new PostgresPersistenceAdapter(profile);
  const prisma = createPrismaClient(profile);

  afterAll(async () => {
    await adapter.end();
    await prisma.end();
  });

  it('the server itself may be in any timezone — that is the point', async () => {
    // Read, never set. If this run happens to be on a UTC server the suite
    // still proves the session parameter is applied; on a non-UTC server it
    // additionally proves the session does not inherit it.
    const server = await adapter.query<{ TimeZone: string }>('SHOW TimeZone');
    expect(typeof server.rows[0]?.TimeZone).toBe('string');
  });

  it('the raw adapter session reports UTC', async () => {
    const result = await adapter.query<{ TimeZone: string }>('SHOW TimeZone');
    expect(result.rows[0]?.TimeZone).toBe(REQUIRED_SESSION_TIME_ZONE);
  });

  it('the Prisma session reports UTC', async () => {
    const rows = await prisma.client.$queryRaw<Array<{ TimeZone: string }>>`SHOW TimeZone`;
    expect(rows[0]?.TimeZone).toBe(REQUIRED_SESSION_TIME_ZONE);
  });

  it('Prisma and the pg driver now agree on the same instant — the original defect', async () => {
    // THE REGRESSION. These two disagreed by exactly the server's UTC offset,
    // reading the same value in the same session. Compared as epoch millis so
    // a failure reports a real time difference rather than a string mismatch.
    const raw = await adapter.query<{ now: Date }>('SELECT now() AS now');
    const orm = await prisma.client.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
    const rawMs = new Date(String(raw.rows[0]?.now)).getTime();
    const ormMs = new Date(String(orm[0]?.now)).getTime();
    // Two round trips, so a small real elapsed difference is expected; an
    // offset defect is a whole number of half-hours at minimum.
    expect(Math.abs(rawMs - ormMs)).toBeLessThan(60_000);
  });

  it('a session opened WITHOUT the startup parameter is refused by the assertion', async () => {
    // The negative control. Without it this suite could pass because the
    // assertion never rejects anything. This connection deliberately bypasses
    // `poolConfigFor`, which is the only way a non-UTC session can reach the
    // application at all.
    const bare = new pg.Client({
      host: profile.host,
      port: profile.port,
      database: profile.database,
      user: profile.user,
      password: profile.password.unwrap(),
      options: '-c timezone=Asia/Qatar',
    });
    await bare.connect();
    try {
      await expect(assertSessionTimeZoneIsUtc(bare)).rejects.toBeInstanceOf(SessionTimeZoneError);
      await expect(assertSessionTimeZoneIsUtc(bare)).rejects.toMatchObject({
        reported: 'Asia/Qatar',
      });
    } finally {
      await bare.end();
    }
  });
});
