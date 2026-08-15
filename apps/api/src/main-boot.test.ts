/**
 * Boot lifecycle tests against the BUILT entrypoint (dist/main.js): config
 * fail-fast and SIGTERM graceful shutdown. They spawn real processes and need
 * `pnpm build` to have run first — they skip (loudly) when dist is missing.
 * No database is required: the probe pool connects lazily.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// __dirname: this package compiles to CommonJS (vitest provides it in-runner).
const API_DIR = path.resolve(__dirname, '..');
const DIST_MAIN = path.join(API_DIR, 'dist', 'main.js');
const distBuilt = existsSync(DIST_MAIN);

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
    }, 20_000);
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
    expect(result.stderr).toContain('must be one of local|dev|staging|production');
    expect(result.stderr).not.toContain('prodcution-typo-value');
  });

  it('exits nonzero when required non-local fields are missing, listing every field name', async () => {
    const result = await bootProcess({
      KARAR_ENV: 'staging',
      POSTGRES_PASSWORD: 'should-never-print',
    });
    expect(result.code).toBe(1);
    for (const field of [
      'database.host (POSTGRES_HOST)',
      'database.port (POSTGRES_PORT)',
      'database.name (POSTGRES_DB)',
      'database.user (POSTGRES_USER)',
    ]) {
      expect(result.stderr).toContain(field);
    }
    expect(result.stderr).not.toContain('should-never-print');
  });
});

describe.skipIf(!distBuilt)('graceful shutdown (spawned dist/main.js)', () => {
  it('boots with local config, then exits cleanly on SIGTERM after flushing', async () => {
    const port = 3200 + (process.pid % 500);
    let signalled = false;
    const result = await bootProcess(
      {
        KARAR_ENV: 'local',
        PORT: String(port),
        KARAR_TELEMETRY_ENABLED: 'false',
        KARAR_LOG_LEVEL: 'info',
      },
      (child, stdoutSoFar) => {
        if (!signalled && stdoutSoFar().includes('api listening')) {
          signalled = true;
          child.kill('SIGTERM');
        }
      },
    );
    // Nest re-raises the signal after hooks run: a clean shutdown terminates
    // via SIGTERM (or exit 0), never via a crash code — and the coordinator's
    // completion line proves the pool drain + telemetry flush ran.
    expect(result.stdout).toContain('api listening');
    expect(result.stdout).toContain('shutting down');
    expect(result.stdout).toContain('shutdown complete');
    if (result.signal !== null) {
      expect(result.signal).toBe('SIGTERM');
    } else {
      expect([0, 143]).toContain(result.code);
    }
    expect(result.stderr).toBe('');
  });
});
