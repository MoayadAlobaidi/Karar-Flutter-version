// Shared helpers for the architecture and documentation checks.
// Zero dependencies: node: builtins only.

import fs from 'node:fs';
import path from 'node:path';

/** Directories never descended into by any walk. */
export const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.dart_tool',
  '.out',
  'Pods',
]);

/** File extensions treated as source code for import scans. */
export const CODE_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx']);

/** True for test files, which structural scans exclude (tests may import across boundaries deliberately, e.g. adversarial tests). */
export function isTestFile(filePath) {
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath) || filePath.split(path.sep).includes('__tests__')
  );
}

/**
 * Recursively collect files under `dir`. Returns [] when `dir` does not exist,
 * so scans over not-yet-populated globs still run (and pass vacuously).
 */
export function walkFiles(dir, { exts = null, includeTests = false } = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) stack.push(full);
      } else if (entry.isFile()) {
        if (exts && !exts.has(path.extname(entry.name))) continue;
        if (!includeTests && exts === CODE_EXTS && isTestFile(full)) continue;
        out.push(full);
      }
    }
  }
  return out.sort();
}

/** Direct child directories of `dir` (names), excluding EXCLUDED_DIRS. */
export function childDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !EXCLUDED_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();
}

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

/**
 * Strip // and block comments while preserving string and template-literal
 * contents and the file's line structure (newlines are kept so reported line
 * numbers stay meaningful). A small state machine, not a parser — sufficient
 * for import extraction and literal scans in a lint context.
 */
export function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let mode = 'code'; // code | line | block | single | double | template
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === 'code') {
      if (c === '/' && next === '/') {
        mode = 'line';
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        mode = 'block';
        i += 2;
        continue;
      }
      if (c === "'") mode = 'single';
      else if (c === '"') mode = 'double';
      else if (c === '`') mode = 'template';
      out += c;
      i += 1;
    } else if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      }
      i += 1;
    } else if (mode === 'block') {
      if (c === '*' && next === '/') {
        mode = 'code';
        i += 2;
        continue;
      }
      if (c === '\n') out += c;
      i += 1;
    } else {
      // Inside a string/template literal.
      if (c === '\\') {
        out += c + (next ?? '');
        i += 2;
        continue;
      }
      if (
        (mode === 'single' && c === "'") ||
        (mode === 'double' && c === '"') ||
        (mode === 'template' && c === '`')
      ) {
        mode = 'code';
      }
      out += c;
      i += 1;
    }
  }
  return out;
}

/**
 * Extract import specifiers from comment-stripped source.
 * Returns [{ specifier, line }]. Covers: import ... from 'x'; import 'x';
 * export ... from 'x'; require('x'); import('x').
 */
export function extractImports(strippedSource) {
  const results = [];
  const patterns = [
    /\bimport\s+[^'"()]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"()]*?from\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const seen = new Set();
  for (const re of patterns) {
    for (const m of strippedSource.matchAll(re)) {
      const key = `${m.index}:${m[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = strippedSource.slice(0, m.index).split('\n').length;
      results.push({ specifier: m[1], line });
    }
  }
  return results.sort((a, b) => a.line - b.line);
}

/** Line number (1-based) of a regex match index within `text`. */
export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Resolve a relative import specifier against the importing file's directory. */
export function resolveRelative(fromFile, specifier) {
  return path.resolve(path.dirname(fromFile), specifier);
}

/** True when `child` is inside (or equal to) `parent`. */
export function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Parse a GitHub-flavoured markdown table into { headers, rows } where each
 * row is an array of trimmed cell strings. `lines` are the raw table lines
 * (each starting with '|'). Returns null when no separator row is present.
 */
export function parseMdTable(lines) {
  const tableLines = lines.filter((l) => l.trim().startsWith('|'));
  if (tableLines.length < 2) return null;
  const split = (l) => {
    const trimmed = l.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((c) => c.trim());
  };
  const headers = split(tableLines[0]);
  const sep = tableLines[1];
  if (!/^\s*\|[\s:|-]+\|?\s*$/.test(sep)) return null;
  const rows = tableLines.slice(2).map(split);
  return { headers, rows };
}

/**
 * Extract a `## <heading>` section's lines from markdown (until the next
 * heading of the same or higher level). Returns null when absent.
 */
export function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##? /.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

/** Strip markdown emphasis and inline-code decoration from a table cell. */
export function plainCell(cell) {
  return cell.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

/** Ensure scripts/checks/.out exists with a covering .gitignore; return its path. */
export function ensureOutDir(root) {
  const outDir = path.join(root, 'scripts', 'checks', '.out');
  fs.mkdirSync(outDir, { recursive: true });
  const gitignore = path.join(outDir, '.gitignore');
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, '*\n');
  return outDir;
}
