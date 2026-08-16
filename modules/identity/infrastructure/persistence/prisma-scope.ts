/**
 * Transaction scoping for the identity tables' FORCEd RLS (migrations
 * 0030-0033). `withAccount` runs its work inside ONE interactive Prisma
 * transaction whose first statement sets the `app.user_id` GUC with
 * `set_config(..., is_local => true)` — transaction-local by construction,
 * so the principal context cannot leak across pooled connections.
 *
 * Everything OUTSIDE such a transaction runs with no GUC and therefore under
 * the bootstrap policy arms only (db/rls-allow-list.json): the
 * pre-authentication reads and writes, and nothing account-scoped.
 *
 * Prisma types stay inside infrastructure/persistence (architecture test 4).
 */

import type { PrismaClient, PrismaHandle } from '@karar/platform/dist/db/prisma.js';

/** The client shape inside an interactive transaction. */
export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class IdentityPrismaScope {
  constructor(private readonly handle: PrismaHandle) {}

  /** The bare client — bootstrap-arm access only (no principal context). */
  get bootstrap(): PrismaClient {
    return this.handle.client;
  }

  /** One transaction, scoped to `accountId` via the app.user_id GUC. */
  withAccount<T>(accountId: string, fn: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.handle.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${accountId}, true)`;
      return fn(tx);
    });
  }
}

/** Prisma unique-violation (P2002) without importing Prisma error classes. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
