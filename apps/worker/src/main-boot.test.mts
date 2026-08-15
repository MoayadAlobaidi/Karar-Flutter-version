/**
 * Boot lifecycle tests against the BUILT entrypoint (dist/main.js): config
 * fail-fast, and — with a live PostgreSQL — a REAL boot serving /healthz and
 * /readyz followed by a clean SIGTERM. They spawn real processes and need
 * `pnpm build` first; they skip (loudly for the database half) when
 * prerequisites are missing. Mirrors apps/api/src/main-boot.test.ts.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  LocalPostgresConnectionProfile,
  PostgresPersistenceAdapter,
  bootstrapRolesAndDatabase,
  maintenanceDatabase,
  migrateToLatest,
} from '@karar/platform/dist/db/index.js';

const WORKER_DIR = fileURLToPath(new URL('..', import.meta.url));
const DIST_MAIN = path.join(WORKER_DIR, 'dist', 'main.js');
const distBuilt = existsSync(DIST_MAIN);

const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

async function probePostgres(): Promise<boolean> {
  const probe = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe.query('SELECT 1'),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), 3_000);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    await probe.end().catch(() => undefined);
  }
}

const postgresUp = await probePostgres();

interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function bootProcess(
  env: Record<string, string>,
  interact?: (child: ReturnType<typeof spawn>, stdoutSoFar: () => string) => void,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DIST_MAIN], {
      env: { PATH: process.env['PATH'] ?? '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`boot test timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 30_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      interact?.(child, () => stdout);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
    child.on('error', reject);
  });
}

describe.skipIf(!distBuilt)('boot fail-fast (spawned dist/main.js)', () => {
  it('exits nonzero on an unknown KARAR_ENV, naming the field but never the value', async () => {
    const result = await bootProcess({ KARAR_ENV: 'prodcution-typo-value' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Invalid configuration');
    expect(result.stderr).toContain('env (KARAR_ENV)');
    expect(result.stderr).not.toContain('prodcution-typo-value');
  });

  it('exits nonzero on a malformed worker setting, naming the field but never the value', async () => {
    const result = await bootProcess({
      KARAR_ENV: 'local',
      KARAR_WORKER_PORT: 'not-a-port-value',
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('KARAR_WORKER_PORT');
    expect(result.stderr).not.toContain('not-a-port-value');
  });
});

describe.skipIf(!distBuilt || !postgresUp)(
  'boot, health, SIGTERM (spawned dist/main.js, live PostgreSQL)',
  () => {
    it('boots against a migrated database, serves /healthz and /readyz, exits cleanly on SIGTERM', async () => {
      // Real foundation for the spawned process: scratch database, migrated.
      const scratchDb = `karar_test_${process.pid}_workerboot`;
      await bootstrapRolesAndDatabase({ database: scratchDb });
      const migrator = new PostgresPersistenceAdapter(
        LocalPostgresConnectionProfile.fromEnv('migrator', { database: scratchDb }),
      );
      try {
        await migrateToLatest({ adapter: migrator });
      } finally {
        await migrator.end();
      }

      const port = 3300 + (process.pid % 500);
      let signalled = false;
      try {
        const result = await bootProcess(
          {
            KARAR_ENV: 'local',
            KARAR_DB_NAME: scratchDb,
            POSTGRES_PORT: String(superuserMaintenanceProfile.port),
            KARAR_WORKER_PORT: String(port),
            KARAR_OUTBOX_RELAY_INTERVAL_MS: '100',
            KARAR_JOBS_POLL_INTERVAL_MS: '100',
            KARAR_TELEMETRY_ENABLED: 'false',
            KARAR_LOG_LEVEL: 'info',
          },
          (child, stdoutSoFar) => {
            if (signalled || !stdoutSoFar().includes('worker ready')) return;
            signalled = true;
            // Probe both endpoints while the process runs, then terminate it.
            void (async () => {
              try {
                const base = `http://127.0.0.1:${port}`;
                const live = await fetch(`${base}/healthz`);
                expect(live.status).toBe(200);
                const deadline = Date.now() + 10_000;
                for (;;) {
                  const ready = await fetch(`${base}/readyz`);
                  const body = (await json(ready)) as { status: string };
                  if (ready.status === 200 && body.status === 'ok') break;
                  if (Date.now() > deadline) {
                    throw new Error(`readyz never turned ok: ${JSON.stringify(body)}`);
                  }
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
              } finally {
                child.kill('SIGTERM');
              }
            })();
          },
        );

        // Clean shutdown: the coordinator's lines prove intake stopped, claims
        // released, pool drained, telemetry flushed — and no crash exit code.
        expect(result.stdout).toContain('worker ready');
        expect(result.stdout).toContain('shutting down');
        expect(result.stdout).toContain('shutdown complete');
        if (result.signal !== null) {
          expect(result.signal).toBe('SIGTERM');
        } else {
          expect([0, 143]).toContain(result.code);
        }
        expect(result.stderr).toBe('');
      } finally {
        const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
        try {
          await maintenance.query(`DROP DATABASE IF EXISTS "${scratchDb}" WITH (FORCE)`);
        } finally {
          await maintenance.end();
        }
      }
    }, 60_000);
  },
);

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
