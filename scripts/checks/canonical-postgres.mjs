#!/usr/bin/env node
// Canonical verification database — the SERVER must be PostgreSQL 17, and every
// application session on it must run in UTC.
//
// This exists because the project has now reported a misleading PostgreSQL
// version more than once. A checkpoint claimed "all runs are against PostgreSQL
// 17.10" while the instance serving port 5432 was 16.14; 17 was installed on the
// machine and not running. `psql --version` is the CLIENT and cannot tell you
// that, so this check asks the SERVER and nothing else.
//
// Two properties, both machine-checked:
//
//   1. server_version_num >= 170000 and < 180000. The repository's canonical
//      image is `postgres:17-alpine` (docker-compose.yml) and CI starts it, so a
//      run against any other major is not the gate it claims to be.
//   2. The application session TimeZone is UTC — regardless of the SERVER's own
//      default. That is fix F3: `TimeZone` is a connection STARTUP parameter, so
//      a pool cannot hand out a session that missed it. The check is meaningful
//      exactly when the server default is NOT UTC, which is the Asia/Qatar
//      configuration the gate runs in.
//
// This is a TEST/CI gate. It deliberately does NOT constrain the production
// runtime, which the architecture does not pin to a major version.
//
// Run: node scripts/checks/canonical-postgres.mjs [--self-test]
// Zero dependencies beyond the workspace's own platform package and pg.

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

/** The canonical major. Bump only with the compose image and CI together. */
export const REQUIRED_SERVER_MAJOR = 17;
const MIN_VERSION_NUM = REQUIRED_SERVER_MAJOR * 10000;
const MAX_VERSION_NUM = (REQUIRED_SERVER_MAJOR + 1) * 10000;

/** The only timezone a Karar session runs in. Mirrors REQUIRED_SESSION_TIME_ZONE. */
export const REQUIRED_SESSION_TIME_ZONE = 'UTC';

/**
 * Judges an already-collected observation. Pure, so the self-test can exercise
 * every branch without a database — the thing that makes a gate like this
 * vacuous is that nobody can run it without the exact server it checks for.
 *
 * @param {{serverVersionNum: unknown, serverVersion: unknown, sessionTimeZone: unknown}} observed
 * @returns {string[]} problems; empty means the gate passes
 */
export function judgeCanonicalPostgres(observed) {
  const problems = [];
  const num = Number.parseInt(String(observed.serverVersionNum ?? ''), 10);
  if (!Number.isInteger(num)) {
    problems.push(
      `server_version_num is ${JSON.stringify(observed.serverVersionNum)} — the server did not answer, so nothing about it is verified`,
    );
  } else if (num < MIN_VERSION_NUM || num >= MAX_VERSION_NUM) {
    const major = Math.floor(num / 10000);
    problems.push(
      `server is PostgreSQL major ${major} (server_version ${observed.serverVersion}, server_version_num ${num}); ` +
        `the canonical verification database is major ${REQUIRED_SERVER_MAJOR} (docker-compose.yml pins postgres:${REQUIRED_SERVER_MAJOR}-alpine). ` +
        `A run against another major is supplemental evidence, not this gate`,
    );
  }
  if (observed.sessionTimeZone !== REQUIRED_SESSION_TIME_ZONE) {
    problems.push(
      `application session TimeZone is ${JSON.stringify(observed.sessionTimeZone)}, not ${REQUIRED_SESSION_TIME_ZONE} — ` +
        `the startup parameter that pins it did not reach this session (fix F3), and temporal comparisons are unsafe`,
    );
  }
  return problems;
}

/** Asks the SERVER. Never `psql --version`, which reports the client. */
async function observe() {
  const { LocalPostgresConnectionProfile, PostgresPersistenceAdapter } = await import(
    path.join(REPO_ROOT, 'packages', 'platform', 'dist', 'db', 'index.js')
  );
  const profile = LocalPostgresConnectionProfile.fromEnv('superuser');
  const adapter = new PostgresPersistenceAdapter(profile);
  try {
    const rows = await adapter.query(
      "SELECT current_setting('server_version') AS server_version, " +
        "current_setting('server_version_num') AS server_version_num, " +
        "current_setting('TimeZone') AS session_time_zone",
    );
    const row = rows.rows[0] ?? {};
    return {
      serverVersion: row.server_version,
      serverVersionNum: row.server_version_num,
      sessionTimeZone: row.session_time_zone,
      host: profile.host,
      port: profile.port,
    };
  } finally {
    await adapter.close?.();
  }
}

/**
 * Seeded cases. Every branch of the judgement, including the exact
 * misreport this check was written for: a 16.14 server presented as canonical.
 */
const SELF_TEST_CASES = [
  {
    name: 'canonical: 17.11 server, UTC session',
    observed: { serverVersion: '17.11', serverVersionNum: '170011', sessionTimeZone: 'UTC' },
    expectProblem: null,
  },
  {
    name: 'the misreport this check exists for: 16.14 presented as canonical',
    observed: { serverVersion: '16.14', serverVersionNum: '160014', sessionTimeZone: 'UTC' },
    expectProblem: /major 16/,
  },
  {
    name: 'a future major is not silently accepted either',
    observed: { serverVersion: '18.1', serverVersionNum: '180001', sessionTimeZone: 'UTC' },
    expectProblem: /major 18/,
  },
  {
    name: 'right server, session timezone not pinned',
    observed: { serverVersion: '17.11', serverVersionNum: '170011', sessionTimeZone: 'Asia/Qatar' },
    expectProblem: /session TimeZone/,
  },
  {
    name: 'server did not answer at all',
    observed: { serverVersion: undefined, serverVersionNum: undefined, sessionTimeZone: 'UTC' },
    expectProblem: /did not answer/,
  },
  {
    name: 'both wrong: reported as two problems, not one',
    observed: { serverVersion: '16.14', serverVersionNum: '160014', sessionTimeZone: 'Asia/Qatar' },
    expectProblem: /major 16/,
    expectCount: 2,
  },
];

function runSelfTest() {
  const failures = [];
  for (const testCase of SELF_TEST_CASES) {
    const problems = judgeCanonicalPostgres(testCase.observed);
    if (testCase.expectProblem === null) {
      if (problems.length > 0) {
        failures.push(`${testCase.name}: expected no problem, got: ${problems.join(' | ')}`);
      }
      continue;
    }
    if (problems.length === 0) {
      failures.push(`${testCase.name}: did NOT fail on the seeded violation — the rule is vacuous`);
      continue;
    }
    if (!problems.some((problem) => testCase.expectProblem.test(problem))) {
      failures.push(
        `${testCase.name}: failed, but not on the seeded violation (${testCase.expectProblem}); got: ${problems.join(' | ')}`,
      );
    }
    if (testCase.expectCount !== undefined && problems.length !== testCase.expectCount) {
      failures.push(
        `${testCase.name}: expected ${testCase.expectCount} problems, got ${problems.length}`,
      );
    }
  }
  return failures;
}

async function main() {
  const selfTestOnly = process.argv.includes('--self-test');
  const failures = runSelfTest();
  if (failures.length > 0) {
    console.error(`SELF-TEST FAIL (${failures.length}/${SELF_TEST_CASES.length} cases):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  if (selfTestOnly) {
    console.log(`SELF-TEST PASS — all ${SELF_TEST_CASES.length} cases hold`);
    return;
  }

  let observed;
  try {
    observed = await observe();
  } catch (error) {
    console.error(`canonical-postgres: could not reach the database — ${error.message}`);
    process.exit(1);
  }

  const problems = judgeCanonicalPostgres(observed);
  console.log(
    `canonical-postgres: ${observed.host}:${observed.port} — PostgreSQL ${observed.serverVersion} ` +
      `(server_version_num ${observed.serverVersionNum}), session TimeZone ${observed.sessionTimeZone}`,
  );
  if (problems.length > 0) {
    console.error(`FAIL (${problems.length}):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `PASS — canonical major ${REQUIRED_SERVER_MAJOR}, session pinned to ${REQUIRED_SESSION_TIME_ZONE}; ` +
      `self-test ok over ${SELF_TEST_CASES.length} cases`,
  );
}

await main();
