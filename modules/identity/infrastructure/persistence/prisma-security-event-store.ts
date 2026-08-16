/**
 * Prisma adapter for the append-only authentication security ledger
 * (SecurityEventRecorder; migration 0033). INSERT and COUNT are the entire
 * surface — the table's grants, trigger, and policy set forbid everything
 * else, and this class deliberately exposes nothing more.
 */

import { Result } from '@karar/shared-kernel';

import type { SecurityEvent } from '../../domain/security-event.js';
import type {
  SecurityEventCountQuery,
  SecurityEventRecorder,
  SecurityEventWriteError,
} from '../../application/ports/security-event-recorder.js';
import { IdentityPrismaScope } from './prisma-scope.js';
import { uuidv7 } from '../crypto/uuidv7.js';

export class PrismaSecurityEventStore implements SecurityEventRecorder {
  constructor(private readonly scope: IdentityPrismaScope) {}

  async record(event: SecurityEvent): Promise<Result<void, SecurityEventWriteError>> {
    try {
      await this.scope.bootstrap.authenticationSecurityEvent.create({
        data: {
          id: uuidv7(),
          accountId: event.accountId,
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          ipDigest: event.ipDigest,
          ...(event.metadata !== null ? { metadata: event.metadata } : {}),
        },
      });
      return Result.ok(undefined);
    } catch (error) {
      return Result.err({
        kind: 'unavailable',
        message: `security-event append failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      });
    }
  }

  async countSince(query: SecurityEventCountQuery): Promise<number> {
    return this.scope.bootstrap.authenticationSecurityEvent.count({
      where: {
        accountId: query.accountId,
        eventType: { in: [...query.eventTypes] },
        occurredAt: { gt: query.since },
        ...(query.ipDigest !== undefined ? { ipDigest: query.ipDigest } : {}),
      },
    });
  }
}
