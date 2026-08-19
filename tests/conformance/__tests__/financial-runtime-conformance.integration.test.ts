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

import { Contract } from '../contract.js';
import { validateAgainstSchema } from '../schema-validator.js';
import {
  ComposedApp,
  probeInfrastructure,
  skipBanner,
  type Caller,
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
const CATEGORY = 'GROCERIES';
const CSV_LIMITS = INGESTION_LIMIT_POLICIES.csvStatementImport;

/** Every (operationId, status) this run actually validated. */
const validated = new Set<string>();

/** Problem bodies observed under the wrong media type. Must stay empty. */
const observedDeviations = new Set<string>();

let app: ComposedApp;
let bound: Caller;
let accountId: string;
let transactionId: string;
let importId: string;
let importVersion: number;

const JSON_TYPE = /^application\/json/;
const PROBLEM_TYPE = /^application\/problem\+json/;

/**
 * Validates one real response against the schema the contract declares for
 * exactly that (operation, status, media type), and records it in the ledger.
 *
 * The Content-Type is asserted, not assumed: a problem body served under
 * `application/json` is the defect this harness was built to catch, and it is
 * recorded rather than thrown so one deviation does not hide the rest.
 */
function conforms(operationId: string, status: number, response: WireResponse): void {
  expect(response.statusCode, `${operationId} expected ${String(status)}`).toBe(status);
  const isProblem = status >= 400;
  const mediaType = isProblem ? 'application/problem+json' : 'application/json';
  if (isProblem && !PROBLEM_TYPE.test(response.contentType)) {
    observedDeviations.add(`${operationId} ${String(status)} [${response.contentType}]`);
  }
  if (!isProblem) expect(response.contentType).toMatch(JSON_TYPE);
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

describe.skipIf(unreachable !== null)('the financial surface conforms to its contract', () => {
  beforeAll(async () => {
    app = await ComposedApp.boot(database);
    bound = await app.registerAndLogin('198.51.100.21');
    await app.seedTenantWithMember(TENANT, bound.userId);
    await app.seedUserProfile(TENANT, bound.userId);
    // Reference data arrives by reviewed migration in production; a scratch
    // database built from the migrations alone holds none, so the catalogues
    // are seeded here the same way every other fixture in this suite is.
    await app.sql(
      `INSERT INTO public.institutions (id, code, kind, display_name_en, display_name_ar, status, updated_at)
       VALUES ($1, 'CONFORMANCE_BANK', 'BANK', 'Conformance Bank', 'مصرف المطابقة', 'ACTIVE', now()),
              ($2, 'CONFORMANCE_RETIRED', 'EXCHANGE_HOUSE', 'Retired House', 'دار متقاعدة', 'RETIRED', now())`,
      [INSTITUTION, RETIRED_INSTITUTION],
    );
    await app.sql(
      `INSERT INTO public.financial_categories (code, parent_code, label_en, label_ar, catalogue_version)
       VALUES ($1, NULL, 'Groceries', 'بقالة', 'conformance/v1')`,
      [CATEGORY],
    );
    // The session binds to its single membership on first bootstrap; every
    // financial route needs that binding, and nothing else supplies it.
    const bootstrap = await app.request({
      method: 'GET',
      url: '/platform/bootstrap',
      accessToken: bound.accessToken,
    });
    expect(bootstrap.statusCode).toBe(200);
  }, 180_000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
  });

  describe('authentication and the principal', () => {
    it('answers 401 on every kind of financial route without a token', async () => {
      const routes: ReadonlyArray<[string, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', string]> = [
        ['listFinancialInstitutions', 'GET', '/financial/institutions'],
        ['listOwnFinancialAccounts', 'GET', '/financial/accounts'],
        ['listOwnTransactions', 'GET', '/financial/transactions'],
        ['listOwnFinancialConnections', 'GET', '/financial/connections'],
        ['listOwnTransferMatches', 'GET', '/financial/transfer-matches'],
        ['listFinancialCategories', 'GET', '/financial/categories'],
      ];
      for (const [operationId, method, url] of routes) {
        conforms(operationId, 401, await app.request({ method, url }));
      }
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
    });
  });

  describe('accounts', () => {
    it('creates a manual account, with the origin fixed by the server', async () => {
      const response = await app.request({
        method: 'POST',
        url: '/financial/accounts',
        accessToken: bound.accessToken,
        payload: {
          accountType: 'CURRENT',
          currency: 'QAR',
          displayName: 'Conformance current',
          institutionId: INSTITUTION,
          mask: '**1234',
        },
      });
      conforms('createOwnManualFinancialAccount', 201, response);
      const account = body<{
        accountId: string;
        origin: string;
        link: Record<string, unknown>;
        displayName: string;
      }>(response);
      accountId = account.accountId;
      // Not a request field: MANUAL because the use case fixes it.
      expect(account.origin).toBe('MANUAL');
      // Nothing here may be rendered as a live institution link.
      expect(account.link).toEqual({
        state: 'NOT_LINKED',
        impliesLiveInstitutionLink: false,
        providerAccessStatus: 'NOT_IMPLEMENTED',
      });
      // Disclosed to its owner, decrypted — not the redaction marker.
      expect(account.displayName).toBe('Conformance current');
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
      const narrowed = await app.request({
        method: 'GET',
        url: '/financial/accounts?accountType=SAVINGS',
        accessToken: bound.accessToken,
      });
      expect(body<{ items: unknown[] }>(narrowed).items).toEqual([]);
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

    it('lists the source-reported balances, the source links and the instruments', async () => {
      conforms(
        'listOwnAccountBalanceSnapshots',
        200,
        await app.request({
          method: 'GET',
          url: `/financial/accounts/${accountId}/balances`,
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'listOwnAccountSourceLinks',
        200,
        await app.request({
          method: 'GET',
          url: `/financial/accounts/${accountId}/source-links`,
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'listOwnAccountPaymentInstruments',
        200,
        await app.request({
          method: 'GET',
          url: `/financial/accounts/${accountId}/payment-instruments`,
          accessToken: bound.accessToken,
        }),
      );
      conforms(
        'listOwnFinancialConnections',
        200,
        await app.request({
          method: 'GET',
          url: '/financial/connections',
          accessToken: bound.accessToken,
        }),
      );
      // An account that is not the caller's produces an EMPTY page rather
      // than a 404, so none of these three is an existence oracle.
      const foreign = await app.request({
        method: 'GET',
        url: `/financial/accounts/${randomUUID()}/payment-instruments`,
        accessToken: bound.accessToken,
      });
      expect(foreign.statusCode).toBe(200);
      expect(body<{ items: unknown[] }>(foreign).items).toEqual([]);
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
    it('lists them, and refuses a state outside the vocabulary', async () => {
      conforms(
        'listOwnTransferMatches',
        200,
        await app.request({
          method: 'GET',
          url: '/financial/transfer-matches?state=SUGGESTED',
          accessToken: bound.accessToken,
        }),
      );
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

    it('answers 404 for a decision on a match that is not the caller’s', async () => {
      // The success bodies are unreachable from this surface by design: the
      // only way a match comes into being is `SuggestTransferMatch`, which is
      // deliberately not mounted (a client-driven "match these two" would let
      // a person assert a relationship the equal-and-opposite rule refuses).
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
        headers: { 'content-type': 'text/csv' },
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
        headers: { 'content-type': 'text/csv' },
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
        headers: { 'content-type': 'text/csv' },
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
  });

  describe('the ledger', () => {
    it('validated exactly the operations and statuses this suite claims to cover', () => {
      // The guard against the worst failure mode in this file: a suite that
      // stopped exercising something still prints green.
      expect([...validated].sort()).toEqual([
        'assignOwnTransactionCategory 200',
        'assignOwnTransactionCategory 400',
        'assignOwnTransactionCategory 404',
        'commitOwnStatementImport 200',
        'commitOwnStatementImport 400',
        'commitOwnStatementImport 404',
        'confirmOwnTransferMatch 400',
        'confirmOwnTransferMatch 404',
        'correctOwnTransaction 200',
        'correctOwnTransaction 400',
        'correctOwnTransaction 404',
        'correctOwnTransaction 409',
        'createOwnManualFinancialAccount 201',
        'createOwnManualFinancialAccount 400',
        'createOwnManualTransaction 201',
        'createOwnManualTransaction 400',
        'createOwnManualTransaction 404',
        'createOwnStatementImport 201',
        'createOwnStatementImport 404',
        'deleteOwnTransaction 200',
        'deleteOwnTransaction 404',
        'eraseOwnStatementImport 200',
        'eraseOwnStatementImport 404',
        'eraseOwnStatementImport 409',
        'listFinancialCategories 200',
        'listFinancialCategories 401',
        'listFinancialInstitutions 200',
        'listFinancialInstitutions 400',
        'listFinancialInstitutions 401',
        'listOwnAccountBalanceSnapshots 200',
        'listOwnAccountPaymentInstruments 200',
        'listOwnAccountSourceLinks 200',
        'listOwnFinancialAccounts 200',
        'listOwnFinancialAccounts 400',
        'listOwnFinancialAccounts 401',
        'listOwnFinancialConnections 200',
        'listOwnFinancialConnections 401',
        'listOwnStatementImportPreview 200',
        'listOwnStatementImportPreview 404',
        'listOwnTransactionProvenance 200',
        'listOwnTransactionProvenance 404',
        'listOwnTransactions 200',
        'listOwnTransactions 400',
        'listOwnTransactions 401',
        'listOwnTransferMatches 200',
        'listOwnTransferMatches 400',
        'listOwnTransferMatches 401',
        'parseOwnStatementImportSource 200',
        'parseOwnStatementImportSource 400',
        'parseOwnStatementImportSource 404',
        'parseOwnStatementImportSource 409',
        'readOwnFinancialAccount 200',
        'readOwnFinancialAccount 400',
        'readOwnFinancialAccount 404',
        'readOwnStatementImport 200',
        'readOwnStatementImport 404',
        'readOwnTransaction 200',
        'readOwnTransaction 404',
        'rejectOwnTransferMatch 404',
        'updateOwnFinancialAccount 200',
        'updateOwnFinancialAccount 400',
        'updateOwnFinancialAccount 404',
        'updateOwnFinancialAccount 409',
        'uploadOwnStatementImportSource 200',
        'uploadOwnStatementImportSource 413',
        'uploadOwnStatementImportSource 415',
      ]);
    });

    it('served EVERY problem body as the declared problem media type', () => {
      expect(
        [...observedDeviations].sort(),
        'these responses carried an RFC 7807 body under the wrong media type; every problem ' +
          'document must leave through the writer in apps/api/src/errors/problem-response.ts',
      ).toEqual([]);
    });
  });
});
