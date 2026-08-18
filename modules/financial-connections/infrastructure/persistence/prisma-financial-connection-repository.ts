/**
 * `FinancialConnectionRepository` over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction
 * (packages/platform/src/db/principal-context.ts).
 *
 * RLS on `financial_connections` requires BOTH principal GUCs
 * (`app.tenant_id` and `app.user_id`), so a call without them returns and
 * affects nothing: the policy fails closed. The explicit `where` clauses
 * below are Layer-2 convenience that catches honest mistakes early — **RLS is
 * the boundary**, and this file is written so that removing every filter
 * would change nothing about which rows a caller can reach.
 *
 * **This is where the connection's display label becomes ciphertext and comes
 * back.** The label has no plaintext column (migration 0096); it is encrypted
 * on the way in and decrypted on the way out, bound to tenant, user, table,
 * row id and field as associated data. The row id is minted by the use case
 * BEFORE the insert so the associated data can name the row a ciphertext
 * belongs to — a database-generated id would leave nothing to bind to at
 * encryption time.
 *
 * The update and delete paths carry the version predicate into the WHERE
 * clause and read the affected-row count back, so a concurrent edit loses
 * visibly instead of being overwritten. The database backs this twice: the
 * guard trigger refuses any UPDATE that does not increment `version` by
 * exactly one, and it freezes the rail besides.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type {
  ConnectionDeleteOutcome,
  ConnectionUpdateOutcome,
  FinancialConnectionRepository,
} from '../../application/ports/financial-connection-repository.js';
import type { HsfFieldEncryptionPort } from '../../application/ports/hsf-field-encryption.js';
import type { ConnectionsPrincipal } from '../../application/principal.js';
import type { FinancialConnection } from '../../domain/financial-connection.js';
import type { FinancialConnectionId } from '../../domain/refs.js';
import { encryptConnectionFields, toFinancialConnection } from './row-mappers.js';

export class PrismaFinancialConnectionRepository implements FinancialConnectionRepository {
  constructor(
    private readonly handle: PrismaHandle,
    private readonly encryption: HsfFieldEncryptionPort,
  ) {}

  private inContext<T>(
    actor: ConnectionsPrincipal,
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      this.handle,
      {
        tenantId: actor.tenantId,
        userId: actor.userId,
        ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
        ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
      },
      fn,
      // Stated explicitly rather than left to the default: this module has no
      // tenantless read path, and a relaxation would have to be visible here.
      { require: ['tenantId', 'userId'] },
    );
  }

  listOwn(actor: ConnectionsPrincipal): Promise<readonly FinancialConnection[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.financialConnection.findMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        orderBy: { createdAt: 'asc' },
      });
      // Sequential rather than concurrent: a key-management provider is a
      // rate-limited external dependency in every environment but local, and
      // a listing that fans out one call per row is how a page load becomes a
      // throttling incident.
      const connections: FinancialConnection[] = [];
      for (const row of rows) {
        connections.push(await toFinancialConnection(row, this.encryption, actor));
      }
      return connections;
    });
  }

  findOwnById(
    actor: ConnectionsPrincipal,
    id: FinancialConnectionId,
  ): Promise<FinancialConnection | null> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.financialConnection.findFirst({
        where: {
          id,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null ? null : toFinancialConnection(row, this.encryption, actor);
    });
  }

  async create(
    actor: ConnectionsPrincipal,
    connection: FinancialConnection,
  ): Promise<FinancialConnection> {
    // Encryption happens BEFORE the transaction opens. A key-management call
    // inside an open database transaction holds a connection and a row lock
    // for the duration of a network round trip to another system.
    const encrypted = await encryptConnectionFields(
      this.encryption,
      actor,
      connection.id,
      connection.displayLabel,
    );
    return this.inContext(actor, async (tx) => {
      const row = await tx.financialConnection.create({
        data: {
          id: connection.id,
          tenantId: TenantId.toString(connection.tenantId),
          userId: UserId.toString(connection.userId),
          institutionRef: connection.institutionRef?.institutionId ?? null,
          institutionReferenceType: connection.institutionRef?.referenceType ?? null,
          rail: connection.rail,
          status: connection.status,
          ...encrypted,
          version: connection.version,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      });
      return toFinancialConnection(row, this.encryption, actor);
    });
  }

  async update(
    actor: ConnectionsPrincipal,
    expectedVersion: number,
    next: FinancialConnection,
  ): Promise<ConnectionUpdateOutcome> {
    // Re-encrypted in full on every update, with a fresh nonce. Reusing a
    // nonce under GCM is catastrophic, so "only re-encrypt what changed"
    // would need per-field nonce bookkeeping to be safe; one fresh ciphertext
    // is both cheaper and harder to get wrong.
    const encrypted = await encryptConnectionFields(
      this.encryption,
      actor,
      next.id,
      next.displayLabel,
    );
    return this.inContext(actor, async (tx) => {
      const tenantId = TenantId.toString(actor.tenantId);
      const userId = UserId.toString(actor.userId);
      // updateMany, not update: the version predicate belongs in the WHERE
      // clause so the check and the write are one statement, and the affected
      // count is the answer to "did anyone move first?". The rail is
      // deliberately absent from `data` — it is frozen by trigger, and a
      // repository that sent it would be one edit away from trying to move it.
      const written = await tx.financialConnection.updateMany({
        where: { id: next.id, version: expectedVersion, tenantId, userId },
        data: {
          institutionRef: next.institutionRef?.institutionId ?? null,
          institutionReferenceType: next.institutionRef?.referenceType ?? null,
          status: next.status,
          ...encrypted,
          version: next.version,
          updatedAt: next.updatedAt,
        },
      });
      if (written.count === 0) {
        // Zero rows means either "not yours / never existed" or "someone moved
        // first". Distinguishing them costs one visibility-scoped read and is
        // worth it: the caller's remedy differs (re-read versus stop).
        const still = await tx.financialConnection.findFirst({
          where: { id: next.id, tenantId, userId },
          select: { id: true },
        });
        return still === null ? { kind: 'not_found' as const } : { kind: 'stale' as const };
      }
      const row = await tx.financialConnection.findFirst({
        where: { id: next.id, tenantId, userId },
      });
      return row === null
        ? { kind: 'not_found' as const }
        : {
            kind: 'updated' as const,
            connection: await toFinancialConnection(row, this.encryption, actor),
          };
    });
  }

  deleteOwn(
    actor: ConnectionsPrincipal,
    id: FinancialConnectionId,
    expectedVersion: number,
  ): Promise<ConnectionDeleteOutcome> {
    return this.inContext(actor, async (tx) => {
      const tenantId = TenantId.toString(actor.tenantId);
      const userId = UserId.toString(actor.userId);
      // Only the id and the version are selected: a delete has no reason to
      // decrypt the connection's label on its way out, and the cheapest way
      // not to leak a value is not to read it.
      const connection = await tx.financialConnection.findFirst({
        where: { id, tenantId, userId },
        select: { id: true, version: true },
      });
      if (connection === null) return { kind: 'not_found' as const };
      if (connection.version !== expectedVersion) return { kind: 'stale' as const };

      // The links go first, explicitly, so the count returned to the caller
      // is a measurement rather than an assumption. The foreign key's ON
      // DELETE CASCADE (migration 0097) is the backstop that makes the
      // erasure correct even if this statement is ever removed.
      const links = await tx.accountSourceLink.deleteMany({
        where: { connectionId: id, tenantId, userId },
      });
      const removed = await tx.financialConnection.deleteMany({
        where: { id, version: expectedVersion, tenantId, userId },
      });
      if (removed.count === 0) return { kind: 'stale' as const };
      return { kind: 'deleted' as const, sourceLinksDeleted: links.count };
    });
  }
}
