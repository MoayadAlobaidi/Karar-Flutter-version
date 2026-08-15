#!/usr/bin/env node
// Compares the local toolchain with .tool-versions and reports pass/fail.
// Exit code 0 only when every check passes.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const pinned = Object.fromEntries(
  readFileSync(join(repoRoot, '.tool-versions'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split(/\s+/)),
);

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

const checks = [
  {
    tool: 'node',
    expected: pinned.nodejs ?? '(missing from .tool-versions)',
    found: run('node --version')?.replace(/^v/, '') ?? null,
  },
  {
    tool: 'pnpm',
    expected: pinned.pnpm ?? '(missing from .tool-versions)',
    found: run('pnpm --version'),
  },
  {
    tool: 'flutter',
    expected: pinned.flutter ?? '(missing from .tool-versions)',
    found: run('flutter --version')?.match(/Flutter (\d+\.\d+\.\d+)/)?.[1] ?? null,
  },
  {
    // Docker has no pin in .tool-versions; the check is that the daemon answers.
    tool: 'docker',
    expected: 'daemon running',
    found: run('docker version --format {{.Server.Version}}'),
    pass: (found) => found !== null,
  },
];

let failures = 0;
const rows = checks.map((check) => {
  const ok = check.pass ? check.pass(check.found) : check.found === check.expected;
  if (!ok) failures += 1;
  return {
    tool: check.tool,
    expected: check.expected,
    found: check.found ?? 'not found',
    status: ok ? 'ok' : 'FAIL',
  };
});

const pad = (value, width) => String(value).padEnd(width);
console.log(`${pad('tool', 10)}${pad('expected', 18)}${pad('found', 18)}status`);
console.log('-'.repeat(52));
for (const row of rows) {
  console.log(`${pad(row.tool, 10)}${pad(row.expected, 18)}${pad(row.found, 18)}${row.status}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed. Install the pinned versions from .tool-versions.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
