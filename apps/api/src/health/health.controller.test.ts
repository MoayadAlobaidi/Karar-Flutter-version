import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { HealthController } from './health.controller';

describe('AppModule', () => {
  it('compiles and serves liveness', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const controller = moduleRef.get(HealthController);
    expect(controller.healthz()).toEqual({ status: 'ok' });
    await moduleRef.close();
  });

  it('serves the readiness placeholder with an empty checks map', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const controller = moduleRef.get(HealthController);
    expect(controller.readyz()).toEqual({ status: 'ok', checks: {} });
    await moduleRef.close();
  });
});
