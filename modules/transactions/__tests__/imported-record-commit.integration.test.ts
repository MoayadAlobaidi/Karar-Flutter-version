/**
 * `ImportedRecordCommitPort` against live PostgreSQL: the records a reviewed
 * statement import produces, written on a transaction this module did not
 * open.
 *
 * The property under test is the one that used to keep this code in the wrong
 * module. A statement commit has to land as ONE unit — the canonical records,
 * the staged rows' links back to them, and the import's own state moves — and
 * `TransactionRepository.commit` opens a transaction per record, so it could
 * never be a part of anybody else's unit. `PrismaStatementCommitWriter` opens
 * nothing: it joins the caller's transaction, and the caller decides whether
 * any of it survives.
 *
 * So three things are proven here rather than argued:
 *
 *  1. the records really are written through the caller's handle;
 *  2. **the caller's rollback takes all of them**, which is what lets the
 *     ingestion module promise "everything, or nothing" across two modules;
 *  3. the duplicate and occurrence-ordinal rules arrive as this module's own
 *     typed errors, carrying none of the driver's text — a message that
 *     quoted the constraint would carry a fragment of the very record it
 *     refused.
 *
 * Counted as the bootstrap superuser with RLS bypassed, because "nothing was
 * written" must mean absent rather than hidden.
 *
 * Every fixture is synthetic: random identifiers, obviously invented merchant
 * text, round amounts.
 */

import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CalendarDay } from '@karar/shared-kernel';
import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import { withPrincipalContext } from '@karar/platform/dist/db/principal-context.js';

import { HsfField } from '../domain/hsf-field.js';
import { AccountRef, ActorRef, ImportRef, RowRef, TransactionId } from '../domain/refs.js';
import type {
  ImportedNarrativeColumns,
  ImportedRecordBatch,
  ImportedRecordCommit,
} from '../application/ports/imported-record-commit.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import { OccurrenceOrdinalNotNextError } from '../application/ports/transaction-repository.js';
import { PrismaStatementCommitWriter } from '../infrastructure/persistence/prisma-statement-commit-writer.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import { BOOKED, NOW, principal, syntheticMerchant } from './fakes/synthetic-fixtures.js';

const superuserMaintenanceProfile = LocalPostgresConnectionProfile.fromEnv('superuser', {
  database: maintenanceDatabase(),
});

async function probePostgres(): Promise<string | null> {
  const client = new pg.Client({
    host: superuserMaintenanceProfile.host,
    port: superuserMaintenanceProfile.port,
    database: superuserMaintenanceProfile.database,
    user: superuserMaintenanceProfile.user,
    password: superuserMaintenanceProfile.password.unwrap(),
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (error) {
    await client.end().catch(() => {});
    return error instanceof Error ? error.message : String(error);
  }
}

const unreachable = await probePostgres();
if (unreachable !== null) {
  process.stderr.write(
    [
      '='.repeat(76),
      `IMPORTED-RECORD COMMIT TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence that a statement commit can be ONE unit of',
      'work across two modules: the records join the caller’s transaction and',
      'go with its rollback. Start the database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  KARAR_ENV=local POSTGRES_PORT=5433 pnpm --filter @karar/transactions test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_txn_imported`;

describe.skipIf(unreachable !== null)('imported records, on the caller’s transaction', () => {
  let prismaHandle: PrismaHandle;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  const alice: TransactionsPrincipal = principal();
  const accountRef = AccountRef.of(randomUUID());
  const importRef = ImportRef.of(randomUUID());
  const actorRef = ActorRef.of(alice.userId);
  const writer = new PrismaStatementCommitWriter();
  const encryption = new LocalAesGcmFieldEncryptionProvider({
    key: Buffer.alloc(32, 29),
    keyVersion: 'karar-ref:key-version:local-transactions-hsf@v1',
  });

  /** The first batch's content identity, reused by the refusal tests. */
  const firstFingerprint = `synthetic-content-${randomUUID()}`;

  async function counts(): Promise<{
    transactions: number;
    revisions: number;
    provenance: number;
  }> {
    const result = await superuserAdapter.query<{
      transactions: string;
      revisions: string;
      provenance: string;
    }>(
      `SELECT (SELECT count(*) FROM public.transactions) AS transactions,
              (SELECT count(*) FROM public.transaction_revisions) AS revisions,
              (SELECT count(*) FROM public.transaction_provenance) AS provenance`,
    );
    const row = result.rows[0];
    return {
      transactions: Number(row?.transactions ?? -1),
      revisions: Number(row?.revisions ?? -1),
      provenance: Number(row?.provenance ?? -1),
    };
  }

  /**
   * The narrative columns as the ingestion module hands them over: already
   * ciphertext, produced by THIS module's own encryptor, bound to the row it
   * belongs to.
   */
  async function narrativeFor(rowId: string, label: string): Promise<ImportedNarrativeColumns> {
    const description = await encryption.encryptField(alice, HsfField.of(label), {
      table: 'transactions',
      rowId,
      field: 'description',
    });
    const merchant = await encryption.encryptField(alice, HsfField.of(label), {
      table: 'transactions',
      rowId,
      field: 'merchant',
    });
    return {
      hsfAlgorithm: description.algorithm,
      hsfKeyVersion: description.keyVersion,
      descriptionCiphertext: description.ciphertext,
      descriptionNonce: description.nonce,
      descriptionAuthTag: description.authTag,
      merchantCiphertext: merchant.ciphertext,
      merchantNonce: merchant.nonce,
      merchantAuthTag: merchant.authTag,
    };
  }

  async function record(
    fingerprint: string,
    ordinal: number,
    rowNumber: number,
  ): Promise<ImportedRecordCommit> {
    const transactionId = randomUUID();
    const revisionId = randomUUID();
    return {
      transactionId: TransactionId.of(transactionId),
      revisionId,
      provenanceId: randomUUID(),
      categoryAssignmentId: randomUUID(),
      accountRef,
      bookingDate: BOOKED,
      valueDate: CalendarDay.of(2026, 8, 18),
      eventOccurredAt: null,
      sourceTimezone: null,
      amountMinorUnits: -4500n,
      currencyCode: 'QAR',
      narrative: await narrativeFor(transactionId, syntheticMerchant('imported line')),
      revisionNarrative: await narrativeFor(revisionId, syntheticMerchant('imported line')),
      sourceDirection: 'NOT_STATED',
      directionMapping: 'SOURCE_SIGNED_AMOUNT',
      dedupFingerprint: fingerprint,
      fingerprintVersion: 'dedup/synthetic/v1',
      occurrenceOrdinal: ordinal,
      rowRef: RowRef.of(String(rowNumber)),
      // No category: an exact reviewed rule is the only thing that assigns
      // one, and none matched. `null` is the ordinary answer.
      categoryCode: null,
      categoryRuleVersion: null,
    };
  }

  function batch(records: readonly ImportedRecordCommit[]): ImportedRecordBatch {
    return {
      records,
      importRef,
      actorRef,
      versions: {
        parserVersion: 'synthetic-parser/v1',
        mappingVersion: 'synthetic-mapping/v1',
        normalizationVersion: 'synthetic-normalization/v1',
        fingerprintVersion: 'dedup/synthetic/v1',
      },
      committedAt: NOW,
    };
  }

  /** What a caller does: open ONE transaction, and put the records in it. */
  function inCallersTransaction<T>(
    run: (unit: { readonly unit: unknown }) => Promise<T>,
  ): Promise<T> {
    return withPrincipalContext(
      prismaHandle,
      { tenantId: alice.tenantId, userId: alice.userId },
      (tx) => run({ unit: tx }),
      { require: ['tenantId', 'userId'] },
    );
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    await migrateToLatest({ adapter: migratorAdapter });
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));
  }, 180_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  }, 60_000);

  it('writes every record, its revision and its provenance through the caller’s handle', async () => {
    const before = await counts();
    const records = [await record(firstFingerprint, 1, 1), await record(`${firstFingerprint}-b`, 1, 2)];

    await inCallersTransaction((unit) => writer.writeImportedRecords(unit, alice, batch(records)));

    const after = await counts();
    expect(after.transactions).toBe(before.transactions + 2);
    expect(after.revisions).toBe(before.revisions + 2);
    expect(after.provenance).toBe(before.provenance + 2);

    // Provenance is what makes an imported record explainable back to a line
    // of a file, so the import and the row are asserted rather than assumed.
    const provenance = await superuserAdapter.query<{
      source_kind: string;
      import_ref: string;
      row_ref: string;
      attribution: string;
    }>(
      `SELECT p.source_kind, p.import_ref, p.row_ref, r.attribution
         FROM public.transaction_provenance p
         JOIN public.transaction_revisions r ON r.transaction_id = p.transaction_id
        ORDER BY p.row_ref`,
    );
    expect(provenance.rows.map((row) => row.row_ref)).toEqual(['1', '2']);
    for (const row of provenance.rows) {
      expect(row.source_kind).toBe('CSV');
      expect(row.import_ref).toBe(importRef);
      expect(row.attribution).toBe('SOURCE_IMPORT');
    }
  }, 60_000);

  it('leaves NO record behind when the caller rolls its transaction back', async () => {
    // The proof that this writer is part of somebody else's unit of work. The
    // failure is raised AFTER the records are written, which is where a
    // second transaction hiding inside this writer would show up as rows that
    // survived a rollback.
    const before = await counts();
    const records = [await record(`${firstFingerprint}-rolled-back`, 1, 9)];

    await expect(
      inCallersTransaction(async (unit) => {
        await writer.writeImportedRecords(unit, alice, batch(records));
        throw new Error('synthetic caller failure after the records were written');
      }),
    ).rejects.toThrow('synthetic caller failure');

    expect(await counts()).toEqual(before);
  }, 60_000);

  it('refuses an already-recorded line as this module’s own typed error', async () => {
    const before = await counts();
    // Occurrence 1 of content whose occurrence 1 is already recorded. The
    // ORDINAL guard is what refuses it, not the unique index: once occurrence
    // 1 exists, 1 is no longer the next unused ordinal, and the trigger sees
    // that before the index is consulted. The unique key is what settles the
    // race the trigger cannot see — two writers both computing the same next
    // ordinal before either commits — and `dedup-occurrence.integration.test.ts`
    // proves that arm against the schema itself.
    const repeat = [await record(firstFingerprint, 1, 3)];

    const refusal = await inCallersTransaction((unit) =>
      writer.writeImportedRecords(unit, alice, batch(repeat)),
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(OccurrenceOrdinalNotNextError);
    // And the refusal took the whole unit with it.
    expect(await counts()).toEqual(before);
  }, 60_000);

  it('refuses an ordinal that is not the next unused one, carrying no driver text', async () => {
    const before = await counts();
    // Occurrence 5 of content whose only recorded occurrence is 1. Skipping
    // ahead is how duplicate review would be one field away from optional.
    const skipped = [await record(firstFingerprint, 5, 4)];

    const refusal = await inCallersTransaction((unit) =>
      writer.writeImportedRecords(unit, alice, batch(skipped)),
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(OccurrenceOrdinalNotNextError);
    expect((refusal as OccurrenceOrdinalNotNextError).requestedOrdinal).toBe(5);
    // The message is this module's own: a driver message here would quote the
    // constraint and, with it, a fragment of the record it refused.
    const message = (refusal as Error).message;
    for (const leak of ['KAR01', '23505', 'duplicate key', 'transactions_occurrence_guard']) {
      expect(message).not.toContain(leak);
    }
    expect(await counts()).toEqual(before);
  }, 60_000);
});
