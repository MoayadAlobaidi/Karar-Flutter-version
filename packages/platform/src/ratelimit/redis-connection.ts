/**
 * The rate-limit store's CONNECTION lifecycle — owned by the composition
 * root, never by the first request that happens to need it.
 *
 * The limiter client is deliberately `lazyConnect` with the offline queue
 * DISABLED (redis-rate-limiter.ts): during an outage a command must fail NOW
 * rather than buffer and replay a stale limit check later. The cost is a
 * COLD-START RACE — ioredis starts the handshake for the first command
 * without awaiting it, the stream is not writable yet, and with no offline
 * queue that command is rejected outright. Every credential-guessing policy
 * fails CLOSED (policy.ts), so the first login after boot would answer 503
 * while Redis was running perfectly.
 *
 * `connect()` removes the race by establishing the connection BEFORE the
 * process serves traffic. A store that is genuinely down must still not stop
 * the boot — booting without dependencies is deliberate — so it reports the
 * outcome instead of throwing: ioredis keeps retrying underneath, `ping()`
 * tells readiness the truth until the store answers again, and the
 * fail-closed policies refuse at call time in the meantime.
 */

import type { Redis } from 'ioredis';

/**
 * Bounded wait for the startup handshake. A refused connection answers in
 * microseconds; this budget exists for the endpoint that neither accepts nor
 * refuses (a black-holed address), which must not hold the boot open.
 */
export const STARTUP_CONNECT_BUDGET_MS = 5_000;

export interface RateLimitRedisConnectionOptions {
  /** Overrides `STARTUP_CONNECT_BUDGET_MS` (tests use a short budget). */
  readonly startupBudgetMs?: number;
  /**
   * Connection-level errors, for the composition root's logger. ioredis
   * writes unhandled `error` events straight to console.error, past the
   * structured logger; during an outage they are a retry log rather than an
   * incident, so this class always listens and lets the caller decide.
   */
  readonly onConnectionError?: (error: Error) => void;
}

export class RateLimitRedisConnection {
  private readonly client: Redis;
  private readonly startupBudgetMs: number;
  private opened = false;

  constructor(client: Redis, options: RateLimitRedisConnectionOptions = {}) {
    this.client = client;
    this.startupBudgetMs = options.startupBudgetMs ?? STARTUP_CONNECT_BUDGET_MS;
    client.on('error', (error: Error) => {
      options.onConnectionError?.(error);
    });
  }

  /**
   * Opens the connection ONCE and waits for the handshake to finish. Resolves
   * `true` when the store is usable and `false` when it is not — it never
   * throws, because a down dependency is a readiness fact, not a boot
   * failure. After a failed attempt the client is already scheduling its own
   * retries; calling this again would race them, so the outcome of the single
   * attempt is what later calls report.
   */
  async connect(): Promise<boolean> {
    if (this.opened) return this.client.status === 'ready';
    this.opened = true;
    // Settled here, so a lost race never leaves an unhandled rejection.
    const handshake = this.client.connect().then(
      () => true,
      () => false,
    );
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        handshake,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), this.startupBudgetMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The readiness check: a REAL round trip (`PING`), not a status field. With
   * the offline queue disabled a client that is not connected rejects
   * immediately, so this answers fast in both directions and cannot hang the
   * probe.
   */
  async ping(): Promise<void> {
    await this.client.ping();
  }

  /**
   * Clean close. `QUIT` lets the server finish the reply in flight, but it is
   * a COMMAND — with the offline queue disabled it is writable only while the
   * client is ready — so a client that is down, or that never connected, is
   * dropped instead. `disconnect()` also cancels the pending reconnect, which
   * is what lets the process exit during an outage.
   */
  async close(): Promise<void> {
    if (this.client.status === 'ready') {
      try {
        await this.client.quit();
        return;
      } catch {
        // Raced with a drop between the check and the command; fall through.
      }
    }
    this.client.disconnect();
  }
}
