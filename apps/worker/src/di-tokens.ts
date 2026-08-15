// Injection tokens for the worker's composition (mirrors apps/api/src/di-tokens.ts).
export const APP_CONFIG = Symbol('APP_CONFIG');
export const APP_LOGGER = Symbol('APP_LOGGER');
export const TELEMETRY = Symbol('TELEMETRY');
export const WORKER_RUNTIME = Symbol('WORKER_RUNTIME');
export const DB_ADAPTER = Symbol('DB_ADAPTER');
export const HEALTH_SERVER = Symbol('HEALTH_SERVER');
