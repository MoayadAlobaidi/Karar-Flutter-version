import { ROOT_CONTEXT, context, trace } from '@opentelemetry/api';
import type { Context, ContextManager } from '@opentelemetry/api';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { classified, resetClassifiedStateForTests } from './classified.js';
import { withCorrelationId } from './correlation.js';
import { createLogger } from './logger.js';
import type { PlatformLogger } from './logger.js';

/**
 * Minimal synchronous context manager so `context.with` really activates a
 * context in these tests — pure @opentelemetry/api, no SDK (the platform rule).
 */
class StackContextManager implements ContextManager {
  private readonly stack: Context[] = [];

  active(): Context {
    return this.stack[this.stack.length - 1] ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    this.stack.push(ctx);
    try {
      return fn.call(thisArg, ...args);
    } finally {
      this.stack.pop();
    }
  }

  bind<T>(_ctx: Context, target: T): T {
    return target;
  }

  enable(): this {
    return this;
  }

  disable(): this {
    return this;
  }
}

interface CapturedLine {
  [key: string]: unknown;
}

function captureLogger(level = 'info'): { logger: PlatformLogger; lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];
  const logger = createLogger({
    serviceName: 'karar-api',
    serviceVersion: '1.2.3',
    env: 'local',
    level,
    destination: {
      write(line: string) {
        lines.push(JSON.parse(line) as CapturedLine);
      },
    },
  });
  return { logger, lines };
}

beforeAll(() => {
  context.setGlobalContextManager(new StackContextManager());
});

afterAll(() => {
  context.disable();
});

afterEach(() => {
  resetClassifiedStateForTests();
});

describe('createLogger — structured line shape', () => {
  it('emits one JSON object per log with the base identity fields', () => {
    const { logger, lines } = captureLogger();
    logger.info({ requestId: 'r-1' }, 'listening');
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line['service.name']).toBe('karar-api');
    expect(line['service.version']).toBe('1.2.3');
    expect(line['env']).toBe('local');
    expect(line['pid']).toBe(process.pid);
    expect(line['level']).toBe('info');
    expect(line['msg']).toBe('listening');
    expect(line['requestId']).toBe('r-1');
    expect(typeof line['time']).toBe('string');
  });

  it('honours the configured level', () => {
    const { logger, lines } = captureLogger('warn');
    logger.info('dropped');
    logger.warn('kept');
    expect(lines).toHaveLength(1);
    expect(lines[0]!['msg']).toBe('kept');
  });
});

describe('createLogger — redaction', () => {
  it('redacts credential-shaped keys at any depth, case-insensitively', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        password: 'p1',
        Authorization: 'Bearer abc',
        nested: {
          api_key: 'k1',
          apiKey: 'k2',
          refreshToken: 't1',
          clientSecret: 's1',
          safe: 'kept',
        },
        list: [{ TOKEN: 't2' }],
      },
      'redaction',
    );
    const line = JSON.stringify(lines[0]);
    for (const leaked of ['p1', 'Bearer abc', 'k1', 'k2', 't1', 's1', 't2']) {
      expect(line).not.toContain(leaked);
    }
    const parsed = lines[0]!;
    expect(parsed['password']).toBe('[redacted]');
    expect(parsed['Authorization']).toBe('[redacted]');
    expect((parsed['nested'] as CapturedLine)['api_key']).toBe('[redacted]');
    expect((parsed['nested'] as CapturedLine)['safe']).toBe('kept');
    expect(((parsed['list'] as CapturedLine[])[0] as CapturedLine)['TOKEN']).toBe('[redacted]');
  });

  it('logs HIGHLY_SENSITIVE_FINANCIAL values only as [redacted:hsf]', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      { iban: classified('QA58DOHB00001234567890ABCDEFG', 'HIGHLY_SENSITIVE_FINANCIAL') },
      'hsf',
    );
    expect(lines[0]!['iban']).toBe('[redacted:hsf]');
    expect(JSON.stringify(lines[0])).not.toContain('QA58DOHB');
  });

  it('never logs SEALED values and warns exactly once', () => {
    const { logger, lines } = captureLogger();
    logger.info({ payload: classified('sealed-plaintext', 'SEALED') }, 'first');
    logger.info({ payload: classified('sealed-plaintext', 'SEALED') }, 'second');
    const sealedLines = lines.filter((line) => line['payload'] !== undefined);
    expect(sealedLines).toHaveLength(2);
    for (const line of sealedLines) {
      expect(line['payload']).toBe('[sealed]');
      expect(JSON.stringify(line)).not.toContain('sealed-plaintext');
    }
    const warnings = lines.filter((line) => line['level'] === 'warn');
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0]!['msg'])).toContain('SEALED');
  });

  it('passes PUBLIC and INTERNAL classified values through', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      { flag: classified('enabled', 'INTERNAL'), doc: classified('published', 'PUBLIC') },
      'ok',
    );
    expect(lines[0]!['flag']).toBe('enabled');
    expect(lines[0]!['doc']).toBe('published');
  });

  it('redacts CONFIDENTIAL (sink rule) and SECRET (canonical replacement) classified values', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        email: classified('user@example.com', 'CONFIDENTIAL'),
        key: classified('sk-123', 'SECRET'),
      },
      'ok',
    );
    expect(lines[0]!['email']).toBe('[redacted]');
    expect(lines[0]!['key']).toBe('[redacted:secret]');
    expect(JSON.stringify(lines[0])).not.toContain('sk-123');
    expect(JSON.stringify(lines[0])).not.toContain('user@example.com');
  });
});

describe('createLogger — trace and correlation context', () => {
  const SPAN_CONTEXT = {
    traceId: '0af7651916cd43dd8448eb211c80319c',
    spanId: 'b7ad6b7169203331',
    traceFlags: 1,
  };

  it('attaches traceId and spanId from the active span context', () => {
    const { logger, lines } = captureLogger();
    context.with(trace.setSpanContext(ROOT_CONTEXT, SPAN_CONTEXT), () => {
      logger.info('inside span');
    });
    logger.info('outside span');
    expect(lines[0]!['traceId']).toBe(SPAN_CONTEXT.traceId);
    expect(lines[0]!['spanId']).toBe(SPAN_CONTEXT.spanId);
    expect(lines[1]!['traceId']).toBeUndefined();
    expect(lines[1]!['spanId']).toBeUndefined();
  });

  it('attaches the correlationId inside withCorrelationId', () => {
    const { logger, lines } = captureLogger();
    withCorrelationId('corr-42', () => {
      logger.info('inside');
    });
    logger.info('outside');
    expect(lines[0]!['correlationId']).toBe('corr-42');
    expect(lines[1]!['correlationId']).toBeUndefined();
  });
});

describe('class-instance redaction (reviewer L4)', () => {
  it('redacts credential-shaped own props on class instances without toJSON', async () => {
    const { redactLogObject } = await import('./logger.js');
    class ThirdPartyConfig {
      constructor(
        public host: string,
        public password: string,
      ) {}
    }
    const out = redactLogObject({ cfg: new ThirdPartyConfig('db.example', 'super-secret') });
    const cfg = out.cfg as Record<string, unknown>;
    expect(cfg.host).toBe('db.example');
    expect(cfg.password).toBe('[redacted]');
    expect(JSON.stringify(out)).not.toContain('super-secret');
  });
});
