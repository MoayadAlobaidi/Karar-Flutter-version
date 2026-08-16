/**
 * Redis endpoint resolution — the sanctioned reader for the rate-limit
 * store's location (the same `REDIS_HOST`/`REDIS_PORT` contract the compose
 * file and the ratelimit integration suite use). Lives in config/ because
 * only this directory may read the environment (no-direct-env-access);
 * callers receive a typed endpoint and never touch the raw variables.
 *
 * Deliberately NOT part of the parseSchema config surface: the endpoint is
 * local composition detail today (compose maps 6380 on developer machines).
 * When a managed Redis arrives it comes through a connection profile like
 * PostgreSQL's, not through more env fields here.
 */

export interface RedisEndpoint {
  readonly host: string;
  readonly port: number;
}

export function redisEndpointFromEnv(
  source: Readonly<Record<string, string | undefined>>,
): RedisEndpoint {
  const rawPort = source['REDIS_PORT'];
  const port = rawPort === undefined || rawPort === '' ? 6379 : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`REDIS_PORT is not a valid TCP port: '${rawPort}'`);
  }
  return {
    host: source['REDIS_HOST'] ?? '127.0.0.1',
    port,
  };
}
