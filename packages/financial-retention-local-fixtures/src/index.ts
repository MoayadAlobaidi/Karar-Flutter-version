/**
 * LOCAL AND TEST ONLY — the synthetic financial-retention values.
 *
 * ## Why these live outside the modules that use them
 *
 * The retention decision for financial data has NOT been taken. Until it is,
 * `modules/financial-accounts` and `modules/transactions` resolve retention
 * through a port that fails closed everywhere except a developer's machine,
 * where a synthetic answer lets the gate itself be exercised.
 *
 * That synthetic answer was originally a set of constants inside each module,
 * guarded by an environment check in the same file. The check was real, but
 * the VALUES shipped anyway — in each module's emitted JavaScript, its
 * declaration files and its source maps, in every environment that installed
 * the module. `modules/consent` learned this first and the reasoning is
 * recorded in its `production-closure.test.ts`: protection that consists only
 * of a deployed process declining to read values it is holding is one
 * composition change away from being no protection at all.
 *
 * A fabricated approval reference is worse to ship than fabricated document
 * text. It is shaped exactly like the real thing, it names an approval that
 * nobody gave, and its whole purpose is to satisfy a gate. So the requirement
 * here is the stronger one: the values must not be there.
 *
 * ## What is deliberately NOT plausible
 *
 * Every value below is self-describing and unusable. The marker is in the
 * basis text, in the approval reference and in the pack version, so a value
 * copied out of context still says what it is. The account period is `P0D` —
 * zero, because a plausible-looking period is the one value here that someone
 * could paste into a deployment and believe. The transaction period is `P7D`,
 * short enough that no one could mistake it for a considered legal answer and
 * long enough for a local run.
 *
 * This package has NO dependencies, by design: it is data, it must be
 * resolvable at runtime without pulling a module graph behind it, and a
 * production install must be able to simply not have it.
 */

/** In the basis, the approval reference and the pack version, so a value quoted out of context still says what it is. */
export const SYNTHETIC_RETENTION_MARKER = 'SYNTHETIC-NO-LEGAL-EFFECT';

/** The environment token this fixture is permitted in. TEST is not a separate token in this repository — the suites run under `KARAR_ENV=local`. */
export const FIXTURE_ENVIRONMENT = 'local';

/**
 * Written as CONTIGUOUS literals with the marker spelled out, not composed
 * from `SYNTHETIC_RETENTION_MARKER` by interpolation. A template would be
 * emitted as a runtime expression, so no value below would appear contiguously
 * in any build — and the closure test that searches builds for them would
 * search for strings that exist nowhere and pass against nothing. The relation
 * each one is supposed to hold with the marker is asserted in that test
 * instead, so an edit to one line and not the other cannot go unnoticed.
 */
export const ACCOUNT_SYNTHETIC_BASIS =
  'SYNTHETIC-NO-LEGAL-EFFECT: local development fixture. This is NOT a legal opinion, NOT a reviewed retention determination, and NOT evidence of one. The financial-data retention decision has not been taken; this value exists so local runs and tests can exercise the gate that refuses when it has not been taken.';

export const ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE =
  'karar-ref:approval:SYNTHETIC-NO-LEGAL-EFFECT/local-fixture@v1';

export const ACCOUNT_SYNTHETIC_PACK_VERSION = 'synthetic-local/SYNTHETIC-NO-LEGAL-EFFECT';

/** Zero, deliberately. A plausible-looking period would be the one value here someone could copy into a deployment and believe. */
export const ACCOUNT_SYNTHETIC_PERIOD = 'P0D';

export const TRANSACTION_SYNTHETIC_BASIS =
  'karar-ref:fixture:transactions-retention-local-synthetic@v1 — SYNTHETIC FIXTURE, NO LEGAL EFFECT (SYNTHETIC-NO-LEGAL-EFFECT), not a legal determination, not a PolicyPack decision, and not an approval reference';

/** Short enough that nobody could mistake it for a considered legal answer, long enough for a local run. */
export const TRANSACTION_SYNTHETIC_PERIOD = 'P7D';
