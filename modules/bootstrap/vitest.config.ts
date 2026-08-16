import { defineConfig } from 'vitest/config';

// The integration suite bootstraps a real database and pays real argon2id
// login cost (identity's ~160ms-per-verification stance) — the default 5s
// budgets are too tight.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 180_000,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
