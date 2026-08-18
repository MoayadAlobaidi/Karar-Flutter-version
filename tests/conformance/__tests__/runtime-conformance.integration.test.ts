/**
 * REAL responses from the composed application, held against the OpenAPI
 * document that describes them.
 *
 * THE GAP THIS CLOSES. `dart run tool/generate_api_client.dart --check` binds
 * the CONTRACT to the generated Dart client. Nothing bound the SERVER to the
 * contract. The contract declares `additionalProperties: false` in several
 * places — including on `effectiveVersion`, the object whose closure is the
 * only written reason `storageRef` does not ship to every subject — and until
 * this suite existed those declarations were enforced against nobody. A
 * handler that added a field would satisfy the drift check, the type checker,
 * the lint rules, and every module test.
 *
 * WHAT IS REAL HERE: the composition root (`composePhase3Modules`), the
 * modules it mounts, the guards, the global exception filter, the Fastify
 * serializer, live PostgreSQL, live Redis. Requests go in as HTTP; what is
 * validated is the status, the Content-Type, and the bytes that came back.
 *
 * WHAT IS NOT COVERED, stated plainly rather than implied away:
 *   * the 17 /auth operations — the identity fragment declares response
 *     bodies in prose and attaches no schema, so there is nothing to bind
 *     them to (asserted in contract.test.ts, so the day schemas arrive this
 *     omission is a failing test);
 *   * `recordOwnConsentAcceptance` 201 and `withdrawOwnConsent` 200 — Phase
 *     3.5 refuses acceptance until policy provenance resolves, by design, so
 *     no grant exists to withdraw and neither success body is reachable;
 *   * every 503 — reaching one means breaking a live dependency mid-suite,
 *     which would race every other test in this file;
 *   * `listTenantMembers` 200, `createTenantInvitation` 201,
 *     `revokeTenantInvitation` 200 — these need seeded RBAC grants; the
 *     denial shapes are covered instead;
 *   * `redeemTenantInvitation` 200 and 409 — a real redemption needs an
 *     invitation created through the permission-gated route above.
 * The covered set is asserted explicitly at the end of this file: a suite
 * that quietly stopped exercising an operation fails there.
 *
 * ALL THREE response-side `additionalProperties: false` sites in the contract
 * ARE covered, on real bodies: `effectiveVersion` in the consent listing,
 * `DeclarableJurisdictionReference`, and the whole body of the consent
 * document-content 200.
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
const database = `karar_test_${String(process.pid)}_conformance`;

/** Patterned and synthetic; nothing here resembles a production identifier. */
const TENANT_ONE = 'c0f0aaaa-0000-4000-8000-00000000c001';
const TENANT_TWO = 'c0f0bbbb-0000-4000-8000-00000000c002';
const TENANT_NOT_MINE = 'c0f0cccc-0000-4000-8000-00000000c003';
const ENTITY_ID = 'c0f0dddd-0000-4000-8000-00000000c004';
const DOCUMENT_ID = 'c0f0eeee-0000-4000-8000-00000000c005';
const VERSION_ID = 'c0f0ffff-0000-4000-8000-00000000c006';
/** The second document, the one whose text the LOCAL content source serves. */
const RETRIEVABLE_DOCUMENT_ID = 'c0f01111-0000-4000-8000-00000000c007';
const RETRIEVABLE_VERSION_ID = 'c0f02222-0000-4000-8000-00000000c008';
const JURISDICTION_REF = 'QA';
const PURPOSE_REF = 'purpose:ai-processing';
const RETRIEVABLE_PURPOSE_REF = 'purpose:service-terms';
/**
 * The internal locator, chosen to be unmistakable in a serialized body. If any
 * fragment of it ever crosses the wire, the assertions name exactly what
 * escaped — and `effectiveVersion`'s `additionalProperties: false` is what
 * stops it.
 */
const STORAGE_REF = 'store://karar-internal-bucket/conformance-canary/v1';
const CONTENT_HASH = 'c'.repeat(64);

/**
 * Every (operationId, status) this run actually validated. The suite asserts
 * the exact set at the end: a green run that stopped exercising something is
 * indistinguishable from a green run that did — unless the ledger says so.
 */
const validated = new Set<string>();

/**
 * KNOWN NON-CONFORMANCE — found by this suite, reported rather than fixed
 * (the handlers are outside this suite's remit).
 *
 * THE DEFECT. The contract declares every failure body as
 * `application/problem+json` (RFC 7807). Only `GlobalExceptionFilter` sets
 * that header, and it only runs for THROWN failures. Every module that
 * answers through Fastify's reply object directly — tenancy, users,
 * bootstrap, jurisdiction, and the consent CONTENT route — sends its problem
 * body with Fastify's default `application/json`, because no module sets the
 * header (`grep -rn 'problem+json' modules/` finds nothing outside tests).
 * The BODY is a problem document; the media type says it is not one. A
 * generated client that dispatches on Content-Type — the normal way to tell
 * a problem document from a payload — sees a plain JSON body on the failure
 * path and a problem document on the /consent/documents failure path, from
 * the same API. The two error models are visible side by side in one run:
 *
 *   GET /consent/documents           401 [application/problem+json]
 *     {"type":"urn:karar:error:AUTHENTICATION_REQUIRED", ... ,"instance":"/consent/documents"}
 *   GET /tenancy/tenant              401 [application/json]
 *     {"type":"about:blank","title":"Authentication required","status":401, ...}
 *
 * Each entry below is validated ANYWAY against the declared
 * `application/problem+json` schema, so the body shape is still held to the
 * contract — only the media type is excused. The set is asserted exactly: a
 * fix turns the ledger test red (delete the entry), and a NEW route that
 * starts mislabelling turns it red too.
 */
const PROBLEM_MEDIA_TYPE_DEVIATIONS: ReadonlySet<string> = new Set([
  'createTenantInvitation 403',
  'declareOwnJurisdiction 400',
  'declareOwnJurisdiction 401',
  'declareOwnJurisdiction 409',
  'getOwnTenant 401',
  'getOwnUserProfile 401',
  'getOwnUserProfile 404',
  'getPlatformBootstrap 401',
  'listDeclarableJurisdictionReferences 401',
  'listOwnTenantMemberships 401',
  'listTenantMembers 401',
  'listTenantMembers 403',
  'readConsentDocumentContent 404',
  'readConsentDocumentContent 409',
  'redeemTenantInvitation 401',
  'redeemTenantInvitation 404',
  'requestOwnAccountDisable 401',
  'requestOwnAccountDisable 404',
  'requestOwnAccountDisable 409',
  'revokeTenantInvitation 403',
  'setPlatformTenantBinding 400',
  'setPlatformTenantBinding 401',
  'setPlatformTenantBinding 403',
  'updateOwnUserProfile 400',
  'updateOwnUserProfile 401',
]);

/** Deviations this run actually observed, compared against the ledger below. */
const observedDeviations = new Set<string>();

let app: ComposedApp;
/** Bound to TENANT_ONE by bootstrap auto-binding; has a profile. */
let bound: Caller;
/** No membership anywhere: the session stays UNBOUND. */
let unbound: Caller;
/** Bound, but with no profile row — the 404 shapes. */
let profileless: Caller;
/** Two memberships: TENANT_SELECTION_REQUIRED, then an explicit bind/switch. */
let chooser: Caller;
/** Bound, kept aside for the jurisdiction write so it disturbs nobody. */
let declarer: Caller;

/** The media type alone, without the charset Fastify appends. */
function mediaTypeOf(response: WireResponse): string {
  return (response.contentType.split(';')[0] ?? '').trim();
}

/**
 * The assertion the whole suite is built on: this real response conforms to
 * the schema the contract declares for this operation, status, and media type.
 *
 * A status the contract does not declare is a failure — a client generated
 * from this document has no branch for it. A declared status carrying no
 * schema is recorded honestly as covered-without-schema: the contract
 * describes it in prose only, and pretending otherwise would inflate the
 * ledger with checks nobody performed.
 */
function expectConforms(operationId: string, response: WireResponse): void {
  const status = String(response.statusCode);
  const operation = contract.operation(operationId);
  const declared = operation.responses.get(status);
  expect(
    declared,
    `${operationId} answered ${status}; the contract declares only ${[...operation.responses.keys()].join(', ')}`,
  ).toBeDefined();
  const key = `${operationId} ${status}`;
  validated.add(key);
  if (declared === undefined || declared.schemas.size === 0) return;

  const mediaType = mediaTypeOf(response);
  let schema = declared.schemas.get(mediaType);
  if (schema === undefined) {
    // The one excused mismatch, and only where the ledger already records it:
    // a problem BODY served as application/json. The body is still validated
    // against the declared problem schema — the media type is what deviates.
    const asProblem = declared.schemas.get('application/problem+json');
    if (mediaType === 'application/json' && asProblem !== undefined) {
      expect(
        PROBLEM_MEDIA_TYPE_DEVIATIONS.has(key),
        `${key} answered Content-Type 'application/json' where the contract declares ` +
          `application/problem+json, and it is NOT in the known-deviation ledger. ` +
          `Either the handler regressed or the ledger needs an entry with a reason.`,
      ).toBe(true);
      observedDeviations.add(key);
      schema = asProblem;
    }
  }
  expect(
    schema,
    `${key} answered Content-Type '${mediaType}'; the contract declares ${[...declared.schemas.keys()].join(', ')}`,
  ).toBeDefined();
  if (schema === undefined) return;

  const violations = validateAgainstSchema(schema, response.body, contract.resolve);
  expect(
    violations.map(
      (violation) => `${violation.path === '' ? '<body>' : violation.path}: ${violation.message}`,
    ),
    `${operationId} ${status} does not conform`,
  ).toEqual([]);
}

/** Re-validates a MUTATED copy of a real body — the non-vacuousness probe. */
function violationsForMutated(
  operationId: string,
  status: number,
  mediaType: string,
  body: unknown,
): string[] {
  const schema = contract.responseSchema(operationId, status, mediaType);
  expect(schema, `no schema for ${operationId} ${String(status)} ${mediaType}`).not.toBeNull();
  return validateAgainstSchema(schema!, body, contract.resolve).map(
    (violation) => `${violation.path}: ${violation.message}`,
  );
}

describe.skipIf(unreachable !== null)(
  'runtime conformance (composed app, live infrastructure)',
  () => {
    beforeAll(async () => {
      app = await ComposedApp.boot(database);

      bound = await app.registerAndLogin();
      await app.seedTenantWithMember(TENANT_ONE, bound.userId);
      await app.seedUserProfile(TENANT_ONE, bound.userId);

      unbound = await app.registerAndLogin();

      profileless = await app.registerAndLogin();
      await app.seedTenantWithMember(TENANT_ONE, profileless.userId);

      chooser = await app.registerAndLogin();
      await app.seedTenantWithMember(TENANT_ONE, chooser.userId);
      await app.seedTenantWithMember(TENANT_TWO, chooser.userId);

      declarer = await app.registerAndLogin();
      await app.seedTenantWithMember(TENANT_ONE, declarer.userId);

      await app.seedConsentCatalogue({
        tenantId: TENANT_ONE,
        entityId: ENTITY_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        jurisdictionRef: JURISDICTION_REF,
        purposeRef: PURPOSE_REF,
        storageRef: STORAGE_REF,
        contentHash: CONTENT_HASH,
      });
      await app.seedRetrievableDocument({
        entityId: ENTITY_ID,
        documentId: RETRIEVABLE_DOCUMENT_ID,
        versionId: RETRIEVABLE_VERSION_ID,
        jurisdictionRef: JURISDICTION_REF,
        purposeRef: RETRIEVABLE_PURPOSE_REF,
      });

      // Auto-bind the sessions that need a tenant. This is the documented side
      // effect of the bootstrap GET, and using it rather than SQL keeps the
      // binding the server's own.
      for (const caller of [bound, profileless, declarer]) {
        const bootstrap = await app.request({
          method: 'GET',
          url: '/platform/bootstrap',
          accessToken: caller.accessToken,
        });
        const binding = (bootstrap.body as { binding?: { kind?: string } }).binding;
        expect(binding?.kind, 'the fixture session must end up BOUND').toBe('BOUND');
      }
    }, 180_000);

    afterAll(async () => {
      await app?.close();
    }, 60_000);

    describe('platform bootstrap surface', () => {
      it('GET /platform/bootstrap conforms when bound, unbound, and selection-required', async () => {
        const asBound = await app.request({
          method: 'GET',
          url: '/platform/bootstrap',
          accessToken: bound.accessToken,
        });
        expect(asBound.statusCode).toBe(200);
        expectConforms('getPlatformBootstrap', asBound);
        // Non-vacuous: the body really carries the sections the schema requires,
        // so "it conformed" is not "it was empty".
        expect((asBound.body as { binding: { kind: string } }).binding.kind).toBe('BOUND');
        expect((asBound.body as { capabilities: { state: string } }).capabilities.state).toBe(
          'RESOLVED',
        );

        const asUnbound = await app.request({
          method: 'GET',
          url: '/platform/bootstrap',
          accessToken: unbound.accessToken,
        });
        expectConforms('getPlatformBootstrap', asUnbound);
        expect((asUnbound.body as { binding: { kind: string } }).binding.kind).toBe('UNBOUND');

        // Three memberships-shaped states, three different oneOf branches of
        // BindingState — a validator that only ever saw one branch would prove
        // little about the others.
        const asChooser = await app.request({
          method: 'GET',
          url: '/platform/bootstrap',
          accessToken: chooser.accessToken,
        });
        expectConforms('getPlatformBootstrap', asChooser);
        expect((asChooser.body as { binding: { kind: string } }).binding.kind).toBe(
          'TENANT_SELECTION_REQUIRED',
        );
      });

      it('GET /platform/bootstrap answers a conforming problem body without a token', async () => {
        const response = await app.request({ method: 'GET', url: '/platform/bootstrap' });

        expect(response.statusCode).toBe(401);
        // The media type is the known deviation recorded above; the body still
        // has to satisfy the declared Problem schema, and expectConforms holds
        // it to exactly that.
        expect(mediaTypeOf(response)).toBe('application/json');
        expectConforms('getPlatformBootstrap', response);
        expect((response.body as { code: string }).code).toBe('AUTHENTICATION_REQUIRED');
      });

      it('POST /platform/tenant-binding conforms on first bind, on switch, and on refusal', async () => {
        const firstBind = await app.request({
          method: 'POST',
          url: '/platform/tenant-binding',
          accessToken: chooser.accessToken,
          payload: { tenantId: TENANT_ONE },
        });
        expect(firstBind.statusCode).toBe(200);
        expectConforms('setPlatformTenantBinding', firstBind);
        expect((firstBind.body as { kind: string }).kind).toBe('BOUND');

        // A bound session switching: the response carries NEW tokens, which is
        // the other oneOf branch of the same 200.
        const switched = await app.request({
          method: 'POST',
          url: '/platform/tenant-binding',
          accessToken: chooser.accessToken,
          payload: { tenantId: TENANT_TWO },
        });
        expect(switched.statusCode).toBe(200);
        expectConforms('setPlatformTenantBinding', switched);
        expect((switched.body as { kind: string }).kind).toBe('SWITCHED');

        const arbitrary = await app.request({
          method: 'POST',
          url: '/platform/tenant-binding',
          accessToken: bound.accessToken,
          payload: { tenantId: TENANT_NOT_MINE },
        });
        expect(arbitrary.statusCode).toBe(403);
        expectConforms('setPlatformTenantBinding', arbitrary);

        const malformed = await app.request({
          method: 'POST',
          url: '/platform/tenant-binding',
          accessToken: bound.accessToken,
          payload: { tenantId: 'not-a-uuid' },
        });
        expect(malformed.statusCode).toBe(400);
        expectConforms('setPlatformTenantBinding', malformed);

        const anonymous = await app.request({
          method: 'POST',
          url: '/platform/tenant-binding',
          payload: { tenantId: TENANT_ONE },
        });
        expect(anonymous.statusCode).toBe(401);
        expectConforms('setPlatformTenantBinding', anonymous);
      });
    });

    describe('tenancy surface', () => {
      it('GET /tenancy/memberships conforms, with rows and without a token', async () => {
        const listed = await app.request({
          method: 'GET',
          url: '/tenancy/memberships',
          accessToken: bound.accessToken,
        });
        expect(listed.statusCode).toBe(200);
        expectConforms('listOwnTenantMemberships', listed);
        // NON-EMPTY first: an empty array satisfies every shape assertion while
        // proving nothing about how a membership is serialized.
        expect((listed.body as { memberships: unknown[] }).memberships.length).toBeGreaterThan(0);

        const anonymous = await app.request({ method: 'GET', url: '/tenancy/memberships' });
        expect(anonymous.statusCode).toBe(401);
        expectConforms('listOwnTenantMemberships', anonymous);
      });

      it('GET /tenancy/tenant conforms', async () => {
        const own = await app.request({
          method: 'GET',
          url: '/tenancy/tenant',
          accessToken: bound.accessToken,
        });
        expect(own.statusCode).toBe(200);
        expectConforms('getOwnTenant', own);
        expect((own.body as { tenant: { id: string } }).tenant.id).toBe(TENANT_ONE);

        const anonymous = await app.request({ method: 'GET', url: '/tenancy/tenant' });
        expect(anonymous.statusCode).toBe(401);
        expectConforms('getOwnTenant', anonymous);
      });

      it('the permission-gated tenancy routes conform on denial', async () => {
        // No RBAC grant is seeded, so these deny — and the denial SHAPE matters
        // exactly as much as a success shape: a problem document that leaks a
        // field is the same defect.
        const members = await app.request({
          method: 'GET',
          url: '/tenancy/members',
          accessToken: bound.accessToken,
        });
        expect(members.statusCode).toBe(403);
        expectConforms('listTenantMembers', members);
        expectConforms(
          'listTenantMembers',
          await app.request({ method: 'GET', url: '/tenancy/members' }),
        );

        const invite = await app.request({
          method: 'POST',
          url: '/tenancy/invitations',
          accessToken: bound.accessToken,
          payload: { email: 'invitee@example.invalid' },
        });
        expect(invite.statusCode).toBe(403);
        expectConforms('createTenantInvitation', invite);

        const revoke = await app.request({
          method: 'POST',
          url: `/tenancy/invitations/${randomUUID()}/revoke`,
          accessToken: bound.accessToken,
        });
        expect(revoke.statusCode).toBe(403);
        expectConforms('revokeTenantInvitation', revoke);
      });

      it('POST /tenancy/invitations/redeem conforms on an unknown token', async () => {
        const redeemed = await app.request({
          method: 'POST',
          url: '/tenancy/invitations/redeem',
          accessToken: unbound.accessToken,
          payload: { token: 'a'.repeat(43) },
        });

        expect(redeemed.statusCode).toBe(404);
        expectConforms('redeemTenantInvitation', redeemed);
        expectConforms(
          'redeemTenantInvitation',
          await app.request({
            method: 'POST',
            url: '/tenancy/invitations/redeem',
            payload: { token: 'a'.repeat(43) },
          }),
        );
      });
    });

    describe('users surface', () => {
      it('GET and PATCH /users/me conform on success, refusal, and absence', async () => {
        const read = await app.request({
          method: 'GET',
          url: '/users/me',
          accessToken: bound.accessToken,
        });
        expect(read.statusCode).toBe(200);
        expectConforms('getOwnUserProfile', read);
        expect((read.body as { userId: string }).userId).toBe(bound.userId);

        const updated = await app.request({
          method: 'PATCH',
          url: '/users/me',
          accessToken: bound.accessToken,
          payload: { displayName: 'Conformance Subject II', locale: 'ar-QA' },
        });
        expect(updated.statusCode).toBe(200);
        expectConforms('updateOwnUserProfile', updated);
        expect((updated.body as { locale: string }).locale).toBe('ar-QA');

        const rejected = await app.request({
          method: 'PATCH',
          url: '/users/me',
          accessToken: bound.accessToken,
          payload: { locale: 'not a locale at all' },
        });
        expect(rejected.statusCode).toBe(400);
        expectConforms('updateOwnUserProfile', rejected);

        // A bound session whose tenant holds no profile row for it.
        const missing = await app.request({
          method: 'GET',
          url: '/users/me',
          accessToken: profileless.accessToken,
        });
        expect(missing.statusCode).toBe(404);
        expectConforms('getOwnUserProfile', missing);

        expectConforms('getOwnUserProfile', await app.request({ method: 'GET', url: '/users/me' }));
        expectConforms(
          'updateOwnUserProfile',
          await app.request({ method: 'PATCH', url: '/users/me', payload: { locale: 'en' } }),
        );
      });

      it('POST /users/me/disable-request conforms on record, on repeat, and without a profile', async () => {
        const recorded = await app.request({
          method: 'POST',
          url: '/users/me/disable-request',
          accessToken: bound.accessToken,
          payload: { reason: 'synthetic conformance fixture' },
        });
        expect(recorded.statusCode).toBe(202);
        expectConforms('requestOwnAccountDisable', recorded);
        expect((recorded.body as { status: string }).status).toBe('DISABLE_REQUESTED');

        // The transition happened once; the second attempt is a conflict.
        const again = await app.request({
          method: 'POST',
          url: '/users/me/disable-request',
          accessToken: bound.accessToken,
        });
        expect(again.statusCode).toBe(409);
        expectConforms('requestOwnAccountDisable', again);

        const noProfile = await app.request({
          method: 'POST',
          url: '/users/me/disable-request',
          accessToken: profileless.accessToken,
        });
        expect(noProfile.statusCode).toBe(404);
        expectConforms('requestOwnAccountDisable', noProfile);

        expectConforms(
          'requestOwnAccountDisable',
          await app.request({ method: 'POST', url: '/users/me/disable-request' }),
        );
      });
    });

    describe('consent surface', () => {
      it('GET /consent/documents conforms — and the closed effectiveVersion holds', async () => {
        const listed = await app.request({
          method: 'GET',
          url: '/consent/documents',
          accessToken: bound.accessToken,
        });

        expect(listed.statusCode).toBe(200);
        expectConforms('listApplicableConsentDocuments', listed);

        // NON-EMPTY, and with an effective version — otherwise the closure of
        // `effectiveVersion` would be a rule about an object that never exists.
        const documents = (listed.body as { documents: Array<Record<string, unknown>> }).documents;
        expect(documents).toHaveLength(2);
        expect(documents.map((document) => document.documentId).sort()).toEqual(
          [DOCUMENT_ID, RETRIEVABLE_DOCUMENT_ID].sort(),
        );
        for (const document of documents) expect(document.effectiveVersion).not.toBeNull();

        // The row genuinely HOLDS the locator, so the absence below is the
        // controller's choice rather than an empty column.
        const stored = await app.sql<{ storage_ref: string }>(
          `SELECT storage_ref FROM public.legal_document_versions WHERE id = $1`,
          [VERSION_ID],
        );
        expect(stored[0]?.storage_ref).toBe(STORAGE_REF);
        expect(listed.raw).not.toContain('store://');
      });

      it('GET /consent/status conforms', async () => {
        const status = await app.request({
          method: 'GET',
          url: `/consent/status?purposeRef=${encodeURIComponent(PURPOSE_REF)}`,
          accessToken: bound.accessToken,
        });

        expect(status.statusCode).toBe(200);
        expectConforms('readOwnConsentStatus', status);
        // A resolved answer, not an error dressed as one: the caller has no
        // grant, and NO_GRANT is the fail-closed state the contract enumerates.
        expect((status.body as { state: string }).state).toBe('NO_GRANT');
      });

      it('GET /consent/documents/{id}/content conforms when text IS served — the closed body', async () => {
        // The 200 here is the third response-side closure in the contract, and
        // the strictest: `additionalProperties: false` on the WHOLE body, so
        // no locator, no internal column, nothing beyond the eight declared
        // fields may appear. Reaching it needs a version the local content
        // source resolves and a hash that genuinely matches its bytes.
        const served = await app.request({
          method: 'GET',
          url: `/consent/documents/${RETRIEVABLE_DOCUMENT_ID}/content`,
          accessToken: bound.accessToken,
        });

        expect(served.statusCode).toBe(200);
        expectConforms('readConsentDocumentContent', served);
        const body = served.body as Record<string, unknown>;
        expect(body.versionId).toBe(RETRIEVABLE_VERSION_ID);
        // Real bytes, not an empty string that would satisfy `type: string`
        // while proving the route serves nothing.
        expect(String(body.content).length).toBeGreaterThan(0);
        expect(served.raw).not.toContain('storageRef');
        expect(served.raw).not.toContain('local-seed://');
      });

      it('GET /consent/documents/{id}/content conforms on both refusals', async () => {
        // This document applies to the caller and has a published version, but
        // its locator is not one the content source resolves — the endpoint
        // reports that rather than serving some other document's text.
        const unavailable = await app.request({
          method: 'GET',
          url: `/consent/documents/${DOCUMENT_ID}/content`,
          accessToken: bound.accessToken,
        });
        expect(unavailable.statusCode).toBe(409);
        expectConforms('readConsentDocumentContent', unavailable);

        const unknown = await app.request({
          method: 'GET',
          url: `/consent/documents/${randomUUID()}/content`,
          accessToken: bound.accessToken,
        });
        expect(unknown.statusCode).toBe(404);
        expectConforms('readConsentDocumentContent', unknown);
      });
    });

    describe('jurisdiction surface', () => {
      it('GET /jurisdiction/declarable-references conforms — and its entries are closed', async () => {
        const references = await app.request({
          method: 'GET',
          url: '/jurisdiction/declarable-references',
          accessToken: declarer.accessToken,
        });

        expect(references.statusCode).toBe(200);
        expectConforms('listDeclarableJurisdictionReferences', references);
        // The seeded register really has entries; an empty list would make the
        // closed-shape check vacuous.
        expect((references.body as { references: unknown[] }).references.length).toBeGreaterThan(0);

        expectConforms(
          'listDeclarableJurisdictionReferences',
          await app.request({ method: 'GET', url: '/jurisdiction/declarable-references' }),
        );
      });

      it('POST /jurisdiction/self-declaration conforms on success and on every refusal', async () => {
        const declared = await app.request({
          method: 'POST',
          url: '/jurisdiction/self-declaration',
          accessToken: declarer.accessToken,
          payload: { jurisdictionId: JURISDICTION_REF },
        });
        expect(declared.statusCode).toBe(200);
        expectConforms('declareOwnJurisdiction', declared);
        expect((declared.body as { state: string }).state).toBe('UNVERIFIED');

        const unrecognised = await app.request({
          method: 'POST',
          url: '/jurisdiction/self-declaration',
          accessToken: declarer.accessToken,
          payload: { jurisdictionId: 'ZZ' },
        });
        expect(unrecognised.statusCode).toBe(400);
        expectConforms('declareOwnJurisdiction', unrecognised);

        // An unbound session has no RLS context to write an assignment under.
        const withoutBinding = await app.request({
          method: 'POST',
          url: '/jurisdiction/self-declaration',
          accessToken: unbound.accessToken,
          payload: { jurisdictionId: JURISDICTION_REF },
        });
        expect(withoutBinding.statusCode).toBe(409);
        expectConforms('declareOwnJurisdiction', withoutBinding);

        expectConforms(
          'declareOwnJurisdiction',
          await app.request({
            method: 'POST',
            url: '/jurisdiction/self-declaration',
            payload: { jurisdictionId: JURISDICTION_REF },
          }),
        );
      });
    });

    describe('the checks are not vacuous — proven on the real bodies', () => {
      it('REJECTS an extra property injected into a real closed response object', async () => {
        // The `storageRef` leak, reproduced: take the response the server just
        // sent, add the field a careless spread would add, and confirm the
        // validator refuses it. Same schema, same walk, one changed byte.
        const listed = await app.request({
          method: 'GET',
          url: '/consent/documents',
          accessToken: bound.accessToken,
        });
        const body = JSON.parse(listed.raw) as {
          documents: Array<{ effectiveVersion: Record<string, unknown> }>;
        };
        expect(
          violationsForMutated('listApplicableConsentDocuments', 200, 'application/json', body),
          'the unmodified response must conform, or the rejection below proves nothing',
        ).toEqual([]);

        body.documents[0]!.effectiveVersion['storageRef'] = STORAGE_REF;

        expect(
          violationsForMutated('listApplicableConsentDocuments', 200, 'application/json', body),
        ).toEqual([
          'documents/0/effectiveVersion/storageRef: undeclared property (the schema closes this object: additionalProperties false)',
        ]);
      });

      it('REJECTS an extra property injected into a real jurisdiction reference', async () => {
        // The second response-side closure the contract declares, on a
        // completely different surface and through a component $ref.
        const references = await app.request({
          method: 'GET',
          url: '/jurisdiction/declarable-references',
          accessToken: declarer.accessToken,
        });
        const body = JSON.parse(references.raw) as { references: Array<Record<string, unknown>> };
        expect(
          violationsForMutated(
            'listDeclarableJurisdictionReferences',
            200,
            'application/json',
            body,
          ),
        ).toEqual([]);

        // The register's governance record — the field set the contract exists
        // to keep inside the platform.
        body.references[0]!['reviewStatus'] = 'REVIEW_COMPLETE';

        expect(
          violationsForMutated(
            'listDeclarableJurisdictionReferences',
            200,
            'application/json',
            body,
          ),
        ).toEqual([
          'references/0/reviewStatus: undeclared property (the schema closes this object: additionalProperties false)',
        ]);
      });

      it('REJECTS an extra property injected into the real document-content body', async () => {
        // The third closure, and the one that matters most: this response is
        // the only place a subject receives document TEXT, and the schema
        // closes the whole body so an internal locator cannot ride along.
        const served = await app.request({
          method: 'GET',
          url: `/consent/documents/${RETRIEVABLE_DOCUMENT_ID}/content`,
          accessToken: bound.accessToken,
        });
        const body = JSON.parse(served.raw) as Record<string, unknown>;
        expect(
          violationsForMutated('readConsentDocumentContent', 200, 'application/json', body),
        ).toEqual([]);

        body['storageRef'] = 'local-seed://synthetic-notice';

        expect(
          violationsForMutated('readConsentDocumentContent', 200, 'application/json', body),
        ).toEqual([
          'storageRef: undeclared property (the schema closes this object: additionalProperties false)',
        ]);
      });

      it('REJECTS a wrong type in a real response', async () => {
        const own = await app.request({
          method: 'GET',
          url: '/tenancy/tenant',
          accessToken: bound.accessToken,
        });
        const body = JSON.parse(own.raw) as { tenant: Record<string, unknown> };
        expect(violationsForMutated('getOwnTenant', 200, 'application/json', body)).toEqual([]);

        // A `createdAt` that became a number is exactly what a serializer change
        // would produce, and every client decoding it as a date would break.
        body.tenant['createdAt'] = 1_760_000_000_000;

        expect(violationsForMutated('getOwnTenant', 200, 'application/json', body)).toEqual([
          'tenant/createdAt: expected type string, received integer',
        ]);
      });

      it('REJECTS a missing required property in a real response', async () => {
        const bootstrap = await app.request({
          method: 'GET',
          url: '/platform/bootstrap',
          accessToken: bound.accessToken,
        });
        const body = JSON.parse(bootstrap.raw) as Record<string, unknown>;
        expect(violationsForMutated('getPlatformBootstrap', 200, 'application/json', body)).toEqual(
          [],
        );

        delete body['capabilities'];

        expect(violationsForMutated('getPlatformBootstrap', 200, 'application/json', body)).toEqual(
          ['capabilities: required property is missing'],
        );
      });

      it('REJECTS a leaked field in a real PROBLEM document', async () => {
        // Failure shapes matter as much as success shapes: an error body that
        // leaks a field is the same defect. The contract leaves `Problem` OPEN,
        // so the leak assertion is made against a CLOSED copy of the very
        // schema the contract declares — same walk, same body, one keyword
        // added. If the contract ever closes Problem for real, this check
        // becomes live without a line changing here.
        const denied = await app.request({
          method: 'GET',
          url: '/tenancy/members',
          accessToken: bound.accessToken,
        });
        expect(denied.statusCode).toBe(403);
        const declared = contract.responseSchema(
          'listTenantMembers',
          403,
          'application/problem+json',
        );
        expect(validateAgainstSchema(declared!, denied.body, contract.resolve)).toEqual([]);

        const problem = contract.resolve((declared!.node as { $ref: string }).$ref, declared!);
        const closedProblem = {
          node: { ...(problem.node as Record<string, unknown>), additionalProperties: false },
          documentId: problem.documentId,
        };
        // The real body carries ONLY declared fields — a genuine property of
        // this route, and the control that makes the rejection below meaningful.
        expect(validateAgainstSchema(closedProblem, denied.body, contract.resolve)).toEqual([]);

        const leaked = { ...(denied.body as Record<string, unknown>), stack: 'Error: at ...' };
        expect(
          validateAgainstSchema(closedProblem, leaked, contract.resolve).map(
            (violation) => `${violation.path}: ${violation.message}`,
          ),
        ).toEqual([
          'stack: undeclared property (the schema closes this object: additionalProperties false)',
        ]);
      });

      it('names the ONE field the platform error model adds beyond the declared Problem shape', () => {
        // Not a violation — `Problem` is open, so `instance` is legal. It is
        // recorded because it is the difference between the two error models
        // this API currently serves, and because a field nobody declared is a
        // field nobody reviewed for what it may carry. `instance` is the route
        // template, which is safe; the point is that the contract does not say so.
        const declared = contract.responseSchema(
          'readConsentDocumentContent',
          409,
          'application/problem+json',
        );
        const problem = contract.resolve((declared!.node as { $ref: string }).$ref, declared!);
        const closedProblem = {
          node: { ...(problem.node as Record<string, unknown>), additionalProperties: false },
          documentId: problem.documentId,
        };
        const filtered = {
          type: 'urn:karar:error:NO_EFFECTIVE_ENTITY',
          title: 'Conflict',
          status: 409,
          code: 'NO_EFFECTIVE_ENTITY',
          detail: 'no operating entity is effective for the caller',
          instance: '/consent/documents/:documentId/content',
        };

        expect(validateAgainstSchema(declared!, filtered, contract.resolve)).toEqual([]);
        expect(
          validateAgainstSchema(closedProblem, filtered, contract.resolve).map(
            (violation) => violation.path,
          ),
        ).toEqual(['instance']);
      });
    });

    describe('the ledger', () => {
      it('validated exactly the operations and statuses this suite claims to cover', () => {
        // The guard against the worst failure mode in this file: a suite that
        // stopped exercising something still prints green. Naming the set makes
        // a silent loss a loud one.
        expect([...validated].sort()).toEqual([
          'createTenantInvitation 403',
          'declareOwnJurisdiction 200',
          'declareOwnJurisdiction 400',
          'declareOwnJurisdiction 401',
          'declareOwnJurisdiction 409',
          'getOwnTenant 200',
          'getOwnTenant 401',
          'getOwnUserProfile 200',
          'getOwnUserProfile 401',
          'getOwnUserProfile 404',
          'getPlatformBootstrap 200',
          'getPlatformBootstrap 401',
          'listApplicableConsentDocuments 200',
          'listDeclarableJurisdictionReferences 200',
          'listDeclarableJurisdictionReferences 401',
          'listOwnTenantMemberships 200',
          'listOwnTenantMemberships 401',
          'listTenantMembers 401',
          'listTenantMembers 403',
          'readConsentDocumentContent 200',
          'readConsentDocumentContent 404',
          'readConsentDocumentContent 409',
          'readOwnConsentStatus 200',
          'redeemTenantInvitation 401',
          'redeemTenantInvitation 404',
          'requestOwnAccountDisable 202',
          'requestOwnAccountDisable 401',
          'requestOwnAccountDisable 404',
          'requestOwnAccountDisable 409',
          'revokeTenantInvitation 403',
          'setPlatformTenantBinding 200',
          'setPlatformTenantBinding 400',
          'setPlatformTenantBinding 401',
          'setPlatformTenantBinding 403',
          'updateOwnUserProfile 200',
          'updateOwnUserProfile 400',
          'updateOwnUserProfile 401',
        ]);
      });

      it('observed exactly the known media-type deviations — no more, no fewer', () => {
        // Red when a handler is FIXED (delete the entry) and red when a new one
        // regresses. Either way somebody reads the reason before the ledger
        // changes, which is the whole point of writing the defect down instead
        // of loosening the check.
        expect([...observedDeviations].sort()).toEqual([...PROBLEM_MEDIA_TYPE_DEVIATIONS].sort());
      });
    });
  },
);
