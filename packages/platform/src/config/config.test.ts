import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ConfigurationError } from './configuration-error.js';
import { loadConfig } from './config.js';
import { InvalidRefError, isRef, parseDatabaseProfileRef, parseSecretRef, refId } from './refs.js';
import { SecretValue } from './secret-value.js';

const LOCAL_ENV: NodeJS.ProcessEnv = { KARAR_ENV: 'local' };

function loadFailure(env: NodeJS.ProcessEnv): ConfigurationError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to throw ConfigurationError');
}

describe('loadConfig', () => {
  it('boots from a minimal local environment with compose-matching defaults', () => {
    const config = loadConfig(LOCAL_ENV, { serviceName: 'karar-api' });
    expect(config.env).toBe('local');
    expect(config.service).toEqual({ name: 'karar-api', version: 'dev', port: 3000 });
    expect(config.database.host).toBe('127.0.0.1');
    expect(config.database.port).toBe(5432);
    expect(config.database.name).toBe('karar');
    expect(config.database.user).toBe('karar');
    expect(config.database.password).toBeInstanceOf(SecretValue);
    expect(config.telemetry).toEqual({ otlpEndpoint: 'http://127.0.0.1:4318', enabled: true });
    expect(config.log.level).toBe('info');
    expect(config.business).toEqual({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.service)).toBe(true);
  });

  it('honours explicit values over defaults', () => {
    const config = loadConfig({
      KARAR_ENV: 'local',
      KARAR_SERVICE_NAME: 'karar-worker',
      KARAR_SERVICE_VERSION: '1.2.3',
      PORT: '3105',
      POSTGRES_PORT: '5433',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9999',
      KARAR_TELEMETRY_ENABLED: 'false',
      KARAR_LOG_LEVEL: 'debug',
    });
    expect(config.service).toEqual({ name: 'karar-worker', version: '1.2.3', port: 3105 });
    expect(config.database.port).toBe(5433);
    expect(config.telemetry).toEqual({ otlpEndpoint: 'http://127.0.0.1:9999', enabled: false });
    expect(config.log.level).toBe('debug');
  });

  it('rejects an unknown KARAR_ENV without echoing the given value', () => {
    const error = loadFailure({ KARAR_ENV: 'prod-eu-definitely-wrong' });
    expect(error.issues.map((issue) => issue.field)).toContain('env');
    expect(error.message).toContain('KARAR_ENV');
    expect(error.message).toContain('must be one of local|dev|staging|production');
    expect(error.message).not.toContain('prod-eu-definitely-wrong');
  });

  it('fails startup when KARAR_ENV is missing entirely (environment identity is asserted at boot)', () => {
    const error = loadFailure({});
    const envIssue = error.issues.find((issue) => issue.field === 'env');
    expect(envIssue?.reason).toBe('required but unset');
  });

  describe.each([
    ['database.host', 'POSTGRES_HOST'],
    ['database.port', 'POSTGRES_PORT'],
    ['database.name', 'POSTGRES_DB'],
    ['database.user', 'POSTGRES_USER'],
    ['database.password', 'POSTGRES_PASSWORD'],
  ])('non-local environments require %s', (fieldPath, envVar) => {
    const fullProductionEnv: NodeJS.ProcessEnv = {
      KARAR_ENV: 'production',
      POSTGRES_HOST: 'db.internal.example',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'karar',
      POSTGRES_USER: 'karar_app',
      POSTGRES_PASSWORD: 'a-very-secret-password-value',
    };

    it(`errors with the field name and never the value when ${envVar} is unset`, () => {
      const env = { ...fullProductionEnv };
      delete env[envVar];
      const error = loadFailure(env);
      const issue = error.issues.find((entry) => entry.field === fieldPath);
      expect(issue).toBeDefined();
      expect(issue?.envVar).toBe(envVar);
      expect(issue?.reason).toBe('required but unset');
      // The message names fields, variables and rules — no configured values.
      expect(error.message).toContain(fieldPath);
      expect(error.message).not.toContain('a-very-secret-password-value');
      expect(error.message).not.toContain('db.internal.example');
    });
  });

  it('collects every issue in one failure instead of stopping at the first', () => {
    const error = loadFailure({
      KARAR_ENV: 'production',
      PORT: 'not-a-number',
      KARAR_LOG_LEVEL: 'shout',
    });
    const fields = error.issues.map((issue) => issue.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'service.port',
        'log.level',
        'database.host',
        'database.port',
        'database.name',
        'database.user',
        'database.password',
      ]),
    );
    expect(error.message).not.toContain('not-a-number');
    expect(error.message).not.toContain('shout');
  });

  it('rejects a malformed port instead of silently falling back (environments.md §7)', () => {
    const error = loadFailure({ ...LOCAL_ENV, PORT: '30o0' });
    const issue = error.issues.find((entry) => entry.field === 'service.port');
    expect(issue?.reason).toBe('must be an integer');
    expect(error.message).not.toContain('30o0');
  });
});

describe('SecretValue redaction', () => {
  const secret = new SecretValue('super-secret-db-password');

  it('redacts toString and template-literal coercion', () => {
    expect(secret.toString()).toBe('[redacted]');
    expect(`${secret}`).toBe('[redacted]');
    expect(String(secret)).toBe('[redacted]');
  });

  it('redacts JSON.stringify', () => {
    expect(JSON.stringify(secret)).toBe('"[redacted]"');
    expect(JSON.stringify({ database: { password: secret } })).toBe(
      '{"database":{"password":"[redacted]"}}',
    );
  });

  it('redacts util.inspect (console.log path)', () => {
    expect(inspect(secret)).toBe('[redacted]');
    expect(inspect({ password: secret })).not.toContain('super-secret-db-password');
  });

  it('reveals the value only through unwrap()', () => {
    expect(secret.unwrap()).toBe('super-secret-db-password');
  });

  it('is what loadConfig stores for database.password', () => {
    const config = loadConfig({ ...LOCAL_ENV, POSTGRES_PASSWORD: 'compose-password' });
    expect(JSON.stringify(config)).not.toContain('compose-password');
    expect(inspect(config, { depth: 10 })).not.toContain('compose-password');
    expect(config.database.password.unwrap()).toBe('compose-password');
  });
});

describe('opaque karar-ref types (infrastructure-portability.md §6)', () => {
  it('parses well-formed refs and exposes the id opaquely', () => {
    const ref = parseSecretRef('karar-ref:secret:jwt-signing-key');
    expect(refId(ref)).toBe('jwt-signing-key');
    expect(isRef('secret', 'karar-ref:secret:jwt-signing-key')).toBe(true);
  });

  it('rejects provider-shaped identifiers — they are never domain identity', () => {
    for (const providerShaped of [
      'projects/p1/secrets/jwt/versions/1',
      'arn:aws:secretsmanager:eu-west-1:1:secret:jwt',
      'gs://bucket/object',
      'karar-ref:key:wrong-kind-for-secret',
    ]) {
      expect(() => parseSecretRef(providerShaped)).toThrow(InvalidRefError);
    }
  });

  it('never echoes the raw candidate value in the error', () => {
    try {
      parseDatabaseProfileRef('postgres://user:pw@host/db');
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('pw@host');
    }
  });
});
