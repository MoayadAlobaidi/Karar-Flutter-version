import { describe, expect, it } from 'vitest';
import { ErrorCode } from './error-code.js';
import { PlatformError } from './platform-error.js';

describe('PlatformError', () => {
  it('carries code, origin, retryable, details, and correlationId', () => {
    const error = new PlatformError({
      code: ErrorCode.DEPENDENCY_UNAVAILABLE,
      message: 'database is unavailable',
      origin: 'infrastructure',
      retryable: true,
      details: { dependency: 'postgres', attempt: 3 },
      correlationId: 'corr-123',
    });
    expect(error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(error.origin).toBe('infrastructure');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ dependency: 'postgres', attempt: 3 });
    expect(error.correlationId).toBe('corr-123');
    expect(error.name).toBe('PlatformError');
    expect(error).toBeInstanceOf(Error);
  });

  it('defaults retryable to false — retryability is an explicit claim', () => {
    const error = new PlatformError({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'bad input',
      origin: 'application',
    });
    expect(error.retryable).toBe(false);
    expect(error.details).toBeUndefined();
    expect(error.correlationId).toBeUndefined();
  });

  it('filters non-primitive detail values at runtime — no objects ride along', () => {
    const error = new PlatformError({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'bad input',
      origin: 'infrastructure',
      // A JS caller without type checking could pass anything.
      details: {
        field: 'amount',
        smuggled: { connection: 'postgres://user:secret@db:5432' },
        fn: () => 'nope',
      } as unknown as Record<string, string>,
    });
    expect(error.details).toEqual({ field: 'amount' });
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  it('keeps the cause for logs but outside JSON serialization', () => {
    const driverFailure = new Error('password authentication failed for user "karar_app"');
    const error = new PlatformError({
      code: ErrorCode.DEPENDENCY_UNAVAILABLE,
      message: 'database is unavailable',
      origin: 'infrastructure',
      cause: driverFailure,
    });
    // Available to structured logging…
    expect(error.cause).toBe(driverFailure);
    // …but the Error cause slot is non-enumerable, so JSON.stringify of the
    // error itself carries neither the cause nor its message.
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('cause');
  });

  it('is identifiable through the type guard', () => {
    const error = new PlatformError({
      code: ErrorCode.NOT_FOUND,
      message: 'no such record',
      origin: 'application',
    });
    expect(PlatformError.is(error)).toBe(true);
    expect(PlatformError.is(new Error('plain'))).toBe(false);
    expect(PlatformError.is('string')).toBe(false);
    expect(PlatformError.is(undefined)).toBe(false);
  });
});
