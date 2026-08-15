import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  /** Liveness: is the process up. A constant is acceptable here and only here. */
  @Get('healthz')
  healthz(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness placeholder. Phase 2 wires real dependency checks (database,
   * outbox relay) into `checks` — a constant is not a health check
   * (docs/architecture/backend.md §10).
   */
  @Get('readyz')
  readyz(): { status: 'ok'; checks: Record<string, never> } {
    return { status: 'ok', checks: {} };
  }
}
