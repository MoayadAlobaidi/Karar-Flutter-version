/**
 * Enforces the configuration convention documented in config.ts: `process.env`
 * is dereferenced ONLY by the typed config loader (platform/src/config) and by
 * the db layer's role-profile factory (platform/src/db). Composition roots
 * (apps' main.ts) may pass the whole object into those readers — never read a
 * property from it. Everything else consumes typed config.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);

const SCAN_ROOTS = ['apps', 'packages', 'modules'];
const CODE_EXT = /\.(ts|tsx|mts|cts)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'mobile']);

/** Directories whose files may dereference process.env. */
const READER_DIRS = [
  path.join('packages', 'platform', 'src', 'config'),
  path.join('packages', 'platform', 'src', 'db'),
];

function walk(dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out);
    } else if (CODE_EXT.test(entry) && !TEST_FILE.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('no direct environment access outside the sanctioned readers', () => {
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root), []));

  it('scans a non-trivial tree (guard against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('finds no process.env dereference outside platform config and platform db', () => {
    const violations: string[] = [];
    for (const file of files) {
      const relative = path.relative(REPO_ROOT, file);
      if (READER_DIRS.some((dir) => relative.startsWith(dir + path.sep))) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      const dereferences = source.match(/process\.env\s*[.[]/g) ?? [];
      if (dereferences.length > 0) {
        violations.push(
          `${relative}: dereferences process.env ${dereferences.length}x — consume typed config instead`,
        );
        continue;
      }
      const bareMentions = source.match(/process\.env/g) ?? [];
      if (bareMentions.length > 0 && path.basename(file) !== 'main.ts') {
        violations.push(
          `${relative}: references process.env — only a composition root (main.ts) may hand it to loadConfig/fromEnv`,
        );
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
