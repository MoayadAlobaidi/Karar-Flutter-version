/**
 * `FinancialConnection` — HOW Karar receives financial data for one subject.
 *
 * **A connection is not an account, and the distinction is the point.** An
 * account is where a balance sits; a connection is the route a fact travels
 * to get here. One connection may feed many accounts, and one person may hold
 * several connections to one institution — two statements downloaded from one
 * bank in two different months are two arrivals of data, not one. Neither is
 * expressible if the source is a column on the account, which is what
 * migration 0088 removed (ADR-0028).
 *
 * **Nothing constructed here claims a bank connection.** The factory accepts
 * only an implemented rail, so `OPEN_FINANCE_API` and its eleven siblings are
 * not constructible; the database refuses them besides, which is the control
 * that matters (a type is a convenience, not a boundary). No status value
 * means connected, synced, linked or authorized, and
 * `impliesLiveInstitutionLink` answers `false` for every one of them.
 *
 * **This entity holds no credential and there is nowhere to put one.** No
 * field here is a secret, a token, a cookie, a session, a cursor, or a
 * reference to one held elsewhere. That is asserted structurally against the
 * table (an exhaustive column-set test) and against this file (the shape
 * below is closed), because a claim about an absence has to be checkable or
 * it is decoration.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import type { FinancialConnectionRuleViolation } from './errors.js';
import { HsfField, HSF_FIELD_MAX_LENGTH } from './hsf-field.js';
import {
  CONSTRUCTIBLE_CONNECTION_STATUSES,
  IMPLEMENTED_CONNECTION_RAILS,
  isConnectionRail,
  isImplementedConnectionRail,
  type ConnectionRail,
  type ConnectionStatus,
  type ConstructibleConnectionStatus,
  type ImplementedConnectionRail,
} from './rails.js';
import type { FinancialConnectionId, InstitutionRef } from './refs.js';

/** Longest display text this module admits, in UTF-16 code units. */
export const MAX_DISPLAY_TEXT_LENGTH = HSF_FIELD_MAX_LENGTH;

export interface FinancialConnection {
  readonly id: FinancialConnectionId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /**
   * The reviewed catalogue entry this connection relates to, or null for a
   * ledger the person keeps by hand. Naming one asserts nothing about that
   * institution and never that it is reachable.
   */
  readonly institutionRef: InstitutionRef | null;
  /** Immutable: a connection's rail is what the connection IS. */
  readonly rail: ImplementedConnectionRail;
  readonly status: ConnectionStatus;
  /**
   * The name the subject gave this connection. Required, because several
   * connections to one institution are ordinary and one the person cannot
   * tell apart in a list is not usable. HSF; ciphertext at rest.
   */
  readonly displayLabel: HsfField;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency token; the store increments it by exactly one. */
  readonly version: number;
}

export interface NewFinancialConnection {
  readonly id: FinancialConnectionId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly institutionRef: InstitutionRef | null;
  readonly rail: ImplementedConnectionRail;
  readonly status: ConstructibleConnectionStatus;
  readonly displayLabel: string;
  readonly createdAt: Date;
}

/** Trimmed, or a violation naming the field without quoting its value. */
export function normalizeDisplayText(
  value: string,
): Result<string, FinancialConnectionRuleViolation> {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed === '') {
    return Result.err({
      kind: 'invalid_display_text',
      field: 'displayLabel',
      message:
        'a connection needs a label the person can recognise: several connections to one ' +
        'institution are ordinary, and one with no name is indistinguishable from the next. The ' +
        'offending value is deliberately not quoted here — the field is HIGHLY_SENSITIVE_FINANCIAL',
    });
  }
  if (trimmed.length > MAX_DISPLAY_TEXT_LENGTH) {
    return Result.err({
      kind: 'invalid_display_text',
      field: 'displayLabel',
      message:
        `a connection label is bounded at ${MAX_DISPLAY_TEXT_LENGTH} characters and longer input ` +
        'is refused, never truncated: a field named for a LABEL must not become a place to keep ' +
        'notes the classification does not cover',
    });
  }
  return Result.ok(trimmed);
}

/**
 * Whether a rail may carry a connection at all.
 *
 * The refusal names the rail, which is safe — it is a word from a closed list
 * — and says what "not implemented" means here, which is the part callers get
 * wrong: the rail is named so the model is shaped correctly, and naming it is
 * not a claim that any provider exposes an interface to Karar. None does.
 */
export function checkRailImplemented(
  rail: string,
): Result<ImplementedConnectionRail, FinancialConnectionRuleViolation> {
  if (!isConnectionRail(rail)) {
    return Result.err({
      kind: 'unknown_vocabulary_value',
      vocabulary: 'connectionRail',
      value: rail,
      message:
        `'${rail}' is not a rail this model names. The vocabulary is closed and complete; a value ` +
        'outside it is a caller error, never a rail nobody thought of',
    });
  }
  if (!isImplementedConnectionRail(rail)) {
    return Result.err({
      kind: 'rail_not_implemented',
      rail,
      message:
        `the ${rail} rail is named but NOT implemented, so no connection may be created on it. ` +
        `Only ${IMPLEMENTED_CONNECTION_RAILS.join(' and ')} may be created, and the refusal is a ` +
        'database CHECK rather than this rule alone (migration 0096) so an unimplemented rail ' +
        'cannot be written even by direct SQL. Naming a rail is not implementing one: no provider ' +
        'is integrated, none exposes an interface to Karar, and no surface may show this as ' +
        'available (ADR-0028)',
    });
  }
  return Result.ok(rail);
}

/**
 * Whether a status may be constructed for a rail.
 *
 * Two arms, and the second is the one that matters: `NOT_IMPLEMENTED`
 * describes a rail nobody built, so claiming it for a rail that works is the
 * same lie as claiming `ACTIVE` for one that does not. Migration 0096 refuses
 * both directions by CHECK.
 */
export function checkStatusForRail(
  status: string,
  rail: ImplementedConnectionRail,
): Result<ConstructibleConnectionStatus, FinancialConnectionRuleViolation> {
  if (!(CONSTRUCTIBLE_CONNECTION_STATUSES as readonly string[]).includes(status)) {
    return Result.err({
      kind: 'connection_status_not_available',
      status: status as ConnectionStatus,
      rail,
      message:
        `'${status}' is not a status a caller may construct. NOT_IMPLEMENTED is modelled and ` +
        'unreachable — no row may carry an unimplemented rail, so no row can describe one — and ' +
        'any other value is outside the vocabulary. No status means connected, synced or ' +
        'authorized, and none may be added',
    });
  }
  return Result.ok(status as ConstructibleConnectionStatus);
}

/**
 * Build a connection, or say which rule refused it.
 *
 * `status` is a parameter rather than fixed because a person may record a
 * connection they have retired; what is NOT a parameter is anything that
 * could make this row claim a live link, because no such value exists.
 */
export function createFinancialConnection(
  input: NewFinancialConnection,
): Result<FinancialConnection, FinancialConnectionRuleViolation> {
  const rail = checkRailImplemented(input.rail);
  if (!rail.ok) return rail;

  const status = checkStatusForRail(input.status, rail.value);
  if (!status.ok) return status;

  const label = normalizeDisplayText(input.displayLabel);
  if (!label.ok) return label;

  return Result.ok({
    id: input.id,
    tenantId: TenantId.of(TenantId.toString(input.tenantId)),
    userId: UserId.of(UserId.toString(input.userId)),
    institutionRef: input.institutionRef,
    rail: rail.value,
    status: status.value,
    displayLabel: HsfField.of(label.value),
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    version: 1,
  });
}

/** What an edit may change. The rail is absent, and its absence is the rule. */
export interface ConnectionEdit {
  readonly displayLabel?: string;
  readonly status?: ConstructibleConnectionStatus;
  readonly institutionRef?: InstitutionRef | null;
}

/**
 * Apply an edit, producing the next version.
 *
 * The rail cannot be edited and there is no parameter for it: a MANUAL
 * connection relabelled USER_FILE_UPLOAD would retroactively claim that facts
 * a person typed arrived in a file. The database freezes it too
 * (`financial_connections_guard`), which is what makes the rule true for
 * every writer rather than for this function's callers.
 */
export function applyConnectionEdit(
  current: FinancialConnection,
  edit: ConnectionEdit,
  now: Date,
): Result<FinancialConnection, FinancialConnectionRuleViolation> {
  let displayLabel = current.displayLabel;
  if (edit.displayLabel !== undefined) {
    const label = normalizeDisplayText(edit.displayLabel);
    if (!label.ok) return label;
    displayLabel = HsfField.of(label.value);
  }

  let status: ConnectionStatus = current.status;
  if (edit.status !== undefined) {
    const checked = checkStatusForRail(edit.status, current.rail);
    if (!checked.ok) return checked;
    status = checked.value;
  }

  return Result.ok({
    ...current,
    displayLabel,
    status,
    institutionRef:
      edit.institutionRef === undefined ? current.institutionRef : edit.institutionRef,
    updatedAt: now,
    version: current.version + 1,
  });
}

/**
 * Whether this connection is a route the subject may currently use.
 *
 * Named for what it means and NOT `isConnected`, which is the word this
 * module refuses to make available. `true` here means "the person may type
 * entries" or "the person may upload a file" — it is a statement about what
 * this platform will accept, never about anything an institution is doing.
 */
export function acceptsSubjectSuppliedData(connection: FinancialConnection): boolean {
  return connection.status === 'ACTIVE';
}

/** Re-export for callers that only import this file. */
export type { ConnectionRail, ImplementedConnectionRail };
