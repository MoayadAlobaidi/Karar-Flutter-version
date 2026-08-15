import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Baseline lint only. Layer-boundary and import rules are enforced by
// scripts/checks/architecture.mjs (run via `make architecture-test` and CI).
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/mobile/**',
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
