import { describe, expect, it } from 'vitest';
import { startHealthServer, type WorkerReadinessReport } from './health-server.js';

const readyReport: WorkerReadinessReport = {
  ready: true,
  checks: { postgres: 'up', migrations: 'ok', outboxRelay: 'alive', jobPoller: 'alive' },
};

async function withServer(
  readiness: () => Promise<WorkerReadinessReport>,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  // Port 0: the OS picks a free port; the handle reports it.
  const handle = await startHealthServer({ port: 0, readiness });
  try {
    await fn(`http://127.0.0.1:${handle.port}`);
  } finally {
    await handle.close();
  }
}

describe('worker health server', () => {
  it('serves liveness regardless of readiness', async () => {
    await withServer(
      () => Promise.reject(new Error('dependencies exploded')),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/healthz`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: 'ok' });
      },
    );
  });

  it('answers 200 with per-check states when ready', async () => {
    await withServer(
      () => Promise.resolve(readyReport),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/readyz`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: 'ok', checks: readyReport.checks });
      },
    );
  });

  it('answers 503 with the failing states when not ready', async () => {
    const notReady: WorkerReadinessReport = {
      ready: false,
      checks: { postgres: 'down', migrations: 'unknown', outboxRelay: 'stale', jobPoller: 'alive' },
    };
    await withServer(
      () => Promise.resolve(notReady),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/readyz`);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ status: 'unavailable', checks: notReady.checks });
      },
    );
  });

  it('answers 503 states-only when the readiness evaluation itself throws', async () => {
    await withServer(
      () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:5433 password=karar_dev_password')),
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/readyz`);
        expect(response.status).toBe(503);
        const body = await response.text();
        expect(JSON.parse(body)).toEqual({ status: 'unavailable' });
        // The failure reason never reaches the response.
        for (const leaked of ['ECONNREFUSED', '5433', 'password', 'karar_dev_password']) {
          expect(body).not.toContain(leaked);
        }
      },
    );
  });

  it('unknown paths are 404 and non-GET methods are 405', async () => {
    await withServer(
      () => Promise.resolve(readyReport),
      async (baseUrl) => {
        expect((await fetch(`${baseUrl}/metrics`)).status).toBe(404);
        expect((await fetch(`${baseUrl}/readyz`, { method: 'POST' })).status).toBe(405);
      },
    );
  });

  it('binds loopback only', async () => {
    const handle = await startHealthServer({
      port: 0,
      readiness: () => Promise.resolve(readyReport),
    });
    try {
      const address = handle.server.address();
      expect(typeof address).toBe('object');
      expect((address as { address: string }).address).toBe('127.0.0.1');
    } finally {
      await handle.close();
    }
  });
});
