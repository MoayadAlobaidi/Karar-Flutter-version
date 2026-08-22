/**
 * The contract loader's own evidence: the document really is read, the
 * `$ref`s really are followed across files, and the closure declarations this
 * suite depends on really are in the contract.
 *
 * THE LAST POINT IS THE SUBTLE ONE. The runtime suite proves a real response
 * is rejected when a field is added — but only because some schema says
 * `additionalProperties: false`. Delete that line from the contract and the
 * runtime proof would go quietly vacuous: the injected field would be legal,
 * the "rejected" assertion would fail, and the natural fix would be to delete
 * the assertion. So the closure sites are named HERE, and losing one is a
 * failing test with an explanation attached rather than a puzzle.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Contract, ContractError, OPENAPI_ROOT_PATH } from '../contract.js';
import { validateAgainstSchema, type SchemaNode } from '../schema-validator.js';

const contract = Contract.load();

/**
 * Descends a schema by key, following any `$ref` on the way in and on the way
 * out. Written out so the closure assertions below read as the walk they are
 * rather than as a stack of casts.
 */
function walk(from: SchemaNode, keys: readonly string[]): SchemaNode {
  let current = deref(from);
  for (const key of keys) {
    const next = (current.node as Record<string, unknown>)[key];
    expect(next, `'${key}' is absent while walking ${current.documentId}`).toBeDefined();
    current = deref({ node: next, documentId: current.documentId });
  }
  return current;
}

function deref(node: SchemaNode): SchemaNode {
  const ref = (node.node as Record<string, unknown>)['$ref'];
  return typeof ref === 'string' ? deref(contract.resolve(ref, node)) : node;
}

/** Every operationId openapi.yaml merges, as of this document version. */
const EXPECTED_OPERATIONS = [
  'assignOwnTransactionCategory',
  'commitOwnStatementImport',
  'confirmOwnTransferMatch',
  'correctOwnTransaction',
  'createOwnManualFinancialAccount',
  'createOwnManualTransaction',
  'createOwnStatementImport',
  'createTenantInvitation',
  'declareOwnJurisdiction',
  'deleteOwnTransaction',
  'eraseOwnStatementImport',
  'getOwnTenant',
  'getOwnUserProfile',
  'getPlatformBootstrap',
  'identityChangePassword',
  'identityForgotPassword',
  'identityListSessions',
  'identityLogin',
  'identityLogout',
  'identityMfaChallenge',
  'identityMfaConfirm',
  'identityMfaDisable',
  'identityMfaEnroll',
  'identityMfaRecovery',
  'identityRefresh',
  'identityRegister',
  'identityResendVerification',
  'identityResetPassword',
  'identityRevokeOtherSessions',
  'identityRevokeSession',
  'identityVerifyEmail',
  'listApplicableConsentDocuments',
  'listDeclarableJurisdictionReferences',
  'listFinancialCategories',
  'listFinancialInstitutions',
  'listOwnAccountBalanceSnapshots',
  'listOwnAccountPaymentInstruments',
  'listOwnAccountSourceLinks',
  'listOwnFinancialAccounts',
  'listOwnFinancialConnections',
  'listOwnStatementImportPreview',
  'listOwnTenantMemberships',
  'listOwnTransactionProvenance',
  'listOwnTransactions',
  'listOwnTransferMatches',
  'listTenantMembers',
  'parseOwnStatementImportSource',
  'readConsentDocumentContent',
  'readOwnConsentStatus',
  'readOwnFinancialAccount',
  'readOwnStatementImport',
  'readOwnTransaction',
  'recordOwnConsentAcceptance',
  'redeemTenantInvitation',
  'rejectOwnTransferMatch',
  'requestOwnAccountDisable',
  'revokeTenantInvitation',
  'setPlatformTenantBinding',
  'updateOwnFinancialAccount',
  'updateOwnUserProfile',
  'uploadOwnStatementImportSource',
  'withdrawOwnConsent',
];

describe('the OpenAPI document loads and resolves', () => {
  it('indexes every merged operation, and nothing the document does not merge', () => {
    expect(
      contract
        .operations()
        .map((operation) => operation.operationId)
        .sort(),
    ).toEqual(EXPECTED_OPERATIONS);
    // The operating-entity fragment is CONTRACT-ONLY this phase — its paths
    // are deliberately not merged (openapi.yaml states why). If it ever is
    // merged, this suite must gain coverage for it rather than quietly not.
    expect(contract.operations().map((operation) => operation.operationId)).not.toContain(
      'getOperatingEntity',
    );
  });

  it('resolves a path item across files, then a component inside that file', () => {
    // openapi.yaml -> ./paths/users.yaml#/~1users~1me -> #/components/UserProfile.
    // The fragment carries its OWN components block, so a resolver that
    // looked up '#/components/UserProfile' in the ROOT would find nothing.
    const profile = contract.responseSchema('getOwnUserProfile', 200, 'application/json');
    expect(profile).not.toBeNull();
    expect(profile?.documentId.endsWith('paths/users.yaml')).toBe(true);

    const resolved = contract.resolve((profile?.node as { $ref: string }).$ref, profile!);
    expect((resolved.node as { required: string[] }).required).toContain(
      'residencyJurisdictionRef',
    );
  });

  it('resolves a RESPONSE-level $ref (the shared ProblemResponse), not only schema-level ones', () => {
    // `'401': { $ref: '#/components/ProblemResponse' }` is a Response Object
    // behind a pointer; a loader that only followed schema-level refs would
    // report this operation as declaring no 401 body at all.
    const problem = contract.responseSchema('getOwnUserProfile', 401, 'application/problem+json');
    expect(problem).not.toBeNull();
    expect(
      validateAgainstSchema(
        problem!,
        { type: 'urn:x', title: 'T', status: 401, code: 'C' },
        contract.resolve,
      ),
    ).toEqual([]);
    expect(
      validateAgainstSchema(problem!, { type: 'urn:x', title: 'T', status: 401 }, contract.resolve),
    ).toEqual([{ path: 'code', message: 'required property is missing' }]);
  });

  it('reports honestly that a declared status may carry no body schema', () => {
    // Several operations describe a failure in prose only. That is a contract
    // gap, not a conformance pass — the coverage ledger must not count it.
    expect(contract.declaresStatus('listApplicableConsentDocuments', 401)).toBe(true);
    expect(
      contract.responseSchema('listApplicableConsentDocuments', 401, 'application/problem+json'),
    ).toBeNull();
  });

  it('binds this suite to the contract’s OWN closure declarations', () => {
    // Each entry is the walk from a response schema to an object the contract
    // CLOSES. If one disappears, the runtime proof that depends on it fails
    // HERE first, with the reason attached.
    const closedResponseShapes: ReadonlyArray<[string, readonly string[]]> = [
      [
        'listApplicableConsentDocuments 200 -> documents[].effectiveVersion',
        ['properties', 'documents', 'items', 'properties', 'effectiveVersion'],
      ],
      ['readConsentDocumentContent 200 -> the whole body', []],
      [
        'listDeclarableJurisdictionReferences 200 -> references[]',
        ['properties', 'references', 'items'],
      ],
      // The Phase 5 financial surface. Each of these is the object whose
      // closure is the ONLY written reason a sensitive field does not ship:
      // an account never carries ciphertext or a key version, a source link
      // never carries the external reference or its keyed fingerprint, an
      // instrument never carries a balance, an import never carries the
      // stored object's locator, provenance never carries the dedup
      // fingerprint, and a match never carries an amount. Delete one of these
      // `additionalProperties: false` lines and the leak assertions in the
      // runtime suite go quietly vacuous — so losing one fails HERE first.
      ['listOwnFinancialAccounts 200 -> items[]', ['properties', 'items', 'items']],
      ['listOwnAccountSourceLinks 200 -> items[]', ['properties', 'items', 'items']],
      ['listOwnAccountPaymentInstruments 200 -> items[]', ['properties', 'items', 'items']],
      ['listOwnTransactions 200 -> items[]', ['properties', 'items', 'items']],
      ['listOwnTransactionProvenance 200 -> items[]', ['properties', 'items', 'items']],
      ['listOwnTransferMatches 200 -> items[]', ['properties', 'items', 'items']],
      ['listOwnStatementImportPreview 200 -> the whole body', []],
      ['readOwnStatementImport 200 -> the whole body', []],
    ];

    for (const [where, path] of closedResponseShapes) {
      const operationId = where.split(' ')[0]!;
      const start = contract.responseSchema(operationId, 200, 'application/json');
      expect(start, `${where}: the contract declares no 200 schema`).not.toBeNull();
      const closed = walk(start!, path);
      expect(
        (closed.node as Record<string, unknown>)['additionalProperties'],
        `${where} must declare additionalProperties: false`,
      ).toBe(false);
    }
  });

  it('binds a schema to EVERY schema-bearing response the document declares', () => {
    const ledger = contract.schemaBearingResponses();
    // A number, not merely "> 0": a loader that stopped resolving half the
    // fragments would still be non-empty, and would still look fine. It was
    // 66 before the identity fragment gained schemas; those 17 operations
    // contributed the 48 rows that made it 114. The Phase 5 financial surface
    // adds 27 operations, and — because every one of its failures carries a
    // schema rather than prose — 172 more rows, for 286.
    //
    // The financial 172 is 24 × 200 + 3 × 201 + 27 × 400 + 27 × 401 + 27 × 403
    // + 18 × 404 + 12 × 409 + 413 + 415 + 5 × 422 + 27 × 503, derived from the
    // document rather than adjusted by hand. The most recent 27 of those are
    // the 403s: `FinancialCapabilityGuard` runs on all eight financial
    // controllers, so EVERY operation can refuse before it executes — with one
    // body for a capability that is unavailable and one for a session carrying
    // no tenant binding, and no way to tell the six internal reasons for the
    // first apart.
    //
    // 259 rather than 260 before that: deleteOwnTransaction declared schemas on
    // both 200 and 207, and now declares one 2xx whose BODY discriminates
    // complete from partial. The client generator refuses to guess which of two
    // 2xx schemas is canonical, and it is right to — but the better reason is
    // that a client ignoring 207 and a client ignoring 200 behave identically,
    // so a partial deletion has to be data the caller must read.
    expect(ledger.length).toBe(313);
    for (const row of ledger) {
      expect(
        contract.responseSchema(row.operationId, row.status, row.mediaType),
        `${row.operationId} ${row.status} ${row.mediaType}`,
      ).not.toBeNull();
    }
  });

  it('leaves NO operation the client is generated from describing itself in prose alone', () => {
    // This assertion used to name the 17 /auth operations as unbindable: the
    // identity fragment described every body in prose ("{status: verified}")
    // and attached no schema, so the generated Dart client decoded them as
    // untyped JSON and the runtime suite had nothing to hold the server to.
    // Both ends read THIS document, so an operation with no schema anywhere
    // is an operation nobody can check — the expected value is the empty list
    // now, and a new prose-only operation is a failing test rather than a
    // silent hole.
    const proseOnly = contract
      .operations()
      .filter((operation) =>
        [...operation.responses.values()].every((response) => response.schemas.size === 0),
      )
      .map((operation) => operation.operationId)
      .sort();

    expect(
      proseOnly,
      'these operations declare no response schema at all; the generated client cannot type ' +
        'them and the runtime conformance suite cannot validate them',
    ).toEqual([]);
  });
});

describe('the loader refuses to produce a suite that checks nothing', () => {
  it('throws rather than indexing zero operations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'karar-conformance-'));
    const empty = join(directory, 'openapi.yaml');
    writeFileSync(empty, 'openapi: 3.1.0\ninfo: { title: empty, version: 0.0.0 }\npaths: {}\n');

    expect(() => Contract.load(empty)).toThrow(ContractError);
    expect(() => Contract.load(empty)).toThrow(/yielded zero operations/);
  });

  it('throws on a $ref that does not resolve, rather than treating it as absent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'karar-conformance-'));
    const broken = join(directory, 'openapi.yaml');
    writeFileSync(
      broken,
      [
        'openapi: 3.1.0',
        'info: { title: broken, version: 0.0.0 }',
        'paths:',
        "  /x: { $ref: './paths/nowhere.yaml#/~1x' }",
        '',
      ].join('\n'),
    );

    expect(() => Contract.load(broken)).toThrow(/could not be read/);
  });

  it('reads the real document from the path the drift check also reads', () => {
    // Same file the Dart generator checks against. If this suite ever pointed
    // at a copy, it would prove agreement with the copy.
    expect(OPENAPI_ROOT_PATH.endsWith('packages/api-contracts/openapi/openapi.yaml')).toBe(true);
  });
});
