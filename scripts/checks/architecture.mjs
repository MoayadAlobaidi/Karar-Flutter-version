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
export function checkOrmLeakage(ctx) {
  const { root } = ctx;
  const violations = [];
  const files = codeFiles([
    ...appsSrcDirs(root),
    ...packagesSrcDirs(root),
    path.join(root, 'modules'),
  ]);
  const allowed = (file) => /[\\/]infrastructure[\\/]persistence[\\/]/.test(file);
  for (const file of files) {
    for (const { specifier, line } of extractImports(loadStripped(file))) {
      const isPrisma =
        specifier === 'prisma' ||
        specifier.startsWith('prisma/') ||
        specifier.startsWith('@prisma/');
      if (isPrisma && !allowed(file)) {
        violations.push({
          file: rel(root, file),
          line,
          detail: `imports '${specifier}' outside infrastructure/persistence/ — ORM types must not leak`,
        });
      }
    }
  }
  return violationsResult(violations, files.length);
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
// Test 25 — Lifecycle declarations (Data owned tables, ADR-0026 strategies)
// ---------------------------------------------------------------------------
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
    for (const row of table.rows) {
      const tableName = plainCell(row[0] ?? '');
      const value = plainCell(row[erasureIdx] ?? '');
      if (placeholder(value)) {
        // A placeholder erasure value is only acceptable on a placeholder row
        // (template rows with no real table name). A named dataset with no
        // declared erasure strategy is exactly the gap test 25 exists to catch.
        if (!placeholder(tableName)) {
          violations.push({
            file: relPath,
            detail: `table '${tableName}': erasure strategy is empty/placeholder — a named dataset must declare one of (${ERASURE_STRATEGIES.join(', ')})`,
          });
        }
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
  return violationsResult(violations, names.length);
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
  checkMoneyDiscipline,
  checkEventCatalogue,
  checkProviderBoundary,
  checkDeterministicDomain,
  checkJurisdictionBranching,
  checkModuleDocs,
  checkPurePackages,
  checkStorageBoundary,
  checkKernelSurface,
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
  write('modules/beta/domain/widget.ts', 'export const Widget = 1;\n'); // beta has no MODULE.md

  write(
    'apps/admin/package.json',
    JSON.stringify({ name: '@karar/admin', dependencies: { pg: '^8.0.0' } }),
  );

  write(
    'docs/testing/architecture-test-registry.json',
    JSON.stringify({
      currentPhase: 1,
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
  { fn: 'checkMoneyDiscipline', expect: /amount/ },
  { fn: 'checkEventCatalogue', expect: /FakeThingHappened/ },
  { fn: 'checkProviderBoundary', expect: /@aws-sdk/ },
  { fn: 'checkDeterministicDomain', expect: /Date\.now/ },
  { fn: 'checkJurisdictionBranching', expect: /jurisdiction|country/i },
  { fn: 'checkModuleDocs', expect: /beta/ },
  { fn: 'checkPurePackages', expect: /lodash|rxjs/ },
  { fn: 'checkStorageBoundary', expect: /client-s3/ },
  { fn: 'checkKernelSurface', expect: /ExtraTenthExport/ },
  { fn: 'checkLifecycleDeclarations', expect: /DELETE_LATER/ },
  { fn: 'checkAssuranceClaims', expect: /AC-00[12]/ },
  { fn: 'checkAdminNoDbDriver', expect: /'pg'/ },
];

function runSelfTest() {
  const fixtureRoot = buildSelfTestFixture();
  const failures = [];
  try {
    for (const { fn, expect } of SELF_TEST_CASES) {
      const result = CHECKS[fn]
        ? CHECKS[fn]({ root: fixtureRoot })
        : fn === 'checkAdminNoDbDriver'
          ? checkAdminNoDbDriver({ root: fixtureRoot })
          : null;
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
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  return { cases: SELF_TEST_CASES.length, failures };
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
    console.log(`SELF-TEST PASS — all ${cases} checkers fail on seeded violations (not vacuous)`);
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
    console.log(`SELF-TEST PASS — all ${cases} checkers fail on seeded violations (not vacuous)`);
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
