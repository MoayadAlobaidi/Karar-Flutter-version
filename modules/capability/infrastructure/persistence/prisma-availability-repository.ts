/**
 * CapabilityAvailabilityRepository over Prisma. capability_availability is
 * deliberately GLOBAL configuration (allow-listed from RLS with compensating
 * controls — see migration 0076 and rls-allow-list.json), so statements run
 * without a principal context; the write path above this repository is the
 * permission-gated operator use case, and the DB guard triggers enforce
 * version discipline and the append-only history ledger.
 *
 * `factsFor` is ONE read (the §44 snapshot pin): it fetches the matching
 * environment rows for the capability once and derives the effective row —
 * jurisdiction-specific over environment-wide; among unexpected duplicates
 * (possible only for the null-scope row, which no unique constraint can
 * guard) the latest write wins, deterministically.
 */

import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  isAvailabilityState,
  type AvailabilityState,
  type CapabilityAvailabilityRecord,
} from '../../domain/availability-state.js';
import type { AvailabilityFacts } from '../../domain/resolution.js';
import type { CapabilityAvailabilityRepository } from '../../application/ports/availability-repository.js';

interface AvailabilityRow {
  readonly id: string;
  readonly environment: string;
  readonly jurisdictionRef: string | null;
  readonly capabilityId: string;
  readonly state: string;
  readonly reason: string;
  readonly actorRef: string;
  readonly version: number;
  readonly updatedAt: Date;
}

export class PrismaCapabilityAvailabilityRepository implements CapabilityAvailabilityRepository {
  constructor(private readonly handle: PrismaHandle) {}

  async factsFor(
    environment: string,
    scopeRef: string | null,
    capabilityId: string,
  ): Promise<AvailabilityFacts> {
    const scopes: Array<string | null> = scopeRef === null ? [null] : [scopeRef, null];
    const rows: AvailabilityRow[] = await this.handle.client.capabilityAvailability.findMany({
      where: {
        capabilityId,
        environment,
        OR: scopes.map((s) => ({ jurisdictionRef: s })),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const effective =
      rows.find((row) => row.jurisdictionRef !== null) ?? rows.find(() => true) ?? null;
    if (effective !== null) {
      return {
        kind: 'ROW',
        rowId: effective.id,
        state: parseState(effective.state),
        version: effective.version,
      };
    }
    const elsewhere = await this.handle.client.capabilityAvailability.count({
      where: { capabilityId, environment: { not: environment } },
    });
    return { kind: 'NO_ROW', existsForOtherEnvironment: elsewhere > 0 };
  }

  async findExact(
    environment: string,
    scopeRef: string | null,
    capabilityId: string,
  ): Promise<CapabilityAvailabilityRecord | null> {
    const row: AvailabilityRow | null =
      await this.handle.client.capabilityAvailability.findFirst({
        where: { environment, capabilityId, jurisdictionRef: scopeRef },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      });
    return row === null ? null : toRecord(row);
  }

  async insert(record: CapabilityAvailabilityRecord, at: Date): Promise<void> {
    await this.handle.client.capabilityAvailability.create({
      data: {
        id: record.id,
        environment: record.environment,
        jurisdictionRef: record.jurisdictionRef,
        capabilityId: record.capabilityId,
        state: record.state,
        reason: record.reason,
        actorRef: record.actorRef,
        version: record.version,
        updatedAt: at,
      },
    });
  }

  async updateState(
    id: string,
    expectedVersion: number,
    state: AvailabilityState,
    reason: string,
    actorRef: string,
    at: Date,
  ): Promise<'UPDATED' | 'VERSION_CONFLICT'> {
    const updated = await this.handle.client.capabilityAvailability.updateMany({
      where: { id, version: expectedVersion },
      data: { state, reason, actorRef, version: expectedVersion + 1, updatedAt: at },
    });
    return updated.count === 1 ? 'UPDATED' : 'VERSION_CONFLICT';
  }
}

function parseState(value: string): AvailabilityState {
  if (!isAvailabilityState(value)) {
    // The CHECK constraint makes this unreachable; fail closed if it ever
    // happens rather than inventing an allowing state.
    return 'DISABLED';
  }
  return value;
}

function toRecord(row: AvailabilityRow): CapabilityAvailabilityRecord {
  return {
    id: row.id,
    environment: row.environment,
    jurisdictionRef: row.jurisdictionRef,
    capabilityId: row.capabilityId,
    state: parseState(row.state),
    reason: row.reason,
    actorRef: row.actorRef,
    version: row.version,
  };
}
