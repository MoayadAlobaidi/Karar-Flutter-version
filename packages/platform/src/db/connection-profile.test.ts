import { describe, expect, it } from 'vitest';
import { LocalPostgresConnectionProfile } from './connection-profile.js';

describe('development password fallbacks are local-only', () => {
  const base = { KARAR_DB_HOST: '127.0.0.1', POSTGRES_PORT: '5432' };

  it('falls back in local', () => {
    const p = LocalPostgresConnectionProfile.fromEnv('app', {
      env: { ...base, KARAR_ENV: 'local' },
    });
    expect(p.user).toBe('karar_app');
  });

  it('treats an UNSET KARAR_ENV as non-local (fallbacks refused)', () => {
    expect(() =>
      LocalPostgresConnectionProfile.fromEnv('app', {
        env: { ...base },
      }),
    ).toThrow(/KARAR_DB_APP_PASSWORD.*local-only/s);
  });

  it('fails fast outside local when the app password is absent', () => {
    expect(() =>
      LocalPostgresConnectionProfile.fromEnv('app', {
        env: { ...base, KARAR_ENV: 'production' },
      }),
    ).toThrow(/KARAR_DB_APP_PASSWORD.*local-only/s);
  });

  it('fails fast outside local for the migrator password', () => {
    expect(() =>
      LocalPostgresConnectionProfile.fromEnv('migrator', {
        env: { ...base, KARAR_ENV: 'staging' },
      }),
    ).toThrow(/KARAR_DB_MIGRATOR_PASSWORD/);
  });

  it('accepts explicit passwords outside local', () => {
    const p = LocalPostgresConnectionProfile.fromEnv('app', {
      env: { ...base, KARAR_ENV: 'production', KARAR_DB_APP_PASSWORD: 'set-by-secret-manager' },
    });
    expect(p.user).toBe('karar_app');
  });
});
