import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@karar/platform/dist/observability/index.js';
import { loadConfig } from '@karar/platform/dist/config/index.js';
import { AppModule } from './app.module.js';
import type { WorkerModuleOptions } from './app.module.js';

function fakeOptions(): { options: WorkerModuleOptions; calls: string[] } {
  const calls: string[] = [];
  const options: WorkerModuleOptions = {
    config: loadConfig({ KARAR_ENV: 'local' }, { serviceName: 'karar-worker' }),
    logger: createLogger({
      serviceName: 'karar-worker',
      serviceVersion: 'test',
      env: 'local',
      level: 'fatal',
      destination: { write: () => true },
    }),
    telemetry: {
      shutdown: async () => {
        calls.push('telemetry.shutdown');
      },
    },
    runtime: {
      stop: async () => {
        calls.push('runtime.stop');
      },
    } as unknown as WorkerModuleOptions['runtime'],
    adapter: {
      end: async () => {
        calls.push('adapter.end');
      },
    } as unknown as WorkerModuleOptions['adapter'],
    health: {
      close: async () => {
        calls.push('health.close');
      },
    } as unknown as WorkerModuleOptions['health'],
  };
  return { options, calls };
}

describe('worker AppModule', () => {
  it('compiles as a standalone application context over the composed platform surface', async () => {
    const { options } = fakeOptions();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(options)],
    }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it('shutdown runs in dependency order: intake, health, pool, telemetry flush', async () => {
    const { options, calls } = fakeOptions();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(options)],
    }).compile();
    await moduleRef.init();
    await moduleRef.close();
    expect(calls).toEqual(['runtime.stop', 'health.close', 'adapter.end', 'telemetry.shutdown']);
  });
});
