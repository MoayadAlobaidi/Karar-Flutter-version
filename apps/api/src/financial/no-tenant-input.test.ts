// THE PRINCIPAL COMES FROM THE SESSION, AND NOTHING ELSE.
//
// Every operation on the financial surface acts for the authenticated
// principal. That is a claim about the SOURCE TREE — "no code path reads
// subject or tenant identity from a request" — and a claim about a source
// tree cannot be observed by exercising any single response: a handler that
// honoured `?userId=` on one route would pass every behavioural test written
// against the other twenty-six.
//
// So this scans. It is the same shape of control as
// apps/api/src/errors/problem-media-type-exclusivity.test.ts, and for the
// same reason: the property is "no second place does this".
//
// The behavioural half lives in the runtime conformance suite, where a real
// request carrying `?userId=`, `?tenantId=` and an `x-tenant-id` header is
// answered exactly as the same request without them.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// __dirname: this package compiles to CommonJS (vitest provides it in-runner),
// the same convention as main-boot.test.ts and the media-type scan.
const HERE = __dirname;
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');

/**
 * Everything that answers a financial request, plus the two composition files
 * that wire it. The rest of `composition/` belongs to earlier phases and is
 * covered by their own controls; widening this scan to it would report their
 * `subject.tenantId` reads — which come from a session, not a request — as
 * violations, and a scan that cries wolf is a scan somebody deletes.
 */
const SCANNED_ROOTS = [path.join('apps', 'api', 'src', 'financial')];
const SCANNED_FILES = [
  path.join('apps', 'api', 'src', 'composition', 'phase5-modules.ts'),
  path.join('apps', 'api', 'src', 'composition', 'financial-account-access.ts'),
];

/** The ONE file allowed to resolve a principal, and where it reads it from. */
const PRINCIPAL_SOURCE = path.join('apps', 'api', 'src', 'financial', 'principal.ts');

function sourceFiles(root: string): string[] {
  const absolute = path.join(REPO_ROOT, root);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'dist' || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      found.push(path.relative(REPO_ROOT, full));
    }
  };
  walk(absolute);
  return found;
}

const FILES = [...SCANNED_ROOTS.flatMap(sourceFiles), ...SCANNED_FILES];

/** Source with comments removed: the property is what the CODE does. */
function code(file: string): string {
  return readFileSync(path.join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Reading an identity out of a request-shaped container. Matches the ways a
 * handler could actually do it — a bracket or dot access on something named
 * for the request, the query, the body, the params or the headers.
 */
const IDENTITY_FROM_REQUEST =
  /\b(query|body|params|headers|request|req|source|raw)\s*(?:\.\s*(?:userId|tenantId|user_id|tenant_id)\b|\[\s*['"](?:userId|tenantId|user_id|tenant_id|x-tenant-id|x-user-id)['"]\s*\])/i;

describe('the financial surface reads identity only from the session', () => {
  it('scanned a real source tree — the check is not vacuous', () => {
    // Without this, a broken walker makes every assertion below pass by
    // finding nothing, which is the failure mode every absence scan has.
    expect(FILES.length).toBeGreaterThan(15);
    expect(FILES).toContain(PRINCIPAL_SOURCE);
    expect(FILES).toContain(path.join('apps', 'api', 'src', 'financial', 'account-input.ts'));
    expect(FILES).toContain(
      path.join('apps', 'api', 'src', 'financial', 'financial-accounts.controller.ts'),
    );
    expect(FILES).toContain(path.join('apps', 'api', 'src', 'composition', 'phase5-modules.ts'));
  });

  it('reads no userId or tenantId out of any query, body, header, or param', () => {
    const offenders = FILES.filter((file) => IDENTITY_FROM_REQUEST.test(code(file)));
    expect(
      offenders,
      'the principal comes from the session binding; a request field naming a subject or a ' +
        'tenant must not be consulted anywhere on this surface',
    ).toEqual([]);
  });

  it('proves the scanner would catch it — a seeded read is rejected', () => {
    // The control that makes the assertion above mean something: the same
    // predicate, against the shape it exists to forbid.
    expect(IDENTITY_FROM_REQUEST.test("const who = query['userId'];")).toBe(true);
    expect(IDENTITY_FROM_REQUEST.test('const t = request.tenantId;')).toBe(true);
    expect(IDENTITY_FROM_REQUEST.test("const t = headers['x-tenant-id'];")).toBe(true);
    expect(IDENTITY_FROM_REQUEST.test("const id = source['accountId'];")).toBe(false);
  });

  it('names the session as the only identity source, in exactly one file', () => {
    // `tenantBoundPrincipalFrom` reads the request key the enrichment guard
    // wrote from the SESSION ROW, and nothing else on this surface calls it.
    const callers = FILES.filter((file) => code(file).includes('tenantBoundPrincipalFrom'));
    expect(callers).toEqual([PRINCIPAL_SOURCE]);
  });

  it('never sets the problem media type — the boundary owns it', () => {
    // A second writer is how twenty-five operation/status pairs once served
    // RFC 7807 bodies under application/json.
    const naming = FILES.filter((file) => code(file).includes('problem+json'));
    expect(naming).toEqual([]);
  });
});
