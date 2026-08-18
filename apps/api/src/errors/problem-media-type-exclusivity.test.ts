// ONE WRITER FOR THE PROBLEM MEDIA TYPE, ENFORCED ON THE SOURCE.
//
// Twenty-five operation/status pairs once returned RFC 7807 bodies under
// `application/json` because each controller answered failures by writing to
// the reply object itself, and the only code that named the problem media type
// was the error boundary, which never saw them. They were found by binding the
// running server to the contract, and the runtime conformance ledger keeps
// them from coming back — but that ledger exercises the operation/status pairs
// the mobile client consumes, not all of the ones the contract declares. A new
// controller answering a problem directly on any of the pairs the ledger does
// not reach would reintroduce exactly the original defect and pass.
//
// This closes that gap from the other side, and it is a source scan rather
// than a behavioural test on purpose: the property is "no second place names
// this", which is a statement about the source tree and cannot be observed by
// exercising any single response.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');

/** The single file permitted to name the media type. */
const WRITER = path.join('apps', 'api', 'src', 'errors', 'problem-response.ts');

/** Source roots that answer HTTP requests. Compiled output is not source. */
const SCANNED_ROOTS = [path.join('apps', 'api', 'src'), 'modules'];

function sourceFiles(root: string): string[] {
  const absolute = path.join(REPO_ROOT, root);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      // `dist` is build output and `node_modules` is not ours; both would make
      // the scan report the writer's own compiled copy as a second site.
      if (entry === 'dist' || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      // Tests may quote the media type when asserting on it; they answer no
      // request, so they cannot be the source of a divergent one.
      if (entry.endsWith('.test.ts') || full.includes(`${path.sep}__tests__${path.sep}`)) continue;
      found.push(path.relative(REPO_ROOT, full));
    }
  };
  walk(absolute);
  return found;
}

const FILES = SCANNED_ROOTS.flatMap(sourceFiles);

/**
 * Source with comments removed.
 *
 * The controllers that used to answer problems directly now carry a comment
 * saying the media type is applied by the boundary, and pointing at the file
 * that applies it. That is documentation worth having, and it names the string
 * — so a scan over raw text reports six violations that are all prose. The
 * property under test is that nothing else SETS the media type, not that
 * nothing else mentions it.
 */
function code(file: string): string {
  return readFileSync(path.join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('the problem media type has exactly one writer', () => {
  it('scanned a real source tree — the check is not vacuous', () => {
    // Without this, a broken walker would make every assertion below pass by
    // finding nothing, which is the failure mode every absence scan has.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES).toContain(WRITER);
  });

  it('names `problem+json` in the writer and nowhere else in source', () => {
    const naming = FILES.filter((file) => code(file).includes('problem+json'));

    // The writer must be among them, or the scan is matching nothing and the
    // exclusivity assertion below would hold vacuously.
    expect(naming, 'the writer itself must name the media type').toContain(WRITER);
    expect(
      naming.filter((file) => file !== WRITER),
      'a problem document must leave through writeProblemResponse in ' +
        `${WRITER}; a second site here is how the twenty-five media-type ` +
        'deviations happened, and the runtime ledger only covers the ' +
        'operation/status pairs the mobile client consumes',
    ).toEqual([]);
  });

  it('sets no content-type header outside the writer', () => {
    // Distinct from the assertion above: a controller could set the header
    // without ever writing the string `problem+json` — for instance by
    // building it from a constant — and still diverge from the contract.
    const setters = FILES.filter((file) => /\.header\(\s*['"`]content-type/i.test(code(file)));

    expect(
      setters,
      `only ${WRITER} may set a response content type; everything else answers ` +
        'through Nest and Fastify, which choose it from the route',
    ).toEqual([WRITER]);
  });
});
