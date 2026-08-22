/**
 * `CanonicalAccountAccessPort` — the one question this module asks about an
 * account, declared inward and satisfied by an adapter over
 * `@karar/financial-accounts`' public API.
 *
 * ## What it answers, and what it deliberately does not
 *
 * Three facts: does this account exist FOR THIS PRINCIPAL, what lifecycle
 * state is it in, and what currency is it held in. Nothing else — no display
 * name, no institution, no mask, no balance.
 *
 * The absences are the design. If this port could report an institution, an
 * account type or a wallet kind, then somewhere in this module a rule could
 * be written that matched a statement to an account on `institution + type +
 * currency`. That combination is precisely what a real person legitimately
 * duplicates — two current accounts at one bank in one currency, two credit
 * cards from one issuer — and a rule built on it silently files one account's
 * statement into another (ADR-0028). The port cannot express the question, so
 * the rule is unwritable rather than merely absent.
 *
 * The currency IS reported, and it is not an exception to that argument: it
 * is used to REFUSE a mismatch, never to select an account. A statement in a
 * currency the account is not held in is refused rather than converted, and
 * the port has to know the currency to refuse.
 *
 * ## Why the account is resolved at DRAFT and again at COMMIT
 *
 * An import can sit in review for days. In that time the account can be
 * archived, closed, or have its currency corrected — and committing 300
 * movements into an account somebody closed last week produces records the
 * person believes they stopped keeping. So `CommitStatementImport` re-asks
 * this port as one of its revalidations rather than trusting what
 * `StartStatementImport` recorded.
 */

import type { ImportsPrincipal } from '../principal.js';
import type { CanonicalAccountRef } from '../../domain/refs.js';

/**
 * The account lifecycle vocabulary, restated here rather than imported.
 *
 * Restating it is what keeps the boundary honest: the accounts module owns
 * these values, and this module names them in its own type so that a change
 * there surfaces as a compile error in the ADAPTER — the one file that knows
 * both vocabularies — instead of silently reaching a rule in this layer.
 */
export const ACCOUNT_LIFECYCLE_STATES = ['ACTIVE', 'ARCHIVED', 'CLOSED'] as const;
export type AccountLifecycleState = (typeof ACCOUNT_LIFECYCLE_STATES)[number];

/**
 * The states an import may write into.
 *
 * Only `ACTIVE`. Archived and closed are separate values rather than one "not
 * active" because they mean different things to a person: an archived account
 * is one they put away and can bring back, a closed one is finished. Neither
 * is a place to file a statement.
 */
export const WRITABLE_ACCOUNT_LIFECYCLE_STATES = [
  'ACTIVE',
] as const satisfies readonly AccountLifecycleState[];

export function isWritableLifecycleState(state: string): state is AccountLifecycleState {
  return (WRITABLE_ACCOUNT_LIFECYCLE_STATES as readonly string[]).includes(state);
}

export interface CanonicalAccountSummary {
  readonly accountRef: CanonicalAccountRef;
  /**
   * A raw string rather than the union, deliberately. A value the accounts
   * module adds later must arrive here as an unrecognised state that this
   * module refuses, not as a type error that stops the build or — worse — a
   * silent widening that lets an unreviewed state become writable.
   */
  readonly lifecycleState: string;
  readonly currencyCode: string;
}

export interface CanonicalAccountAccessPort {
  /**
   * The account, or `null` when it is not visible to this principal.
   *
   * `null` covers absent, another user's, another tenant's and never-minted,
   * indistinguishably. Anything else would turn a guessed identifier into a
   * membership test over somebody else's account inventory.
   */
  resolveOwnAccount(
    actor: ImportsPrincipal,
    accountRef: CanonicalAccountRef,
  ): Promise<CanonicalAccountSummary | null>;
}
