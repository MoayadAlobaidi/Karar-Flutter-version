import { describe, expect, it } from 'vitest';
import { ErrorCode } from './error-code.js';
import { PlatformError } from './platform-error.js';
import { toProblemDetails } from './problem-details.js';

describe('toProblemDetails — status and identity mapping', () => {
  it.each([
    // [code, status, title]
    [ErrorCode.VALIDATION_ERROR, 400, 'Validation failed'],
    [ErrorCode.AUTHENTICATION_REQUIRED, 401, 'Authentication required'],
    [ErrorCode.NOT_AUTHORIZED, 403, 'Not authorized'],
    [ErrorCode.CONFIGURATION_ERROR, 500, 'Configuration error'],
    [ErrorCode.DEPENDENCY_UNAVAILABLE, 503, 'Dependency unavailable'],
    [ErrorCode.OPERATION_RESTRICTED, 503, 'Operation restricted'],
    [ErrorCode.CONFLICT, 409, 'Conflict'],
    [ErrorCode.NOT_FOUND, 404, 'Not found'],
    [ErrorCode.RATE_LIMITED, 429, 'Rate limited'],
    [ErrorCode.INTERNAL_ERROR, 500, 'Internal error'],
  ] as const)('%s maps to %i "%s"', (code, status, title) => {
    const problem = toProblemDetails(
      new PlatformError({ code, message: 'safe message', origin: 'application' }),
      { instance: '/v1/things/42', traceId: 'trace-9' },
    );
    expect(problem).toEqual({
      type: `urn:karar:error:${code}`,
      title,
      status,
      detail: 'safe message',
      instance: '/v1/things/42',
      code,
      traceId: 'trace-9',
    });
  });

  it('carries safe details and correlationId as extensions', () => {
    const problem = toProblemDetails(
      new PlatformError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'minorUnits must be an integer string',
        origin: 'infrastructure',
        details: { field: 'minorUnits' },
        correlationId: 'corr-7',
      }),
    );
    expect(problem.details).toEqual({ field: 'minorUnits' });
    expect(problem.correlationId).toBe('corr-7');
    expect(problem.instance).toBeUndefined();
    expect(problem.traceId).toBeUndefined();
  });
});

describe('toProblemDetails — unknown failures', () => {
  it('maps an unknown Error to a generic INTERNAL_ERROR problem, ignoring its message', () => {
    const problem = toProblemDetails(new TypeError('x is not a function at /app/src/secret.ts'));
    expect(problem.status).toBe(500);
    expect(problem.code).toBe('INTERNAL_ERROR');
    expect(problem.type).toBe('urn:karar:error:INTERNAL_ERROR');
    expect(problem.detail).toBe('An unexpected error occurred.');
    expect(JSON.stringify(problem)).not.toContain('secret.ts');
  });

  it.each([
    ['a thrown string', 'exploded near postgres://user:pw@host/db'],
    ['a thrown object', { message: 'leaky', config: { host: '10.0.0.5' } }],
    ['undefined', undefined],
    ['null', null],
  ] as const)('maps %s to the generic problem', (_label, thrown) => {
    const problem = toProblemDetails(thrown, { traceId: 'trace-1' });
    expect(problem.code).toBe('INTERNAL_ERROR');
    expect(problem.detail).toBe('An unexpected error occurred.');
    expect(problem.traceId).toBe('trace-1');
    expect(JSON.stringify(problem)).not.toContain('postgres://');
    expect(JSON.stringify(problem)).not.toContain('10.0.0.5');
  });
});

describe('toProblemDetails — leakage', () => {
  // A realistic driver failure: message, stack, and driver fields all carry
  // infrastructure secrets. None of them may reach the problem document.
  const CONNECTION_STRING = 'postgres://karar_app:s3cr3t-pw@10.20.30.40:5432/karar';
  const pgStyleError = Object.assign(
    new Error(
      `connection to server at "10.20.30.40", port 5432 failed: ` +
        `password authentication failed for user "karar_app" (${CONNECTION_STRING})`,
    ),
    {
      code: '28P01',
      routine: 'auth_failed',
      connectionString: CONNECTION_STRING,
    },
  );

  it('lets nothing from a raw driver error through', () => {
    const problem = toProblemDetails(pgStyleError, { instance: '/v1/accounts', traceId: 't-1' });
    const serialized = JSON.stringify(problem);
    for (const secret of [
      's3cr3t-pw',
      'karar_app',
      '10.20.30.40',
      '5432',
      'postgres://',
      '28P01',
      'auth_failed',
      'password authentication',
      'at ', // stack frames
      'node_modules',
    ]) {
      expect(serialized, `problem JSON must not contain ${JSON.stringify(secret)}`).not.toContain(
        secret,
      );
    }
    expect(problem.detail).toBe('An unexpected error occurred.');
  });

  it('lets nothing from a wrapped cause through, even on a PlatformError', () => {
    const wrapped = new PlatformError({
      code: ErrorCode.DEPENDENCY_UNAVAILABLE,
      message: 'database is unavailable',
      origin: 'infrastructure',
      retryable: true,
      cause: pgStyleError,
    });
    const serialized = JSON.stringify(toProblemDetails(wrapped, { traceId: 't-2' }));
    for (const secret of ['s3cr3t-pw', '10.20.30.40', 'postgres://', '28P01', 'cause', 'stack']) {
      expect(serialized, `problem JSON must not contain ${JSON.stringify(secret)}`).not.toContain(
        secret,
      );
    }
    expect(JSON.parse(serialized)).toMatchObject({
      status: 503,
      detail: 'database is unavailable',
    });
  });
});
