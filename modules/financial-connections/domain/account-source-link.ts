/**
 * `AccountSourceLink` — which connection feeds which account, and on what
 * basis.
 *
 * ## The seam
 *
 * This is the relationship the Phase 5 redesign exists for. While the account
 * carried its own source, a CSV-created account that later received API data
 * had to become a SECOND account and the person's history split in two, with
 * nothing to tell them it had happened (ADR-0028). The relationship is
 * many-to-many in both directions and neither direction is optional: one
 * connection feeds many accounts (one uploaded statement covers the current
 * account and the credit card printed beneath it), and one account is fed by
 * many connections (typed, then imported into, then linked — one account
 * throughout).
 *
 * ## Linking: exact may, probable must ask
 *
 *   EXACT_EXTERNAL_REFERENCE  the incoming reference fingerprints identically
 *       to one this principal has already linked. That is the same source
 *       account, and the account it already resolves to is the answer — so it
 *       may link automatically.
 *   PROBABLE                  anything less: a similar name, a matching tail,
 *       a plausible currency. It may NOT link automatically. `confirm()`
 *       below is the only way a probable match becomes `LINKED`, it requires
 *       the instant the SUBJECT decided, and migration 0097 refuses the state
 *       without it by CHECK.
 *
 * The asymmetry is deliberate and it is not caution for its own sake. A wrong
 * automatic link merges two accounts that were never the same, or splits one
 * person's history across two; neither is visible to the person it happens
 * to, and neither is repairable from the outside once transactions have
 * accumulated on both sides.
 *
 * ## Two values that never leave
 *
 * `sourceAccountReference` is another party's identifier FOR this person, and
 * `fingerprint` is a keyed value with no meaning outside this platform.
 * Neither appears in `AccountSourceLinkView`, which is what every read path
 * returns; the entity holds them because persistence and equality need them,
 * and `HsfField` redacts the first on every accidental rendering path.
 */

import { CalendarDay, Result, TenantId, UserId } from '@karar/shared-kernel';

import type { FinancialConnectionRuleViolation } from './errors.js';
import { HsfField } from './hsf-field.js';
import {
  checkExternalReferenceShape,
  type ExternalReferenceScheme,
} from './external-account-reference.js';
import {
  mayBeAuthoritative,
  type ConnectionRail,
  type SourceAuthority,
  type SourceCapabilityObservation,
} from './rails.js';
import type {
  AccountSourceLinkId,
  CanonicalAccountRef,
  FinancialConnectionId,
} from './refs.js';

/**
 * HOW this link came to point at this account. Mirrors
 * `account_source_links_match_basis_check` in migration 0097.
 */
export const MATCH_BASES = ['EXACT_EXTERNAL_REFERENCE', 'PROBABLE'] as const;
export type MatchBasis = (typeof MATCH_BASES)[number];

export function isMatchBasis(value: string): value is MatchBasis {
  return (MATCH_BASES as readonly string[]).includes(value);
}

/**
 * Where a link stands.
 *
 *   PENDING_CONFIRMATION  a probable match awaiting the person's decision. It
 *                         feeds nothing.
 *   LINKED                the source feeds this account.
 *   DECLINED              the person said no. Kept, because a refusal is a
 *                         fact worth having: without it the same wrong
 *                         suggestion returns on every import.
 *   DORMANT               a linked source that has gone quiet. Still a link.
 */
export const SOURCE_LINK_STATUSES = [
  'PENDING_CONFIRMATION',
  'LINKED',
  'DECLINED',
  'DORMANT',
] as const;
export type SourceLinkStatus = (typeof SOURCE_LINK_STATUSES)[number];

export function isSourceLinkStatus(value: string): value is SourceLinkStatus {
  return (SOURCE_LINK_STATUSES as readonly string[]).includes(value);
}

/** The states in which a link actually maps a source account to an account. */
export const MAPPING_SOURCE_LINK_STATUSES: readonly SourceLinkStatus[] = Object.freeze([
  'PENDING_CONFIRMATION',
  'LINKED',
  'DORMANT',
]);

/**
 * An opaque equality value plus the definition that produced it.
 *
 * Declared in the domain because it is part of the entity; HOW it is derived
 * is `SourceAccountFingerprintPort`'s business and nothing here knows. The
 * only supported operation is equality against another value of the SAME
 * version — a value minted under a different definition is not a different
 * answer to the same question, it is an answer to a different question.
 */
export interface SourceAccountFingerprint {
  readonly version: string;
  /** Opaque. Never exposed to a client and never logged. */
  readonly value: string;
}

/** True when two fingerprints assert the same source account. */
export function fingerprintsMatch(
  left: SourceAccountFingerprint,
  right: SourceAccountFingerprint,
): boolean {
  return left.version === right.version && left.value === right.value;
}

/** A statement's coverage, as calendar days (ADR-0027). All or nothing. */
export interface HistoryCoverage {
  readonly start: CalendarDay;
  readonly end: CalendarDay;
}

/** What this platform has observed one source provide through one link. */
export interface SourceCapabilities {
  readonly balance: SourceCapabilityObservation;
  readonly pendingTransactions: SourceCapabilityObservation;
}

/** Everything this platform observed about one source link, as instants. */
export interface SourceObservationWindow {
  readonly firstObservedAt: Date;
  readonly lastObservedAt: Date;
  readonly lastSuccessfulImportAt: Date | null;
}

export interface AccountSourceLink {
  readonly id: AccountSourceLinkId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** The canonical account, as a raw reference — never another module's type. */
  readonly accountRef: CanonicalAccountRef;
  readonly connectionId: FinancialConnectionId;
  /**
   * The connection's rail, bound to it by the composite foreign key in
   * migration 0097 rather than copied. Present here so a rule that depends on
   * the rail — a device signal is never authoritative — is decidable without
   * a second read.
   */
  readonly connectionRail: ConnectionRail;
  readonly sourceAuthority: SourceAuthority;
  /**
   * The source's opaque name for this account. HSF; ciphertext at rest, and
   * NEVER returned by a read path — see `AccountSourceLinkView`.
   */
  readonly sourceAccountReference: HsfField;
  readonly referenceScheme: ExternalReferenceScheme;
  /** Keyed, per-subject, versioned. Never exposed, never logged. */
  readonly fingerprint: SourceAccountFingerprint;
  readonly matchBasis: MatchBasis;
  readonly status: SourceLinkStatus;
  /** When the SUBJECT confirmed. Never written by a rule or a default. */
  readonly subjectConfirmedAt: Date | null;
  /** Lower is stronger. Recorded here, applied nowhere in this module. */
  readonly sourcePriority: number;
  readonly observation: SourceObservationWindow;
  readonly historyCoverage: HistoryCoverage | null;
  readonly capabilities: SourceCapabilities;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/**
 * What a read path returns.
 *
 * **The two protected values are absent, and their absence is the guarantee.**
 * There is no `sourceAccountReference` and no `fingerprint` here: the first is
 * another party's identifier for this person and the second is a keyed value
 * that means nothing outside this platform, so exposing either would put back
 * on a client exactly what the two columns exist to keep off one. A test
 * asserts the absence at runtime over `Object.keys`, because a type that is
 * merely narrower is erased before anything ships.
 */
export interface AccountSourceLinkView {
  readonly id: AccountSourceLinkId;
  readonly accountRef: CanonicalAccountRef;
  readonly connectionId: FinancialConnectionId;
  readonly connectionRail: ConnectionRail;
  readonly sourceAuthority: SourceAuthority;
  readonly matchBasis: MatchBasis;
  readonly status: SourceLinkStatus;
  readonly subjectConfirmedAt: Date | null;
  readonly sourcePriority: number;
  readonly observation: SourceObservationWindow;
  readonly historyCoverage: HistoryCoverage | null;
  readonly capabilities: SourceCapabilities;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** The view of one link. Constructs the exact field set named above. */
export function toAccountSourceLinkView(link: AccountSourceLink): AccountSourceLinkView {
  return {
    id: link.id,
    accountRef: link.accountRef,
    connectionId: link.connectionId,
    connectionRail: link.connectionRail,
    sourceAuthority: link.sourceAuthority,
    matchBasis: link.matchBasis,
    status: link.status,
    subjectConfirmedAt: link.subjectConfirmedAt,
    sourcePriority: link.sourcePriority,
    observation: link.observation,
    historyCoverage: link.historyCoverage,
    capabilities: link.capabilities,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    version: link.version,
  };
}

/** The default priority. Mid-range, so a source can be moved either way. */
export const DEFAULT_SOURCE_PRIORITY = 100;
export const MIN_SOURCE_PRIORITY = 1;
export const MAX_SOURCE_PRIORITY = 1000;

/** Nothing observed yet — the honest default for both capabilities. */
export const NOTHING_OBSERVED: SourceCapabilities = Object.freeze({
  balance: 'NOT_OBSERVED' as const,
  pendingTransactions: 'NOT_OBSERVED' as const,
});

export interface NewAccountSourceLink {
  readonly id: AccountSourceLinkId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly accountRef: CanonicalAccountRef;
  readonly connectionId: FinancialConnectionId;
  readonly connectionRail: ConnectionRail;
  readonly sourceAuthority: SourceAuthority;
  /** Plaintext as the source supplied it; the shape rule runs before storage. */
  readonly sourceAccountReference: string;
  readonly referenceScheme: ExternalReferenceScheme;
  readonly fingerprint: SourceAccountFingerprint;
  readonly matchBasis: MatchBasis;
  readonly sourcePriority?: number;
  readonly observedAt: Date;
  readonly historyCoverage?: HistoryCoverage | null;
  readonly capabilities?: SourceCapabilities;
}

/**
 * Build a link, or say which rule refused it.
 *
 * **The status is this function's answer, never an input.** An exact match is
 * born `LINKED`; anything else is born `PENDING_CONFIRMATION` and feeds
 * nothing until the person says otherwise. Letting a caller pass the status
 * would make "link this automatically" one field away, which is the whole
 * decision this function exists to take away from callers.
 */
export function createAccountSourceLink(
  input: NewAccountSourceLink,
): Result<AccountSourceLink, FinancialConnectionRuleViolation> {
  const refusal = checkExternalReferenceShape(input.sourceAccountReference);
  if (refusal !== null) {
    return Result.err({
      kind: 'external_reference_not_storable',
      refusal,
      message: externalReferenceRefusalMessage(refusal),
    });
  }

  if (input.sourceAuthority === 'AUTHORITATIVE' && !mayBeAuthoritative(input.connectionRail)) {
    return Result.err({
      kind: 'authority_not_available_for_rail',
      rail: input.connectionRail,
      message:
        `a ${input.connectionRail} source is SUPPLEMENTAL and never AUTHORITATIVE (ADR-0028): a ` +
        'signal observed on the device of a person is evidence about that device, not a statement ' +
        'by an institution about their money. Migration 0097 refuses it by CHECK as well',
    });
  }

  const priority = input.sourcePriority ?? DEFAULT_SOURCE_PRIORITY;
  if (
    !Number.isInteger(priority) ||
    priority < MIN_SOURCE_PRIORITY ||
    priority > MAX_SOURCE_PRIORITY
  ) {
    return Result.err({
      kind: 'unknown_vocabulary_value',
      vocabulary: 'sourceAuthority',
      value: String(priority),
      message:
        `source priority must be an integer between ${MIN_SOURCE_PRIORITY} and ` +
        `${MAX_SOURCE_PRIORITY} (lower is stronger); it records which source WOULD win and this ` +
        'module resolves no conflict with it',
    });
  }

  const coverage = input.historyCoverage ?? null;
  if (coverage !== null && coverage.start.isAfter(coverage.end)) {
    return Result.err({
      kind: 'invalid_history_coverage',
      message:
        'a history coverage range that ends before it begins describes nothing; both ends are ' +
        'calendar days, so there is no timezone in which the order could be the other way ' +
        '(ADR-0027)',
    });
  }

  return Result.ok({
    id: input.id,
    tenantId: TenantId.of(TenantId.toString(input.tenantId)),
    userId: UserId.of(UserId.toString(input.userId)),
    accountRef: input.accountRef,
    connectionId: input.connectionId,
    connectionRail: input.connectionRail,
    sourceAuthority: input.sourceAuthority,
    sourceAccountReference: HsfField.of(input.sourceAccountReference.trim()),
    referenceScheme: input.referenceScheme,
    fingerprint: input.fingerprint,
    matchBasis: input.matchBasis,
    // The whole asymmetry, in one expression.
    status: input.matchBasis === 'EXACT_EXTERNAL_REFERENCE' ? 'LINKED' : 'PENDING_CONFIRMATION',
    subjectConfirmedAt: null,
    sourcePriority: priority,
    observation: {
      firstObservedAt: input.observedAt,
      lastObservedAt: input.observedAt,
      lastSuccessfulImportAt: null,
    },
    historyCoverage: coverage,
    capabilities: input.capabilities ?? NOTHING_OBSERVED,
    createdAt: input.observedAt,
    updatedAt: input.observedAt,
    version: 1,
  });
}

/** The refusal message for one shape rule. Never quotes the value. */
export function externalReferenceRefusalMessage(
  refusal: NonNullable<ReturnType<typeof checkExternalReferenceShape>>,
): string {
  const shared =
    'The value is deliberately not quoted here: a rejected account number is still an account ' +
    'number, and an error string that echoes the input is the shortest path to a plaintext log line';
  switch (refusal) {
    case 'blank':
      return `an external account reference is required and may not be blank. ${shared}`;
    case 'too_long':
      return `an external account reference is bounded and longer input is refused, never truncated. ${shared}`;
    case 'not_an_identifier_token':
      return (
        'an external account reference must be an identifier token — letters, digits and the ' +
        `separators . _ : - only. Prose, spaces and non-ASCII are refused so this column cannot ` +
        `become a place a statement line or an account holder's name is written. ${shared}`
      );
    case 'looks_like_an_iban':
      return (
        'that is shaped like an IBAN. An IBAN names a real account at a real bank and is enough ' +
        'to initiate a transfer in several schemes; this platform stores no IBAN under any ' +
        `framing, so hand over an opaque token instead. ${shared}`
      );
    case 'looks_like_an_account_or_card_or_phone_number':
      return (
        'that carries a run of eight or more consecutive digits, which is the shape of an account ' +
        'number, a card number or a wallet phone number. This platform stores none of them; a ' +
        `hashed or prefixed token costs the source nothing and costs the subject nothing. ${shared}`
      );
  }
}

/**
 * Record the subject's confirmation of a probable match.
 *
 * The instant is the SUBJECT's decision, supplied by the caller from a clock —
 * not defaulted, not inferred from `now()` inside a repository, and never
 * written by a rule. A confirmation nobody made is the one value in this
 * entity that would make an automatic link look like a decided one.
 */
export function confirmSourceLink(
  link: AccountSourceLink,
  confirmedAt: Date,
): Result<AccountSourceLink, FinancialConnectionRuleViolation> {
  if (link.status === 'LINKED' || link.status === 'DORMANT') {
    // Already settled. Idempotent rather than an error: a caller that retries
    // a confirmation is not making a second decision.
    return Result.ok(link);
  }
  return Result.ok({
    ...link,
    status: 'LINKED',
    subjectConfirmedAt: confirmedAt,
    updatedAt: confirmedAt,
    version: link.version + 1,
  });
}

/** Record that the subject refused a probable match. */
export function declineSourceLink(
  link: AccountSourceLink,
  declinedAt: Date,
): Result<AccountSourceLink, FinancialConnectionRuleViolation> {
  if (link.status === 'LINKED' || link.status === 'DORMANT') {
    return Result.err({
      kind: 'settled_link_not_repointable',
      message:
        'this link is settled: the source already feeds this account, so declining it now would ' +
        'orphan every fact that arrived through it. Removing a source that is in use is a ' +
        'different operation with its own answer about what happens to what it delivered',
    });
  }
  return Result.ok({
    ...link,
    status: 'DECLINED',
    subjectConfirmedAt: null,
    updatedAt: declinedAt,
    version: link.version + 1,
  });
}

/** What one observation may move. Identity and the account are absent. */
export interface SourceObservation {
  readonly observedAt: Date;
  readonly successfulImportAt?: Date | null;
  readonly historyCoverage?: HistoryCoverage | null;
  readonly capabilities?: Partial<SourceCapabilities>;
}

/**
 * Fold one observation into a link.
 *
 * Nothing here changes which account the link points at, which source account
 * it is about, or whether it is confirmed. An observation is a report that
 * the source was seen — it is not a decision, and a code path where "we heard
 * from the source" can promote a pending match to a linked one is exactly how
 * a probable match becomes automatic without anyone deciding to allow it.
 */
export function recordSourceObservation(
  link: AccountSourceLink,
  observation: SourceObservation,
): Result<AccountSourceLink, FinancialConnectionRuleViolation> {
  if (observation.observedAt.getTime() < link.observation.firstObservedAt.getTime()) {
    return Result.err({
      kind: 'invalid_observation_window',
      message:
        'an observation cannot predate the first time this source was seen: the window records ' +
        'what this platform actually observed, and a first observation that moves backwards is a ' +
        'clock problem rather than a fact about the source',
    });
  }

  const coverage =
    observation.historyCoverage === undefined
      ? link.historyCoverage
      : observation.historyCoverage;
  if (coverage !== null && coverage.start.isAfter(coverage.end)) {
    return Result.err({
      kind: 'invalid_history_coverage',
      message: 'a history coverage range that ends before it begins describes nothing',
    });
  }

  return Result.ok({
    ...link,
    observation: {
      firstObservedAt: link.observation.firstObservedAt,
      lastObservedAt: observation.observedAt,
      lastSuccessfulImportAt:
        observation.successfulImportAt === undefined
          ? link.observation.lastSuccessfulImportAt
          : observation.successfulImportAt,
    },
    historyCoverage: coverage,
    capabilities: {
      balance: observation.capabilities?.balance ?? link.capabilities.balance,
      pendingTransactions:
        observation.capabilities?.pendingTransactions ?? link.capabilities.pendingTransactions,
    },
    updatedAt: observation.observedAt,
    version: link.version + 1,
  });
}
