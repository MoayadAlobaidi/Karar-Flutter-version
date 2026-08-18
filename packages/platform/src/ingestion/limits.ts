/**
 * Ingestion resource limits (Phase 5, architecture test 24).
 *
 * WHY THIS FILE EXISTS AT ALL.
 *
 * The legacy product read an uploaded statement into memory, parsed it with no
 * row ceiling, and degraded — silently truncating on some paths and exhausting
 * the process on others (legacy FILES-2, HIGH). The failure was not that the
 * numbers were wrong; it was that there were no numbers. Every bound lived
 * wherever the code happened to need one, so nobody could answer "what is the
 * largest statement this accepts?" without reading three parsers.
 *
 * So every ingestion path in this platform declares its limits HERE, as one
 * typed policy, and the architecture suite fails the build on a path that does
 * not. A constant inlined in a controller is the shape this file exists to
 * prevent, and test 24 treats it as a violation rather than a style opinion.
 *
 * THESE ARE ENGINEERING SAFETY LIMITS, NOT LEGAL RETENTION DECISIONS. They
 * bound what a request may consume. They say nothing about how long anything
 * is kept — that decision belongs to counsel and is recorded as unresolved in
 * the module lifecycle declarations, where it fails closed outside LOCAL/TEST.
 *
 * REJECT, NEVER DEGRADE. A path that exceeds a limit is refused with a typed
 * RFC 7807 problem naming a stable code. Nothing truncates a statement to fit,
 * because a silently shortened import is a wrong financial record that looks
 * like a right one.
 */

/**
 * The limits one ingestion path is allowed to consume.
 *
 * Every field is required and every field is finite. There is deliberately no
 * "unlimited" value and no optional member: an ingestion path that genuinely
 * does not read rows still declares `maxRows: 1`, because "this path handles
 * exactly one" is a bound, while a missing field is an unanswered question.
 */
export interface IngestionLimitPolicy {
  /**
   * Stable identifier for the ingestion path, unique across the platform.
   * Appears in refusal problems and in the architecture test's inventory.
   */
  readonly pathId: string;
  /** Largest accepted request body, in bytes. */
  readonly maxBytes: number;
  /** Largest accepted number of data rows. */
  readonly maxRows: number;
  /** Largest accepted number of columns per row. */
  readonly maxColumns: number;
  /** Largest accepted decoded size of a single field, in bytes. */
  readonly maxFieldBytes: number;
  /** Largest page a read may return. */
  readonly maxPageSize: number;
  /** Default page a read returns when the caller does not choose. */
  readonly defaultPageSize: number;
  /** Rows the parser may hold in memory at once. */
  readonly maxBufferedRows: number;
  /** Bytes the parser may hold in memory at once. */
  readonly maxBufferedBytes: number;
  /** Wall-clock ceiling for the whole operation, in milliseconds. */
  readonly deadlineMs: number;
  /** Validation errors returned in one response before the rest are summarised. */
  readonly maxReportedErrors: number;
  /** Rows written per batch at commit. */
  readonly maxBatchSize: number;
}

/** Thrown when a declared policy is not usable. Startup validation, not a runtime path. */
export class InvalidIngestionLimitPolicyError extends Error {
  override readonly name = 'InvalidIngestionLimitPolicyError';
  constructor(pathId: string, field: string, detail: string) {
    super(`ingestion limit policy '${pathId}': ${field} ${detail}`);
  }
}

/** Every numeric field, so validation cannot silently miss one added later. */
const NUMERIC_FIELDS = [
  'maxBytes',
  'maxRows',
  'maxColumns',
  'maxFieldBytes',
  'maxPageSize',
  'defaultPageSize',
  'maxBufferedRows',
  'maxBufferedBytes',
  'deadlineMs',
  'maxReportedErrors',
  'maxBatchSize',
] as const satisfies readonly (keyof IngestionLimitPolicy)[];

/**
 * Validates one policy, throwing rather than returning a result.
 *
 * Called at startup and by the registry below. A malformed limit is a
 * programming error that must stop the process, not a condition a request
 * handler recovers from — a process running with an unbounded parser is the
 * exact state this file exists to make impossible.
 */
export function assertValidIngestionLimitPolicy(policy: IngestionLimitPolicy): void {
  if (typeof policy.pathId !== 'string' || policy.pathId.trim() === '') {
    throw new InvalidIngestionLimitPolicyError(
      String(policy.pathId),
      'pathId',
      'must be a non-empty string',
    );
  }
  for (const field of NUMERIC_FIELDS) {
    const value = policy[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new InvalidIngestionLimitPolicyError(policy.pathId, field, 'must be a finite number');
    }
    if (!Number.isInteger(value)) {
      throw new InvalidIngestionLimitPolicyError(policy.pathId, field, 'must be an integer');
    }
    if (value <= 0) {
      throw new InvalidIngestionLimitPolicyError(policy.pathId, field, 'must be greater than zero');
    }
  }
  if (policy.defaultPageSize > policy.maxPageSize) {
    throw new InvalidIngestionLimitPolicyError(
      policy.pathId,
      'defaultPageSize',
      'must not exceed maxPageSize',
    );
  }
  if (policy.maxBufferedRows > policy.maxRows) {
    throw new InvalidIngestionLimitPolicyError(
      policy.pathId,
      'maxBufferedRows',
      'must not exceed maxRows — buffering more than the row ceiling cannot happen and hides which bound is real',
    );
  }
  if (policy.maxBufferedBytes > policy.maxBytes) {
    throw new InvalidIngestionLimitPolicyError(
      policy.pathId,
      'maxBufferedBytes',
      'must not exceed maxBytes',
    );
  }
}

/**
 * The declared ingestion paths.
 *
 * Adding a path here is how it becomes legal; architecture test 24 reads this
 * registry and fails on any ingestion entrypoint that is not in it. The values
 * are conservative engineering defaults chosen to be revisable, not tuned:
 * refusing a statement that is larger than expected costs a user one message,
 * while accepting one that is larger than the process can hold costs everyone
 * the process.
 */
export const INGESTION_LIMIT_POLICIES = {
  /**
   * A single manually entered transaction.
   *
   * `maxRows: 1` is the point rather than an exemption. One row is still a
   * bound, and declaring it keeps the manual path inside the same inventory
   * the architecture test walks — a path that processes "only one" is exactly
   * the kind that historically escapes limit review.
   */
  manualTransaction: {
    pathId: 'manual-transaction',
    maxBytes: 64 * 1024,
    maxRows: 1,
    maxColumns: 64,
    maxFieldBytes: 8 * 1024,
    maxPageSize: 200,
    defaultPageSize: 50,
    maxBufferedRows: 1,
    maxBufferedBytes: 64 * 1024,
    deadlineMs: 10_000,
    maxReportedErrors: 100,
    maxBatchSize: 1,
  },
  /** A CSV statement upload and its bounded parse. */
  csvStatementImport: {
    pathId: 'csv-statement-import',
    maxBytes: 10 * 1024 * 1024,
    maxRows: 50_000,
    maxColumns: 64,
    maxFieldBytes: 8 * 1024,
    maxPageSize: 200,
    defaultPageSize: 50,
    maxBufferedRows: 500,
    maxBufferedBytes: 8 * 1024 * 1024,
    deadlineMs: 30_000,
    maxReportedErrors: 500,
    maxBatchSize: 500,
  },
} as const satisfies Record<string, IngestionLimitPolicy>;

export type IngestionPathId =
  (typeof INGESTION_LIMIT_POLICIES)[keyof typeof INGESTION_LIMIT_POLICIES]['pathId'];

/**
 * Validates every declared policy and the uniqueness of their ids.
 *
 * Called at application startup. Duplicate ids are rejected because a refusal
 * problem names the path, and two paths answering to one name makes a refusal
 * untraceable.
 */
export function assertIngestionLimitPoliciesValid(
  policies: Readonly<Record<string, IngestionLimitPolicy>> = INGESTION_LIMIT_POLICIES,
): void {
  const seen = new Set<string>();
  for (const policy of Object.values(policies)) {
    assertValidIngestionLimitPolicy(policy);
    if (seen.has(policy.pathId)) {
      throw new InvalidIngestionLimitPolicyError(
        policy.pathId,
        'pathId',
        'is declared more than once',
      );
    }
    seen.add(policy.pathId);
  }
}

/** Looks a policy up by path id, throwing when the path is undeclared. */
export function ingestionLimitPolicyFor(pathId: string): IngestionLimitPolicy {
  const found = Object.values(INGESTION_LIMIT_POLICIES).find((p) => p.pathId === pathId);
  if (found === undefined) {
    throw new InvalidIngestionLimitPolicyError(
      pathId,
      'pathId',
      'is not a declared ingestion path',
    );
  }
  return found;
}
