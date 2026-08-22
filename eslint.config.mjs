import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Baseline lint only. Layer-boundary and import rules are enforced by
// scripts/checks/architecture.mjs (run via `make architecture-test` and CI).
export default [
  {
    ignores: [
      'packages/platform/prisma/client/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/mobile/**',
      // Agent worktrees are nested checkouts. Left in, they make every file in
      // this tree fail to parse: tseslint sees several candidate tsconfig roots
      // and refuses to guess.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
