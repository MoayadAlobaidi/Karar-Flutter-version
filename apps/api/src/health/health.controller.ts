import { Controller, Get, Res } from '@nestjs/common';
import { ReadinessService, type ReadinessReport } from './readiness.service.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

export interface ReadyzResponse {
  status: 'ok' | 'unavailable';
  checks: ReadinessReport['checks'];
}

@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  /**
   * Liveness: is THIS PROCESS up. Deliberately constant and dependency-free —
   * an orchestrator restarts the process on liveness failure, and restarting
   * cannot fix a down database; wiring dependencies here would convert every
   * dependency outage into a restart storm. Dependency truth lives in /readyz.
   */
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness: executes the real checks (backend.md §10 — a constant is not a
   * health check). 200 only when every check passes; 503 with per-check
   * states otherwise, so load balancers stop routing while operators see
   * which dependency failed. States only — no connection details.
   */
  @Get('readyz')
  async readyz(@Res() reply: ReplyLike): Promise<void> {
    const report = await this.readiness.check();
    const body: ReadyzResponse = {
      status: report.ready ? 'ok' : 'unavailable',
      checks: report.checks,
    };
    reply.status(report.ready ? 200 : 503).send(body);
  }
}
