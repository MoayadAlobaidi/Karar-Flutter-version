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
 * own text. `SYNTHETIC-NO-LEGAL-EFFECT` appears inside the basis and inside
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
 *   not engineering's to take. The local period is `P0D` — zero, meaningless,
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

import type {
  FinancialAccountRetentionDecisionPort,
  FinancialRetentionDecision,
  RetentionGovernedDataset,
} from '../../application/ports/financial-account-retention-decision.js';
import type { AccountsPrincipal } from '../../application/principal.js';

/** The marker that makes an escaped value self-identifying. */
export const SYNTHETIC_RETENTION_MARKER = 'SYNTHETIC-NO-LEGAL-EFFECT';

const SYNTHETIC_BASIS =
  `${SYNTHETIC_RETENTION_MARKER}: local development fixture. This is NOT a legal opinion, NOT a ` +
  'reviewed retention determination, and NOT evidence of one. The financial-data retention ' +
  'decision has not been taken; this value exists so local runs and tests can exercise the gate ' +
  'that refuses when it has not been taken.';

const SYNTHETIC_APPROVAL_REFERENCE =
  `karar-ref:approval:${SYNTHETIC_RETENTION_MARKER}/local-fixture@v1`;

const SYNTHETIC_PACK_VERSION = `synthetic-local/${SYNTHETIC_RETENTION_MARKER}`;

/**
 * Zero, deliberately. A plausible-looking period would be the one value in
 * this file someone could copy into a deployment and believe.
 */
const SYNTHETIC_PERIOD = 'P0D';

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
        packVersion: SYNTHETIC_PACK_VERSION,
      });
    }
    // The principal is ignored, and that is honest rather than lazy: a real
    // provider resolves the subject's jurisdiction and reads the pack bound to
    // it, and this fixture has no pack and no jurisdiction to resolve. It
    // takes the parameter so the seam is the real one.
    return Promise.resolve({
      state: 'DECIDED',
      dataset,
      retentionPeriod: SYNTHETIC_PERIOD,
      basis: SYNTHETIC_BASIS,
      approvalReference: SYNTHETIC_APPROVAL_REFERENCE,
      packVersion: SYNTHETIC_PACK_VERSION,
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
