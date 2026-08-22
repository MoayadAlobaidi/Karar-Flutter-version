/**
 * ============================================================================
 * A PAYMENT INSTRUMENT IS NOT A BALANCE
 * ============================================================================
 *
 * This file is the shape of what SPENDS from a balance-bearing account, and
 * the single most important thing about it is a field that does not exist.
 *
 * **There is no `balance`, no `amount`, no `limit`, no `available`, no
 * `currency` and no numeric field of any kind on `PaymentInstrument`, and
 * there must never be one.** ADR-0028 names the failure exactly: "two virtual
 * cards on one wallet look like two more balances, and the person's money
 * appears to triple". A card is a way money leaves an account; the account is
 * where the money is. Two virtual cards spending from one wallet are two
 * instruments pointing at ONE account, and the only honest total is the
 * account's.
 *
 * The absence is not a convention. Migration 0098 has no such column, the
 * schema suite asserts the live table's column set EXHAUSTIVELY, and this
 * module's source is scanned for money arithmetic. The one integer here is
 * `version`, the optimistic-concurrency token, which counts writes.
 *
 * Where an issuer genuinely funds a product separately — a prepaid card with
 * its own float rather than a card drawing on a wallet — that product is its
 * OWN financial account (`modules/financial-accounts`, migrations 0088/0095)
 * and the instrument points at that account. There is no third position, and
 * neither this type nor the schema can express one.
 *
 * ## Exactly one account, and it is frozen
 *
 * `accountRef` is singular, required, and immutable after creation. An
 * instrument re-pointed at another account keeps its id, its label and its
 * history while silently changing what it draws on — the same defect as
 * deleting it and creating another, by a verb that leaves no trace.
 * `applyInstrumentEdit` refuses it and `payment_instruments_guard` refuses it
 * again at the database (SQLSTATE KAR30), because a rule that matters is
 * worth holding twice.
 *
 * ## No status means connected
 *
 * `INSTRUMENT_STATUSES` describes the instrument's OWN lifecycle and nothing
 * else. There is no `PROVISIONED`, `TOKENIZED`, `SYNCED`, `LINKED` or
 * `AUTHORIZED` value and none may be added: no issuer named anywhere in this
 * platform exposes an interface to Karar, and a status column is exactly
 * where that fiction would first be written down. `modules/financial-accounts`
 * and `modules/financial-connections` hold the same line for the same reason,
 * and `impliesLiveIssuerLink` below makes the claim checkable rather than
 * merely stated — it answers `false` for every value in the vocabulary.
 *
 * ## Purity
 *
 * No clock, no randomness, no I/O (architecture test 11). Instants and
 * identifiers arrive as arguments from the application layer.
 */

import { Result, TenantId, UserId } from '@karar/shared-kernel';

import type {
  InvalidDisplayText,
  PaymentInstrumentRuleViolation,
  StatusTransitionNotAvailable,
} from './errors.js';
import { HSF_FIELD_MAX_LENGTH, HsfField } from './hsf-field.js';
import {
  checkInstrumentMaskShape,
  instrumentMaskRefusalMessage,
  normalizeInstrumentMask,
} from './instrument-mask.js';
import { BalanceBearingAccountRef, type PaymentInstrumentId } from './refs.js';

/**
 * What kind of thing spends. CATEGORIES, never an issuer, a card scheme or a
 * wallet provider — no provider-specific value exists anywhere in this
 * platform, and this is one of the two or three vocabularies where one would
 * be most tempting (ADR-0028).
 *
 * `TOKENIZED_CARD` names the FACT that a token exists somewhere in the world
 * — typically in a phone's secure element, put there by an issuer this
 * platform has no relationship with. It does not mean a token is stored here,
 * and no column in migration 0098 could hold one.
 *
 * `QR_PAYMENT_IDENTITY` is the launch market's other real instrument: a
 * scannable identity that spends from an account. It is an instrument for
 * exactly the same reason a card is — it moves money out of an account it
 * does not contain.
 *
 * `OTHER` exists so the list never has to be complete before a person can
 * record what they hold.
 */
export const INSTRUMENT_TYPES = [
  'PHYSICAL_CARD',
  'VIRTUAL_CARD',
  'PREPAID_CARD',
  'TOKENIZED_CARD',
  'QR_PAYMENT_IDENTITY',
  'OTHER',
] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

/**
 * The instrument's OWN lifecycle, and nothing else.
 *
 * `SUSPENDED` is the person's own temporary freeze or the issuer's; `EXPIRED`
 * is a card that has run out; `CANCELLED` is one that is gone for good. None
 * of the four says anything about a link to an issuer, because there is none.
 */
export const INSTRUMENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const;
export type InstrumentStatus = (typeof INSTRUMENT_STATUSES)[number];

/**
 * The statuses an instrument may be created with. `EXPIRED` and `CANCELLED`
 * are reachable only by transition: recording a brand new instrument that is
 * already dead is not a thing a person does, and permitting it would make the
 * status column a free-text field with four values.
 */
export const CONSTRUCTIBLE_INSTRUMENT_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type ConstructibleInstrumentStatus =
  (typeof CONSTRUCTIBLE_INSTRUMENT_STATUSES)[number];

/**
 * The statuses from which an instrument may still be used to spend, as far as
 * anything in this module is concerned.
 *
 * Nothing in this module spends anything, so this is a description rather
 * than a permission — it exists so that a later consumer asking "may this
 * instrument still be used?" gets a stated answer instead of inventing one
 * from the status name.
 */
export const SPENDABLE_INSTRUMENT_STATUSES: readonly InstrumentStatus[] = Object.freeze([
  'ACTIVE',
]);

/**
 * The transitions a person or an issuer can actually produce.
 *
 * `CANCELLED` and `EXPIRED` are terminal: a cancelled card does not come
 * back, and a card that expired was replaced by a different card, which is a
 * different instrument with its own row. Permitting the reverse would let one
 * row's history describe two physical objects.
 */
const STATUS_TRANSITIONS: Readonly<Record<InstrumentStatus, readonly InstrumentStatus[]>> =
  Object.freeze({
    ACTIVE: Object.freeze(['SUSPENDED', 'EXPIRED', 'CANCELLED'] as const),
    SUSPENDED: Object.freeze(['ACTIVE', 'EXPIRED', 'CANCELLED'] as const),
    EXPIRED: Object.freeze([] as const),
    CANCELLED: Object.freeze([] as const),
  });

/**
 * Every status that would imply this platform holds a live link to an issuer.
 *
 * It is EMPTY, and it is a value rather than a sentence so the claim is
 * checkable. `modules/financial-connections` states the same thing about
 * connection status for the same reason: a comment saying "no status means
 * connected" is not enforceable, and a function that answers `false` for
 * every member of a closed vocabulary is.
 */
export const STATUSES_IMPLYING_A_LIVE_ISSUER_LINK: readonly InstrumentStatus[] =
  Object.freeze([]);

/** Answers `false` for every value in the vocabulary, by construction. */
export function impliesLiveIssuerLink(status: InstrumentStatus): boolean {
  return STATUSES_IMPLYING_A_LIVE_ISSUER_LINK.includes(status);
}

export function isInstrumentType(value: string): value is InstrumentType {
  return (INSTRUMENT_TYPES as readonly string[]).includes(value);
}

export function isInstrumentStatus(value: string): value is InstrumentStatus {
  return (INSTRUMENT_STATUSES as readonly string[]).includes(value);
}

export function isConstructibleInstrumentStatus(
  value: string,
): value is ConstructibleInstrumentStatus {
  return (CONSTRUCTIBLE_INSTRUMENT_STATUSES as readonly string[]).includes(value);
}

export function isSpendableStatus(status: InstrumentStatus): boolean {
  return SPENDABLE_INSTRUMENT_STATUSES.includes(status);
}

/** Longest display text this module admits — one bound for every HSF field. */
export const MAX_DISPLAY_TEXT_LENGTH = HSF_FIELD_MAX_LENGTH;

/**
 * One payment instrument, as this module holds it.
 *
 * Read the field list as the guarantee it is: an anchor, a kind, a lifecycle,
 * two protected strings, and a concurrency token. **No money, no
 * denomination, no expiry, no credential, no issuer.** Every one of those
 * absences is argued in the migration header and in MODULE.md, and each is
 * asserted by a test rather than left to this comment.
 */
export interface PaymentInstrument {
  readonly id: PaymentInstrumentId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  /** The ONE balance-bearing account this instrument spends from. Frozen. */
  readonly accountRef: BalanceBearingAccountRef;
  readonly instrumentType: InstrumentType;
  readonly status: InstrumentStatus;
  /** The few characters the person recognises it by. Never a PAN. */
  readonly mask: HsfField;
  /** The name the SUBJECT gave it — required, so two cards are tellable apart. */
  readonly displayLabel: HsfField;
  /** Optimistic-concurrency token; the store increments it by exactly one. */
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What a caller supplies to record an instrument. */
export interface NewPaymentInstrument {
  readonly id: PaymentInstrumentId;
  readonly tenantId: TenantId;
  readonly userId: UserId;
  readonly accountId: string;
  readonly instrumentType: InstrumentType;
  readonly status?: ConstructibleInstrumentStatus;
  readonly mask: string;
  readonly displayLabel: string;
  readonly recordedAt: Date;
}

/** Trimmed display text, or null when the input was blank. */
export function normalizeDisplayText(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function checkDisplayLabel(raw: string): Result<string, InvalidDisplayText> {
  const normalized = normalizeDisplayText(raw);
  if (normalized === null) {
    return Result.err({
      kind: 'invalid_display_text',
      field: 'displayLabel',
      message:
        'an instrument needs a name the person gave it, and it may not be blank. Deriving one ' +
        'is worse than asking: from the mask it would render a fragment of a card number as a ' +
        'name, and from the instrument type both virtual cards on one wallet would be called ' +
        'the same thing',
    });
  }
  if (normalized.length > MAX_DISPLAY_TEXT_LENGTH) {
    return Result.err({
      kind: 'invalid_display_text',
      field: 'displayLabel',
      message:
        `an instrument name is bounded at ${MAX_DISPLAY_TEXT_LENGTH} characters; longer input ` +
        'is refused, never truncated. The bound is not a style rule — a name field with no ' +
        'bound becomes the place notes are kept, and notes are not what this classification ' +
        'covers',
    });
  }
  return Result.ok(normalized);
}

/**
 * Validates and freezes a new instrument.
 *
 * The mask shape rule runs FIRST and before anything is normalised, hashed or
 * encrypted: a value that is actually a card number must never reach a key.
 */
export function createPaymentInstrument(
  input: NewPaymentInstrument,
): Result<PaymentInstrument, PaymentInstrumentRuleViolation> {
  const maskRefusal = checkInstrumentMaskShape(input.mask);
  if (maskRefusal !== null) {
    return Result.err({
      kind: 'instrument_mask_not_storable',
      refusal: maskRefusal,
      message: instrumentMaskRefusalMessage(maskRefusal),
    });
  }

  const label = checkDisplayLabel(input.displayLabel);
  if (!label.ok) return Result.err(label.error);

  if (!isInstrumentType(input.instrumentType)) {
    return Result.err({
      kind: 'unknown_vocabulary_value',
      vocabulary: 'instrumentType',
      value: String(input.instrumentType),
      message:
        `'${String(input.instrumentType)}' is not an instrument type this module names. The ` +
        `vocabulary is (${INSTRUMENT_TYPES.join(', ')}) and it names categories, never an ` +
        'issuer, a card scheme or a wallet provider',
    });
  }

  const status: InstrumentStatus = input.status ?? 'ACTIVE';
  if (!isConstructibleInstrumentStatus(status)) {
    return Result.err({
      kind: 'unknown_vocabulary_value',
      vocabulary: 'instrumentStatus',
      value: String(status),
      message:
        `an instrument may only be recorded as (${CONSTRUCTIBLE_INSTRUMENT_STATUSES.join(', ')}). ` +
        'EXPIRED and CANCELLED are reachable only by transition: recording a brand new ' +
        'instrument that is already dead is not something a person does, and permitting it ' +
        'would make the status a free-text field with four values',
    });
  }

  return Result.ok(
    Object.freeze({
      id: input.id,
      tenantId: input.tenantId,
      userId: input.userId,
      accountRef: BalanceBearingAccountRef.of(input.accountId),
      instrumentType: input.instrumentType,
      status,
      mask: HsfField.of(normalizeInstrumentMask(input.mask)),
      displayLabel: HsfField.of(label.value),
      version: 1,
      createdAt: input.recordedAt,
      updatedAt: input.recordedAt,
    }),
  );
}

/**
 * What a person may change about an instrument they already recorded.
 *
 * The list is short on purpose, and what is missing from it is the point:
 * there is no `accountId` and no `instrumentType` field here, so re-pointing
 * an instrument or turning it into a different kind of object is not
 * expressible rather than merely refused. `applyInstrumentEdit` still answers
 * the two refusals for a caller that reached for them through a cast, and the
 * database refuses both again (SQLSTATE KAR30).
 */
export interface InstrumentEdit {
  readonly displayLabel?: string;
  readonly mask?: string;
  readonly status?: InstrumentStatus;
}

/**
 * Whether one status may follow another. Exported because a presentation
 * layer needs to know which actions to offer, and re-deriving the answer from
 * a status name is how an offered action becomes a refused one.
 */
export function canTransition(from: InstrumentStatus, to: InstrumentStatus): boolean {
  if (from === to) return true;
  return (STATUS_TRANSITIONS[from] ?? []).includes(to);
}

function statusTransitionRefusal(
  from: InstrumentStatus,
  to: InstrumentStatus,
): StatusTransitionNotAvailable {
  return {
    kind: 'status_transition_not_available',
    from,
    to,
    message:
      `an instrument that is ${from} may not become ${to}. CANCELLED and EXPIRED are terminal: ` +
      'a cancelled card does not come back, and a card that expired was replaced by a different ' +
      'card — which is a different instrument with its own row, not this one revived. Permitting ' +
      "the reverse would let one row's history describe two physical objects",
  };
}

/**
 * Applies an edit, returning the next instrument or the rule that refused it.
 *
 * Pure: the caller supplies `editedAt` and the store supplies the version.
 * Returning the SAME object when nothing changed is deliberate — the
 * application layer uses identity to decide whether a write is needed, and a
 * no-op write would burn a version and lose somebody else's concurrent edit.
 */
export function applyInstrumentEdit(
  current: PaymentInstrument,
  edit: InstrumentEdit,
  editedAt: Date,
): Result<PaymentInstrument, PaymentInstrumentRuleViolation> {
  let mask = current.mask;
  if (edit.mask !== undefined) {
    const refusal = checkInstrumentMaskShape(edit.mask);
    if (refusal !== null) {
      return Result.err({
        kind: 'instrument_mask_not_storable',
        refusal,
        message: instrumentMaskRefusalMessage(refusal),
      });
    }
    mask = HsfField.of(normalizeInstrumentMask(edit.mask));
  }

  let displayLabel = current.displayLabel;
  if (edit.displayLabel !== undefined) {
    const label = checkDisplayLabel(edit.displayLabel);
    if (!label.ok) return Result.err(label.error);
    displayLabel = HsfField.of(label.value);
  }

  let status = current.status;
  if (edit.status !== undefined) {
    if (!isInstrumentStatus(edit.status)) {
      return Result.err({
        kind: 'unknown_vocabulary_value',
        vocabulary: 'instrumentStatus',
        value: String(edit.status),
        message: `'${String(edit.status)}' is not an instrument status this module names`,
      });
    }
    if (!canTransition(current.status, edit.status)) {
      return Result.err(statusTransitionRefusal(current.status, edit.status));
    }
    status = edit.status;
  }

  const unchanged =
    mask.equals(current.mask) &&
    displayLabel.equals(current.displayLabel) &&
    status === current.status;
  if (unchanged) return Result.ok(current);

  return Result.ok(
    Object.freeze({
      ...current,
      mask,
      displayLabel,
      status,
      version: current.version + 1,
      updatedAt: editedAt,
    }),
  );
}

/**
 * The refusal a caller gets for asking an instrument to spend from a
 * different account. Exported so the application layer and the repository say
 * the same thing, and so the sentence exists in one place rather than in
 * three.
 */
export const ACCOUNT_NOT_REPOINTABLE: PaymentInstrumentRuleViolation = Object.freeze({
  kind: 'instrument_account_not_repointable' as const,
  message:
    'an instrument spends from exactly one account and that account is fixed when it is ' +
    'recorded. Re-pointing it would silently change what it draws on while keeping its id, its ' +
    'name and its history, so every past reading of "this card spends from that account" would ' +
    'become retroactively false. Record a new instrument against the other account instead; the ' +
    'database refuses the move as well (SQLSTATE KAR30)',
});

/**
 * The refusal a caller gets for asking an instrument to become a different
 * kind of thing.
 */
export function instrumentTypeNotChangeable(
  instrumentType: InstrumentType,
): PaymentInstrumentRuleViolation {
  return {
    kind: 'instrument_type_not_changeable',
    instrumentType,
    message:
      `this instrument is a ${instrumentType} and cannot become another kind. A physical card ` +
      'relabelled as a QR identity is not an edit; it is a different object wearing the first ' +
      "one's row, and the first one's history would follow it. The database refuses the change " +
      'as well (SQLSTATE KAR30)',
  };
}
