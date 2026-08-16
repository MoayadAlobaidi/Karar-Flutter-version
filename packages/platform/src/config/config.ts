/**
 * Typed application configuration, validated at boot.
 *
 * CONVENTION (lint-able, tested by no-direct-env-access.test.ts): `process.env`
 * is READ in exactly two places in the backend —
 *
 *   1. here, through `loadConfig(env)` (the composition root passes the object
 *      in; nothing else dereferences it), and
 *   2. `packages/platform/src/db` — `LocalPostgresConnectionProfile.fromEnv(role, env)`
 *      builds ROLE-scoped connection profiles from the same injected object.
 *
 * Everything else consumes this typed config (or a port). Business modules
 * never read environment variables.
 *
 * Application configuration is NOT cloud configuration
 * (docs/architecture/environments.md §7): no `GCP_PROJECT_ID`, no `AWS_REGION`,
 * no provider variable ever appears here. Provider selection, regions, and
 * resource names belong to the deployment profile and its Terraform
 * composition, referenced from application code only through opaque
 * `karar-ref` types (./refs.ts).
 */

import { ConfigurationError } from './configuration-error.js';
import { bool, enumOf, field, int, parseSchema, secret, str, type FieldIssue } from './schema.js';
import { SecretValue } from './secret-value.js';

export const KARAR_ENVS = ['local', 'dev', 'staging', 'production'] as const;
/** Environment identity is asserted at boot and unknown values refuse to start (docs/security/secrets.md §3). */
export type KararEnv = (typeof KARAR_ENVS)[number];

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
/**
 * `silent` is deliberately absent: production logging must retain the forensic
 * timeline the incident plan depends on (backend.md §11, legacy INFRA-09).
 */
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ServiceConfig {
  readonly name: string;
  readonly version: string;
  readonly port: number;
}

/**
 * Base connection facts, validated fail-fast at boot (typed, no silent
 * fallbacks outside `local`).
 *
 * ROLE-scoped connection profiles (superuser / migrator / app) are NOT built
 * here — they are delegated to `LocalPostgresConnectionProfile.fromEnv(role, { env })`
 * in packages/platform/src/db, the second sanctioned env reader, which reads
 * these same POSTGRES_* variables plus the role credentials. This section is
 * the boot-time validation surface and the typed, redaction-safe view of the
 * base coordinates.
 */
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly name: string;
  readonly user: string;
  readonly password: SecretValue;
}

export interface TelemetryConfig {
  /** OTLP/HTTP endpoint. Provider-neutral: deployment profiles re-route collectors, not code (backend.md §11). */
  readonly otlpEndpoint: string;
  readonly enabled: boolean;
}

export interface LogConfig {
  readonly level: LogLevel;
}

/**
 * The local-development first-party tenant id: a fixed, documented SYNTHETIC
 * UUID (the trailing group spells "KARAR1" in ASCII hex) that
 * `scripts/db/seed-local-first-party.mjs` creates and local suites rely on.
 * It exists ONLY as the `local` default of `KARAR_FIRST_PARTY_TENANT_ID`;
 * every other environment must configure the real tenant id explicitly, and
 * domain code reaches the value exclusively through this typed config —
 * never as a literal.
 */
export const LOCAL_FIRST_PARTY_TENANT_ID = '00000000-0000-4000-8000-4b4152415231';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Business configuration — product behaviour knobs (feature defaults, policy
 * selection inputs, …). First occupant (Phase 3.5): the first-party tenant
 * reference the bootstrap/enrolment path binds against. Business config never
 * contains connection strings, endpoints, or any deployment concern.
 */
export interface BusinessConfig {
  /**
   * The tenant id of the platform's own (first-party) tenant. Required
   * OUTSIDE local — a non-local boot without it refuses to start; local
   * defaults to the documented synthetic id the seed script creates.
   */
  readonly firstPartyTenantId: string;
}

export interface AppConfig {
  // --- Deployment configuration: how and where this process runs. ---
  readonly env: KararEnv;
  readonly service: ServiceConfig;
  readonly database: DatabaseConfig;
  readonly telemetry: TelemetryConfig;
  readonly log: LogConfig;
  // --- Business configuration: what the product does (empty in Phase 2). ---
  readonly business: BusinessConfig;
}

export interface LoadConfigOptions {
  /** Compiled-in default service name; `KARAR_SERVICE_NAME` still wins. */
  readonly serviceName?: string;
}

/**
 * The ONLY entry point from environment to configuration. Reads the injected
 * `env` object, validates every field, and either returns a frozen `AppConfig`
 * or throws `ConfigurationError` naming every offending FIELD (never a value).
 */
export function loadConfig(env: NodeJS.ProcessEnv, options: LoadConfigOptions = {}): AppConfig {
  const issues: FieldIssue[] = [];

  const envOutcome = parseSchema({ env: field('KARAR_ENV', enumOf(KARAR_ENVS)) }, env);
  let kararEnv: KararEnv | undefined;
  if (envOutcome.ok) {
    kararEnv = envOutcome.value.env;
  } else {
    issues.push(...envOutcome.issues);
  }
  // Requiredness below is decided by environment identity; when the identity
  // itself is invalid we validate at the strictest (non-local) level.
  const isLocal = kararEnv === 'local';

  const serviceOutcome = parseSchema(
    {
      name: field(
        'KARAR_SERVICE_NAME',
        str({
          default: options.serviceName ?? 'karar',
          pattern: /^[a-z][a-z0-9-]*$/,
          patternHint: 'must be lowercase kebab-case',
        }),
      ),
      version: field('KARAR_SERVICE_VERSION', str({ default: 'dev' })),
      port: field('PORT', int({ default: 3000, min: 1, max: 65535 })),
    },
    env,
    'service.',
  );
  if (!serviceOutcome.ok) issues.push(...serviceOutcome.issues);

  // Local development defaults mirror docker-compose.yml; every other
  // environment must state its database coordinates explicitly.
  const databaseOutcome = parseSchema(
    {
      host: field('POSTGRES_HOST', str(isLocal ? { default: '127.0.0.1' } : {})),
      port: field(
        'POSTGRES_PORT',
        int({ min: 1, max: 65535, ...(isLocal ? { default: 5432 } : {}) }),
      ),
      name: field('POSTGRES_DB', str(isLocal ? { default: 'karar' } : {})),
      user: field('POSTGRES_USER', str(isLocal ? { default: 'karar' } : {})),
      password: field(
        'POSTGRES_PASSWORD',
        secret(isLocal ? { default: 'karar_dev_password' } : {}),
      ),
    },
    env,
    'database.',
  );
  if (!databaseOutcome.ok) issues.push(...databaseOutcome.issues);

  const telemetryOutcome = parseSchema(
    {
      otlpEndpoint: field(
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        str({
          default: 'http://127.0.0.1:4318',
          pattern: /^https?:\/\/\S+$/,
          patternHint: 'must be an http(s) URL',
        }),
      ),
      enabled: field('KARAR_TELEMETRY_ENABLED', bool({ default: true })),
    },
    env,
    'telemetry.',
  );
  if (!telemetryOutcome.ok) issues.push(...telemetryOutcome.issues);

  const logOutcome = parseSchema(
    { level: field('KARAR_LOG_LEVEL', enumOf(LOG_LEVELS, { default: 'info' })) },
    env,
    'log.',
  );
  if (!logOutcome.ok) issues.push(...logOutcome.issues);

  // Business configuration: required outside local (a non-local boot without
  // a first-party tenant fails clearly); local defaults to the documented
  // synthetic tenant the seed script creates.
  const businessOutcome = parseSchema(
    {
      firstPartyTenantId: field(
        'KARAR_FIRST_PARTY_TENANT_ID',
        str({
          ...(isLocal ? { default: LOCAL_FIRST_PARTY_TENANT_ID } : {}),
          pattern: UUID_SHAPE,
          patternHint: 'must be a UUID',
        }),
      ),
    },
    env,
    'business.',
  );
  if (!businessOutcome.ok) issues.push(...businessOutcome.issues);

  if (issues.length > 0 || kararEnv === undefined) {
    throw new ConfigurationError(issues);
  }
  // The outcomes below are all ok — a failure would have thrown above.
  if (
    !serviceOutcome.ok ||
    !databaseOutcome.ok ||
    !telemetryOutcome.ok ||
    !logOutcome.ok ||
    !businessOutcome.ok
  ) {
    throw new ConfigurationError(issues);
  }

  const config: AppConfig = {
    env: kararEnv,
    service: Object.freeze(serviceOutcome.value),
    database: Object.freeze(databaseOutcome.value),
    telemetry: Object.freeze(telemetryOutcome.value),
    log: Object.freeze(logOutcome.value),
    business: Object.freeze(businessOutcome.value),
  };
  return Object.freeze(config);
}
