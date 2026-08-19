/**
 * LOCAL AND TEST ONLY — the synthetic retention decision.
 *
 * MODULE.md says the retention of every table in this module is unresolved,
 * that non-local ingestion fails closed until a PolicyPack decision exists,
 * and that LOCAL and TEST "use a synthetic fixture with no legal effect".
 * This is that fixture, and it is deliberately the only thing in this module
 * that can answer `DECIDED`.
 *
 * ## What it is not
 *
 * It does not substitute a duration for anywhere but a developer's own
 * machine. It does not touch `qa/v1` — the drafted Qatar pack carries every
 * retention slot as an explicit `PENDING_LEGAL_REVIEW`, and editing it here
 * to unblock a local run would be fabricating a legal answer in the one place
 * the repository has built to make that impossible. It mints no approval
 * reference: an approval is a legal act, evidenced by a reviewed pack version
 * with its basis, and a string invented by an adapter is not one.
 *
 * ## Why the environment is a constructor argument, and why it throws
 *
 * The guarantee that a no-legal-effect decision cannot govern real data has
 * to live somewhere structural. Putting it in the use case would mean the
 * application layer branching on the deployment environment, which is the
 * same shape as branching on jurisdiction (architecture test 12 forbids that
 * one) and erodes the same way. Putting it in a runtime check inside
 * `decide()` would mean a deployed process could hold a working fixture and
 * merely decline to use it.
 *
 * So it refuses to EXIST outside a local environment: constructing it in
 * dev, staging, or production throws before any composition completes, and
 * the failure is a startup failure with a name, not a wrong answer at
 * midnight. The environment arrives as an argument rather than being read
 * from `process.env` here, because configuration is resolved once at the
 * composition root (packages/platform config) and a module that reads the
 * environment directly is a module whose behaviour cannot be tested.
 *
 * TEST is not a separate environment token in this repository — the suites
 * run under `KARAR_ENV=local` — so `local` is the only value accepted, and
 * the vitest suites construct this fixture with it explicitly.
 *
 * ## What a deployed environment gets instead
 *
 * An adapter over the PolicyPack retention slot for the subject's
 * jurisdiction, wired by the composition root. Today every such slot is
 * `PENDING_LEGAL_REVIEW`, so `CreateManualTransaction` refuses in every
 * deployed environment — which is the correct behaviour and is stated as a
 * fact, not as a gap this module can close.
 */

import { createRequire } from 'node:module';

import type {
  TransactionRetentionDecision,
  TransactionRetentionDecisionPort,
} from '../../application/ports/transaction-retention-decision.js';
import { LOCAL_ENVIRONMENT } from './local-environment.js';

/**
 * The only environment this fixture may exist in — the module-wide token, not
 * a second opinion about what "local" means.
 */
export const FIXTURE_ENVIRONMENT = LOCAL_ENVIRONMENT;

/**
 * The fixture's self-description. It names itself a fixture in the basis
 * string as well as in the `effect` field, so that a decision copied into a
 * log line, an error message, or a support ticket still says what it is to
 * somebody who never opens this file.
 */
/**
 * The fixture package holds the synthetic VALUES; this file holds only the
 * machinery that refuses them outside local development.
 *
 * Resolved rather than imported: a static import would put the specifier in
 * this module's own import graph, and a production install — which does not
 * have the package — would fail to boot. See
 * `modules/consent/__tests__/production-closure.test.ts` for why a same-file
 * environment check was not enough on its own.
 */
export const LOCAL_FIXTURE_PACKAGE = '@karar/financial-retention-local-fixtures';

interface RetentionFixtureModule {
  readonly TRANSACTION_SYNTHETIC_BASIS: string;
  readonly TRANSACTION_SYNTHETIC_PERIOD: string;
}

function isRetentionFixtureModule(value: unknown): value is RetentionFixtureModule {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m['TRANSACTION_SYNTHETIC_BASIS'] === 'string' &&
    typeof m['TRANSACTION_SYNTHETIC_PERIOD'] === 'string'
  );
}

export class LocalRetentionFixtureMissingError extends Error {
  override readonly name = 'LocalRetentionFixtureMissingError';

  constructor() {
    super(
      `${LOCAL_FIXTURE_PACKAGE} is not installed. It is a devDependency held outside this module ` +
        'so that no production closure contains a synthetic retention answer. If this appears in ' +
        'local development, install workspace devDependencies; it must never appear anywhere else.',
    );
  }
}

function loadRetentionFixture(): RetentionFixtureModule {
  const requireFrom = createRequire(import.meta.url);
  let loaded: unknown;
  try {
    loaded = requireFrom(LOCAL_FIXTURE_PACKAGE);
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
    const notFound = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
    if (notFound && typeof message === 'string' && message.includes(LOCAL_FIXTURE_PACKAGE)) {
      throw new LocalRetentionFixtureMissingError();
    }
    throw error;
  }
  if (!isRetentionFixtureModule(loaded)) {
    throw new Error(
      `${LOCAL_FIXTURE_PACKAGE} is installed but does not export the synthetic retention values — ` +
        'a fixture package that cannot be read is a defect, not an absence, and is refused rather ' +
        'than silently degraded to a decision nobody took.',
    );
  }
  return loaded;
}

/**
 * The typed refusal both the constructor and the resolver raise. It was a bare
 * `Error`, which meant the only way to identify it was to match its message —
 * and a message is prose that gets reworded. The wording below is unchanged so
 * that existing assertions on it still hold; the name is what callers should
 * match on from here.
 */
export class LocalTransactionRetentionFixtureEnvironmentError extends Error {
  override readonly name = 'LocalTransactionRetentionFixtureEnvironmentError';

  constructor(readonly env: string) {
    super(
      `the synthetic transaction-retention fixture may only be constructed in the '${FIXTURE_ENVIRONMENT}' ` +
        `environment, not '${env}'. It carries no legal effect, and a deployed ` +
        'environment must resolve retention from a PolicyPack decision or refuse to write — ' +
        'substituting a duration is the fabricated legal answer this refusal exists to prevent ' +
        '(modules/transactions/MODULE.md)',
    );
  }
}

export class LocalSyntheticRetentionDecisionProvider implements TransactionRetentionDecisionPort {
  constructor(options: { readonly environment: string }) {
    if (options.environment !== FIXTURE_ENVIRONMENT) {
      throw new LocalTransactionRetentionFixtureEnvironmentError(String(options.environment));
    }
  }

  /**
   * The same answer for every principal — so the parameter is not declared
   * at all. A fixture that varied by subject would be modelling a
   * jurisdiction resolution it has not performed, and an ignored parameter
   * would suggest it might one day. The real adapter needs it; this does not.
   */
  decide(): Promise<TransactionRetentionDecision> {
    return Promise.resolve({
      state: 'DECIDED',
      retentionPeriod: loadRetentionFixture().TRANSACTION_SYNTHETIC_PERIOD,
      basis: loadRetentionFixture().TRANSACTION_SYNTHETIC_BASIS,
      effect: 'SYNTHETIC_NO_LEGAL_EFFECT',
    });
  }
}

/**
 * The single seam a composition root uses to obtain the port.
 *
 * `local` gets the labelled fixture. Every other environment must supply a
 * provider that reads a reviewed decision, and gets a throw when it does not.
 * There is deliberately no third branch: no default period, no "permissive
 * until launch" flag, and no reuse of the fixture.
 *
 * The fixture's constructor already refuses outside `local`, so this resolver
 * is not what makes the module safe. It exists so that the composition root
 * names a PORT rather than a class — every Phase 5 port arrives through a
 * resolver of this shape, and a reader checking that a surface fails closed
 * does not have to know which of the constructions happen to guard themselves.
 * `modules/financial-accounts`' `resolveRetentionDecisionPort` is the same
 * seam for the same reason.
 */
export function resolveTransactionRetentionDecisionPort(options: {
  readonly env: string;
  /** The deployment's PolicyPack-backed provider, when one is wired. */
  readonly approvedProvider?: TransactionRetentionDecisionPort | null;
}): TransactionRetentionDecisionPort {
  const approved = options.approvedProvider ?? null;
  if (approved !== null) return approved;
  if (options.env !== FIXTURE_ENVIRONMENT) {
    throw new LocalTransactionRetentionFixtureEnvironmentError(options.env);
  }
  return new LocalSyntheticRetentionDecisionProvider({ environment: options.env });
}
