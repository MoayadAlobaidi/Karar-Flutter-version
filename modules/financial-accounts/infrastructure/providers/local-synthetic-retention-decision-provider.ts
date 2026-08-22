/**
 * The LOCAL/TEST retention fixture, and the seam every other environment
 * passes through.
 *
 * ## What this fixture is
 *
 * A synthetic answer that lets local development and the test suite create
 * accounts and balances, labelled at every point where a human or a grep
 * might see it as having **no legal effect whatsoever**. The strings below
 * are not a period, a basis, or an approval: they are placeholders shaped
 * like the real thing so the gate can be exercised, and they say so in their
 * own text. The fixture marker appears inside the basis and inside
 * the approval reference, so a value that ever escaped into a record, a log,
 * or an export announces what it is instead of passing for evidence.
 *
 * ## How it is kept out of a deployed closure
 *
 * Three independent mechanisms, because one is a convention and two is a
 * habit:
 *
 * 1. **The constructor throws outside `KARAR_ENV=local`.** Same posture as
 *    the platform's `LocalDevEncryptionProvider` and this module's local
 *    encryption adapter. Constructing it in staging is an immediate boot
 *    failure, not a subtle one.
 * 2. **`resolveRetentionDecisionPort` refuses to substitute it.** A non-local
 *    environment that supplies no approved provider gets a throw, never a
 *    fallback — so "we forgot to wire retention" cannot present as "retention
 *    is fine".
 * 3. **The fixture answers `PENDING_LEGAL_REVIEW` for any environment string
 *    it does not recognise**, so even a hypothetical instance that somehow
 *    survived (1) and (2) denies rather than permits. Fail closed twice over.
 *
 * ## What is deliberately NOT here
 *
 * - **No hardcoded duration for a deployed environment.** Writing "P7Y" into
 *   a non-local branch would be engineering taking a legal decision, which is
 *   not engineering's to take. The local period is zero — meaningless,
 *   and impossible to mistake for a considered answer.
 * - **No change to `qa/v1`.** The real Qatar pack is DRAFT and
 *   PENDING_LEGAL_REVIEW and decides nothing
 *   (`packages/jurisdiction-policy/src/packs/qa-v1.ts`). Editing it to unblock
 *   a write would forge the decision rather than obtain it, and this file
 *   neither imports it nor touches it.
 * - **No minted approval reference.** Absence of evidence means not approved
 *   (`packages/jurisdiction-policy/src/lifecycle.ts`); the only reference
 *   this file produces is one that names itself synthetic.
 * - **No real financial figures, institutions, or subjects.** There is no
 *   data here at all beyond the labels.
 */

import { createRequire } from 'node:module';

import type {
  FinancialAccountRetentionDecisionPort,
  FinancialRetentionDecision,
  RetentionGovernedDataset,
} from '../../application/ports/financial-account-retention-decision.js';
import type { AccountsPrincipal } from '../../application/principal.js';

/** The marker that makes an escaped value self-identifying. */
/**
 * The fixture package holds the synthetic VALUES; this file holds only the
 * machinery that refuses them outside local development.
 *
 * They are resolved rather than imported. A static import would put the
 * specifier in this module's own import graph, and a production install — which
 * does not have the package — would fail to boot. `createRequire` resolves from
 * THIS file, so the lookup walks this module's own `node_modules`, where the
 * devDependency is linked in a development install and where nothing is linked
 * in a production one. `modules/consent` established the pattern and its
 * `production-closure.test.ts` records why a same-file environment check was
 * not enough on its own: the values shipped regardless of the guard.
 */
export const LOCAL_FIXTURE_PACKAGE = '@karar/financial-retention-local-fixtures';

interface RetentionFixtureModule {
  readonly SYNTHETIC_RETENTION_MARKER: string;
  readonly ACCOUNT_SYNTHETIC_BASIS: string;
  readonly ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE: string;
  readonly ACCOUNT_SYNTHETIC_PACK_VERSION: string;
  readonly ACCOUNT_SYNTHETIC_PERIOD: string;
}

function isRetentionFixtureModule(value: unknown): value is RetentionFixtureModule {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m['SYNTHETIC_RETENTION_MARKER'] === 'string' &&
    typeof m['ACCOUNT_SYNTHETIC_BASIS'] === 'string' &&
    typeof m['ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE'] === 'string' &&
    typeof m['ACCOUNT_SYNTHETIC_PACK_VERSION'] === 'string' &&
    typeof m['ACCOUNT_SYNTHETIC_PERIOD'] === 'string'
  );
}

/**
 * Loaded on demand, and never cached as "absent": a fixture that is missing is
 * the production case and must stay an error at the point of use, not a value
 * this module quietly carries.
 */
function loadRetentionFixture(): RetentionFixtureModule {
  const requireFrom = createRequire(import.meta.url);
  let loaded: unknown;
  try {
    loaded = requireFrom(LOCAL_FIXTURE_PACKAGE);
  } catch (error) {
    const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
    const notFound = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
    // The specifier must be OURS. A fixture package that is installed but whose
    // own imports do not resolve is broken, not absent, and fails loudly.
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

export class LocalRetentionFixtureMissingError extends Error {
  override readonly name = 'LocalRetentionFixtureMissingError';

  constructor() {
    super(
      `${LOCAL_FIXTURE_PACKAGE} is not installed. It is a devDependency held outside this module ` +
        'so that no production closure contains a fabricated approval reference. If this appears ' +
        'in local development, install workspace devDependencies; it must never appear anywhere else.',
    );
  }
}

export class LocalRetentionFixtureEnvironmentError extends Error {
  override readonly name = 'LocalRetentionFixtureEnvironmentError';

  constructor(env: string) {
    super(
      `LocalSyntheticRetentionDecisionProvider is local-development-only and refuses to exist in ` +
        `KARAR_ENV='${env}' — it is a labelled fixture with no legal effect, and a deployment that ` +
        `used it would be recording real subjects' financial data under a decision nobody took. ` +
        `Wire a provider that reads an approved policy pack, or leave durable creation refusing`,
    );
  }
}

export class LocalSyntheticRetentionDecisionProvider
  implements FinancialAccountRetentionDecisionPort
{
  readonly #env: string;

  constructor(options: { readonly env: string }) {
    if (options.env !== 'local') {
      throw new LocalRetentionFixtureEnvironmentError(options.env);
    }
    this.#env = options.env;
  }

  decideFor(
    _actor: AccountsPrincipal,
    dataset: RetentionGovernedDataset,
  ): Promise<FinancialRetentionDecision> {
    // Mechanism three: even holding an instance, a non-local environment is
    // denied. The constructor already made this unreachable; it is written
    // anyway, because "unreachable" is a property of today's call graph.
    if (this.#env !== 'local') {
      return Promise.resolve({
        state: 'PENDING_LEGAL_REVIEW',
        dataset,
        reason:
          'the local retention fixture has no legal effect and does not answer outside local ' +
          'development; the financial-data retention decision remains with legal review',
        packVersion: loadRetentionFixture().ACCOUNT_SYNTHETIC_PACK_VERSION,
      });
    }
    const fixture = loadRetentionFixture();
    // The principal is ignored, and that is honest rather than lazy: a real
    // provider resolves the subject's jurisdiction and reads the pack bound to
    // it, and this fixture has no pack and no jurisdiction to resolve. It
    // takes the parameter so the seam is the real one.
    return Promise.resolve({
      state: 'DECIDED',
      dataset,
      retentionPeriod: fixture.ACCOUNT_SYNTHETIC_PERIOD,
      basis: fixture.ACCOUNT_SYNTHETIC_BASIS,
      approvalReference: fixture.ACCOUNT_SYNTHETIC_APPROVAL_REFERENCE,
      packVersion: fixture.ACCOUNT_SYNTHETIC_PACK_VERSION,
    });
  }
}

/**
 * The single seam a composition root uses to obtain the port.
 *
 * `local` gets the labelled fixture. Every other environment must supply a
 * provider that reads a reviewed decision, and gets a throw when it does not.
 * There is deliberately no third branch: no default period, no "permissive
 * until launch" flag, and no reuse of the fixture. A deployment with no
 * retention provider does not create durable financial records, which is
 * exactly what this module's data-lifecycle declaration has always said.
 */
export function resolveRetentionDecisionPort(options: {
  readonly env: string;
  readonly approvedProvider?: FinancialAccountRetentionDecisionPort | null;
}): FinancialAccountRetentionDecisionPort {
  const approved = options.approvedProvider ?? null;
  if (approved !== null) return approved;
  if (options.env !== 'local') {
    throw new LocalRetentionFixtureEnvironmentError(options.env);
  }
  return new LocalSyntheticRetentionDecisionProvider({ env: options.env });
}
