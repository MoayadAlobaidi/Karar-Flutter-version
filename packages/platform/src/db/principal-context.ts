/**
 * Principal context — the transaction-local binding that makes PostgreSQL RLS
 * decide every row-visibility question (tenancy.md; ADR-0008, ADR-0022).
 *
 * `withPrincipalContext` opens one transaction (a Prisma interactive
 * transaction, or the raw adapter's `withTransaction`) and, as its first
 * statement, binds the caller's principal into transaction-local GUCs:
 *
 *   SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), …
 *
 * `set_config(name, value, is_local => true)` is `SET LOCAL`: the values die
 * with the transaction, so a pooled connection can never carry one caller's
 * tenant into the next caller's query. The statement is parameterized — GUC
 * *names* are compile-time constants below; *values* always travel as bind
 * parameters and are never string-concatenated into SQL.
 *
 * Fail-closed rule: every call site declares which context keys it REQUIRES
 * (default: `tenantId` and `userId`). A missing or malformed required value
 * throws a typed `PrincipalContextError` BEFORE any transaction is opened or
 * any query runs. There is no fallback context and no partial execution.
 *
 * Where the values come from: `tenantId`/`userId` are the shared-kernel's
 * branded types, resolved at the edge from the caller's own session/membership
 * record — **never from client input** (no header, query, or body field is
 * ever accepted as a tenant identity; tenancy.md §6). The identity contract:
 * `identity_accounts.id` IS the platform `UserId`, and `app.user_id` carries
 * it.
 *
 * Layering, stated so it cannot be misremembered: any application-layer
 * filter (a Prisma `where: { tenantId }`, a repository convenience scope) is
 * exactly that — convenience that catches honest mistakes early. **RLS is the
 * boundary.** A code path that forgets the filter still hits policies that
 * only expose rows for the transaction's bound principal.
 *
 * Absent optional keys are deliberately bound to the empty string rather than
 * skipped: if a previous session-level value existed on the pooled connection,
 * binding '' locally shadows it for this transaction. Policies treat '' as
 * absent via `NULLIF(current_setting(name, true), '')`.
 */

import { TenantId, UserId } from '@karar/shared-kernel';

import { PostgresPersistenceAdapter, type TransactionClient } from './adapter.js';
import type { PrismaClient, PrismaHandle } from './prisma.js';

/** GUC names are constants of this module — never caller input. */
export const PRINCIPAL_GUC_NAMES = Object.freeze({
  tenantId: 'app.tenant_id',
  userId: 'app.user_id',
  sessionId: 'app.session_id',
  requestId: 'app.request_id',
} as const);

export type PrincipalContextKey = keyof typeof PRINCIPAL_GUC_NAMES;

/**
 * The principal a transaction runs as. `tenantId`/`userId` are the kernel's
 * branded types: a raw string from a request cannot be passed without going
 * through `TenantId.parse` / `UserId.parse` at the edge first.
 */
export interface PrincipalContext {
  readonly tenantId?: TenantId;
  readonly userId?: UserId;
  readonly sessionId?: string;
  readonly requestId?: string;
}

/** Call-site declaration of the keys that MUST be present. */
export type PrincipalContextRequirement = readonly PrincipalContextKey[];

/**
 * The default requirement: a tenant-scoped, authenticated principal. Call
 * sites that legitimately run narrower (for example an authenticated-but-not-
 * yet-membered invitation lookup) must say so explicitly via
 * `options.require` — relaxation is visible at the call site, never implied.
 */
export const DEFAULT_REQUIRED_CONTEXT: PrincipalContextRequirement = Object.freeze([
  'tenantId',
  'userId',
]);

export type PrincipalContextErrorKind = 'missing_required_context' | 'invalid_context_value';

/** Typed fail-closed error, raised before any query when context is unusable. */
export class PrincipalContextError extends Error {
  override readonly name = 'PrincipalContextError';

  constructor(
    readonly kind: PrincipalContextErrorKind,
    readonly keys: readonly PrincipalContextKey[],
    message: string,
  ) {
    super(message);
  }
}

export interface WithPrincipalContextOptions {
  /** Required keys for this call site; defaults to DEFAULT_REQUIRED_CONTEXT. */
  readonly require?: PrincipalContextRequirement;
  /**
   * How long the interactive transaction may run, in milliseconds.
   *
   * OMITTING IT IS A DECISION, AND IT USED TO BE AN UNINTENDED ONE. Prisma's
   * default is 5,000 ms, and every caller of this function inherited it
   * silently. That is the right order of magnitude for a single-row write and
   * far too small for a bulk one: the CSV ingestion policy declares
   * `maxRows: 50_000` and `deadlineMs: 30_000` — "the wall-clock ceiling for
   * the whole operation" — and neither could be reached, because the parse
   * stages rows one at a time inside this transaction and the commit writes
   * four rows plus an update per record inside it. Measured against
   * PostgreSQL 17, staging expired at roughly 3,000 rows and committing at
   * roughly 700, and the caller was answered a RETRYABLE 503 for a condition
   * no retry could resolve.
   *
   * A call site that writes in bulk passes the bound it is already declared
   * to obey, so the number a reader finds in the limit policy is the number
   * the database enforces. A call site that does not pass one keeps Prisma's
   * default, which is correct for the single-row writes that are most of them.
   */
  readonly timeoutMs?: number;
  /** How long to wait for a connection before the transaction starts. */
  readonly maxWaitMs?: number;
}

/**
 * The client surface visible inside a Prisma interactive transaction: the
 * model delegates plus the raw-query escape hatches, minus lifecycle methods.
 * (Structurally identical to Prisma's own interactive-transaction client;
 * declared here so nothing outside infrastructure imports Prisma directly.)
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

const MAX_OPAQUE_VALUE_LENGTH = 512;

interface BoundValues {
  readonly tenantId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly requestId: string;
}

function validateContext(
  context: PrincipalContext,
  require: PrincipalContextRequirement,
): BoundValues {
  const missing: PrincipalContextKey[] = [];
  for (const key of require) {
    const value = context[key];
    if (value === undefined || value === null || value === '') {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new PrincipalContextError(
      'missing_required_context',
      missing,
      `principal context is missing required key(s) [${missing.join(', ')}] — ` +
        `failing closed before any query (tenancy.md: RLS is the boundary; there is no default principal)`,
    );
  }

  const invalid: PrincipalContextKey[] = [];
  // Branded types make these unreachable from well-typed code; the runtime
  // re-validation defends against a raw request string cast through the type
  // system — exactly the client-input path the GUC must never trust.
  if (context.tenantId !== undefined && !TenantId.parse(context.tenantId).ok) {
    invalid.push('tenantId');
  }
  if (context.userId !== undefined && !UserId.parse(context.userId).ok) {
    invalid.push('userId');
  }
  for (const key of ['sessionId', 'requestId'] as const) {
    const value = context[key];
    if (value === undefined) continue;
    if (
      typeof value !== 'string' ||
      value.length > MAX_OPAQUE_VALUE_LENGTH ||
      value.includes('\0')
    ) {
      invalid.push(key);
    }
  }
  if (invalid.length > 0) {
    throw new PrincipalContextError(
      'invalid_context_value',
      invalid,
      `principal context value(s) [${invalid.join(', ')}] are malformed — failing closed before any query`,
    );
  }

  return {
    tenantId: context.tenantId ?? '',
    userId: context.userId ?? '',
    sessionId: context.sessionId ?? '',
    requestId: context.requestId ?? '',
  };
}

/**
 * One parameterized statement binds all four GUCs, always: required keys with
 * their values, absent optional keys with '' (shadowing any stale session
 * value on the pooled connection for the duration of the transaction).
 */
const SET_PRINCIPAL_CONTEXT_SQL =
  `SELECT set_config('${PRINCIPAL_GUC_NAMES.tenantId}', $1, true), ` +
  `set_config('${PRINCIPAL_GUC_NAMES.userId}', $2, true), ` +
  `set_config('${PRINCIPAL_GUC_NAMES.sessionId}', $3, true), ` +
  `set_config('${PRINCIPAL_GUC_NAMES.requestId}', $4, true)`;

export function withPrincipalContext<T>(
  target: PrismaHandle,
  context: PrincipalContext,
  fn: (tx: PrismaTransactionClient) => Promise<T>,
  options?: WithPrincipalContextOptions,
): Promise<T>;
export function withPrincipalContext<T>(
  target: PostgresPersistenceAdapter,
  context: PrincipalContext,
  fn: (tx: TransactionClient) => Promise<T>,
  options?: WithPrincipalContextOptions,
): Promise<T>;
export async function withPrincipalContext<T>(
  target: PrismaHandle | PostgresPersistenceAdapter,
  context: PrincipalContext,
  fn: ((tx: PrismaTransactionClient) => Promise<T>) | ((tx: TransactionClient) => Promise<T>),
  options: WithPrincipalContextOptions = {},
): Promise<T> {
  // Fail closed BEFORE any connection is checked out or query issued.
  const values = validateContext(context, options.require ?? DEFAULT_REQUIRED_CONTEXT);

  if (target instanceof PostgresPersistenceAdapter) {
    const run = fn as (tx: TransactionClient) => Promise<T>;
    return target.withTransaction(async (tx) => {
      await tx.query(SET_PRINCIPAL_CONTEXT_SQL, [
        values.tenantId,
        values.userId,
        values.sessionId,
        values.requestId,
      ]);
      return run(tx);
    });
  }

  const run = fn as (tx: PrismaTransactionClient) => Promise<T>;
  return target.client.$transaction(
    async (tx) => {
      // Tagged template: values are bind parameters, never spliced into SQL.
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${values.tenantId}, true), set_config('app.user_id', ${values.userId}, true), set_config('app.session_id', ${values.sessionId}, true), set_config('app.request_id', ${values.requestId}, true)`;
      return run(tx as PrismaTransactionClient);
    },
    {
      ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      ...(options.maxWaitMs === undefined ? {} : { maxWait: options.maxWaitMs }),
    },
  );
}

/**
 * The common case as sugar: a tenant-scoped transaction for an authenticated
 * principal. Both identifiers are required by signature and re-required at
 * runtime; there is no way to call this without a tenant and a user.
 */
export function withTenant<T>(
  target: PrismaHandle,
  tenantId: TenantId,
  userId: UserId,
  fn: (tx: PrismaTransactionClient) => Promise<T>,
): Promise<T>;
export function withTenant<T>(
  target: PostgresPersistenceAdapter,
  tenantId: TenantId,
  userId: UserId,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T>;
export function withTenant<T>(
  target: PrismaHandle | PostgresPersistenceAdapter,
  tenantId: TenantId,
  userId: UserId,
  fn: ((tx: PrismaTransactionClient) => Promise<T>) | ((tx: TransactionClient) => Promise<T>),
): Promise<T> {
  return withPrincipalContext(
    target as PostgresPersistenceAdapter,
    { tenantId, userId },
    fn as (tx: TransactionClient) => Promise<T>,
    { require: ['tenantId', 'userId'] },
  );
}
