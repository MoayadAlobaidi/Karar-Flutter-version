import { defineConfig } from 'vitest/config';

// Integration suites bootstrap a real database and pay real argon2id cost
// (~160ms per verification by design) — the default 5s budgets are too tight.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 180_000,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
