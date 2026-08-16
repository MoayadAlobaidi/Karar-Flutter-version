// @karar/platform/config — typed, fail-fast application configuration.
// See config.ts for the two-reader `process.env` convention and the
// deployment/business split (docs/architecture/environments.md §7).
export { ConfigurationError } from './configuration-error.js';
export { redisEndpointFromEnv, type RedisEndpoint } from './redis-endpoint.js';
export {
  KARAR_ENVS,
  LOCAL_FIRST_PARTY_TENANT_ID,
  LOG_LEVELS,
  loadConfig,
  type AppConfig,
  type BusinessConfig,
  type DatabaseConfig,
  type KararEnv,
  type LoadConfigOptions,
  type LogConfig,
  type LogLevel,
  type ServiceConfig,
  type TelemetryConfig,
} from './config.js';
export {
  InvalidRefError,
  REF_KINDS,
  isRef,
  parseDatabaseProfileRef,
  parseDeploymentProfileRef,
  parseKeyRef,
  parseObjectRef,
  parseSecretRef,
  refId,
  type DatabaseProfileRef,
  type DeploymentProfileRef,
  type KeyRef,
  type ObjectRef,
  type RefKind,
  type SecretRef,
} from './refs.js';
export { bool, enumOf, field, int, parseSchema, secret, str } from './schema.js';
export type {
  FieldDef,
  FieldIssue,
  FieldSpec,
  ParseOutcome,
  SchemaOutcome,
  SchemaShape,
  SchemaValue,
} from './schema.js';
export { SecretValue } from './secret-value.js';
