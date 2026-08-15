/** Injection tokens for the boot-time singletons composed in main.ts. */
export const APP_CONFIG = Symbol.for('karar.api.config');
export const APP_LOGGER = Symbol.for('karar.api.logger');
export const READINESS_PROBES = Symbol.for('karar.api.readiness-probes');
export const TELEMETRY = Symbol.for('karar.api.telemetry');
