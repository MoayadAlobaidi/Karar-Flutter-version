/**
 * `PaymentInstrumentRepository` over Prisma — every statement inside the
 * platform's `withPrincipalContext` transaction.
 *
 * RLS on `payment_instruments` requires BOTH principal GUCs, so a call
 * without them returns and affects nothing: the policy fails closed. The
 * explicit `where` clauses are Layer-2 convenience — **RLS is the boundary**,
 * and removing every filter here would change nothing about which rows a
 * caller can reach.
 *
 * ## What this file deliberately cannot do
 *
 * There is no `aggregate`, no `groupBy`, no `count` and no `_sum` anywhere in
 * it, and there never may be. A repository is where a convenience total first
 * appears — "how much is on this card" is the question a caller asks next —
 * and the honest answer is that the question belongs to the account. Two
 * virtual cards on one wallet share ONE balance; a per-card figure would
 * either repeat it twice or invent a split nobody stated. The module's
 * no-money-arithmetic suite scans this file for exactly those shapes.
 *
 * ## The identity columns are absent from every `data` block
 *
 * `accountId`, `accountReferenceType`, `instrumentType`, `tenantId`, `userId`
 * and `createdAt` are written on INSERT and never appear in an UPDATE. They
 * are frozen by `payment_instruments_guard` (SQLSTATE KAR30), and a
 * repository that sent them would be one edit away from trying to move an
 * instrument to another account. The safest expression of "this cannot be
 * updated" is not to offer it.
 *
 * ## The mask is written and read, and never rendered
 *
 * It goes into the row as ciphertext and comes back out as an `HsfField`, and
 * it appears nowhere else: not in a log line here, not in an error message,
 * and not in anything this file returns except the entity itself. The erasure
 * path does not decrypt at all — an erasure has no reason to read a card
 * mask.
 */

import { TenantId, UserId } from '@karar/shared-kernel';
import {
  withPrincipalContext,
  type PrismaTransactionClient,
} from '@karar/platform/dist/db/principal-context.js';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import type { HsfFieldEncryptionPort } from '../../application/ports/hsf-field-encryption.js';
import type {
  InstrumentCreateOutcome,
  InstrumentUpdateOutcome,
  PaymentInstrumentRepository,
} from '../../application/ports/payment-instrument-repository.js';
import type { InstrumentsPrincipal } from '../../application/principal.js';
import type { PaymentInstrument } from '../../domain/payment-instrument.js';
import type { BalanceBearingAccountRef, PaymentInstrumentId } from '../../domain/refs.js';
import {
  encryptInstrumentFields,
  toPaymentInstrument,
  type PaymentInstrumentRow,
} from './row-mappers.js';

export class PrismaPaymentInstrumentRepository implements PaymentInstrumentRepository {
  constructor(
    private readonly handle: PrismaHandle,
    private readonly encryption: HsfFieldEncryptionPort,
  ) {}

  private inContext<T>(
    actor: InstrumentsPrincipal,
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
      { require: ['tenantId', 'userId'] },
    );
  }

  private async mapAll(
    rows: readonly PaymentInstrumentRow[],
    actor: InstrumentsPrincipal,
  ): Promise<readonly PaymentInstrument[]> {
    // Sequential rather than concurrent: a key-management provider is
    // rate-limited everywhere but local, and a person's instrument list is
    // short by nature.
    const instruments: PaymentInstrument[] = [];
    for (const row of rows) {
      instruments.push(await toPaymentInstrument(row, this.encryption, actor));
    }
    return instruments;
  }

  listOwn(actor: InstrumentsPrincipal): Promise<readonly PaymentInstrument[]> {
    return this.inContext(actor, async (tx) => {
      const rows = await tx.paymentInstrument.findMany({
        where: {
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return this.mapAll(rows as readonly PaymentInstrumentRow[], actor);
    });
  }

  listOwnForAccount(
    actor: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<readonly PaymentInstrument[]> {
    return this.inContext(actor, async (tx) => {
      // A LIST, deliberately. The question "what spends from this account?"
      // has a list for an answer; the question a count would suggest — "how
      // much is on it" — belongs to the account and not to the cards.
      const rows = await tx.paymentInstrument.findMany({
        where: {
          accountId: accountRef.accountId,
          accountReferenceType: accountRef.referenceType,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return this.mapAll(rows as readonly PaymentInstrumentRow[], actor);
    });
  }

  findOwnById(
    actor: InstrumentsPrincipal,
    id: PaymentInstrumentId,
  ): Promise<PaymentInstrument | null> {
    return this.inContext(actor, async (tx) => {
      const row = await tx.paymentInstrument.findFirst({
        where: {
          id,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return row === null
        ? null
        : toPaymentInstrument(row as PaymentInstrumentRow, this.encryption, actor);
    });
  }

  async create(
    actor: InstrumentsPrincipal,
    instrument: PaymentInstrument,
  ): Promise<InstrumentCreateOutcome> {
    const encrypted = await encryptInstrumentFields(
      this.encryption,
      actor,
      instrument.id,
      instrument.mask,
      instrument.displayLabel,
    );
    const row = await this.inContext(actor, (tx) =>
      tx.paymentInstrument.create({
        data: {
          id: instrument.id,
          tenantId: TenantId.toString(instrument.tenantId),
          userId: UserId.toString(instrument.userId),
          accountId: instrument.accountRef.accountId,
          accountReferenceType: instrument.accountRef.referenceType,
          instrumentType: instrument.instrumentType,
          status: instrument.status,
          ...encrypted,
          version: instrument.version,
          createdAt: instrument.createdAt,
          updatedAt: instrument.updatedAt,
        },
      }),
    );
    return {
      kind: 'created' as const,
      instrument: await toPaymentInstrument(row as PaymentInstrumentRow, this.encryption, actor),
    };
  }

  async update(
    actor: InstrumentsPrincipal,
    expectedVersion: number,
    next: PaymentInstrument,
  ): Promise<InstrumentUpdateOutcome> {
    const encrypted = await encryptInstrumentFields(
      this.encryption,
      actor,
      next.id,
      next.mask,
      next.displayLabel,
    );
    return this.inContext(actor, async (tx) => {
      const tenantId = TenantId.toString(actor.tenantId);
      const userId = UserId.toString(actor.userId);
      const written = await tx.paymentInstrument.updateMany({
        where: { id: next.id, version: expectedVersion, tenantId, userId },
        data: {
          status: next.status,
          ...encrypted,
          version: next.version,
          updatedAt: next.updatedAt,
        },
      });
      if (written.count === 0) {
        const still = await tx.paymentInstrument.findFirst({
          where: { id: next.id, tenantId, userId },
          select: { id: true },
        });
        return still === null ? { kind: 'not_found' as const } : { kind: 'stale' as const };
      }
      const row = await tx.paymentInstrument.findFirst({
        where: { id: next.id, tenantId, userId },
      });
      return row === null
        ? { kind: 'not_found' as const }
        : {
            kind: 'updated' as const,
            instrument: await toPaymentInstrument(
              row as PaymentInstrumentRow,
              this.encryption,
              actor,
            ),
          };
    });
  }

  delete(actor: InstrumentsPrincipal, id: PaymentInstrumentId): Promise<boolean> {
    return this.inContext(actor, async (tx) => {
      const removed = await tx.paymentInstrument.deleteMany({
        where: {
          id,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return removed.count > 0;
    });
  }

  eraseForAccount(
    actor: InstrumentsPrincipal,
    accountRef: BalanceBearingAccountRef,
  ): Promise<number> {
    return this.inContext(actor, async (tx) => {
      // Nothing is decrypted on the way out: an erasure has no reason to read
      // a card mask, and the cheapest way not to leak a value is not to read
      // it. Idempotent by contract — a second call finds nothing and answers
      // zero.
      const removed = await tx.paymentInstrument.deleteMany({
        where: {
          accountId: accountRef.accountId,
          accountReferenceType: accountRef.referenceType,
          tenantId: TenantId.toString(actor.tenantId),
          userId: UserId.toString(actor.userId),
        },
      });
      return removed.count;
    });
  }
}
