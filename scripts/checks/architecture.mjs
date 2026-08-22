#!/usr/bin/env node
// Architecture tests (docs/testing/architecture-tests.md), Phase 1 harness.
//
// Reads docs/testing/architecture-test-registry.json, runs every ACTIVE check,
// and enforces the activation gate: a test whose activationPhase has been
// reached (registry.currentPhase >= activationPhase) with no implementation
// fails the run. This is the auto-required mechanism — a deferred test cannot
// silently stay deferred past its phase.
//
// Structural scans run against the real tree. Scans whose target globs are
// still empty (modules have no TypeScript in Phase 1) pass vacuously today but
// genuinely fail on violations; the built-in self-test proves that on every
// run by seeding deliberate violations in a temp tree and asserting each
// checker reports them.
//
// Test files (*.test.ts, *.spec.ts, __tests__/) are excluded from structural
// scans: tests may deliberately cross boundaries (adversarial tenant tests,
// fixtures constructing dates).
//
// Zero dependencies: node: builtins only.
//
// Usage:
//   node scripts/checks/architecture.mjs              # full run + self-test
//   node scripts/checks/architecture.mjs --self-test  # self-test only

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CODE_EXTS,
  childDirs,
  ensureOutDir,
  extractImports,
  extractSection,
  isWithin,
  lineOf,
  parseMdTable,
  plainCell,
  readJson,
  readText,
  resolveRelative,
  stripComments,
  walkFiles,
} from './lib/util.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const REGISTRY_REL = path.join('docs', 'testing', 'architecture-test-registry.json');

//  is pure for the reason the others are: every layer needs to
// ask what an input may be used for, and a package that dragged a framework
// behind it could not be asked from a domain file.
const PURE_PACKAGES = [
  'shared-kernel',
  'financial-engine',
  'jurisdiction-policy',
  'state-machine',
  'content-trust',
];
const KERNEL_EXPORTS = [
  'Money',
  // Tenth universal, ADR-0027: a calendar day is not an instant. Added once,
  // with a decision record; the cap is not "whatever is useful next".
  'CalendarDay',
  'Currency',
  'Percentage',
  'ExchangeRate',
  'Clock',
  'Result',
  'DomainEvent',
  'TenantId',
  'UserId',
];
const ERASURE_STRATEGIES = [
  'CASCADE_DELETE',
  'ANONYMIZE_IRREVERSIBLY',
  'RETAIN_WITH_BASIS',
  'NON_PERSONAL_BY_DESIGN',
];
const ADMIN_FORBIDDEN_DEPS = [
  'pg',
  'prisma',
  '@prisma/client',
  'mysql',
  'sqlite3',
  'better-sqlite3',
  'typeorm',
  'knex',
  'drizzle-orm',
];

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

function moduleNames(root) {
  return childDirs(path.join(root, 'modules'));
}

function codeFiles(dirs) {
  return dirs.flatMap((d) => walkFiles(d, { exts: CODE_EXTS }));
}

function appsSrcDirs(root) {
  return childDirs(path.join(root, 'apps')).map((a) => path.join(root, 'apps', a, 'src'));
}

function packagesSrcDirs(root) {
  return childDirs(path.join(root, 'packages')).map((p) => path.join(root, 'packages', p, 'src'));
}

function moduleLayerDirs(root, layers) {
  return moduleNames(root).flatMap((m) => layers.map((l) => path.join(root, 'modules', m, l)));
}

function rel(root, file) {
  return path.relative(root, file);
}

function loadStripped(file) {
  return stripComments(readText(file));
}

function violationsResult(violations, scanned, note) {
  return { violations, scanned, applicable: true, ...(note ? { note } : {}) };
}

/**
 * The result a control returns when it no longer has anything to say.
 *
 * A historical guard that has outlived its window used to return
 * `violationsResult([], 0)` — zero files scanned, zero violations — and the
 * runner, which decides PASS by asking whether the violation list is empty,
 * counted it among the passes. A row reading `PASS ... (files scanned: 0)`
 * therefore appeared in the headline beside twenty-eight checks that had
 * actually looked at something, and the summary total included it. That is a
 * pass that proves nothing: the control could not have failed, because it
 * never ran.
 *
 * `NOT_APPLICABLE` is the honest answer, and it is a THIRD status rather than
 * a quiet pass: it is printed as `N/A`, counted in its own tally, and excluded
 * from `passed`. The reason travels with it so a reader never has to guess why
 * a control went quiet.
 */
function notApplicableResult(reason, note) {
  return { violations: [], scanned: 0, applicable: false, reason, ...(note ? { note } : {}) };
}

// ---------------------------------------------------------------------------
// Test 1 — Domain purity
// ---------------------------------------------------------------------------
export function checkDomainPurity(ctx) {
  const { root } = ctx;
  const violations = [];
  let scanned = 0;

  for (const pkg of PURE_PACKAGES) {
    const pkgDir = path.join(root, 'packages', pkg);
    const files = codeFiles([path.join(pkgDir, 'src')]);
    scanned += files.length;
    for (const file of files) {
      for (const { specifier, line } of extractImports(loadStripped(file))) {
        if (specifier.startsWith('.')) {
          if (!isWithin(pkgDir, resolveRelative(file, specifier))) {
            violations.push({
              file: rel(root, file),
              line,
              detail: `relative import '${specifier}' escapes the ${pkg} package`,
            });
          }
        } else if (specifier === '@karar/shared-kernel') {
          if (pkg === 'shared-kernel') {
            violations.push({
              file: rel(root, file),
              line,
              detail: `shared-kernel must not import itself by package name`,
            });
          }
        } else {
          violations.push({
            file: rel(root, file),
            line,
            detail: `pure package '${pkg}' imports '${specifier}' — only ./relative and @karar/shared-kernel are allowed`,
          });
        }
      }
    }
  }

  const allowedInDomain = new Set(PURE_PACKAGES.map((p) => `@karar/${p}`));
  for (const mod of moduleNames(root)) {
    const modDir = path.join(root, 'modules', mod);
    const files = codeFiles([path.join(modDir, 'domain')]);
    scanned += files.length;
    for (const file of files) {
      for (const { specifier, line } of extractImports(loadStripped(file))) {
        if (specifier.startsWith('.')) {
          if (!isWithin(modDir, resolveRelative(file, specifier))) {
            violations.push({
              file: rel(root, file),
              line,
              detail: `domain relative import '${specifier}' escapes module '${mod}'`,
            });
          }
        } else if (!allowedInDomain.has(specifier)) {
          violations.push({
            file: rel(root, file),
            line,
            detail: `domain imports '${specifier}' — domain may import only ./relative and the pure packages`,
          });
        }
      }
    }
  }

  return violationsResult(violations, scanned);
}

// ---------------------------------------------------------------------------
// Test 2 — Layer direction
// ---------------------------------------------------------------------------
export function checkLayerDirection(ctx) {
  const { root } = ctx;
  const violations = [];
  let scanned = 0;
  const rules = [
    { layer: 'application', forbidden: ['infrastructure', 'presentation'] },
    { layer: 'domain', forbidden: ['application', 'infrastructure', 'presentation'] },
  ];
  for (const mod of moduleNames(root)) {
    const modDir = path.join(root, 'modules', mod);
    for (const { layer, forbidden } of rules) {
      const files = codeFiles([path.join(modDir, layer)]);
      scanned += files.length;
      for (const file of files) {
        for (const { specifier, line } of extractImports(loadStripped(file))) {
          if (!specifier.startsWith('.')) continue;
          const resolved = resolveRelative(file, specifier);
          for (const target of forbidden) {
            if (isWithin(path.join(modDir, target), resolved)) {
              violations.push({
                file: rel(root, file),
                line,
                detail: `${layer}/ imports ${target}/ ('${specifier}') — layer direction violated`,
              });
            }
          }
        }
      }
    }
  }
  return violationsResult(violations, scanned);
}

// ---------------------------------------------------------------------------
// Test 3 — Module boundary (cross-module imports via public-api.ts only)
// ---------------------------------------------------------------------------
export function checkModuleBoundary(ctx) {
  const { root } = ctx;
  const violations = [];
  const names = new Set(moduleNames(root));
  const modulesRoot = path.join(root, 'modules');
  let scanned = 0;

  for (const mod of names) {
    const modDir = path.join(modulesRoot, mod);
    const files = codeFiles([modDir]);
    scanned += files.length;
    for (const file of files) {
      for (const { specifier, line } of extractImports(loadStripped(file))) {
        const bare = specifier.match(/^@karar\/([^/]+)(?:\/(.+))?$/);
        if (bare) {
          const [, target, subpath] = bare;
          if (
            names.has(target) &&
            target !== mod &&
            subpath &&
            !/^public-api(\.[cm]?[jt]s)?$/.test(subpath)
          ) {
            violations.push({
              file: rel(root, file),
              line,
              detail: `imports '@karar/${target}/${subpath}' — cross-module imports must target public-api only`,
            });
          }
          continue;
        }
        if (!specifier.startsWith('.')) continue;
        const resolved = resolveRelative(file, specifier);
        if (isWithin(modDir, resolved)) continue;
        if (isWithin(modulesRoot, resolved)) {
          const target = path.relative(modulesRoot, resolved).split(path.sep)[0];
          const inTarget = path.relative(path.join(modulesRoot, target), resolved);
          if (!/^public-api(\.[cm]?[jt]s)?$/.test(inTarget)) {
            violations.push({
              file: rel(root, file),
              line,
              detail: `relative import '${specifier}' reaches into module '${target}' internals — cross-module imports must target public-api.ts`,
            });
          }
        } else {
          violations.push({
            file: rel(root, file),
            line,
            detail: `relative import '${specifier}' escapes the modules tree — use the @karar/* package specifier`,
          });
        }
      }
    }
  }
  return violationsResult(violations, scanned);
}

// ---------------------------------------------------------------------------
// Test 4 — No ORM leakage
// ---------------------------------------------------------------------------
// Sanctioned Prisma surfaces, and nothing else:
//   * modules/*/infrastructure/persistence/ — repository adapters;
//   * packages/platform/src/db/ — the ONE construction path (createPrismaClient
//     over @prisma/adapter-pg and pg; database-portability.md §2);
//   * packages/platform/prisma/client/ — the generated client itself.
// Module code consumes the PrismaHandle through @karar/platform; a Prisma
// import anywhere else is leakage regardless of which package it sits in.
export function checkOrmLeakage(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...appsSrcDirs(root),
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
  ]);
  const allowed = (file) =>
    /[\\/]infrastructure[\\/]persistence[\\/]/.test(file) ||
    isWithin(path.join(root, 'packages', 'platform', 'src', 'db'), file) ||
    isWithin(path.join(root, 'packages', 'platform', 'prisma', 'client'), file);
  for (const file of files) {
    for (const { specifier, line } of extractImports(loadStripped(file))) {
      const isPrisma =
        specifier === 'prisma' ||
        specifier.startsWith('prisma/') ||
        specifier.startsWith('@prisma/');
      // The raw driver is the same failure class: a pg import outside the
      // sanctioned zones bypasses the profile/adapter machinery entirely.
      const isPgDriver = specifier === 'pg' || specifier.startsWith('pg/');
      if ((isPrisma || isPgDriver) && !allowed(file)) {
        violations.push({
          file: rel(root, file),
          line,
          detail: `imports '${specifier}' outside infrastructure/persistence/ or packages/platform/src/db/ — ORM and driver types must not leak`,
        });
      }
    }
  }
  return violationsResult(violations, files.length);
}

// ---------------------------------------------------------------------------
// Canonical SQL schema parsing (tests 9, 21, 22)
// ---------------------------------------------------------------------------
// The canonical migrations under packages/platform/db/migrations ARE the
// schema of record (database-portability.md §6); these checks parse them
// statically. Live-database verification of the same facts is the job of
// `db:verify` and the adversarial suites (modules/*/__tests__, tests/security)
// — this runner stays zero-dependency and never opens a connection.

const MIGRATIONS_REL = path.join('packages', 'platform', 'db', 'migrations');
const ALLOW_LIST_REL = path.join('packages', 'platform', 'db', 'rls-allow-list.json');
const PRISMA_SCHEMA_DIR_REL = path.join('packages', 'platform', 'prisma', 'schema');

/**
 * Strips SQL line comments while preserving line structure, string literals
 * ('' escaping), and dollar-quoted bodies ($$…$$ stay intact — trigger
 * function sources must not be mistaken for statements).
 */
function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  let mode = 'code'; // code | line | string | dollar
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (mode === 'code') {
      if (c === '-' && next === '-') {
        mode = 'line';
        i += 2;
        continue;
      }
      if (c === "'") mode = 'string';
      else if (c === '$' && next === '$') {
        mode = 'dollar';
        out += '$$';
        i += 2;
        continue;
      }
      out += c;
      i += 1;
    } else if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      }
      i += 1;
    } else if (mode === 'string') {
      if (c === "'" && next === "'") {
        out += "''";
        i += 2;
        continue;
      }
      if (c === "'") mode = 'code';
      out += c;
      i += 1;
    } else {
      // dollar-quoted body
      if (c === '$' && next === '$') {
        mode = 'code';
        out += '$$';
        i += 2;
        continue;
      }
      out += c;
      i += 1;
    }
  }
  return out;
}

/** `platform.jobs` stays qualified; unqualified names normalize to public. */
function normalizeTableName(raw) {
  const clean = raw.replace(/"/g, '').trim().toLowerCase().replace(/;$/, '');
  return clean.includes('.') ? clean : `public.${clean}`;
}

const COLUMN_LINE_SKIP =
  /^(constraint|primary\s+key|unique(\s|\()|check(\s|\()|foreign\s+key|exclude|like\s)/i;

/** Splits a CREATE TABLE body on top-level commas (parentheses tracked). */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const c of body) {
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

/**
 * Splits SQL into top-level statements, respecting string literals and
 * dollar-quoted bodies (a `;` inside a trigger function is not a statement
 * boundary). Input is expected to have passed through stripSqlComments.
 */
function splitStatements(sql) {
  const out = [];
  let current = '';
  let mode = 'code'; // code | string | dollar
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    const next = sql[i + 1];
    if (mode === 'code') {
      if (c === ';') {
        if (current.trim() !== '') out.push(current);
        current = '';
        continue;
      }
      if (c === "'") mode = 'string';
      else if (c === '$' && next === '$') {
        mode = 'dollar';
        current += '$$';
        i += 1;
        continue;
      }
    } else if (mode === 'string') {
      if (c === "'" && next === "'") {
        current += "''";
        i += 1;
        continue;
      }
      if (c === "'") mode = 'code';
    } else if (c === '$' && next === '$') {
      mode = 'code';
      current += '$$';
      i += 1;
      continue;
    }
    current += c;
  }
  if (current.trim() !== '') out.push(current);
  return out;
}

/** Whitespace-collapsed, lowercased SQL — the form constraint patterns match. */
function normalizeSql(text) {
  return text.replace(/\s+/g, ' ').toLowerCase();
}

/** The parenthesised body of every CHECK clause in `text`, normalized. */
function checkClauses(text) {
  const clauses = [];
  for (const m of text.matchAll(/\bCHECK\s*\(/gi)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let end = start;
    while (end < text.length && depth > 0) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')') depth -= 1;
      end += 1;
    }
    clauses.push(normalizeSql(text.slice(start, end - 1)));
  }
  return clauses;
}

/** Records one column fragment (from a CREATE TABLE body or an ADD COLUMN). */
function recordColumn(columns, fragment) {
  const trimmed = fragment.trim();
  if (trimmed === '' || COLUMN_LINE_SKIP.test(trimmed)) return;
  const colMatch = trimmed.match(/^"?([a-z_][\w$]*)"?\s/i);
  if (!colMatch) return;
  columns.set(colMatch[1].toLowerCase(), { notNull: /\bNOT\s+NULL\b/i.test(fragment) });
}

/**
 * Parses every canonical migration: created tables (with columns and their
 * NOT NULL state), later ALTER TABLE additions to those tables, RLS
 * ENABLE/FORCE statements, and CREATE POLICY targets.
 *
 * ALTER TABLE is parsed because the schema of record is the WHOLE migration
 * history, not the CREATE statement alone: a column or constraint added by a
 * later migration is as real as one declared at creation, and a checker that
 * read only CREATE bodies would report a pin as missing while it exists.
 */
function parseCanonicalMigrations(root) {
  const dir = path.join(root, MIGRATIONS_REL);
  const tables = new Map(); // normalized name -> table record
  const files = walkFiles(dir, { exts: new Set(['.sql']), includeTests: true });
  for (const file of files) {
    const relFile = rel(root, file);
    const sql = stripSqlComments(readText(file));

    for (const m of sql.matchAll(
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_."][\w."]*)\s*\(/gi,
    )) {
      const name = normalizeTableName(m[1]);
      // Body: from the opening paren to its match.
      const start = m.index + m[0].length;
      let depth = 1;
      let end = start;
      while (end < sql.length && depth > 0) {
        if (sql[end] === '(') depth += 1;
        else if (sql[end] === ')') depth -= 1;
        end += 1;
      }
      const body = sql.slice(start, end - 1);
      const columns = new Map();
      for (const fragment of splitTopLevel(body)) recordColumn(columns, fragment);
      tables.set(name, {
        name,
        file: relFile,
        line: lineOf(sql, m.index),
        columns,
        // Every piece of DDL text that constrains the table, in apply order:
        // the CREATE body plus each later ALTER. Constraint-shape checks read
        // this, so a CHECK added by a later migration counts.
        ddl: [body],
        rlsEnabled: false,
        rlsForced: false,
        policies: [],
      });
    }

    // ALTER TABLE: ADD/DROP COLUMN, SET/DROP NOT NULL, and added constraints.
    for (const statement of splitStatements(sql)) {
      const head = statement.match(/^\s*ALTER\s+TABLE\s+(?:ONLY\s+)?([A-Za-z_."][\w."]*)\s+/i);
      if (!head) continue;
      const table = tables.get(normalizeTableName(head[1]));
      if (!table) continue;
      const rest = statement.slice(head[0].length);
      table.ddl.push(rest);
      for (const clause of splitTopLevel(rest)) {
        const trimmed = clause.trim();
        const add = trimmed.match(/^ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]+)$/i);
        if (add) {
          recordColumn(table.columns, add[1]);
          continue;
        }
        const drop = trimmed.match(/^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-z_][\w$]*)"?/i);
        if (drop) {
          table.columns.delete(drop[1].toLowerCase());
          continue;
        }
        const nullability = trimmed.match(
          /^ALTER\s+(?:COLUMN\s+)?"?([a-z_][\w$]*)"?\s+(SET|DROP)\s+NOT\s+NULL/i,
        );
        if (nullability) {
          const column = table.columns.get(nullability[1].toLowerCase());
          if (column) column.notNull = nullability[2].toUpperCase() === 'SET';
        }
      }
    }

    for (const m of sql.matchAll(
      /\bALTER\s+TABLE\s+(?:ONLY\s+)?([A-Za-z_."][\w."]*)\s+(ENABLE|FORCE|DISABLE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY/gi,
    )) {
      const table = tables.get(normalizeTableName(m[1]));
      if (!table) continue; // a later migration altering an earlier table would land here; none exist yet
      const verb = m[2].toUpperCase().replace(/\s+/g, ' ');
      if (verb === 'ENABLE') table.rlsEnabled = true;
      if (verb === 'FORCE') table.rlsForced = true;
      if (verb === 'DISABLE') table.rlsEnabled = false;
      if (verb === 'NO FORCE') table.rlsForced = false;
    }

    for (const m of sql.matchAll(
      /\bCREATE\s+POLICY\s+("?[\w$]+"?)\s+ON\s+([A-Za-z_."][\w."]*)/gi,
    )) {
      const table = tables.get(normalizeTableName(m[2]));
      if (table) table.policies.push(m[1].replace(/"/g, ''));
    }
  }
  return { tables, migrationFiles: files.length };
}

const ALLOW_LIST_REQUIRED_FIELDS = [
  'table',
  'reason',
  'owner',
  'compensatingGrants',
  'reviewPhase',
];

// An allow-list hole is a decision to leave a table outside the tenant
// boundary, so the entry must carry the reasoning that decision needs. Field
// presence alone admits "platform configuration" as a justification, which is
// a category, not a reason. Three mechanical requirements, all satisfiable
// only by writing the actual argument:
//   * a stated reason why the table cannot be tenant- or subject-scoped;
//   * compensating controls described concretely, not labelled;
//   * enough text to be an argument at all.
const ALLOW_LIST_MIN_REASON = 120;
const ALLOW_LIST_MIN_GRANTS = 60;
const ALLOW_LIST_SCOPE_CLAUSE =
  /\b(no|not|never|without|carries no|has no)\b[^.]{0,120}\b(tenant|subject|principal|user)\b|\b(pre-auth|before (any|a) [\w -]{0,24}(principal|tenant|context|session)|across (all |every )?tenants?|regardless of (any |which )?(principal|tenant)|platform-global|platform-wide|deployment-wide)\b/i;
const ALLOW_LIST_BOILERPLATE = /^(none|n\/?a|tbd|todo|unknown|—|-|see above|standard)\.?$/i;

/** Loads and field-validates the RLS allow-list; shape errors become violations. */
function loadRlsAllowList(root, violations) {
  const listPath = path.join(root, ALLOW_LIST_REL);
  const relPath = rel(root, listPath);
  if (!fs.existsSync(listPath)) {
    violations.push({ file: relPath, detail: 'rls-allow-list.json is missing' });
    return new Map();
  }
  let entries;
  try {
    entries = readJson(listPath);
  } catch (err) {
    violations.push({ file: relPath, detail: `does not parse: ${err.message}` });
    return new Map();
  }
  if (!Array.isArray(entries)) {
    violations.push({ file: relPath, detail: 'allow-list must be an array of entries' });
    return new Map();
  }
  const byTable = new Map();
  entries.forEach((entry, i) => {
    const where = `entry[${i}]${entry?.table ? ` (${entry.table})` : ''}`;
    for (const field of ALLOW_LIST_REQUIRED_FIELDS) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
        violations.push({
          file: relPath,
          detail: `${where}: '${field}' is missing or empty — an allow-list hole needs a stated reason, owner, compensating grants, and review phase`,
        });
      }
    }
    const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
    const grants =
      typeof entry?.compensatingGrants === 'string' ? entry.compensatingGrants.trim() : '';
    if (reason !== '') {
      if (reason.length < ALLOW_LIST_MIN_REASON) {
        violations.push({
          file: relPath,
          detail: `${where}: 'reason' is ${reason.length} characters — an allow-list hole needs the argument for leaving the table outside the tenant boundary, not a label (minimum ${ALLOW_LIST_MIN_REASON})`,
        });
      }
      if (!ALLOW_LIST_SCOPE_CLAUSE.test(reason)) {
        violations.push({
          file: relPath,
          detail: `${where}: 'reason' never states why the table cannot be tenant- or subject-scoped — "platform configuration" is a category, and the question the exemption turns on is what the table is and why no principal predicate fits it`,
        });
      }
    }
    if (grants !== '') {
      if (ALLOW_LIST_BOILERPLATE.test(grants) || grants.length < ALLOW_LIST_MIN_GRANTS) {
        violations.push({
          file: relPath,
          detail: `${where}: 'compensatingGrants' is '${grants.slice(0, 40)}' — a table outside RLS is protected by named grants, triggers, and gated write paths, or it is not protected (minimum ${ALLOW_LIST_MIN_GRANTS} characters, describing the actual controls)`,
        });
      }
    }
    if (typeof entry?.table === 'string' && entry.table.trim() !== '') {
      const name = normalizeTableName(entry.table);
      if (byTable.has(name)) {
        violations.push({ file: relPath, detail: `${where}: duplicate allow-list entry` });
      }
      byTable.set(name, entry);
    }
  });
  return byTable;
}

// ---------------------------------------------------------------------------
// Test 22 — RLS coverage (three shapes + allow-list integrity)
// ---------------------------------------------------------------------------
// Every table created by the canonical migrations is either ENABLE + FORCE
// ROW LEVEL SECURITY with at least one policy, or carried on the explicit
// allow-list with all required fields. Three failure shapes detected (the
// legacy's guard caught only the second, and its own audit table WAS the
// third): no RLS, enabled-without-policy, FORCEd-without-enabled. A stale
// allow-list entry (naming a table no migration creates) also fails — dead
// entries hide real holes.
export function checkRlsCoverage(ctx) {
  const { root } = ctx;
  const violations = [];
  const { tables, migrationFiles } = parseCanonicalMigrations(root);
  const allowList = loadRlsAllowList(root, violations);
  const allowListRel = ALLOW_LIST_REL.split(path.sep).join('/');

  for (const [name] of allowList) {
    if (!tables.has(name)) {
      violations.push({
        file: allowListRel,
        detail: `allow-list entry '${name}' names a table no canonical migration creates — stale entries are removed, not kept`,
      });
    }
  }

  let rlsCount = 0;
  let allowListedCount = 0;
  for (const table of tables.values()) {
    const allowListed = allowList.has(table.name);
    if (allowListed) allowListedCount += 1;
    if (table.rlsForced && !table.rlsEnabled) {
      violations.push({
        file: table.file,
        line: table.line,
        detail: `${table.name}: FORCEd without ENABLE — FORCE alone enforces nothing (the legacy audit table's exact anomaly, RLS-02/P14)`,
      });
    }
    if (table.rlsEnabled && table.policies.length === 0) {
      violations.push({
        file: table.file,
        line: table.line,
        detail: `${table.name}: RLS enabled with zero policies — default-deny reads as isolation while making the table unusable and the owner path unguarded`,
      });
    }
    if (table.rlsEnabled && table.rlsForced) rlsCount += 1;
    else if (!allowListed) {
      violations.push({
        file: table.file,
        line: table.line,
        detail: `${table.name}: not RLS ENABLEd+FORCEd and not on ${allowListRel} — every table is consciously classified (ADR-0022)`,
      });
    }
  }

  return violationsResult(
    violations,
    tables.size,
    `migrations: ${migrationFiles}; tables: ${tables.size}; ENABLE+FORCE: ${rlsCount}; allow-listed: ${allowListedCount}`,
  );
}

// ---------------------------------------------------------------------------
// Test 9 — Tenant scoping (no repository query path without principal context)
// ---------------------------------------------------------------------------
// RLS is the boundary, and the principal context is what arms it: every
// module persistence file that queries a principal-scoped Prisma delegate
// (a table that is ENABLE+FORCE and NOT allow-listed) must bind the context —
// by using the platform's withPrincipalContext/withTenant, by binding the
// GUCs transaction-locally itself (set_config('app.*', …, true) — the
// identity scope pattern), or by importing a same-module persistence file
// that does (IdentityPrismaScope). A querying file with none of these is a
// repository method reachable without tenant context.
//
// The same check owns the SET LOCAL discipline: a session-scoped principal
// GUC (set_config(…, false) or SET/SET SESSION app.*) outlives its
// transaction on a pooled connection and hands the next caller a principal.
const PRISMA_QUERY_METHODS =
  '(?:findFirst|findFirstOrThrow|findMany|findUnique|findUniqueOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)';

/** Prisma delegate (camelCase model) -> normalized table name, from @@map. */
function parsePrismaDelegateMap(root) {
  const delegateToTable = new Map();
  const dir = path.join(root, PRISMA_SCHEMA_DIR_REL);
  for (const file of walkFiles(dir, { exts: new Set(['.prisma']), includeTests: true })) {
    const src = readText(file);
    for (const m of src.matchAll(/\bmodel\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\n\}/g)) {
      const model = m[1];
      const mapMatch = m[2].match(/@@map\(\s*"([^"]+)"\s*\)/);
      const table = normalizeTableName(mapMatch ? mapMatch[1] : model);
      delegateToTable.set(model[0].toLowerCase() + model.slice(1), table);
    }
  }
  return delegateToTable;
}

const TRANSACTION_LOCAL_BIND = /set_config\(\s*'app\.\w+'[^)]*,\s*(?:true|is_local)\s*\)/;
const SESSION_SCOPED_BIND = /set_config\(\s*'app\.\w+'[^)]*,\s*false\s*\)/;
const SESSION_SET_GUC = /\bSET\s+(?:SESSION\s+)?app\.\w+/i;

export function checkTenantScoping(ctx) {
  const { root } = ctx;
  const violations = [];

  // Principal-scoped tables: RLS'd and not allow-listed (allow-listed tables
  // are global/bootstrap surfaces whose access rules live in the entry).
  const shapeErrors = []; // schema/allow-list shape problems belong to test 22
  const { tables } = parseCanonicalMigrations(root);
  const allowList = loadRlsAllowList(root, shapeErrors);
  const principalTables = new Set(
    [...tables.values()]
      .filter((t) => t.rlsEnabled && t.rlsForced && !allowList.has(t.name))
      .map((t) => t.name),
  );
  const delegateToTable = parsePrismaDelegateMap(root);
  const principalDelegates = [...delegateToTable.entries()]
    .filter(([, table]) => principalTables.has(table))
    .map(([delegate]) => delegate);

  const principalQuery =
    principalDelegates.length > 0
      ? new RegExp(`\\.(${principalDelegates.join('|')})\\.\\s*${PRISMA_QUERY_METHODS}\\s*\\(`, 'g')
      : null;

  let scanned = 0;
  for (const mod of moduleNames(root)) {
    const persistenceDir = path.join(root, 'modules', mod, 'infrastructure', 'persistence');
    const files = codeFiles([persistenceDir]);
    scanned += files.length;
    const sources = new Map(files.map((file) => [file, loadStripped(file)]));
    const binderFiles = new Set(
      [...sources.entries()]
        .filter(
          ([, src]) =>
            TRANSACTION_LOCAL_BIND.test(src) || /\bwithPrincipalContext\b|\bwithTenant\b/.test(src),
        )
        .map(([file]) => file),
    );
    for (const [file, src] of sources) {
      if (principalQuery === null) break;
      principalQuery.lastIndex = 0;
      const queried = new Set();
      for (const m of src.matchAll(principalQuery)) queried.add(m[1]);
      if (queried.size === 0) continue;
      if (binderFiles.has(file)) continue;
      const importsBinder = [...binderFiles].some((binder) => {
        const binderBase = path.basename(binder).replace(/\.[cm]?ts$/, '');
        return extractImports(src).some(
          (imp) =>
            imp.specifier.startsWith('.') &&
            path.basename(imp.specifier).replace(/\.[cm]?[jt]s$/, '') === binderBase,
        );
      });
      if (importsBinder) continue;
      violations.push({
        file: rel(root, file),
        detail: `queries principal-scoped delegate(s) [${[...queried].join(', ')}] with no principal context in reach — no withPrincipalContext/withTenant, no transaction-local set_config('app.*', …, true), and no import of a persistence binder that has one (tenancy.md: RLS is the boundary, the context arms it)`,
      });
    }
  }

  // SET LOCAL discipline, everywhere non-test code runs SQL.
  const disciplineFiles = codeFiles([
    ...appsSrcDirs(root),
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
  ]);
  for (const file of disciplineFiles) {
    const src = loadStripped(file);
    for (const m of src.matchAll(new RegExp(SESSION_SCOPED_BIND, 'g'))) {
      violations.push({
        file: rel(root, file),
        line: lineOf(src, m.index),
        detail: `set_config('app.*', …, false) binds a principal GUC for the SESSION — on a pooled connection the next caller inherits it; principal GUCs are transaction-local only (set_config(…, true))`,
      });
    }
    for (const m of src.matchAll(new RegExp(SESSION_SET_GUC, 'gi'))) {
      violations.push({
        file: rel(root, file),
        line: lineOf(src, m.index),
        detail: `session-level '${m[0]}' — principal GUCs are bound with SET LOCAL semantics only, never per session`,
      });
    }
  }

  return violationsResult(
    violations,
    scanned + disciplineFiles.length,
    `principal-scoped tables: ${principalTables.size}; principal delegates: ${principalDelegates.length}`,
  );
}

// ---------------------------------------------------------------------------
// Test 21 — Pinning (records with legal consequence pin their provenance)
// ---------------------------------------------------------------------------
// The declared set of legal-consequence tables, checked against the REAL
// schema (data-model.md §5). All four canonical dimensions are enforced; NO
// dimension is deferred any more. Phase 3 pinned jurisdiction and operating
// entity and deferred the other two behind a gate that fired the moment Phase
// 3.5 arrived; migration 0086 resolved it, so the deferral machinery is gone
// rather than left as a branch nothing can exercise.
//
// Two pin shapes are recognised, and both are verified against the schema —
// never against prose in this file:
//
//   { column }                    the classic pin: the column exists and is
//                                 NOT NULL. Absence of a value is impossible.
//
//   { column, stateColumn, … }    a value that is legitimately absent for some
//                                 rows. The value column may be nullable ONLY
//                                 because a NOT NULL state column says, per
//                                 row, why — and the schema must carry the
//                                 CHECKs that make the pair honest: a
//                                 vocabulary CHECK on the state, a CHECK tying
//                                 the PINNED state to a non-null value, and a
//                                 CHECK requiring the pin for rows created
//                                 from the cutoff on. A justified NULL is one
//                                 the DATABASE justifies; a blanket "nullable
//                                 by design" in a declaration is not evidence.
//
//   { declaredNotApplicable }     the dimension cannot apply to this table at
//                                 all. The table carries a NOT NULL state
//                                 column CHECK-bound to exactly that single
//                                 value, so no row can ever claim otherwise
//                                 and introducing the dimension later is a
//                                 reviewed migration rather than a silent NULL.
const LEGAL_CONSEQUENCE_TABLES = [
  {
    table: 'public.consent_grants',
    pins: {
      jurisdictionAtCreation: { column: 'jurisdiction_ref' },
      operatingEntityAtCreation: { column: 'operating_entity_id' },
      policyPackVersionAtCreation: {
        column: 'policy_pack_version',
        stateColumn: 'policy_pack_pin_state',
        pinnedState: 'PINNED',
      },
      subjectPolicySelectionVersion: {
        column: 'subject_policy_selection_version',
        stateColumn: 'subject_policy_selection_pin_state',
        pinnedState: 'PINNED',
      },
    },
  },
  {
    table: 'public.data_protection_role_assignments',
    pins: {
      jurisdictionAtCreation: { column: 'jurisdiction_ref' },
      operatingEntityAtCreation: { column: 'operating_entity_id' },
      policyPackVersionAtCreation: {
        column: 'policy_pack_version',
        stateColumn: 'policy_pack_pin_state',
        pinnedState: 'PINNED',
      },
      subjectPolicySelectionVersion: {
        declaredNotApplicable: {
          column: 'subject_policy_selection_pin_state',
          value: 'NOT_APPLICABLE',
        },
      },
    },
  },
  {
    // The election record itself (migration 0083). It pins the regime, the
    // pack that permitted the option set, and its own version — profile_version
    // IS the selection version other records pin. It carries no
    // operating_entity_id column, so no dimension maps to one here; whether an
    // election survives an entity migration is a question for the module that
    // owns the table, recorded as a finding rather than answered in a checker.
    table: 'public.subject_policy_selections',
    pins: {
      jurisdictionAtCreation: { column: 'jurisdiction_ref' },
      policyPackVersionAtCreation: { column: 'policy_pack_version' },
      subjectPolicySelectionVersion: { column: 'profile_version' },
    },
  },
];

/** Columns whose presence means a table carries legal consequence. */
const PINNING_SIGNATURE_COLUMNS = [
  'operating_entity_id',
  'policy_pack_version',
  'subject_policy_selection_version',
];

export function checkPinning(ctx) {
  const { root } = ctx;
  const violations = [];
  const { tables } = parseCanonicalMigrations(root);

  const declared = new Set();
  for (const { table, pins } of LEGAL_CONSEQUENCE_TABLES) {
    const name = normalizeTableName(table);
    declared.add(name);
    const record = tables.get(name);
    if (!record) {
      violations.push({
        file: MIGRATIONS_REL.split(path.sep).join('/'),
        detail: `legal-consequence declaration for '${name}' matches no table in the canonical migrations — stale declarations are removed, not kept`,
      });
      continue;
    }
    const clauses = record.ddl.flatMap((text) => checkClauses(text));
    const fail = (detail) => violations.push({ file: record.file, line: record.line, detail });

    // Anti-dodge: a declared table cannot leave one of its own pinning-signature
    // columns unmapped. Declaring a table and then omitting the dimension its
    // schema visibly carries would turn the declaration into a shorter list of
    // things to check.
    const mapped = new Set(
      Object.values(pins).flatMap((pin) =>
        [pin.column, pin.stateColumn, pin.declaredNotApplicable?.column]
          .filter((c) => typeof c === 'string')
          .map((c) => c.toLowerCase()),
      ),
    );
    for (const col of record.columns.keys()) {
      const isSignature = col.endsWith('_at_creation') || PINNING_SIGNATURE_COLUMNS.includes(col);
      if (isSignature && !mapped.has(col)) {
        fail(
          `${name} carries pinning-signature column '${col}' that no declared dimension maps to — a declaration that skips a pin the schema already carries checks less than the schema says`,
        );
      }
    }

    for (const [dimension, pin] of Object.entries(pins)) {
      if (pin.declaredNotApplicable !== undefined) {
        const { column: stateColumn, value } = pin.declaredNotApplicable;
        const state = record.columns.get(stateColumn.toLowerCase());
        if (!state) {
          fail(
            `${name}: dimension '${dimension}' is declared not applicable, but the declaring column '${stateColumn}' does not exist — non-applicability is stated in the schema, not only in the checker`,
          );
          continue;
        }
        if (!state.notNull) {
          fail(
            `${name}: '${stateColumn}' declares dimension '${dimension}' not applicable but is nullable — a declaration a row may omit declares nothing`,
          );
        }
        const bound = new RegExp(`^${stateColumn.toLowerCase()}\\s*=\\s*'${value.toLowerCase()}'$`);
        if (!clauses.some((clause) => bound.test(clause))) {
          fail(
            `${name}: no CHECK binds '${stateColumn}' to exactly '${value}' — without it the "not applicable" declaration is a default a row can walk away from`,
          );
        }
        continue;
      }

      if (pin.column === undefined) {
        violations.push({
          file: 'scripts/checks/architecture.mjs',
          detail: `${name}: pinning dimension '${dimension}' declares neither a column nor an explicit non-applicability`,
        });
        continue;
      }

      const col = pin.column.toLowerCase();
      const column = record.columns.get(col);
      if (!column) {
        fail(
          `${name}: pinning dimension '${dimension}' maps to column '${pin.column}', which does not exist`,
        );
        continue;
      }

      if (pin.stateColumn === undefined) {
        if (!column.notNull) {
          fail(
            `${name}: pinning column '${pin.column}' (${dimension}) is nullable — a legal-consequence record pins its provenance at creation, always`,
          );
        }
        continue;
      }

      // State-paired pin: the nullability of the value column is bought with
      // a per-row explanation the database enforces.
      const stateName = pin.stateColumn.toLowerCase();
      const pinned = pin.pinnedState.toLowerCase();
      const state = record.columns.get(stateName);
      if (!state) {
        fail(
          `${name}: pinning dimension '${dimension}' allows a null '${pin.column}' only alongside state column '${pin.stateColumn}', which does not exist`,
        );
        continue;
      }
      if (!state.notNull) {
        fail(
          `${name}: state column '${pin.stateColumn}' (${dimension}) is nullable — the column that explains a missing pin cannot itself be missing`,
        );
      }
      const vocabulary = new RegExp(`\\b${stateName}\\s+in\\s*\\(`);
      if (!clauses.some((clause) => vocabulary.test(clause) && clause.includes(`'${pinned}'`))) {
        fail(
          `${name}: no CHECK constrains '${pin.stateColumn}' to a closed vocabulary including '${pin.pinnedState}' — a free-text state explains nothing`,
        );
      }
      const forward = new RegExp(
        `\\(\\s*${stateName}\\s*=\\s*'${pinned}'\\s*\\)\\s*=\\s*\\(\\s*${col}\\s*is not null\\s*\\)`,
      );
      const reverse = new RegExp(
        `\\(\\s*${col}\\s*is not null\\s*\\)\\s*=\\s*\\(\\s*${stateName}\\s*=\\s*'${pinned}'\\s*\\)`,
      );
      if (!clauses.some((clause) => forward.test(clause) || reverse.test(clause))) {
        fail(
          `${name}: no CHECK ties '${pin.stateColumn}' = '${pin.pinnedState}' to '${pin.column}' IS NOT NULL — without it a row can claim to be pinned while carrying no version, or carry one while claiming not to be`,
        );
      }
      if (!clauses.some((clause) => /created_at\s*</.test(clause) && clause.includes(stateName))) {
        fail(
          `${name}: no CHECK requires dimension '${dimension}' for rows created from a cutoff (a clause over created_at naming '${pin.stateColumn}') — otherwise the historical state is a permanent exemption every new row can claim`,
        );
      }
    }
  }

  // A table that carries the pinning signature must be declared.
  for (const table of tables.values()) {
    if (declared.has(table.name)) continue;
    const pinColumns = [...table.columns.keys()].filter(
      (col) => col.endsWith('_at_creation') || PINNING_SIGNATURE_COLUMNS.includes(col),
    );
    if (pinColumns.length > 0) {
      violations.push({
        file: table.file,
        line: table.line,
        detail: `${table.name} carries pinning-signature column(s) [${pinColumns.join(', ')}] but is not declared in LEGAL_CONSEQUENCE_TABLES — records with legal consequence are declared, and the declaration is what test 21 verifies (data-model.md §5)`,
      });
    }
  }

  const dimensions = LEGAL_CONSEQUENCE_TABLES.reduce((n, t) => n + Object.keys(t.pins).length, 0);
  return violationsResult(
    violations,
    tables.size,
    `declared legal-consequence tables: ${LEGAL_CONSEQUENCE_TABLES.length}; pinning dimensions enforced: ${dimensions}; none deferred`,
  );
}

// ---------------------------------------------------------------------------
// Test 19 — Approval policy
// ---------------------------------------------------------------------------
// A PolicyPack that CLEARS a disclosure-bearing capability without a DECIDED
// ApprovalPolicy fails (jurisdiction-policy.md §8): no capability that
// discharges data to anyone exists without a named approval workflow.
//
// This is a repository-level STATIC check and it reads real source, not a
// runtime. Three things are verified, because each alone can be true while the
// rule is dead:
//
//   1. Every pack literal in non-test source is inspected directly. A pack is
//      recognised by its `clearedCapabilities` slot wherever it is declared —
//      including a pack declared outside the policy package, which would
//      otherwise escape review entirely.
//   2. The validator still carries the rule. Deleting the finding from
//      packages/jurisdiction-policy would make every future pack pass.
//   3. Every non-test caller of validatePack/validatePackSet supplies
//      `disclosureBearingCapabilityIds`. The rule only fires for ids the
//      caller passes, so a call site that omits them disarms it silently —
//      the failure mode a "the validator has a test for it" argument misses.
//
// Disclosure-bearing ids are read from the capability registry's source, which
// means the registry must stay statically classifiable: `disclosureBearing`
// must be a boolean literal or an expression naming the ids it applies to.
const CAPABILITY_REGISTRY_SRC_REL = path.join('packages', 'capability-registry', 'src');
const JURISDICTION_POLICY_DIR_REL = path.join('packages', 'jurisdiction-policy');

/** Index of the bracket matching the one at `open`, or -1. */
function matchBracket(src, open) {
  const openers = '([{';
  const closers = ')]}';
  if (!openers.includes(src[open])) return -1;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (openers.includes(src[i])) depth += 1;
    else if (closers.includes(src[i])) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the `{` opening the object literal enclosing `index`, or -1. */
function enclosingObjectStart(src, index) {
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const c = src[i];
    if (')]}'.includes(c)) depth += 1;
    else if ('([{'.includes(c)) {
      if (depth === 0) return c === '{' ? i : -1;
      depth -= 1;
    }
  }
  return -1;
}

/**
 * The literal body that follows `start`, skipping one call wrapper such as
 * `Object.freeze(`. Returns the text between the brackets, or null.
 */
function literalAfter(src, start, opener) {
  let i = start;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const wrapper = src.slice(i, i + 80).match(/^[A-Za-z_$][\w$.]*\s*\(\s*/);
  if (wrapper) i += wrapper[0].length;
  if (src[i] !== opener) return null;
  const end = matchBracket(src, i);
  return end === -1 ? null : src.slice(i + 1, end);
}

/** Splits a JS literal body on top-level commas (brackets and quotes tracked). */
function splitTopLevelJs(body) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quote !== null) {
      if (c === '\\') {
        current += c + (body[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

/** Top-level `key: value` pairs of an object-literal body. */
function objectEntries(body) {
  const out = [];
  for (const part of splitTopLevelJs(body)) {
    const m = part.match(
      /^\s*(?:'([^']+)'|"([^"]+)"|\[\s*([\w$.]+)\s*\]|([A-Za-z_$][\w$]*))\s*:\s*([\s\S]*)$/,
    );
    if (!m) continue;
    out.push({ key: m[1] ?? m[2] ?? m[3] ?? m[4], value: m[5].trim() });
  }
  return out;
}

/**
 * True for a TypeScript member declaration rather than a value: `readonly x:
 * boolean;`. Type declarations name the same slots packs fill, and inspecting
 * an interface as if it were a pack reports nonsense.
 */
function isTypePosition(src, keyIndex, expression) {
  const before = src.slice(Math.max(0, keyIndex - 12), keyIndex);
  if (/\breadonly\s+$/.test(before)) return true;
  return /^[\w.<>[\]\s|&]*;/.test(expression) && !/['"]/.test(expression);
}

/** The value expression following a `key:` at `start`, to the next boundary. */
function valueExpression(src, start) {
  return (splitTopLevelJs(src.slice(start, start + 400))[0] ?? '').split('\n')[0].trim();
}

const STRING_LITERAL = /'([^'\\]*)'|"([^"\\]*)"/g;

function stringLiterals(text) {
  return [...text.matchAll(STRING_LITERAL)].map((m) => m[1] ?? m[2]).filter((s) => s !== '');
}

/** Capability ids the registry source declares disclosure-bearing. */
function collectDisclosureBearingIds(root, violations) {
  const ids = new Set();
  for (const file of codeFiles([path.join(root, CAPABILITY_REGISTRY_SRC_REL)])) {
    const src = loadStripped(file);
    for (const m of src.matchAll(/\bdisclosureBearing\s*:\s*/g)) {
      const expression = valueExpression(src, m.index + m[0].length)
        .split('}')[0]
        .trim();
      if (isTypePosition(src, m.index, expression)) continue;
      if (/^false\b/.test(expression)) continue;
      if (/^true\b/.test(expression)) {
        const objectStart = enclosingObjectStart(src, m.index);
        const objectEnd = objectStart === -1 ? -1 : matchBracket(src, objectStart);
        const owner =
          objectEnd === -1
            ? null
            : (src.slice(objectStart, objectEnd).match(/\bid\s*:\s*['"]([\w$]+)['"]/)?.[1] ?? null);
        if (owner === null) {
          violations.push({
            file: rel(root, file),
            line: lineOf(src, m.index),
            detail: `'disclosureBearing: true' on an object literal with no literal 'id' — test 19 reads the disclosure-bearing set from this source and cannot attribute the flag`,
          });
          continue;
        }
        ids.add(owner);
        continue;
      }
      const named = stringLiterals(expression);
      if (named.length === 0) {
        violations.push({
          file: rel(root, file),
          line: lineOf(src, m.index),
          detail: `'disclosureBearing' is computed as '${expression}', which names no capability id — test 19 reads this set statically, so the declaration must stay classifiable (a boolean literal, or an expression naming its ids)`,
        });
        continue;
      }
      for (const id of named) ids.add(id);
    }
  }
  return ids;
}

/** Every PolicyPack literal declared in non-test source. */
function collectPackDeclarations(root, violations) {
  const packs = [];
  const files = codeFiles([
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
    ...appsSrcDirs(root),
  ]);
  for (const file of files) {
    const src = loadStripped(file);
    for (const m of src.matchAll(/\bclearedCapabilities\s*:\s*/g)) {
      const relFile = rel(root, file);
      const line = lineOf(src, m.index);
      if (isTypePosition(src, m.index, valueExpression(src, m.index + m[0].length))) continue;
      const objectStart = enclosingObjectStart(src, m.index);
      const objectEnd = objectStart === -1 ? -1 : matchBracket(src, objectStart);
      if (objectEnd === -1) {
        violations.push({
          file: relFile,
          line,
          detail: `a 'clearedCapabilities' slot whose enclosing pack literal does not parse — test 19 must read every pack, so an unparseable one is a failure, not a skip`,
        });
        continue;
      }
      const body = src.slice(objectStart + 1, objectEnd);
      const clearedAt = body.search(/\bclearedCapabilities\s*:/);
      const clearedBody = literalAfter(
        body,
        clearedAt + body.slice(clearedAt).indexOf(':') + 1,
        '[',
      );
      if (clearedBody === null) {
        violations.push({
          file: relFile,
          line,
          detail: `'clearedCapabilities' is not a literal array — the cleared ceiling is reviewed source, so it must be readable as such`,
        });
        continue;
      }
      const approvals = new Map();
      const approvalsAt = body.search(/\bapprovalPolicies\s*:/);
      if (approvalsAt !== -1) {
        const approvalsBody = literalAfter(
          body,
          approvalsAt + body.slice(approvalsAt).indexOf(':') + 1,
          '{',
        );
        if (approvalsBody !== null) {
          for (const { key, value } of objectEntries(approvalsBody)) {
            approvals.set(key, {
              decided: /\bdecided\s*\(/.test(value) || /\bstate\s*:\s*['"]DECIDED['"]/.test(value),
            });
          }
        }
      }
      packs.push({
        file: relFile,
        line,
        version: body.match(/\bversion\s*:\s*['"]([^'"]+)['"]/)?.[1] ?? '(unnamed pack)',
        cleared: stringLiterals(clearedBody),
        approvals,
      });
    }
  }
  return packs;
}

export function checkApprovalPolicy(ctx) {
  const { root } = ctx;
  const violations = [];
  const disclosureBearing = collectDisclosureBearingIds(root, violations);
  const packs = collectPackDeclarations(root, violations);

  for (const pack of packs) {
    for (const capabilityId of pack.cleared) {
      if (!disclosureBearing.has(capabilityId)) continue;
      const approval = pack.approvals.get(capabilityId);
      if (approval === undefined) {
        violations.push({
          file: pack.file,
          line: pack.line,
          detail: `pack '${pack.version}' clears disclosure-bearing capability '${capabilityId}' with no approvalPolicies entry — a capability that discharges data has an approval workflow or it is not cleared`,
        });
      } else if (!approval.decided) {
        violations.push({
          file: pack.file,
          line: pack.line,
          detail: `pack '${pack.version}' clears disclosure-bearing capability '${capabilityId}' with an approval policy that is not DECIDED — an undecided workflow is a denial, and clearing on top of it is the contradiction`,
        });
      }
    }
  }

  // The validator's own rule, so deleting it cannot quietly pass every pack.
  const validationRel = path.join(JURISDICTION_POLICY_DIR_REL, 'src', 'validation.ts');
  const validationPath = path.join(root, validationRel);
  if (!fs.existsSync(validationPath)) {
    violations.push({
      file: validationRel.split(path.sep).join('/'),
      detail: 'pack validation source is missing — the approval-policy rule has no home',
    });
  } else {
    const src = readText(validationPath);
    for (const token of ['MISSING_APPROVAL_POLICY', 'approvalPolicies', 'disclosureBearing']) {
      if (!src.includes(token)) {
        violations.push({
          file: validationRel.split(path.sep).join('/'),
          detail: `pack validation no longer references '${token}' — the approval-policy rule must stay in the validator, not only in this checker`,
        });
      }
    }
  }

  // Call sites: the rule fires only for the ids a caller supplies.
  const callerFiles = codeFiles([
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
    ...appsSrcDirs(root),
  ]).filter((file) => !isWithin(path.join(root, JURISDICTION_POLICY_DIR_REL), file));
  for (const file of callerFiles) {
    const src = loadStripped(file);
    for (const m of src.matchAll(/\bvalidatePack(?:Set)?\s*\(/g)) {
      // A declaration is not a call site; its parameter list names no ids.
      if (/\bfunction\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index))) continue;
      const open = m.index + m[0].length - 1;
      const end = matchBracket(src, open);
      const args = end === -1 ? '' : src.slice(open + 1, end);
      if (!args.includes('disclosureBearingCapabilityIds')) {
        violations.push({
          file: rel(root, file),
          line: lineOf(src, m.index),
          detail: `calls ${m[0].slice(0, -1)} without 'disclosureBearingCapabilityIds' — the approval-policy rule only fires for ids the caller passes, so this call site validates packs with the rule switched off`,
        });
      }
    }
  }

  return violationsResult(
    violations,
    packs.length,
    `packs inspected: ${packs.length}; disclosure-bearing capabilities: ${
      disclosureBearing.size === 0 ? 'none declared' : [...disclosureBearing].sort().join(', ')
    }`,
  );
}

// ---------------------------------------------------------------------------
// Test 7 — Money discipline (lexical)
// ---------------------------------------------------------------------------
export function checkMoneyDiscipline(ctx) {
  const { root } = ctx;
  const violations = [];
  // Scope: the pure packages, EVERY module layer, and the API/worker apps.
  //
  // It used to stop at domain and application, which left out exactly the two
  // boundaries where a float would enter from outside — the DB-to-domain
  // row-mappers under `infrastructure`, and the wire-to-domain input readers
  // under `apps/api/src`. Nothing else scanned them either, so the guarantee
  // `docs/testing/architecture-tests.md` states was wider than the check.
  //
  // NOT `packages/*/src` wholesale: `packages/platform/src/outbox/relay.ts`
  // records an outbox lag GAUGE in seconds with `Number.parseFloat`, which is a
  // duration and not money. Widening to every package would make this check
  // fire on it, and a check that cries wolf is one somebody switches off.
  const files = codeFiles([
    ...PURE_PACKAGES.map((p) => path.join(root, 'packages', p, 'src')),
    ...moduleLayerDirs(root, ['domain', 'application', 'infrastructure', 'presentation']),
    path.join(root, 'apps', 'api', 'src'),
    path.join(root, 'apps', 'worker', 'src'),
  ]);
  const monetaryNumber =
    /\b(minorUnits|basisPoints|amount|amounts|balance|balances|price|prices|fee|fees|monetaryValue)\s*\??\s*:\s*number\b/g;
  /**
   * The ONE sanctioned shape, named exactly, with its reason.
   *
   * `Money.allocate` converts a remainder to a Number to use it as a count:
   * the algorithm has already proved `0 <= leftover < weights.length`, and an
   * array index is not a monetary value. It lives inside `Money` itself, which
   * is the type that owns exact arithmetic — nowhere else gets this.
   *
   * Liveness is checked: an allowance that has stopped matching is a hole left
   * open for the next violation, so a stale one FAILS the check rather than
   * lingering. Same rule the documentation style allowances are held to.
   */
  const MONEY_ALLOWANCES = [
    {
      file: 'packages/shared-kernel/src/money.ts',
      shape: /Number\(this\.minorUnits - assigned\)/,
      why: 'a bounded remainder used as an array count, proved < weights.length by the lines above it',
    },
  ];
  const allowanceUsed = new Set();

  // Shapes, not only files. Widening the SCOPE added the layers where a float
  // enters and left the DETECTION unchanged, so the commonest row-mapper
  // mistake — `Number(row.amount_minor_units) / 100` — was in scope and
  // invisible. Each pattern below is anchored on a money-named operand so an
  // ordinary count, index or duration is not swept up.
  const money =
    '(?:minorUnits|minor_units|basisPoints|amount|amounts|balance|balances|price|prices|fee|fees|monetaryValue)';
  const floatOps = [
    /\bparseFloat\s*\(/g,
    /\bNumber\.parseFloat\b/g,
    /\.toFixed\s*\(/g,
    // `Number(...)` over a money-named expression: the row-mapper float.
    new RegExp(`\\bNumber\\s*\\([^)]*${money}`, 'gi'),
    // `parseInt` over money: exact, but a base-10 parse of a minor-unit string
    // is the client-side total in TypeScript clothing.
    new RegExp(`\\bparseInt\\s*\\([^)]*${money}`, 'gi'),
    // Division or multiplication of a money-named operand by a scale factor —
    // major/minor conversion, which belongs in Money and nowhere else.
    new RegExp(`${money}[A-Za-z0-9_]*\\s*[/*]\\s*[0-9]`, 'gi'),
    // Rounding a money expression at all.
    new RegExp(`Math\\.(?:round|floor|ceil|abs)\\s*\\([^)]*${money}`, 'gi'),
  ];
  for (const file of files) {
    const src = loadStripped(file);
    for (const m of src.matchAll(monetaryNumber)) {
      violations.push({
        file: rel(root, file),
        line: lineOf(src, m.index),
        detail: `monetary position '${m[1]}' typed as number — monetary amounts are Money/bigint, never floats or bare number`,
      });
    }
    for (const re of floatOps) {
      for (const m of src.matchAll(re)) {
        const allowance = MONEY_ALLOWANCES.find(
          (candidate) =>
            rel(root, file) === candidate.file &&
            candidate.shape.test(m[0] + src.slice(m.index, m.index + 80)),
        );
        if (allowance !== undefined) {
          allowanceUsed.add(allowance.file);
          continue;
        }
        violations.push({
          file: rel(root, file),
          line: lineOf(src, m.index),
          detail: `float operation '${m[0].trim()}' in a money-bearing layer`,
        });
      }
    }
  }
  for (const allowance of MONEY_ALLOWANCES) {
    if (allowanceUsed.has(allowance.file)) continue;
    violations.push({
      file: allowance.file,
      detail: `money-discipline allowance no longer matches anything (${allowance.why}) — a stale allowance is a hole left open for the next violation; remove it`,
    });
  }
  return violationsResult(
    violations,
    files.length,
    `lexical check over ${String(MONEY_ALLOWANCES.length)} sanctioned shape; type-level enforcement deepens with the financial engine`,
  );
}

// ---------------------------------------------------------------------------
// Tests 8 + 15 — Event catalogue (published events + payload rules)
// ---------------------------------------------------------------------------
export function checkEventCatalogue(ctx) {
  const { root } = ctx;
  const violations = [];
  const cataloguePath = path.join(root, 'packages', 'api-contracts', 'events', 'catalogue.json');
  const catalogueRel = rel(root, cataloguePath);
  let catalogue = null;

  if (!fs.existsSync(cataloguePath)) {
    violations.push({ file: catalogueRel, detail: 'event catalogue file is missing' });
  } else {
    try {
      catalogue = readJson(cataloguePath);
    } catch (err) {
      violations.push({ file: catalogueRel, detail: `catalogue does not parse: ${err.message}` });
    }
  }

  const names = new Set();
  if (catalogue) {
    if (!Array.isArray(catalogue.events)) {
      violations.push({ file: catalogueRel, detail: `'events' must be an array` });
    } else {
      catalogue.events.forEach((event, i) => {
        const where = `events[${i}]`;
        if (typeof event.name !== 'string' || event.name === '') {
          violations.push({ file: catalogueRel, detail: `${where}: missing 'name'` });
          return;
        }
        if (names.has(event.name)) {
          violations.push({
            file: catalogueRel,
            detail: `${where}: duplicate event '${event.name}'`,
          });
        }
        names.add(event.name);
        if (typeof event.classification !== 'string' || event.classification === '') {
          violations.push({
            file: catalogueRel,
            detail: `${where} (${event.name}): missing 'classification'`,
          });
        }
        if (!Array.isArray(event.allowedConsumers)) {
          violations.push({
            file: catalogueRel,
            detail: `${where} (${event.name}): 'allowedConsumers' must be an array`,
          });
        }
        if (typeof event.payloadRule !== 'string' || event.payloadRule === '') {
          violations.push({
            file: catalogueRel,
            detail: `${where} (${event.name}): missing 'payloadRule'`,
          });
        }
        if (
          event.classification === 'SEALED' &&
          !['identifier-only', 'identifiers-and-status'].includes(event.payloadRule)
        ) {
          violations.push({
            file: catalogueRel,
            detail: `${where} (${event.name}): SEALED events carry identifiers and status only — no exemption exists`,
          });
        }
        if (
          event.classification === 'HIGHLY_SENSITIVE_FINANCIAL' &&
          event.payloadRule !== 'identifier-only'
        ) {
          const ex = event.payloadExemption;
          const ok =
            ex &&
            ['owner', 'reason', 'reviewer'].every((k) => typeof ex[k] === 'string' && ex[k] !== '');
          if (!ok) {
            violations.push({
              file: catalogueRel,
              detail: `${where} (${event.name}): HIGHLY_SENSITIVE_FINANCIAL payload requires payloadExemption naming owner, reason, and reviewer`,
            });
          }
        }
      });
    }
  }

  // No event definitions outside the catalogue: every DomainEvent
  // implementation in code must carry a statically-declared name present in
  // the catalogue.
  const files = codeFiles([
    ...appsSrcDirs(root),
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
  ]);
  let publishSites = 0;
  for (const file of files) {
    const src = loadStripped(file);
    if (/\b(?:implements|extends)\s+DomainEvent\b/.test(src)) {
      const declared = [
        ...src.matchAll(/(?:readonly\s+)?\bname\s*(?::\s*string)?\s*=\s*['"]([^'"]+)['"]/g),
        ...src.matchAll(/\bname\s*:\s*['"]([^'"]+)['"]/g),
      ].map((m) => m[1]);
      if (declared.length === 0) {
        violations.push({
          file: rel(root, file),
          detail:
            'DomainEvent implementation without a statically-declared name — cannot be checked against the catalogue',
        });
      }
      for (const name of declared) {
        if (!names.has(name)) {
          violations.push({
            file: rel(root, file),
            detail: `event '${name}' is defined in code but absent from the catalogue`,
          });
        }
      }
    }
    for (const m of src.matchAll(
      /\b(?:publishEvent|emitDomainEvent)\s*\(|\.publish(?:All)?\s*\(/g,
    )) {
      publishSites += 1;
      if (names.size === 0) {
        violations.push({
          file: rel(root, file),
          line: lineOf(src, m.index),
          detail:
            'publish call site with an empty event catalogue — published events must be catalogued first',
        });
      }
    }
  }

  return violationsResult(
    violations,
    files.length,
    `catalogue entries: ${names.size}; publish call sites: ${publishSites}; structural check (schema + no definitions outside catalogue)`,
  );
}

// ---------------------------------------------------------------------------
// Test 10 — No direct provider access (cloud/provider boundary)
// ---------------------------------------------------------------------------
export function checkProviderBoundary(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...appsSrcDirs(root),
    ...packagesSrcDirs(root),
    ...moduleLayerDirs(root, ['domain', 'application']),
  ]);
  const exempt = (file) => /[\\/]infrastructure[\\/](providers|persistence)[\\/]/.test(file);
  const forbiddenSpecifier = (s) =>
    s.startsWith('@google-cloud/') ||
    s.startsWith('@aws-sdk/') ||
    s.startsWith('@azure/') ||
    s === 'aws-sdk' ||
    s.startsWith('aws-sdk/') ||
    s === 'googleapis' ||
    s.startsWith('googleapis/');
  const literalPatterns = [
    { re: /gs:\/\//g, what: "provider URI 'gs://'" },
    { re: /\barn:aws/g, what: "provider resource name 'arn:aws'" },
    {
      re: /\bprojects\/[a-z0-9][a-z0-9_-]*\/(?:locations|topics|subscriptions|secrets|instances|databases|keyRings|serviceAccounts)\b/g,
      what: 'provider resource-name path (projects/<id>/...)',
    },
    {
      re: /\b(GCP_PROJECT_ID|GOOGLE_APPLICATION_CREDENTIALS|AWS_REGION)\b/g,
      what: 'provider environment variable',
    },
  ];
  for (const file of files) {
    if (exempt(file)) continue;
    const src = loadStripped(file);
    for (const { specifier, line } of extractImports(src)) {
      if (forbiddenSpecifier(specifier)) {
        violations.push({
          file: rel(root, file),
          line,
          detail: `imports provider SDK '${specifier}' outside infrastructure/providers/ or infrastructure/persistence/`,
        });
      }
    }
    for (const { re, what } of literalPatterns) {
      for (const m of src.matchAll(re)) {
        violations.push({
          file: rel(root, file),
          line: lineOf(src, m.index),
          detail: `${what} ('${m[0]}') outside provider infrastructure`,
        });
      }
    }
  }
  return violationsResult(violations, files.length);
}

// ---------------------------------------------------------------------------
// Test 11 — Deterministic domain
// ---------------------------------------------------------------------------
export function checkDeterministicDomain(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...PURE_PACKAGES.map((p) => path.join(root, 'packages', p, 'src')),
    ...moduleLayerDirs(root, ['domain']),
  ]);
  const patterns = [
    { re: /\bDate\.now\s*\(/g, what: 'Date.now()' },
    { re: /\bnew\s+Date\s*\(\s*\)/g, what: 'new Date() with no argument (system clock read)' },
    { re: /\bMath\.random\b/g, what: 'Math.random' },
    { re: /\brandomUUID\b/g, what: 'randomUUID' },
    { re: /\bcrypto\.getRandomValues\b/g, what: 'crypto.getRandomValues' },
    { re: /\bprocess\.hrtime\b/g, what: 'process.hrtime' },
    { re: /\bperformance\.now\b/g, what: 'performance.now' },
  ];
  for (const file of files) {
    const src = loadStripped(file);
    for (const { re, what } of patterns) {
      for (const m of src.matchAll(re)) {
        violations.push({
          file: rel(root, file),
          line: lineOf(src, m.index),
          detail: `${what} in deterministic code — time and randomness arrive as arguments (Clock port)`,
        });
      }
    }
  }
  return violationsResult(violations, files.length);
}

// ---------------------------------------------------------------------------
// Test 12 — No jurisdiction branching (lexical)
// ---------------------------------------------------------------------------
export function checkJurisdictionBranching(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles(moduleLayerDirs(root, ['domain', 'application', 'presentation']));
  const patterns = [
    {
      re: /\bswitch\s*\([^)]*\b[\w.$]*(?:jurisdiction|country)[\w.$]*/gi,
      what: 'switch on a jurisdiction/country identifier',
    },
    {
      re: /\b[\w.$]*(?:jurisdiction|country)[\w.$]*\s*(?:===|!==|==|!=)/gi,
      what: 'equality comparison on a jurisdiction/country identifier',
    },
    {
      re: /(?:===|!==|==|!=)\s*[\w.$]*(?:jurisdiction|country)[\w.$]*/gi,
      what: 'equality comparison on a jurisdiction/country identifier',
    },
  ];
  for (const file of files) {
    const src = loadStripped(file);
    const seenLines = new Set();
    for (const { re, what } of patterns) {
      for (const m of src.matchAll(re)) {
        const line = lineOf(src, m.index);
        if (seenLines.has(line)) continue;
        seenLines.add(line);
        violations.push({
          file: rel(root, file),
          line,
          detail: `${what} — behaviour differences resolve through policy packs, never inline branches`,
        });
      }
    }
  }
  return violationsResult(violations, files.length);
}

// ---------------------------------------------------------------------------
// Test 16 — Module ownership (MODULE.md present)
// ---------------------------------------------------------------------------
export function checkModuleDocs(ctx) {
  const { root } = ctx;
  const violations = [];
  const names = moduleNames(root);
  for (const mod of names) {
    if (!fs.existsSync(path.join(root, 'modules', mod, 'MODULE.md'))) {
      violations.push({ file: `modules/${mod}`, detail: 'MODULE.md is missing' });
    }
  }
  return violationsResult(violations, names.length);
}

// ---------------------------------------------------------------------------
// Test 17 — Pure packages (no runtime dependencies)
// ---------------------------------------------------------------------------
// Two tiers, both checked at the manifest AND in the source. The manifest
// alone is not sufficient: `node:fs`, `node:http`, and `node:child_process`
// are builtins, so a package can reach the filesystem or the network without
// declaring a single dependency.
//
//   PURE_PACKAGES              only @karar/shared-kernel (and shared-kernel
//                              itself, nothing at all).
//   PURITY_CONSTRAINED         packages that legitimately build on another
//                              pure package. capability-registry declares
//                              @karar/jurisdiction-policy for JurisdictionId;
//                              everything else — framework, ORM, HTTP client,
//                              filesystem, cloud SDK — stays out, so the
//                              registry can be imported by any layer without
//                              dragging infrastructure behind it.
const PURITY_CONSTRAINED_PACKAGES = [
  { name: 'capability-registry', allowed: ['@karar/shared-kernel', '@karar/jurisdiction-policy'] },
];

export function checkPurePackages(ctx) {
  const { root } = ctx;
  const violations = [];
  const tiers = [
    ...PURE_PACKAGES.map((name) => ({
      name,
      allowed: name === 'shared-kernel' ? [] : ['@karar/shared-kernel'],
      scanSource: false,
    })),
    ...PURITY_CONSTRAINED_PACKAGES.map((p) => ({ ...p, scanSource: true })),
  ];

  for (const { name, allowed, scanSource } of tiers) {
    const pkgDir = path.join(root, 'packages', name);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    const relPath = rel(root, pkgJsonPath);
    if (!fs.existsSync(pkgJsonPath)) {
      violations.push({ file: relPath, detail: 'package.json missing' });
      continue;
    }
    let json;
    try {
      json = readJson(pkgJsonPath);
    } catch (err) {
      violations.push({ file: relPath, detail: `does not parse: ${err.message}` });
      continue;
    }
    const permitted = allowed.join(', ') || 'nothing';
    for (const dep of Object.keys(json.dependencies ?? {})) {
      if (allowed.includes(dep)) continue;
      violations.push({
        file: relPath,
        detail:
          allowed.length === 0
            ? `${name} declares runtime dependency '${dep}' — it must have none`
            : `${name} declares runtime dependency '${dep}' — only ${permitted} is allowed (no framework, ORM, HTTP, filesystem, or cloud dependency)`,
      });
    }

    // Source imports for the constrained tier. The pure tier's imports are
    // test 1's subject, which enforces the same shape one layer deeper.
    if (!scanSource) continue;
    for (const file of codeFiles([path.join(pkgDir, 'src')])) {
      const src = loadStripped(file);
      for (const { specifier, line } of extractImports(src)) {
        if (specifier.startsWith('.') || allowed.includes(specifier)) continue;
        violations.push({
          file: rel(root, file),
          line,
          detail: `${name} imports '${specifier}' — only ./relative and ${permitted} are allowed; a builtin or third-party import here (filesystem, HTTP, framework, ORM, cloud) is exactly what this tier exists to keep out`,
        });
      }
    }
  }
  return violationsResult(
    violations,
    tiers.length,
    `pure: ${PURE_PACKAGES.join(', ')}; purity-constrained (manifest + source): ${PURITY_CONSTRAINED_PACKAGES.map((p) => p.name).join(', ')}`,
  );
}

// ---------------------------------------------------------------------------
// Test 18 — Storage access (object-storage clients confined)
// ---------------------------------------------------------------------------
export function checkStorageBoundary(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...appsSrcDirs(root),
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
  ]);
  const allowed = (file) =>
    /[\\/]modules[\\/]documents[\\/]infrastructure[\\/]/.test(file) ||
    /[\\/]infrastructure[\\/]providers[\\/]/.test(file);
  const isStorage = (s) =>
    s === 'minio' ||
    s.startsWith('minio/') ||
    s === '@google-cloud/storage' ||
    s.startsWith('@google-cloud/storage/') ||
    s === '@aws-sdk/client-s3' ||
    s.startsWith('@aws-sdk/client-s3/');
  for (const file of files) {
    for (const { specifier, line } of extractImports(loadStripped(file))) {
      if (isStorage(specifier) && !allowed(file)) {
        violations.push({
          file: rel(root, file),
          line,
          detail: `imports object-storage client '${specifier}' outside modules/documents/infrastructure/ or infrastructure/providers/`,
        });
      }
    }
  }
  return violationsResult(violations, files.length);
}

// ---------------------------------------------------------------------------
// Test 20 — Kernel surface (exactly the ten universals)
// ---------------------------------------------------------------------------
function collectExports(file, resolveReexports) {
  const src = stripComments(readText(file));
  const names = new Set();
  const declRe =
    /\bexport\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const m of src.matchAll(declRe)) names.add(m[1]);
  for (const m of src.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const item of m[1].split(',')) {
      const trimmed = item.trim().replace(/^type\s+/, '');
      if (trimmed === '') continue;
      const aliased = trimmed.match(/^\S+\s+as\s+(\S+)$/);
      names.add(aliased ? aliased[1] : trimmed);
    }
  }
  if (/\bexport\s+default\b/.test(src)) names.add('default');
  for (const m of src.matchAll(
    /\bexport\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s*['"]([^'"]+)['"]/g,
  )) {
    if (m[1]) {
      names.add(m[1]);
    } else if (resolveReexports && m[2].startsWith('.')) {
      const base = resolveRelative(file, m[2]);
      const candidates = [base, `${base}.ts`, `${base}.mts`, path.join(base, 'index.ts')];
      const target = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
      if (target) {
        // One level only — the kernel surface is a single file by design.
        for (const name of collectExports(target, false)) names.add(name);
      }
    }
  }
  return names;
}

export function checkKernelSurface(ctx) {
  const { root } = ctx;
  const violations = [];
  const indexPath = path.join(root, 'packages', 'shared-kernel', 'src', 'index.ts');
  const relPath = rel(root, indexPath);
  if (!fs.existsSync(indexPath)) {
    violations.push({ file: relPath, detail: 'shared-kernel entry point missing' });
    return violationsResult(violations, 0);
  }
  const actual = collectExports(indexPath, true);
  const expected = new Set(KERNEL_EXPORTS);
  for (const name of actual) {
    if (!expected.has(name)) {
      violations.push({
        file: relPath,
        detail: `exports '${name}' — the kernel surface is capped at the ten universals (additions require an ADR)`,
      });
    }
  }
  for (const name of expected) {
    if (!actual.has(name)) {
      violations.push({
        file: relPath,
        detail: `universal '${name}' is missing — the kernel surface must be exactly the ten`,
      });
    }
  }
  return violationsResult(violations, 1, `exports found: ${[...actual].sort().join(', ')}`);
}

// ---------------------------------------------------------------------------
// Test 5 — Ports declared inward
// ---------------------------------------------------------------------------
// Every infrastructure adapter class implements a port interface declared in
// its own module's application/ports/. The rule is existential (an adapter
// without a port is the violation), so it activates with the first module
// that has infrastructure code (Phase 2: modules/audit).
const ADAPTER_CLASS_NAME =
  /(Adapter|Writer|Reader|Repository|Provider|Store|Gateway|Client|Publisher|Consumer|Relay|Source|Sink)$/;

export function checkPortsDeclaredInward(ctx) {
  const { root } = ctx;
  const violations = [];
  let scanned = 0;
  for (const mod of moduleNames(root)) {
    const modDir = path.join(root, 'modules', mod);
    const infraFiles = codeFiles([path.join(modDir, 'infrastructure')]);
    if (infraFiles.length === 0) continue;
    scanned += infraFiles.length;

    // Port names declared under application/ports/ (any depth).
    const portNames = new Set();
    for (const portFile of codeFiles([path.join(modDir, 'application', 'ports')])) {
      const portSrc = loadStripped(portFile);
      for (const m of portSrc.matchAll(
        /\bexport\s+(?:declare\s+)?(?:abstract\s+class|interface|type)\s+([A-Za-z_$][\w$]*)/g,
      )) {
        portNames.add(m[1]);
      }
    }

    for (const file of infraFiles) {
      const src = loadStripped(file);
      for (const m of src.matchAll(
        /\bexport\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)([^{]*)\{/g,
      )) {
        const className = m[1];
        const heritage = m[2] ?? '';
        if (!ADAPTER_CLASS_NAME.test(className)) continue;
        const implementsMatch = heritage.match(/\bimplements\s+(.+)$/s);
        const implemented = implementsMatch
          ? implementsMatch[1]
              .split(',')
              .map((name) => name.trim().split('<')[0].trim())
              .filter((name) => name !== '')
          : [];
        if (implemented.length === 0) {
          violations.push({
            file: rel(root, file),
            line: lineOf(src, m.index),
            detail: `infrastructure adapter '${className}' implements no interface — every adapter implements a port declared in modules/${mod}/application/ports/`,
          });
          continue;
        }
        if (!implemented.some((name) => portNames.has(name))) {
          violations.push({
            file: rel(root, file),
            line: lineOf(src, m.index),
            detail: `infrastructure adapter '${className}' implements [${implemented.join(', ')}], none of which is declared under modules/${mod}/application/ports/ — ports are declared inward`,
          });
        }
      }
    }
  }
  return violationsResult(violations, scanned);
}

// ---------------------------------------------------------------------------
// Test 6 — No business logic in controllers
// ---------------------------------------------------------------------------
// Controllers translate transport to use-case calls and back. The declared
// complexity budget: at most MAX_CONTROLLER_ROUTES route handlers and
// MAX_CONTROLLER_LINES lines per controller file, and no import of any
// module's domain/ layer — domain access goes through a use case.
const MAX_CONTROLLER_ROUTES = 8;
const MAX_CONTROLLER_LINES = 250;
const ROUTE_DECORATOR = /@(Get|Post|Put|Patch|Delete|Head|Options|All|Sse)\s*\(/g;

export function checkControllerComplexity(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...appsSrcDirs(root),
    ...moduleLayerDirs(root, ['presentation']),
  ]).filter((file) => /controller/i.test(path.basename(file)));
  const modules = new Set(moduleNames(root));
  const modulesRoot = path.join(root, 'modules');

  for (const file of files) {
    const src = loadStripped(file);
    const lineCount = src.split('\n').length;
    if (lineCount > MAX_CONTROLLER_LINES) {
      violations.push({
        file: rel(root, file),
        detail: `controller is ${lineCount} lines (budget ${MAX_CONTROLLER_LINES}) — move logic into use cases`,
      });
    }
    const routes = [...src.matchAll(ROUTE_DECORATOR)].length;
    if (routes > MAX_CONTROLLER_ROUTES) {
      violations.push({
        file: rel(root, file),
        detail: `controller declares ${routes} route handlers (budget ${MAX_CONTROLLER_ROUTES}) — split the surface`,
      });
    }
    for (const { specifier, line } of extractImports(src)) {
      const bare = specifier.match(/^@karar\/([^/]+)\/(?:dist\/)?domain(?:\/|$)/);
      if (bare && modules.has(bare[1])) {
        violations.push({
          file: rel(root, file),
          line,
          detail: `controller imports '${specifier}' — controllers never import a module's domain/ directly; call a use case`,
        });
        continue;
      }
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file, specifier);
        if (isWithin(modulesRoot, resolved)) {
          const target = path.relative(modulesRoot, resolved).split(path.sep)[0];
          if (isWithin(path.join(modulesRoot, target, 'domain'), resolved)) {
            violations.push({
              file: rel(root, file),
              line,
              detail: `controller imports module '${target}' domain internals ('${specifier}') — call a use case`,
            });
          }
        }
      }
    }
  }
  return violationsResult(
    violations,
    files.length,
    `budgets: ${MAX_CONTROLLER_ROUTES} routes, ${MAX_CONTROLLER_LINES} lines, no domain imports`,
  );
}

// ---------------------------------------------------------------------------
// Test 23 — No declared guard without call site
// ---------------------------------------------------------------------------
// A class named *Guard is a declared protection. A protection that nothing
// references is decoration that reads as security — so every declared guard
// must be referenced from non-test code outside its own declaration.
export function checkGuardCallSites(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...appsSrcDirs(root),
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
  ]);
  const sources = new Map(files.map((file) => [file, loadStripped(file)]));

  const declarations = [];
  for (const [file, src] of sources) {
    for (const m of src.matchAll(/\bclass\s+([A-Za-z_$][\w$]*Guard)\b/g)) {
      declarations.push({ file, name: m[1], line: lineOf(src, m.index) });
    }
  }

  for (const { file, name, line } of declarations) {
    const wordRe = new RegExp(`\\b${name}\\b`, 'g');
    let referenced = false;
    for (const [otherFile, src] of sources) {
      const count = [...src.matchAll(wordRe)].length;
      if (otherFile === file) {
        // The declaration itself counts once; any further mention in the
        // defining file (instantiation, registration) is a call site.
        if (count > 1) referenced = true;
      } else if (count > 0) {
        referenced = true;
      }
      if (referenced) break;
    }
    if (!referenced) {
      violations.push({
        file: rel(root, file),
        line,
        detail: `guard '${name}' is declared but never referenced outside its declaration — a guard with no call site protects nothing (tests do not count as call sites)`,
      });
    }
  }
  return violationsResult(violations, files.length, `guards declared: ${declarations.length}`);
}

// ---------------------------------------------------------------------------
// Test 25 — Lifecycle declarations (Data owned tables, ADR-0026 strategies)
// ---------------------------------------------------------------------------
const SUBJECT_RELATIONSHIPS = ['SUBJECT_OWNED', 'SUBJECT_DERIVED', 'AGGREGATE', 'NON_PERSONAL'];
const DATA_CLASSES = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'HIGHLY_SENSITIVE_FINANCIAL',
  'SECRET',
  'SEALED',
];
const LIFECYCLE_COLUMNS = [
  { key: 'subject', re: /subject/i },
  { key: 'purpose', re: /purpose/i },
  { key: 'classification', re: /classification/i },
  { key: 'retention', re: /retention/i },
  { key: 'export', re: /export/i },
  { key: 'erasure', re: /erasure/i },
];

function isLifecyclePlaceholder(value) {
  return (
    value === '' ||
    value === '—' ||
    value === '-' ||
    value === '_' ||
    value === '?' ||
    /^(tbd|todo|\?{2,3}|n\.?a\.?)$/i.test(value)
  );
}

/** Column indexes for the six lifecycle fields, or null when the table is not in six-field format. */
function lifecycleColumnIndexes(headers) {
  const indexes = {};
  for (const { key, re } of LIFECYCLE_COLUMNS) {
    const idx = headers.findIndex((h) => re.test(h));
    if (idx === -1) return null;
    indexes[key] = idx;
  }
  return indexes;
}

/** Validates one named six-field row; pushes violations described against `where`. */
function validateLifecycleRow(violations, relPath, where, row, indexes) {
  const cell = (key) => plainCell(row[indexes[key]] ?? '');
  for (const { key } of LIFECYCLE_COLUMNS) {
    if (isLifecyclePlaceholder(cell(key))) {
      violations.push({
        file: relPath,
        detail: `${where}: '${key}' is empty or a placeholder — all six lifecycle fields are declared at design time, placeholders are forbidden (ADR-0026)`,
      });
    }
  }
  const subject = cell('subject');
  if (!isLifecyclePlaceholder(subject) && !SUBJECT_RELATIONSHIPS.includes(subject)) {
    violations.push({
      file: relPath,
      detail: `${where}: subject relationship '${subject}' is not one of (${SUBJECT_RELATIONSHIPS.join(', ')})`,
    });
  }
  const classification = cell('classification');
  if (!isLifecyclePlaceholder(classification) && !DATA_CLASSES.includes(classification)) {
    violations.push({
      file: relPath,
      detail: `${where}: classification '${classification}' is not one of the six classes (${DATA_CLASSES.join(', ')})`,
    });
  }
  const exportCell = cell('export');
  if (!isLifecyclePlaceholder(exportCell)) {
    if (!/^(included|excluded|n\/a)\b/i.test(exportCell)) {
      violations.push({
        file: relPath,
        detail: `${where}: export treatment '${exportCell}' must be 'included', 'excluded (reason)', or 'n/a'`,
      });
    } else if (/^excluded$/i.test(exportCell)) {
      violations.push({
        file: relPath,
        detail: `${where}: export treatment 'excluded' requires a stated reason (ADR-0026 — the legacy's export claimed completeness while omitting categories, P5)`,
      });
    }
  }
  const erasure = cell('erasure');
  if (!isLifecyclePlaceholder(erasure) && !ERASURE_STRATEGIES.includes(erasure)) {
    violations.push({
      file: relPath,
      detail: `${where}: erasure strategy '${erasure}' is not one of the four canonical values (${ERASURE_STRATEGIES.join(', ')})`,
    });
  }
}

export function checkLifecycleDeclarations(ctx) {
  const { root } = ctx;
  const violations = [];
  const names = moduleNames(root);
  const placeholder = (v) => v === '' || v === '—' || v === '-' || v === '_';
  for (const mod of names) {
    const mdPath = path.join(root, 'modules', mod, 'MODULE.md');
    const relPath = `modules/${mod}/MODULE.md`;
    if (!fs.existsSync(mdPath)) {
      violations.push({ file: relPath, detail: 'MODULE.md missing — lifecycle undeclarable' });
      continue;
    }
    const section = extractSection(readText(mdPath), 'Data owned');
    if (!section) {
      violations.push({ file: relPath, detail: `no '## Data owned' section` });
      continue;
    }
    const table = parseMdTable(section);
    if (!table) {
      violations.push({ file: relPath, detail: `'## Data owned' has no table` });
      continue;
    }
    const erasureIdx = table.headers.findIndex((h) => /erasure/i.test(h));
    if (erasureIdx === -1) {
      violations.push({ file: relPath, detail: `Data owned table has no erasure-strategy column` });
      continue;
    }
    const sixField = lifecycleColumnIndexes(table.headers);
    // Deepening (Phase 2, first real schema): a module that has implementation
    // code owns real datasets, so the skeleton-era erasure-only table no
    // longer suffices — it must declare all six fields (ADR-0026).
    if (sixField === null && codeFiles([path.join(root, 'modules', mod)]).length > 0) {
      violations.push({
        file: relPath,
        detail: `module '${mod}' has implementation code but its Data owned table is not in the six-field format (Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy)`,
      });
    }
    for (const row of table.rows) {
      const tableName = plainCell(row[0] ?? '');
      if (placeholder(tableName)) {
        continue; // template/guidance rows carry no dataset name
      }
      if (sixField !== null) {
        validateLifecycleRow(violations, relPath, `table '${tableName}'`, row, sixField);
        continue;
      }
      const value = plainCell(row[erasureIdx] ?? '');
      if (placeholder(value)) {
        // A named dataset with no declared erasure strategy is exactly the
        // gap test 25 exists to catch.
        violations.push({
          file: relPath,
          detail: `table '${tableName}': erasure strategy is empty/placeholder — a named dataset must declare one of (${ERASURE_STRATEGIES.join(', ')})`,
        });
        continue;
      }
      if (!ERASURE_STRATEGIES.includes(value)) {
        violations.push({
          file: relPath,
          detail: `table '${tableName}': erasure strategy '${value}' is not one of the four canonical values (${ERASURE_STRATEGIES.join(', ')})`,
        });
      }
    }
  }

  // Platform-owned datasets: packages/platform/db/DATA_LIFECYCLE.md carries
  // the same six-field table for tables no module owns (schema_migrations,
  // and workstream D's outbox/jobs rows). Same rules, same strictness.
  const lifecyclePath = path.join(root, 'packages', 'platform', 'db', 'DATA_LIFECYCLE.md');
  const lifecycleRel = 'packages/platform/db/DATA_LIFECYCLE.md';
  if (!fs.existsSync(lifecyclePath)) {
    violations.push({
      file: lifecycleRel,
      detail: 'DATA_LIFECYCLE.md missing — platform-owned tables must declare their lifecycle',
    });
  } else {
    const table = parseMdTable(readText(lifecyclePath).split('\n'));
    const sixField = table === null ? null : lifecycleColumnIndexes(table.headers);
    if (table === null || sixField === null) {
      violations.push({
        file: lifecycleRel,
        detail:
          'DATA_LIFECYCLE.md has no six-field lifecycle table (Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy)',
      });
    } else {
      for (const row of table.rows) {
        const tableName = plainCell(row[0] ?? '');
        if (placeholder(tableName)) continue;
        validateLifecycleRow(violations, lifecycleRel, `table '${tableName}'`, row, sixField);
      }
    }
  }

  return violationsResult(violations, names.length + 1);
}

// ---------------------------------------------------------------------------
// Test 26 — Assurance-claim referential integrity
// ---------------------------------------------------------------------------
export function checkAssuranceClaims(ctx) {
  const { root } = ctx;
  const violations = [];
  const mdPath = path.join(root, 'docs', 'security', 'assurance-claims.md');
  const relPath = 'docs/security/assurance-claims.md';
  const registryPath = path.join(root, REGISTRY_REL);

  let registryIds = new Set();
  try {
    const registry = readJson(registryPath);
    registryIds = new Set((registry.tests ?? []).map((t) => String(t.id)));
  } catch (err) {
    violations.push({ file: REGISTRY_REL, detail: `registry unreadable: ${err.message}` });
  }

  // The registry must contain every canonical test 1..26 plus canary-purity
  // (docs/testing/architecture-tests.md defines 26).
  for (let n = 1; n <= 26; n += 1) {
    if (!registryIds.has(String(n))) {
      violations.push({
        file: REGISTRY_REL,
        detail: `canonical architecture test ${n} is missing from the registry`,
      });
    }
  }
  if (!registryIds.has('canary-purity')) {
    violations.push({
      file: REGISTRY_REL,
      detail: `canary-purity test is missing from the registry`,
    });
  }

  if (!fs.existsSync(mdPath)) {
    violations.push({ file: relPath, detail: 'assurance-claims.md missing' });
    return violationsResult(violations, 0);
  }

  const lines = readText(mdPath).split('\n');
  let headerIdx = null;
  let cols = null;
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    const plain = cells.map((c) => plainCell(c).toLowerCase());
    if (plain.includes('id') && plain.includes('evidence') && plain.includes('status')) {
      headerIdx = i;
      cols = {
        id: plain.indexOf('id'),
        evidence: plain.indexOf('evidence'),
        owner: plain.indexOf('owner'),
        status: plain.indexOf('status'),
      };
      continue;
    }
    if (cols && /^AC-\d{3}$/.test(plainCell(cells[cols.id] ?? ''))) {
      rows.push({ line: i + 1, cells });
    }
  }

  if (headerIdx === null) {
    violations.push({
      file: relPath,
      detail: 'registry table header (id/evidence/owner/status) not found',
    });
    return violationsResult(violations, 0);
  }
  if (rows.length === 0) {
    violations.push({
      file: relPath,
      detail: 'no AC-### rows parsed — the registry table is empty or malformed',
    });
  }

  for (const { line, cells } of rows) {
    const id = plainCell(cells[cols.id]);
    const evidence = plainCell(cells[cols.evidence] ?? '');
    const owner = plainCell(cells[cols.owner] ?? '');
    const status = plainCell(cells[cols.status] ?? '');
    if (evidence === '' || evidence === '—') {
      violations.push({
        file: relPath,
        line,
        detail: `${id}: empty evidence cell — a claim with no evidence pointer fails CI`,
      });
    }
    if (owner === '' || owner === '—') {
      violations.push({
        file: relPath,
        line,
        detail: `${id}: empty owner cell — every claim needs a named accountable owner`,
      });
    }
    const statusWord = status.split(/[\s(]/)[0];
    if (!['VERIFIED', 'PENDING', 'UNVERIFIED'].includes(statusWord)) {
      violations.push({
        file: relPath,
        line,
        detail: `${id}: status '${status}' — must be VERIFIED, PENDING, or UNVERIFIED`,
      });
    }
    for (const m of evidence.matchAll(/\btest\s+(\d+)\b/gi)) {
      if (!registryIds.has(m[1])) {
        violations.push({
          file: relPath,
          line,
          detail: `${id}: evidence references 'test ${m[1]}', which does not exist in the architecture-test registry`,
        });
      }
    }
    // A pointer that does not point is not evidence: backticked repo paths
    // must resolve, and evidence ids must be well formed. Whether the evidence
    // SUPPORTS the claim stays a human review (§1 of the registry) — this only
    // asserts the reference is real.
    const rawEvidence = cells[cols.evidence] ?? '';
    for (const m of rawEvidence.matchAll(/`([^`]+)`/g)) {
      const target = m[1].trim();
      if (!/^[\w.@/-]+$/.test(target) || !target.includes('/')) continue;
      if (!fs.existsSync(path.join(root, target))) {
        violations.push({
          file: relPath,
          line,
          detail: `${id}: evidence names '${target}', which does not exist in the repository`,
        });
      }
    }
    for (const m of rawEvidence.matchAll(/\bEV-[\w-]+/g)) {
      if (!/^EV-\d{3}$/.test(m[0])) {
        violations.push({
          file: relPath,
          line,
          detail: `${id}: evidence id '${m[0]}' is malformed — evidence ids are EV-### and are defined once in docs/compliance/evidence-register.md`,
        });
      }
    }
  }

  return violationsResult(violations, rows.length, `AC rows parsed: ${rows.length}`);
}

// ---------------------------------------------------------------------------
// Supplementary — admin carries no database driver
// ---------------------------------------------------------------------------
export function checkAdminNoDbDriver(ctx) {
  const { root } = ctx;
  const violations = [];
  const pkgPath = path.join(root, 'apps', 'admin', 'package.json');
  const relPath = 'apps/admin/package.json';
  if (!fs.existsSync(pkgPath)) {
    violations.push({ file: relPath, detail: 'apps/admin/package.json missing' });
    return violationsResult(violations, 0);
  }
  let json;
  try {
    json = readJson(pkgPath);
  } catch (err) {
    violations.push({ file: relPath, detail: `does not parse: ${err.message}` });
    return violationsResult(violations, 0);
  }
  const all = { ...(json.dependencies ?? {}), ...(json.devDependencies ?? {}) };
  for (const dep of Object.keys(all)) {
    if (ADMIN_FORBIDDEN_DEPS.includes(dep) || dep.startsWith('@prisma/')) {
      violations.push({
        file: relPath,
        detail: `declares database driver/ORM '${dep}' — the admin SPA talks to the control plane over HTTP only`,
      });
    }
  }
  return violationsResult(violations, Object.keys(all).length);
}

// ---------------------------------------------------------------------------
// Supplementary — no Phase 5 ingestion may be mounted before test 24 activates
// ---------------------------------------------------------------------------
//
// Architecture test 24 (resource limits) activates at phase 5 and is what
// guarantees every ingestion path declares byte, row, page, deadline and buffer
// bounds. Until the registry says phase 5, that guarantee does not exist.
//
// The gap this closes is narrow and real: an ingestion endpoint could be
// mounted while `currentPhase` still reads 4, and nothing would object. The
// limits would be unenforced by the architecture suite, the path would be
// reachable, and the phase marker would move later in a tidy documentation
// commit that made it look as though the guarantee had been there all along.
//
// So the marker and the first mounted ingestion path are held together from
// BOTH sides. Test 24 refuses a phase-5 tree whose ingestion paths declare no
// limits; this refuses a pre-phase-5 tree that mounts an ingestion path at all.
// The next commit that mounts one must move the marker in the same change.
// ---------------------------------------------------------------------------
// Test 24 — Resource limits declared
// ---------------------------------------------------------------------------
// Every REAL ingestion path declares every bound, in the CENTRAL policy, and
// every central policy belongs to a real path.
//
// The failure this exists to prevent is not an unbounded upload — it is an
// unbounded upload that nobody notices, because the path was added months
// after the limits were written and simply never joined the inventory. So the
// check works from the paths that actually exist in the tree rather than from
// a list somebody maintains, and it fails in BOTH directions: a mounted path
// with no policy, and a policy naming a path that no longer exists.
//
// It also fails when the tree contains no real path at all while the registry
// claims phase 5. A resource-limit test that scans nothing passes vacuously,
// which is the exact shape of failure this repository has been bitten by
// before — and the phase marker is supposed to move only WITH a real mounted
// ingestion path, so zero paths means the marker moved without one.
const INGESTION_LIMIT_FIELDS = [
  'maxBytes',
  'maxRows',
  'maxColumns',
  'maxFieldBytes',
  'maxPageSize',
  'defaultPageSize',
  'maxBufferedRows',
  'maxBufferedBytes',
  'deadlineMs',
  'maxReportedErrors',
  'maxBatchSize',
];
const CENTRAL_LIMITS_REL = path.join('packages', 'platform', 'src', 'ingestion', 'limits.ts');
const CENTRAL_POLICY_REFERENCE =
  /\bINGESTION_LIMIT_POLICIES\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*'([^']+)'\s*\])/g;
// A bound written INTO a path instead of taken from the policy. Matching the
// assignment shape rather than the bare number keeps ordinary arithmetic and
// array indexes out of it.
const INLINE_LIMIT =
  /\b(max(?:Bytes|Rows|Columns|FieldBytes|PageSize|BufferedRows|BufferedBytes|ReportedErrors|BatchSize)|deadlineMs)\b\s*[:=]\s*(?!.*INGESTION_LIMIT_POLICIES)[0-9_]/;

/** The declared policies, by object key, with the fields each actually carries. */
function readCentralPolicies(root) {
  const file = path.join(root, CENTRAL_LIMITS_REL);
  if (!fs.existsSync(file)) return null;
  const src = loadStripped(file);
  const start = src.indexOf('INGESTION_LIMIT_POLICIES');
  if (start === -1) return new Map();
  const policies = new Map();
  // Each entry is `key: { ... }` inside the registry object.
  const entry = /([A-Za-z_$][\w$]*)\s*:\s*\{([\s\S]*?)\n\s{2}\}/g;
  // NO `entry.lastIndex = start` here. `matchAll` copies `lastIndex` onto the
  // iterator's own regex, so setting it AND slicing applies the offset twice:
  // matching would begin at `2 * start`, past the end of a registry that sits
  // near the end of the file. It read ZERO policies, silently, and every rule
  // below that walks them became unreachable while the check went on passing
  // and reporting a scanned count that hid the zero.
  for (const match of src.slice(start).matchAll(entry)) {
    const [, key, body] = match;
    const fields = new Map();
    for (const field of INGESTION_LIMIT_FIELDS) {
      const found = new RegExp(`\\b${field}\\s*:\\s*([^,\n]+)`).exec(body);
      if (found) fields.set(field, found[1].trim());
    }
    const pathId = /\bpathId\s*:\s*'([^']+)'/.exec(body);
    policies.set(key, { pathId: pathId ? pathId[1] : null, fields, body });
  }
  return policies;
}

/** A numeric limit that is a real bound: finite, positive, integral. */
function limitIsSound(raw) {
  if (raw === undefined) return false;
  const cleaned = raw.replace(/_/g, '').trim();
  if (/Infinity|Number\.MAX|NaN|null|undefined/.test(cleaned)) return false;
  // Allow simple products such as `10 * 1024 * 1024`.
  if (!/^[0-9\s*+]+$/.test(cleaned)) return false;
  let value;
  try {
    value = Function(`"use strict";return (${cleaned});`)();
  } catch {
    return false;
  }
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

export function checkResourceLimits(ctx) {
  const { root } = ctx;
  const violations = [];

  const policies = readCentralPolicies(root);
  if (policies === null) {
    return violationsResult(
      [{ file: CENTRAL_LIMITS_REL, detail: 'the central ingestion limit policy file is missing' }],
      0,
    );
  }

  // Real paths: a mounted write route, or a composition that wires an
  // ingestion use case. Same definition the pre-phase-5 guard uses, so the two
  // controls cannot disagree about what counts.
  const candidates = ingestionSurfaceFiles(root);

  const realPaths = [];
  // The inline-bound scan covers the WHOLE ingestion surface, not only the
  // files that mount a route. A controller that dutifully references the
  // central policy can still call a helper that hardcodes a byte bound, and
  // that helper is where the bound actually bites — scanning only the mounting
  // file would miss it, which a mutation of exactly that shape proved.
  const surface = [];
  for (const file of candidates) {
    if (file.endsWith('.test.ts') || file.endsWith('.d.ts')) continue;
    const source = loadStripped(file);
    surface.push({ file, rel: rel(root, file), source });
    const mountsRoute = /@Controller\s*\(/.test(source) && INGESTION_WRITE_ROUTE.test(source);
    if (mountsRoute || INGESTION_USE_CASE.test(source)) {
      realPaths.push({ file, rel: rel(root, file), source });
    }
  }

  // Non-vacuity. Deferred phases are handled by the registry, so reaching here
  // at all means the suite claims to be enforcing this.
  if (realPaths.length === 0) {
    violations.push({
      file: CENTRAL_LIMITS_REL,
      detail:
        'no real ingestion path exists in the tree, so this check would pass without examining ' +
        'anything. The phase marker moves only WITH a first real mounted ingestion path; zero ' +
        'paths means it moved without one',
    });
  }

  const referenced = new Set();
  for (const { rel: relative, source } of realPaths) {
    const names = [...source.matchAll(CENTRAL_POLICY_REFERENCE)].map((m) => m[1] ?? m[2]);
    for (const name of names) referenced.add(name);
    if (names.length === 0) {
      violations.push({
        file: relative,
        detail:
          'mounts a real ingestion path but references no policy from INGESTION_LIMIT_POLICIES — ' +
          'its byte, row, column, field, page, buffer, deadline, error and batch bounds are ' +
          'therefore unenforced',
      });
    }
  }

  for (const { rel: relative, source } of surface) {
    if (INLINE_LIMIT.test(source)) {
      violations.push({
        file: relative,
        detail:
          'writes a numeric ingestion bound inline instead of taking it from the central policy. ' +
          'A limit that lives beside the path it guards drifts from every other path and from ' +
          'this check',
      });
    }
  }

  const seenPathIds = new Map();
  for (const [key, policy] of policies) {
    const where = `${CENTRAL_LIMITS_REL} (${key})`;
    for (const field of INGESTION_LIMIT_FIELDS) {
      const raw = policy.fields.get(field);
      if (raw === undefined) {
        violations.push({ file: where, detail: `declares no ${field}` });
      } else if (!limitIsSound(raw)) {
        violations.push({
          file: where,
          detail: `${field} is '${raw}', which is not a finite positive integer bound`,
        });
      }
    }
    if (policy.pathId === null) {
      violations.push({ file: where, detail: 'declares no pathId' });
    } else if (seenPathIds.has(policy.pathId)) {
      violations.push({
        file: where,
        detail: `duplicate pathId '${policy.pathId}', already declared by '${seenPathIds.get(policy.pathId)}'`,
      });
    } else {
      seenPathIds.set(policy.pathId, key);
    }
    if (realPaths.length > 0 && !referenced.has(key)) {
      violations.push({
        file: where,
        detail:
          `declares limits for a path nothing references. Either the path was removed and this ` +
          `policy is dead, or it was renamed and some real path is now running unbounded`,
      });
    }
  }

  return violationsResult(violations, surface.length + policies.size);
}

const PHASE5_INGESTION_MODULES = [
  'financial-accounts',
  'transactions',
  'statement-imports',
  'financial-connections',
  'payment-instruments',
  'transfer-matching',
];
const INGESTION_WRITE_ROUTE = /@(Post|Put|Patch)\s*\(/;
const INGESTION_USE_CASE =
  /\b(CreateManual\w*|StartStatementImport|CommitStatementImport|UploadStatementSource|ParseStatement\w*)\b/;

/**
 * Every directory an ingestion path can be mounted or wired from.
 *
 * ONE function, used by the historical pre-phase-5 guard AND by test 24, so
 * the two controls cannot disagree about what counts as the surface. They
 * used to carry two copies of this list, and the copies had drifted: the
 * guard scanned `modules/<name>/presentation` and the composition root, test
 * 24 scanned those PLUS `apps/api/src/financial`. Every financial controller
 * in this repository lives in the directory only test 24 knew about, so the
 * guard's controller arm reached nothing real — it caught the composition
 * file and would have missed a controller mounted straight into
 * `apps/api/src/financial` at phase 4, which is the exact thing it exists to
 * refuse.
 */
function ingestionSurfaceFiles(root) {
  const candidates = [];
  for (const moduleName of PHASE5_INGESTION_MODULES) {
    const dir = path.join(root, 'modules', moduleName, 'presentation');
    if (fs.existsSync(dir)) candidates.push(...codeFiles([dir]));
  }
  for (const dir of [
    path.join(root, 'apps', 'api', 'src', 'composition'),
    path.join(root, 'apps', 'api', 'src', 'financial'),
  ]) {
    if (fs.existsSync(dir)) candidates.push(...codeFiles([dir]));
  }
  return candidates;
}

/**
 * A HISTORICAL guard, and the runner is told so rather than left to infer it.
 *
 * Its window is `currentPhase < 5`. From phase 5 onward the tree it was
 * written to protect is the tree architecture test 24 owns, and this control
 * has nothing left to check — so it returns `NOT_APPLICABLE` with a reason,
 * NOT an empty violation list. The difference is the whole point: an empty
 * violation list is indistinguishable from a control that looked and found
 * nothing, and the runner used to print it as `PASS (files scanned: 0)` and
 * add it to the pass total. A control that cannot fail must not be able to
 * inflate the headline that says how many controls held.
 *
 * `ctx.currentPhase` overrides the registry, so a self-test can exercise BOTH
 * arms — the live window and the retired one — without rewriting the fixture
 * registry underneath other checkers that read it.
 */
export function checkIngestionNotMountedBeforePhase5(ctx) {
  const { root } = ctx;
  const violations = [];
  let scanned = 0;

  let currentPhase = ctx.currentPhase;
  if (typeof currentPhase !== 'number') {
    currentPhase = null;
    const registryPath = path.join(root, REGISTRY_REL);
    if (fs.existsSync(registryPath)) {
      try {
        currentPhase = readJson(registryPath).currentPhase ?? null;
      } catch {
        currentPhase = null;
      }
    }
  }
  if (typeof currentPhase !== 'number') {
    return notApplicableResult(
      `${REGISTRY_REL} declares no numeric currentPhase, so the window this guard applies to ` +
        `cannot be determined`,
    );
  }
  if (currentPhase >= 5) {
    return notApplicableResult(
      `RETIRED at phase 5. This guard's window is currentPhase < 5; the registry reads ` +
        `${currentPhase}. Architecture test 24 (resource limits) is ACTIVE and owns the ingestion ` +
        `surface from here on — it is the control that must fail if a path is mounted without a ` +
        `declared bound, and it scans that surface on every run`,
    );
  }

  const candidates = ingestionSurfaceFiles(root);

  for (const file of candidates) {
    if (file.endsWith('.test.ts') || file.endsWith('.d.ts')) continue;
    scanned += 1;
    const source = loadStripped(file);
    const rel = path.relative(root, file);
    const mountsRoute = /@Controller\s*\(/.test(source) && INGESTION_WRITE_ROUTE.test(source);
    const wiresUseCase = INGESTION_USE_CASE.test(source);
    if (mountsRoute || wiresUseCase) {
      violations.push({
        file: rel,
        detail:
          `mounts or wires a Phase 5 ingestion path while the architecture registry still reads ` +
          `currentPhase ${currentPhase}. Architecture test 24 (resource limits) activates at phase 5, so this ` +
          `path would be reachable with its byte, row, page, deadline and buffer limits unenforced by the ` +
          `suite. Move currentPhase to 5, implement and activate test 24, and register this path's limit ` +
          `policy in the SAME commit that mounts it`,
      });
    }
  }

  // INSIDE its window, a scan that reached nothing is a FAILURE, not a pass.
  //
  // Every candidate comes from two lists in this file — the six module names
  // above and the composition directory. Rename a module, move the composition
  // root, or narrow either list, and the loop finds no files: the check then
  // reports zero violations having examined nothing, which is the same vacuous
  // green this control was rewritten to stop producing. The guard against that
  // has to live INSIDE the check, because nothing outside it knows how many
  // files it should have seen.
  if (scanned === 0) {
    violations.push({
      file: REGISTRY_REL,
      detail:
        `this guard is INSIDE its window (currentPhase ${currentPhase} < 5) and its discovery rule ` +
        `reached zero files. Either the six ingestion modules and the composition root have all ` +
        `moved, or PHASE5_INGESTION_MODULES no longer names them — a guard that scans nothing ` +
        `cannot catch anything, and reporting that as a pass is how the control silently dies`,
    });
  }

  return violationsResult(violations, scanned);
}

// ---------------------------------------------------------------------------
// Supplementary — a MODULE.md permission table may not name a right the
// authorization catalogue does not hold
// ---------------------------------------------------------------------------
//
// The drift this exists to catch is documentation asserting authority the
// system never had. Six Phase 5 financial modules declared twelve permissions
// between them — `accounts.account.read`, `transactions.import.write` and the
// rest — in `MODULE.md` permission tables that named `USER` as the holder.
// None was in `modules/authorization/domain/catalogue.ts`, none was seeded by
// any migration, and no route or use case ever consulted one. The tables read
// exactly like the tables of modules whose permissions are real, so the claim
// survived four phases of review: a permission table is the one place a reader
// looks to answer "what rights exist here", and nothing checked that its rows
// corresponded to anything.
//
// The catalogue is the closed universe (access-control.md §2): a permission
// exists because a reviewed migration seeded it AND the compile-time catalogue
// lists it, and an integration test holds those two equal. So the catalogue is
// the right thing to check a table against — a name absent from it is a name
// that grants nothing and denies nothing.
//
// TWO NARROWINGS, both deliberate, both stated so a reader can see the edge.
//
//   * Only modules that have shipped code are in scope. A `MODULE.md` for a
//     module with no implementation is a forward design document, and its
//     permission table is a plan for a later phase (`ai`, `goals`, `budgets`,
//     `zakat` and the rest are in that state). The moment such a module gains
//     its first source file, its table stops being a plan and becomes a claim
//     about running software — and this check starts holding it to one.
//
//   * A row that SAYS the permission is not granted yet is honest and passes.
//     `capability` and `jurisdiction` write `_none — declared, deliberately
//     unseeded_` in the role column; `control-plane` writes "(planned, Phase 8
//     — not in the seeded catalogue)" in the permission cell; `tenancy` marks
//     its Phase 8 row "(planned …)". Each of those tells the reader the right
//     does not exist, which is the opposite of the failure above. The marker
//     has to be IN THE ROW: a caveat further down the page is not attached to
//     the row a reader is looking at.
// ---------------------------------------------------------------------------
const CATALOGUE_REL = path.join('modules', 'authorization', 'domain', 'catalogue.ts');
/** `name: 'x.y.z'` entries of PERMISSION_CATALOGUE — the closed universe. */
const CATALOGUE_PERMISSION = /\bname:\s*'([a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*)'/g;
/** A backticked permission identifier inside a table cell. */
const CELL_PERMISSION = /`([a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*)`/g;
/** The row's own statement that the right is not granted yet. */
const NOT_YET_GRANTED = /unseeded|planned|not (?:yet )?(?:in|seeded in) the (?:seeded )?catalogue/i;

// Declarations that predate this check, in modules outside the change that
// added it. Each is real drift and each is listed here rather than silently
// scoped out, so it appears in the check's own output on every run. An entry
// that stops describing the tree FAILS (below): the exemption cannot outlive
// the drift it was written for.
const UNRECONCILED_MODULE_PERMISSIONS = [
  // Empty, and that is the point.
  //
  // It held four entries when this check was written: two in audit and two in
  // identity, each a MODULE.md table claiming a right the catalogue never
  // defined — the same drift as the twelve financial permissions that prompted
  // the check. All four were reconciled by marking the rows as declared and
  // deliberately unseeded, which is what they always were: deny-by-default
  // means a right nobody holds denies, and these arrive by forward migration
  // with the surface that invokes them.
  //
  // A STALE entry here FAILS this check, so an exemption cannot outlive the
  // drift it excuses. That is why the list emptied itself the moment the
  // tables were corrected, rather than sitting here as a permanent apology.
];

/** The permission names the closed catalogue actually defines. */
function readCataloguePermissions(root) {
  const file = path.join(root, CATALOGUE_REL);
  if (!fs.existsSync(file)) return null;
  const names = new Set();
  for (const m of loadStripped(file).matchAll(CATALOGUE_PERMISSION)) names.add(m[1]);
  return names;
}

export function checkModulePermissionsInCatalogue(ctx) {
  const { root } = ctx;
  const violations = [];
  let scanned = 0;

  const catalogued = readCataloguePermissions(root);
  // A check that cannot read the closed universe must not pass by scanning
  // nothing — that is the vacuous pass this suite exists to refuse.
  if (catalogued === null || catalogued.size === 0) {
    violations.push({
      file: CATALOGUE_REL,
      detail:
        catalogued === null
          ? 'is missing — the permission catalogue is what MODULE.md tables are checked against, so its absence cannot be a pass'
          : 'defines no permissions — PERMISSION_CATALOGUE parsed empty, which would make every declaration look like drift and every drift look checked',
    });
    return violationsResult(violations, 0);
  }

  const exempted = new Set();
  // Injectable so the self-test can seed a STALE exemption. The production
  // list is empty — correctly, the drift it excused is fixed — and a self-test
  // that read it directly would silently stop exercising the arm that makes
  // these exemptions self-cleaning. A test whose coverage disappears when the
  // code gets healthier is a test that will not notice when it gets sick.
  const exemptions = new Map(
    (ctx.unreconciledPermissions ?? UNRECONCILED_MODULE_PERMISSIONS).map((e) => [
      `${e.module}/${e.permission}`,
      e,
    ]),
  );
  let markedNotYetGranted = 0;
  let modulesInScope = 0;

  for (const mod of moduleNames(root)) {
    const moduleDir = path.join(root, 'modules', mod);
    const docPath = path.join(moduleDir, 'MODULE.md');
    if (!fs.existsSync(docPath)) continue;
    // Specification-only modules are out of scope — see the header.
    if (codeFiles([moduleDir]).length === 0) continue;
    const section = extractSection(readText(docPath), 'Permissions');
    if (section === null) continue;
    const table = parseMdTable(section);
    // A module that states its permissions in prose ('_None._', 'None this
    // phase.') declares no row for anything to be wrong about.
    if (table === null) continue;
    modulesInScope += 1;

    const column = Math.max(
      0,
      table.headers.findIndex((h) => /permission/i.test(h)),
    );
    const relPath = `modules/${mod}/MODULE.md`;
    for (const row of table.rows) {
      const cell = row[column] ?? '';
      const rowText = row.join(' | ');
      for (const match of cell.matchAll(CELL_PERMISSION)) {
        const permission = match[1];
        scanned += 1;
        if (catalogued.has(permission)) continue;
        if (NOT_YET_GRANTED.test(rowText)) {
          markedNotYetGranted += 1;
          continue;
        }
        const key = `${mod}/${permission}`;
        if (exemptions.has(key)) {
          exempted.add(key);
          continue;
        }
        violations.push({
          file: relPath,
          detail:
            `declares permission '${permission}', which ${CATALOGUE_REL} does not define and no ` +
            `migration seeds — so no role holds it, no code can check it, and the row documents ` +
            `authority the system does not have. Either add it to the catalogue in a reviewed ` +
            `migration AND the compile-time catalogue together, or mark the row as planned/unseeded ` +
            `if it is a future right, or delete the row if the operation is owner self-service and ` +
            `RBAC decides nothing (access-control.md §2)`,
        });
      }
    }
  }

  for (const [key, entry] of exemptions) {
    if (exempted.has(key)) continue;
    violations.push({
      file: `modules/${entry.module}/MODULE.md`,
      detail:
        `the unreconciled-declaration exemption for '${entry.permission}' no longer describes this ` +
        `tree — the row is gone, the module lost its code, or the permission is now catalogued. It was ` +
        `exempted because: ${entry.reason}. Delete the entry from UNRECONCILED_MODULE_PERMISSIONS in ` +
        `scripts/checks/architecture.mjs — an exemption that outlives its drift is a hole nobody is watching`,
    });
  }

  const live = [...exemptions.values()].filter((e) => exempted.has(`${e.module}/${e.permission}`));
  const named = live.map((e) => `${e.module}/${e.permission}`).join(', ');
  return {
    ...violationsResult(
      violations,
      scanned,
      `module tables checked: ${modulesInScope}; marked planned/unseeded: ${markedNotYetGranted}; ` +
        `pre-existing unreconciled declarations: ${live.length}${named === '' ? '' : ` (${named})`}`,
    ),
    // Carried into the report so each exemption's REASON travels with the run
    // that relied on it, rather than living only in this file.
    exemptions: live,
  };
}

// ---------------------------------------------------------------------------
// Check registry (function map)
// ---------------------------------------------------------------------------
const CHECKS = {
  checkDomainPurity,
  checkLayerDirection,
  checkModuleBoundary,
  checkOrmLeakage,
  checkPortsDeclaredInward,
  checkControllerComplexity,
  checkMoneyDiscipline,
  checkEventCatalogue,
  checkTenantScoping,
  checkProviderBoundary,
  checkDeterministicDomain,
  checkJurisdictionBranching,
  checkModuleDocs,
  checkPurePackages,
  checkStorageBoundary,
  checkKernelSurface,
  checkApprovalPolicy,
  checkPinning,
  checkRlsCoverage,
  checkGuardCallSites,
  checkLifecycleDeclarations,
  checkAssuranceClaims,
  checkResourceLimits,
};

// The supplementary checks are not among the canonical 26 and so are not in
// the registry, which left them resolvable only by name in the self-test. They
// resolve through this map instead: one place that main() and the self-test
// both read, so a supplementary check cannot be wired into the run and quietly
// left out of the proof that it is not vacuous.

// ---------------------------------------------------------------------------
// Supplementary — capability registry truth
// ---------------------------------------------------------------------------

/**
 * The registry must answer "does this capability's code exist?" honestly, and
 * must not be read as answering anything else.
 *
 * TRANSACTIONS sat at NOT_IMPLEMENTED while seven bounded contexts, 27 mounted
 * operations and seven Flutter feature folders answered for it. That was
 * defended in prose as conservatism, on a redefinition of IMPLEMENTED that
 * contradicted the type's own doc comment and its document's own dimension
 * table. It is a false answer, and a false answer in the direction of "less"
 * still teaches a reader to distrust the field.
 *
 * Two arms, because the failure has two directions:
 *
 *   A. UNDERSTATEMENT — phase >= 5 with the financial surface mounted, while
 *      TRANSACTIONS still claims NOT_IMPLEMENTED.
 *   B. OVERSTATEMENT — a capability that is IMPLEMENTED must not thereby carry
 *      a DEPLOYED environment or a declared jurisdiction. Being built grants
 *      nothing; deployment and declaration are separate reviewed acts.
 */
/**
 * The jurisdictions a descriptor literal declares, however it is written.
 *
 * Returns `[]` only when the list is DEMONSTRABLY empty. An unrecognised shape
 * — a spread, a named constant, anything this cannot read — is reported as
 * unknown rather than as empty, because "I could not parse it" and "it declares
 * nothing" are different answers and only one of them is safe to assume.
 */
/**
 * The environments a descriptor literal marks DEPLOYED, however it is written.
 *
 * Keyed on proximity rather than on one spelling: `{ ['production']:
 * 'DEPLOYED' }` and `{ production: DEPLOYED }` are the same claim as
 * `{ production: 'DEPLOYED' }`, and a check that only reads the third is a
 * check somebody can format their way past.
 */
function deployedEnvironmentsIn(body) {
  const found = new Set();
  for (const match of body.matchAll(/\b(local|dev|staging|production)\b/g)) {
    if (/DEPLOYED/.test(body.slice(match.index, match.index + 48))) found.add(match[1]);
  }
  return [...found];
}

function declaredJurisdictionsIn(body) {
  const match = /declaredJurisdictions\s*:\s*([^\n]*)/.exec(body);
  if (match === null) return [];
  const value = match[1];
  if (/(?:Object\.freeze\(\s*)?\[\s*\]\s*\)?\s*,?\s*$/.test(value.trim())) return [];
  const literals = [...value.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return literals.length > 0 ? literals : ['<unparseable>'];
}

export function checkCapabilityRegistryTruth(ctx) {
  const { root } = ctx;
  const violations = [];
  const registryRel = 'packages/capability-registry/src/index.ts';
  const source = readText(path.join(root, registryRel));
  if (source === null) {
    return violationsResult(
      [
        {
          file: registryRel,
          detail: 'the capability registry is missing — nothing can be derived',
        },
      ],
      0,
    );
  }

  // Descriptors, parsed from the literal rather than imported: this runner is
  // dependency-free and must not execute the tree it judges.
  const descriptors = new Map();
  for (const match of source.matchAll(/id:\s*'([A-Z_]+)'/g)) {
    // Bracket-matched, not "up to the next `}),`". `deployment:
    // Object.freeze({})` supplies exactly that sequence BEFORE
    // declaredJurisdictions, so a naive slice cut the literal in half and the
    // jurisdiction arm below could never fire — a mutation proved it silent.
    const start = source.lastIndexOf('{', match.index);
    if (start < 0) continue;
    let depth = 0;
    let end = -1;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) continue;
    const body = source.slice(start, end + 1);
    descriptors.set(match[1], {
      implementation: /implementation:\s*'([A-Z_]+)'/.exec(body)?.[1] ?? null,
      lifecycle: /lifecycle:\s*'([A-Z_]+)'/.exec(body)?.[1] ?? null,
      deployedKeys: deployedEnvironmentsIn(body),
      declared: declaredJurisdictionsIn(body),
    });
  }

  // The shared helper builds every capability that has no inline literal. Parse
  // its body too and attribute it to each id it builds, so flipping the DEFAULT
  // to IMPLEMENTED cannot move six capabilities past arm B unnoticed.
  const helper = /function descriptor\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(source);
  if (helper !== null) {
    const body = helper[1];
    const helperFacts = {
      implementation: /implementation:\s*'([A-Z_]+)'/.exec(body)?.[1] ?? null,
      lifecycle: /lifecycle:\s*'([A-Z_]+)'/.exec(body)?.[1] ?? null,
      deployedKeys: deployedEnvironmentsIn(body),
      declared: declaredJurisdictionsIn(body),
    };
    for (const built of source.matchAll(/([A-Z_]+):\s*descriptor\('([A-Z_]+)'\)/g)) {
      if (!descriptors.has(built[2]))
        descriptors.set(built[2], { ...helperFacts, viaHelper: true });
    }
  }

  // Is the financial surface actually mounted? Measured from the tree, never
  // from a list somebody maintains.
  const financialDir = path.join(root, 'apps', 'api', 'src', 'financial');
  const controllers = fs.existsSync(financialDir)
    ? fs.readdirSync(financialDir).filter((f) => f.endsWith('.controller.ts'))
    : [];
  let routeCount = 0;
  for (const file of controllers) {
    const src = readText(path.join(financialDir, file)) ?? '';
    routeCount += [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\s*\(/g)].length;
  }
  const moduleSource = readText(path.join(financialDir, 'financial.module.ts')) ?? '';
  const composition =
    readText(path.join(root, 'apps', 'api', 'src', 'composition', 'phase5-modules.ts')) ?? '';
  const mounted =
    controllers.length > 0 &&
    routeCount > 0 &&
    /controllers\s*:\s*\[/.test(moduleSource) &&
    composition.includes('FinancialApiModule');

  let currentPhase = ctx.currentPhase;
  if (typeof currentPhase !== 'number') {
    try {
      currentPhase = readJson(path.join(root, REGISTRY_REL))?.currentPhase ?? null;
    } catch {
      currentPhase = null;
    }
  }

  // ARM A — understatement.
  const transactions = descriptors.get('TRANSACTIONS');
  if (typeof currentPhase === 'number' && currentPhase >= 5 && mounted && transactions) {
    if (transactions.implementation === 'NOT_IMPLEMENTED') {
      violations.push({
        file: registryRel,
        detail:
          `TRANSACTIONS is NOT_IMPLEMENTED while the financial surface is mounted — ` +
          `${controllers.length} controllers carrying ${routeCount} routes, registered through ` +
          `FinancialApiModule at the composition root. 'implementation' asks whether the code ` +
          `exists in this repository; it does`,
      });
    }
  }

  // ARM B — overstatement. Being IMPLEMENTED grants nothing.
  for (const [id, descriptor] of descriptors) {
    if (descriptor.implementation !== 'IMPLEMENTED') continue;
    if (descriptor.deployedKeys.length > 0) {
      violations.push({
        file: registryRel,
        detail:
          `${id} is IMPLEMENTED and claims DEPLOYED in ${descriptor.deployedKeys.join(', ')} — ` +
          `IMPLEMENTED is a fact about this repository and grants nothing; deployment is a ` +
          `separate reviewed act with no corroborating evidence here`,
      });
    }
    if (descriptor.declared.length > 0) {
      violations.push({
        file: registryRel,
        detail:
          `${id} is IMPLEMENTED and declares jurisdictions ${descriptor.declared.join(', ')} — ` +
          `a jurisdiction declaration is a separate reviewed act, not a consequence of the code ` +
          `existing`,
      });
    }
  }

  return violationsResult(
    violations,
    descriptors.size,
    `descriptors parsed: ${descriptors.size}; financial controllers: ${controllers.length}; ` +
      `routes: ${routeCount}; phase: ${currentPhase ?? 'unknown'}`,
  );
}

const SUPPLEMENTARY_CHECKS = {
  checkAdminNoDbDriver,
  checkIngestionNotMountedBeforePhase5,
  checkModulePermissionsInCatalogue,
  checkCapabilityRegistryTruth,
};

/**
 * The supplementary checks the runner executes, in printed order.
 *
 * A table rather than four hand-written blocks, so the status decision and the
 * tally arithmetic live in exactly one place (`tallySupplementary`) and a
 * self-test can drive that place directly.
 */
const SUPPLEMENTARY_RUNS = [
  {
    name: 'admin-no-db-driver',
    fn: checkAdminNoDbDriver,
    describe: (r) => `deps checked: ${r.scanned}`,
  },
  {
    name: 'phase5-ingestion-not-mounted-early',
    fn: checkIngestionNotMountedBeforePhase5,
    describe: (r) => (r.applicable ? `files scanned: ${r.scanned}` : 'historical guard, retired'),
  },
  {
    name: 'module-permissions-in-catalogue',
    fn: checkModulePermissionsInCatalogue,
    describe: (r) => `declarations checked: ${r.scanned}; ${r.note}`,
  },
  {
    name: 'capability-registry-truth',
    fn: checkCapabilityRegistryTruth,
    describe: (r) => `${r.note}`,
  },
];

/**
 * The status of ONE check result, and the only place that decision is made.
 *
 * Extracted so the zero-scan rule cannot be removed without a self-test
 * failing, which is the property KAR-RSK-044 claims for the whole runner and
 * had for exactly one check. A control that examined nothing did not hold
 * anything: it is a FAIL, not a PASS. A control whose window is legitimately
 * empty says so by returning `applicable: false` and is reported N/A, which is
 * a third status excluded from the pass count.
 */
function statusForResult(result) {
  if (result.applicable === false) return 'N/A';
  if (result.scanned === 0) return 'FAIL';
  return result.violations.length === 0 ? 'PASS' : 'FAIL';
}

/**
 * Turns supplementary results into statuses and counts — the ONE place that
 * decides what a supplementary row contributes to the headline.
 *
 * Three statuses, and the third exists because two were not enough:
 *
 *   PASS  the control ran and found nothing wrong
 *   FAIL  the control ran and found something wrong
 *   N/A   the control had nothing to check, and says why
 *
 * `N/A` is counted in `notApplicable` and NOWHERE else. It is deliberately not
 * folded into `passed`: the pass total is a reader's shorthand for "how many
 * controls held", and a control that could not have failed did not hold
 * anything. Folding it back in is precisely the defect this function was
 * extracted to make un-reintroducible without a self-test failing — see
 * `RUNNER_TALLY_CASES`.
 */
function tallySupplementary(runs) {
  let passed = 0;
  let failed = 0;
  let notApplicable = 0;
  const rows = runs.map(({ name, result, detail }) => {
    const status = statusForResult(result);
    if (status === 'N/A') notApplicable += 1;
    else if (status === 'PASS') passed += 1;
    else failed += 1;
    return { name, status, detail, result };
  });
  return { rows, passed, failed, notApplicable };
}

// ---------------------------------------------------------------------------
// Registry loading, validation, activation gate
// ---------------------------------------------------------------------------
function loadRegistry(root) {
  const errors = [];
  const registryPath = path.join(root, REGISTRY_REL);
  let registry;
  try {
    registry = readJson(registryPath);
  } catch (err) {
    errors.push(`${REGISTRY_REL}: unreadable or invalid JSON: ${err.message}`);
    return { registry: null, errors };
  }
  if (typeof registry.currentPhase !== 'number') {
    errors.push(`${REGISTRY_REL}: 'currentPhase' must be a number`);
  }
  if (!Array.isArray(registry.tests)) {
    errors.push(`${REGISTRY_REL}: 'tests' must be an array`);
    return { registry, errors };
  }

  const expectedIds = new Set([
    ...Array.from({ length: 26 }, (_, i) => String(i + 1)),
    'canary-purity',
  ]);
  const seenIds = new Set();
  for (const test of registry.tests) {
    const id = String(test.id);
    if (seenIds.has(id)) errors.push(`registry: duplicate test id ${id}`);
    seenIds.add(id);
    if (!expectedIds.has(id)) errors.push(`registry: unexpected test id ${id}`);

    if (test.status === 'ACTIVE') {
      const m =
        typeof test.implementedIn === 'string' &&
        test.implementedIn.match(/^scripts\/checks\/architecture\.mjs#(\w+)$/);
      if (!m) {
        errors.push(
          `registry: ACTIVE test ${id} has no valid implementedIn (scripts/checks/architecture.mjs#<checkFn>)`,
        );
      } else if (!CHECKS[m[1]]) {
        errors.push(`registry: test ${id} names unknown check function '${m[1]}'`);
      }
    } else if (
      typeof test.status === 'string' &&
      test.status.startsWith('NOT_APPLICABLE_UNTIL_PHASE_')
    ) {
      if (typeof test.activationPhase !== 'number') {
        errors.push(`registry: deferred test ${id} lacks a numeric activationPhase`);
      }
      if (typeof test.activationCriterion !== 'string' || test.activationCriterion.trim() === '') {
        errors.push(`registry: deferred test ${id} lacks an activationCriterion`);
      }
      // The activation gate: reaching the phase without an implementation is a failure.
      if (
        typeof registry.currentPhase === 'number' &&
        typeof test.activationPhase === 'number' &&
        registry.currentPhase >= test.activationPhase
      ) {
        errors.push(
          `test ${id} reached activation phase ${test.activationPhase} without implementation`,
        );
      }
    } else {
      errors.push(`registry: test ${id} has invalid status '${test.status}'`);
    }
  }
  for (const id of expectedIds) {
    if (!seenIds.has(id)) errors.push(`registry: canonical test ${id} is missing`);
  }
  return { registry, errors };
}

// ---------------------------------------------------------------------------
// Self-test: seed deliberate violations in a temp tree and assert every
// structural checker fails on them. Runs at the end of every normal run so CI
// proves, on each invocation, that the passes above were not vacuous.
// ---------------------------------------------------------------------------
function buildSelfTestFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karar-arch-selftest-'));
  const write = (relPath, content) => {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };

  // capability-registry-truth fixtures. Arm A needs a mounted financial
  // surface and a TRANSACTIONS descriptor that denies its own code exists;
  // arm B needs a built capability that helps itself to a deployment and a
  // jurisdiction. Both were mutation-proved by hand when the check landed and
  // by NOTHING afterwards, which is the state every other checker here exists
  // to refuse.
  write(
    'apps/api/src/financial/fixture-financial.controller.ts',
    [
      "@Controller('financial/fixture')",
      'export class FixtureFinancialController {',
      '  @Get()',
      '  list() {}',
      '}',
    ].join('\n'),
  );
  write(
    'apps/api/src/financial/financial.module.ts',
    'export class FinancialApiModule { static register() { return { controllers: [FixtureFinancialController] }; } }',
  );
  write('apps/api/src/composition/phase5-modules.ts', 'export const wired = FinancialApiModule;');

  // checkMoneyDiscipline: a float in each of the layers the WIDENED scope
  // added. The single pre-existing seed lives in a pure package, which was in
  // scope before the widening — so narrowing the scope back would not have
  // failed the self-test, and the widening was proved by nothing.
  write(
    'modules/beta/infrastructure/persistence/row-mappers.ts',
    'export function toDomain(row) { return { balance: Number.parseFloat(row.balance_minor) }; }',
  );
  write('apps/worker/src/money-boundary.ts', 'export interface Wire { readonly amount: number; }');

  // Test 24 fixture: every failure shape at once, so a single seeded tree
  // proves each arm rather than only the first one the checker happens to hit.
  //
  //   * a mounted path that references NO central policy
  //   * a mounted path that writes its bound INLINE, bypassing the policy
  //   * a policy missing a required field (no maxBatchSize)
  //   * a policy whose deadline is zero, and one whose rows are Infinity
  //   * two policies sharing one pathId
  //   * a policy no real path references
  write(
    'modules/statement-imports/presentation/http/unbounded-import.controller.ts',
    [
      `@Controller('imports')`,
      `export class UnboundedImportController {`,
      `  @Post('source')`,
      `  upload() { return null; }`,
      `}`,
    ].join('\n'),
  );
  write(
    'modules/transactions/presentation/http/inline-limit.controller.ts',
    [
      `import { INGESTION_LIMIT_POLICIES } from '@karar/platform';`,
      `@Controller('manual')`,
      `export class InlineLimitController {`,
      `  private readonly maxBytes = 5242880;`,
      `  @Post('entry')`,
      `  create() { return INGESTION_LIMIT_POLICIES.manualTransaction; }`,
      `}`,
    ].join('\n'),
  );
  write(
    'packages/platform/src/ingestion/limits.ts',
    [
      // A HEADER, deliberately, so the registry does not begin at offset zero.
      // The real file opens with a long explanatory comment and the registry
      // sits two thirds of the way down it. This fixture used to start with
      // the registry, which made every offset bug in the reader invisible:
      // a defect that skipped `start` characters twice still landed inside a
      // fixture whose `start` was 0, so the self-test passed while the reader
      // read nothing from the real file. A fixture that is easier to parse
      // than the thing it stands for tests the fixture.
      `/**`,
      ` * Ingestion limit policies.`,
      ` *`,
      ` * Padding that mirrors the real file's shape: the registry below must`,
      ` * not be the first thing in this source, or an offset applied twice`,
      ` * still lands before it and the reader appears to work.`,
      ` */`,
      `export const INGESTION_PATH_IDS = ['fixture/manual', 'fixture/zero'] as const;`,
      ``,
      `export const INGESTION_LIMIT_POLICIES = {`,
      `  manualTransaction: {`,
      `    pathId: 'fixture/manual',`,
      `    maxBytes: 1024,`,
      `    maxRows: 1,`,
      `    maxColumns: 8,`,
      `    maxFieldBytes: 256,`,
      `    maxPageSize: 50,`,
      `    defaultPageSize: 25,`,
      `    maxBufferedRows: 1,`,
      `    maxBufferedBytes: 1024,`,
      `    deadlineMs: 1000,`,
      `    maxReportedErrors: 10,`,
      `  },`,
      `  zeroDeadline: {`,
      `    pathId: 'fixture/zero',`,
      `    maxBytes: 1024,`,
      `    maxRows: 10,`,
      `    maxColumns: 8,`,
      `    maxFieldBytes: 256,`,
      `    maxPageSize: 50,`,
      `    defaultPageSize: 25,`,
      `    maxBufferedRows: 1,`,
      `    maxBufferedBytes: 1024,`,
      `    deadlineMs: 0,`,
      `    maxReportedErrors: 10,`,
      `    maxBatchSize: 5,`,
      `  },`,
      `  infiniteRows: {`,
      `    pathId: 'fixture/zero',`,
      `    maxBytes: 1024,`,
      `    maxRows: Infinity,`,
      `    maxColumns: 8,`,
      `    maxFieldBytes: 256,`,
      `    maxPageSize: 50,`,
      `    defaultPageSize: 25,`,
      `    maxBufferedRows: 1,`,
      `    maxBufferedBytes: 1024,`,
      `    deadlineMs: 1000,`,
      `    maxReportedErrors: 10,`,
      `    maxBatchSize: 5,`,
      `  },`,
      `};`,
    ].join('\n'),
  );

  // Pre-activation guard fixture: registry still at phase 4 while a Phase 5
  // ingestion controller is mounted — exactly the state that would let an
  // ingestion path go live with test 24 still deferred.
  write(
    path.join('docs', 'testing', 'architecture-test-registry.json'),
    JSON.stringify({ currentPhase: 4, tests: [] }),
  );
  write(
    'modules/transactions/presentation/http/fixture-import.controller.ts',
    [
      "import { Controller, Post } from '@nestjs/common';",
      "@Controller('transactions')",
      'export class FixtureImportController {',
      '  @Post()',
      '  create() {',
      '    return null;',
      '  }',
      '}',
    ].join('\n'),
  );
  // The guard's SECOND discovery arm: a composition file wires an ingestion
  // use case without mounting a route of its own. Seeded separately from the
  // controller above so narrowing either the `@Controller` arm or the
  // use-case arm leaves the other case failing, instead of both arms going
  // quiet together and the guard reporting a clean scan.
  write(
    'apps/api/src/composition/fixture-early-wiring.ts',
    [
      "import { CreateManualTransaction } from '@karar/transactions';",
      'export const wired = new CreateManualTransaction();',
    ].join('\n'),
  );

  write(
    'packages/shared-kernel/package.json',
    JSON.stringify({ name: '@karar/shared-kernel', dependencies: { lodash: '^4.17.0' } }),
  );
  // The kernel fixture breaks the cap in BOTH directions at once: it OMITS a
  // universal and ADDS one that does not belong. A fixture that only added an
  // export would leave the "missing" arm unproven, and that arm is the one
  // that catches a rename — a renamed universal is simultaneously missing
  // under its old name and extra under its new one, which is also how an
  // `export { X as Y }` alias that changes the public surface is caught.
  write(
    'packages/shared-kernel/src/index.ts',
    KERNEL_EXPORTS.filter((n) => n !== 'CalendarDay')
      .map((n) => `export type ${n} = unknown;`)
      .join('\n') + `\nexport type ExtraTenthExport = never;\n`,
  );
  write(
    'packages/financial-engine/package.json',
    JSON.stringify({ name: '@karar/financial-engine' }),
  );
  write(
    'packages/financial-engine/src/index.ts',
    [
      `import express from 'express';`,
      `export const amount: number = 1.5;`,
      `export const stamp = Date.now();`,
      `export const noop = express;`,
    ].join('\n'),
  );
  write(
    'packages/jurisdiction-policy/package.json',
    JSON.stringify({ name: '@karar/jurisdiction-policy' }),
  );
  write('packages/jurisdiction-policy/src/index.ts', 'export {};\n');
  // Test 19 seeds. The registry declares one disclosure-bearing capability in
  // each recognised shape (a boolean literal, and an expression naming the id).
  write(
    'packages/capability-registry/package.json',
    JSON.stringify({
      name: '@karar/capability-registry',
      dependencies: { '@karar/jurisdiction-policy': 'workspace:*', express: '^4.0.0' },
    }),
  );
  write(
    'packages/capability-registry/src/index.ts',
    [
      `import { readFileSync } from 'node:fs';`,
      `export const FIXTURE_REGISTRY = {`,
      `  FIXTURE_PLAIN: { id: 'FIXTURE_PLAIN', disclosureBearing: false },`,
      `  FIXTURE_DISCLOSING: { id: 'FIXTURE_DISCLOSING', disclosureBearing: true },`,
      `  FIXTURE_COMPUTED: { id: 'FIXTURE_COMPUTED', disclosureBearing: name === 'FIXTURE_COMPUTED' },`,
      `};`,
      `export const loaded = readFileSync;`,
      '',
    ].join('\n'),
  );
  // …and packs that clear them: one with no entry at all, one with an
  // undecided entry, one correct (the negative case).
  write(
    'packages/jurisdiction-policy/src/packs/fixture-packs.ts',
    [
      `const decided = (value: object, basis: string) => ({ state: 'DECIDED', value, basis });`,
      `export const NO_ENTRY_PACK = Object.freeze({`,
      `  version: 'fx/no-entry',`,
      `  clearedCapabilities: Object.freeze(['FIXTURE_PLAIN', 'FIXTURE_DISCLOSING']),`,
      `  approvalPolicies: Object.freeze({ FIXTURE_PLAIN: decided({}, 'basis:fixture') }),`,
      `});`,
      `export const UNDECIDED_PACK = Object.freeze({`,
      `  version: 'fx/undecided',`,
      `  clearedCapabilities: Object.freeze(['FIXTURE_COMPUTED']),`,
      `  approvalPolicies: Object.freeze({`,
      `    FIXTURE_COMPUTED: { state: 'PENDING_LEGAL_REVIEW', reason: 'undecided' },`,
      `  }),`,
      `});`,
      `export const CORRECT_PACK = Object.freeze({`,
      `  version: 'fx/correct',`,
      `  clearedCapabilities: Object.freeze(['FIXTURE_DISCLOSING']),`,
      `  approvalPolicies: Object.freeze({`,
      `    FIXTURE_DISCLOSING: decided({ workflow: 'w', approverRole: 'r' }, 'basis:fixture'),`,
      `  }),`,
      `});`,
      '',
    ].join('\n'),
  );
  // A call site with the rule switched off, and one with it armed.
  write(
    'modules/alpha/application/unarmed-activation.ts',
    [
      'declare function validatePack(pack: object, context?: object): unknown[];',
      'export const unarmed = (pack: object) => validatePack(pack, {});',
      '',
    ].join('\n'),
  );
  write(
    'modules/alpha/application/armed-activation.ts',
    [
      'declare function validatePackSet(packs: object[], context?: object): unknown[];',
      'export const armed = (packs: object[], ids: readonly string[]) =>',
      '  validatePackSet(packs, { disclosureBearingCapabilityIds: ids });',
      '',
    ].join('\n'),
  );

  write(
    'packages/state-machine/package.json',
    JSON.stringify({ name: '@karar/state-machine', dependencies: { rxjs: '^7.0.0' } }),
  );
  write('packages/state-machine/src/index.ts', 'export {};\n');
  write('packages/api-contracts/package.json', JSON.stringify({ name: '@karar/api-contracts' }));
  write('packages/api-contracts/events/catalogue.json', JSON.stringify({ events: [] }));

  write(
    'modules/alpha/MODULE.md',
    [
      '# Module: alpha',
      '',
      '## Data owned',
      '',
      '| Table | Classification | Erasure strategy | Notes |',
      '|---|---|---|---|',
      '| `alpha_things` | `INTERNAL` | `DELETE_LATER` | not a canonical strategy |',
      '',
    ].join('\n'),
  );
  write(
    'modules/alpha/domain/entity.ts',
    [
      `import { Db } from '../infrastructure/db';`,
      `import { Widget } from '../../beta/domain/widget';`,
      `import { PrismaClient } from '@prisma/client';`,
      `import { S3Client } from '@aws-sdk/client-s3';`,
      `interface DomainEvent { name: string }`,
      `export class FakeThingHappened implements DomainEvent { readonly name = 'FakeThingHappened'; }`,
      `export const isHome = (countryCode: string) => countryCode === 'QA';`,
      `export const use = [Db, Widget, PrismaClient, S3Client];`,
    ].join('\n'),
  );
  write('modules/alpha/infrastructure/db.ts', 'export const Db = 1;\n');
  // Adapter-suffixed class with no port interface — test 5's target shape.
  write(
    'modules/alpha/infrastructure/orphan-repository.ts',
    'export class OrphanRepository {\n  save(): void {}\n}\n',
  );
  write('modules/beta/domain/widget.ts', 'export const Widget = 1;\n'); // beta has no MODULE.md

  // Fat controller reaching into a module's domain — test 6's target shape.
  write(
    'apps/api/src/fat.controller.ts',
    [
      `import { Widget } from '@karar/alpha/domain/entity';`,
      ...Array.from(
        { length: 9 },
        (_, i) => `@Get('/route${i}')\nexport function route${i}() { return Widget; }`,
      ),
    ].join('\n'),
  );

  // Declared protection nothing references — test 23's target shape.
  write(
    'packages/state-machine/src/foo-guard.ts',
    'export class FooGuard {\n  check(): void {}\n}\n',
  );

  // Platform lifecycle file with a forbidden placeholder — test 25's deepened shape.
  write(
    'packages/platform/db/DATA_LIFECYCLE.md',
    [
      '# Platform data lifecycle declarations',
      '',
      '| Table | Subject relationship | Purpose | Classification | Retention | Export treatment | Erasure strategy |',
      '|---|---|---|---|---|---|---|',
      '| `platform.fixture_rows` | NON_PERSONAL | TBD | INTERNAL | indefinite (local) | n/a | RETAIN_WITH_BASIS |',
      '',
    ].join('\n'),
  );

  write(
    'apps/admin/package.json',
    JSON.stringify({ name: '@karar/admin', dependencies: { pg: '^8.0.0' } }),
  );

  // module-permissions-in-catalogue fixture: one closed catalogue, and three
  // MODULE.md tables standing in the three relations to it that matter — a
  // right the catalogue never held, a right the row itself says is unseeded,
  // and a right declared by a module that has shipped no code at all.
  write(
    'modules/authorization/domain/catalogue.ts',
    [
      'export const PERMISSION_CATALOGUE = [',
      "  { name: 'fixture.thing.read', capability: 'fixture', description: 'seeded' },",
      '];',
      '',
    ].join('\n'),
  );
  write('modules/gamma/application/list-things.ts', 'export const listThings = () => [];\n');
  write(
    'modules/gamma/MODULE.md',
    [
      '# Module: gamma',
      '',
      '## Permissions',
      '',
      '| Permission | Role(s) |',
      '|---|---|',
      '| `fixture.thing.read` | `SUPPORT` |',
      '| `fixture.ghost.write` | `SUPPORT` |',
      '',
    ].join('\n'),
  );
  write('modules/delta/application/plan-things.ts', 'export const planThings = () => [];\n');
  write(
    'modules/delta/MODULE.md',
    [
      '# Module: delta',
      '',
      '## Permissions',
      '',
      '| Permission | Role(s) |',
      '|---|---|',
      '| `fixture.later.manage` | _none — declared, deliberately unseeded_ |',
      '',
    ].join('\n'),
  );
  write(
    'modules/epsilon/MODULE.md',
    [
      '# Module: epsilon',
      '',
      '## Permissions',
      '',
      '| Permission | Role(s) |',
      '|---|---|',
      '| `fixture.future.read` | `USER` |',
      '',
    ].join('\n'),
  );

  // Tests 9/21/22 seeds: a fixture schema carrying every failure shape.
  write(
    'packages/platform/db/migrations/9900_fixture_tables.sql',
    [
      '-- fixture: RLS shape 1 — no RLS, not allow-listed',
      'CREATE TABLE public.fixture_naked (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);',
      '-- fixture: RLS shape 2 — enabled (and FORCEd) with zero policies',
      'CREATE TABLE public.fixture_enabled_no_policy (id uuid PRIMARY KEY);',
      'ALTER TABLE public.fixture_enabled_no_policy ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.fixture_enabled_no_policy FORCE ROW LEVEL SECURITY;',
      '-- fixture: RLS shape 3 — FORCEd without ENABLE (the legacy audit-table anomaly)',
      'CREATE TABLE public.fixture_forced_not_enabled (id uuid PRIMARY KEY);',
      'ALTER TABLE public.fixture_forced_not_enabled FORCE ROW LEVEL SECURITY;',
      '-- fixture: a healthy principal-scoped table (drives test 9)',
      'CREATE TABLE public.fixture_scoped (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);',
      'ALTER TABLE public.fixture_scoped ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.fixture_scoped FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY fixture_scoped_tenant ON public.fixture_scoped FOR SELECT',
      "  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);",
      '-- fixture: a declared legal-consequence table whose pinning block is',
      '-- broken every way test 21 recognises — the classic pin absent, a',
      '-- signature column no dimension maps to, a nullable state column with',
      '-- none of its three CHECKs, and a nullable version with no state at all.',
      'CREATE TABLE public.consent_grants (',
      '  id uuid PRIMARY KEY,',
      '  operating_entity_id uuid NOT NULL,',
      '  jurisdiction_at_creation text NOT NULL,',
      '  policy_pack_version text NULL,',
      '  policy_pack_pin_state text NULL,',
      '  subject_policy_selection_version text NULL,',
      '  created_at timestamptz NOT NULL DEFAULT now()',
      ');',
      'ALTER TABLE public.consent_grants ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.consent_grants FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY consent_grants_subject ON public.consent_grants FOR SELECT USING (true);',
      '-- fixture: the state-paired pack pin done CORRECTLY (the negative case:',
      '-- a compliant shape must not be flagged), with the declared-not-',
      '-- applicable dimension left unbound by any CHECK (the positive case).',
      'CREATE TABLE public.data_protection_role_assignments (',
      '  id uuid PRIMARY KEY,',
      '  operating_entity_id uuid NOT NULL,',
      '  jurisdiction_ref text NOT NULL,',
      '  policy_pack_version text NULL,',
      "  policy_pack_pin_state text NOT NULL CHECK (policy_pack_pin_state IN ('PINNED', 'PRE_POLICY_PACK')),",
      '  subject_policy_selection_pin_state text NOT NULL,',
      '  created_at timestamptz NOT NULL DEFAULT now(),',
      "  CHECK ((policy_pack_pin_state = 'PINNED') = (policy_pack_version IS NOT NULL)),",
      "  CHECK (created_at < TIMESTAMPTZ '2026-08-16 00:00:00+00' OR policy_pack_pin_state = 'PINNED')",
      ');',
      'ALTER TABLE public.data_protection_role_assignments ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.data_protection_role_assignments FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY dpra_policy ON public.data_protection_role_assignments FOR SELECT USING (true);',
      '-- fixture: plain pins, all present and NOT NULL — the second negative case.',
      'CREATE TABLE public.subject_policy_selections (',
      '  id uuid PRIMARY KEY,',
      '  jurisdiction_ref text NOT NULL,',
      '  policy_pack_version text NOT NULL,',
      '  profile_version text NOT NULL',
      ');',
      'ALTER TABLE public.subject_policy_selections ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.subject_policy_selections FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY sps_policy ON public.subject_policy_selections FOR SELECT USING (true);',
      '-- fixture: pinning-signature columns on an UNDECLARED table (test 21)',
      'CREATE TABLE public.fixture_rulings (id uuid PRIMARY KEY, jurisdiction_at_creation text NOT NULL);',
      'ALTER TABLE public.fixture_rulings ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.fixture_rulings FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY fixture_rulings_policy ON public.fixture_rulings FOR SELECT USING (true);',
      '-- fixture: a column added by a LATER migration is as real as one at',
      '-- creation — the ALTER pass must see it (test 21 reads the whole history).',
      'CREATE TABLE public.fixture_altered (id uuid PRIMARY KEY);',
      'ALTER TABLE public.fixture_altered ADD COLUMN operating_entity_id uuid NOT NULL;',
      'ALTER TABLE public.fixture_altered ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.fixture_altered FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY fixture_altered_policy ON public.fixture_altered FOR SELECT USING (true);',
      '',
    ].join('\n'),
  );
  write(
    'packages/platform/db/rls-allow-list.json',
    JSON.stringify([
      {
        table: 'public.fixture_ghost',
        reason: 'stale: no migration creates this table',
        owner: 'fixture',
        compensatingGrants: 'none',
        reviewPhase: '1',
      },
      {
        table: 'public.fixture_enabled_no_policy',
        reason: '',
        owner: 'fixture',
        compensatingGrants: 'none',
        reviewPhase: '1',
      },
    ]),
  );
  write(
    'packages/platform/prisma/schema/fixture.prisma',
    ['model FixtureScoped {', '  id String @id', '', '  @@map("fixture_scoped")', '}', ''].join(
      '\n',
    ),
  );
  // Test 9: a persistence file querying a principal-scoped delegate with no
  // principal context in reach…
  write(
    'modules/alpha/infrastructure/persistence/naked-query-store.ts',
    [
      'export class NakedQueryStore {',
      '  constructor(private readonly handle: { client: never }) {}',
      '  list() {',
      '    return (this.handle.client as { fixtureScoped: { findMany(a: object): unknown } }).fixtureScoped.findMany({});',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  // …and a session-scoped GUC bind (set_config(…, false) leaks across the pool).
  write(
    'modules/alpha/infrastructure/persistence/session-bind.ts',
    ["export const BIND = `SELECT set_config('app.tenant_id', $1, false)`;", ''].join('\n'),
  );
  // The identity-scope pattern: transaction-local bind in the querying file —
  // the sanctioned shape the negative self-test asserts is NOT flagged.
  write(
    'modules/alpha/infrastructure/persistence/scoped-binder.ts',
    [
      'type Tx = { fixtureScoped: { findMany(a: object): unknown }; $executeRaw(s: TemplateStringsArray, ...v: unknown[]): unknown };',
      'export class ScopedBinderStore {',
      '  constructor(private readonly tx: Tx) {}',
      '  async list(tenantId: string) {',
      "    await this.tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;",
      '    return this.tx.fixtureScoped.findMany({});',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  // Test 4 narrowness: the sanctioned platform construction path must NOT be
  // flagged (negative case) while the same import elsewhere in platform src is.
  write('packages/platform/package.json', JSON.stringify({ name: '@karar/platform' }));
  write(
    'packages/platform/src/db/prisma.ts',
    [
      `import { Pool } from 'pg';`,
      `import { PrismaPg } from '@prisma/adapter-pg';`,
      'export const sanctioned = [Pool, PrismaPg];',
      '',
    ].join('\n'),
  );
  write(
    'packages/platform/src/telemetry.ts',
    [
      `import { PrismaClient } from '@prisma/client';`,
      'export const leak = PrismaClient;',
      '',
    ].join('\n'),
  );

  write(
    'docs/testing/architecture-test-registry.json',
    JSON.stringify({
      // 4 > 3.5: makes checkPinning's deferral gate DUE in the fixture tree,
      // proving the gate fails when a deferred pinning phase arrives.
      currentPhase: 4,
      tests: [
        {
          id: 1,
          status: 'ACTIVE',
          implementedIn: 'scripts/checks/architecture.mjs#checkDomainPurity',
        },
      ],
    }),
  );
  write(
    'docs/security/assurance-claims.md',
    [
      '# Assurance Claim Registry',
      '',
      '| id | claim | type | scope | evidence | owner | status |',
      '|---|---|---|---|---|---|---|',
      '| AC-001 | claim with no evidence | TECHNICAL | platform |  | Platform | PENDING |',
      '| AC-002 | claim citing a ghost test | TECHNICAL | platform | test 99 | Platform | MAYBE |',
      '| AC-003 | claim citing a file that is not there | TECHNICAL | platform | `modules/ghost/GONE.md` | Platform | PENDING |',
      '| AC-004 | claim citing a malformed evidence id | TECHNICAL | platform | EV-4 | Platform | PENDING |',
      '',
    ].join('\n'),
  );

  // Appended rather than written: `packages/capability-registry/src/index.ts`
  // is already the fixture for test 19 (disclosure-bearing capabilities), and
  // overwriting it made THIS check's three cases silently vacuous while test
  // 19 kept passing. Two checkers sharing one fixture path is fine; the second
  // one clobbering the first is not.
  fs.appendFileSync(
    path.join(root, 'packages', 'capability-registry', 'src', 'index.ts'),
    [
      '',
      'export const CAPABILITY_REGISTRY = Object.freeze({',
      '  TRANSACTIONS: Object.freeze({',
      "    id: 'TRANSACTIONS',",
      "    lifecycle: 'PLANNED',",
      "    implementation: 'NOT_IMPLEMENTED',",
      '    deployment: Object.freeze({}),',
      '    declaredJurisdictions: Object.freeze([]),',
      '  }),',
      '  OVERSTATED: Object.freeze({',
      "    id: 'OVERSTATED',",
      "    lifecycle: 'ALPHA',",
      "    implementation: 'IMPLEMENTED',",
      "    deployment: Object.freeze({ production: 'DEPLOYED' }),",
      "    declaredJurisdictions: Object.freeze(['QA']),",
      '  }),',
      '  HONEST: Object.freeze({',
      "    id: 'HONEST',",
      "    lifecycle: 'ALPHA',",
      "    implementation: 'IMPLEMENTED',",
      '    deployment: Object.freeze({}),',
      '    declaredJurisdictions: Object.freeze([]),',
      '  }),',
      '});',
      '',
    ].join('\n'),
  );

  return root;
}

const SELF_TEST_CASES = [
  // ---- The historical pre-activation guard, all of its arms ----------------
  //
  // INSIDE its window (phase 4): an ingestion controller mounted while the
  // registry still reads phase 4 must be caught, or the guard is decorative.
  {
    fn: 'checkIngestionNotMountedBeforePhase5',
    ctx: { currentPhase: 4 },
    expect: /fixture-import\.controller/,
  },
  // …and the SECOND discovery arm, which is not the controller arm: a
  // composition file that wires an ingestion use case mounts nothing itself
  // and must still be caught. Seeded separately so a narrowing of either
  // regex leaves the other case failing rather than both going quiet at once.
  {
    fn: 'checkIngestionNotMountedBeforePhase5',
    ctx: { currentPhase: 4 },
    expect: /fixture-early-wiring\.ts/,
  },
  // …and the guard's own blindness: inside the window, a discovery rule that
  // reaches zero files is a FAILURE. Without this, narrowing
  // PHASE5_INGESTION_MODULES or moving the composition root would restore
  // exactly the vacuous green this whole rework exists to remove — the check
  // would report "no violations" having examined nothing.
  {
    fn: 'checkIngestionNotMountedBeforePhase5',
    ctx: { currentPhase: 4, emptyTree: true },
    expect: /discovery rule reached zero files/,
  },
  // …and the directory every real financial controller in this repository
  // actually lives in. The guard's list did not include it, so its controller
  // arm reached nothing real; this case fails if that regression returns.
  {
    fn: 'checkIngestionNotMountedBeforePhase5',
    ctx: { currentPhase: 4 },
    expect: /unbounded-import\.controller/,
  },
  { fn: 'checkDomainPurity', expect: /express/ },
  { fn: 'checkLayerDirection', expect: /infrastructure/ },
  { fn: 'checkModuleBoundary', expect: /beta/ },
  { fn: 'checkOrmLeakage', expect: /@prisma\/client/ },
  // Test 4 narrowness: platform src OUTSIDE src/db is still forbidden.
  { fn: 'checkOrmLeakage', expect: /telemetry/ },
  // Test 9: a principal-scoped delegate queried with no context in reach…
  { fn: 'checkTenantScoping', expect: /fixtureScoped/ },
  // …and a session-scoped principal GUC bind (set_config(…, false)).
  { fn: 'checkTenantScoping', expect: /SESSION/ },
  // Test 21: declared table missing its jurisdiction pin…
  {
    fn: 'checkPinning',
    expect: /jurisdictionAtCreation.*jurisdiction_ref|jurisdiction_ref.*does not exist/,
  },
  // …an undeclared table carrying the pinning signature…
  { fn: 'checkPinning', expect: /fixture_rulings/ },
  // …the same, on a column added by a LATER migration (ALTER TABLE parsing)…
  { fn: 'checkPinning', expect: /fixture_altered/ },
  // …a signature column on a declared table that no dimension maps to…
  { fn: 'checkPinning', expect: /jurisdiction_at_creation' that no declared dimension maps to/ },
  // …a nullable state column (the explanation a row may omit)…
  { fn: 'checkPinning', expect: /state column 'policy_pack_pin_state'.*is nullable/ },
  // …a state with no closed vocabulary…
  { fn: 'checkPinning', expect: /no CHECK constrains 'policy_pack_pin_state'/ },
  // …a state not tied to the presence of the value it explains…
  { fn: 'checkPinning', expect: /no CHECK ties 'policy_pack_pin_state'/ },
  // …a historical state with no creation cutoff (a permanent exemption)…
  { fn: 'checkPinning', expect: /no CHECK requires dimension 'policyPackVersionAtCreation'/ },
  // …a nullable pin with no state column to justify the null…
  {
    fn: 'checkPinning',
    expect: /subject_policy_selection_pin_state', which does not exist/,
  },
  // …and a "not applicable" declaration no CHECK binds to that one value.
  { fn: 'checkPinning', expect: /binds 'subject_policy_selection_pin_state' to exactly/ },
  // Test 22, all three shapes plus allow-list integrity.
  { fn: 'checkRlsCoverage', expect: /fixture_naked/ },
  {
    fn: 'checkRlsCoverage',
    expect: /fixture_enabled_no_policy.*zero policies|zero policies.*fixture_enabled_no_policy/,
  },
  { fn: 'checkRlsCoverage', expect: /fixture_forced_not_enabled/ },
  { fn: 'checkRlsCoverage', expect: /fixture_ghost/ },
  { fn: 'checkRlsCoverage', expect: /'reason' is missing or empty/ },
  // …a reason that never says why no principal predicate fits…
  {
    fn: 'checkRlsCoverage',
    expect: /never states why the table cannot be tenant- or subject-scoped/,
  },
  // …and compensating controls that are a label rather than controls.
  { fn: 'checkRlsCoverage', expect: /'compensatingGrants' is 'none'/ },
  // Test 5: an adapter-suffixed infrastructure class with no port interface.
  { fn: 'checkPortsDeclaredInward', expect: /OrphanRepository/ },
  // Test 6: a controller importing a module's domain, over the route budget.
  { fn: 'checkControllerComplexity', expect: /domain/ },
  { fn: 'checkControllerComplexity', expect: /route handlers/ },
  { fn: 'checkMoneyDiscipline', expect: /amount/ },
  // The WIDENED scope, seeded in each layer it added. Without these, reverting
  // the scope to domain+application would have kept the self-test green.
  { fn: 'checkMoneyDiscipline', expect: /row-mappers/ },
  { fn: 'checkMoneyDiscipline', expect: /money-boundary/ },
  // capability-registry-truth, both arms. `ctx` gives each case its own cached
  // run, and the phase is passed in rather than read from the fixture registry.
  {
    fn: 'checkCapabilityRegistryTruth',
    expect: /TRANSACTIONS is NOT_IMPLEMENTED while the financial surface is mounted/,
    ctx: { currentPhase: 5 },
  },
  {
    fn: 'checkCapabilityRegistryTruth',
    expect: /OVERSTATED is IMPLEMENTED and claims DEPLOYED/,
    ctx: { currentPhase: 5 },
  },
  {
    fn: 'checkCapabilityRegistryTruth',
    expect: /OVERSTATED is IMPLEMENTED and declares jurisdictions/,
    ctx: { currentPhase: 5 },
  },
  { fn: 'checkEventCatalogue', expect: /FakeThingHappened/ },
  { fn: 'checkProviderBoundary', expect: /@aws-sdk/ },
  { fn: 'checkDeterministicDomain', expect: /Date\.now/ },
  { fn: 'checkJurisdictionBranching', expect: /jurisdiction|country/i },
  { fn: 'checkModuleDocs', expect: /beta/ },
  { fn: 'checkPurePackages', expect: /lodash|rxjs/ },
  // Test 17, constrained tier: a framework dependency in the manifest…
  { fn: 'checkPurePackages', expect: /capability-registry declares runtime dependency 'express'/ },
  // …and a filesystem import no manifest would ever show.
  { fn: 'checkPurePackages', expect: /capability-registry imports 'node:fs'/ },
  { fn: 'checkStorageBoundary', expect: /client-s3/ },
  // Test 20 in both directions: an export that does not belong…
  { fn: 'checkKernelSurface', expect: /ExtraTenthExport/ },
  // Test 24, every failure shape, each proven separately against one tree.
  { fn: 'checkResourceLimits', expect: /unbounded-import\.controller.*references no policy/s },
  {
    fn: 'checkResourceLimits',
    expect: /inline-limit\.controller.*numeric ingestion bound inline/s,
  },
  { fn: 'checkResourceLimits', expect: /manualTransaction.*declares no maxBatchSize/s },
  { fn: 'checkResourceLimits', expect: /zeroDeadline.*deadlineMs is '0'/s },
  { fn: 'checkResourceLimits', expect: /infiniteRows.*maxRows is 'Infinity'/s },
  { fn: 'checkResourceLimits', expect: /duplicate pathId 'fixture\/zero'/ },
  { fn: 'checkResourceLimits', expect: /declares limits for a path nothing references/ },
  // …and a universal that is absent.
  { fn: 'checkKernelSurface', expect: /universal 'CalendarDay' is missing/ },
  // Test 19: a pack clearing a disclosure-bearing capability with no entry…
  { fn: 'checkApprovalPolicy', expect: /fx\/no-entry.*FIXTURE_DISCLOSING/ },
  // …one whose entry is not DECIDED…
  { fn: 'checkApprovalPolicy', expect: /fx\/undecided.*not DECIDED/ },
  // …a validator that no longer carries the rule…
  { fn: 'checkApprovalPolicy', expect: /MISSING_APPROVAL_POLICY|validation source is missing/ },
  // …and a call site that validates packs with the rule switched off.
  { fn: 'checkApprovalPolicy', expect: /unarmed-activation.*disclosureBearingCapabilityIds/ },
  // Test 23: a declared FooGuard nothing references.
  { fn: 'checkGuardCallSites', expect: /FooGuard/ },
  { fn: 'checkLifecycleDeclarations', expect: /DELETE_LATER/ },
  // Test 25 deepened: a module with code still using the erasure-only table…
  { fn: 'checkLifecycleDeclarations', expect: /six-field/ },
  // …and a DATA_LIFECYCLE.md row carrying a forbidden placeholder.
  { fn: 'checkLifecycleDeclarations', expect: /placeholder/ },
  { fn: 'checkAssuranceClaims', expect: /AC-00[12]/ },
  // …an evidence pointer naming a file that does not exist…
  { fn: 'checkAssuranceClaims', expect: /AC-003: evidence names 'modules\/ghost\/GONE\.md'/ },
  // …and a malformed evidence id.
  { fn: 'checkAssuranceClaims', expect: /AC-004: evidence id 'EV-4' is malformed/ },
  { fn: 'checkAdminNoDbDriver', expect: /'pg'/ },
  // A MODULE.md table naming a right the authorization catalogue never held —
  // the drift that let six Phase 5 modules document twelve permissions nothing
  // granted, nothing seeded, and no code consulted.
  { fn: 'checkModulePermissionsInCatalogue', expect: /fixture\.ghost\.write/ },
  // …and the other arm: an exemption that has stopped describing the tree must
  // fail, or an allowance outlives the drift it was written for. The fixture
  // carries none of the exempted modules, so every entry is stale there.
  {
    fn: 'checkModulePermissionsInCatalogue',
    // A stale exemption: the fixture's `delta` marks its right unseeded, so an
    // entry excusing it describes drift that is gone.
    ctx: {
      unreconciledPermissions: [
        { module: 'delta', permission: 'fixture.later.manage', reason: 'seeded staleness' },
      ],
    },
    expect: /exemption for '[a-z_.]+' no longer/,
  },
];

// Negative cases: seeded shapes a checker must NOT flag — the proof an
// allowance is exactly as narrow as sanctioned and no narrower.
const NEGATIVE_SELF_TEST_CASES = [
  // Test 4: the one sanctioned construction path (platform src/db) is allowed…
  { fn: 'checkOrmLeakage', forbid: /packages[\\/]platform[\\/]src[\\/]db[\\/]prisma/ },
  // Test 9: the identity-scope pattern (transaction-local set_config) passes.
  { fn: 'checkTenantScoping', forbid: /scoped-binder/ },
  // Test 21: a correctly built state-paired pin raises none of the three
  // state-paired complaints — the allowance is real, not a checker that always
  // fails.
  {
    fn: 'checkPinning',
    forbid: /data_protection_role_assignments: (no CHECK (ties|constrains)|state column)/,
  },
  // Test 21: plain NOT NULL pins on a declared table are not flagged either.
  { fn: 'checkPinning', forbid: /subject_policy_selections/ },
  // Test 19: a correctly approved clearance passes, and so does a call site
  // that arms the rule — the check is not "every pack fails".
  { fn: 'checkApprovalPolicy', forbid: /fx\/correct/ },
  { fn: 'checkApprovalPolicy', forbid: /[/\\]armed-activation/ },
  // A catalogued permission is never drift…
  { fn: 'checkModulePermissionsInCatalogue', forbid: /fixture\.thing\.read/ },
  // …a row that SAYS the right is not granted yet is an honest declaration,
  // not a claim (the shape capability, jurisdiction, tenancy and control-plane
  // already use)…
  { fn: 'checkModulePermissionsInCatalogue', forbid: /fixture\.later\.manage/ },
  // …and a specification-only module's table is a plan for a later phase, so
  // it is out of scope until that module ships its first source file.
  { fn: 'checkModulePermissionsInCatalogue', forbid: /fixture\.future\.read/ },
];

/**
 * Applicability cases — the arm no violation-based case can express.
 *
 * A violation case asserts "this check FAILED on the seeded shape". There is
 * no seeded shape that makes a retired guard say `NOT_APPLICABLE`; the phase
 * does. So this category asserts the STATUS a check reports rather than its
 * violations, which is the only way to hold the line that a retired control
 * must not report PASS.
 */
const APPLICABILITY_CASES = [
  {
    fn: 'checkIngestionNotMountedBeforePhase5',
    ctx: { currentPhase: 5 },
    expectApplicable: false,
    reason: /RETIRED at phase 5/,
    why: 'at phase 5 the guard has no window left; reporting PASS there is the vacuous green this rework removed',
  },
  {
    fn: 'checkIngestionNotMountedBeforePhase5',
    ctx: { currentPhase: 6 },
    expectApplicable: false,
    reason: /RETIRED at phase 5/,
    why: 'the retirement holds for every later phase too, not only the one it was written at',
  },
  {
    fn: 'checkIngestionNotMountedBeforePhase5',
    ctx: { currentPhase: 4 },
    expectApplicable: true,
    why: 'inside its window the guard must be a real, running control',
  },
  // The active control that OWNS the ingestion surface from phase 5 onward is
  // applicable at phase 5 — the retirement above hands its duty to something
  // that actually runs, rather than to nothing.
  {
    fn: 'checkResourceLimits',
    ctx: {},
    expectApplicable: true,
    why: 'test 24 is the successor control and must be live at every phase the guard is retired at',
  },
];

/**
 * Runner-tally cases — the accounting itself, driven directly.
 *
 * The defect this rework closed was never inside a checker. It was in the
 * runner: it decided PASS by asking whether a violation list was empty, which
 * is true both of a control that held and of a control that never ran. These
 * cases feed `tallySupplementary` synthetic results and assert where each one
 * lands, so restoring the old arithmetic — counting a not-applicable row as a
 * pass — fails the self-test instead of quietly inflating the headline.
 */
const RUNNER_TALLY_CASES = [
  {
    name: 'a not-applicable row is N/A and is NOT counted as a pass',
    runs: [
      { name: 'retired', result: notApplicableResult('retired'), detail: '' },
      { name: 'real', result: violationsResult([], 12), detail: '' },
    ],
    assert: (t) =>
      t.passed === 1 &&
      t.notApplicable === 1 &&
      t.failed === 0 &&
      t.rows[0].status === 'N/A' &&
      t.rows[1].status === 'PASS',
  },
  {
    name: 'a check that scanned NOTHING is FAIL, not PASS',
    runs: [{ name: 'quiet', result: violationsResult([], 0), detail: '' }],
    assert: (t) => t.failed === 1 && t.passed === 0 && t.notApplicable === 0,
  },
  {
    name: 'a check whose window is legitimately empty is N/A, not a zero-scan FAIL',
    runs: [{ name: 'retired', result: notApplicableResult('retired'), detail: '' }],
    assert: (t) => t.notApplicable === 1 && t.failed === 0 && t.passed === 0,
  },
  {
    name: 'a failing row is FAIL and is counted once',
    runs: [
      { name: 'broken', result: violationsResult([{ file: 'f', detail: 'd' }], 3), detail: '' },
    ],
    assert: (t) => t.failed === 1 && t.passed === 0 && t.notApplicable === 0,
  },
  {
    name: 'the live guard at phase 4 is tallied as a real control, not as N/A',
    runs: null,
    assertLive: (fixtureRoot) => {
      const result = checkIngestionNotMountedBeforePhase5({ root: fixtureRoot, currentPhase: 4 });
      const t = tallySupplementary([{ name: 'guard', result, detail: '' }]);
      return t.notApplicable === 0 && t.failed === 1;
    },
  },
  {
    name: 'the retired guard at phase 5 lands in N/A and adds nothing to passed',
    runs: null,
    assertLive: (fixtureRoot) => {
      const result = checkIngestionNotMountedBeforePhase5({ root: fixtureRoot, currentPhase: 5 });
      const t = tallySupplementary([{ name: 'guard', result, detail: '' }]);
      return t.notApplicable === 1 && t.passed === 0 && t.failed === 0;
    },
  },
];

function runSelfTest() {
  const fixtureRoot = buildSelfTestFixture();
  const emptyTreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karar-arch-empty-'));
  const failures = [];
  try {
    const results = new Map();
    // Keyed by function AND by any extra context a case supplies, so a case
    // that seeds different inputs gets its own run rather than a cached one
    // from a different set of inputs.
    const resultFor = (fn, extra) => {
      const key = `${fn}|${extra === undefined ? '' : JSON.stringify(extra)}`;
      if (!results.has(key)) {
        const check = CHECKS[fn] ?? SUPPLEMENTARY_CHECKS[fn] ?? null;
        // `emptyTree` points a case at a directory with nothing in it, which is
        // how a "your discovery rule found nothing" arm is seeded without
        // deleting the fixture every other case reads.
        const { emptyTree, ...rest } = extra ?? {};
        const root = emptyTree === true ? emptyTreeRoot : fixtureRoot;
        results.set(key, check === null ? null : check({ root, ...rest }));
      }
      return results.get(key);
    };
    for (const { fn, expect, ctx } of SELF_TEST_CASES) {
      const result = resultFor(fn, ctx);
      if (!result) {
        failures.push(`${fn}: unknown check`);
        continue;
      }
      if (result.violations.length === 0) {
        failures.push(`${fn}: did NOT fail on the seeded violation — the check is vacuous`);
        continue;
      }
      const hit = result.violations.some((v) => expect.test(`${v.file} ${v.detail}`));
      if (!hit) {
        failures.push(
          `${fn}: failed, but not on the seeded violation (${expect}); got: ${result.violations
            .map((v) => v.detail)
            .join(' | ')}`,
        );
      }
    }
    for (const { fn, forbid, ctx } of NEGATIVE_SELF_TEST_CASES) {
      const result = resultFor(fn, ctx);
      if (!result) {
        failures.push(`${fn}: unknown check (negative case)`);
        continue;
      }
      const wrongHit = result.violations.find((v) => forbid.test(`${v.file} ${v.detail}`));
      if (wrongHit) {
        failures.push(
          `${fn}: flagged the sanctioned shape (${forbid}) — the allowance is too narrow: ${wrongHit.file} — ${wrongHit.detail}`,
        );
      }
    }
    for (const { fn, ctx, expectApplicable, reason, why } of APPLICABILITY_CASES) {
      const result = resultFor(fn, ctx);
      if (!result) {
        failures.push(`${fn}: unknown check (applicability case)`);
        continue;
      }
      const applicable = result.applicable !== false;
      if (applicable !== expectApplicable) {
        failures.push(
          `${fn}: reported applicable=${applicable}, expected ${expectApplicable} — ${why}`,
        );
        continue;
      }
      if (!expectApplicable) {
        if (typeof result.reason !== 'string' || result.reason.trim() === '') {
          failures.push(`${fn}: reported NOT_APPLICABLE with no reason — ${why}`);
        } else if (reason && !reason.test(result.reason)) {
          failures.push(
            `${fn}: NOT_APPLICABLE for the wrong reason (${reason}); got: ${result.reason}`,
          );
        }
        if (result.violations.length > 0) {
          failures.push(`${fn}: reported NOT_APPLICABLE yet carried violations`);
        }
      }
    }
    for (const testCase of RUNNER_TALLY_CASES) {
      try {
        const held =
          testCase.runs === null
            ? testCase.assertLive(fixtureRoot)
            : testCase.assert(tallySupplementary(testCase.runs));
        if (!held) {
          failures.push(`runner tally: ${testCase.name} — the accounting does not hold`);
        }
      } catch (err) {
        failures.push(`runner tally: ${testCase.name} — threw: ${err.message}`);
      }
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    fs.rmSync(emptyTreeRoot, { recursive: true, force: true });
  }
  return {
    cases:
      SELF_TEST_CASES.length +
      NEGATIVE_SELF_TEST_CASES.length +
      APPLICABILITY_CASES.length +
      RUNNER_TALLY_CASES.length,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const selfTestOnly = args.includes('--self-test');

  if (selfTestOnly) {
    const { cases, failures } = runSelfTest();
    if (failures.length > 0) {
      console.error(`SELF-TEST FAIL (${failures.length}/${cases} cases):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log(
      `SELF-TEST PASS — all ${cases} cases hold (checkers fail on seeded violations, sanctioned shapes stay unflagged)`,
    );
    process.exit(0);
  }

  const { registry, errors: registryErrors } = loadRegistry(REPO_ROOT);
  const results = [];
  let failCount = 0;
  let passCount = 0;
  let skipCount = 0;
  // Not-applicable rows: controls that had nothing to check. Kept apart from
  // `passCount` on purpose — see `tallySupplementary`.
  let naCount = 0;

  console.log(
    `Architecture tests — ${REGISTRY_REL} (currentPhase ${registry?.currentPhase ?? '?'})`,
  );
  console.log('');

  if (registryErrors.length > 0) {
    console.error('REGISTRY ERRORS:');
    for (const e of registryErrors) console.error(`  - ${e}`);
    console.error('');
  }

  const fnCache = new Map();
  if (registry && Array.isArray(registry.tests)) {
    for (const test of registry.tests) {
      const label = `test ${test.id}`.padEnd(18);
      if (test.status === 'ACTIVE') {
        const m = (test.implementedIn ?? '').match(/#(\w+)$/);
        const fnName = m?.[1];
        if (!fnName || !CHECKS[fnName]) {
          failCount += 1;
          console.log(`FAIL    ${label} ${test.name} — no runnable implementation`);
          results.push({
            id: test.id,
            name: test.name,
            status: 'FAIL',
            violations: [{ detail: 'no runnable implementation' }],
          });
          continue;
        }
        if (!fnCache.has(fnName)) fnCache.set(fnName, CHECKS[fnName]({ root: REPO_ROOT }));
        const result = fnCache.get(fnName);
        // A CHECK THAT EXAMINED NOTHING DID NOT PASS.
        //
        // KAR-RSK-044 and CI-017 both record the class as fixed — "every
        // checker that can go quiet now fails on a zero-scan inside its own
        // window" — and an independent review measured what that meant: ONE
        // `scanned === 0` guard, inside one retired historical guard, in 4760
        // lines. The reviewer reproduced the original defect on a different
        // check by making `modules/` read as empty and got
        // `PASS test 16 Module ownership (scanned: 0)` counted in the headline
        // with the self-test green. The instance was fixed; the class was not,
        // and the register stated the class.
        //
        // It is structural now, at the ONE place every numbered check's status
        // is decided, so it cannot be forgotten by a check written later. A
        // check with a genuinely empty window declares that by returning
        // `applicable: false` and is reported N/A — which is a third status
        // excluded from the pass count, not a pass.
        const scannedNothing = result.applicable !== false && result.scanned === 0;
        const status = result.violations.length === 0 && !scannedNothing ? 'PASS' : 'FAIL';
        if (scannedNothing) {
          console.log(
            `          scanned 0 files inside its own window — a control that ` +
              `examined nothing did not hold anything. If the window is legitimately ` +
              `empty, the check must say so with applicable:false and be reported N/A.`,
          );
        }
        if (status === 'PASS') passCount += 1;
        else failCount += 1;
        const scanNote = `scanned: ${result.scanned}${result.note ? `; ${result.note}` : ''}`;
        console.log(`${status.padEnd(7)} ${label} ${test.name} (${scanNote})`);
        for (const v of result.violations) {
          console.log(`          ${v.file}${v.line ? `:${v.line}` : ''} — ${v.detail}`);
        }
        results.push({
          id: test.id,
          name: test.name,
          status,
          scanned: result.scanned,
          note: result.note,
          violations: result.violations,
        });
      } else {
        skipCount += 1;
        console.log(
          `SKIPPED ${label} ${test.name} — activation phase ${test.activationPhase} (current ${registry.currentPhase}): ${test.activationCriterion ?? ''}`,
        );
        results.push({
          id: test.id,
          name: test.name,
          status: 'SKIPPED',
          activationPhase: test.activationPhase,
          activationCriterion: test.activationCriterion,
        });
      }
    }
  }

  // Supplementary structural checks not numbered in the canonical 26.
  //
  // Table-driven, and that is the repair rather than a tidy-up. Each of these
  // used to be four hand-written blocks with their own tally arithmetic, and
  // one of them — `phase5-ingestion-not-mounted-early` — returned an empty
  // violation list at phase 5 because it had nothing left to check. The
  // arithmetic could not tell that apart from a control that looked and found
  // nothing, so it printed `PASS (files scanned: 0)` and added it to the
  // headline. `tallySupplementary` below is the single place that decides, it
  // reads `applicable`, and the self-test drives it directly.
  console.log('');
  const supplementaryRuns = SUPPLEMENTARY_RUNS.map(({ name, fn, describe }) => {
    const result = fn({ root: REPO_ROOT });
    return { name, result, detail: describe(result) };
  });
  const supplementaryTally = tallySupplementary(supplementaryRuns);
  passCount += supplementaryTally.passed;
  failCount += supplementaryTally.failed;
  naCount += supplementaryTally.notApplicable;
  for (const row of supplementaryTally.rows) {
    console.log(`${row.status.padEnd(7)} supplementary     ${row.name} (${row.detail})`);
    for (const v of row.result.violations) console.log(`          ${v.file} — ${v.detail}`);
    if (row.status === 'N/A') console.log(`          not applicable: ${row.result.reason}`);
  }

  // Self-test at the end of every normal run: prove the passes above are not
  // vacuous by asserting each checker fails on seeded violations.
  console.log('');
  const { cases, failures: selfTestFailures } = runSelfTest();
  if (selfTestFailures.length > 0) {
    console.error(`SELF-TEST FAIL (${selfTestFailures.length}/${cases} cases):`);
    for (const f of selfTestFailures) console.error(`  - ${f}`);
  } else {
    console.log(
      `SELF-TEST PASS — all ${cases} cases hold (checkers fail on seeded violations, sanctioned shapes stay unflagged)`,
    );
  }

  const ok = failCount === 0 && registryErrors.length === 0 && selfTestFailures.length === 0;
  console.log('');
  console.log(
    `Summary: ${passCount} passed, ${failCount} failed, ${skipCount} skipped (deferred by activation phase), ` +
      `${naCount} not applicable (retired guards, excluded from the pass count); ` +
      `registry errors: ${registryErrors.length}; self-test: ${selfTestFailures.length === 0 ? 'ok' : 'FAILED'}`,
  );

  const outDir = ensureOutDir(REPO_ROOT);
  const report = {
    generatedAt: new Date().toISOString(),
    currentPhase: registry?.currentPhase ?? null,
    ok,
    summary: {
      passed: passCount,
      failed: failCount,
      skipped: skipCount,
      notApplicable: naCount,
    },
    registryErrors,
    selfTest: { cases, failures: selfTestFailures },
    results,
    // Every supplementary row, derived from the same tally the console printed.
    // The hand-written array this replaced listed three of the four and omitted
    // `capability-registry-truth` entirely, so the machine-readable evidence
    // disagreed with the run it was evidence of.
    supplementary: supplementaryTally.rows.map((row) => ({
      name: row.name,
      status: row.status,
      violations: row.result.violations,
      scanned: row.result.scanned,
      ...(row.result.note ? { note: row.result.note } : {}),
      ...(row.result.reason ? { notApplicableReason: row.result.reason } : {}),
      ...(row.result.exemptions ? { exemptions: row.result.exemptions } : {}),
    })),
  };
  fs.writeFileSync(
    path.join(outDir, 'architecture-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`Report: scripts/checks/.out/architecture-report.json`);

  process.exit(ok ? 0 : 1);
}

main();
