import 'reflect-metadata';
import { Controller, Get, Module, NotFoundException } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode, PlatformError } from '@karar/platform/dist/errors/index.js';
import { createLogger } from '@karar/platform/dist/observability/index.js';
import { APP_LOGGER } from '../di-tokens.js';
import { RequestLoggingInterceptor } from '../logging/request-logging.interceptor.js';
import { GlobalExceptionFilter } from './global-exception.filter.js';

@Controller()
class ThrowingController {
  @Get('boom')
  boom(): never {
    // Deliberately smells like a driver error: none of it may reach the client.
    throw new Error('connect ECONNREFUSED 127.0.0.1:5432 (password authentication failed)');
  }

  @Get('platform-boom')
  platformBoom(): never {
    throw new PlatformError({
      code: ErrorCode.CONFLICT,
      message: 'the record was changed by another request',
      origin: 'application',
      details: { expectedVersion: 3 },
      cause: new Error('optimistic lock on row 42 of table sensitive_table'),
    });
  }

  @Get('missing-thing')
  missing(): never {
    throw new NotFoundException('thing not found');
  }
}

interface CapturedLine {
  [key: string]: unknown;
}

describe('GlobalExceptionFilter — the single error boundary', () => {
  const lines: CapturedLine[] = [];
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const logger = createLogger({
      serviceName: 'karar-api',
      serviceVersion: 'test',
      env: 'local',
      level: 'info',
      destination: {
        write(line: string) {
          lines.push(JSON.parse(line) as CapturedLine);
        },
      },
    });

    @Module({
      controllers: [ThrowingController],
      providers: [
        { provide: APP_LOGGER, useValue: logger },
        { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
      ],
    })
    class FilterTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [FilterTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('maps unknown errors to the generic INTERNAL_ERROR problem with no stack and no driver details', async () => {
    lines.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(JSON.parse(response.body)).toEqual({
      type: 'urn:karar:error:INTERNAL_ERROR',
      title: 'Internal error',
      status: 500,
      detail: 'An unexpected error occurred.',
      instance: '/boom',
      code: 'INTERNAL_ERROR',
    });
    for (const leaked of ['ECONNREFUSED', '127.0.0.1', '5432', 'password', 'at ', 'Error:']) {
      expect(response.body).not.toContain(leaked);
    }
  });

  it('logs the error exactly ONCE, server-side, with the stack', async () => {
    lines.length = 0;
    await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/boom' });
    const errorLines = lines.filter((line) => line['level'] === 'error');
    expect(errorLines).toHaveLength(1);
    const err = errorLines[0]!['err'] as CapturedLine;
    expect(String(err['stack'])).toContain('ECONNREFUSED'); // stack IS server-side
    // ... and the access line is an access line, not a second error log.
    const accessLines = lines.filter((line) => line['msg'] === 'request completed');
    expect(accessLines).toHaveLength(1);
    expect(accessLines[0]!['statusCode']).toBe(500);
  });

  it('renders PlatformError through the platform toProblemDetails: code, safe message, safe details — never the cause', async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/platform-boom' });
    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = JSON.parse(response.body) as CapturedLine;
    expect(body['type']).toBe('urn:karar:error:CONFLICT');
    expect(body['code']).toBe('CONFLICT');
    expect(body['status']).toBe(409);
    expect(body['detail']).toBe('the record was changed by another request');
    expect(body['details']).toEqual({ expectedVersion: 3 });
    // The internal cause never crosses the boundary.
    expect(response.body).not.toContain('sensitive_table');
    expect(response.body).not.toContain('optimistic lock');
  });

  it('maps framework HttpExceptions (404) to problem+json and logs at warn, not error', async () => {
    lines.length = 0;
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({ method: 'GET', url: '/missing-thing' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect((JSON.parse(response.body) as CapturedLine)['status']).toBe(404);
    expect(lines.filter((line) => line['level'] === 'error')).toHaveLength(0);
    expect(lines.filter((line) => line['level'] === 'warn')).toHaveLength(1);
  });

  it('emits the access line with method, route and duration for successful-looking requests too', async () => {
    lines.length = 0;
    await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/platform-boom?customerAccount=QA58DOHB0000123',
        headers: { 'x-correlation-id': 'it-corr-0001' },
      });
    const access = lines.find((line) => line['msg'] === 'request completed');
    expect(access).toBeDefined();
    expect(access!['route']).toBe('/platform-boom');
    expect(access!['method']).toBe('GET');
    expect(access!['correlationId']).toBe('it-corr-0001');
    expect(typeof access!['durationMs']).toBe('number');
    // The raw URL (query string could carry identifiers) is never logged.
    expect(JSON.stringify(access)).not.toContain('QA58DOHB0000123');
  });
});
