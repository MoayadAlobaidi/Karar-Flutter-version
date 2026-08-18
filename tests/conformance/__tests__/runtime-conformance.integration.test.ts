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
 * THE 17 /auth OPERATIONS ARE NOW IN. They used to be excluded here because
 * the identity fragment described every body in prose and attached no schema,
 * so there was nothing to hold a response to. The fragment has schemas, and
 * this file drives the real routes for all of them — including the branches
 * that need a working authenticator (the harness computes RFC 6238 codes), a
 * genuinely exhausted rate-limit budget, and an operator kill switch.
 *
 * WHAT IS NOT COVERED, stated plainly rather than implied away:
 *   * `identityVerifyEmail` 200 and `identityResetPassword` 200 — the
 *     verification code and the reset token are stored as DIGESTS and
 *     delivered only by e-mail. There is no route, table, or log that returns
 *     them, which is the design; a test that reached one would have to read
 *     something only a subject's mailbox holds. The refusals are covered;
 *   * `identityForgotPassword` 503 — that 503 is a rate-limit STORE outage,
 *     and the store is the live Redis every other test here depends on.
 *     Registration's and login's 503s ARE covered, through an operator kill
 *     switch, which is a real readable state rather than an inflicted outage;
 *   * `recordOwnConsentAcceptance` 201 and `withdrawOwnConsent` 200 — Phase
 *     3.5 refuses acceptance until policy provenance resolves, by design, so
 *     no grant exists to withdraw and neither success body is reachable;
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
  totpCode,
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
 * THE DEFECT THIS LEDGER RECORDED, AND WHY IT IS NOW EMPTY.
 *
 * The contract declares every failure body as `application/problem+json`
 * (RFC 7807). Only `GlobalExceptionFilter` set that header, and it only runs
 * for THROWN failures — so the five modules that answered through Fastify's
 * reply object directly (tenancy, users, bootstrap, jurisdiction, and the
 * consent CONTENT route) sent problem BODIES under Fastify's default
 * `application/json`. This suite found 25 such (operation, status) pairs and
 * carried them here. A generated client that dispatches on Content-Type — the
 * normal way to tell a problem document from a payload — saw two error models
 * from one API, side by side in a single run:
 *
 *   GET /consent/documents           401 [application/problem+json]
 *   GET /tenancy/tenant              401 [application/json]
 *
 * The fix collapsed them into one. A module that cannot serve a request now
 * THROWS its RFC 7807 document; the error boundary forwards it verbatim —
 * code, `reason`, `retryable`, echoed `requestId` and all — through the single
 * writer in apps/api/src/errors/problem-response.ts, which is the only place
 * in the service that names the media type. Nothing in a controller decides
 * it any more.
 *
 * The check is KEPT, not deleted, and its expected value is now the empty
 * set: a handler that goes back to answering a problem through the reply
 * object turns this red on the next run, naming the operation and status.
 */

/** Problem bodies observed under the wrong media type. Must stay empty. */
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
    // A problem BODY served as application/json. It is RECORDED rather than
    // thrown on here, and the body is still validated against the declared
    // problem schema, so one run reports both the media type that regressed
    // and whether the shape held. The ledger at the end asserts the recorded
    // set is empty.
    const asProblem = declared.schemas.get('application/problem+json');
    if (mediaType === 'application/json' && asProblem !== undefined) {
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

    describe('identity surface', () => {
      /**
       * A synthetic address per scenario. The identity limiter is REAL and
       * keys on the client address as well as on the account, so a test that
       * deliberately exhausts one budget must not spend another test's.
       * RFC 5737 TEST-NET-1: these can never be a real client.
       */
      const FROM = {
        sends: '192.0.2.10',
        login: '192.0.2.11',
        mfa: '192.0.2.12',
        mfaBudget: '192.0.2.13',
        recovery: '192.0.2.14',
        sessions: '192.0.2.15',
        password: '192.0.2.16',
        refresh: '192.0.2.17',
        unenrolled: '192.0.2.18',
        killSwitch: '192.0.2.19',
      } as const;

      /** A fresh address nobody has spent a send budget on. */
      function freshAddress(): string {
        return `conformance-${randomUUID()}@example.invalid`;
      }

      /**
       * Takes an account all the way to ACTIVE MFA through the real routes,
       * and returns what those routes handed back exactly once: the shared
       * secret and the recovery-code set. Both responses are validated on the
       * way through — this is where identityMfaEnroll 200 and
       * identityMfaConfirm 200 are covered.
       */
      async function enrolMfa(
        caller: Caller,
        from: string,
      ): Promise<{ secret: string; recoveryCodes: string[] }> {
        const started = await app.request({
          method: 'POST',
          url: '/auth/mfa/enroll',
          accessToken: caller.accessToken,
          remoteAddress: from,
        });
        expect(started.statusCode).toBe(200);
        expectConforms('identityMfaEnroll', started);
        const secret = (started.body as { secret: string }).secret;

        const confirmed = await app.request({
          method: 'POST',
          url: '/auth/mfa/confirm',
          accessToken: caller.accessToken,
          remoteAddress: from,
          payload: { code: totpCode(secret) },
        });
        expect(confirmed.statusCode).toBe(200);
        expectConforms('identityMfaConfirm', confirmed);
        const recoveryCodes = (confirmed.body as { recoveryCodes: string[] }).recoveryCodes;
        // Ten, from the real generator — the contract states the count as
        // minItems/maxItems, and this is the response it was written from.
        expect(recoveryCodes).toHaveLength(10);
        return { secret, recoveryCodes };
      }

      /** Signs in and returns the whole body, not just the token. */
      async function loginResponse(caller: Caller, from: string): Promise<WireResponse> {
        return app.request({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: from,
          payload: { email: caller.email, password: caller.password },
        });
      }

      /**
       * One account per flow that CONSUMES something — a budget, a session, a
       * password, an enrolment. Sharing them would make one test's exhausted
       * budget another test's inexplicable 429.
       */
      /** MFA active: the login challenge branch, the challenge completion, the disable. */
      let mfaSubject: Caller;
      let mfaSecret: string;
      /** MFA active, kept aside so the challenge budget can be exhausted. */
      let mfaBudgetSubject: Caller;
      /** MFA active, and the holder of the recovery codes below. */
      let recoverySubject: Caller;
      let recoveryCodes: string[];
      /** Never enrolled: the "nothing to confirm" and "not enrolled" arms. */
      let unenrolled: Caller;
      let sessionSubject: Caller;
      let passwordSubject: Caller;
      let refreshSubject: Caller;
      let logoutSubject: Caller;

      beforeAll(async () => {
        unenrolled = await app.registerAndLogin(FROM.unenrolled);
        sessionSubject = await app.registerAndLogin(FROM.sessions);
        passwordSubject = await app.registerAndLogin(FROM.password);
        refreshSubject = await app.registerAndLogin(FROM.refresh);
        logoutSubject = await app.registerAndLogin(FROM.sessions);

        mfaSubject = await app.registerAndLogin(FROM.mfa);
        mfaSecret = (await enrolMfa(mfaSubject, FROM.mfa)).secret;
        mfaBudgetSubject = await app.registerAndLogin(FROM.mfaBudget);
        await enrolMfa(mfaBudgetSubject, FROM.mfaBudget);
        recoverySubject = await app.registerAndLogin(FROM.recovery);
        recoveryCodes = (await enrolMfa(recoverySubject, FROM.recovery)).recoveryCodes;
      }, 120_000);

      it('POST /auth/register conforms on the neutral receipt, on refusal, and on the send budget', async () => {
        const email = freshAddress();
        const accepted = await app.request({
          method: 'POST',
          url: '/auth/register',
          remoteAddress: FROM.sends,
          payload: { email, password: `Synthetic-${randomUUID()}` },
        });
        expect(accepted.statusCode).toBe(202);
        expectConforms('identityRegister', accepted);
        expect((accepted.body as { status: string }).status).toBe('accepted');

        const malformed = await app.request({
          method: 'POST',
          url: '/auth/register',
          remoteAddress: FROM.sends,
          payload: { email: 'not-an-address', password: `Synthetic-${randomUUID()}` },
        });
        expect(malformed.statusCode).toBe(400);
        expectConforms('identityRegister', malformed);

        // The verification-send budget is 3/h per ADDRESS digest, and
        // registration spends from it. One send is already gone above, so two
        // more exhaust it and the fourth attempt is refused.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const repeated = await app.request({
            method: 'POST',
            url: '/auth/register',
            remoteAddress: FROM.sends,
            payload: { email, password: `Synthetic-${randomUUID()}` },
          });
          expect(repeated.statusCode, `registration attempt ${String(attempt + 2)}`).toBe(202);
        }
        const limited = await app.request({
          method: 'POST',
          url: '/auth/register',
          remoteAddress: FROM.sends,
          payload: { email, password: `Synthetic-${randomUUID()}` },
        });
        expect(limited.statusCode).toBe(429);
        expectConforms('identityRegister', limited);
        expect((limited.body as { code: string }).code).toBe('RATE_LIMITED');
        // The wait is part of the answer, not part of the prose.
        expect(
          (limited.body as { details?: { retryAfterSeconds?: number } }).details?.retryAfterSeconds,
        ).toBeGreaterThan(0);
      });

      it('POST /auth/register and /auth/login conform on an operator kill switch (503)', async () => {
        // The one 503 an in-process suite can reach honestly: an operator
        // restriction is a real, readable state, unlike a store outage, which
        // would have to be inflicted on the live dependency every other test
        // in this file is using. The switch is restored before the assertions
        // that follow it, so a failure cannot leave the surface restricted.
        await app.setKillSwitch('NEW_REGISTRATIONS', 'ACTIVE_RESTRICTION');
        let restricted: WireResponse;
        try {
          restricted = await app.request({
            method: 'POST',
            url: '/auth/register',
            remoteAddress: FROM.killSwitch,
            payload: { email: freshAddress(), password: `Synthetic-${randomUUID()}` },
          });
        } finally {
          await app.setKillSwitch('NEW_REGISTRATIONS', 'INACTIVE');
        }
        expect(restricted.statusCode).toBe(503);
        expectConforms('identityRegister', restricted);
        expect((restricted.body as { code: string }).code).toBe('OPERATION_RESTRICTED');
        expect((restricted.body as { details?: { switchId?: string } }).details?.switchId).toBe(
          'NEW_REGISTRATIONS',
        );

        await app.setKillSwitch('PASSWORD_LOGIN', 'ACTIVE_RESTRICTION');
        let deniedLogin: WireResponse;
        try {
          deniedLogin = await app.request({
            method: 'POST',
            url: '/auth/login',
            remoteAddress: FROM.killSwitch,
            payload: { email: bound.email, password: bound.password },
          });
        } finally {
          await app.setKillSwitch('PASSWORD_LOGIN', 'INACTIVE');
        }
        expect(deniedLogin.statusCode).toBe(503);
        expectConforms('identityLogin', deniedLogin);
        expect((deniedLogin.body as { code: string }).code).toBe('OPERATION_RESTRICTED');

        // And the restriction really is gone: the same login now succeeds, so
        // the 503 above was the switch rather than a broken fixture.
        const restored = await app.request({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: FROM.killSwitch,
          payload: { email: bound.email, password: bound.password },
        });
        expect(restored.statusCode).toBe(200);
      });

      it('POST /auth/verify-email conforms on the generic refusal', async () => {
        // The 200 is NOT reachable in-process and is not faked: the code is
        // minted, stored as a digest, and delivered by e-mail — there is no
        // route, table, or log that returns it, which is the design. A test
        // that reached it would have to read something a subject's mailbox is
        // the only holder of.
        const refused = await app.request({
          method: 'POST',
          url: '/auth/verify-email',
          remoteAddress: FROM.sends,
          payload: { email: bound.email, code: 'ZZZZZZZZ' },
        });
        expect(refused.statusCode).toBe(401);
        expectConforms('identityVerifyEmail', refused);
        expect((refused.body as { code: string }).code).toBe('AUTHENTICATION_REQUIRED');
      });

      it('POST /auth/resend-verification conforms on the receipt and on the send budget', async () => {
        const email = freshAddress();
        const accepted = await app.request({
          method: 'POST',
          url: '/auth/resend-verification',
          remoteAddress: FROM.sends,
          payload: { email },
        });
        expect(accepted.statusCode).toBe(202);
        expectConforms('identityResendVerification', accepted);
        // The address was never registered, and the body says nothing about
        // that — the receipt is the enumeration defence, so it is asserted
        // to be the SAME object a real send returns.
        expect(accepted.body).toEqual(
          (
            await app.request({
              method: 'POST',
              url: '/auth/resend-verification',
              remoteAddress: FROM.sends,
              payload: { email },
            })
          ).body,
        );

        const third = await app.request({
          method: 'POST',
          url: '/auth/resend-verification',
          remoteAddress: FROM.sends,
          payload: { email },
        });
        expect(third.statusCode).toBe(202);
        const limited = await app.request({
          method: 'POST',
          url: '/auth/resend-verification',
          remoteAddress: FROM.sends,
          payload: { email },
        });
        expect(limited.statusCode).toBe(429);
        expectConforms('identityResendVerification', limited);
      });

      it('POST /auth/login conforms on both 200 branches, on the generic 401, and on the budget', async () => {
        const authenticated = await loginResponse(bound, FROM.login);
        expect(authenticated.statusCode).toBe(200);
        expectConforms('identityLogin', authenticated);
        expect((authenticated.body as { status: string }).status).toBe('authenticated');

        // The OTHER oneOf branch, on a real account with MFA active. A
        // validator that only ever saw the session branch would prove nothing
        // about the challenge one — and the two are the whole reason the 200
        // is a union.
        const challenged = await loginResponse(mfaSubject, FROM.mfa);
        expect(challenged.statusCode).toBe(200);
        expectConforms('identityLogin', challenged);
        expect((challenged.body as { status: string }).status).toBe('mfa_required');
        // A challenge is not a session: no token that could reach an
        // authenticated route may appear in it.
        expect(challenged.raw).not.toContain('accessToken');

        const wrong = await app.request({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: FROM.login,
          payload: { email: bound.email, password: 'not-the-password' },
        });
        expect(wrong.statusCode).toBe(401);
        expectConforms('identityLogin', wrong);

        // The per-address budget is 10 per 15 minutes; one failure is already
        // spent above, and one success before it. The eleventh presentation
        // of this address is refused whatever the password would have been.
        const attacked = await app.registerAndLogin(FROM.login);
        for (let attempt = 0; attempt < 9; attempt += 1) {
          const rejected = await app.request({
            method: 'POST',
            url: '/auth/login',
            remoteAddress: FROM.login,
            payload: { email: attacked.email, password: 'not-the-password' },
          });
          expect(rejected.statusCode, `login attempt ${String(attempt + 2)}`).toBe(401);
        }
        const limited = await app.request({
          method: 'POST',
          url: '/auth/login',
          remoteAddress: FROM.login,
          payload: { email: attacked.email, password: attacked.password },
        });
        expect(limited.statusCode, 'the correct password must not buy a way past the budget').toBe(
          429,
        );
        expectConforms('identityLogin', limited);
      });

      it('POST /auth/refresh conforms on rotation, on the generic 401, and on the budget', async () => {
        const signedIn = await loginResponse(refreshSubject, FROM.refresh);
        const issued = signedIn.body as { refreshToken: string };
        const rotated = await app.request({
          method: 'POST',
          url: '/auth/refresh',
          remoteAddress: FROM.refresh,
          payload: { refreshToken: issued.refreshToken },
        });
        expect(rotated.statusCode).toBe(200);
        expectConforms('identityRefresh', rotated);
        // A SUCCESSOR, not the same token handed back.
        expect((rotated.body as { refreshToken: string }).refreshToken).not.toBe(
          issued.refreshToken,
        );

        const invalid = await app.request({
          method: 'POST',
          url: '/auth/refresh',
          remoteAddress: FROM.refresh,
          payload: { refreshToken: 'a'.repeat(43) },
        });
        expect(invalid.statusCode).toBe(401);
        expectConforms('identityRefresh', invalid);

        // 60 presentations per 15 minutes per TOKEN digest — the budget is
        // spent by presenting the token, valid or not, so one unknown token
        // reaches it without touching any account. One is spent above.
        const probe = 'b'.repeat(43);
        for (let attempt = 0; attempt < 60; attempt += 1) {
          const rejected = await app.request({
            method: 'POST',
            url: '/auth/refresh',
            remoteAddress: FROM.refresh,
            payload: { refreshToken: probe },
          });
          expect(rejected.statusCode, `refresh attempt ${String(attempt + 1)}`).toBe(401);
        }
        const limited = await app.request({
          method: 'POST',
          url: '/auth/refresh',
          remoteAddress: FROM.refresh,
          payload: { refreshToken: probe },
        });
        expect(limited.statusCode).toBe(429);
        expectConforms('identityRefresh', limited);
      });

      it('POST /auth/logout conforms, and the revoked token no longer authenticates', async () => {
        const token = await app.login(logoutSubject.email, logoutSubject.password, FROM.sessions);
        const out = await app.request({
          method: 'POST',
          url: '/auth/logout',
          accessToken: token,
          remoteAddress: FROM.sessions,
        });
        expect(out.statusCode).toBe(200);
        expectConforms('identityLogout', out);
        expect((out.body as { status: string }).status).toBe('logged_out');

        // The same token again: the session is gone, so this is the 401 —
        // which also proves the 200 above was a real revocation.
        const afterwards = await app.request({
          method: 'POST',
          url: '/auth/logout',
          accessToken: token,
          remoteAddress: FROM.sessions,
        });
        expect(afterwards.statusCode).toBe(401);
        expectConforms('identityLogout', afterwards);
      });

      it('POST /auth/forgot-password conforms on the receipt and on the send budget', async () => {
        // The 503 this operation declares is a rate-limit STORE outage, and
        // it is not reached here: the store is the live Redis every other
        // test in this file depends on, and taking it down mid-suite would
        // race all of them. Stated rather than simulated.
        const email = freshAddress();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const accepted = await app.request({
            method: 'POST',
            url: '/auth/forgot-password',
            remoteAddress: FROM.sends,
            payload: { email },
          });
          expect(accepted.statusCode, `reset request ${String(attempt + 1)}`).toBe(202);
          expectConforms('identityForgotPassword', accepted);
        }
        const limited = await app.request({
          method: 'POST',
          url: '/auth/forgot-password',
          remoteAddress: FROM.sends,
          payload: { email },
        });
        expect(limited.statusCode).toBe(429);
        expectConforms('identityForgotPassword', limited);
      });

      it('POST /auth/reset-password conforms on both refusals', async () => {
        // The 200 is NOT reachable in-process: the reset token is stored as a
        // digest and delivered by e-mail only, exactly as the verification
        // code is. The two refusals ARE reachable, and their ORDER is the
        // interesting part — the password policy is applied before the token
        // is looked up, so a bad password never reveals whether the token was
        // real.
        const badPassword = await app.request({
          method: 'POST',
          url: '/auth/reset-password',
          remoteAddress: FROM.password,
          payload: { token: 'c'.repeat(43), newPassword: 'short' },
        });
        expect(badPassword.statusCode).toBe(400);
        expectConforms('identityResetPassword', badPassword);

        const badToken = await app.request({
          method: 'POST',
          url: '/auth/reset-password',
          remoteAddress: FROM.password,
          payload: { token: 'c'.repeat(43), newPassword: `Synthetic-${randomUUID()}` },
        });
        expect(badToken.statusCode).toBe(401);
        expectConforms('identityResetPassword', badToken);
      });

      it('POST /auth/change-password conforms on refusal, on policy, and on the change', async () => {
        const anonymous = await app.request({
          method: 'POST',
          url: '/auth/change-password',
          remoteAddress: FROM.password,
          payload: { currentPassword: 'x', newPassword: `Synthetic-${randomUUID()}` },
        });
        expect(anonymous.statusCode).toBe(401);
        expectConforms('identityChangePassword', anonymous);

        const tooShort = await app.request({
          method: 'POST',
          url: '/auth/change-password',
          accessToken: passwordSubject.accessToken,
          remoteAddress: FROM.password,
          payload: { currentPassword: passwordSubject.password, newPassword: 'short' },
        });
        expect(tooShort.statusCode).toBe(400);
        expectConforms('identityChangePassword', tooShort);

        // Last, because it bumps the token version: everything above needs a
        // live access token, and this is what makes it stale.
        const changed = await app.request({
          method: 'POST',
          url: '/auth/change-password',
          accessToken: passwordSubject.accessToken,
          remoteAddress: FROM.password,
          payload: {
            currentPassword: passwordSubject.password,
            newPassword: `Synthetic-${randomUUID()}`,
          },
        });
        expect(changed.statusCode).toBe(200);
        expectConforms('identityChangePassword', changed);
        expect((changed.body as { status: string }).status).toBe('changed');
      });

      it('the MFA enrolment routes conform on success and on every state refusal', async () => {
        // mfaSubject is already enrolled and confirmed (the fixture), so a
        // second enrolment is the conflict.
        const already = await app.request({
          method: 'POST',
          url: '/auth/mfa/enroll',
          accessToken: mfaSubject.accessToken,
          remoteAddress: FROM.mfa,
        });
        expect(already.statusCode).toBe(409);
        expectConforms('identityMfaEnroll', already);
        expect((already.body as { code: string }).code).toBe('CONFLICT');

        expectConforms(
          'identityMfaEnroll',
          await app.request({
            method: 'POST',
            url: '/auth/mfa/enroll',
            remoteAddress: FROM.mfa,
          }),
        );

        // An account that never started an enrolment has nothing to confirm.
        const nothingPending = await app.request({
          method: 'POST',
          url: '/auth/mfa/confirm',
          accessToken: unenrolled.accessToken,
          remoteAddress: FROM.unenrolled,
          payload: { code: '000000' },
        });
        expect(nothingPending.statusCode).toBe(409);
        expectConforms('identityMfaConfirm', nothingPending);

        // A pending enrolment plus a code that does not verify.
        const pending = await app.registerAndLogin(FROM.unenrolled);
        const started = await app.request({
          method: 'POST',
          url: '/auth/mfa/enroll',
          accessToken: pending.accessToken,
          remoteAddress: FROM.unenrolled,
        });
        expect(started.statusCode).toBe(200);
        const wrongCode = await app.request({
          method: 'POST',
          url: '/auth/mfa/confirm',
          accessToken: pending.accessToken,
          remoteAddress: FROM.unenrolled,
          payload: { code: '000000' },
        });
        expect(wrongCode.statusCode).toBe(401);
        expectConforms('identityMfaConfirm', wrongCode);
      });

      it('POST /auth/mfa/challenge conforms on completion, on refusal, and on the MFA budget', async () => {
        const challenged = await loginResponse(mfaSubject, FROM.mfa);
        const challengeToken = (challenged.body as { challengeToken: string }).challengeToken;
        const completed = await app.request({
          method: 'POST',
          url: '/auth/mfa/challenge',
          remoteAddress: FROM.mfa,
          payload: { challengeToken, code: totpCode(mfaSecret) },
        });
        expect(completed.statusCode).toBe(200);
        expectConforms('identityMfaChallenge', completed);
        expect((completed.body as { status: string }).status).toBe('authenticated');

        const unverified = await app.request({
          method: 'POST',
          url: '/auth/mfa/challenge',
          remoteAddress: FROM.mfa,
          payload: { challengeToken: 'not-a-challenge-token', code: '000000' },
        });
        expect(unverified.statusCode).toBe(401);
        expectConforms('identityMfaChallenge', unverified);

        // 10 verifications per 15 minutes per ACCOUNT — spent by presenting a
        // valid challenge, whatever the code turns out to be. A separate
        // account, so exhausting it says nothing about any other test here.
        const budgetChallenge = await loginResponse(mfaBudgetSubject, FROM.mfaBudget);
        const budgetToken = (budgetChallenge.body as { challengeToken: string }).challengeToken;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const rejected = await app.request({
            method: 'POST',
            url: '/auth/mfa/challenge',
            remoteAddress: FROM.mfaBudget,
            payload: { challengeToken: budgetToken, code: '000000' },
          });
          expect(rejected.statusCode, `mfa attempt ${String(attempt + 1)}`).toBe(401);
        }
        const limited = await app.request({
          method: 'POST',
          url: '/auth/mfa/challenge',
          remoteAddress: FROM.mfaBudget,
          payload: { challengeToken: budgetToken, code: '000000' },
        });
        expect(limited.statusCode).toBe(429);
        expectConforms('identityMfaChallenge', limited);
      });

      it('POST /auth/mfa/recovery conforms on completion, on refusal, and on the MFA budget', async () => {
        const challenged = await loginResponse(recoverySubject, FROM.recovery);
        const challengeToken = (challenged.body as { challengeToken: string }).challengeToken;
        const completed = await app.request({
          method: 'POST',
          url: '/auth/mfa/recovery',
          remoteAddress: FROM.recovery,
          payload: { challengeToken, recoveryCode: recoveryCodes[0] },
        });
        expect(completed.statusCode).toBe(200);
        expectConforms('identityMfaRecovery', completed);
        expect((completed.body as { status: string }).status).toBe('authenticated');

        const unverified = await app.request({
          method: 'POST',
          url: '/auth/mfa/recovery',
          remoteAddress: FROM.recovery,
          payload: { challengeToken: 'not-a-challenge-token', recoveryCode: recoveryCodes[1] },
        });
        expect(unverified.statusCode).toBe(401);
        expectConforms('identityMfaRecovery', unverified);

        // The same 10/15m account budget the challenge path spends; one is
        // gone on the completion above, so nine more exhaust it.
        for (let attempt = 0; attempt < 9; attempt += 1) {
          const rejected = await app.request({
            method: 'POST',
            url: '/auth/mfa/recovery',
            remoteAddress: FROM.recovery,
            payload: { challengeToken, recoveryCode: 'NOT-A-REAL-RECOVERY-CODE' },
          });
          expect(rejected.statusCode, `recovery attempt ${String(attempt + 2)}`).toBe(401);
        }
        const limited = await app.request({
          method: 'POST',
          url: '/auth/mfa/recovery',
          remoteAddress: FROM.recovery,
          payload: { challengeToken, recoveryCode: recoveryCodes[2] },
        });
        expect(limited.statusCode).toBe(429);
        expectConforms('identityMfaRecovery', limited);
      });

      it('POST /auth/mfa/disable conforms on refusal, on absence, and on the disable', async () => {
        expectConforms(
          'identityMfaDisable',
          await app.request({
            method: 'POST',
            url: '/auth/mfa/disable',
            remoteAddress: FROM.mfa,
            payload: { code: '000000' },
          }),
        );

        const notEnrolled = await app.request({
          method: 'POST',
          url: '/auth/mfa/disable',
          accessToken: unenrolled.accessToken,
          remoteAddress: FROM.unenrolled,
          payload: { code: totpCode(mfaSecret) },
        });
        expect(notEnrolled.statusCode).toBe(409);
        expectConforms('identityMfaDisable', notEnrolled);

        const wrongCode = await app.request({
          method: 'POST',
          url: '/auth/mfa/disable',
          accessToken: mfaSubject.accessToken,
          remoteAddress: FROM.mfa,
          payload: { code: '000000' },
        });
        expect(wrongCode.statusCode).toBe(401);
        expectConforms('identityMfaDisable', wrongCode);

        // Last on this account: after it, the login above no longer answers
        // mfa_required, and this test file's MFA fixture is spent.
        const disabled = await app.request({
          method: 'POST',
          url: '/auth/mfa/disable',
          accessToken: mfaSubject.accessToken,
          remoteAddress: FROM.mfa,
          payload: { code: totpCode(mfaSecret) },
        });
        expect(disabled.statusCode).toBe(200);
        expectConforms('identityMfaDisable', disabled);
        expect((disabled.body as { status: string }).status).toBe('disabled');
      });

      it('the session routes conform on listing, revoking one, and revoking the rest', async () => {
        const first = await loginResponse(sessionSubject, FROM.sessions);
        const firstSessionId = (first.body as { sessionId: string }).sessionId;
        const second = await loginResponse(sessionSubject, FROM.sessions);
        const secondToken = (second.body as { accessToken: string }).accessToken;

        const listed = await app.request({
          method: 'GET',
          url: '/auth/sessions',
          accessToken: secondToken,
          remoteAddress: FROM.sessions,
        });
        expect(listed.statusCode).toBe(200);
        expectConforms('identityListSessions', listed);
        // NON-EMPTY, and with exactly one session flagged current: an empty
        // list would satisfy every shape rule while proving nothing about how
        // a session is serialized.
        const sessions = (listed.body as { sessions: Array<{ current: boolean }> }).sessions;
        expect(sessions.length).toBeGreaterThan(1);
        expect(sessions.filter((session) => session.current)).toHaveLength(1);
        // Minimized metadata: the address digest the store holds is not in it.
        expect(listed.raw).not.toContain('ipDigest');

        expectConforms(
          'identityListSessions',
          await app.request({ method: 'GET', url: '/auth/sessions' }),
        );

        const revoked = await app.request({
          method: 'DELETE',
          url: `/auth/sessions/${firstSessionId}`,
          accessToken: secondToken,
          remoteAddress: FROM.sessions,
        });
        expect(revoked.statusCode).toBe(200);
        expectConforms('identityRevokeSession', revoked);

        // The same id again: nothing live belongs to this account under it.
        const gone = await app.request({
          method: 'DELETE',
          url: `/auth/sessions/${firstSessionId}`,
          accessToken: secondToken,
          remoteAddress: FROM.sessions,
        });
        expect(gone.statusCode).toBe(404);
        expectConforms('identityRevokeSession', gone);

        expectConforms(
          'identityRevokeSession',
          await app.request({ method: 'DELETE', url: `/auth/sessions/${randomUUID()}` }),
        );

        // A third session, so the sweep below has something to revoke and
        // `revokedCount` is a number that had to be computed.
        await loginResponse(sessionSubject, FROM.sessions);
        const swept = await app.request({
          method: 'POST',
          url: '/auth/sessions/revoke-others',
          accessToken: secondToken,
          remoteAddress: FROM.sessions,
        });
        expect(swept.statusCode).toBe(200);
        expectConforms('identityRevokeOtherSessions', swept);
        expect((swept.body as { revokedCount: number }).revokedCount).toBeGreaterThan(0);

        expectConforms(
          'identityRevokeOtherSessions',
          await app.request({ method: 'POST', url: '/auth/sessions/revoke-others' }),
        );
      });
    });

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
        // Asserted HERE as well as in the ledger, on the route that used to
        // show the two error models side by side: a problem body leaves as a
        // problem document, media type included.
        expect(mediaTypeOf(response)).toBe('application/problem+json');
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
          'identityChangePassword 200',
          'identityChangePassword 400',
          'identityChangePassword 401',
          'identityForgotPassword 202',
          'identityForgotPassword 429',
          'identityListSessions 200',
          'identityListSessions 401',
          'identityLogin 200',
          'identityLogin 401',
          'identityLogin 429',
          'identityLogin 503',
          'identityLogout 200',
          'identityLogout 401',
          'identityMfaChallenge 200',
          'identityMfaChallenge 401',
          'identityMfaChallenge 429',
          'identityMfaConfirm 200',
          'identityMfaConfirm 401',
          'identityMfaConfirm 409',
          'identityMfaDisable 200',
          'identityMfaDisable 401',
          'identityMfaDisable 409',
          'identityMfaEnroll 200',
          'identityMfaEnroll 401',
          'identityMfaEnroll 409',
          'identityMfaRecovery 200',
          'identityMfaRecovery 401',
          'identityMfaRecovery 429',
          'identityRefresh 200',
          'identityRefresh 401',
          'identityRefresh 429',
          'identityRegister 202',
          'identityRegister 400',
          'identityRegister 429',
          'identityRegister 503',
          'identityResendVerification 202',
          'identityResendVerification 429',
          'identityResetPassword 400',
          'identityResetPassword 401',
          'identityRevokeOtherSessions 200',
          'identityRevokeOtherSessions 401',
          'identityRevokeSession 200',
          'identityRevokeSession 401',
          'identityRevokeSession 404',
          'identityVerifyEmail 401',
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

      it('served EVERY problem body as application/problem+json — no deviations at all', () => {
        // Was 25. The expected value is the empty set now, and it stays that
        // way: a handler that answers a problem through the reply object again
        // is named here, with its status, on the next run.
        expect(
          [...observedDeviations].sort(),
          'these responses carried an RFC 7807 body under application/json; every problem ' +
            'document must leave through the writer in apps/api/src/errors/problem-response.ts',
        ).toEqual([]);
      });
    });
  },
);
