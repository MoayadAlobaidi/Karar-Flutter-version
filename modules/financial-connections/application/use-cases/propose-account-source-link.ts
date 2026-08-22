/**
 * ProposeAccountSourceLink — a source reports an account, and this use case
 * decides on what basis it may be attached.
 *
 * ## The decision, in full
 *
 * 1. Compute the keyed, per-subject fingerprint of the external reference.
 * 2. Look for links this principal already holds for that fingerprint,
 *    **across every connection they have** — that scope is the whole point.
 * 3. If a non-declined one exists:
 *      * pointing at the same account the caller named, or the caller named
 *        no account: this is an **EXACT external-reference match**. It links
 *        automatically, to the account the source already resolves to. This
 *        is the path by which a CSV-created account later receives API data
 *        WITHOUT becoming a second account (ADR-0028).
 *      * pointing at a DIFFERENT account from the one the caller named: refuse.
 *        One source account maps to at most one canonical account, and the
 *        alternative splits one person's history in two with nothing to tell
 *        them it happened.
 * 4. If none exists, the caller must name a candidate account, and the result
 *    is a **PROBABLE match** in `PENDING_CONFIRMATION`. It feeds nothing.
 *    `ConfirmProbableSourceLink` is the only way it becomes a link, and it
 *    records the instant the SUBJECT decided.
 *
 * **Step 4 is the one that is easy to get wrong and expensive to fix.** A
 * similar name, a matching four-digit tail, a plausible currency and a
 * plausible balance are exactly the evidence a heuristic would treat as
 * sufficient — and exactly the evidence that is wrong when a person holds two
 * current accounts at one bank in one currency, which is ordinary. So no
 * probable match is ever auto-linked here, and the database refuses the state
 * too (`account_source_links_probable_requires_confirmation`).
 *
 * ## Why this use case never merges on institution, type or currency
 *
 * It cannot: it never sees any of them. `CanonicalAccountAccessPort` returns
 * an account's existence and lifecycle state and nothing else, and the link
 * table carries no institution, account-type or currency column. The
 * combination people legitimately duplicate is not merely unused here, it is
 * unavailable.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  createAccountSourceLink,
  toAccountSourceLinkView,
  type AccountSourceLink,
  type AccountSourceLinkView,
  type HistoryCoverage,
  type MatchBasis,
} from '../../domain/account-source-link.js';
import {
  checkExternalReferenceShape,
  normalizeExternalReference,
  type ExternalReferenceScheme,
} from '../../domain/external-account-reference.js';
import { externalReferenceRefusalMessage } from '../../domain/account-source-link.js';
import { acceptsSubjectSuppliedData } from '../../domain/financial-connection.js';
import type { SourceAuthority } from '../../domain/rails.js';
import {
  CanonicalAccountRef,
  type AccountSourceLinkId,
  type FinancialConnectionId,
} from '../../domain/refs.js';
import {
  ACCOUNT_NOT_FOUND,
  CONNECTION_NOT_FOUND,
  accountAccessUnavailable,
  fingerprintUnavailable,
  retentionUnresolved,
  storeFailure,
  type ProposeAccountSourceLinkError,
} from '../errors.js';
import type { AccountSourceLinkRepository } from '../ports/account-source-link-repository.js';
import {
  isLinkableLifecycleState,
  type CanonicalAccountAccessPort,
} from '../ports/canonical-account-access.js';
import {
  permitsDurableWrite,
  type FinancialConnectionRetentionDecisionPort,
} from '../ports/financial-connection-retention-decision.js';
import type { FinancialConnectionRepository } from '../ports/financial-connection-repository.js';
import type { IdSource } from '../ports/id-source.js';
import type { SourceAccountFingerprintPort } from '../ports/source-account-fingerprint.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

export interface ProposeAccountSourceLinkInput {
  readonly connectionId: FinancialConnectionId;
  /**
   * The account the caller believes this source account is. **Optional, and
   * only optional because an exact match already knows the answer**: when the
   * fingerprint matches a link this principal already holds, the account it
   * resolves to is the account, and a caller naming a different one is
   * refused rather than obeyed.
   */
  readonly candidateAccountId?: string | null;
  /** The source's own opaque name for the account, as it supplied it. */
  readonly externalAccountReference: string;
  readonly referenceScheme?: ExternalReferenceScheme;
  readonly sourceAuthority?: SourceAuthority;
  readonly sourcePriority?: number;
  readonly historyCoverage?: HistoryCoverage | null;
}

/** What the proposal produced, and on what basis. */
export interface ProposedSourceLink {
  readonly link: AccountSourceLinkView;
  readonly matchBasis: MatchBasis;
  /**
   * True when this proposal resolved to an account the caller did not name,
   * because an exact match already knew it. The caller shows the person which
   * account their data will land in rather than assuming they know.
   */
  readonly resolvedFromExistingLink: boolean;
}

export class ProposeAccountSourceLink {
  constructor(
    private readonly links: AccountSourceLinkRepository,
    private readonly connections: FinancialConnectionRepository,
    private readonly accounts: CanonicalAccountAccessPort,
    private readonly fingerprints: SourceAccountFingerprintPort,
    private readonly retention: FinancialConnectionRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ProposeAccountSourceLinkInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<ProposedSourceLink, ProposeAccountSourceLinkError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    // The retention gate first, for the reason CreateManualConnection states:
    // a refusal must leave no ciphertext, no key usage, and no row behind.
    let decision;
    try {
      decision = await this.retention.decideFor(principal.value, 'account_source_links');
    } catch (error) {
      return Result.err(storeFailure('retention decision resolution', error));
    }
    if (!permitsDurableWrite(decision)) {
      return Result.err(retentionUnresolved('account_source_links', decision));
    }

    // The shape rule runs before the reference is normalised, hashed, or
    // encrypted: a value that is actually an IBAN must never reach a key.
    const refusal = checkExternalReferenceShape(input.externalAccountReference);
    if (refusal !== null) {
      return Result.err({
        kind: 'rule_violated',
        violation: {
          kind: 'external_reference_not_storable',
          refusal,
          message: externalReferenceRefusalMessage(refusal),
        },
        message: externalReferenceRefusalMessage(refusal),
      });
    }

    let connection;
    try {
      connection = await this.connections.findOwnById(principal.value, input.connectionId);
    } catch (error) {
      return Result.err(storeFailure('connection read', error));
    }
    if (connection === null) return Result.err(CONNECTION_NOT_FOUND);
    if (!acceptsSubjectSuppliedData(connection)) {
      return Result.err({
        kind: 'connection_not_usable',
        status: connection.status,
        message:
          `this connection is ${connection.status}, so no source may be attached through it. ` +
          'Attaching a route to a connection the person has retired or that is unavailable would ' +
          'mean data arriving through something they believe is switched off',
      });
    }

    const scheme: ExternalReferenceScheme = input.referenceScheme ?? 'SOURCE_ACCOUNT_REFERENCE';
    let fingerprint;
    try {
      fingerprint = await this.fingerprints.fingerprint(principal.value, {
        scheme,
        normalizedReference: normalizeExternalReference(input.externalAccountReference),
      });
    } catch (error) {
      return Result.err(fingerprintUnavailable(error));
    }

    let existing: readonly AccountSourceLink[];
    try {
      existing = await this.links.findOwnByFingerprint(principal.value, fingerprint);
    } catch (error) {
      return Result.err(storeFailure('source link lookup by fingerprint', error));
    }

    // Declined links are history, not mappings: a person may refuse a match
    // against one account and later accept one against another.
    const mapped = existing.filter((link) => link.status !== 'DECLINED');
    const alreadyMappedAccount = mapped[0]?.accountRef.accountId ?? null;

    let matchBasis: MatchBasis;
    let accountId: string;
    let resolvedFromExistingLink = false;

    if (alreadyMappedAccount !== null) {
      const named = input.candidateAccountId ?? null;
      if (named !== null && named.toLowerCase() !== alreadyMappedAccount) {
        return Result.err({
          kind: 'source_account_already_linked_elsewhere',
          linkedAccountId: alreadyMappedAccount,
          message:
            'this source account is already linked to another of your accounts, so it may not ' +
            'also be linked to the one named here. One source account maps to at most one ' +
            'account: two would split one history in two, and the person it happened to would ' +
            'have no way to see it (ADR-0028). The database refuses it as well',
        });
      }
      matchBasis = 'EXACT_EXTERNAL_REFERENCE';
      accountId = alreadyMappedAccount;
      resolvedFromExistingLink = named === null;
    } else {
      const named = input.candidateAccountId ?? null;
      if (named === null) {
        // No prior link and no candidate: there is nothing to propose. Not a
        // rule violation — the caller simply has not said which account this
        // might be, and guessing is exactly what this module refuses to do.
        return Result.err(ACCOUNT_NOT_FOUND);
      }
      matchBasis = 'PROBABLE';
      accountId = named;
    }

    // Visibility is re-checked even on the exact-match path, and deliberately:
    // an account may have been archived or deleted since the earlier link was
    // written, and inheriting a stale answer would attach a live route to an
    // account the person has put away.
    const accountRef = CanonicalAccountRef.of(accountId);
    let summary;
    try {
      summary = await this.accounts.resolveOwnAccount(principal.value, accountRef);
    } catch (error) {
      return Result.err(accountAccessUnavailable(error));
    }
    if (summary === null) return Result.err(ACCOUNT_NOT_FOUND);
    if (!isLinkableLifecycleState(summary.lifecycleState)) {
      return Result.err({
        kind: 'account_not_linkable',
        lifecycleState: summary.lifecycleState,
        message:
          `this account is ${summary.lifecycleState}, so no data source may be attached to it. ` +
          'A live route into an account the person has put away would resurrect it on the next ' +
          'import, and they would discover that from a figure moving rather than from anything ' +
          'they did',
      });
    }

    const now = this.clock.now();
    const built = createAccountSourceLink({
      id: this.ids.nextId() as AccountSourceLinkId,
      tenantId: principal.value.tenantId,
      userId: principal.value.userId,
      accountRef,
      connectionId: connection.id,
      connectionRail: connection.rail,
      sourceAuthority: input.sourceAuthority ?? 'UNVERIFIED',
      sourceAccountReference: input.externalAccountReference,
      referenceScheme: scheme,
      fingerprint,
      matchBasis,
      ...(input.sourcePriority !== undefined ? { sourcePriority: input.sourcePriority } : {}),
      observedAt: now,
      ...(input.historyCoverage !== undefined
        ? { historyCoverage: input.historyCoverage }
        : {}),
    });
    if (!built.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: built.error,
        message: built.error.message,
      });
    }

    let outcome;
    try {
      outcome = await this.links.create(principal.value, built.value);
    } catch (error) {
      return Result.err(storeFailure('account source link creation', error));
    }

    if (outcome.kind === 'conflicting_account') {
      // The cross-connection guard fired inside the write — the case where
      // another writer linked this source account elsewhere between the
      // lookup above and this insert.
      return Result.err({
        kind: 'source_account_already_linked_elsewhere',
        linkedAccountId: outcome.linkedAccountId,
        message:
          'this source account became linked to another of your accounts while this request was ' +
          'in flight, so it was not linked here. One source account maps to at most one account',
      });
    }
    if (outcome.kind === 'duplicate') {
      // The unique constraint fired: this connection already has a link for
      // this source account. That is the ordinary outcome of re-importing the
      // same statement, so the existing link is the answer rather than an
      // error.
      let again: readonly AccountSourceLink[];
      try {
        again = await this.links.findOwnByFingerprint(principal.value, fingerprint);
      } catch (error) {
        return Result.err(storeFailure('source link re-read after duplicate', error));
      }
      const settled = again.find((link) => link.connectionId === connection.id);
      if (settled === undefined) return Result.err(storeFailure('source link re-read', null));
      return Result.ok({
        link: toAccountSourceLinkView(settled),
        matchBasis: settled.matchBasis,
        resolvedFromExistingLink: true,
      });
    }

    return Result.ok({
      link: toAccountSourceLinkView(outcome.link),
      matchBasis,
      resolvedFromExistingLink,
    });
  }
}
