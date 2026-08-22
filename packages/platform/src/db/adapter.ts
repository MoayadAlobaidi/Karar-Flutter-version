import pg from 'pg';

import type { ConnectionProfile } from './connection-profile.js';
import { poolConfigFor } from './session-config.js';
import { mapPgError, PgError } from './errors.js';

/**
 * The single PostgreSQL persistence implementation.
 *
 * One class for every deployment — local Docker, Cloud SQL, RDS, or any other
 * approved managed PostgreSQL. What varies is the ConnectionProfile handed to
 * the constructor, never the adapter (database-portability.md, section 2).
 * There is no ORM here and none planned at this layer; repositories built in
 * later phases sit on top of `query`/`withTransaction`.
 *
 * Session defaults: `statement_timeout`, `lock_timeout` and `TimeZone` are
 * sent by the driver as connection startup parameters, so every session in the
 * pool carries them without a per-checkout round trip and no newly opened
 * connection can miss them. They come from `session-config.ts`, which is the
 * one place both this adapter and the Prisma factory configure a session.
 */

/** The query surface available inside `withTransaction`, bound to one session. */
export interface TransactionClient {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export class PostgresPersistenceAdapter {
  readonly profile: ConnectionProfile;
  private readonly pool: pg.Pool;
  private closed = false;

  constructor(profile: ConnectionProfile) {
    this.profile = profile;
    this.pool = new pg.Pool(poolConfigFor(profile));
    // An idle client can be dropped by the server (restart, timeout). Without
    // a handler that is an uncaught 'error' event and a process crash; the
    // next checkout creates a fresh connection, so swallowing is correct.
    this.pool.on('error', () => {});
  }

  /** Runs one statement (or params-free statement batch) on a pooled session. */
  async query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<R>> {
    this.assertOpen();
    try {
      return await this.pool.query<R>(text, params as unknown[] | undefined);
    } catch (error) {
      throw mapPgError(error);
    }
  }

  /**
   * Runs `fn` inside BEGIN/COMMIT on a single session, rolling back on any
   * throw. Driver errors surface as PgError (mapped inside `tx.query` and on
   * BEGIN/COMMIT); an error thrown by `fn` itself is rethrown unchanged so
   * callers keep their own error types. The client passed to `fn` is valid
   * only until `withTransaction` resolves.
   */
  async withTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    this.assertOpen();
    const client = await this.connect();
    const tx: TransactionClient = {
      query: async (text, params) => {
        try {
          return await client.query(text, params as unknown[] | undefined);
        } catch (error) {
          throw mapPgError(error);
        }
      },
    };
    let releaseError: Error | undefined;
    try {
      await tx.query('BEGIN');
      const result = await fn(tx);
      await tx.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // The original error is the one that matters, but a failed ROLLBACK
        // means the session is unusable (aborted transaction or dead socket).
        // Passing the error to release() makes node-postgres destroy the
        // connection instead of re-pooling it for the next caller to trip on.
        releaseError =
          rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }

  /** Closes the pool. Idempotent; queries after shutdown fail with connection_failure. */
  async end(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.pool.end();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new PgError(
        'connection_failure',
        `Adapter for profile "${this.profile.name}" has been shut down`,
        undefined,
        undefined,
      );
    }
  }

  private async connect(): Promise<pg.PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      throw mapPgError(error);
    }
  }
}
