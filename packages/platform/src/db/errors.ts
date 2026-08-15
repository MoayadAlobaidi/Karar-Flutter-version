/**
 * Small typed error surface for the persistence adapter.
 *
 * Only the conditions callers genuinely branch on get a named code; everything
 * else passes through as `unknown` with the raw SQLSTATE preserved in
 * `sqlState` so nothing is swallowed. The mapping is PostgreSQL-standard, not
 * provider-specific (database-portability.md, section 3).
 */

export type PgErrorCode =
  /** SQLSTATE 23505 — a unique or primary key constraint was violated. */
  | 'unique_violation'
  /** SQLSTATE 40001 — serialization failure; the transaction may be retried. */
  | 'serialization_failure'
  /** SQLSTATE 42501 — the role lacks the privilege for the attempted action. */
  | 'insufficient_privilege'
  /** Could not reach or keep a connection to the server (SQLSTATE class 08, node network errors, shut-down pool). */
  | 'connection_failure'
  /** Anything else; `sqlState` carries the raw code when the server sent one. */
  | 'unknown';

export class PgError extends Error {
  readonly code: PgErrorCode;
  /** Raw PostgreSQL SQLSTATE (for example '23505'), when available. */
  readonly sqlState: string | undefined;

  constructor(code: PgErrorCode, message: string, sqlState: string | undefined, cause: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PgError';
    this.code = code;
    this.sqlState = sqlState;
  }
}

const NODE_NETWORK_ERRNOS = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'EPIPE',
]);

// SQLSTATEs outside class 08 that still mean "the connection is gone or the
// server is unavailable": cannot_connect_now, admin_shutdown, crash_shutdown.
const CONNECTION_SQLSTATES = new Set(['57P01', '57P02', '57P03']);

function isSqlState(code: string): boolean {
  return /^[0-9A-Z]{5}$/.test(code);
}

/** Maps a driver-thrown error to PgError. Idempotent for already-mapped errors. */
export function mapPgError(error: unknown): PgError {
  if (error instanceof PgError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;

  if (rawCode !== undefined && NODE_NETWORK_ERRNOS.has(rawCode)) {
    return new PgError('connection_failure', message, undefined, error);
  }
  if (rawCode !== undefined && isSqlState(rawCode)) {
    if (rawCode === '23505') {
      return new PgError('unique_violation', message, rawCode, error);
    }
    if (rawCode === '40001') {
      return new PgError('serialization_failure', message, rawCode, error);
    }
    if (rawCode === '42501') {
      return new PgError('insufficient_privilege', message, rawCode, error);
    }
    if (rawCode.startsWith('08') || CONNECTION_SQLSTATES.has(rawCode)) {
      return new PgError('connection_failure', message, rawCode, error);
    }
    return new PgError('unknown', message, rawCode, error);
  }
  // The driver reports an abruptly dropped socket with a plain Error and no
  // code ("Connection terminated unexpectedly").
  if (/connection (?:terminated|ended)/i.test(message)) {
    return new PgError('connection_failure', message, undefined, error);
  }
  return new PgError('unknown', message, undefined, error);
}
