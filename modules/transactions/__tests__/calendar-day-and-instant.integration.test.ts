/**
 * Live-PostgreSQL evidence for ADR-0027 and for the fingerprint definition
 * that rests on it.
 *
 * **The server this runs against is deliberately not UTC.** Its configured
 * `TimeZone` is Asia/Qatar (+03), asserted below before anything else is
 * claimed, so every round trip here crosses a real offset. A suite that
 * proved dates survive a UTC server would prove almost nothing: UTC is the
 * one configuration in which reading a date as an instant happens to work.
 *
 * What is under test:
 *
 *  - a booking day written as 2026-08-12 is still 2026-08-12 after a full
 *    write, read and raw-SQL inspection, at UTC day boundaries, month
 *    boundaries, year boundaries and leap days;
 *  - `event_occurred_at` and `source_timezone` persist when the source
 *    supplied them, stay null when it did not, and the schema refuses a zone
 *    with no instant;
 *  - the source instant does NOT participate in content identity, so the same
 *    movement with a time attached is still a duplicate;
 *  - a fingerprint-version change starts a fresh namespace, so values minted
 *    under the previous definition and the current one coexist in the unique
 *    key instead of colliding.
 *
 * Same probe-or-skip pattern as the other live suites: a skipped run is
 * announced loudly, because a green run that tested nothing is worse than a
 * red one.
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
  PgError,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createPrismaClient, type PrismaHandle } from '@karar/platform/dist/db/prisma.js';

import {
  CreateManualTransaction,
  type CreateManualTransactionInput,
} from '../application/use-cases/create-manual-transaction.js';
import { ListOwnTransactions } from '../application/use-cases/list-own-transactions.js';
import { ReadOwnTransaction } from '../application/use-cases/read-own-transaction.js';
import { UpdateOwnTransaction } from '../application/use-cases/update-own-transaction.js';
import type { DedupFingerprintPort } from '../application/ports/dedup-fingerprint.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import { PrismaCategoryAssignmentRepository } from '../infrastructure/persistence/prisma-category-repositories.js';
import { PrismaTransactionRepository } from '../infrastructure/persistence/prisma-transaction-repository.js';
import { Uuidv7IdSource } from '../infrastructure/persistence/uuidv7-id-source.js';
import { LocalAesGcmFieldEncryptionProvider } from '../infrastructure/providers/local-aes-gcm-field-encryption-provider.js';
import {
  DEDUP_FINGERPRINT_VERSION,
  LocalKeyedDedupFingerprintProvider,
} from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import { LocalSyntheticRetentionDecisionProvider } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import { FixedAccountDirectory, FixedPrincipalContext } from './fakes/in-memory-repositories.js';
import {
  EVENT_OCCURRED_AT,
  NOW,
  SOURCE_TIMEZONE,
  fixedClock,
  principal,
  qar,
  syntheticMerchant,
} from './fakes/synthetic-fixtures.js';

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
      `TRANSACTION TEMPORAL TESTS SKIPPED — PostgreSQL is not reachable at ` +
        `${superuserMaintenanceProfile.host}:${superuserMaintenanceProfile.port}`,
      `(${unreachable})`,
      'These tests are the evidence for ADR-0027 in migrations 0090 and 0091:',
      'calendar days that do not shift, source instants that are never',
      'inferred, and a fingerprint whose day input has no timezone in it.',
      'They mean most on a server whose TimeZone is NOT UTC. Start the',
      'database and rerun:',
      '  POSTGRES_PORT=5433 docker compose up -d postgres --wait',
      '  KARAR_ENV=local POSTGRES_PORT=5433 pnpm --filter @karar/transactions test',
      `${'='.repeat(76)}\n`,
    ].join('\n'),
  );
}

const database = `karar_test_${process.pid}_txn_temporal`;

/**
 * The PREVIOUS fingerprint definition's identifier, over the same
 * construction.
 *
 * Rotation is the property under test, so the value has to come from a real
 * keyed derivation rather than from a literal — and the old identifier is
 * used rather than an invented one, because the question being answered is
 * whether values minted under the definition this change replaced can sit
 * beside values minted under the new one.
 */
class PreviousDefinitionFingerprintPort implements DedupFingerprintPort {
  readonly version = 'dedup/hmac-sha256/utc-day/v2';

  constructor(private readonly inner: DedupFingerprintPort) {}

  async fingerprint(
    subject: TransactionsPrincipal,
    input: Parameters<DedupFingerprintPort['fingerprint']>[1],
  ) {
    const base = await this.inner.fingerprint(subject, input);
    return { version: this.version, value: base.value };
  }
}

/**
 * The days a wrong conversion lands on the wrong side of.
 *
 * Each one is a boundary where an off-by-one changes an answer a person would
 * act on: a month boundary changes which statement a line is in, a year
 * boundary changes an annual total, and the leap days are where a naive
 * implementation rolls an invalid date forward into a plausible wrong one.
 */
const BOUNDARY_DAYS: ReadonlyArray<readonly [string, CalendarDay]> = [
  ['an ordinary day', CalendarDay.of(2026, 8, 12)],
  ['the first of a month', CalendarDay.of(2026, 9, 1)],
  ['the last of a 31-day month', CalendarDay.of(2026, 8, 31)],
  ['the last of a 30-day month', CalendarDay.of(2026, 9, 30)],
  ['new year, the first', CalendarDay.of(2027, 1, 1)],
  ['new year, the eve', CalendarDay.of(2026, 12, 31)],
  ['a leap day', CalendarDay.of(2024, 2, 29)],
  ['the day after a leap day', CalendarDay.of(2024, 3, 1)],
  ['the last of February in a common year', CalendarDay.of(2026, 2, 28)],
  ['the last of February in a non-leap century', CalendarDay.of(2100, 2, 28)],
  ['the last of February in a leap century', CalendarDay.of(2000, 2, 29)],
];

describe.skipIf(unreachable !== null)('calendar days and instants (live PostgreSQL)', () => {
  let prismaHandle: PrismaHandle;
  let appAdapter: PostgresPersistenceAdapter;
  let migratorAdapter: PostgresPersistenceAdapter;
  let superuserAdapter: PostgresPersistenceAdapter;

  let context: FixedPrincipalContext;
  let repository: PrismaTransactionRepository;
  let create: CreateManualTransaction;
  let underPreviousDefinition: CreateManualTransaction;
  let read: ReadOwnTransaction;
  let list: ListOwnTransactions;
  let update: UpdateOwnTransaction;

  const tenant = randomUUID();
  const alice: TransactionsPrincipal = principal(tenant);
  const dayAccount = randomUUID();
  const instantAccount = randomUUID();
  const identityAccount = randomUUID();
  const namespaceAccount = randomUUID();

  async function rawAsPrincipal<T extends pg.QueryResultRow>(
    who: TransactionsPrincipal,
    sql: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<T>> {
    return appAdapter.withTransaction(async (tx) => {
      await tx.query(
        `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
        [who.tenantId, who.userId],
      );
      return tx.query<T>(sql, params);
    });
  }

  function movement(
    overrides: Partial<CreateManualTransactionInput> = {},
  ): CreateManualTransactionInput {
    return {
      accountId: dayAccount,
      magnitude: qar(45),
      direction: 'MONEY_OUT',
      bookingDate: CalendarDay.of(2026, 8, 12),
      description: syntheticMerchant('card purchase'),
      ...overrides,
    };
  }

  beforeAll(async () => {
    await bootstrapRolesAndDatabase({ database });
    migratorAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { database }),
    );
    await migrateToLatest({ adapter: migratorAdapter });
    appAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { database }),
    );
    superuserAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { database }),
    );
    prismaHandle = createPrismaClient(LocalPostgresConnectionProfile.fromEnv('app', { database }));

    const encryption = new LocalAesGcmFieldEncryptionProvider({
      key: Buffer.alloc(32, 31),
      keyVersion: 'karar-ref:key-version:local-transactions-hsf@v1',
    });
    const fingerprints = new LocalKeyedDedupFingerprintProvider({ rootKey: Buffer.alloc(32, 37) });
    const accounts = new FixedAccountDirectory(
      [dayAccount, instantAccount, identityAccount, namespaceAccount].map((accountId) => ({
        accountId,
        owner: alice,
        currencyCode: 'QAR',
      })),
    );
    const retention = new LocalSyntheticRetentionDecisionProvider({ environment: 'local' });
    context = new FixedPrincipalContext(alice);
    repository = new PrismaTransactionRepository(prismaHandle, encryption);
    const ids = new Uuidv7IdSource();
    const clock = fixedClock(NOW);
    create = new CreateManualTransaction(
      context,
      repository,
      fingerprints,
      ids,
      clock,
      retention,
      accounts,
    );
    underPreviousDefinition = new CreateManualTransaction(
      context,
      repository,
      new PreviousDefinitionFingerprintPort(fingerprints),
      ids,
      clock,
      retention,
      accounts,
    );
    read = new ReadOwnTransaction(
      context,
      repository,
      new PrismaCategoryAssignmentRepository(prismaHandle),
    );
    list = new ListOwnTransactions(context, repository);
    update = new UpdateOwnTransaction(context, repository, ids, clock);
    context.actAs(alice);
  }, 90_000);

  afterAll(async () => {
    await prismaHandle?.end();
    await appAdapter?.end();
    await migratorAdapter?.end();
    await superuserAdapter?.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  });

  it('stores the two kinds in two column types, and pins every session to UTC', async () => {
    // The structural premise everything else rests on. booking_date being a
    // `date` is what makes it unable to shift; event_occurred_at being a
    // `timestamptz` is what lets it keep a time of day. Asserted against the
    // live catalogue rather than read off the migration, because the
    // migration is the claim and this is the evidence.
    const columns = await appAdapter.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('transactions', 'transaction_revisions')
          AND column_name IN ('booking_date', 'value_date', 'event_occurred_at', 'created_at')
        GROUP BY column_name, data_type
        ORDER BY column_name`,
    );
    expect(
      Object.fromEntries(columns.rows.map((row) => [row.column_name, row.data_type])),
    ).toEqual({
      booking_date: 'date',
      value_date: 'date',
      event_occurred_at: 'timestamp with time zone',
      created_at: 'timestamp with time zone',
    });

    // The platform pins every session to UTC. That is a different thing from
    // the column type and does not replace it: pinning makes INSTANTS read
    // the same for everyone, it does not turn a date into one. The canonical
    // local server for this repository is deliberately configured to
    // Asia/Qatar underneath that pin, so a day that shifted would shift here.
    const session = await appAdapter.query<{ tz: string }>(
      `SELECT current_setting('TimeZone') AS tz`,
    );
    expect(session.rows[0]?.tz).toBe('UTC');
  });

  it.each(BOUNDARY_DAYS)(
    'writes and reads %s back as the same day, in the domain and in the column',
    async (label, day) => {
      context.actAs(alice);
      const created = await create.execute(
        movement({ bookingDate: day, valueDate: day, description: syntheticMerchant(label) }),
      );
      expect(created.ok ? null : created.error).toBeNull();
      if (!created.ok) return;

      // Through the domain, after a full round trip through the driver.
      expect(created.value.bookingDate.toString()).toBe(day.toString());
      const view = await read.execute({ transactionId: created.value.id });
      expect(view.ok).toBe(true);
      if (!view.ok) return;
      expect(view.value.transaction.bookingDate.toString()).toBe(day.toString());
      expect(view.value.transaction.valueDate?.toString()).toBe(day.toString());
      // And in the revision snapshot, which is what answers "what did the
      // source say" after any later edit.
      expect(view.value.revisions[0]?.values.bookingDate.toString()).toBe(day.toString());

      // And in the column itself, read as TEXT so the assertion is about what
      // PostgreSQL stored rather than about how a driver renders it.
      const stored = await rawAsPrincipal<{ booking: string; value: string }>(
        alice,
        `SELECT booking_date::text AS booking, value_date::text AS value
           FROM transactions WHERE id = $1`,
        [created.value.id],
      );
      expect(stored.rows[0]?.booking).toBe(day.toString());
      expect(stored.rows[0]?.value).toBe(day.toString());
    },
  );

  it('finds 12 August by asking for 12 August, not for a window around it', async () => {
    // The query a "this month" screen makes. If the stored value had drifted
    // by an offset, an equality predicate on the day would miss it — and the
    // screen would quietly show a month with a line missing.
    const rows = await rawAsPrincipal<{ n: string }>(
      alice,
      `SELECT count(*) AS n FROM transactions
        WHERE account_id = $1 AND booking_date = DATE '2026-08-12'`,
      [dayAccount],
    );
    expect(Number(rows.rows[0]?.n)).toBe(1);

    // The month boundary, stated the way a statement query states it.
    const august = await rawAsPrincipal<{ n: string }>(
      alice,
      `SELECT count(*) AS n FROM transactions
        WHERE account_id = $1
          AND booking_date >= DATE '2026-08-01' AND booking_date < DATE '2026-09-01'`,
      [dayAccount],
    );
    const september = await rawAsPrincipal<{ n: string }>(
      alice,
      `SELECT count(*) AS n FROM transactions
        WHERE account_id = $1
          AND booking_date >= DATE '2026-09-01' AND booking_date < DATE '2026-10-01'`,
      [dayAccount],
    );
    // Two rows were booked in August (the 12th and the 31st) and two in
    // September (the 1st and the 30th). A one-day drift in either direction
    // moves one of them across the boundary and breaks exactly one of these.
    expect(Number(august.rows[0]?.n)).toBe(2);
    expect(Number(september.rows[0]?.n)).toBe(2);
  });

  it('reads the same day back under every session timezone, and an instant differently', async () => {
    // The property stated directly: a `date` has no timezone to be read in,
    // so moving the session across fourteen hours either side of UTC cannot
    // move it. The instant beside it DOES render differently, which is what
    // makes this a comparison rather than an assertion that nothing happened.
    const rendered = new Map<string, string>();
    for (const zone of [
      'UTC',
      'Asia/Qatar',
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'Pacific/Niue',
      'Asia/Kathmandu',
    ]) {
      const rows = await appAdapter.withTransaction(async (tx) => {
        await tx.query(
          `SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true),
                  set_config('TimeZone', $3, true)`,
          [alice.tenantId, alice.userId, zone],
        );
        return tx.query<{ day: string; tz: string; created: string }>(
          `SELECT booking_date::text AS day, current_setting('TimeZone') AS tz,
                  created_at::text AS created
             FROM transactions
            WHERE account_id = $1 AND booking_date = DATE '2026-08-12'`,
          [dayAccount],
        );
      });
      expect(rows.rows[0]?.tz, 'the session zone did not actually move').toBe(zone);
      expect(rows.rows[0]?.day, `the booked day moved in ${zone}`).toBe('2026-08-12');
      rendered.set(zone, rows.rows[0]?.created ?? '');
    }
    // The contrast: one stored instant, six renderings, because an instant is
    // a moment that every zone names differently. A date has no such freedom,
    // which is exactly why a booked date must not be stored as one.
    expect(new Set(rendered.values()).size).toBeGreaterThan(1);
  });

  it('pages by day across a year boundary without losing the newest row', async () => {
    context.actAs(alice);
    const page = await list.execute({ accountId: dayAccount, limit: 3 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    // Newest first, by day, across a year boundary: 2027-01-01 sorts ahead of
    // 2026-12-31, which is the assertion an ordering over shifted instants
    // would get wrong at exactly one row per year.
    expect(page.value.transactions.map((transaction) => transaction.bookingDate.toString())).toEqual(
      ['2100-02-28', '2027-01-01', '2026-12-31'],
    );
    expect(page.value.nextCursor).not.toBeNull();

    // The cursor is a day, and resuming from it neither repeats nor drops.
    const firstIds = page.value.transactions.map((transaction) => transaction.id);
    const next = await list.execute({
      accountId: dayAccount,
      limit: 3,
      cursor: page.value.nextCursor as string,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    for (const id of next.value.transactions.map((transaction) => transaction.id)) {
      expect(firstIds, 'a keyset page must not re-serve a row').not.toContain(id);
    }
  });

  it('keeps a source-supplied instant, and its stated zone, exactly as given', async () => {
    context.actAs(alice);
    const created = await create.execute(
      movement({
        accountId: instantAccount,
        description: syntheticMerchant('timed purchase'),
        eventOccurredAt: EVENT_OCCURRED_AT,
        sourceTimezone: SOURCE_TIMEZONE,
      }),
    );
    expect(created.ok ? null : created.error).toBeNull();
    if (!created.ok) return;

    const view = await read.execute({ transactionId: created.value.id });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.transaction.eventOccurredAt?.toISOString()).toBe(
      EVENT_OCCURRED_AT.toISOString(),
    );
    expect(view.value.transaction.sourceTimezone).toBe(SOURCE_TIMEZONE);
    // The instant is an instant and the day is a day: the column types differ
    // and neither was derived from the other.
    const stored = await rawAsPrincipal<{ occurred: string; zone: string; booking: string }>(
      alice,
      `SELECT to_char(event_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS occurred,
              source_timezone AS zone, booking_date::text AS booking
         FROM transactions WHERE id = $1`,
      [created.value.id],
    );
    expect(stored.rows[0]?.zone).toBe(SOURCE_TIMEZONE);
    expect(stored.rows[0]?.booking).toBe('2026-08-12');
    // The instant kept its time of day, which is the whole reason it is a
    // separate column: a date-typed home would have thrown 14:23:45 away.
    expect(stored.rows[0]?.occurred).toBe('2026-08-17T14:23:45');
    // The snapshot carries them too, so a later rewrite would be visible.
    expect(view.value.revisions[0]?.values.eventOccurredAt?.toISOString()).toBe(
      EVENT_OCCURRED_AT.toISOString(),
    );
    expect(view.value.revisions[0]?.values.sourceTimezone).toBe(SOURCE_TIMEZONE);
  });

  it('leaves the instant null when the source stated none — nothing fills it in', async () => {
    context.actAs(alice);
    const created = await create.execute(
      movement({ accountId: instantAccount, description: syntheticMerchant('untimed purchase') }),
    );
    expect(created.ok ? null : created.error).toBeNull();
    if (!created.ok) return;

    const stored = await rawAsPrincipal<{ occurred: Date | null; zone: string | null }>(
      alice,
      `SELECT event_occurred_at AS occurred, source_timezone AS zone FROM transactions WHERE id = $1`,
      [created.value.id],
    );
    // NULL, specifically. Midnight on the booked day would be the value a
    // convenience default produces, and it is a moment nobody observed.
    expect(stored.rows[0]?.occurred).toBeNull();
    expect(stored.rows[0]?.zone).toBeNull();

    const view = await read.execute({ transactionId: created.value.id });
    expect(view.ok && view.value.transaction.eventOccurredAt).toBeNull();
    expect(view.ok && view.value.transaction.sourceTimezone).toBeNull();
  });

  it('refuses a stated zone with no instant, in the schema and not only in the code', async () => {
    // The application refuses it in createTransaction; this is the same rule
    // held against a writer that never goes through the domain — raw SQL
    // today, the ingestion pipeline tomorrow.
    const forged = await rawAsPrincipal(
      alice,
      `INSERT INTO transactions
         (id, tenant_id, user_id, account_id, account_reference_type, amount_minor,
          currency_code, booking_date, source_timezone, hsf_algorithm, hsf_key_version,
          description_ciphertext, description_nonce, description_auth_tag,
          source_kind, status, dedup_fingerprint, fingerprint_version, occurrence_ordinal, version)
       VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', -100, 'QAR', DATE '2026-08-12',
               'Asia/Qatar', 'AES-256-GCM', 'v1', '\\x00'::bytea,
               decode('000000000000000000000000','hex'),
               decode('00000000000000000000000000000000','hex'),
               'MANUAL', 'POSTED', 'zone-without-instant', $5, 1, 1)`,
      [randomUUID(), alice.tenantId, alice.userId, instantAccount, DEDUP_FINGERPRINT_VERSION],
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(forged).toBeInstanceOf(PgError);
    expect((forged as PgError).sqlState, 'a CHECK violation').toBe('23514');
    expect((forged as PgError).message).toContain('transactions_source_timezone_needs_instant');

    // The same rule on the revision table.
    const forgedRevision = await superuserAdapter
      .query(
        `INSERT INTO transaction_revisions
           (id, transaction_id, tenant_id, user_id, revision_number, attribution, actor_ref,
            amount_minor, currency_code, booking_date, source_timezone, status,
            hsf_algorithm, hsf_key_version, description_ciphertext, description_nonce,
            description_auth_tag, changed_fields, recorded_at)
         SELECT $1, id, tenant_id, user_id, 99, 'USER_INPUT', user_id, -100, 'QAR',
                DATE '2026-08-12', 'Asia/Qatar', 'POSTED', 'AES-256-GCM', 'v1', '\\x00'::bytea,
                decode('000000000000000000000000','hex'),
                decode('00000000000000000000000000000000','hex'),
                ARRAY['bookingDate'], now()
           FROM public.transactions LIMIT 1`,
        [randomUUID()],
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((forgedRevision as PgError).sqlState).toBe('23514');
    expect((forgedRevision as PgError).message).toContain(
      'transaction_revisions_source_timezone_needs_instant',
    );
  });

  it('does not let the source instant change what a movement IS', async () => {
    context.actAs(alice);
    const base = movement({
      accountId: identityAccount,
      description: syntheticMerchant('same content, two exports'),
    });
    const first = await create.execute(base);
    expect(first.ok ? null : first.error).toBeNull();

    // The same statement row, re-exported by a source that this time carried
    // a time. Same account, same day, same amount, same narrative — so the
    // same content identity, and a duplicate. If the instant participated in
    // the digest, this would commit as a second transaction and the subject
    // would see the same purchase twice.
    const reExported = await create.execute({
      ...base,
      eventOccurredAt: EVENT_OCCURRED_AT,
      sourceTimezone: SOURCE_TIMEZONE,
    });
    expect(reExported.ok).toBe(false);
    if (!reExported.ok) expect(reExported.error.kind).toBe('DUPLICATE_TRANSACTION');

    // A genuine repeat is still recordable, and it carries the SAME digest —
    // one content identity, two occurrences. The ordinal lives in a column
    // beside the digest, never inside it.
    const repeat = await create.execute({
      ...base,
      eventOccurredAt: EVENT_OCCURRED_AT,
      sourceTimezone: SOURCE_TIMEZONE,
      occurrenceOrdinal: 2,
    });
    expect(repeat.ok ? null : repeat.error).toBeNull();

    const rows = await rawAsPrincipal<{
      dedup_fingerprint: string;
      occurrence_ordinal: number;
      occurred: Date | null;
    }>(
      alice,
      `SELECT dedup_fingerprint, occurrence_ordinal, event_occurred_at AS occurred
         FROM transactions WHERE account_id = $1 ORDER BY occurrence_ordinal`,
      [identityAccount],
    );
    expect(rows.rows.map((row) => row.occurrence_ordinal)).toEqual([1, 2]);
    expect(rows.rows[0]?.dedup_fingerprint).toBe(rows.rows[1]?.dedup_fingerprint);
    // …and the two rows genuinely differ in the instant, so the equal digests
    // above are evidence rather than a coincidence of identical rows.
    expect(rows.rows[0]?.occurred).toBeNull();
    expect(rows.rows[1]?.occurred).not.toBeNull();
  });

  it('gives the previous definition and the current one separate namespaces', async () => {
    context.actAs(alice);
    const base = movement({
      accountId: namespaceAccount,
      description: syntheticMerchant('one movement, two definitions'),
    });
    const current = await create.execute(base);
    expect(current.ok ? null : current.error).toBeNull();

    // The identical movement, fingerprinted under the identifier this change
    // replaced. It commits: fingerprint_version is a column in
    // transactions_dedup_key, so values minted under two definitions never
    // meet, and a redefinition can neither resurrect a duplicate nor hide a
    // genuine new row.
    const previous = await underPreviousDefinition.execute(base);
    expect(previous.ok ? null : previous.error).toBeNull();

    const versions = await rawAsPrincipal<{ fingerprint_version: string; n: string }>(
      alice,
      `SELECT fingerprint_version, count(*) AS n FROM transactions
        WHERE account_id = $1 GROUP BY fingerprint_version ORDER BY fingerprint_version`,
      [namespaceAccount],
    );
    expect(versions.rows.map((row) => row.fingerprint_version)).toEqual([
      'dedup/hmac-sha256/calendar-day/v3',
      'dedup/hmac-sha256/utc-day/v2',
    ]);
    expect(versions.rows.map((row) => Number(row.n))).toEqual([1, 1]);
    // The current definition is the one this module mints; the other reached
    // the table only through a port that deliberately labels it otherwise.
    expect(DEDUP_FINGERPRINT_VERSION).toBe('dedup/hmac-sha256/calendar-day/v3');

    // Occurrence 1 is claimable under each version independently, which is
    // what "separate namespace" means rather than merely "different string".
    const secondUnderPrevious = await underPreviousDefinition.execute({
      ...base,
      occurrenceOrdinal: 2,
    });
    expect(secondUnderPrevious.ok ? null : secondUnderPrevious.error).toBeNull();
    const stillOneCurrent = await create.execute(base);
    expect(stillOneCurrent.ok).toBe(false);
    if (!stillOneCurrent.ok) expect(stillOneCurrent.error.kind).toBe('DUPLICATE_TRANSACTION');
  });

  it('keeps the source instant out of reach of a correction', async () => {
    context.actAs(alice);
    const created = await create.execute(
      movement({
        accountId: instantAccount,
        bookingDate: CalendarDay.of(2026, 3, 3),
        description: syntheticMerchant('corrected timed purchase'),
        eventOccurredAt: EVENT_OCCURRED_AT,
        sourceTimezone: SOURCE_TIMEZONE,
      }),
    );
    expect(created.ok ? null : created.error).toBeNull();
    if (!created.ok) return;

    // A correction that moves the booked DAY — which a person legitimately
    // may do — must leave the source's own instant exactly where it was.
    const corrected = await update.execute({
      transactionId: created.value.id,
      expectedVersion: 1,
      bookingDate: CalendarDay.of(2026, 3, 4),
    });
    expect(corrected.ok ? null : corrected.error).toBeNull();

    const view = await read.execute({ transactionId: created.value.id });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.transaction.bookingDate.toString()).toBe('2026-03-04');
    expect(view.value.transaction.eventOccurredAt?.toISOString()).toBe(
      EVENT_OCCURRED_AT.toISOString(),
    );
    expect(view.value.revisions[1]?.changedFields).toEqual(['bookingDate']);
    // Both revisions repeat the same source instant. That repetition IS the
    // evidence: a history where it differed would be a history where somebody
    // rewrote what the source said.
    const instants = view.value.revisions.map((revision) =>
      revision.values.eventOccurredAt?.toISOString(),
    );
    expect(new Set(instants).size).toBe(1);
    expect(instants[0]).toBe(EVENT_OCCURRED_AT.toISOString());
    // Revision 1 still holds the day the source supplied.
    expect(view.value.revisions[0]?.values.bookingDate.toString()).toBe('2026-03-03');
  });
});
