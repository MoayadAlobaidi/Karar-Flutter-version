/**
 * REAL responses from the composed FINANCIAL surface, held against the
 * OpenAPI document that describes them.
 *
 * SAME HARNESS, SAME GAP IT CLOSES. `runtime-conformance.integration.test.ts`
 * binds the Phase 3/3.5 server to the contract; this file does the same for
 * the twenty-seven Phase 5 operations. What runs is the real composition root
 * (`composePhase3Modules`, which now composes `composePhase5Modules`), the
 * real guards, the real global exception filter, the real Fastify serializer,
 * live PostgreSQL and live Redis. Requests go in as HTTP; what is validated is
 * the status, the Content-Type, and the bytes that came back.
 *
 * WHY THIS IS A SEPARATE FILE. The Phase 3 suite drives one boot through a
 * long, ordered scenario and asserts an exact ledger at the end; adding
 * twenty-seven operations to it would make one failure anywhere hide the rest.
 * This file has its own ledger, asserted the same way: a suite that quietly
 * stopped exercising an operation is indistinguishable from one that did,
 * unless the ledger says so.
 *
 * THE FOUR CLAIMS THIS SUITE IS THE EVIDENCE FOR, beyond schema conformance:
 *
 *   1. The principal comes from the SESSION. A request carrying `?userId=`,
 *      `?tenantId=` and `x-tenant-id` naming another subject is answered
 *      byte-for-byte as the same request without them.
 *   2. The withheld fields really are withheld, on real bodies: no ciphertext,
 *      key version, fingerprint, external account reference or storage
 *      locator, checked against the poison values seeded into the fixtures.
 *   3. Money is an exact minor-unit STRING, a booking date is a calendar day,
 *      and an instant carries an offset.
 *   4. The CSV byte bound is the CENTRAL one, enforced on a real upload.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { INGESTION_LIMIT_POLICIES } from '@karar/platform/dist/ingestion/limits.js';
import { RATE_LIMIT_POLICIES } from '@karar/platform/dist/ratelimit/index.js';

import { Contract } from '../contract.js';
import { validateAgainstSchema } from '../schema-validator.js';
import {
  ComposedApp,
  probeInfrastructure,
  skipBanner,
  type Caller,
  type FinancialFieldEncryptors,
  type WireResponse,
} from '../app-under-test.js';

const unreachable = await probeInfrastructure();
if (unreachable !== null) process.stderr.write(skipBanner(unreachable));

const contract = Contract.load();
const database = `karar_test_${String(process.pid)}_financial_conformance`;

/** Patterned and synthetic; nothing here resembles a production identifier. */
const TENANT = 'f1f0aaaa-0000-4000-8000-00000000f001';
const OTHER_TENANT = 'f1f0bbbb-0000-4000-8000-00000000f002';
const INSTITUTION = 'f1f0cccc-0000-4000-8000-00000000f003';
const RETIRED_INSTITUTION = 'f1f0dddd-0000-4000-8000-00000000f004';
/**
 * Two more issuers, so the catalogue is a SET rather than a single row and the
 * accounts below can sit at different issuers. Every code and display name is
 * invented: no real bank, telco, exchange house or wallet provider is named
 * anywhere in this file, and none may be added — a fixture that borrows a live
 * brand teaches the catalogue to carry one.
 */
const WALLET_ISSUER = 'f1f0eeee-0000-4000-8000-00000000f005';
const CARD_ISSUER = 'f1f0ffff-0000-4000-8000-00000000f006';
const CATEGORY = 'GROCERIES';
const CATEGORY_CHILD = 'GROCERIES.SUPERMARKET';
const CATEGORY_RETIRED = 'RETIRED_CODE';
const CSV_LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

/**
 * The poison values. Each is a thing the persistence layer genuinely holds and
 * the wire genuinely must not carry, written so that a single fragment in a
 * serialized body names exactly what escaped.
 */
const POISON_SOURCE_REFERENCE = 'external-ref-CONFORMANCE-CANARY-0001';
const POISON_CONNECTION_LABEL_MARKER = 'conformance-connection-label';

/** Every (operationId, status) this run actually validated. */
const validated = new Set<string>();

/**
 * Every declared (operationId, status) this run did NOT validate, with the
 * reason. Asserted exactly, and asserted to PARTITION the contract's declared
 * Phase 5 set together with `validated` — so a pair cannot fall out of both
 * ledgers, and a newly declared status cannot arrive unnoticed in neither.
 */
const uncovered = new Map<string, string>();

/** Problem bodies observed under the wrong media type. Must stay empty. */
const observedDeviations = new Set<string>();

let app: ComposedApp;
let bound: Caller;
/** Registered and signed in, with no membership anywhere: the session stays UNBOUND. */
let unbound: Caller;
/** The first current account: the one most of the scenario runs against. */
let accountId: string;
/** Its twin — same issuer, same type, same currency. Identity is the id alone. */
let twinAccountId: string;
/** The wallet, which is what the two virtual cards spend from. */
let walletAccountId: string;
/** The credit card account, whose balances are OUTSTANDING and CREDIT_LIMIT. */
let cardAccountId: string;
/** Archived on purpose, so `account_not_writable` is a real reachable state. */
let archivedAccountId: string;
let transactionId: string;
let importId: string;
let importVersion: number;
/** Two SUGGESTED matches, seeded over real transactions: one per decision. */
let confirmableMatchId: string;
let rejectableMatchId: string;

/**
 * The EXACT media types, not prefixes. `application/problem+json` is what the
 * single writer in apps/api/src/errors/problem-response.ts emits and the only
 * thing the contract declares for a Phase 5 failure; `application/json` is
 * what a success body carries. A prefix match would accept
 * `application/json-seq` and a suffix-blind match would accept
 * `application/jsonx`, so the comparison is on the media type alone, with the
 * charset Fastify appends stripped and nothing else forgiven.
 */
const PROBLEM_MEDIA_TYPE = 'application/problem+json';
const SUCCESS_MEDIA_TYPE = 'application/json';

/**
 * The statement upload's REQUEST media type, read out of the contract rather
 * than typed here. A harness that hard-coded `text/csv` would keep passing if
 * the contract moved to something else, and the one route on this surface
 * that accepts bytes rather than JSON is exactly the one where the request
 * media type is part of the promise.
 */
const CSV_REQUEST_MEDIA_TYPE =
  contract.operation('uploadOwnStatementImportSource').requestMediaTypes[0] ?? '';

/** The media type alone, without the charset parameter. */
function mediaTypeOf(response: WireResponse): string {
  return (response.contentType.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Validates one real response against the schema the contract declares for
 * exactly that (operation, status, media type), and records it in the ledger.
 *
 * The Content-Type is asserted, not assumed: a problem body served under
 * `application/json` is the defect this harness was built to catch, and it is
 * recorded rather than thrown so one deviation does not hide the rest.
 */
/**
 * The media-type half of the check, as its own function so the mutation probe
 * below can drive the SAME code the ledger depends on rather than a copy of
 * it. Returns the ledger entry for a deviation, or null when the response
 * carried the media type the contract declares.
 */
function mediaTypeDeviation(
  operationId: string,
  status: number,
  response: WireResponse,
): string | null {
  if (status < 400) return null;
  const observed = mediaTypeOf(response);
  if (observed === PROBLEM_MEDIA_TYPE) return null;
  return `${operationId} ${String(status)} [${observed}]`;
}

/**
 * The ledger's own assertion, extracted for the same reason: a mutation that
 * plants one deviation must be shown to turn THIS red, not a lookalike.
 */
function assertNoMediaTypeDeviations(deviations: ReadonlySet<string>): void {
  expect(
    [...deviations].sort(),
    'these responses carried an RFC 7807 body under the wrong media type; every problem ' +
      'document must leave through the writer in apps/api/src/errors/problem-response.ts',
  ).toEqual([]);
}

function conforms(operationId: string, status: number, response: WireResponse): void {
  expect(
    response.statusCode,
    `${operationId} expected ${String(status)}, body ${response.raw.slice(0, 400)}`,
  ).toBe(status);
  const isProblem = status >= 400;
  const mediaType = isProblem ? PROBLEM_MEDIA_TYPE : SUCCESS_MEDIA_TYPE;
  const observed = mediaTypeOf(response);
  const deviation = mediaTypeDeviation(operationId, status, response);
  if (deviation !== null) observedDeviations.add(deviation);
  if (!isProblem) expect(observed, `${operationId} ${String(status)} media type`).toBe(mediaType);
  const declared = contract.responseSchema(operationId, status, mediaType);
  expect(
    declared,
    `${operationId} ${String(status)} declares no ${mediaType} schema`,
  ).not.toBeNull();
  expect(
    validateAgainstSchema(declared!, response.body, contract.resolve),
    `${operationId} ${String(status)} body does not match the contract`,
  ).toEqual([]);
  validated.add(`${operationId} ${String(status)}`);
}

function body<T>(response: WireResponse): T {
  return response.body as T;
}

/** Every (operationId, status) the contract declares for the Phase 5 paths. */
function declaredPhase5Pairs(): string[] {
  return contract
    .operations()
    .filter((operation) => operation.path.startsWith('/financial'))
    .flatMap((operation) =>
      [...operation.responses.keys()].map((status) => `${operation.operationId} ${status}`),
    )
    .sort();
}

/**
 * WHY 503 IS NOT REACHED, on any of the twenty-seven operations. Every Phase 5
 * 503 is `STORE_UNAVAILABLE`: PostgreSQL, or the encrypted source store,
 * failing mid-request. There is no operator switch, no readable state and no
 * request shape that produces one — reaching it would mean inflicting an
 * outage on the live database every other assertion in this file depends on,
 * which would prove the shape of one body by making the rest meaningless. The
 * Phase 3 suite covers its 503s through a real operator kill switch precisely
 * because that IS a readable state; this surface has no equivalent, and
 * inventing one in a test would be a fixture pretending to be a system.
 */
const STORE_OUTAGE =
  'STORE_UNAVAILABLE: a PostgreSQL or encrypted-source-store failure mid-request. No ' +
  'readable state and no request shape produces it; reaching it would mean inflicting an ' +
  'outage on the live database this suite runs against.';

/**
 * WHY 422 IS NOT REACHED. It is `RETENTION_UNRESOLVED` — no approved retention
 * decision governs the dataset, so nothing durable may be written. That is a
 * legal decision nobody in this system may take on a subject's behalf, and the
 * local provider resolves every dataset it recognises (and refuses to exist
 * outside `KARAR_ENV=local`). Producing the refusal would mean editing the
 * synthetic retention fixture package, which is not a conformance suite's to
 * edit — and a suite that edited it would be validating a body the running
 * configuration cannot emit.
 */
const RETENTION_UNRESOLVED =
  'RETENTION_UNRESOLVED: the local retention provider resolves every dataset it ' +
  'recognises, so the refusal needs a different fixture package — one this suite does not ' +
  'own and must not edit to manufacture a response.';

/**
 * WHY THIS ONE 409 IS NOT REACHED. `assignOwnTransactionCategory` maps exactly
 * one error to 409: `USER_ASSIGNMENT_WINS`, which fires when a RULE tries to
 * replace a person's decision. The route fixes `assignmentSource` to USER —
 * a client cannot claim to be a rule — and `canSupersede` admits USER
 * unconditionally. No HTTP request can produce it, and the honest record of
 * that is here rather than a contrived one in the ledger above.
 */
const RULE_ONLY_409 =
  'USER_ASSIGNMENT_WINS fires only for assignmentSource RULE; the route fixes it to USER ' +
  'and canSupersede admits USER unconditionally, so no request can reach it.';

/**
 * The reviewed COVERED set — every (operationId, status) this file drives to a
 * real response and validates. Named rather than counted: a suite that quietly
 * stopped exercising one of these still prints green otherwise.
 */
const EXPECTED_VALIDATED: readonly string[] = [
  'assignOwnTransactionCategory 200',
  'assignOwnTransactionCategory 400',
  'assignOwnTransactionCategory 401',
  'assignOwnTransactionCategory 403',
  'assignOwnTransactionCategory 404',
  'commitOwnStatementImport 200',
  'commitOwnStatementImport 400',
  'commitOwnStatementImport 401',
  'commitOwnStatementImport 403',
  'commitOwnStatementImport 404',
  'commitOwnStatementImport 409',
  'commitOwnStatementImport 429',
  'confirmOwnTransferMatch 200',
  'confirmOwnTransferMatch 400',
  'confirmOwnTransferMatch 401',
  'confirmOwnTransferMatch 403',
  'confirmOwnTransferMatch 404',
  'confirmOwnTransferMatch 409',
  'confirmOwnTransferMatch 429',
  'correctOwnTransaction 200',
  'correctOwnTransaction 400',
  'correctOwnTransaction 401',
  'correctOwnTransaction 403',
  'correctOwnTransaction 404',
  'correctOwnTransaction 409',
  'createOwnManualFinancialAccount 201',
  'createOwnManualFinancialAccount 400',
  'createOwnManualFinancialAccount 401',
  'createOwnManualFinancialAccount 403',
  'createOwnManualFinancialAccount 409',
  'createOwnManualTransaction 201',
  'createOwnManualTransaction 400',
  'createOwnManualTransaction 401',
  'createOwnManualTransaction 403',
  'createOwnManualTransaction 404',
  'createOwnManualTransaction 409',
  'createOwnManualTransaction 429',
  'createOwnStatementImport 201',
  'createOwnStatementImport 400',
  'createOwnStatementImport 401',
  'createOwnStatementImport 403',
  'createOwnStatementImport 404',
  'createOwnStatementImport 409',
  'deleteOwnTransaction 200',
  'deleteOwnTransaction 400',
  'deleteOwnTransaction 401',
  'deleteOwnTransaction 403',
  'deleteOwnTransaction 404',
  'eraseOwnStatementImport 200',
  'eraseOwnStatementImport 400',
  'eraseOwnStatementImport 401',
  'eraseOwnStatementImport 403',
  'eraseOwnStatementImport 404',
  'eraseOwnStatementImport 409',
  'listFinancialCategories 200',
  'listFinancialCategories 400',
  'listFinancialCategories 401',
  'listFinancialCategories 403',
  'listFinancialInstitutions 200',
  'listFinancialInstitutions 400',
  'listFinancialInstitutions 401',
  'listFinancialInstitutions 403',
  'listOwnAccountBalanceSnapshots 200',
  'listOwnAccountBalanceSnapshots 400',
  'listOwnAccountBalanceSnapshots 401',
  'listOwnAccountBalanceSnapshots 403',
  'listOwnAccountBalanceSnapshots 404',
  'listOwnAccountPaymentInstruments 200',
  'listOwnAccountPaymentInstruments 400',
  'listOwnAccountPaymentInstruments 401',
  'listOwnAccountPaymentInstruments 403',
  'listOwnAccountSourceLinks 200',
  'listOwnAccountSourceLinks 400',
  'listOwnAccountSourceLinks 401',
  'listOwnAccountSourceLinks 403',
  'listOwnFinancialAccounts 200',
  'listOwnFinancialAccounts 400',
  'listOwnFinancialAccounts 401',
  'listOwnFinancialAccounts 403',
  'listOwnFinancialAccounts 429',
  'listOwnFinancialConnections 200',
  'listOwnFinancialConnections 400',
  'listOwnFinancialConnections 401',
  'listOwnFinancialConnections 403',
  'listOwnStatementImportPreview 200',
  'listOwnStatementImportPreview 400',
  'listOwnStatementImportPreview 401',
  'listOwnStatementImportPreview 403',
  'listOwnStatementImportPreview 404',
  'listOwnTransactionProvenance 200',
  'listOwnTransactionProvenance 400',
  'listOwnTransactionProvenance 401',
  'listOwnTransactionProvenance 403',
  'listOwnTransactionProvenance 404',
  'listOwnTransactions 200',
  'listOwnTransactions 400',
  'listOwnTransactions 401',
  'listOwnTransactions 403',
  'listOwnTransferMatches 200',
  'listOwnTransferMatches 400',
  'listOwnTransferMatches 401',
  'listOwnTransferMatches 403',
  'parseOwnStatementImportSource 200',
  'parseOwnStatementImportSource 400',
  'parseOwnStatementImportSource 401',
  'parseOwnStatementImportSource 403',
  'parseOwnStatementImportSource 404',
  'parseOwnStatementImportSource 409',
  'parseOwnStatementImportSource 429',
  'readOwnFinancialAccount 200',
  'readOwnFinancialAccount 400',
  'readOwnFinancialAccount 401',
  'readOwnFinancialAccount 403',
  'readOwnFinancialAccount 404',
  'readOwnStatementImport 200',
  'readOwnStatementImport 400',
  'readOwnStatementImport 401',
  'readOwnStatementImport 403',
  'readOwnStatementImport 404',
  'readOwnTransaction 200',
  'readOwnTransaction 400',
  'readOwnTransaction 401',
  'readOwnTransaction 403',
  'readOwnTransaction 404',
  'rejectOwnTransferMatch 200',
  'rejectOwnTransferMatch 400',
  'rejectOwnTransferMatch 401',
  'rejectOwnTransferMatch 403',
  'rejectOwnTransferMatch 404',
  'rejectOwnTransferMatch 409',
  'updateOwnFinancialAccount 200',
  'updateOwnFinancialAccount 400',
  'updateOwnFinancialAccount 401',
  'updateOwnFinancialAccount 403',
  'updateOwnFinancialAccount 404',
  'updateOwnFinancialAccount 409',
  'uploadOwnStatementImportSource 200',
  'uploadOwnStatementImportSource 400',
  'uploadOwnStatementImportSource 401',
  'uploadOwnStatementImportSource 403',
  'uploadOwnStatementImportSource 404',
  'uploadOwnStatementImportSource 409',
  'uploadOwnStatementImportSource 413',
  'uploadOwnStatementImportSource 415',
  'uploadOwnStatementImportSource 429',
];

/** The reviewed uncovered set: pair, then the reason it is not reachable. */

/**
 * WHY THESE 429s ARE NOT DRIVEN INDIVIDUALLY. Every mounted operation carries a
 * budget, and there are six budgets, not twenty-seven. One operation per budget
 * is driven past its real limit against the live Redis limiter above; the
 * remaining operations share those same six policies and emit the identical
 * refusal document through the identical writer, so driving each one would
 * exhaust the same six windows twenty-one more times and prove nothing further.
 *
 * What is NOT taken on trust: that every operation HAS a budget. That is proved
 * structurally, from Nest's own route metadata, in
 * apps/api/src/financial/rate-limit-mounting.test.ts — a mounted route with no
 * policy fails there, and so does a route whose guards are out of order.
 */
const RATE_LIMIT_SHARED_POLICY =
  'RATE_LIMIT_SHARED_POLICY: this operation shares one of the six financial budgets, each of ' +
  'which is driven past its real limit above through a sibling operation. That every mounted ' +
  'operation HAS a budget is proved from route metadata in rate-limit-mounting.test.ts.';

const EXPECTED_UNCOVERED: ReadonlyArray<readonly [string, string]> = [
  ['assignOwnTransactionCategory 409', RULE_ONLY_409],
  ['assignOwnTransactionCategory 429', RATE_LIMIT_SHARED_POLICY],
  ['assignOwnTransactionCategory 503', STORE_OUTAGE],
  ['commitOwnStatementImport 422', RETENTION_UNRESOLVED],
  ['commitOwnStatementImport 503', STORE_OUTAGE],
  ['confirmOwnTransferMatch 503', STORE_OUTAGE],
  ['correctOwnTransaction 429', RATE_LIMIT_SHARED_POLICY],
  ['correctOwnTransaction 503', STORE_OUTAGE],
  ['createOwnManualFinancialAccount 422', RETENTION_UNRESOLVED],
  ['createOwnManualFinancialAccount 429', RATE_LIMIT_SHARED_POLICY],
  ['createOwnManualFinancialAccount 503', STORE_OUTAGE],
  ['createOwnManualTransaction 422', RETENTION_UNRESOLVED],
  ['createOwnManualTransaction 503', STORE_OUTAGE],
  ['createOwnStatementImport 422', RETENTION_UNRESOLVED],
  ['createOwnStatementImport 429', RATE_LIMIT_SHARED_POLICY],
  ['createOwnStatementImport 503', STORE_OUTAGE],
  ['deleteOwnTransaction 429', RATE_LIMIT_SHARED_POLICY],
  ['deleteOwnTransaction 503', STORE_OUTAGE],
  ['eraseOwnStatementImport 429', RATE_LIMIT_SHARED_POLICY],
  ['eraseOwnStatementImport 503', STORE_OUTAGE],
  ['listFinancialCategories 429', RATE_LIMIT_SHARED_POLICY],
  ['listFinancialCategories 503', STORE_OUTAGE],
  ['listFinancialInstitutions 429', RATE_LIMIT_SHARED_POLICY],
  ['listFinancialInstitutions 503', STORE_OUTAGE],
  ['listOwnAccountBalanceSnapshots 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnAccountBalanceSnapshots 503', STORE_OUTAGE],
  ['listOwnAccountPaymentInstruments 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnAccountPaymentInstruments 503', STORE_OUTAGE],
  ['listOwnAccountSourceLinks 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnAccountSourceLinks 503', STORE_OUTAGE],
  ['listOwnFinancialAccounts 503', STORE_OUTAGE],
  ['listOwnFinancialConnections 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnFinancialConnections 503', STORE_OUTAGE],
  ['listOwnStatementImportPreview 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnStatementImportPreview 503', STORE_OUTAGE],
  ['listOwnTransactionProvenance 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnTransactionProvenance 503', STORE_OUTAGE],
  ['listOwnTransactions 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnTransactions 503', STORE_OUTAGE],
  ['listOwnTransferMatches 429', RATE_LIMIT_SHARED_POLICY],
  ['listOwnTransferMatches 503', STORE_OUTAGE],
  ['parseOwnStatementImportSource 503', STORE_OUTAGE],
  ['readOwnFinancialAccount 429', RATE_LIMIT_SHARED_POLICY],
  ['readOwnFinancialAccount 503', STORE_OUTAGE],
  ['readOwnStatementImport 429', RATE_LIMIT_SHARED_POLICY],
  ['readOwnStatementImport 503', STORE_OUTAGE],
  ['readOwnTransaction 429', RATE_LIMIT_SHARED_POLICY],
  ['readOwnTransaction 503', STORE_OUTAGE],
  ['rejectOwnTransferMatch 429', RATE_LIMIT_SHARED_POLICY],
  ['rejectOwnTransferMatch 503', STORE_OUTAGE],
  ['updateOwnFinancialAccount 429', RATE_LIMIT_SHARED_POLICY],
  ['updateOwnFinancialAccount 503', STORE_OUTAGE],
  ['uploadOwnStatementImportSource 422', RETENTION_UNRESOLVED],
  ['uploadOwnStatementImportSource 503', STORE_OUTAGE],
];

for (const [pair, reason] of EXPECTED_UNCOVERED) cannotReach([pair], reason);

/** Every Phase 5 route, once, so a sweep cannot silently cover a subset. */
type Phase5Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function phase5Routes(some: string): ReadonlyArray<readonly [string, Phase5Method, string]> {
  return [
    ['listFinancialInstitutions', 'GET', '/financial/institutions'],
    ['listFinancialCategories', 'GET', '/financial/categories'],
    ['listOwnFinancialAccounts', 'GET', '/financial/accounts'],
    ['createOwnManualFinancialAccount', 'POST', '/financial/accounts'],
    ['readOwnFinancialAccount', 'GET', `/financial/accounts/${some}`],
    ['updateOwnFinancialAccount', 'PATCH', `/financial/accounts/${some}`],
    ['listOwnAccountBalanceSnapshots', 'GET', `/financial/accounts/${some}/balances`],
    ['listOwnAccountPaymentInstruments', 'GET', `/financial/accounts/${some}/payment-instruments`],
    ['listOwnAccountSourceLinks', 'GET', `/financial/accounts/${some}/source-links`],
    ['listOwnFinancialConnections', 'GET', '/financial/connections'],
    ['listOwnTransactions', 'GET', '/financial/transactions'],
    ['createOwnManualTransaction', 'POST', '/financial/transactions'],
    ['readOwnTransaction', 'GET', `/financial/transactions/${some}`],
    ['correctOwnTransaction', 'PATCH', `/financial/transactions/${some}`],
    ['deleteOwnTransaction', 'DELETE', `/financial/transactions/${some}`],
    ['assignOwnTransactionCategory', 'PUT', `/financial/transactions/${some}/category`],
    ['listOwnTransactionProvenance', 'GET', `/financial/transactions/${some}/provenance`],
    ['listOwnTransferMatches', 'GET', '/financial/transfer-matches'],
    ['confirmOwnTransferMatch', 'POST', `/financial/transfer-matches/${some}/confirmation`],
    ['rejectOwnTransferMatch', 'POST', `/financial/transfer-matches/${some}/rejection`],
    ['createOwnStatementImport', 'POST', '/financial/statement-imports'],
    ['readOwnStatementImport', 'GET', `/financial/statement-imports/${some}`],
    ['eraseOwnStatementImport', 'DELETE', `/financial/statement-imports/${some}`],
    ['uploadOwnStatementImportSource', 'POST', `/financial/statement-imports/${some}/source`],
    ['parseOwnStatementImportSource', 'POST', `/financial/statement-imports/${some}/parse`],
    ['listOwnStatementImportPreview', 'GET', `/financial/statement-imports/${some}/preview`],
    ['commitOwnStatementImport', 'POST', `/financial/statement-imports/${some}/commit`],
  ];
}

/** Records a declared pair this suite does not reach, with the reason why. */
function cannotReach(pairs: readonly string[], reason: string): void {
  for (const pair of pairs) uncovered.set(pair, reason);
}

/** `bytea` literal for a parameterised insert; pg sends Buffers verbatim. */
function bytes(value: Uint8Array): Buffer {
  return Buffer.from(value);
}

/** The HSF ports the composed application built for itself, this boot. */
let encryptors: FinancialFieldEncryptors;

/** Creates one account through the REAL route and returns its id. */
async function createAccount(payload: Record<string, unknown>): Promise<string> {
  const response = await app.request({
    method: 'POST',
    url: '/financial/accounts',
    accessToken: bound.accessToken,
    payload,
  });
  if (response.statusCode !== 201) {
    throw new Error(`fixture account failed: ${String(response.statusCode)} ${response.raw}`);
  }
  return body<{ accountId: string }>(response).accountId;
}

/**
 * FIVE accounts, created through the real route so every one of them is a row
 * the application itself wrote — including the pair that shares an issuer, a
 * type and a currency. That pair is the fixture for the schema's loudest
 * claim: identity is the id alone, and no uniqueness over (issuer, type,
 * currency) exists or may be added. A one-account fixture cannot show it.
 */
async function seedAccounts(): Promise<void> {
  accountId = await createAccount({
    accountType: 'CURRENT',
    currency: 'QAR',
    displayName: 'Conformance current',
    institutionId: INSTITUTION,
    mask: '**1234',
  });
  twinAccountId = await createAccount({
    accountType: 'CURRENT',
    currency: 'QAR',
    displayName: 'Conformance current, the second',
    institutionId: INSTITUTION,
    mask: '**5678',
  });
  walletAccountId = await createAccount({
    accountType: 'WALLET',
    walletKind: 'E_MONEY',
    currency: 'QAR',
    displayName: 'Conformance wallet',
    institutionId: WALLET_ISSUER,
  });
  cardAccountId = await createAccount({
    accountType: 'CREDIT_CARD',
    nature: 'LIABILITY',
    currency: 'QAR',
    displayName: 'Conformance card',
    institutionId: CARD_ISSUER,
    mask: '**9021',
  });
  archivedAccountId = await createAccount({
    accountType: 'SAVINGS',
    currency: 'QAR',
    displayName: 'Conformance archived',
    userSuppliedInstitutionLabel: 'An issuer the catalogue does not list',
  });
  // ARCHIVED is a real, readable state of the subject's own account, and it is
  // what makes `account_not_writable` reachable without inflicting anything.
  const archived = await app.request({
    method: 'PATCH',
    url: `/financial/accounts/${archivedAccountId}`,
    accessToken: bound.accessToken,
    payload: { expectedVersion: 1, status: 'ARCHIVED' },
  });
  if (archived.statusCode !== 200) {
    throw new Error(`fixture archive failed: ${String(archived.statusCode)} ${archived.raw}`);
  }
}

/**
 * Balances of FOUR kinds across two accounts, because the one claim this
 * surface makes about balances is that a kind is never inferred from another:
 * nothing derives AVAILABLE from BOOKED, and a CREDIT_LIMIT is not money the
 * person holds. A fixture carrying one kind cannot contradict a reader that
 * quietly treats them as interchangeable.
 *
 * Written by SQL because no balance-write route is mounted — `RecordReported-
 * Balance` is deliberately absent from the surface bundle. The table carries
 * no encrypted column, so nothing here is forged: these are the same columns,
 * with the same CHECKs and the same composite currency FK, that a mounted
 * route would have to satisfy.
 */
async function seedBalances(): Promise<void> {
  const rows: ReadonlyArray<[string, string, string, string, string]> = [
    [accountId, '125000', 'BOOKED', 'MANUAL', '2026-08-14T09:00:00Z'],
    [accountId, '118250', 'AVAILABLE', 'MANUAL', '2026-08-14T09:00:00Z'],
    [accountId, '119000', 'CURRENT', 'CSV', '2026-08-15T09:00:00Z'],
    [cardAccountId, '-430075', 'OUTSTANDING', 'MANUAL', '2026-08-14T09:00:00Z'],
    [cardAccountId, '2000000', 'CREDIT_LIMIT', 'MANUAL', '2026-08-14T09:00:00Z'],
  ];
  for (const [account, minorUnits, balanceKind, sourceKind, asOf] of rows) {
    await app.sql(
      `INSERT INTO public.financial_account_balance_snapshots
         (id, tenant_id, user_id, account_id, amount_minor_units, currency_code,
          as_of, source_kind, balance_kind, source_reference, captured_at)
       VALUES ($1, $2, $3, $4, $5, 'QAR', $6, $7, $8, $9, now())`,
      [
        randomUUID(),
        TENANT,
        bound.userId,
        account,
        minorUnits,
        asOf,
        sourceKind,
        balanceKind,
        randomUUID(),
      ],
    );
  }
}

/**
 * Two connections and one source link, encrypted by the application's OWN HSF
 * port (see `ComposedApp.financialFieldEncryptors`) so the read routes decrypt
 * them exactly as they would decrypt a row a write route had produced.
 *
 * The external account reference is a POISON value: it is the single most
 * replay-worthy thing this module stores, the read model has no field for it,
 * and the assertions below check the serialized bytes for it by name.
 */
async function seedConnectionAndSourceLink(): Promise<void> {
  const encryptLabel = async (rowId: string, table: string, field: string, plaintext: string) =>
    encryptors.connections.encryptField(
      { tenantId: TENANT, userId: bound.userId },
      { reveal: () => plaintext },
      { table, rowId, field },
    );

  const fileConnectionId = randomUUID();
  const manualConnectionId = randomUUID();
  const connections: ReadonlyArray<[string, string, string, string | null, string]> = [
    [
      fileConnectionId,
      'USER_FILE_UPLOAD',
      'ACTIVE',
      INSTITUTION,
      `${POISON_CONNECTION_LABEL_MARKER}: statements I upload`,
    ],
    [
      manualConnectionId,
      'MANUAL',
      'ACTIVE',
      null,
      `${POISON_CONNECTION_LABEL_MARKER}: what I type`,
    ],
  ];
  for (const [id, rail, status, institutionRef, label] of connections) {
    const encrypted = await encryptLabel(id, 'financial_connections', 'displayLabel', label);
    await app.sql(
      `INSERT INTO public.financial_connections
         (id, tenant_id, user_id, institution_ref, institution_reference_type, rail, status,
          hsf_algorithm, hsf_key_version,
          display_label_ciphertext, display_label_nonce, display_label_auth_tag, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
      [
        id,
        TENANT,
        bound.userId,
        institutionRef,
        institutionRef === null ? null : 'INSTITUTION_CATALOGUE_ENTRY',
        rail,
        status,
        encrypted.algorithm,
        encrypted.keyVersion,
        bytes(encrypted.ciphertext),
        bytes(encrypted.nonce),
        bytes(encrypted.authTag),
      ],
    );
  }

  const linkId = randomUUID();
  const reference = await encryptLabel(
    linkId,
    'account_source_links',
    'sourceAccountReference',
    POISON_SOURCE_REFERENCE,
  );
  await app.sql(
    `INSERT INTO public.account_source_links
       (id, tenant_id, user_id, account_id, account_reference_type,
        connection_id, connection_rail, source_authority,
        hsf_algorithm, hsf_key_version,
        source_account_reference_ciphertext, source_account_reference_nonce,
        source_account_reference_auth_tag,
        source_account_fingerprint, source_account_fingerprint_version,
        match_basis, source_status, subject_confirmed_at, source_priority,
        first_observed_at, last_observed_at, last_successful_import_at,
        history_coverage_start, history_coverage_end,
        balance_capability, pending_transaction_capability, updated_at)
     VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT',
             $5, 'USER_FILE_UPLOAD', 'AUTHORITATIVE',
             $6, $7, $8, $9, $10,
             $11, 'conformance-fingerprint/v1',
             'EXACT_EXTERNAL_REFERENCE', 'LINKED', NULL, 10,
             now() - interval '30 days', now() - interval '1 day', now() - interval '1 day',
             DATE '2026-07-01', DATE '2026-08-15',
             'OBSERVED', 'NOT_PROVIDED', now())`,
    [
      linkId,
      TENANT,
      bound.userId,
      accountId,
      fileConnectionId,
      reference.algorithm,
      reference.keyVersion,
      bytes(reference.ciphertext),
      bytes(reference.nonce),
      bytes(reference.authTag),
      // A synthetic stand-in for the keyed value. It is never read back on any
      // route — the read model has no field for it — so its only job here is
      // to satisfy the column and be recognisable if it ever escaped.
      'conformance-fingerprint-CANARY',
    ],
  );
}

/**
 * A wallet with TWO virtual cards, plus a physical card on the credit-card
 * account and one cancelled card.
 *
 * The two-on-one-wallet shape is the module's own headline example: there is
 * no unique index over (account, type) or (account, mask), and both cards
 * spend from ONE balance — which is exactly why no instrument carries a
 * figure. A fixture with a single card would let a per-card amount appear
 * without anything failing.
 */
async function seedVirtualCards(): Promise<void> {
  const cards: ReadonlyArray<[string, string, string, string, string]> = [
    [walletAccountId, 'VIRTUAL_CARD', 'ACTIVE', '**4417', 'Everyday virtual card'],
    [walletAccountId, 'VIRTUAL_CARD', 'ACTIVE', '**8802', 'Subscriptions virtual card'],
    [cardAccountId, 'PHYSICAL_CARD', 'ACTIVE', '**9021', 'The card in my wallet'],
    [walletAccountId, 'PREPAID_CARD', 'CANCELLED', '**1001', 'A card I cancelled'],
  ];
  for (const [account, instrumentType, status, mask, label] of cards) {
    const id = randomUUID();
    const encrypt = (field: string, plaintext: string) =>
      encryptors.instruments.encryptField(
        { tenantId: TENANT, userId: bound.userId },
        { reveal: () => plaintext },
        { table: 'payment_instruments', rowId: id, field },
      );
    const maskField = await encrypt('instrumentMask', mask);
    const labelField = await encrypt('displayLabel', label);
    await app.sql(
      `INSERT INTO public.payment_instruments
         (id, tenant_id, user_id, account_id, account_reference_type, instrument_type, status,
          hsf_algorithm, hsf_key_version,
          instrument_mask_ciphertext, instrument_mask_nonce, instrument_mask_auth_tag,
          display_label_ciphertext, display_label_nonce, display_label_auth_tag, updated_at)
       VALUES ($1, $2, $3, $4, 'FINANCIAL_ACCOUNT', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())`,
      [
        id,
        TENANT,
        bound.userId,
        account,
        instrumentType,
        status,
        maskField.algorithm,
        maskField.keyVersion,
        bytes(maskField.ciphertext),
        bytes(maskField.nonce),
        bytes(maskField.authTag),
        bytes(labelField.ciphertext),
        bytes(labelField.nonce),
        bytes(labelField.authTag),
      ],
    );
  }
}

/**
 * Two SUGGESTED transfer matches over four REAL transactions, so the decision
 * routes have something to decide about.
 *
 * There is still no client-driven "match these two" — that would let a person
 * assert a relationship the equal-and-opposite rule refuses — but the PLATFORM
 * now proposes matches itself when a transaction is recorded. So this no
 * longer seeds unconditionally: it looks for the suggestion the platform
 * already made about these two transactions and uses that, and seeds one only
 * when the generator did not pair them.
 *
 * Seeding regardless is what this used to do, and it began failing the moment
 * generation was mounted: the rows were already in a live match, and the
 * "one transaction, at most one live match" rule refused the second — which
 * is the rule working, not a fixture that needed loosening.
 *
 * Every seeded field is honest either way: two DIFFERENT transactions on two
 * DIFFERENT accounts, the same currency, equal and opposite, under the
 * module's own declared window label. The table carries no encrypted column.
 */
async function seedTransferMatch(
  outflowTransactionId: string,
  outflowAccount: string,
  inflowTransactionId: string,
  inflowAccount: string,
): Promise<string> {
  // The platform's own suggestion, if it made one about this pair.
  const existing = await app.sql<{ id: string }>(
    `SELECT id FROM public.transfer_matches
      WHERE tenant_id = $1
        AND outflow_transaction_id = $2
        AND inflow_transaction_id = $3
        AND match_state <> 'REJECTED'
      LIMIT 1`,
    [TENANT, outflowTransactionId, inflowTransactionId],
  );
  if (existing.length > 0 && existing[0] !== undefined) return existing[0].id;

  const id = randomUUID();
  await app.sql(
    `INSERT INTO public.transfer_matches
       (id, tenant_id, user_id,
        outflow_transaction_id, outflow_transaction_reference_type, outflow_account_id,
        outflow_currency_code,
        inflow_transaction_id, inflow_transaction_reference_type, inflow_account_id,
        inflow_currency_code,
        match_state, suggestion_basis, suggestion_window, subject_decided_at,
        first_suggested_at, updated_at)
     VALUES ($1, $2, $3,
             $4, 'TRANSACTION', $5, 'QAR',
             $6, 'TRANSACTION', $7, 'QAR',
             'SUGGESTED', 'EQUAL_AND_OPPOSITE_SAME_CURRENCY_WITHIN_WINDOW',
             'equal-and-opposite/same-currency/P3D/v1', NULL,
             now() - interval '1 hour', now())`,
    [
      id,
      TENANT,
      bound.userId,
      outflowTransactionId,
      outflowAccount,
      inflowTransactionId,
      inflowAccount,
    ],
  );
  return id;
}

/** Records one manual transaction through the REAL route and returns its id. */
async function createTransaction(payload: Record<string, unknown>): Promise<string> {
  const response = await app.request({
    method: 'POST',
    url: '/financial/transactions',
    accessToken: bound.accessToken,
    payload,
  });
  if (response.statusCode !== 201) {
    throw new Error(`fixture transaction failed: ${String(response.statusCode)} ${response.raw}`);
  }
  return body<{ transactionId: string }>(response).transactionId;
}

describe.skipIf(unreachable !== null)('the financial surface conforms to its contract', () => {
  beforeAll(async () => {
    app = await ComposedApp.boot(database);
    bound = await app.registerAndLogin('198.51.100.21');
    await app.seedTenantWithMember(TENANT, bound.userId);
    await app.seedUserProfile(TENANT, bound.userId);
    // Reference data arrives by reviewed migration in production; a scratch
    // database built from the migrations alone holds none, so the catalogues
    // are seeded here the same way every other fixture in this suite is.
    // FOUR issuers, of four kinds, one of them RETIRED: a catalogue with one
    // row cannot show that a filter narrows, that retirement hides an entry
    // from selection while keeping it resolvable, or that a page has a next.
    await app.sql(
      `INSERT INTO public.institutions (id, code, kind, display_name_en, display_name_ar, status, updated_at)
       VALUES ($1, 'CONFORMANCE_BANK', 'BANK', 'Conformance Bank', 'مصرف المطابقة', 'ACTIVE', now()),
              ($2, 'CONFORMANCE_RETIRED', 'EXCHANGE_HOUSE', 'Retired House', 'دار متقاعدة', 'RETIRED', now()),
              ($3, 'CONFORMANCE_WALLET_CO', 'FINTECH_WALLET', 'Conformance Wallet Co', 'شركة محفظة المطابقة', 'ACTIVE', now()),
              ($4, 'CONFORMANCE_CARD_CO', 'CARD_ISSUER', 'Conformance Card Co', 'شركة بطاقة المطابقة', 'ACTIVE', now())`,
      [INSTITUTION, RETIRED_INSTITUTION, WALLET_ISSUER, CARD_ISSUER],
    );
    // A parent, a child, and a retired code: `assignable` is a computed
    // predicate, and a catalogue where every row answers the same way cannot
    // show that it computed anything.
    await app.sql(
      `INSERT INTO public.financial_categories (code, parent_code, label_en, label_ar, catalogue_version, retired_at)
       VALUES ($1, NULL, 'Groceries', 'بقالة', 'conformance/v1', NULL),
              ($2, $1, 'Supermarket', 'سوبرماركت', 'conformance/v1', NULL),
              ($3, NULL, 'Retired code', 'رمز متقاعد', 'conformance/v1', now() - interval '1 day')`,
      [CATEGORY, CATEGORY_CHILD, CATEGORY_RETIRED],
    );
    // The session binds to its single membership on first bootstrap; every
    // financial route needs that binding, and nothing else supplies it.
    const bootstrap = await app.request({
      method: 'GET',
      url: '/platform/bootstrap',
      accessToken: bound.accessToken,
    });
    expect(bootstrap.statusCode).toBe(200);

    // A second real subject with no membership anywhere. Its session
    // authenticates and never binds, which is the ordinary state of somebody
    // who has not been added to a household yet — and the second of the two
    // ways this surface answers 403.
    unbound = await app.registerAndLogin('198.51.100.22');

    encryptors = app.financialFieldEncryptors();
    await seedAccounts();
    await seedBalances();
    await seedConnectionAndSourceLink();
    await seedVirtualCards();
  }, 180_000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
  });

  describe('authentication and the principal', () => {
    it('answers 401 on EVERY Phase 5 operation, with no token at all', async () => {
      // All twenty-seven, not a sample. The whole surface is authenticated, so
      // every route has a reachable 401 and there is no honest reason for the
      // ledger to carry some of them and not others. Ids are synthetic: an
      // unauthenticated request must be refused BEFORE anything is looked up,
      // so a real id would prove less, not more.
      const routes = phase5Routes(randomUUID());
      expect(routes).toHaveLength(
        contract.operations().filter((operation) => operation.path.startsWith('/financial')).length,
      );
      for (const [operationId, method, url] of routes) {
        // The CSV route accepts one request media type and Fastify parses the
        // body before any guard runs, so an unauthenticated probe has to speak
        // `text/csv` or it would be refused for the wrong reason.
        const csv = operationId === 'uploadOwnStatementImportSource';
        const writes = method !== 'GET' && method !== 'DELETE';
        conforms(
          operationId,
          401,
          await app.request({
            method,
            url,
            ...(csv
              ? { headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE }, payload: 'date\n2026-08-12' }
              : writes
                ? { payload: {} }
                : {}),
          }),
        );
      }
    });

    it('answers 403 on EVERY Phase 5 operation for a session with no tenant binding', async () => {
      // The SECOND way a 403 arrives here, and the one an ordinary person
      // reaches: authenticated, but bound to no tenant. It is a different
      // remedy from 401 — choose a household, versus sign in — and the guard
      // decides it with the same helper the controllers use, so the answer is
      // identical whether the capability gate is in front of the handler or
      // not. All twenty-seven, for the same reason the 401 sweep is all
      // twenty-seven.
      const routes = phase5Routes(randomUUID());
      expect(routes).toHaveLength(
        contract.operations().filter((operation) => operation.path.startsWith('/financial')).length,
      );
      const bodies = new Set<string>();
      for (const [operationId, method, url] of routes) {
        const csv = operationId === 'uploadOwnStatementImportSource';
        const writes = method !== 'GET' && method !== 'DELETE';
        const response = await app.request({
          method,
          url,
          accessToken: unbound.accessToken,
          ...(csv
            ? { headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE }, payload: 'date\n2026-08-12' }
            : writes
              ? { payload: {} }
              : {}),
        });
        conforms(operationId, 403, response);
        expect(body<{ code: string }>(response).code).toBe('TENANT_BINDING_REQUIRED');
        bodies.add(response.raw);
      }
      // One body across all twenty-seven: the refusal says nothing about which
      // route was asked for, so it cannot be used to enumerate the surface.
      expect(bodies.size).toBe(1);
    });

    it('answers 403 CAPABILITY_UNAVAILABLE when the gate could not be resolved', async () => {
      // THE ARM THE LOCAL FIXTURE DOES NOT PAPER OVER. The synthetic
      // availability fixture substitutes for a decision nobody has taken; it
      // never substitutes for an ANSWER NOBODY COULD OBTAIN. The capability
      // ceiling is resolved from the subject's jurisdiction assignments on
      // every request, so a store the app role cannot read is a resolution
      // that failed — and a resolution that failed is not a permission.
      //
      // The grant is narrowed on THIS suite's own scratch database and put
      // back in `finally`. Nothing else on the financial surface reads that
      // table, and the state itself is an ordinary one: a migration that
      // forgot a GRANT produces exactly it.
      await app.sql('REVOKE SELECT ON public.user_jurisdiction_assignments FROM karar_app');
      let refused: WireResponse;
      let second: WireResponse;
      try {
        refused = await app.request({
          method: 'GET',
          url: '/financial/accounts',
          accessToken: bound.accessToken,
        });
        second = await app.request({
          method: 'POST',
          url: '/financial/transactions',
          accessToken: bound.accessToken,
          payload: {
            accountId,
            magnitude: { minorUnits: '100', currency: 'QAR' },
            direction: 'MONEY_IN',
            bookingDate: '2026-08-12',
            description: 'Never recorded: the gate refused first',
          },
        });
      } finally {
        await app.sql('GRANT SELECT ON public.user_jurisdiction_assignments TO karar_app');
      }

      conforms('listOwnFinancialAccounts', 403, refused);
      conforms('createOwnManualTransaction', 403, second);
      const problem = body<Record<string, unknown>>(refused);
      expect(problem['code']).toBe('CAPABILITY_UNAVAILABLE');

      // INDISTINGUISHABILITY, asserted rather than described. A decided
      // denial, an unbuilt capability, nothing deployed, an uncleared
      // jurisdiction, a pending legal review and this store failure are ONE
      // answer. So the document may carry no `reason`, no `retryable`, and
      // nothing naming a gate, a capability, a jurisdiction, a policy pack or
      // a store — any of which would let a caller probe for which arm fired.
      expect(problem['reason']).toBeUndefined();
      expect(problem['retryable']).toBeUndefined();
      for (const leak of [
        'TRANSACTIONS',
        'jurisdiction',
        'pack',
        'PENDING_LEGAL_REVIEW',
        'NOT_IMPLEMENTED',
        'entitlement',
        'consent',
        'user_jurisdiction_assignments',
        'permission denied',
        'SELECT',
      ]) {
        expect(refused.raw, `the refusal named '${leak}'`).not.toContain(leak);
      }
      // And the two routes answered with the same bytes but for the echoed
      // `instance`: the refusal does not vary with what was asked for.
      const strip = (raw: string): string =>
        raw.replace(/"instance":"[^"]*"/, '').replace(/"requestId":"[^"]*"/, '');
      expect(strip(second.raw)).toBe(strip(refused.raw));

      // The surface is serving again, so nothing after this point is running
      // against a narrowed grant.
      const restored = await app.request({
        method: 'GET',
        url: '/financial/accounts',
        accessToken: bound.accessToken,
      });
      expect(restored.statusCode).toBe(200);
    });

    it('IGNORES a userId, a tenantId and an x-tenant-id header, byte for byte', async () => {
      // The claim the whole surface rests on, exercised rather than asserted:
      // the principal comes from the session's server-side binding, so a
      // request naming another subject reads exactly like one that does not.
      const honest = await app.request({
        method: 'GET',
        url: '/financial/accounts',
        accessToken: bound.accessToken,
      });
      const injected = await app.request({
        method: 'GET',
        url: `/financial/accounts?userId=${randomUUID()}&tenantId=${OTHER_TENANT}`,
        accessToken: bound.accessToken,
        headers: { 'x-tenant-id': OTHER_TENANT, 'x-user-id': randomUUID() },
      });
      expect(injected.statusCode).toBe(honest.statusCode);
      expect(injected.raw).toBe(honest.raw);
    });
  });

  describe('the catalogues', () => {
    it('lists the reviewed issuers, paginated, without the retired one', async () => {
      const response = await app.request({
        method: 'GET',
        url: '/financial/institutions?limit=1',
        accessToken: bound.accessToken,
      });
      conforms('listFinancialInstitutions', 200, response);
      const page = body<{ items: Array<{ institutionId: string; status: string }> }>(response);
      expect(page.items.map((item) => item.institutionId)).toEqual([INSTITUTION]);
      expect(page.items[0]?.status).toBe('ACTIVE');
    });

    it('refuses an issuer kind outside the vocabulary', async () => {
      conforms(
        'listFinancialInstitutions',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/institutions?kind=NOT_A_KIND',
          accessToken: bound.accessToken,
        }),
      );
    });

    it('lists the category catalogue and states assignability', async () => {
      const response = await app.request({
        method: 'GET',
        url: '/financial/categories?assignable=true',
        accessToken: bound.accessToken,
      });
      conforms('listFinancialCategories', 200, response);
      const page = body<{ items: Array<{ code: string; assignable: boolean }> }>(response);
      // The catalogue arrives by reviewed migration and this fixture adds one
      // row to it, so the assertion is on the row rather than on the set.
      expect(page.items).toContainEqual(
        expect.objectContaining({ code: CATEGORY, assignable: true, retiredAt: null }),
      );
      expect(page.items.every((item) => item.assignable)).toBe(true);
      // A retired code is in the catalogue and is NOT assignable: existing
      // assignments still resolve, no new one may be made. A fixture whose
      // every row answered the same way could not show the predicate ran.
      const all = await app.request({
        method: 'GET',
        url: '/financial/categories',
        accessToken: bound.accessToken,
      });
      conforms('listFinancialCategories', 200, all);
      const catalogue = body<{
        items: Array<{ code: string; parentCode: string | null; assignable: boolean }>;
      }>(all);
      const byCode = new Map(catalogue.items.map((item) => [item.code, item]));
      expect(byCode.get(CATEGORY_RETIRED)?.assignable).toBe(false);
      expect(byCode.get(CATEGORY_CHILD)?.assignable).toBe(true);
      // The code IS the hierarchy, and the parent travels rather than being
      // parsed out of the code by a client.
      expect(byCode.get(CATEGORY_CHILD)?.parentCode).toBe(CATEGORY);
      expect(byCode.get(CATEGORY)?.parentCode).toBeNull();
    });

    it('refuses a catalogue page bound and a filter it cannot read', async () => {
      conforms(
        'listFinancialCategories',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/categories?assignable=perhaps',
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'listFinancialInstitutions',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/institutions?limit=0',
          accessToken: bound.accessToken,
        }),
      );
    });
  });

  describe('accounts', () => {
    it('creates a manual account, with the origin fixed by the server', async () => {
      const response = await app.request({
        method: 'POST',
        url: '/financial/accounts',
        accessToken: bound.accessToken,
        payload: {
          accountType: 'CASH',
          currency: 'QAR',
          displayName: 'Conformance cash tin',
          userSuppliedInstitutionLabel: 'The tin on the shelf',
        },
      });
      conforms('createOwnManualFinancialAccount', 201, response);
      const account = body<{
        accountId: string;
        origin: string;
        link: Record<string, unknown>;
        displayName: string;
      }>(response);
      // Not a request field: MANUAL because the use case fixes it.
      expect(account.origin).toBe('MANUAL');
      // Nothing here may be rendered as a live institution link.
      expect(account.link).toEqual({
        state: 'NOT_LINKED',
        impliesLiveInstitutionLink: false,
        providerAccessStatus: 'NOT_IMPLEMENTED',
      });
      // Disclosed to its owner, decrypted — not the redaction marker.
      expect(account.displayName).toBe('Conformance cash tin');
      expect(response.raw).not.toContain('HIGHLY_SENSITIVE_FINANCIAL');
    });

    it('refuses a malformed create body', async () => {
      conforms(
        'createOwnManualFinancialAccount',
        400,
        await app.request({
          method: 'POST',
          url: '/financial/accounts',
          accessToken: bound.accessToken,
          payload: { accountType: 'NOT_A_TYPE', currency: 'QAR', displayName: 'x' },
        }),
      );
    });

    it('REFUSES an account pointed at a retired catalogue entry', async () => {
      // The 409 the contract declares, from a real readable state: a RETIRED
      // issuer stays resolvable for accounts that already name it and is not
      // selectable for a new one.
      conforms(
        'createOwnManualFinancialAccount',
        409,
        await app.request({
          method: 'POST',
          url: '/financial/accounts',
          accessToken: bound.accessToken,
          payload: {
            accountType: 'CURRENT',
            currency: 'QAR',
            displayName: 'At a retired issuer',
            institutionId: RETIRED_INSTITUTION,
          },
        }),
      );
    });

    it('holds two accounts of one type and one currency at one issuer, apart', async () => {
      // The claim the schema is loudest about: identity is the id alone. No
      // uniqueness over (issuer, type, currency) exists, and a fixture with one
      // account could not tell a reader that collapses them from one that does
      // not.
      const response = await app.request({
        method: 'GET',
        url: `/financial/accounts?institutionId=${INSTITUTION}&accountType=CURRENT&currency=QAR`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnFinancialAccounts', 200, response);
      const page = body<{ items: Array<{ accountId: string; displayName: string }> }>(response);
      expect(page.items.map((item) => item.accountId).sort()).toEqual(
        [accountId, twinAccountId].sort(),
      );
      // Two rows, two different names, decrypted for their owner.
      expect(new Set(page.items.map((item) => item.displayName)).size).toBe(2);
    });

    it('reads the wallet with its kind, and the card with its nature', async () => {
      const wallet = await app.request({
        method: 'GET',
        url: `/financial/accounts/${walletAccountId}`,
        accessToken: bound.accessToken,
      });
      conforms('readOwnFinancialAccount', 200, wallet);
      const walletView = body<{
        accountType: string;
        walletKind: string | null;
        institution: { code: string; kind: string } | null;
      }>(wallet);
      expect(walletView.accountType).toBe('WALLET');
      expect(walletView.walletKind).toBe('E_MONEY');
      expect(walletView.institution?.kind).toBe('FINTECH_WALLET');

      const card = await app.request({
        method: 'GET',
        url: `/financial/accounts/${cardAccountId}`,
        accessToken: bound.accessToken,
      });
      conforms('readOwnFinancialAccount', 200, card);
      const cardView = body<{ nature: string; walletKind: string | null; mask: string | null }>(
        card,
      );
      expect(cardView.nature).toBe('LIABILITY');
      // Present-and-null rather than omitted: absence is stated.
      expect(cardView.walletKind).toBeNull();
      expect(cardView.mask).toBe('**9021');
    });

    it('lists own accounts, and every declared filter narrows rather than widens', async () => {
      conforms(
        'listOwnFinancialAccounts',
        200,
        await app.request({
          method: 'GET',
          url:
            `/financial/accounts?institutionId=${INSTITUTION}&institutionKind=BANK` +
            '&accountType=CURRENT&nature=UNKNOWN&currency=QAR&status=ACTIVE&origin=MANUAL',
          accessToken: bound.accessToken,
        }),
      );
      // Narrowing on a REAL non-empty fixture: the savings account exists and
      // is the only one, and it is ARCHIVED — so a filter that widened, or one
      // that quietly ignored `status`, is visible here rather than hidden
      // behind two empty pages that agree with each other.
      const savings = await app.request({
        method: 'GET',
        url: '/financial/accounts?accountType=SAVINGS',
        accessToken: bound.accessToken,
      });
      expect(
        body<{ items: Array<{ accountId: string }> }>(savings).items.map((row) => row.accountId),
      ).toEqual([archivedAccountId]);
      const active = await app.request({
        method: 'GET',
        url: '/financial/accounts?accountType=SAVINGS&status=ACTIVE',
        accessToken: bound.accessToken,
      });
      expect(body<{ items: unknown[] }>(active).items).toEqual([]);
    });

    it('refuses a cursor that names no position in this result set', async () => {
      conforms(
        'listOwnFinancialAccounts',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/accounts?cursor=not-a-cursor',
          accessToken: bound.accessToken,
        }),
      );
    });

    it('reads one own account, and answers 404 for anything else', async () => {
      conforms(
        'readOwnFinancialAccount',
        200,
        await app.request({
          method: 'GET',
          url: `/financial/accounts/${accountId}`,
          accessToken: bound.accessToken,
        }),
      );
      // Another subject's id and an unknown id answer alike: the route is not
      // an existence oracle.
      conforms(
        'readOwnFinancialAccount',
        404,
        await app.request({
          method: 'GET',
          url: `/financial/accounts/${randomUUID()}`,
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'readOwnFinancialAccount',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/accounts/not-a-uuid',
          accessToken: bound.accessToken,
        }),
      );
    });

    it('updates under an optimistic version, and refuses a stale one', async () => {
      const updated = await app.request({
        method: 'PATCH',
        url: `/financial/accounts/${accountId}`,
        accessToken: bound.accessToken,
        payload: { expectedVersion: 1, displayName: 'Renamed by its owner' },
      });
      conforms('updateOwnFinancialAccount', 200, updated);
      expect(body<{ displayName: string; version: number }>(updated).displayName).toBe(
        'Renamed by its owner',
      );
      conforms(
        'updateOwnFinancialAccount',
        409,
        await app.request({
          method: 'PATCH',
          url: `/financial/accounts/${accountId}`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1, displayName: 'Stale write' },
        }),
      );
      conforms(
        'updateOwnFinancialAccount',
        400,
        await app.request({
          method: 'PATCH',
          url: `/financial/accounts/${accountId}`,
          accessToken: bound.accessToken,
          payload: { displayName: 'No version' },
        }),
      );
      conforms(
        'updateOwnFinancialAccount',
        404,
        await app.request({
          method: 'PATCH',
          url: `/financial/accounts/${randomUUID()}`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1, displayName: 'Not mine' },
        }),
      );
    });

    it('lists the source-reported balances, of MORE THAN ONE KIND, per account', async () => {
      const response = await app.request({
        method: 'GET',
        url: `/financial/accounts/${accountId}/balances`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnAccountBalanceSnapshots', 200, response);
      const page = body<{
        items: Array<{
          balanceKind: string;
          sourceKind: string;
          amount: { minorUnits: string; currency: string; exponent: number };
          availability: string;
        }>;
      }>(response);
      // Three kinds on one account, none derived from another: the exact set,
      // so a reader that collapsed AVAILABLE into BOOKED fails here.
      expect(page.items.map((row) => row.balanceKind).sort()).toEqual([
        'AVAILABLE',
        'BOOKED',
        'CURRENT',
      ]);
      expect(page.items.map((row) => row.amount.minorUnits).sort()).toEqual([
        '118250',
        '119000',
        '125000',
      ]);
      // Every figure crossed as CHARACTERS. A JSON number would read as
      // `"minorUnits":125000` and is nowhere in these bytes.
      expect(response.raw).toContain('"minorUnits":"125000"');
      expect(response.raw).not.toContain('"minorUnits":125000');

      // The card's balances, where a CREDIT_LIMIT sits beside what is OWED and
      // neither may be read as the other.
      const card = await app.request({
        method: 'GET',
        url: `/financial/accounts/${cardAccountId}/balances`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnAccountBalanceSnapshots', 200, card);
      const cardPage = body<{
        items: Array<{ balanceKind: string; amount: { minorUnits: string } }>;
      }>(card);
      expect(
        cardPage.items.map((row) => `${row.balanceKind}=${row.amount.minorUnits}`).sort(),
      ).toEqual(['CREDIT_LIMIT=2000000', 'OUTSTANDING=-430075']);

      // The declared filter narrows a NON-EMPTY page rather than an empty one.
      const booked = await app.request({
        method: 'GET',
        url: `/financial/accounts/${accountId}/balances?balanceKind=BOOKED`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnAccountBalanceSnapshots', 200, booked);
      expect(body<{ items: unknown[] }>(booked).items).toHaveLength(1);

      // The row's own source_reference is an internal identifier with no field
      // on this route, and the tenant and user are never echoed back.
      expect(response.raw).not.toContain('sourceReference');
      expect(response.raw).not.toContain(TENANT);
      expect(response.raw).not.toContain(bound.userId);
      expect(page.items.every((row) => row.availability === 'EXECUTABLE')).toBe(true);
    });

    it('lists the source links WITHOUT the external reference or its fingerprint', async () => {
      const response = await app.request({
        method: 'GET',
        url: `/financial/accounts/${accountId}/source-links`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnAccountSourceLinks', 200, response);
      const page = body<{
        items: Array<{
          accountId: string;
          rail: string;
          availability: string;
          sourceAuthority: string;
          matchBasis: string;
          status: string;
          sourcePriority: number;
          link: Record<string, unknown>;
        }>;
      }>(response);
      expect(page.items).toHaveLength(1);
      const link = page.items[0];
      expect(link?.accountId).toBe(accountId);
      expect(link?.rail).toBe('USER_FILE_UPLOAD');
      expect(link?.availability).toBe('EXECUTABLE');
      expect(link?.sourceAuthority).toBe('AUTHORITATIVE');
      expect(link?.matchBasis).toBe('EXACT_EXTERNAL_REFERENCE');
      expect(link?.status).toBe('LINKED');
      expect(link?.sourcePriority).toBe(10);
      expect(link?.link).toEqual({
        impliesLiveInstitutionLink: false,
        providerAccessStatus: 'NOT_IMPLEMENTED',
      });
      // THE POINT OF THE FIXTURE. The row genuinely holds another party's
      // identifier for this subject, and a keyed fingerprint over it. Neither
      // has a field in the read model, and neither is in these bytes.
      expect(response.raw).not.toContain(POISON_SOURCE_REFERENCE);
      expect(response.raw).not.toContain('CANARY');
      expect(response.raw).not.toContain('fingerprint');
      expect(response.raw).not.toContain('ciphertext');
      expect(response.raw).not.toContain('keyVersion');

      // A rail nothing was linked on narrows the same non-empty page to none.
      const manualOnly = await app.request({
        method: 'GET',
        url: `/financial/accounts/${accountId}/source-links?rail=MANUAL`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnAccountSourceLinks', 200, manualOnly);
      expect(body<{ items: unknown[] }>(manualOnly).items).toEqual([]);
    });

    it('lists the wallet’s TWO virtual cards, with no figure on either', async () => {
      const response = await app.request({
        method: 'GET',
        url: `/financial/accounts/${walletAccountId}/payment-instruments`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnAccountPaymentInstruments', 200, response);
      const page = body<{
        items: Array<{
          instrumentId: string;
          accountId: string;
          instrumentType: string;
          status: string;
          spendable: boolean;
          mask: string;
          displayLabel: string;
          version: number;
          issuerLink: Record<string, unknown>;
        }>;
      }>(response);
      // Three instruments on ONE wallet, two of them virtual cards: exactly
      // the shape no unique index may forbid.
      expect(page.items.map((row) => `${row.instrumentType}:${row.mask}`).sort()).toEqual([
        'PREPAID_CARD:**1001',
        'VIRTUAL_CARD:**4417',
        'VIRTUAL_CARD:**8802',
      ]);
      expect(page.items.every((row) => row.accountId === walletAccountId)).toBe(true);
      // The subject's own labels came back decrypted, and they differ — which
      // is the whole reason the column is required.
      expect(page.items.map((row) => row.displayLabel).sort()).toEqual([
        'A card I cancelled',
        'Everyday virtual card',
        'Subscriptions virtual card',
      ]);
      // No status means provisioned, and the wire says so on every card —
      // including the TOKENIZED_CARD type, which names a fact about the world
      // rather than a live provisioning state.
      expect(
        page.items.every(
          (row) =>
            row.issuerLink['impliesLiveIssuerLink'] === false &&
            row.issuerLink['providerAccessStatus'] === 'NOT_IMPLEMENTED',
        ),
      ).toBe(true);
      // `version` is the ONLY number in the object. Two cards share one
      // balance, so any per-card figure would be invented.
      for (const row of page.items) {
        const numeric = Object.entries(row).filter(([, value]) => typeof value === 'number');
        expect(numeric.map(([key]) => key)).toEqual(['version']);
      }
      // No PAN, no expiry, no token, no credential — and the eight-character
      // bound is what makes a full card number unrepresentable upstream.
      expect(page.items.every((row) => row.mask.length <= 8)).toBe(true);
      expect(response.raw).not.toContain('"pan"');
      expect(response.raw).not.toContain('"cvv"');
      expect(response.raw).not.toContain('"expiry"');

      // `spendable` is the module's own predicate, on a page that holds both
      // answers.
      const spendable = await app.request({
        method: 'GET',
        url: `/financial/accounts/${walletAccountId}/payment-instruments?spendable=false`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnAccountPaymentInstruments', 200, spendable);
      const cancelled = body<{ items: Array<{ status: string; spendable: boolean }> }>(spendable);
      expect(cancelled.items.map((row) => row.status)).toEqual(['CANCELLED']);
      expect(cancelled.items[0]?.spendable).toBe(false);

      // An account that is not the caller's produces an EMPTY page rather
      // than a 404, so this route is not an existence oracle.
      const foreign = await app.request({
        method: 'GET',
        url: `/financial/accounts/${randomUUID()}/payment-instruments`,
        accessToken: bound.accessToken,
      });
      expect(foreign.statusCode).toBe(200);
      expect(body<{ items: unknown[] }>(foreign).items).toEqual([]);
    });

    it('lists the connections, on the two rails that run, with no sync token', async () => {
      const response = await app.request({
        method: 'GET',
        url: '/financial/connections',
        accessToken: bound.accessToken,
      });
      conforms('listOwnFinancialConnections', 200, response);
      const page = body<{
        items: Array<{
          connectionId: string;
          rail: string;
          availability: string;
          status: string;
          displayLabel: string;
          institutionId: string | null;
          link: Record<string, unknown>;
        }>;
      }>(response);
      expect(page.items.map((row) => row.rail).sort()).toEqual(['MANUAL', 'USER_FILE_UPLOAD']);
      expect(page.items.every((row) => row.availability === 'EXECUTABLE')).toBe(true);
      expect(page.items.every((row) => row.status === 'ACTIVE')).toBe(true);
      // ACTIVE does not mean connected, and the wire says so on every row.
      expect(page.items.every((row) => row.link['impliesLiveInstitutionLink'] === false)).toBe(
        true,
      );
      // The subject's own labels, decrypted for them.
      expect(
        page.items.every((row) => row.displayLabel.includes(POISON_CONNECTION_LABEL_MARKER)),
      ).toBe(true);
      // A connection to no catalogue issuer is present-and-null, not omitted.
      expect(page.items.map((row) => row.institutionId).sort()).toEqual([INSTITUTION, null]);
      // Nothing that would imply a synchronisation that does not exist.
      for (const absent of ['lastSync', 'syncToken', 'credential', 'accessToken', 'ciphertext']) {
        expect(response.raw).not.toContain(absent);
      }

      const filtered = await app.request({
        method: 'GET',
        url: `/financial/connections?rail=USER_FILE_UPLOAD&status=ACTIVE&institutionId=${INSTITUTION}`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnFinancialConnections', 200, filtered);
      expect(body<{ items: unknown[] }>(filtered).items).toHaveLength(1);
    });

    it('refuses a malformed account id on every per-account view', async () => {
      for (const [operationId, path] of [
        ['listOwnAccountBalanceSnapshots', 'balances'],
        ['listOwnAccountSourceLinks', 'source-links'],
        ['listOwnAccountPaymentInstruments', 'payment-instruments'],
      ] as const) {
        conforms(
          operationId,
          400,
          await app.request({
            method: 'GET',
            url: `/financial/accounts/not-a-uuid/${path}`,
            accessToken: bound.accessToken,
          }),
        );
      }
      conforms(
        'listOwnFinancialConnections',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/connections?institutionId=not-a-uuid',
          accessToken: bound.accessToken,
        }),
      );
      // Balances resolve the account first, so an id that is not the caller's
      // answers 404 rather than an empty page — and the two shapes are not
      // interchangeable: one says "nothing reported", the other "not yours".
      conforms(
        'listOwnAccountBalanceSnapshots',
        404,
        await app.request({
          method: 'GET',
          url: `/financial/accounts/${randomUUID()}/balances`,
          accessToken: bound.accessToken,
        }),
      );
    });
  });

  describe('transactions', () => {
    it('records a manual transaction from a magnitude and a direction', async () => {
      const response = await app.request({
        method: 'POST',
        url: '/financial/transactions',
        accessToken: bound.accessToken,
        payload: {
          accountId,
          magnitude: { minorUnits: '2550', currency: 'QAR' },
          direction: 'MONEY_OUT',
          bookingDate: '2026-08-12',
          description: 'Conformance coffee',
        },
      });
      conforms('createOwnManualTransaction', 201, response);
      const transaction = body<{
        transactionId: string;
        amount: { minorUnits: string; currency: string; exponent: number };
        direction: string;
        bookingDate: string;
        sourceKind: string;
        availability: string;
      }>(response);
      transactionId = transaction.transactionId;
      // The server applied the canonical sign; the client never encoded one.
      expect(transaction.amount).toEqual({ minorUnits: '-2550', currency: 'QAR', exponent: 2 });
      expect(transaction.direction).toBe('MONEY_OUT');
      // A calendar day stayed a calendar day.
      expect(transaction.bookingDate).toBe('2026-08-12');
      expect(transaction.sourceKind).toBe('MANUAL');
      expect(transaction.availability).toBe('EXECUTABLE');
      // The exact integer travelled as characters, never as a JSON number.
      expect(response.raw).toContain('"minorUnits":"-2550"');
    });

    it('refuses a signed magnitude, and an instant with no zone', async () => {
      conforms(
        'createOwnManualTransaction',
        400,
        await app.request({
          method: 'POST',
          url: '/financial/transactions',
          accessToken: bound.accessToken,
          payload: {
            accountId,
            magnitude: { minorUnits: '-2550', currency: 'QAR' },
            direction: 'MONEY_OUT',
            bookingDate: '2026-08-12',
            description: 'Signed by the client',
          },
        }),
      );
      conforms(
        'createOwnManualTransaction',
        400,
        await app.request({
          method: 'POST',
          url: '/financial/transactions',
          accessToken: bound.accessToken,
          payload: {
            accountId,
            magnitude: { minorUnits: '100', currency: 'QAR' },
            direction: 'MONEY_IN',
            // An instant carrying a time, offered where a DAY is expected.
            bookingDate: '2026-08-12T00:00:00Z',
            description: 'A day that is an instant',
          },
        }),
      );
    });

    it('refuses a transaction against an account that is not the caller’s', async () => {
      conforms(
        'createOwnManualTransaction',
        404,
        await app.request({
          method: 'POST',
          url: '/financial/transactions',
          accessToken: bound.accessToken,
          payload: {
            accountId: randomUUID(),
            magnitude: { minorUnits: '100', currency: 'QAR' },
            direction: 'MONEY_IN',
            bookingDate: '2026-08-12',
            description: 'Somebody else’s account',
          },
        }),
      );
    });

    it('lists own transactions with a keyset page and every declared filter', async () => {
      conforms(
        'listOwnTransactions',
        200,
        await app.request({
          method: 'GET',
          url:
            `/financial/transactions?accountId=${accountId}&currency=QAR&direction=MONEY_OUT` +
            '&status=POSTED&sourceKind=MANUAL&bookedFrom=2026-08-01&bookedTo=2026-08-31&limit=10',
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'listOwnTransactions',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/transactions?cursor=%00%01%02',
          accessToken: bound.accessToken,
        }),
      );
    });

    it('reads one with its revision history, and reports source divergence', async () => {
      const response = await app.request({
        method: 'GET',
        url: `/financial/transactions/${transactionId}`,
        accessToken: bound.accessToken,
      });
      conforms('readOwnTransaction', 200, response);
      const view = body<{ revisions: unknown[]; divergesFromSource: boolean }>(response);
      expect(view.revisions).toHaveLength(1);
      expect(view.divergesFromSource).toBe(false);
      conforms(
        'readOwnTransaction',
        404,
        await app.request({
          method: 'GET',
          url: `/financial/transactions/${randomUUID()}`,
          accessToken: bound.accessToken,
        }),
      );
    });

    it('corrects one, appending a revision rather than overwriting', async () => {
      conforms(
        'correctOwnTransaction',
        200,
        await app.request({
          method: 'PATCH',
          url: `/financial/transactions/${transactionId}`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1, description: 'Corrected by its owner' },
        }),
      );
      const after = await app.request({
        method: 'GET',
        url: `/financial/transactions/${transactionId}`,
        accessToken: bound.accessToken,
      });
      expect(body<{ revisions: unknown[] }>(after).revisions).toHaveLength(2);
      conforms(
        'correctOwnTransaction',
        409,
        await app.request({
          method: 'PATCH',
          url: `/financial/transactions/${transactionId}`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1, description: 'Stale correction' },
        }),
      );
      // A half pair — a magnitude with no direction — is a client defect.
      conforms(
        'correctOwnTransaction',
        400,
        await app.request({
          method: 'PATCH',
          url: `/financial/transactions/${transactionId}`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 2, magnitude: { minorUnits: '10', currency: 'QAR' } },
        }),
      );
      conforms(
        'correctOwnTransaction',
        404,
        await app.request({
          method: 'PATCH',
          url: `/financial/transactions/${randomUUID()}`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1, description: 'Not mine' },
        }),
      );
    });

    it('assigns a category the person chose, and refuses an unknown code', async () => {
      const assigned = await app.request({
        method: 'PUT',
        url: `/financial/transactions/${transactionId}/category`,
        accessToken: bound.accessToken,
        payload: { categoryCode: CATEGORY },
      });
      conforms('assignOwnTransactionCategory', 200, assigned);
      const assignment = body<{ assignmentSource: string; ruleVersion: string | null }>(assigned);
      // USER, fixed by the route. A client cannot claim to be a rule.
      expect(assignment.assignmentSource).toBe('USER');
      expect(assignment.ruleVersion).toBeNull();
      conforms(
        'assignOwnTransactionCategory',
        404,
        await app.request({
          method: 'PUT',
          url: `/financial/transactions/${transactionId}/category`,
          accessToken: bound.accessToken,
          payload: { categoryCode: 'NO_SUCH_CATEGORY' },
        }),
      );
      conforms(
        'assignOwnTransactionCategory',
        400,
        await app.request({
          method: 'PUT',
          url: `/financial/transactions/${transactionId}/category`,
          accessToken: bound.accessToken,
          payload: { categoryCode: 'not a code' },
        }),
      );
    });

    it('lists the SAFE provenance, without the dedup fingerprint', async () => {
      const response = await app.request({
        method: 'GET',
        url: `/financial/transactions/${transactionId}/provenance`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnTransactionProvenance', 200, response);
      const page = body<{
        items: Array<{ versions: { fingerprintVersion: string }; importedFromStatement: boolean }>;
      }>(response);
      expect(page.items.length).toBeGreaterThan(0);
      // The ALGORITHM version, never a fingerprint; existence, never a handle.
      expect(page.items[0]?.versions.fingerprintVersion).toEqual(expect.any(String));
      expect(page.items[0]?.importedFromStatement).toBe(false);
      conforms(
        'listOwnTransactionProvenance',
        404,
        await app.request({
          method: 'GET',
          url: `/financial/transactions/${randomUUID()}/provenance`,
          accessToken: bound.accessToken,
        }),
      );
    });

    it('REFUSES a second identical record: the dedup identity is the refusal', async () => {
      // Same account, same magnitude, same direction, same day, same
      // description. The fingerprint is keyed and per-subject and never
      // crosses the wire; what crosses is the refusal it produces.
      const twice = {
        accountId: cardAccountId,
        magnitude: { minorUnits: '9900', currency: 'QAR' },
        direction: 'MONEY_OUT',
        bookingDate: '2026-08-11',
        description: 'Conformance duplicate probe',
      };
      const first = await app.request({
        method: 'POST',
        url: '/financial/transactions',
        accessToken: bound.accessToken,
        payload: twice,
      });
      conforms('createOwnManualTransaction', 201, first);
      conforms(
        'createOwnManualTransaction',
        409,
        await app.request({
          method: 'POST',
          url: '/financial/transactions',
          accessToken: bound.accessToken,
          payload: twice,
        }),
      );
    });

    it('refuses a malformed transaction id on every per-transaction route', async () => {
      for (const [operationId, method, url] of [
        ['readOwnTransaction', 'GET', '/financial/transactions/not-a-uuid'],
        ['deleteOwnTransaction', 'DELETE', '/financial/transactions/not-a-uuid'],
        ['listOwnTransactionProvenance', 'GET', '/financial/transactions/not-a-uuid/provenance'],
      ] as ReadonlyArray<readonly [string, 'GET' | 'DELETE', string]>) {
        conforms(
          operationId,
          400,
          await app.request({ method, url, accessToken: bound.accessToken }),
        );
      }
    });

    it('deletes one, taking the transfer matches that name it', async () => {
      const response = await app.request({
        method: 'DELETE',
        url: `/financial/transactions/${transactionId}`,
        accessToken: bound.accessToken,
      });
      conforms('deleteOwnTransaction', 200, response);
      expect(body<{ outcome: string }>(response).outcome).toBe('DELETED');
      conforms(
        'deleteOwnTransaction',
        404,
        await app.request({
          method: 'DELETE',
          url: `/financial/transactions/${transactionId}`,
          accessToken: bound.accessToken,
        }),
      );
    });
  });

  describe('transfer matches', () => {
    beforeAll(async () => {
      // Four real transactions, two equal-and-opposite pairs across two of the
      // caller's own accounts, and two SUGGESTED matches over them. The
      // suggestion is seeded rather than requested because
      // `SuggestTransferMatch` is deliberately not mounted: a client-driven
      // "match these two" would let a person assert a relationship the
      // equal-and-opposite rule refuses. What the DECISION routes do with a
      // real suggestion is exactly what is under test here, and without a
      // suggestion neither 200 nor the 409 that follows it exists at all.
      const pair = async (): Promise<[string, string]> => {
        const out = await createTransaction({
          accountId,
          magnitude: { minorUnits: '75000', currency: 'QAR' },
          direction: 'MONEY_OUT',
          bookingDate: '2026-08-16',
          description: `Moved to my other account ${randomUUID().slice(0, 8)}`,
        });
        const into = await createTransaction({
          accountId: twinAccountId,
          magnitude: { minorUnits: '75000', currency: 'QAR' },
          direction: 'MONEY_IN',
          bookingDate: '2026-08-16',
          description: `Arrived from my other account ${randomUUID().slice(0, 8)}`,
        });
        return [out, into];
      };
      const [outA, inA] = await pair();
      const [outB, inB] = await pair();
      confirmableMatchId = await seedTransferMatch(outA, accountId, inA, twinAccountId);
      rejectableMatchId = await seedTransferMatch(outB, accountId, inB, twinAccountId);
    }, 60_000);

    it('lists them, and refuses a state outside the vocabulary', async () => {
      const response = await app.request({
        method: 'GET',
        url: '/financial/transfer-matches?state=SUGGESTED',
        accessToken: bound.accessToken,
      });
      conforms('listOwnTransferMatches', 200, response);
      const page = body<{
        items: Array<{
          matchId: string;
          state: string;
          authoritative: boolean;
          subjectDecidedAt: string | null;
          suggestionBasis: string;
          suggestionWindow: string;
          outflow: { accountId: string; currency: string };
          inflow: { accountId: string; currency: string };
        }>;
      }>(response);
      expect(page.items.map((row) => row.matchId).sort()).toEqual(
        [confirmableMatchId, rejectableMatchId].sort(),
      );
      // A suggestion changes nothing until the person decides, and the wire
      // says so rather than leaving a client to work it out from the state.
      expect(page.items.every((row) => row.authoritative === false)).toBe(true);
      expect(page.items.every((row) => row.subjectDecidedAt === null)).toBe(true);
      expect(page.items.every((row) => row.outflow.accountId !== row.inflow.accountId)).toBe(true);
      expect(page.items.every((row) => row.outflow.currency === row.inflow.currency)).toBe(true);
      // A version label, never a bare number of hours.
      expect(page.items[0]?.suggestionWindow).toBe('equal-and-opposite/same-currency/P3D/v1');
      // No amount, no rate, no score: the sides name transactions and nothing
      // is copied here that could disagree with them.
      for (const absent of ['minorUnits', 'amount', 'confidence', 'score', 'rate']) {
        expect(response.raw).not.toContain(absent);
      }

      conforms(
        'listOwnTransferMatches',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/transfer-matches?state=MAYBE',
          accessToken: bound.accessToken,
        }),
      );
    });

    it('CONFIRMS one, and refuses the same decision a second time', async () => {
      const confirmed = await app.request({
        method: 'POST',
        url: `/financial/transfer-matches/${confirmableMatchId}/confirmation`,
        accessToken: bound.accessToken,
        payload: { expectedVersion: 1 },
      });
      conforms('confirmOwnTransferMatch', 200, confirmed);
      const view = body<{
        state: string;
        authoritative: boolean;
        subjectDecidedAt: string | null;
        version: number;
      }>(confirmed);
      expect(view.state).toBe('CONFIRMED');
      // The headline rule: only the person's confirmation makes a match
      // authoritative, and the instant they decided is on the row.
      expect(view.authoritative).toBe(true);
      expect(view.subjectDecidedAt).not.toBeNull();
      expect(view.version).toBe(2);

      // Re-confirming under the CURRENT version is deliberately idempotent:
      // it must not burn a version or rewrite the instant the person actually
      // decided. That is a 200 carrying the same row, and it is asserted here
      // so nobody later "fixes" it into a refusal.
      const again = await app.request({
        method: 'POST',
        url: `/financial/transfer-matches/${confirmableMatchId}/confirmation`,
        accessToken: bound.accessToken,
        payload: { expectedVersion: 2 },
      });
      conforms('confirmOwnTransferMatch', 200, again);
      expect(body<{ version: number; subjectDecidedAt: string }>(again).version).toBe(2);
      expect(body<{ subjectDecidedAt: string }>(again).subjectDecidedAt).toBe(
        view.subjectDecidedAt,
      );

      // A STALE version is the refusal: somebody else answered in between, and
      // overwriting their answer silently is the failure this token prevents.
      conforms(
        'confirmOwnTransferMatch',
        409,
        await app.request({
          method: 'POST',
          url: `/financial/transfer-matches/${confirmableMatchId}/confirmation`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1 },
        }),
      );
    });

    it('REJECTS one, and refuses to decide it again', async () => {
      const rejected = await app.request({
        method: 'POST',
        url: `/financial/transfer-matches/${rejectableMatchId}/rejection`,
        accessToken: bound.accessToken,
        payload: { expectedVersion: 1 },
      });
      conforms('rejectOwnTransferMatch', 200, rejected);
      const view = body<{ state: string; authoritative: boolean; subjectDecidedAt: string | null }>(
        rejected,
      );
      expect(view.state).toBe('REJECTED');
      // REJECTED is a decision, not an endorsement: it is not authoritative.
      expect(view.authoritative).toBe(false);
      expect(view.subjectDecidedAt).not.toBeNull();

      // REJECTED is TERMINAL: a person may change a confirmation into a
      // rejection, and may not change a rejection back. The refusal names the
      // rule rather than quietly re-deciding.
      conforms(
        'confirmOwnTransferMatch',
        409,
        await app.request({
          method: 'POST',
          url: `/financial/transfer-matches/${rejectableMatchId}/confirmation`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 2 },
        }),
      );
      // And the stale-token refusal on this route too.
      conforms(
        'rejectOwnTransferMatch',
        409,
        await app.request({
          method: 'POST',
          url: `/financial/transfer-matches/${rejectableMatchId}/rejection`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1 },
        }),
      );
    });

    it('answers 404 for a decision on a match that is not the caller’s', async () => {
      conforms(
        'confirmOwnTransferMatch',
        404,
        await app.request({
          method: 'POST',
          url: `/financial/transfer-matches/${randomUUID()}/confirmation`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1 },
        }),
      );
      conforms(
        'rejectOwnTransferMatch',
        404,
        await app.request({
          method: 'POST',
          url: `/financial/transfer-matches/${randomUUID()}/rejection`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1 },
        }),
      );
      conforms(
        'confirmOwnTransferMatch',
        400,
        await app.request({
          method: 'POST',
          url: `/financial/transfer-matches/${randomUUID()}/confirmation`,
          accessToken: bound.accessToken,
          payload: {},
        }),
      );
      conforms(
        'rejectOwnTransferMatch',
        400,
        await app.request({
          method: 'POST',
          url: '/financial/transfer-matches/not-a-uuid/rejection',
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1 },
        }),
      );
    });
  });

  describe('CSV statement ingestion', () => {
    const csv = [
      'date,description,amount',
      '2026-08-12,Conformance grocer,-25.50',
      '2026-08-13,Conformance salary,4000.00',
      '',
    ].join('\n');

    const mapping = {
      bookingDateColumn: 0,
      descriptionColumn: 1,
      amount: { kind: 'SIGNED', amountColumn: 2, signFrame: 'ACCOUNT_HOLDER' },
      statedCurrency: 'QAR',
      dateOrder: 'ISO',
      hasHeaderRow: true,
    };

    it('creates a draft import against one of the caller’s accounts', async () => {
      const response = await app.request({
        method: 'POST',
        url: '/financial/statement-imports',
        accessToken: bound.accessToken,
        payload: { accountId },
      });
      conforms('createOwnStatementImport', 201, response);
      const draft = body<{
        importId: string;
        state: string;
        version: number;
        hasStoredSource: boolean;
        rail: string;
        availability: string;
        retentionState: string;
      }>(response);
      importId = draft.importId;
      importVersion = draft.version;
      expect(draft.state).toBe('DRAFT');
      expect(draft.hasStoredSource).toBe(false);
      // A file the SUBJECT uploaded, on one of the two rails that run.
      expect(draft.rail).toBe('USER_FILE_UPLOAD');
      expect(draft.availability).toBe('EXECUTABLE');
      // The retention decision is resolved before a durable byte can exist.
      expect(draft.retentionState).toBe('DECIDED');
      conforms(
        'createOwnStatementImport',
        404,
        await app.request({
          method: 'POST',
          url: '/financial/statement-imports',
          accessToken: bound.accessToken,
          payload: { accountId: randomUUID() },
        }),
      );
      conforms(
        'createOwnStatementImport',
        400,
        await app.request({
          method: 'POST',
          url: '/financial/statement-imports',
          accessToken: bound.accessToken,
          payload: { accountId: 'not-a-uuid' },
        }),
      );
      // An ARCHIVED account is the caller's own, readable, and not writable —
      // a real state rather than an inflicted one.
      conforms(
        'createOwnStatementImport',
        409,
        await app.request({
          method: 'POST',
          url: '/financial/statement-imports',
          accessToken: bound.accessToken,
          payload: { accountId: archivedAccountId },
        }),
      );
    });

    it('REFUSES a body that is not text/csv', async () => {
      conforms(
        'uploadOwnStatementImportSource',
        415,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${importId}/source`,
          accessToken: bound.accessToken,
          payload: { pretending: 'to be a statement' },
        }),
      );
    });

    it('REFUSES a statement past the central byte bound, naming the bound', async () => {
      // The bound is the one in packages/platform/src/ingestion/limits.ts, and
      // the refusal names it so a person can act on it. Nothing is truncated
      // to fit: a statement cut short is a wrong record that looks right.
      const oversized = 'x'.repeat(CSV_LIMITS.maxBytes + 1);
      const response = await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${importId}/source`,
        accessToken: bound.accessToken,
        headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
        payload: oversized,
      });
      conforms('uploadOwnStatementImportSource', 413, response);
      expect(body<{ limitBytes: number }>(response).limitBytes).toBe(CSV_LIMITS.maxBytes);
    });

    it('stores the source, then parses it under a stated mapping', async () => {
      const uploaded = await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${importId}/source`,
        accessToken: bound.accessToken,
        headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
        payload: csv,
      });
      conforms('uploadOwnStatementImportSource', 200, uploaded);
      const stored = body<{ state: string; hasStoredSource: boolean; version: number }>(uploaded);
      expect(stored.state).toBe('SOURCE_STORED');
      expect(stored.hasStoredSource).toBe(true);
      importVersion = stored.version;
      // No locator, no key version, no nonce, no checksum crossed the wire.
      expect(uploaded.raw).not.toContain('objectRef');
      expect(uploaded.raw).not.toContain('keyVersion');
      expect(uploaded.raw).not.toContain('authTag');

      const parsed = await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${importId}/parse`,
        accessToken: bound.accessToken,
        payload: { mapping },
      });
      conforms('parseOwnStatementImportSource', 200, parsed);
      const review = body<{ state: string; counts: { rowCount: number }; version: number }>(parsed);
      expect(review.state).toBe('REVIEW_REQUIRED');
      expect(review.counts.rowCount).toBe(2);
      importVersion = review.version;
      // Nothing from the file came back.
      expect(parsed.raw).not.toContain('Conformance grocer');
    });

    it('refuses a mapping it cannot use, and a parse from the wrong state', async () => {
      conforms(
        'parseOwnStatementImportSource',
        400,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${importId}/parse`,
          accessToken: bound.accessToken,
          payload: { mapping: { ...mapping, bookingDateColumn: -1 } },
        }),
      );
      conforms(
        'parseOwnStatementImportSource',
        409,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${importId}/parse`,
          accessToken: bound.accessToken,
          payload: { mapping },
        }),
      );
      conforms(
        'parseOwnStatementImportSource',
        404,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${randomUUID()}/parse`,
          accessToken: bound.accessToken,
          payload: { mapping },
        }),
      );
    });

    it('reads the state, and pages the preview without echoing a single cell', async () => {
      const status = await app.request({
        method: 'GET',
        url: `/financial/statement-imports/${importId}`,
        accessToken: bound.accessToken,
      });
      conforms('readOwnStatementImport', 200, status);
      expect(body<{ awaitsDecision: boolean }>(status).awaitsDecision).toBe(true);

      const preview = await app.request({
        method: 'GET',
        url: `/financial/statement-imports/${importId}/preview?limit=5`,
        accessToken: bound.accessToken,
      });
      conforms('listOwnStatementImportPreview', 200, preview);
      const page = body<{ reportedErrorCount: number; totalErrorCount: number }>(preview);
      // Both counts travel: a truncated report can never read as a complete one.
      expect(page.reportedErrorCount).toBe(page.totalErrorCount);
      expect(preview.raw).not.toContain('Conformance grocer');
      expect(preview.raw).not.toContain('4000');

      conforms(
        'readOwnStatementImport',
        404,
        await app.request({
          method: 'GET',
          url: `/financial/statement-imports/${randomUUID()}`,
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'listOwnStatementImportPreview',
        404,
        await app.request({
          method: 'GET',
          url: `/financial/statement-imports/${randomUUID()}/preview`,
          accessToken: bound.accessToken,
        }),
      );
    });

    it('commits the reviewed import, once, and is idempotent on a retry', async () => {
      const committed = await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${importId}/commit`,
        accessToken: bound.accessToken,
        payload: { expectedVersion: importVersion },
      });
      conforms('commitOwnStatementImport', 200, committed);
      const receipt = body<{
        committedTransactionCount: number;
        alreadyCommitted: boolean;
        transactionIds: string[];
      }>(committed);
      expect(receipt.committedTransactionCount).toBe(2);
      expect(receipt.alreadyCommitted).toBe(false);
      expect(receipt.transactionIds).toHaveLength(2);

      // The records really exist, on the transactions surface, with the CSV
      // rail named and its availability stated.
      const listed = await app.request({
        method: 'GET',
        url: `/financial/transactions?accountId=${accountId}&sourceKind=CSV`,
        accessToken: bound.accessToken,
      });
      expect(listed.statusCode).toBe(200);
      expect(body<{ items: unknown[] }>(listed).items).toHaveLength(2);

      const retry = await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${importId}/commit`,
        accessToken: bound.accessToken,
        payload: { expectedVersion: importVersion },
      });
      expect(retry.statusCode).toBe(200);
      expect(body<{ alreadyCommitted: boolean }>(retry).alreadyCommitted).toBe(true);

      conforms(
        'commitOwnStatementImport',
        400,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${importId}/commit`,
          accessToken: bound.accessToken,
          payload: {},
        }),
      );
      conforms(
        'commitOwnStatementImport',
        404,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${randomUUID()}/commit`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: 1 },
        }),
      );
    });

    it('REFUSES to erase an import that produced transactions', async () => {
      // A domain rule, surfaced honestly rather than swallowed: an import
      // cannot move to ERASED while it still reports committed transactions.
      // The alternative — a 200 — would tell a person their statement is gone
      // when nothing was erased, and the records it produced are theirs.
      conforms(
        'eraseOwnStatementImport',
        409,
        await app.request({
          method: 'DELETE',
          url: `/financial/statement-imports/${importId}`,
          accessToken: bound.accessToken,
        }),
      );
      const survivors = await app.request({
        method: 'GET',
        url: `/financial/transactions?accountId=${accountId}&sourceKind=CSV`,
        accessToken: bound.accessToken,
      });
      expect(body<{ items: unknown[] }>(survivors).items).toHaveLength(2);
    });

    it('erases an import that produced nothing, and its stored source with it', async () => {
      const draft = await app.request({
        method: 'POST',
        url: '/financial/statement-imports',
        accessToken: bound.accessToken,
        payload: { accountId },
      });
      expect(draft.statusCode).toBe(201);
      const abandoned = body<{ importId: string }>(draft).importId;
      await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${abandoned}/source`,
        accessToken: bound.accessToken,
        headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
        payload: csv,
      });

      const erased = await app.request({
        method: 'DELETE',
        url: `/financial/statement-imports/${abandoned}`,
        accessToken: bound.accessToken,
      });
      conforms('eraseOwnStatementImport', 200, erased);
      expect(body<{ storedObjectDeleted: boolean }>(erased).storedObjectDeleted).toBe(true);

      conforms(
        'eraseOwnStatementImport',
        404,
        await app.request({
          method: 'DELETE',
          url: `/financial/statement-imports/${randomUUID()}`,
          accessToken: bound.accessToken,
        }),
      );
    });

    it('holds the upload to the ONE request media type the contract declares', () => {
      // The request side of the promise, read from the document rather than
      // restated here. This is the only Phase 5 route that takes bytes instead
      // of JSON, and a second declared media type would mean the parser and
      // the contract had drifted apart.
      expect(contract.operation('uploadOwnStatementImportSource').requestMediaTypes).toEqual([
        'text/csv',
      ]);
      expect(CSV_REQUEST_MEDIA_TYPE).toBe('text/csv');
      // Every other Phase 5 operation with a body takes JSON and only JSON.
      const others = contract
        .operations()
        .filter(
          (operation) =>
            operation.path.startsWith('/financial') &&
            operation.operationId !== 'uploadOwnStatementImportSource' &&
            operation.requestMediaTypes.length > 0,
        )
        .map((operation) => operation.requestMediaTypes.join(','));
      expect(new Set(others)).toEqual(new Set(['application/json']));
    });

    it('refuses a malformed import id on every statement route', async () => {
      conforms(
        'readOwnStatementImport',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/statement-imports/not-a-uuid',
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'listOwnStatementImportPreview',
        400,
        await app.request({
          method: 'GET',
          url: '/financial/statement-imports/not-a-uuid/preview',
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'eraseOwnStatementImport',
        400,
        await app.request({
          method: 'DELETE',
          url: '/financial/statement-imports/not-a-uuid',
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'uploadOwnStatementImportSource',
        400,
        await app.request({
          method: 'POST',
          url: '/financial/statement-imports/not-a-uuid/source',
          accessToken: bound.accessToken,
          headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
          payload: 'date,description,amount\n2026-08-12,x,-1.00\n',
        }),
      );
    });

    it('refuses an upload against an unknown import, and against a committed one', async () => {
      conforms(
        'uploadOwnStatementImportSource',
        404,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${randomUUID()}/source`,
          accessToken: bound.accessToken,
          headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
          payload: 'date,description,amount\n2026-08-12,x,-1.00\n',
        }),
      );
      // The import committed earlier in this file is past the state that
      // accepts bytes; replacing its source now would rewrite the provenance
      // of records that already exist.
      conforms(
        'uploadOwnStatementImportSource',
        409,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${importId}/source`,
          accessToken: bound.accessToken,
          headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
          payload: 'date,description,amount\n2026-08-12,x,-1.00\n',
        }),
      );
    });

    it('refuses a commit under a version the import has already moved past', async () => {
      // A FRESH import taken as far as review, then committed under a version
      // it has moved past. The already-committed import above answers 200 with
      // `alreadyCommitted: true` on a retry — deliberately, so a lost response
      // is not a second commit — so the version refusal has to be shown on an
      // import that has not been committed yet, or it is not shown at all.
      const draft = await app.request({
        method: 'POST',
        url: '/financial/statement-imports',
        accessToken: bound.accessToken,
        payload: { accountId: twinAccountId },
      });
      expect(draft.statusCode, draft.raw).toBe(201);
      const staleId = body<{ importId: string }>(draft).importId;
      const uploaded = await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${staleId}/source`,
        accessToken: bound.accessToken,
        headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
        // DIFFERENT BYTES ON PURPOSE. The upload fingerprints the file, and a
        // second import of identical bytes lands in DUPLICATE — a real and
        // useful state, and one that would leave nothing to commit here.
        payload: [
          'date,description,amount',
          '2026-08-20,Conformance stale-version row,-11.25',
          '',
        ].join('\n'),
      });
      expect(uploaded.statusCode, uploaded.raw).toBe(200);
      const parsed = await app.request({
        method: 'POST',
        url: `/financial/statement-imports/${staleId}/parse`,
        accessToken: bound.accessToken,
        payload: { mapping },
      });
      expect(parsed.statusCode, parsed.raw).toBe(200);
      const current = body<{ version: number }>(parsed).version;
      expect(current).toBeGreaterThan(1);
      conforms(
        'commitOwnStatementImport',
        409,
        await app.request({
          method: 'POST',
          url: `/financial/statement-imports/${staleId}/commit`,
          accessToken: bound.accessToken,
          payload: { expectedVersion: current - 1 },
        }),
      );
    });
  });

  describe('the validator, held against MUTATED Phase 5 bodies', () => {
    // THE NON-VACUOUSNESS PROBE. Everything above says the real responses
    // conform. That claim is worth exactly as much as the validator's ability
    // to say NO — a checker that accepts everything reports agreement it never
    // checked. So each mutation below takes a REAL body this suite already
    // validated, changes exactly one thing a client would be harmed by, and
    // requires the same `conforms` the rest of this file uses to refuse it.
    //
    // `conforms` records nothing on a refusal: the ledger entry is written
    // after validation, so a mutation that fails leaves both ledgers untouched.

    let account: Record<string, unknown>;
    let accountPage: Record<string, unknown>;
    let transaction: Record<string, unknown>;
    let problem: WireResponse;

    /** A real response with one mutated body, otherwise byte-for-byte itself. */
    function withBody(original: WireResponse, mutated: unknown): WireResponse {
      return {
        statusCode: original.statusCode,
        contentType: original.contentType,
        raw: JSON.stringify(mutated),
        body: mutated,
      };
    }

    let accountResponse: WireResponse;
    let accountPageResponse: WireResponse;
    let transactionResponse: WireResponse;

    beforeAll(async () => {
      accountResponse = await app.request({
        method: 'GET',
        url: `/financial/accounts/${accountId}`,
        accessToken: bound.accessToken,
      });
      accountPageResponse = await app.request({
        method: 'GET',
        url: '/financial/accounts',
        accessToken: bound.accessToken,
      });
      // A real transaction, read back with its revisions, so the money and the
      // calendar day below are the server's own bytes rather than a literal.
      const created = await createTransaction({
        accountId: twinAccountId,
        magnitude: { minorUnits: '31450', currency: 'QAR' },
        direction: 'MONEY_OUT',
        bookingDate: '2026-08-09',
        description: 'Conformance mutation subject',
      });
      transactionResponse = await app.request({
        method: 'GET',
        url: `/financial/transactions/${created}`,
        accessToken: bound.accessToken,
      });
      problem = await app.request({
        method: 'GET',
        url: `/financial/accounts/${randomUUID()}`,
        accessToken: bound.accessToken,
      });
      expect(accountResponse.statusCode).toBe(200);
      expect(accountPageResponse.statusCode).toBe(200);
      expect(transactionResponse.statusCode).toBe(200);
      expect(problem.statusCode).toBe(404);
      account = structuredClone(accountResponse.body) as Record<string, unknown>;
      accountPage = structuredClone(accountPageResponse.body) as Record<string, unknown>;
      transaction = structuredClone(transactionResponse.body) as Record<string, unknown>;
    }, 60_000);

    it('1. REFUSES a ciphertext, nonce, key version or storage locator on a body', () => {
      // The exact leak `additionalProperties: false` exists to stop. These are
      // real column names from the Phase 5 tables, not invented ones.
      for (const leak of [
        { displayNameCiphertext: 'ZGVhZGJlZWY=' },
        { displayNameNonce: '000000000000000000000000' },
        { hsfKeyVersion: 'karar-ref:key-version:local-accounts-hsf@v1' },
        { objectRef: 'store://karar-internal-bucket/statement/v1' },
        { sourceAccountFingerprint: 'conformance-fingerprint-CANARY' },
      ]) {
        const mutated = { ...account, ...leak };
        expect(
          () => conforms('readOwnFinancialAccount', 200, withBody(accountResponse, mutated)),
          `a body carrying ${Object.keys(leak).join()} was accepted`,
        ).toThrow();
      }
    });

    it('2. REFUSES money sent as a JSON number instead of an exact string', () => {
      // Mutated where the money actually lives: `readOwnTransaction` answers
      // an envelope, and the amount is on the transaction inside it. Mutating
      // the envelope would be refused by the closed shape instead, which would
      // prove the wrong thing.
      const withMinorUnits = (minorUnits: unknown): unknown => {
        const copy = structuredClone(transaction) as {
          transaction: { amount: Record<string, unknown> };
        };
        copy.transaction.amount['minorUnits'] = minorUnits;
        return copy;
      };
      // -31450 minor units, as the number a careless serializer would emit.
      expect(() =>
        conforms('readOwnTransaction', 200, withBody(transactionResponse, withMinorUnits(-31450))),
      ).toThrow();
      // A float is worse still, and is what a ledger value must never become.
      expect(() =>
        conforms('readOwnTransaction', 200, withBody(transactionResponse, withMinorUnits(-314.5))),
      ).toThrow();
      // And the subtler one: characters, but not an exact integer.
      expect(() =>
        conforms(
          'readOwnTransaction',
          200,
          withBody(transactionResponse, withMinorUnits('-314.50')),
        ),
      ).toThrow();
    });

    it('3. REFUSES a calendar day sent as a full date-time', () => {
      // ADR-0027: a day an institution wrote on its books is not a moment, and
      // typing it as one moves a line across a month boundary for a reader at
      // another offset. Truncating it here would silently decide the timezone,
      // which is exactly the decision the type exists to force somebody to
      // make — so the refusal is the only correct behaviour.
      const withBookingDate = (value: string): unknown => {
        const copy = structuredClone(transaction) as {
          transaction: Record<string, unknown>;
        };
        copy.transaction['bookingDate'] = value;
        return copy;
      };
      expect(() =>
        conforms(
          'readOwnTransaction',
          200,
          withBody(transactionResponse, withBookingDate('2026-08-09T00:00:00Z')),
        ),
      ).toThrow();
      // An offset does not rescue it either.
      expect(() =>
        conforms(
          'readOwnTransaction',
          200,
          withBody(transactionResponse, withBookingDate('2026-08-09T00:00:00+03:00')),
        ),
      ).toThrow();
      // A shape that matches YYYY-MM-DD but is not a date must go too.
      expect(() =>
        conforms(
          'readOwnTransaction',
          200,
          withBody(transactionResponse, withBookingDate('2026-02-30')),
        ),
      ).toThrow();
    });

    it('4. REFUSES a body with a required property removed', () => {
      for (const required of ['accountId', 'currency', 'link', 'version']) {
        const mutated = { ...account };
        delete mutated[required];
        expect(
          () => conforms('readOwnFinancialAccount', 200, withBody(accountResponse, mutated)),
          `a body missing '${required}' was accepted`,
        ).toThrow();
      }
      // Nested, and inside a list envelope: the walk has to reach there too.
      const page = structuredClone(accountPage) as { page: Record<string, unknown> };
      delete page.page['hasMore'];
      expect(() =>
        conforms('listOwnFinancialAccounts', 200, withBody(accountPageResponse, page)),
      ).toThrow();
    });

    it('5. REFUSES an undeclared property, at the top level and nested', () => {
      expect(() =>
        conforms(
          'readOwnFinancialAccount',
          200,
          withBody(accountResponse, { ...account, balance: '125000' }),
        ),
      ).toThrow();
      // Inside the closed `link` block, whose whole job is to stop a client
      // rendering a live issuer connection.
      const nested = structuredClone(account) as { link: Record<string, unknown> };
      nested.link['connected'] = true;
      expect(() =>
        conforms('readOwnFinancialAccount', 200, withBody(accountResponse, nested)),
      ).toThrow();
      // And inside an item of a list envelope.
      const page = structuredClone(accountPage) as { items: Array<Record<string, unknown>> };
      expect(page.items.length).toBeGreaterThan(0);
      (page.items[0] as Record<string, unknown>)['tenantId'] = TENANT;
      expect(() =>
        conforms('listOwnFinancialAccounts', 200, withBody(accountPageResponse, page)),
      ).toThrow();
    });

    it('6. REFUSES an enum value outside its declared set', () => {
      // A status vocabulary that grew a value meaning "connected" is the exact
      // false claim this contract closes its enums to prevent.
      const nested = structuredClone(account) as { link: Record<string, unknown> };
      nested.link['state'] = 'LINKED';
      expect(() =>
        conforms('readOwnFinancialAccount', 200, withBody(accountResponse, nested)),
      ).toThrow();
      expect(() =>
        conforms(
          'readOwnFinancialAccount',
          200,
          withBody(accountResponse, { ...account, origin: 'IMPORTED' }),
        ),
      ).toThrow();
      const direction = structuredClone(transaction) as {
        transaction: Record<string, unknown>;
      };
      direction.transaction['direction'] = 'SIDEWAYS';
      expect(() =>
        conforms('readOwnTransaction', 200, withBody(transactionResponse, direction)),
      ).toThrow();
      // A boolean pinned by enum is an enum too: `false` is the only member.
      const claimed = structuredClone(account) as { link: Record<string, unknown> };
      claimed.link['impliesLiveInstitutionLink'] = true;
      expect(() =>
        conforms('readOwnFinancialAccount', 200, withBody(accountResponse, claimed)),
      ).toThrow();
    });

    it('7. REFUSES a problem body served as application/json', () => {
      // The body is untouched and valid; only the media type moved. A generated
      // client that dispatches on Content-Type — the normal way to tell a
      // problem document from a payload — would read this as a payload.
      const asJson: WireResponse = {
        ...problem,
        contentType: 'application/json; charset=utf-8',
      };
      const deviation = mediaTypeDeviation('readOwnFinancialAccount', 404, asJson);
      expect(deviation).toBe('readOwnFinancialAccount 404 [application/json]');
      // The same media type the real response carried is NOT a deviation, so
      // the check is not simply answering yes.
      expect(mediaTypeDeviation('readOwnFinancialAccount', 404, problem)).toBeNull();
      // And a recorded deviation turns the ledger's own assertion red. This is
      // the function the ledger test below calls, not a copy of it.
      expect(() => assertNoMediaTypeDeviations(new Set([deviation!]))).toThrow();
      assertNoMediaTypeDeviations(new Set());
    });

    it('accepts the UNMUTATED bodies, so every refusal above is about the mutation', () => {
      // Without this, a validator that refused everything would pass all seven.
      conforms('readOwnFinancialAccount', 200, withBody(accountResponse, account));
      conforms('listOwnFinancialAccounts', 200, withBody(accountPageResponse, accountPage));
      conforms('readOwnTransaction', 200, withBody(transactionResponse, transaction));
      conforms('readOwnFinancialAccount', 404, problem);
    });
  });

  /**
   * The 429 on every mounted operation, covered for real against the live
   * distributed limiter.
   *
   * ONE operation per policy group is driven past its declared budget on the
   * suite's own bound caller — six budgets, six refusals, against the real
   * Redis-backed limiter and the real policy numbers. No budget is raised, no
   * policy is disabled and no subject key is varied to make this pass.
   *
   * It is declared LAST on purpose: exhausting a budget is destructive to the
   * principal that spends it, so everything that needs headroom has already
   * run. Only the ledger follows, and the ledger issues no requests.
   *
   * The remaining 21 pairs are recorded in EXPECTED_UNCOVERED rather than
   * asserted here: they share these six policies and this exact refusal
   * document, the shape is proved through the real router in
   * apps/api/src/financial/rate-limit-gate.test.ts, and the coverage guarantee
   * that matters -- that no mounted operation lacks a budget at all -- is
   * proved structurally from route metadata in rate-limit-mounting.test.ts.
   */
  describe('rate limiting', () => {
    /** Issues `count` requests and returns the last response. */
    async function spend(
      count: number,
      request: () => Promise<WireResponse>,
    ): Promise<WireResponse> {
      let last: WireResponse | null = null;
      for (let i = 0; i < count; i += 1) last = await request();
      if (last === null) throw new Error('no request issued');
      return last;
    }

    it('refuses an ordinary read past its budget', async () => {
      const read = () =>
        app.request({
          method: 'GET',
          url: '/financial/accounts',
          accessToken: bound.accessToken,
        });
      const refused = await spend(RATE_LIMIT_POLICIES.financialRead.limit + 1, read);
      conforms('listOwnFinancialAccounts', 429, refused);
      // 301 sequential round trips. Vitest's default per-test budget is 5s,
      // which this clears alone and does not clear under full-suite worker
      // load -- it failed 3 of 10 runs, and 2 of 2 for an independent
      // reviewer. The BUDGET is what was wrong, not the assertion: exhausting
      // a 300-request window costs 300 requests, and no limit was raised to
      // make it fit.
    }, 120_000);

    it('refuses an ordinary write past its budget', async () => {
      const write = () =>
        app.request({
          method: 'POST',
          url: '/financial/transactions',
          accessToken: bound.accessToken,
          payload: {},
        });
      const refused = await spend(RATE_LIMIT_POLICIES.financialWrite.limit + 1, write);
      conforms('createOwnManualTransaction', 429, refused);
    }, 120_000);

    it('refuses a statement upload past its budget', async () => {
      const upload = () =>
        app.request({
          method: 'POST',
          url: `/financial/statement-imports/${randomUUID()}/source`,
          accessToken: bound.accessToken,
          headers: { 'content-type': CSV_REQUEST_MEDIA_TYPE },
          payload: 'date,amount\n2026-01-01,100\n',
        });
      const refused = await spend(RATE_LIMIT_POLICIES.financialStatementUpload.limit + 1, upload);
      conforms('uploadOwnStatementImportSource', 429, refused);
    }, 120_000);

    it('refuses a parse past its budget', async () => {
      const parse = () =>
        app.request({
          method: 'POST',
          url: `/financial/statement-imports/${randomUUID()}/parse`,
          accessToken: bound.accessToken,
          payload: {},
        });
      const refused = await spend(RATE_LIMIT_POLICIES.financialStatementParse.limit + 1, parse);
      conforms('parseOwnStatementImportSource', 429, refused);
    }, 120_000);

    it('refuses a commit past its budget', async () => {
      const commit = () =>
        app.request({
          method: 'POST',
          url: `/financial/statement-imports/${randomUUID()}/commit`,
          accessToken: bound.accessToken,
          payload: {},
        });
      const refused = await spend(RATE_LIMIT_POLICIES.financialCommit.limit + 1, commit);
      conforms('commitOwnStatementImport', 429, refused);
    }, 120_000);

    it('refuses a transfer decision past its budget', async () => {
      const decide = () =>
        app.request({
          method: 'POST',
          url: `/financial/transfer-matches/${randomUUID()}/confirmation`,
          accessToken: bound.accessToken,
          payload: {},
        });
      const refused = await spend(RATE_LIMIT_POLICIES.financialTransferDecision.limit + 1, decide);
      conforms('confirmOwnTransferMatch', 429, refused);
    }, 120_000);
  });

  describe('the ledger', () => {
    it('validated exactly the operations and statuses this suite claims to cover', () => {
      // The guard against the worst failure mode in this file: a suite that
      // stopped exercising something still prints green.
      expect([...validated].sort()).toEqual(EXPECTED_VALIDATED);
    });

    it('names every declared pair it does NOT reach, and why', () => {
      // The other half of the honesty. A pair missing from BOTH ledgers would
      // be a silent hole; the partition assertion below makes that impossible,
      // and this one makes the reasons reviewable rather than implied.
      expect([...uncovered.entries()].sort(([a], [b]) => a.localeCompare(b))).toEqual(
        EXPECTED_UNCOVERED,
      );
    });

    it('PARTITIONS the contract: every declared Phase 5 pair is in exactly one ledger', () => {
      const declared = declaredPhase5Pairs();
      const covered = [...validated].sort();
      const missed = [...uncovered.keys()].sort();
      // Nothing may be in both.
      expect(covered.filter((pair) => uncovered.has(pair))).toEqual([]);
      // And nothing may be in neither — including a status somebody adds to
      // the contract tomorrow, which lands here rather than nowhere.
      expect([...covered, ...missed].sort()).toEqual(declared);
      // Stated as counts too, because a reader wants the headline figure.
      expect(covered.length + missed.length).toBe(declared.length);
      expect(covered).toHaveLength(145);
      expect(declared).toHaveLength(199);
    });

    it('served EVERY problem body as the declared problem media type', () => {
      assertNoMediaTypeDeviations(observedDeviations);
    });
  });
});
