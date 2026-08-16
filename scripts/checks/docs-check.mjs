#!/usr/bin/env node
// Documentation checks — deterministic only.
//
// What this checks:
//   1. Internal markdown links: every [text](target) with a non-http target
//      must resolve to an existing file or directory relative to the doc
//      (anchors stripped). Links inside code fences and inline code are ignored.
//   2. Root README.md has a "Current phase" row matching the architecture-test
//      registry's currentPhase.
//   3. The current phase report docs/phases/phase-0N.md exists.
//   4. Every ADR referenced as [ADR-00XX] or adr/00XX-*.md in the docs exists
//      in docs/adr/.
//   5. Every direct child of modules/ has MODULE.md (shared with architecture
//      test 16; duplicated cheaply here so docs:check stands alone).
//   6. Mermaid blocks: syntactic sanity only — balanced fences, non-empty
//      blocks, first word one of the known diagram types. This deliberately
//      does NOT pretend to validate the full mermaid grammar.
//   7. docs/phases/PHASE_TEMPLATE.md carries the compliance-gate sections
//      ("Evidence produced", "SOC 2 mapping", "ISO 27001 mapping").
//
// There is NO natural-language contradiction detection here — deterministic
// checks only.
//
// Zero dependencies: node: builtins only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { childDirs, ensureOutDir, readJson, readText, walkFiles } from './lib/util.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const REGISTRY_REL = path.join('docs', 'testing', 'architecture-test-registry.json');

const MERMAID_TYPES = new Set([
  'graph',
  'flowchart',
  'sequenceDiagram',
  'stateDiagram-v2',
  'classDiagram',
  'erDiagram',
]);

const MD_EXTS = new Set(['.md']);

function rel(file) {
  return path.relative(REPO_ROOT, file);
}

function mdFiles() {
  return walkFiles(REPO_ROOT, { exts: MD_EXTS });
}

/**
 * Blank out fenced code blocks and inline code spans, preserving the line
 * structure so reported line numbers match the file.
 */
function stripMarkdownCode(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let fenceLen = 0; // 0 = not in a fence
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,})(.*)$/);
    if (m) {
      const ticks = m[1].length;
      if (fenceLen === 0) {
        fenceLen = ticks;
        out.push('');
        continue;
      }
      if (ticks >= fenceLen && m[2].trim() === '') {
        fenceLen = 0;
        out.push('');
        continue;
      }
      out.push('');
      continue;
    }
    if (fenceLen > 0) {
      out.push('');
      continue;
    }
    out.push(line.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length)));
  }
  return out;
}

function targetExists(docFile, rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  // Drop an optional trailing markdown title: (path "Title")
  target = target.replace(/\s+["'][^"']*["']$/, '');
  const [pathPart] = target.split('#');
  const clean = pathPart.split('?')[0];
  if (clean === '') return true; // pure anchor
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  const resolved = decoded.startsWith('/')
    ? path.join(REPO_ROOT, decoded)
    : path.resolve(path.dirname(docFile), decoded);
  return fs.existsSync(resolved);
}

function isExternal(target) {
  return /^(https?:\/\/|mailto:|tel:|data:|javascript:|#)/i.test(target.trim());
}

function checkLinks(files) {
  const problems = [];
  const linkRe = /!?\[[^\]]*\]\(([^()\s]+(?:\s+"[^"]*")?)\)/g;
  const refDefRe = /^\s*\[[^\]]+\]:\s+(\S+)/;
  for (const file of files) {
    const lines = stripMarkdownCode(readText(file));
    lines.forEach((line, i) => {
      for (const m of line.matchAll(linkRe)) {
        const target = m[1];
        if (isExternal(target)) continue;
        if (!targetExists(file, target)) {
          problems.push(`${rel(file)}:${i + 1} broken link '${target}'`);
        }
      }
      const def = line.match(refDefRe);
      if (def && !isExternal(def[1]) && !targetExists(file, def[1])) {
        problems.push(`${rel(file)}:${i + 1} broken reference definition '${def[1]}'`);
      }
    });
  }
  return problems;
}

function checkReadmePhase(registry) {
  const problems = [];
  const readmePath = path.join(REPO_ROOT, 'README.md');
  if (!fs.existsSync(readmePath)) return ['README.md missing'];
  const row = readText(readmePath)
    .split('\n')
    .find((l) => /^\|\s*Current phase\s*\|/i.test(l));
  if (!row) {
    problems.push(`README.md: no '| Current phase |' row`);
    return problems;
  }
  const value = row.split('|')[2] ?? '';
  const num = value.match(/(\d+(?:\.\d+)?)/);
  if (!num) {
    problems.push(`README.md: 'Current phase' row carries no phase number ('${value.trim()}')`);
  } else if (Number(num[1]) !== registry.currentPhase) {
    problems.push(
      `README.md: 'Current phase' says ${num[1]} but ${REGISTRY_REL} says ${registry.currentPhase}`,
    );
  }
  return problems;
}

function phaseReportName(phase) {
  const intPart = Math.floor(phase);
  const padded = String(intPart).padStart(2, '0');
  // Fractional phases use a dash, not a dot, in the filename (the canonical
  // Phase 3.5 report is docs/phases/phase-03-5.md).
  const frac = phase === intPart ? '' : `-${String(phase).split('.')[1]}`;
  return `phase-${padded}${frac}.md`;
}

function checkPhaseReport(registry) {
  const name = phaseReportName(registry.currentPhase);
  const full = path.join(REPO_ROOT, 'docs', 'phases', name);
  return fs.existsSync(full)
    ? []
    : [`docs/phases/${name} missing for currentPhase ${registry.currentPhase}`];
}

function checkAdrReferences(files) {
  const problems = [];
  const adrDir = path.join(REPO_ROOT, 'docs', 'adr');
  const adrFiles = fs.existsSync(adrDir) ? fs.readdirSync(adrDir) : [];
  const exists = (num) => adrFiles.some((f) => f.startsWith(`${num}-`) && f.endsWith('.md'));
  const seen = new Set();
  for (const file of files) {
    const lines = stripMarkdownCode(readText(file));
    lines.forEach((line, i) => {
      const refs = [
        ...line.matchAll(/\[ADR-(\d{4})\]/g),
        ...line.matchAll(/\badr\/(\d{4})-[A-Za-z0-9-]*\.md/g),
      ];
      for (const m of refs) {
        const key = `${rel(file)}:${i + 1}:${m[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!exists(m[1])) {
          problems.push(`${rel(file)}:${i + 1} references ADR ${m[1]}, absent from docs/adr/`);
        }
      }
    });
  }
  return problems;
}

function checkModuleDocs() {
  const problems = [];
  for (const mod of childDirs(path.join(REPO_ROOT, 'modules'))) {
    if (!fs.existsSync(path.join(REPO_ROOT, 'modules', mod, 'MODULE.md'))) {
      problems.push(`modules/${mod}: MODULE.md missing`);
    }
  }
  return problems;
}

function checkMermaid(files) {
  const problems = [];
  for (const file of files) {
    const lines = readText(file).split('\n');
    let fenceLen = 0;
    let isMermaid = false;
    let block = [];
    let openLine = 0;
    lines.forEach((line, i) => {
      const m = line.match(/^\s*(`{3,})(.*)$/);
      if (m) {
        const ticks = m[1].length;
        const rest = m[2].trim();
        if (fenceLen === 0) {
          fenceLen = ticks;
          isMermaid = rest.split(/\s+/)[0] === 'mermaid';
          block = [];
          openLine = i + 1;
          return;
        }
        if (ticks >= fenceLen && rest === '') {
          if (isMermaid) {
            const content = block.filter((l) => l.trim() !== '' && !l.trim().startsWith('%%'));
            if (content.length === 0) {
              problems.push(`${rel(file)}:${openLine} empty mermaid block`);
            } else {
              const first = content[0].trim().split(/\s+/)[0];
              if (!MERMAID_TYPES.has(first)) {
                problems.push(
                  `${rel(file)}:${openLine} mermaid block starts with '${first}' — expected one of ${[...MERMAID_TYPES].join('|')}`,
                );
              }
            }
          }
          fenceLen = 0;
          isMermaid = false;
          return;
        }
        block.push(line);
        return;
      }
      if (fenceLen > 0) block.push(line);
    });
    if (fenceLen > 0) {
      problems.push(`${rel(file)}: unbalanced code fence (opened line ${openLine}, never closed)`);
    }
  }
  return problems;
}

function checkPhaseTemplate() {
  const templatePath = path.join(REPO_ROOT, 'docs', 'phases', 'PHASE_TEMPLATE.md');
  if (!fs.existsSync(templatePath)) return ['docs/phases/PHASE_TEMPLATE.md missing'];
  const content = readText(templatePath);
  const problems = [];
  for (const section of ['Evidence produced', 'SOC 2 mapping', 'ISO 27001 mapping']) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, 'm').test(content)) {
      problems.push(
        `docs/phases/PHASE_TEMPLATE.md: missing '## ${section}' section (compliance-gate wiring)`,
      );
    }
  }
  return problems;
}

function main() {
  let registry;
  try {
    registry = readJson(path.join(REPO_ROOT, REGISTRY_REL));
  } catch (err) {
    console.error(`FAIL ${REGISTRY_REL} unreadable: ${err.message}`);
    process.exit(1);
  }

  const files = mdFiles();
  const checks = [
    { name: 'internal-links', problems: checkLinks(files) },
    { name: 'readme-current-phase', problems: checkReadmePhase(registry) },
    { name: 'phase-report-exists', problems: checkPhaseReport(registry) },
    { name: 'adr-references', problems: checkAdrReferences(files) },
    { name: 'module-docs', problems: checkModuleDocs() },
    { name: 'mermaid-sanity', problems: checkMermaid(files) },
    { name: 'phase-template-sections', problems: checkPhaseTemplate() },
  ];

  console.log(`Documentation checks — ${files.length} markdown files scanned`);
  console.log('');
  let failed = 0;
  for (const { name, problems } of checks) {
    const status = problems.length === 0 ? 'PASS' : 'FAIL';
    if (problems.length > 0) failed += 1;
    console.log(`${status.padEnd(7)} ${name}${problems.length > 0 ? ` (${problems.length})` : ''}`);
    for (const p of problems) console.log(`          ${p}`);
  }

  const ok = failed === 0;
  console.log('');
  console.log(`Summary: ${checks.length - failed}/${checks.length} checks passed`);

  const outDir = ensureOutDir(REPO_ROOT);
  const report = {
    generatedAt: new Date().toISOString(),
    ok,
    filesScanned: files.length,
    checks: checks.map(({ name, problems }) => ({
      name,
      status: problems.length === 0 ? 'PASS' : 'FAIL',
      problems,
    })),
  };
  fs.writeFileSync(path.join(outDir, 'docs-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('Report: scripts/checks/.out/docs-report.json');

  process.exit(ok ? 0 : 1);
}

main();
