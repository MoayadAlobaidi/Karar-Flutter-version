/**
 * The worker's health surface: a minimal `node:http` server on LOOPBACK ONLY
 * (the worker is not an HTTP entrypoint — this is operational plumbing, so no
 * HTTP framework is pulled in for two routes).
 *
 * `/healthz` — liveness: the process answers.
 * `/readyz`  — readiness: REAL checks, a constant is not a health check
 * (backend.md §10): PostgreSQL reachable, migrations current, and both loops
 * (outbox relay, job poller) recently alive. Responses carry STATES ONLY —
 * never hosts, roles, or driver error text.
 */
import { createServer, type Server } from 'node:http';

import type { PlatformLogger } from '@karar/platform/dist/observability/index.js';

export interface WorkerReadinessReport {
  readonly ready: boolean;
  readonly checks: {
    readonly postgres: 'up' | 'down';
    readonly migrations: 'ok' | 'behind' | 'unknown';
    readonly outboxRelay: 'alive' | 'stale';
    readonly jobPoller: 'alive' | 'stale';
  };
}

export interface HealthServerOptions {
  readonly port: number;
  readonly readiness: () => Promise<WorkerReadinessReport>;
  readonly logger?: PlatformLogger;
}

export interface HealthServerHandle {
  readonly server: Server;
  readonly port: number;
  close(): Promise<void>;
}

export function startHealthServer(options: HealthServerOptions): Promise<HealthServerHandle> {
  const server = createServer((request, response) => {
    const url = (request.url ?? '').split('?')[0];
    if (request.method !== 'GET') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'method_not_allowed' }));
      return;
    }
    if (url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url === '/readyz') {
      options
        .readiness()
        .then((report) => {
          response.writeHead(report.ready ? 200 : 503, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({ status: report.ready ? 'ok' : 'unavailable', checks: report.checks }),
          );
        })
        .catch((error: unknown) => {
          // The reason stays server-side; the response carries states only.
          options.logger?.warn({ err: error }, 'readiness evaluation failed');
          response.writeHead(503, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ status: 'unavailable' }));
        });
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'not_found' }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Loopback only: the worker's health is for the local orchestrator probe,
    // never a public surface.
    server.listen(options.port, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : options.port;
      resolve({
        server,
        port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          }),
      });
    });
  });
}
