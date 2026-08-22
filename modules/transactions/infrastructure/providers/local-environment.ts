/**
 * The one environment token this module's local-only adapters accept, held in
 * one place so all three of them compare against the same value.
 *
 * TEST is not a separate environment token in this repository — the suites run
 * under `KARAR_ENV=local` — so `local` is the only value any local fixture,
 * local key holder or local store may be reached in.
 *
 * It is a CONSTANT rather than a lookup: nothing in this module reads
 * `process.env`. The deployment environment is resolved once at the
 * composition root (packages/platform config) and arrives at each resolver as
 * an argument, which is what makes a refusal testable — a suite can ask for
 * `production` without being one.
 */
export const LOCAL_ENVIRONMENT = 'local';
