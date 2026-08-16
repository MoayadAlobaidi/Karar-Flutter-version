import { describe, expect, it } from 'vitest';

import { TenantId } from '@karar/shared-kernel';

import { SingleDatasourceResolver, type DataSourceResolver } from './datasource-resolver.js';
import type { ConnectionProfile } from './connection-profile.js';
import { SecretValue } from '../config/secret-value.js';

const profile: ConnectionProfile = Object.freeze({
  name: 'test-app',
  host: '127.0.0.1',
  port: 5433,
  database: 'karar',
  user: 'karar_app',
  password: new SecretValue('irrelevant'),
  ssl: { mode: 'disable' as const },
  poolMax: 10,
  statementTimeoutMs: 30_000,
  lockTimeoutMs: 5_000,
});

describe('SingleDatasourceResolver', () => {
  it('returns the one configured datasource for every tenant', () => {
    const resolver: DataSourceResolver<ConnectionProfile> = new SingleDatasourceResolver(profile);
    const a = resolver.resolve({ tenantId: TenantId.of('11111111-1111-4111-8111-111111111111') });
    const b = resolver.resolve({ tenantId: TenantId.of('22222222-2222-4222-8222-222222222222') });
    expect(a).toBe(profile);
    expect(b).toBe(profile);
  });

  it('resolves platform-scoped context (no tenant) to the same datasource', () => {
    const resolver = new SingleDatasourceResolver(profile);
    expect(resolver.resolve({})).toBe(profile);
  });

  it('is generic over the datasource shape (a handle works as well as a profile)', () => {
    const handle = { client: Symbol('client'), pool: Symbol('pool') };
    const resolver = new SingleDatasourceResolver(handle);
    expect(resolver.resolve({})).toBe(handle);
  });

  it('performs no resolution logic and reads no environment', () => {
    // The Phase 3 resolver is a constant function by design; multi-datasource
    // routing arrives with dedicated-database deployments. Constructing and
    // resolving must not touch process.env.
    const env = new Proxy(process.env, {
      get() {
        throw new Error('SingleDatasourceResolver must not read the environment');
      },
    });
    const original = process.env;
    try {
      process.env = env as NodeJS.ProcessEnv;
      const resolver = new SingleDatasourceResolver(profile);
      expect(resolver.resolve({})).toBe(profile);
    } finally {
      process.env = original;
    }
  });
});
