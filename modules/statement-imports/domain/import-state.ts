/**
 * The import lifecycle, as a closed vocabulary and an explicit list of legal
 * moves.
 *
 * ```
 * DRAFT ─► SOURCE_STORED ─► PARSING ─► REVIEW_REQUIRED ─► COMMITTING ─► COMMITTED
 *   │           │              │              │               │
 *   └► REJECTED │              └► FAILED      └► REJECTED     ├► FAILED
 *               ├► DUPLICATE                                  └► REVIEW_REQUIRED
 *               └► REJECTED
 *   every settled state ─► ERASED   (not COMMITTING: see below)
 * ```
 *
 * ## Why the legal moves are a LIST and not a rule
 *
 * The obvious implementation is an ordering — "a state may only advance" —
 * and it is wrong here, because the transitions that must be impossible are
 * not backwards ones. `PARSING → COMMITTED` advances. So does
 * `SOURCE_STORED → COMMITTING`. Both skip `REVIEW_REQUIRED`, which is to say
 * both write a person's financial records from a file nobody read. An
 * ordering rule permits exactly the failure this module exists to prevent, so
 * the permitted pairs are enumerated and everything else is refused.
 *
 * ## Why the same list exists in the database
 *
 * `statement_imports_guard` (migration 0100) carries the identical pair list
 * and raises SQLSTATE `KAR51`. That is duplication, and it is deliberate: the
 * claim being made is "no canonical transaction is written before review",
 * which is a claim about ORDERING. An ordering claim enforced only in a use
 * case is a claim about the code path somebody happened to take — it says
 * nothing about a fixture, a backfill, a repair script, or an ingestion path
 * written later by someone who never opened this file. The two lists are
 * asserted equal by test rather than left to agree by habit.
 *
 * ## Why COMMITTING → REVIEW_REQUIRED is legal
 *
 * A commit that failed leaves NO SUBSET (see `CommitStatementImport`): the
 * whole database transaction rolled back, so the staged rows are exactly what
 * the person reviewed. Sending the import back to `REVIEW_REQUIRED` is
 * therefore the truthful state rather than a convenience — the alternative is
 * an import permanently stuck in `COMMITTING` describing work that is not in
 * progress.
 *
 * ## Why PARSING → PARSING is not a transition
 *
 * A retried parse re-enters from `SOURCE_STORED`, replacing the staged rows
 * rather than adding to them. That is what makes a retry idempotent instead
 * of cumulative: two parses of one file produce one set of rows, not two.
 * `beginParse` is the only way into `PARSING` and it accepts only
 * `SOURCE_STORED`, so a second parse cannot start while one is running
 * without the first one's row set being discarded first.
 *
 * ## ERASED is reachable from every settled state, including COMMITTED
 *
 * The single exception is `COMMITTING`, and it is not an oversight: a commit
 * in flight is a database transaction that is still running, and erasing the
 * import out from under it would race the write it is making. The commit
 * settles first — to `COMMITTED`, to `FAILED`, or back to `REVIEW_REQUIRED` —
 * and every one of those may then be erased.
 *
 * Erasing an import removes the staged statement — the encrypted source, the
 * rows, the errors. It does NOT remove the financial records a committed
 * import produced: those are the subject's own records and they survive the
 * file that carried them, exactly as a transaction survives the connection it
 * arrived through (ADR-0028).
 *
 * Pure: no clock, no randomness, no I/O.
 */

export const IMPORT_STATES = [
  /** The person has chosen an account. Nothing durable about the file exists. */
  'DRAFT',
  /** The encrypted source is stored, and retention was decided before it was. */
  'SOURCE_STORED',
  /** The parser is running. The only state in which staged rows may be written. */
  'PARSING',
  /** Parsed and staged. The person has not decided anything yet. */
  'REVIEW_REQUIRED',
  /** The subject said commit; the atomic write is in progress. */
  'COMMITTING',
  /** The rows became canonical transactions. Terminal. */
  'COMMITTED',
  /** The subject said no. Terminal. */
  'REJECTED',
  /** Something refused: a limit, a checksum, a currency, a deadline. Terminal. */
  'FAILED',
  /** This exact file was already imported for this subject. Terminal. */
  'DUPLICATE',
  /** The staged statement has been removed. Terminal. */
  'ERASED',
] as const;

export type ImportState = (typeof IMPORT_STATES)[number];

export function isImportState(value: string): value is ImportState {
  return (IMPORT_STATES as readonly string[]).includes(value);
}

/**
 * Terminal states. `COMMITTED` is terminal too: the import is finished and
 * the financial records exist. It can still be erased, which is the one move
 * every terminal state permits.
 */
export const TERMINAL_IMPORT_STATES = [
  'COMMITTED',
  'REJECTED',
  'FAILED',
  'DUPLICATE',
  'ERASED',
] as const satisfies readonly ImportState[];

export function isTerminalImportState(state: ImportState): boolean {
  return (TERMINAL_IMPORT_STATES as readonly ImportState[]).includes(state);
}

/**
 * Every legal move, as `from -> to`. The single source of truth in TypeScript;
 * the database carries the identical list and a test asserts they match.
 */
export const LEGAL_IMPORT_TRANSITIONS: Readonly<Record<ImportState, readonly ImportState[]>> =
  Object.freeze({
    DRAFT: Object.freeze(['SOURCE_STORED', 'REJECTED', 'FAILED', 'ERASED'] as const),
    SOURCE_STORED: Object.freeze([
      'PARSING',
      'DUPLICATE',
      'REJECTED',
      'FAILED',
      'ERASED',
    ] as const),
    PARSING: Object.freeze([
      'REVIEW_REQUIRED',
      'DUPLICATE',
      'FAILED',
      'REJECTED',
      'ERASED',
    ] as const),
    REVIEW_REQUIRED: Object.freeze(['COMMITTING', 'REJECTED', 'FAILED', 'ERASED'] as const),
    COMMITTING: Object.freeze(['COMMITTED', 'FAILED', 'REVIEW_REQUIRED'] as const),
    COMMITTED: Object.freeze(['ERASED'] as const),
    REJECTED: Object.freeze(['ERASED'] as const),
    FAILED: Object.freeze(['ERASED'] as const),
    DUPLICATE: Object.freeze(['ERASED'] as const),
    ERASED: Object.freeze([] as const),
  });

/**
 * The states in which a canonical transaction may already exist for this
 * import. Every other state asserts `committedTransactionCount === 0`, and
 * migration 0100 carries the same rule as a CHECK.
 */
export const STATES_THAT_MAY_HAVE_COMMITTED = [
  'COMMITTING',
  'COMMITTED',
] as const satisfies readonly ImportState[];

export function mayHaveCommittedTransactions(state: ImportState): boolean {
  return (STATES_THAT_MAY_HAVE_COMMITTED as readonly ImportState[]).includes(state);
}

/**
 * Whether `to` may follow `from`.
 *
 * A state may never transition to itself: re-entering a state is either a
 * no-op the caller should not be issuing, or a second run of work the first
 * entry already started. Both are bugs worth surfacing rather than absorbing.
 */
export function isLegalTransition(from: ImportState, to: ImportState): boolean {
  return LEGAL_IMPORT_TRANSITIONS[from].includes(to);
}

/**
 * `null` when the move is legal, otherwise the sentence explaining why not.
 *
 * A message rather than a boolean at the call sites that report to a person,
 * because "you cannot do that" without a reason is the shape of refusal that
 * makes people retry the same thing.
 */
export function checkTransition(from: ImportState, to: ImportState): string | null {
  if (isLegalTransition(from, to)) return null;
  if (from === to) {
    return (
      `a statement import may not transition from ${from} to itself: re-entering a state is ` +
      'either a call that should not have been made or a second run of work the first entry ' +
      'already started, and absorbing it silently hides both'
    );
  }
  if (isTerminalImportState(from) && to !== 'ERASED') {
    return (
      `a statement import in ${from} is finished; the only move left is ERASED. ` +
      'Re-opening a settled import would change what a person was told had happened'
    );
  }
  return (
    `a statement import may not move from ${from} to ${to}: the lifecycle is DRAFT -> ` +
    'SOURCE_STORED -> PARSING -> REVIEW_REQUIRED -> COMMITTING -> COMMITTED, with REJECTED, ' +
    'FAILED, DUPLICATE and ERASED as the only other destinations. A move that skips ' +
    "REVIEW_REQUIRED would write a person's financial records from a file nobody read"
  );
}
