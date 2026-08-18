/**
 * The synthetic consent fixture is not in the production build, and not in the
 * production dependency closure — asserted against the artefacts, not against
 * the intention.
 *
 * WHY THIS SUITE EXISTS. The fixture used to sit in
 * `modules/consent/infrastructure/content/`, guarded by an environment check in
 * the same file. That check was real, but the TEXT shipped anyway: it was in
 * `@karar/consent`'s emitted JavaScript, its declaration files and its source
 * maps, in every environment that installed the module. Protection that
 * consists only of a deployed process declining to read bytes it is holding is
 * one composition change away from being no protection at all. The requirement
 * is stronger than "refuses": the bytes must not be there.
 *
 * WHAT IS ASSERTED, AND WHY EACH PART IS NEEDED.
 *
 *   1. THE BUILT OUTPUT. Every `dist/` of every workspace package reachable
 *      from `@karar/api` through `dependencies` is read byte for byte and
 *      searched for the fixture's own constants — its marker, its storage
 *      reference and scheme, its document and version ids, its version string,
 *      and its whole text. There is NO carve-out for compiled test output or
 *      source maps: `tsc` emits both into the same `dist/` a deployment ships,
 *      a fixture constant typed into a test would travel exactly as far as one
 *      typed into source, and a map would carry the original TypeScript in
 *      full the day `inlineSources` is switched on. A needle found anywhere in
 *      there is a hit.
 *
 *   2. THE DEPENDENCY CLOSURE. The manifests are walked through `dependencies`
 *      only — never `devDependencies` — from `@karar/api` and again from
 *      `@karar/consent`. `@karar/consent-local-fixtures` must appear in
 *      neither, and in no package's `dependencies` anywhere in the workspace.
 *      This is what makes (1) hold for installs this repository has not built
 *      yet: a production install has no copy of the package to compile,
 *      resolve, or read.
 *
 *   3. NO STATIC EDGE. The consent module resolves the fixture package
 *      optionally, at runtime, inside the local/test branch. So the specifier
 *      appears once in production output — and must appear ONLY as that
 *      guarded runtime resolution. A static `import ... from` or a top-level
 *      dynamic `import()` would put the package into the module graph, and a
 *      production install (which does not have it) would fail to boot.
 *
 *   4. A POSITIVE CONTROL. The same scanner, pointed at the fixture package's
 *      OWN `dist/`, must find every needle. Without this the suite could pass
 *      by searching for strings that no longer exist anywhere, which is the
 *      failure mode every absence test has.
 *
 * The needles are IMPORTED from the fixture package rather than typed out.
 * That is not a convenience: a copy typed here would be compiled into
 * `modules/consent/dist/__tests__/` and would itself become a hit, and a
 * reworded fixture would leave this suite passing against a string nothing
 * contains any more. For the same reason no literal below quotes the fixture.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LOCAL_SEED_CONTENT,
  LOCAL_SEED_DOCUMENT_ID,
  LOCAL_SEED_FIXTURE_MARKER,
  LOCAL_SEED_STORAGE_REF,
  LOCAL_SEED_STORAGE_SCHEME,
  LOCAL_SEED_VERSION,
  LOCAL_SEED_VERSION_ID,
} from '@karar/consent-local-fixtures';

import { LOCAL_FIXTURE_PACKAGE } from '../infrastructure/content/local-seed-content-source.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The deployed runtime artefact, and the module this suite belongs to. */
const API_PACKAGE = '@karar/api';
const CONSENT_PACKAGE = '@karar/consent';

/**
 * What a hit means, keyed by what it would be evidence of. Every value comes
 * from the fixture package, so the set cannot drift away from the fixture it
 * describes.
 */
const NEEDLES: ReadonlyArray<{ what: string; value: string }> = [
  { what: 'the fixture marker', value: LOCAL_SEED_FIXTURE_MARKER },
  { what: 'the fixture text', value: LOCAL_SEED_CONTENT.content },
  { what: 'the fixture storage reference', value: LOCAL_SEED_STORAGE_REF },
  { what: 'the fixture storage scheme', value: LOCAL_SEED_STORAGE_SCHEME },
  { what: 'the fixture document id', value: LOCAL_SEED_DOCUMENT_ID },
  { what: 'the fixture version id', value: LOCAL_SEED_VERSION_ID },
  { what: 'the fixture version string', value: LOCAL_SEED_VERSION },
];

interface Manifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function readManifest(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Manifest;
}

/**
 * Every workspace package, discovered the way pnpm discovers them — from
 * `pnpm-workspace.yaml` rather than from a list kept here. A root added to the
 * workspace but not to this test would otherwise go unscanned, which is
 * exactly the gap an absence test must not have.
 */
function workspacePackages(): Map<string, string> {
  const yaml = fs.readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const block = /^packages:\n((?:\s*-\s*.*\n|\s*#.*\n)*)/m.exec(yaml);
  expect(block, 'pnpm-workspace.yaml has no packages: block').not.toBeNull();

  const globs = [...(block?.[1] ?? '').matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1] ?? '');
  expect(globs.length, 'no workspace globs parsed from pnpm-workspace.yaml').toBeGreaterThan(0);

  const found = new Map<string, string>();
  for (const glob of globs) {
    // Negations narrow the set; a package they exclude cannot be a production
    // dependency of one that is included, so skipping them is safe.
    if (glob.startsWith('!')) continue;
    const [root, star, ...rest] = glob.split('/');
    // Every glob in this workspace is `<root>/*`. If that ever stops being
    // true, fail here rather than silently scanning a subset.
    expect(
      star === '*' && rest.length === 0 && root !== undefined,
      `workspace glob '${glob}' is not of the form <root>/* — this test must be taught the new shape`,
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

/**
 * The PRODUCTION closure: `dependencies` only, transitively, over workspace
 * packages. `devDependencies` are deliberately not followed — they are the
 * whole mechanism by which the fixture stays out of a deployment.
 */
function productionClosure(entry: string): Set<string> {
  const closure = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || closure.has(name)) continue;
    closure.add(name);
    const dir = PACKAGES.get(name);
    if (dir === undefined) continue; // an external (registry) dependency
    for (const dep of Object.keys(readManifest(dir).dependencies ?? {})) {
      if (!closure.has(dep)) pending.push(dep);
    }
  }
  closure.delete(entry);
  closure.add(entry);
  return closure;
}

/** Every file under a package's `dist/`, tests, declarations and maps included. */
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

interface Hit {
  readonly file: string;
  readonly what: string;
}

function scan(files: readonly string[]): Hit[] {
  const hits: Hit[] = [];
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

describe('the synthetic consent fixture is absent from production', () => {
  const closure = productionClosure(API_PACKAGE);
  const closureDirs = [...closure]
    .map((name) => ({ name, dir: PACKAGES.get(name) }))
    .filter((entry): entry is { name: string; dir: string } => entry.dir !== undefined);
  const closureFiles = closureDirs.flatMap(({ dir }) => distFiles(dir));

  it('walked a real closure and a real build — the scan is not vacuous', () => {
    // An absence test that searched nothing would pass. These are the guards
    // that make the assertions below mean something.
    expect(closure).toContain(CONSENT_PACKAGE);
    expect(closure).toContain('@karar/platform');
    expect(closureDirs.length).toBeGreaterThan(5);

    const consentDir = PACKAGES.get(CONSENT_PACKAGE);
    expect(consentDir, 'the consent module is not a workspace package').toBeDefined();
    expect(
      distFiles(consentDir ?? '').length,
      `no built output under ${CONSENT_PACKAGE}/dist — run \`pnpm -r build\` before this suite; ` +
        'an unbuilt tree would let this test pass by finding nothing to search',
    ).toBeGreaterThan(0);
    expect(closureFiles.length).toBeGreaterThan(100);

    // The compiled TESTS are inside the scanned set too. That is deliberate:
    // `tsc` emits them into the same `dist/` a deployment copies, so a fixture
    // constant typed into a test would ship exactly as one typed into source.
    expect(closureFiles.some(isTestOutput)).toBe(true);
  });

  it('finds every needle in the fixture package itself — the scanner works', () => {
    // The positive control. Without it, a reworded or renamed fixture would
    // leave the assertions below passing against strings nothing contains.
    const fixtureDir = PACKAGES.get(LOCAL_FIXTURE_PACKAGE);
    expect(fixtureDir, `${LOCAL_FIXTURE_PACKAGE} is not a workspace package`).toBeDefined();
    const files = distFiles(fixtureDir ?? '');
    expect(
      files.length,
      `no built output under ${LOCAL_FIXTURE_PACKAGE}/dist — run \`pnpm -r build\``,
    ).toBeGreaterThan(0);

    const found = new Set(scan(files).map((hit) => hit.what));
    expect([...found].sort()).toStrictEqual([...NEEDLES.map((n) => n.what)].sort());
  });

  it('searches for values that are really parts of one fixture', () => {
    // The needles are separate literals in the fixture package — they have to
    // be, or the compiler would emit them as expressions and none of them
    // would appear contiguously in any build. These are the relations those
    // separate literals are supposed to hold, checked so an edit to one line
    // and not the other cannot leave a needle pointing at nothing.
    expect(LOCAL_SEED_CONTENT.content.startsWith(LOCAL_SEED_FIXTURE_MARKER)).toBe(true);
    expect(LOCAL_SEED_STORAGE_REF.startsWith(LOCAL_SEED_STORAGE_SCHEME)).toBe(true);
    expect(LOCAL_SEED_STORAGE_REF).not.toBe(LOCAL_SEED_STORAGE_SCHEME);
    // Short enough to collide with ordinary prose is not evidence.
    for (const { what, value } of NEEDLES) {
      expect(value.length, `${what} is too short to be evidence`).toBeGreaterThan(8);
    }
  });

  it('finds NO needle anywhere in the production build', () => {
    const hits = scan(closureFiles);
    expect(
      hits,
      hits.length === 0
        ? ''
        : `the synthetic fixture reached the production build:\n${hits
            .map((hit) => `  ${hit.file}: ${hit.what}`)
            .join('\n')}`,
    ).toStrictEqual([]);
  });

  it('keeps the fixture package out of every production dependency closure', () => {
    expect(productionClosure(API_PACKAGE)).not.toContain(LOCAL_FIXTURE_PACKAGE);
    expect(productionClosure(CONSENT_PACKAGE)).not.toContain(LOCAL_FIXTURE_PACKAGE);

    // Not merely absent from the two closures walked above: absent from every
    // `dependencies` block in the workspace, so no future package can pull it
    // into one by depending on the wrong thing.
    const wrongly = [...PACKAGES.entries()]
      .filter(([, dir]) => LOCAL_FIXTURE_PACKAGE in (readManifest(dir).dependencies ?? {}))
      .map(([name]) => name);
    expect(
      wrongly,
      `${LOCAL_FIXTURE_PACKAGE} is a production dependency of ${wrongly.join(', ')} — it may only ` +
        'ever be a devDependency',
    ).toStrictEqual([]);
  });

  it('is still wired into local and test as a devDependency', () => {
    // The other half of the property: absent from production is only correct
    // if the local path still has it. A fixture nothing can reach is not a
    // safer fixture, it is a deleted one, and the LOCAL end-to-end suite would
    // then be proving nothing.
    const consentDir = PACKAGES.get(CONSENT_PACKAGE);
    expect(consentDir).toBeDefined();
    expect(readManifest(consentDir ?? '').devDependencies ?? {}).toHaveProperty(
      LOCAL_FIXTURE_PACKAGE,
    );
  });

  it('is a private package with no dependencies of its own', () => {
    const fixtureDir = PACKAGES.get(LOCAL_FIXTURE_PACKAGE);
    expect(fixtureDir).toBeDefined();
    const manifest = readManifest(fixtureDir ?? '');
    // Private so it can never be published; zero dependencies so it can never
    // drag anything else into a graph, and has no reason to be in one itself.
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies ?? {}).toStrictEqual({});
    // The name says what it is at every call site and in every manifest.
    expect(LOCAL_FIXTURE_PACKAGE).toContain('local-fixtures');
  });

  it('names the fixture package in production output only as a guarded runtime resolution', () => {
    const mentions = closureFiles.filter(
      (file) => !isTestOutput(file) && fs.readFileSync(file, 'utf8').includes(LOCAL_FIXTURE_PACKAGE),
    );

    // The specifier appears — the consent module has to name what it may
    // optionally load — but only in the one place that makes the decision.
    expect(mentions.length).toBeGreaterThan(0);
    for (const file of mentions) {
      const relative = path.relative(REPO_ROOT, file);
      expect(
        relative.split(path.sep).join('/'),
        'only the consent module’s content-source selection may name the fixture package',
      ).toMatch(/^modules\/consent\/dist\/infrastructure\/content\//);

      // A static edge would put the package in the module graph, and a
      // production install — which does not have it — would fail to boot
      // instead of reporting an honest absence. All three static forms are
      // checked: a `from` clause, a bare side-effect import, and a dynamic
      // `import()`. Naming the specifier in a const (which is how the guarded
      // resolution reaches it) is none of them.
      const text = fs.readFileSync(file, 'utf8');
      const escaped = LOCAL_FIXTURE_PACKAGE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      const quoted = `['"]${escaped}['"]`;
      expect(text).not.toMatch(new RegExp(`\\b(?:import|export)\\b[^;]*\\bfrom\\s*${quoted}`));
      expect(text).not.toMatch(new RegExp(`\\bimport\\s*${quoted}`));
      expect(text).not.toMatch(new RegExp(`\\bimport\\s*\\(\\s*${quoted}`));
    }
  });
});
