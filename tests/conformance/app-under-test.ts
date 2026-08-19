/**
 * The REAL application, booted the way `apps/api/src/main.ts` boots it.
 *
 * WHY NOT FIXTURES. A conformance suite built on hand-written response
 * objects proves that somebody can write a conforming object. The defect
 * class it must catch — a handler that adds a field, a serializer that turns
 * a Date into something the contract did not promise, an error filter that
 * shapes a problem document differently from the schema — lives strictly
 * between the use case and the wire. So the same composition root runs here:
 * `composePhase3Modules` over a live scratch PostgreSQL and the live Redis
 * rate limiter, mounted in `AppModule.forRoot` behind a real Fastify adapter,
 * driven through `inject()` so the responses are serialized exactly as a
 * client would receive them. The only things this file supplies are the
 * scratch database name and the environment — both of which main.ts also
 * takes from the outside.
 *
 * Requests go in as HTTP and come back as bytes. Nothing reaches past the
 * adapter to read a controller's return value: what is validated is what
 * crossed the wire, including the content type.
 *
 * Seeding is done as the bootstrap superuser and is deliberately minimal —
 * tenants and memberships (control-plane operations with no runtime path this
 * phase, seeded the same way every other suite here seeds them), one
 * operating entity with its tenant default binding, and one published legal
 * document. Every identifier is patterned and synthetic; the addresses use
 * the RFC 2606 `.invalid` TLD so nothing here can resemble a live account.
 */

import 'reflect-metadata';

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Socket } from 'node:net';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import pg from 'pg';

import { loadConfig } from '@karar/platform/dist/config/index.js';
import { redisEndpointFromEnv } from '@karar/platform/dist/config/index.js';
import {
  bootstrapRolesAndDatabase,
  LocalPostgresConnectionProfile,
  maintenanceDatabase,
  migrateToLatest,
  PostgresPersistenceAdapter,
} from '@karar/platform/dist/db/index.js';
import { createLogger } from '@karar/platform/dist/observability/index.js';

// The synthetic fixture the LOCAL content source serves, read from the
// LOCAL/TEST-only package that holds it. It is deliberately NOT in
// @karar/consent: keeping the bytes out of the module keeps them out of every
// production build and dependency closure, so this suite reaches for the
// fixture package directly (a devDependency here, as everywhere).
import { LOCAL_SEED_CONTENT, LOCAL_SEED_STORAGE_REF } from '@karar/consent-local-fixtures';

import { AppModule } from '@karar/api/dist/app.module.js';
import { composePhase3Modules } from '@karar/api/dist/composition/phase3-modules.js';
import { FINANCIAL_USE_CASES } from '@karar/api/dist/financial/use-cases.js';
import { createDbReadinessProbes } from '@karar/api/dist/health/readiness-probes.js';

/** Any header a caller may set; `inject` accepts exactly this shape. */
type Headers = Record<string, string>;

export interface WireResponse {
  readonly statusCode: number;
  /** The full Content-Type header, so `application/problem+json` is checked too. */
  readonly contentType: string;
  /** The serialized body, byte for byte. */
  readonly raw: string;
  /** The parsed body, or null when the response carried none. */
  readonly body: unknown;
}

export interface RequestSpec {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly accessToken?: string;
  readonly payload?: unknown;
  readonly headers?: Headers;
  /**
   * The socket peer address this request arrives from. Defaults to
   * 127.0.0.1, which is what `inject` supplies.
   *
   * WHY IT IS SETTABLE. The identity rate limits are keyed on a digest of
   * the client address as well as on the account, and the limiter is REAL.
   * Driving every scenario from one address would make the per-IP login
   * budget (30/15m) a coupling between unrelated tests: exhausting a
   * per-ACCOUNT budget on purpose in one test would push an unrelated login
   * elsewhere over the per-IP one, and the failure would name conformance
   * rather than the arithmetic that caused it. Different scenarios ARE
   * different clients, so they say so. No limit is relaxed: the addresses
   * are distinct, and each one's budget is enforced exactly as configured.
   *
   * The values used are RFC 5737 TEST-NET documentation addresses, which can
   * never be a real client. Nothing here is trusted from a header — the
   * trusted-proxy allow-list is empty, so `x-forwarded-for` still resolves
   * to nothing and the SOCKET peer is what the digest is taken from.
   */
  readonly remoteAddress?: string;
}

/**
 * The environment the composed app reads. `KARAR_DB_NAME` points every role
 * profile at the scratch database — the same override main.ts would honour,
 * so nothing about the composition is special-cased for tests.
 */
function environmentFor(database: string): Record<string, string | undefined> {
  return {
    ...process.env,
    KARAR_ENV: 'local',
    KARAR_DB_NAME: database,
    KARAR_TELEMETRY_ENABLED: 'false',
    // A per-run pepper, because the rate limiter is REAL and its store is
    // shared. The digests of the addresses and account identifiers this suite
    // uses are what key the counters, and the suite deliberately exhausts
    // several budgets to reach the 429s the contract declares — so a second
    // run would start with them already spent and fail on refusals that say
    // nothing about conformance. Rotating the pepper gives each run its own
    // key space, which is exactly what the pepper is for; it is not a
    // relaxation of any limit, and the limiter still enforces every policy
    // inside the run.
    KARAR_DIGEST_PEPPER: `conformance-run-${randomUUID()}`,
  };
}

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
    return `PostgreSQL at ${superuserMaintenanceProfile.host}:${String(superuserMaintenanceProfile.port)}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Redis is probed too, because the identity rate limiter fails CLOSED: with
 * the store unreachable, login answers 503 and every authenticated case below
 * would be skipped for a reason nobody would notice.
 */
async function probeRedis(): Promise<string | null> {
  const endpoint = redisEndpointFromEnv(process.env);
  return new Promise((settle) => {
    const socket = new Socket();
    const done = (reason: string | null): void => {
      socket.destroy();
      settle(reason);
    };
    socket.setTimeout(3_000);
    socket.once('connect', () => {
      done(null);
    });
    socket.once('timeout', () => {
      done(`Redis at ${endpoint.host}:${String(endpoint.port)}: connection timed out`);
    });
    socket.once('error', (error: Error) => {
      done(`Redis at ${endpoint.host}:${String(endpoint.port)}: ${error.message}`);
    });
    socket.connect(endpoint.port, endpoint.host);
  });
}

/** Null when the composed app can be booted; otherwise why it cannot. */
export async function probeInfrastructure(): Promise<string | null> {
  return (await probePostgres()) ?? (await probeRedis());
}

export function skipBanner(reason: string): string {
  return [
    '='.repeat(76),
    'RUNTIME CONFORMANCE TESTS SKIPPED — local infrastructure is not reachable',
    `(${reason})`,
    'These tests are the ONLY evidence that a real server response still matches',
    'the OpenAPI document; a skipped run proves nothing about the server, and the',
    'client-side drift check would not notice. Start the infrastructure and rerun:',
    '  POSTGRES_PORT=5433 REDIS_PORT=6380 docker compose up -d postgres redis --wait',
    '  POSTGRES_PORT=5433 REDIS_PORT=6380 KARAR_ENV=local pnpm --filter @karar/conformance-tests test',
    `${'='.repeat(76)}\n`,
  ].join('\n');
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, the encoding an otpauth secret is published in. */
function decodeBase32(secret: string): Buffer {
  const normalized = secret.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  const bytes: number[] = [];
  let accumulator = 0;
  let bits = 0;
  for (const character of normalized) {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value < 0) throw new Error('the enrolment secret is not base32');
    accumulator = (accumulator << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

/**
 * The code an authenticator app would show for `secret` right now — RFC 6238
 * with the server's parameters (SHA-1, six digits, thirty-second step; see
 * modules/identity/infrastructure/crypto/otplib-totp-service.ts).
 *
 * WHY IT IS COMPUTED HERE. The MFA responses — the challenge, the recovery
 * codes, the session an MFA login finally issues — are only reachable through
 * a code the server will actually accept, and the server accepts exactly what
 * RFC 6238 says. Twenty lines of the standard is the honest way to hold a
 * real MFA response to the contract; the alternative was to leave a quarter
 * of the identity surface unvalidated and call it unreachable.
 */
export function totpCode(secret: string, at: Date = new Date()): string {
  const counter = Math.floor(at.getTime() / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const truncated = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(truncated % 1_000_000).padStart(6, '0');
}

/** A registered, logged-in caller. */
export interface Caller {
  readonly email: string;
  readonly password: string;
  readonly userId: string;
  readonly accessToken: string;
}

/** One HSF column's stored triple, exactly as the persistence port produces it. */
export interface EncryptedFieldFixture {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly algorithm: string;
  readonly keyVersion: string;
  readonly authTag: Uint8Array;
}

/**
 * The narrow slice of `HsfFieldEncryptionPort` a fixture needs. Structural on
 * purpose: `tests/conformance` depends on `@karar/api`, not on the financial
 * modules behind it, so the port is named by its shape rather than imported
 * across a package boundary this suite has no business declaring.
 */
export interface HsfFieldEncryptor {
  encryptField(
    principal: { readonly tenantId: string; readonly userId: string },
    field: { reveal(): string },
    context: { readonly table: string; readonly rowId: string; readonly field: string },
  ): Promise<EncryptedFieldFixture>;
}

/** The two HSF ports the composed application built for itself, per module. */
export interface FinancialFieldEncryptors {
  /** Writes `financial_connections` and `account_source_links`. */
  readonly connections: HsfFieldEncryptor;
  /** Writes `payment_instruments`. */
  readonly instruments: HsfFieldEncryptor;
}

/** The shape `financialFieldEncryptors` walks. Nothing else is read from it. */
interface FinancialUseCaseBundleShape {
  readonly listOwnConnections: { readonly connections: { readonly encryption: HsfFieldEncryptor } };
  readonly listOwnPaymentInstruments: {
    readonly instruments: { readonly encryption: HsfFieldEncryptor };
  };
}

export class ComposedApp {
  private constructor(
    private readonly app: NestFastifyApplication,
    private readonly superuser: PostgresPersistenceAdapter,
    private readonly database: string,
  ) {}

  /**
   * Bootstrap + migrate a scratch database from zero, then compose and start
   * the real application against it. Everything main.ts constructs is
   * constructed here, in the same order, from the same functions.
   */
  static async boot(database: string): Promise<ComposedApp> {
    const env = environmentFor(database);
    await bootstrapRolesAndDatabase({ database });
    const migrator = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('migrator', { env, database }),
    );
    try {
      await migrateToLatest({ adapter: migrator });
    } finally {
      await migrator.end();
    }

    const config = loadConfig(env, { serviceName: 'karar-api' });
    // Fatal-only: the point of this suite is the response bytes, and a boot
    // that logged at info would bury them. A failure still surfaces — the
    // request answers 5xx and the assertion names it.
    const logger = createLogger({
      serviceName: config.service.name,
      serviceVersion: config.service.version,
      env: config.env,
      level: 'fatal',
      destination: { write() {} },
    });
    const dbAdapter = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('app', { env }),
    );
    const composition = composePhase3Modules({ config, env, dbAdapter, logger });
    // Open the limiter's socket BEFORE anything is served, exactly as main.ts
    // does. The client is lazyConnect with the offline queue disabled, so the
    // first command would otherwise lose the race against the handshake and a
    // fail-closed policy would answer 503 while Redis was running perfectly.
    // The boolean is deliberately not asserted on: a store that is genuinely
    // down must not stop the boot — `probeInfrastructure` above is what
    // decides whether this suite runs at all.
    await composition.rateLimitStore.connect();

    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot({
          config,
          logger,
          telemetry: { shutdown: () => Promise.resolve() },
          probes: createDbReadinessProbes(dbAdapter, composition.rateLimitStore),
          modules: composition.modules,
          enrichmentGuard: composition.enrichmentGuard,
          resources: composition.resources,
        }),
      ],
    }).compile();

    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const superuser = new PostgresPersistenceAdapter(
      LocalPostgresConnectionProfile.fromEnv('superuser', { env, database }),
    );
    return new ComposedApp(app, superuser, database);
  }

  async close(): Promise<void> {
    await this.app.close();
    await this.superuser.end();
    const maintenance = new PostgresPersistenceAdapter(superuserMaintenanceProfile);
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS "${this.database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
    }
  }

  /** One real HTTP round trip through the real router, filters, and serializer. */
  async request(spec: RequestSpec): Promise<WireResponse> {
    const headers: Headers = { ...(spec.headers ?? {}) };
    if (spec.accessToken !== undefined) headers['authorization'] = `Bearer ${spec.accessToken}`;
    // JSON is the DEFAULT, not an override. A caller that states its own
    // content type means it: the CSV statement route accepts `text/csv` and
    // nothing else, and a harness that silently relabelled the body would
    // have "proved" that route works while never once exercising it.
    if (spec.payload !== undefined && headers['content-type'] === undefined) {
      headers['content-type'] = 'application/json';
    }
    const response = await this.app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: spec.method,
        url: spec.url,
        headers,
        ...(spec.remoteAddress === undefined ? {} : { remoteAddress: spec.remoteAddress }),
        ...(spec.payload === undefined ? {} : { payload: spec.payload as object }),
      });
    const raw = response.body;
    let body: unknown = null;
    if (raw !== '') {
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
    }
    return {
      statusCode: response.statusCode,
      contentType: String(response.headers['content-type'] ?? ''),
      raw,
      body,
    };
  }

  /**
   * The HSF field-encryption ports THIS BOOT built, reached through the Nest
   * container the routes are served from.
   *
   * WHY THIS SEAM EXISTS, and why it is not cheating. Three Phase 5 tables —
   * `financial_connections`, `account_source_links` and `payment_instruments`
   * — have no mounted write route, by a decision the contract records: their
   * use cases are deliberately absent from the surface bundle. Every column
   * that carries a label or an external reference on them exists ONLY as
   * ciphertext + nonce + auth tag, under a key the composition root generates
   * per boot and never serializes. So a fixture has exactly two options: seed
   * nothing and validate the read routes against empty pages, which proves
   * roughly nothing, or encrypt with the SAME port the read path will decrypt
   * with. This returns that port. The bytes a fixture writes are produced by
   * the application's own adapter, under its own key version, bound to the
   * same tenant, user, table, row and field as associated data — so a row
   * seeded here is readable exactly to the extent a row written by a future
   * write route would be, and unreadable in every way such a row would be.
   *
   * Nothing here fabricates a RESPONSE: the response still comes from the
   * real repository, the real use case, the real controller and the real
   * serializer.
   */
  financialFieldEncryptors(): FinancialFieldEncryptors {
    const bundle = this.app.get<FinancialUseCaseBundleShape>(FINANCIAL_USE_CASES, {
      strict: false,
    });
    return {
      connections: bundle.listOwnConnections.connections.encryption,
      instruments: bundle.listOwnPaymentInstruments.instruments.encryption,
    };
  }

  /** Reads past RLS, so a fixture assertion states the truth of the table. */
  async sql<T extends Record<string, unknown>>(
    text: string,
    parameters: readonly unknown[] = [],
  ): Promise<T[]> {
    const result = await this.superuser.query<T>(text, [...parameters]);
    return result.rows;
  }

  // --- fixtures ------------------------------------------------------------

  /**
   * Registers a fresh account through the REAL /auth/register route and signs
   * it in. The account is created by the application, not by SQL, so the
   * password hash and the account row are whatever the server actually writes.
   */
  async registerAndLogin(from?: string): Promise<Caller> {
    const email = `conformance-${randomUUID()}@example.invalid`;
    const password = `Synthetic-${randomUUID()}`;
    const registered = await this.request({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password },
      ...(from === undefined ? {} : { remoteAddress: from }),
    });
    if (registered.statusCode !== 202) {
      throw new Error(
        `fixture registration failed: ${String(registered.statusCode)} ${registered.raw}`,
      );
    }
    const rows = await this.sql<{ id: string }>(
      `SELECT id FROM public.identity_accounts WHERE email = $1`,
      [email],
    );
    const userId = rows[0]?.id;
    if (userId === undefined) throw new Error('fixture registration wrote no account row');
    return { email, password, userId, accessToken: await this.login(email, password, from) };
  }

  /** Signs in an existing account and returns a fresh access token. */
  async login(email: string, password: string, from?: string): Promise<string> {
    const response = await this.request({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
      ...(from === undefined ? {} : { remoteAddress: from }),
    });
    const body = response.body as { status?: string; accessToken?: string } | null;
    if (response.statusCode !== 200 || body?.accessToken === undefined) {
      throw new Error(`fixture login failed: ${String(response.statusCode)} ${response.raw}`);
    }
    return body.accessToken;
  }

  /**
   * Flips an operator kill switch, and reports the state it replaced so the
   * caller can put it back.
   *
   * WHY SQL. There is no runtime route for this in the composed surface —
   * `operate` is a control-plane operation behind the control-plane gateway,
   * which is not mounted this phase. The UPDATE is the real one the
   * application would issue: the 0053 guard trigger still demands the version
   * increment by exactly one, and the AFTER UPDATE trigger still appends the
   * history row, so a restriction reached this way is indistinguishable from
   * an operator's — which is the point. The switch is READ by the composed
   * app on every guarded request, so this is the honest way to reach the one
   * 503 an in-process suite can reach without breaking a live dependency for
   * every other test in the file.
   */
  async setKillSwitch(
    switchId: string,
    state: 'ACTIVE_RESTRICTION' | 'INACTIVE',
  ): Promise<'ACTIVE_RESTRICTION' | 'INACTIVE'> {
    const before = await this.sql<{ state: string }>(
      `SELECT state FROM public.kill_switches WHERE id = $1`,
      [switchId],
    );
    const previous = before[0]?.state;
    if (previous === undefined) {
      throw new Error(`kill switch '${switchId}' is not in the registry table`);
    }
    await this.sql(
      `UPDATE public.kill_switches
          SET state = $2,
              reason = 'runtime conformance fixture; restored in the same test',
              actor = 'operator:conformance-fixture',
              version = version + 1,
              effective_from = now(),
              expires_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [switchId, state],
    );
    return previous === 'ACTIVE_RESTRICTION' ? 'ACTIVE_RESTRICTION' : 'INACTIVE';
  }

  /**
   * A tenant and an ACTIVE membership for `userId`. Seeded as the bootstrap
   * superuser because tenant provisioning is a control-plane operation with no
   * runtime path in this phase (migration 0041 grants karar_app SELECT only,
   * and FORCEd RLS admits no INSERT) — the same reason and the same method the
   * tenancy fixtures use.
   */
  async seedTenantWithMember(tenantId: string, userId: string, roleHint = 'MEMBER'): Promise<void> {
    await this.sql(
      `INSERT INTO public.tenants (id, type, name, status)
       VALUES ($1, 'FIRST_PARTY', $2, 'ACTIVE') ON CONFLICT (id) DO NOTHING`,
      [tenantId, `Conformance tenant ${tenantId.slice(0, 8)}`],
    );
    await this.sql(
      `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
       VALUES ($1, $2, $3, $4, 'ACTIVE', now() - interval '1 day')`,
      [randomUUID(), tenantId, userId, roleHint],
    );
  }

  /** The caller's own profile row — /users/me answers 404 without one. */
  async seedUserProfile(tenantId: string, userId: string): Promise<void> {
    await this.sql(
      `INSERT INTO public.user_profiles (user_id, tenant_id, display_name, locale, status, updated_at)
       VALUES ($1, $2, 'Conformance Subject', 'en', 'ACTIVE', now())`,
      [userId, tenantId],
    );
  }

  /**
   * An operating entity bound as the tenant default, plus one published legal
   * document version carrying a deliberately unmistakable storage locator.
   * The locator is what `GET /consent/documents` must never serialize, and the
   * contract closes `effectiveVersion` precisely to keep it out — so the
   * fixture value is chosen to be visible in a body if it ever escapes.
   */
  async seedConsentCatalogue(input: {
    tenantId: string;
    entityId: string;
    documentId: string;
    versionId: string;
    jurisdictionRef: string;
    purposeRef: string;
    storageRef: string;
    contentHash: string;
  }): Promise<void> {
    await this.sql(
      `INSERT INTO public.operating_entities
         (id, legal_name, registration_number, registered_jurisdiction_ref,
          contracting_capacity, data_protection_contact, status, updated_at)
       VALUES ($1, 'Karar Conformance LLC (synthetic)', $2, $3, true, 'dpo@karar.example', 'ACTIVE', now())`,
      [input.entityId, `CR-${input.entityId.slice(0, 8)}`, input.jurisdictionRef],
    );
    await this.sql(
      `INSERT INTO public.operating_entity_assignments
         (id, scope, tenant_id, entity_id, effective_from, created_by)
       VALUES ($1, 'TENANT_DEFAULT', $2, $3, now() - interval '1 day', 'conformance-fixture')`,
      [randomUUID(), input.tenantId, input.entityId],
    );
    await this.sql(
      `INSERT INTO public.legal_documents (id, entity_id, jurisdiction_ref, purpose_refs, kind)
       VALUES ($1, $2, $3, ARRAY[$4]::text[], 'PRIVACY_NOTICE')`,
      [input.documentId, input.entityId, input.jurisdictionRef, input.purposeRef],
    );
    await this.sql(
      `INSERT INTO public.legal_document_versions
         (id, document_id, version, content_hash, storage_ref, classification,
          author, reviewer, reason, effective_at, published_at)
       VALUES ($1, $2, '1.0.0', $3, $4, 'NO_USER_ACTION_REQUIRED',
               'author:conformance', 'reviewer:conformance',
               'synthetic fixture; no legal review has taken place',
               now() - interval '1 day', now() - interval '1 day')`,
      [input.versionId, input.documentId, input.contentHash, input.storageRef],
    );
  }

  /**
   * A SECOND document under the same entity whose published version carries
   * the one storage reference the LOCAL content source resolves, with the hash
   * that source's bytes actually produce.
   *
   * WHY THE REAL CONSTANTS. `GetLegalDocumentContent` hashes whatever the
   * source returns and compares it against the pinned `content_hash`; a
   * mismatch is refused with nothing served. Importing the module's own
   * constants and hashing them the same way the seed does means the check is
   * SATISFIED rather than sidestepped — and it is what makes the 200 body,
   * whose schema is closed end to end, reachable at all. A different `kind`
   * and a different purpose keep it clear of the first document: the catalogue
   * is unique per (entity, jurisdiction, kind), and a second document covering
   * the same purpose would make the status read ambiguous.
   */
  async seedRetrievableDocument(input: {
    entityId: string;
    documentId: string;
    versionId: string;
    jurisdictionRef: string;
    purposeRef: string;
  }): Promise<void> {
    await this.sql(
      `INSERT INTO public.legal_documents (id, entity_id, jurisdiction_ref, purpose_refs, kind)
       VALUES ($1, $2, $3, ARRAY[$4]::text[], 'LOCAL_SEED_SYNTHETIC_NOTICE')`,
      [input.documentId, input.entityId, input.jurisdictionRef, input.purposeRef],
    );
    await this.sql(
      `INSERT INTO public.legal_document_versions
         (id, document_id, version, content_hash, storage_ref, classification,
          author, reviewer, reason, effective_at, published_at)
       VALUES ($1, $2, '1.0.0', $3, $4, 'NO_USER_ACTION_REQUIRED',
               'author:conformance', 'reviewer:conformance',
               'synthetic fixture; no legal review has taken place',
               now() - interval '1 day', now() - interval '1 day')`,
      [
        input.versionId,
        input.documentId,
        createHash('sha256').update(LOCAL_SEED_CONTENT.content, 'utf8').digest('hex'),
        LOCAL_SEED_STORAGE_REF,
      ],
    );
  }
}
