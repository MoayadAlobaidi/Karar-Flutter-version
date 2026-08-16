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

const PURE_PACKAGES = ['shared-kernel', 'financial-engine', 'jurisdiction-policy', 'state-machine'];
const KERNEL_EXPORTS = [
  'Money',
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
  return { violations, scanned, ...(note ? { note } : {}) };
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
 * Parses every canonical migration: created tables (with columns and their
 * NOT NULL state), RLS ENABLE/FORCE statements, and CREATE POLICY targets.
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
      const columns = new Map();
      for (const fragment of splitTopLevel(sql.slice(start, end - 1))) {
        const trimmed = fragment.trim();
        if (trimmed === '' || COLUMN_LINE_SKIP.test(trimmed)) continue;
        const colMatch = trimmed.match(/^"?([a-z_][\w$]*)"?\s/i);
        if (!colMatch) continue;
        columns.set(colMatch[1].toLowerCase(), {
          notNull: /\bNOT\s+NULL\b/i.test(fragment),
        });
      }
      tables.set(name, {
        name,
        file: relFile,
        line: lineOf(sql, m.index),
        columns,
        rlsEnabled: false,
        rlsForced: false,
        policies: [],
      });
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
// schema (data-model.md §5). Each canonical pinning dimension maps to the
// actual column that carries it, or declares a deferral to the phase whose
// machinery introduces the value — and a deferral whose phase has arrived
// FAILS the run (the registry's own activation-gate discipline; a pin backed
// by fabricated values would be worse than an honest deferral). Phase 3
// reality, recorded in migration 0063: consent_grants pins the operating
// entity and jurisdiction per acceptance (plus the exact document version);
// data_protection_role_assignments carries the same per-row entity +
// jurisdiction pins. PolicyPack versions and SubjectPolicySelection do not
// exist until Phase 3.5, so those two dimensions are deferred to 3.5 below.
const LEGAL_CONSEQUENCE_TABLES = [
  {
    table: 'public.consent_grants',
    pins: {
      jurisdictionAtCreation: { column: 'jurisdiction_ref' },
      operatingEntityAtCreation: { column: 'operating_entity_id' },
      policyPackVersionAtCreation: {
        deferredUntilPhase: 3.5,
        reason: 'PolicyPack machinery arrives in Phase 3.5; no pack version exists to pin yet',
      },
      subjectPolicySelectionVersion: {
        deferredUntilPhase: 3.5,
        reason:
          'SubjectPolicySelection arrives in Phase 3.5; the column is nullable-by-design where no elective options exist (data-model.md §5)',
      },
    },
  },
  {
    table: 'public.data_protection_role_assignments',
    pins: {
      jurisdictionAtCreation: { column: 'jurisdiction_ref' },
      operatingEntityAtCreation: { column: 'operating_entity_id' },
      policyPackVersionAtCreation: {
        deferredUntilPhase: 3.5,
        reason: 'PolicyPack machinery arrives in Phase 3.5; no pack version exists to pin yet',
      },
      subjectPolicySelectionVersion: {
        deferredUntilPhase: 3.5,
        reason:
          'stored legal decisions carry no subject election; re-reviewed when SubjectPolicySelection lands (Phase 3.5)',
      },
    },
  },
];

export function checkPinning(ctx) {
  const { root } = ctx;
  const violations = [];
  const { tables } = parseCanonicalMigrations(root);

  let currentPhase = null;
  try {
    const registry = readJson(path.join(root, REGISTRY_REL));
    if (typeof registry.currentPhase === 'number') currentPhase = registry.currentPhase;
  } catch {
    // loadRegistry reports unreadable registries; deferral gates cannot
    // evaluate without a phase, which is itself a violation below.
  }

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
    for (const [dimension, pin] of Object.entries(pins)) {
      if (pin.column !== undefined) {
        const column = record.columns.get(pin.column.toLowerCase());
        if (!column) {
          violations.push({
            file: record.file,
            line: record.line,
            detail: `${name}: pinning dimension '${dimension}' maps to column '${pin.column}', which does not exist`,
          });
        } else if (!column.notNull && pin.nullable !== true) {
          violations.push({
            file: record.file,
            line: record.line,
            detail: `${name}: pinning column '${pin.column}' (${dimension}) is nullable — a legal-consequence record pins its provenance at creation, always`,
          });
        }
        continue;
      }
      if (typeof pin.deferredUntilPhase === 'number') {
        if (currentPhase === null) {
          violations.push({
            file: REGISTRY_REL.split(path.sep).join('/'),
            detail: `cannot evaluate the '${dimension}' deferral for ${name}: registry currentPhase is unreadable`,
          });
        } else if (currentPhase >= pin.deferredUntilPhase) {
          violations.push({
            file: record.file,
            detail: `${name}: pinning dimension '${dimension}' was deferred until phase ${pin.deferredUntilPhase} and phase ${currentPhase} has arrived without the column — the deferral gate works like the registry's activation gate`,
          });
        }
        continue;
      }
      violations.push({
        file: 'scripts/checks/architecture.mjs',
        detail: `${name}: pinning dimension '${dimension}' declares neither a column nor a numeric deferredUntilPhase`,
      });
    }
  }

  // A table that carries the pinning signature must be declared: canonical
  // *_at_creation columns, or a per-row operating_entity_id pin.
  for (const table of tables.values()) {
    if (declared.has(table.name)) continue;
    const pinColumns = [...table.columns.keys()].filter(
      (col) => col.endsWith('_at_creation') || col === 'operating_entity_id',
    );
    if (pinColumns.length > 0) {
      violations.push({
        file: table.file,
        line: table.line,
        detail: `${table.name} carries pinning-signature column(s) [${pinColumns.join(', ')}] but is not declared in LEGAL_CONSEQUENCE_TABLES — records with legal consequence are declared, and the declaration is what test 21 verifies (data-model.md §5)`,
      });
    }
  }

  return violationsResult(
    violations,
    tables.size,
    `declared legal-consequence tables: ${LEGAL_CONSEQUENCE_TABLES.length}; deferred dimensions gate at phase 3.5 (currentPhase ${currentPhase ?? 'unreadable'})`,
  );
}

// ---------------------------------------------------------------------------
// Test 7 — Money discipline (lexical)
// ---------------------------------------------------------------------------
export function checkMoneyDiscipline(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...PURE_PACKAGES.map((p) => path.join(root, 'packages', p, 'src')),
    ...moduleLayerDirs(root, ['domain', 'application']),
  ]);
  const monetaryNumber =
    /\b(minorUnits|basisPoints|amount|amounts|balance|balances|price|prices|fee|fees|monetaryValue)\s*\??\s*:\s*number\b/g;
  const floatOps = [/\bparseFloat\s*\(/g, /\bNumber\.parseFloat\b/g, /\.toFixed\s*\(/g];
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
        violations.push({
          file: rel(root, file),
          line: lineOf(src, m.index),
          detail: `float operation '${m[0].trim()}' in a money-bearing layer`,
        });
      }
    }
  }
  return violationsResult(
    violations,
    files.length,
    'lexical check; type-level enforcement deepens with the financial engine',
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
export function checkPurePackages(ctx) {
  const { root } = ctx;
  const violations = [];
  for (const pkg of PURE_PACKAGES) {
    const pkgJsonPath = path.join(root, 'packages', pkg, 'package.json');
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
    const deps = Object.keys(json.dependencies ?? {});
    for (const dep of deps) {
      const allowed = pkg !== 'shared-kernel' && dep === '@karar/shared-kernel';
      if (!allowed) {
        violations.push({
          file: relPath,
          detail:
            pkg === 'shared-kernel'
              ? `shared-kernel declares runtime dependency '${dep}' — it must have none`
              : `pure package declares runtime dependency '${dep}' — only @karar/shared-kernel is allowed`,
        });
      }
    }
  }
  return violationsResult(violations, PURE_PACKAGES.length);
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
// Test 20 — Kernel surface (exactly the nine universals)
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
        detail: `exports '${name}' — the kernel surface is capped at the nine universals (additions require an ADR)`,
      });
    }
  }
  for (const name of expected) {
    if (!actual.has(name)) {
      violations.push({
        file: relPath,
        detail: `universal '${name}' is missing — the kernel surface must be exactly the nine`,
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
  checkPinning,
  checkRlsCoverage,
  checkGuardCallSites,
  checkLifecycleDeclarations,
  checkAssuranceClaims,
};

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

  write(
    'packages/shared-kernel/package.json',
    JSON.stringify({ name: '@karar/shared-kernel', dependencies: { lodash: '^4.17.0' } }),
  );
  write(
    'packages/shared-kernel/src/index.ts',
    KERNEL_EXPORTS.map((n) => `export type ${n} = unknown;`).join('\n') +
      `\nexport type ExtraTenthExport = never;\n`,
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
      '-- fixture: a declared legal-consequence table MISSING its jurisdiction pin (test 21)',
      'CREATE TABLE public.consent_grants (id uuid PRIMARY KEY, operating_entity_id uuid NOT NULL);',
      'ALTER TABLE public.consent_grants ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.consent_grants FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY consent_grants_subject ON public.consent_grants FOR SELECT USING (true);',
      '-- fixture: pinning-signature columns on an UNDECLARED table (test 21)',
      'CREATE TABLE public.fixture_rulings (id uuid PRIMARY KEY, jurisdiction_at_creation text NOT NULL);',
      'ALTER TABLE public.fixture_rulings ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE public.fixture_rulings FORCE ROW LEVEL SECURITY;',
      'CREATE POLICY fixture_rulings_policy ON public.fixture_rulings FOR SELECT USING (true);',
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
      '',
    ].join('\n'),
  );

  return root;
}

const SELF_TEST_CASES = [
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
  // …and a deferral whose phase has arrived (fixture currentPhase 4 > 3.5).
  { fn: 'checkPinning', expect: /policyPackVersionAtCreation/ },
  // Test 22, all three shapes plus allow-list integrity.
  { fn: 'checkRlsCoverage', expect: /fixture_naked/ },
  {
    fn: 'checkRlsCoverage',
    expect: /fixture_enabled_no_policy.*zero policies|zero policies.*fixture_enabled_no_policy/,
  },
  { fn: 'checkRlsCoverage', expect: /fixture_forced_not_enabled/ },
  { fn: 'checkRlsCoverage', expect: /fixture_ghost/ },
  { fn: 'checkRlsCoverage', expect: /'reason' is missing or empty/ },
  // Test 5: an adapter-suffixed infrastructure class with no port interface.
  { fn: 'checkPortsDeclaredInward', expect: /OrphanRepository/ },
  // Test 6: a controller importing a module's domain, over the route budget.
  { fn: 'checkControllerComplexity', expect: /domain/ },
  { fn: 'checkControllerComplexity', expect: /route handlers/ },
  { fn: 'checkMoneyDiscipline', expect: /amount/ },
  { fn: 'checkEventCatalogue', expect: /FakeThingHappened/ },
  { fn: 'checkProviderBoundary', expect: /@aws-sdk/ },
  { fn: 'checkDeterministicDomain', expect: /Date\.now/ },
  { fn: 'checkJurisdictionBranching', expect: /jurisdiction|country/i },
  { fn: 'checkModuleDocs', expect: /beta/ },
  { fn: 'checkPurePackages', expect: /lodash|rxjs/ },
  { fn: 'checkStorageBoundary', expect: /client-s3/ },
  { fn: 'checkKernelSurface', expect: /ExtraTenthExport/ },
  // Test 23: a declared FooGuard nothing references.
  { fn: 'checkGuardCallSites', expect: /FooGuard/ },
  { fn: 'checkLifecycleDeclarations', expect: /DELETE_LATER/ },
  // Test 25 deepened: a module with code still using the erasure-only table…
  { fn: 'checkLifecycleDeclarations', expect: /six-field/ },
  // …and a DATA_LIFECYCLE.md row carrying a forbidden placeholder.
  { fn: 'checkLifecycleDeclarations', expect: /placeholder/ },
  { fn: 'checkAssuranceClaims', expect: /AC-00[12]/ },
  { fn: 'checkAdminNoDbDriver', expect: /'pg'/ },
];

// Negative cases: seeded shapes a checker must NOT flag — the proof an
// allowance is exactly as narrow as sanctioned and no narrower.
const NEGATIVE_SELF_TEST_CASES = [
  // Test 4: the one sanctioned construction path (platform src/db) is allowed…
  { fn: 'checkOrmLeakage', forbid: /packages[\\/]platform[\\/]src[\\/]db[\\/]prisma/ },
  // Test 9: the identity-scope pattern (transaction-local set_config) passes.
  { fn: 'checkTenantScoping', forbid: /scoped-binder/ },
];

function runSelfTest() {
  const fixtureRoot = buildSelfTestFixture();
  const failures = [];
  try {
    const results = new Map();
    const resultFor = (fn) => {
      if (!results.has(fn)) {
        results.set(
          fn,
          CHECKS[fn]
            ? CHECKS[fn]({ root: fixtureRoot })
            : fn === 'checkAdminNoDbDriver'
              ? checkAdminNoDbDriver({ root: fixtureRoot })
              : null,
        );
      }
      return results.get(fn);
    };
    for (const { fn, expect } of SELF_TEST_CASES) {
      const result = resultFor(fn);
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
    for (const { fn, forbid } of NEGATIVE_SELF_TEST_CASES) {
      const result = resultFor(fn);
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
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  return { cases: SELF_TEST_CASES.length + NEGATIVE_SELF_TEST_CASES.length, failures };
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
        const status = result.violations.length === 0 ? 'PASS' : 'FAIL';
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
  console.log('');
  const adminResult = checkAdminNoDbDriver({ root: REPO_ROOT });
  const adminStatus = adminResult.violations.length === 0 ? 'PASS' : 'FAIL';
  if (adminStatus === 'FAIL') failCount += 1;
  else passCount += 1;
  console.log(
    `${adminStatus.padEnd(7)} supplementary     admin-no-db-driver (deps checked: ${adminResult.scanned})`,
  );
  for (const v of adminResult.violations) console.log(`          ${v.file} — ${v.detail}`);

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
    `Summary: ${passCount} passed, ${failCount} failed, ${skipCount} skipped (deferred by activation phase); registry errors: ${registryErrors.length}; self-test: ${selfTestFailures.length === 0 ? 'ok' : 'FAILED'}`,
  );

  const outDir = ensureOutDir(REPO_ROOT);
  const report = {
    generatedAt: new Date().toISOString(),
    currentPhase: registry?.currentPhase ?? null,
    ok,
    summary: { passed: passCount, failed: failCount, skipped: skipCount },
    registryErrors,
    selfTest: { cases, failures: selfTestFailures },
    results,
    supplementary: [
      { name: 'admin-no-db-driver', status: adminStatus, violations: adminResult.violations },
    ],
  };
  fs.writeFileSync(
    path.join(outDir, 'architecture-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`Report: scripts/checks/.out/architecture-report.json`);

  process.exit(ok ? 0 : 1);
}

main();
