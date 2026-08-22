// THE PHASE 7 CONTRACT, GIVEN TEETH WHILE THERE IS NO PHASE 7.
//
// ADR-0029 sections 8, 8a, 8b and 8c state what a future AI layer may and may
// not do. A document alone is a promise; this is the part that fails a build.
//
// Two kinds of assertion live here. The first is that the AI runtime genuinely
// does not exist yet — no client, no embedding call, no vector store, no
// prompt assembled by concatenation — so the contract cannot be quietly broken
// before Phase 7 formally begins. The second is that the trust model already
// refuses the promotions the contract forbids, which is what a future
// implementation will be built against.
//
// When Phase 7 arrives these tests do not get deleted. The first group narrows
// to "no AI outside the AI module"; the second group is permanent.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FUTURE_ONLY, mayReachDirectly } from '@karar/content-trust';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const PRODUCTION_TREES = ['modules', 'apps/api/src', 'packages'] as const;

function sources(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (['dist', 'node_modules', '__tests__', 'db'].includes(entry)) continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      found.push(full);
    }
  };
  for (const tree of PRODUCTION_TREES) walk(path.join(REPO, tree));
  return found;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('there is no AI runtime, and the boundary is ready for one', () => {
  const files = sources();

  it('scans a real tree', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  const FORBIDDEN_TODAY = [
    {
      what: 'a model client',
      pattern: /\b(?:openai|anthropic|OpenAI|Anthropic|GoogleGenerativeAI|VertexAI)\b/,
    },
    {
      what: 'an embedding call',
      pattern: /\bembeddings?\s*\.\s*create|\bcreateEmbedding|\bembedText\b/,
    },
    { what: 'a vector store', pattern: /\b(?:pinecone|weaviate|qdrant|pgvector|chromadb)\b/i },
    {
      what: 'a prompt assembled by concatenation',
      pattern: /\bsystemPrompt\s*\+=|\bprompt\s*\+=\s*(?:user|input|content|text)/,
    },
  ] as const;

  for (const rule of FORBIDDEN_TODAY) {
    it(`contains no ${rule.what}`, () => {
      const offenders = files
        .filter((file) => rule.pattern.test(stripComments(readFileSync(file, 'utf8'))))
        .map((file) => path.relative(REPO, file));
      expect(offenders).toEqual([]);
    });
  }

  it('refuses every promotion the Phase 7 contract forbids', () => {
    // These are the pairs ADR-0029 8a/8b/8c turn on, asserted against the
    // policy a future implementation would have to call.
    expect(mayReachDirectly('UNTRUSTED_USER_CONTENT', 'AI_PLATFORM_INSTRUCTION')).toBe(false);
    expect(mayReachDirectly('UNTRUSTED_EXTERNAL_CONTENT', 'AI_PLATFORM_INSTRUCTION')).toBe(false);
    expect(mayReachDirectly('UNTRUSTED_EXTERNAL_CONTENT', 'AI_TOOL_ARGUMENT')).toBe(false);
    expect(mayReachDirectly('UNTRUSTED_EXTERNAL_CONTENT', 'NETWORK_DESTINATION')).toBe(false);
    expect(mayReachDirectly('UNTRUSTED_USER_CONTENT', 'POLICY_STATE')).toBe(false);
    expect(mayReachDirectly('UNTRUSTED_USER_CONTENT', 'PRINCIPAL_IDENTITY')).toBe(false);
    expect(mayReachDirectly('SECRET_AUTH_MATERIAL', 'AI_RETRIEVAL_CORPUS')).toBe(false);
    expect(mayReachDirectly('SECRET_AUTH_MATERIAL', 'AI_PLATFORM_INSTRUCTION')).toBe(false);
    expect(mayReachDirectly('OPAQUE_IDENTIFIER', 'AUTHORIZATION_DECISION')).toBe(false);
  });

  it('carries the future-only red-team cases, unreachable and recorded', () => {
    // Retrieved-document, tool-output and memory-poisoning cases: nothing can
    // be fed them today, and the corpus says so rather than pretending they
    // were tested.
    const ids = FUTURE_ONLY.map((entry) => entry.id);
    expect(ids).toContain('future/retrieved-document');
    expect(ids).toContain('future/tool-output');
    expect(ids).toContain('future/memory-poison');
    for (const entry of FUTURE_ONLY) expect(entry.reachableToday).toBe(false);
  });
});
