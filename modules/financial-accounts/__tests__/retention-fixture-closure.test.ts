/**
 * The synthetic retention values are not in the production build, and not in
 * the production dependency closure — asserted against the artefacts, not
 * against the intention.
 *
 * WHY THIS SUITE EXISTS. The values used to sit in each module's
 * `infrastructure/providers/`, guarded by an environment check in the same
 * file. The check was real, but the VALUES shipped anyway: they were in
 * `@karar/financial-accounts` and `@karar/transactions`'s emitted JavaScript,
 * their declaration files and their source maps, in every environment that
 * installed either module. `modules/consent` hit this first and its
 * `production-closure.test.ts` states the principle: protection that consists
 * only of a deployed process declining to read values it is holding is one
 * composition change away from being no protection at all.
 *
 * A fabricated approval reference is worse to ship than fabricated document
 * text. It is shaped exactly like the real thing, it names an approval nobody
 * gave, and its entire purpose is to satisfy a gate that exists to stop
 * financial records being kept under a decision no one took.
 *
 * WHAT IS ASSERTED.
 *
 *   1. THE BUILT OUTPUT. Every `dist/` reachable from `@karar/api` through
 *      `dependencies` is read and searched for the fixture's own values. There
 *      is no carve-out for compiled test output or source maps: `tsc` emits
 *      both into the same `dist/` a deployment ships, so a value typed into a
 *      test travels exactly as far as one typed into source. That is not
 *      hypothetical here — it is how the first version of this fix still
 *      leaked, through four test files and a doc comment.
 *
 *   2. THE DEPENDENCY CLOSURE. Manifests are walked through `dependencies`
 *      only, never `devDependencies`. The fixture package must appear in no
 *      package's `dependencies` anywhere in the workspace. This is what makes
 *      (1) hold for installs this repository has not built yet.
 *
 *   3. NO STATIC EDGE. Both providers resolve the package at runtime inside
 *      their local-only branch. In non-test production output the specifier
 *      must therefore never appear as a static `import ... from`, which would
 *      put the package in the module graph and make a production install —
 *      which does not have it — fail to boot.
 *
 *   4. A POSITIVE CONTROL. The same scanner, pointed at the fixture package's
 *      own `dist/`, must find every needle. Without it this suite could pass
 *      by searching for strings that no longer exist anywhere, which is the
 *      failure mode every absence test has.
 *
 * The needles are IMPORTED from the fixture package, never typed here: a copy
 * typed into this file would be compiled into
 * `modules/financial-accounts/dist/__tests__/` and would itself become a hit.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE,
  ACCOUNT_SYNTHETIC_BASIS,
  ACCOUNT_SYNTHETIC_PACK_VERSION,
  SYNTHETIC_RETENTION_MARKER,
  TRANSACTION_SYNTHETIC_BASIS,
} from '@karar/financial-retention-local-fixtures';

import { LOCAL_FIXTURE_PACKAGE } from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const API_PACKAGE = '@karar/api';
const ACCOUNTS_PACKAGE = '@karar/financial-accounts';
const TRANSACTIONS_PACKAGE = '@karar/transactions';

/**
 * The ISO periods are deliberately NOT needles. `P0D` and `P7D` are three
 * characters and occur by chance in base64 source-map payloads, so a hit on
 * either would be noise rather than evidence. The marker, the two basis texts,
 * the approval reference and the pack version are long and unique, and every
 * one of them carries the marker or names the fixture outright — a leak of a
 * period without any of those is not a leak of this fixture.
 */
const NEEDLES: ReadonlyArray<{ what: string; value: string }> = [
  { what: 'the fixture marker', value: SYNTHETIC_RETENTION_MARKER },
  { what: 'the account basis text', value: ACCOUNT_SYNTHETIC_BASIS },
  { what: 'the fabricated approval reference', value: ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE },
  { what: 'the fabricated pack version', value: ACCOUNT_SYNTHETIC_PACK_VERSION },
  { what: 'the transaction basis text', value: TRANSACTION_SYNTHETIC_BASIS },
];

interface Manifest {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Manifest;
}

/** Every workspace package, discovered from `pnpm-workspace.yaml` rather than a list kept here. */
function workspacePackages(): Map<string, string> {
  const yaml = fs.readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const block = /^packages:\n((?:\s*-\s*.*\n|\s*#.*\n)*)/m.exec(yaml);
  expect(block, 'pnpm-workspace.yaml has no packages: block').not.toBeNull();
  const globs = [...(block?.[1] ?? '').matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1] ?? '');
  expect(globs.length, 'no workspace globs parsed').toBeGreaterThan(0);

  const found = new Map<string, string>();
  for (const glob of globs) {
    if (glob.startsWith('!')) continue;
    const [root, star, ...rest] = glob.split('/');
    expect(
      star === '*' && rest.length === 0 && root !== undefined,
      `workspace glob '${glob}' is not <root>/* — teach this test the new shape`,
    ).toBe(true);
    const rootDir = path.join(REPO_ROOT, root ?? '');
    if (!fs.existsSync(rootDir)) continue;
    for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(rootDir, entry.name);
      if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
      const name = readManifest(dir).name;
      if (name !== undefined) found.set(name, dir);
    }
  }
  return found;
}

const PACKAGES = workspacePackages();

/** The PRODUCTION closure: `dependencies` only, transitively. `devDependencies` are the mechanism. */
function productionClosure(entry: string): Set<string> {
  const closure = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || closure.has(name)) continue;
    closure.add(name);
    const dir = PACKAGES.get(name);
    if (dir === undefined) continue;
    for (const dep of Object.keys(readManifest(dir).dependencies ?? {})) {
      if (!closure.has(dep)) pending.push(dep);
    }
  }
  return closure;
}

function distFiles(dir: string): string[] {
  const dist = path.join(dir, 'dist');
  if (!fs.existsSync(dist)) return [];
  const out: string[] = [];
  const stack = [dist];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function scan(files: readonly string[]): Array<{ file: string; what: string }> {
  const hits: Array<{ file: string; what: string }> = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const { what, value } of NEEDLES) {
      if (text.includes(value)) hits.push({ file: path.relative(REPO_ROOT, file), what });
    }
  }
  return hits;
}

const isTestOutput = (file: string): boolean =>
  /[\\/]__tests__[\\/]/.test(file) || /\.(?:test|spec)\.[cm]?[jt]s$/.test(file);

describe('the synthetic retention fixture is absent from production', () => {
  /**
   * The scanned set is the union of three production closures: the deployed
   * runtime's, and each financial module's own.
   *
   * Neither module is in `@karar/api`'s closure today, and that is not an
   * oversight — nothing composes them yet, which is the whole point of the
   * Phase 5 foundation being unreachable. Scanning only the API closure would
   * therefore scan neither module and pass vacuously. Scanning them directly
   * covers them now, and the API closure is in the union so that the day they
   * ARE wired the deployed artefact is already covered, with no edit here.
   */
  const closure = new Set([
    ...productionClosure(API_PACKAGE),
    ...productionClosure(ACCOUNTS_PACKAGE),
    ...productionClosure(TRANSACTIONS_PACKAGE),
  ]);
  const closureDirs = [...closure]
    .map((name) => ({ name, dir: PACKAGES.get(name) }))
    .filter((entry): entry is { name: string; dir: string } => entry.dir !== undefined);
  const closureFiles = closureDirs.flatMap(({ dir }) => distFiles(dir));

  it('walked a real closure and a real build — the scan is not vacuous', () => {
    expect([...closure]).toContain(ACCOUNTS_PACKAGE);
    expect([...closure]).toContain(TRANSACTIONS_PACKAGE);
    expect([...closure]).toContain(API_PACKAGE);
    expect(closureDirs.length).toBeGreaterThan(5);

    for (const pkg of [ACCOUNTS_PACKAGE, TRANSACTIONS_PACKAGE]) {
      const dir = PACKAGES.get(pkg);
      expect(dir, `${pkg} is not a workspace package`).toBeDefined();
      expect(
        distFiles(dir ?? '').length,
        `no built output under ${pkg}/dist — run \`pnpm build\` first; an unbuilt tree would let ` +
          'this test pass by finding nothing to search',
      ).toBeGreaterThan(0);
    }
    expect(closureFiles.length).toBeGreaterThan(100);
    // The compiled TESTS are inside the scanned set, deliberately.
    expect(closureFiles.some(isTestOutput)).toBe(true);
  });

  it('finds every needle in the fixture package itself — the scanner works', () => {
    const fixtureDir = PACKAGES.get(LOCAL_FIXTURE_PACKAGE);
    expect(fixtureDir, `${LOCAL_FIXTURE_PACKAGE} is not a workspace package`).toBeDefined();
    const files = distFiles(fixtureDir ?? '');
    expect(files.length, `no built output under ${LOCAL_FIXTURE_PACKAGE}/dist`).toBeGreaterThan(0);
    const found = new Set(scan(files).map((hit) => hit.what));
    expect([...found].sort()).toStrictEqual([...NEEDLES.map((n) => n.what)].sort());
  });

  it('searches for values long enough to be evidence', () => {
    for (const { what, value } of NEEDLES) {
      expect(value.length, `${what} is too short to be evidence of a leak`).toBeGreaterThan(12);
    }
    // Each needle names the fixture, so a hit cannot be innocent prose.
    expect(ACCOUNT_SYNTHETIC_BASIS).toContain(SYNTHETIC_RETENTION_MARKER);
    expect(ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE).toContain(SYNTHETIC_RETENTION_MARKER);
    expect(ACCOUNT_SYNTHETIC_PACK_VERSION).toContain(SYNTHETIC_RETENTION_MARKER);
    expect(TRANSACTION_SYNTHETIC_BASIS).toContain(SYNTHETIC_RETENTION_MARKER);
  });

  it('the fixture package is in NO production dependency closure', () => {
    expect([...productionClosure(API_PACKAGE)]).not.toContain(LOCAL_FIXTURE_PACKAGE);
    expect([...productionClosure(ACCOUNTS_PACKAGE)]).not.toContain(LOCAL_FIXTURE_PACKAGE);
    expect([...productionClosure(TRANSACTIONS_PACKAGE)]).not.toContain(LOCAL_FIXTURE_PACKAGE);

    const offenders = [...PACKAGES.entries()]
      .filter(([, dir]) => LOCAL_FIXTURE_PACKAGE in (readManifest(dir).dependencies ?? {}))
      .map(([name]) => name);
    expect(
      offenders,
      `${LOCAL_FIXTURE_PACKAGE} is a production dependency of these packages — it must only ever ` +
        'be a devDependency',
    ).toStrictEqual([]);
  });

  it('is a devDependency of both modules that resolve it', () => {
    // The positive half: absent from production is only meaningful if the
    // packages that need it in development actually declare it.
    for (const pkg of [ACCOUNTS_PACKAGE, TRANSACTIONS_PACKAGE]) {
      const dir = PACKAGES.get(pkg) ?? '';
      expect(Object.keys(readManifest(dir).devDependencies ?? {})).toContain(LOCAL_FIXTURE_PACKAGE);
    }
  });

  it('no fixture value appears anywhere in the production build', () => {
    expect(scan(closureFiles)).toStrictEqual([]);
  });

  it('no production file takes a static import edge on the fixture package', () => {
    const production = closureFiles.filter((file) => !isTestOutput(file) && /\.[cm]?js$/.test(file));
    const staticEdge = new RegExp(
      `(?:^|[\\s;])(?:import|export)[^;\\n]*from\\s*['"]${LOCAL_FIXTURE_PACKAGE}['"]`,
    );
    const offenders = production
      .filter((file) => staticEdge.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO_ROOT, file));
    expect(
      offenders,
      'a static import would put the fixture package in the module graph, and a production ' +
        'install does not have it — resolve it at runtime inside the local-only branch instead',
    ).toStrictEqual([]);
  });
});
