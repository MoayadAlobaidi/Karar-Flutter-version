/**
 * Adapters for the deliberately-global jurisdiction tables (allow-listed in
 * rls-allow-list.json with compensating grants): the reference registers
 * (SELECT-only for karar_app), the restrict-only settings row (SELECT-only
 * this phase), and the append-only activation ledger (SELECT+INSERT; the
 * immutability trigger holds even for the table owner). No principal context
 * is bound here because no principal predicate exists on these tables — the
 * access rules live in the grants and the migration headers.
 */

import type { PrismaClient } from '@karar/platform/dist/db/prisma.js';
import { jurisdictionId } from '@karar/jurisdiction-policy';
import type { JurisdictionId, PolicyEnvironment } from '@karar/jurisdiction-policy';

import type {
  CountryRecord,
  JurisdictionRecord,
  JurisdictionSettingsRecord,
} from '../../domain/reference.js';
import type {
  ActivationAction,
  PackActivationRecord,
} from '../../domain/pack-activation.js';
import type {
  JurisdictionDirectory,
  JurisdictionSettingsReader,
  PackActivationLedger,
} from '../../application/ports/repositories.js';

export class PrismaJurisdictionDirectory implements JurisdictionDirectory {
  constructor(private readonly client: PrismaClient) {}

  async findJurisdiction(code: string): Promise<JurisdictionRecord | null> {
    const row = await this.client.jurisdiction.findUnique({ where: { code } });
    return row === null ? null : toJurisdictionRecord(row);
  }

  async listJurisdictions(): Promise<readonly JurisdictionRecord[]> {
    const rows = await this.client.jurisdiction.findMany({ orderBy: { code: 'asc' } });
    return rows.map(toJurisdictionRecord);
  }

  async listCountries(): Promise<readonly CountryRecord[]> {
    const rows = await this.client.country.findMany({ orderBy: { code: 'asc' } });
    return rows.map((row) => ({
      code: row.code,
      displayNameKey: row.displayNameKey,
      defaultCurrency: row.defaultCurrency,
      status: row.status as CountryRecord['status'],
    }));
  }
}

export class PrismaJurisdictionSettingsReader implements JurisdictionSettingsReader {
  constructor(private readonly client: PrismaClient) {}

  async findSettings(code: JurisdictionId): Promise<JurisdictionSettingsRecord | null> {
    const row = await this.client.jurisdictionSetting.findUnique({
      where: { jurisdictionCode: code },
    });
    if (row === null) return null;
    return {
      jurisdictionCode: jurisdictionId(row.jurisdictionCode),
      disabledCapabilityIds: row.disabledCapabilityIds,
      aiProcessingSuspended: row.aiProcessingSuspended,
      version: row.version,
      reason: row.reason,
      updatedBy: row.updatedBy,
    };
  }
}

export class PrismaPackActivationLedger implements PackActivationLedger {
  constructor(private readonly client: PrismaClient) {}

  async append(record: PackActivationRecord): Promise<void> {
    await this.client.policyPackActivation.create({
      data: {
        id: record.id,
        jurisdictionCode: record.jurisdictionCode,
        packVersion: record.packVersion,
        packLifecycleAtActivation: record.packLifecycleAtActivation,
        environment: record.environment,
        action: record.action,
        occurredAt: record.occurredAt,
        actor: record.actor,
        reason: record.reason,
        createdAt: record.createdAt,
      },
    });
  }

  async listFor(
    code: JurisdictionId,
    environment: PolicyEnvironment,
  ): Promise<readonly PackActivationRecord[]> {
    const rows = await this.client.policyPackActivation.findMany({
      where: { jurisdictionCode: code, environment },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      jurisdictionCode: jurisdictionId(row.jurisdictionCode),
      packVersion: row.packVersion,
      packLifecycleAtActivation:
        row.packLifecycleAtActivation as PackActivationRecord['packLifecycleAtActivation'],
      environment: row.environment as PolicyEnvironment,
      action: row.action as ActivationAction,
      occurredAt: row.occurredAt,
      actor: row.actor,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }
}

function toJurisdictionRecord(row: {
  code: string;
  countryCode: string;
  type: string;
  status: string;
  reviewStatus: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  provenance: string;
}): JurisdictionRecord {
  return {
    code: jurisdictionId(row.code),
    countryCode: row.countryCode,
    type: row.type as JurisdictionRecord['type'],
    status: row.status as JurisdictionRecord['status'],
    reviewStatus: row.reviewStatus as JurisdictionRecord['reviewStatus'],
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    provenance: row.provenance,
  };
}
