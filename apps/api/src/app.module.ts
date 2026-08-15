import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';

// Root module of the single application both entrypoints boot (ADR-0013).
// Phase 2 composes modules/* here; Phase 1 carries only the health surface.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
