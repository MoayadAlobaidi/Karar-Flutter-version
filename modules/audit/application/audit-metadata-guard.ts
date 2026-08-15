/**
 * AuditMetadataGuard — the boundary between caller-supplied context and what
 * an audit row may hold.
 *
 * Audit rows are CONFIDENTIAL (MODULE.md); their before/after metadata must
 * therefore never become a side channel for higher-classified data. The
 * guard's stance is a documented **allow-list**, not best-effort filtering:
 * metadata carries identifiers, statuses, timestamps, and small scalar
 * context — never credentials, never sealed content, never a financial
 * payload. "What changed" at payload level is answerable from the owning
 * module's own store; the audit row answers who/what/when/outcome.
 *
 * Rules, in the order applied (docs/security/data-classification.md;
 * platform classification module):
 *
 * 1. SECRET-pattern keys (password, token, apiKey, …) throw — a secret has
 *    no redacted form worth storing; the call site is the defect.
 * 2. A value explicitly marked SEALED throws. Sealed data never appears in
 *    an audit record — the record of a sealed access names refs, never
 *    content.
 * 3. A value explicitly marked SECRET throws, same reasoning as rule 1.
 * 4. A value marked HIGHLY_SENSITIVE_FINANCIAL is replaced with
 *    '[redacted:hsf]' unless its key is identifier/status-shaped, in which
 *    case the value is an identifier and passes as-is.
 * 5. Financial-pattern keys (iban, accountNumber, amountMinor, balance, …)
 *    carrying an unclassified raw value throw: financial detail enters
 *    metadata only deliberately, classified, and therefore redacted.
 * 6. Shape guard: values must be scalars (or a classified wrapper around
 *    one). A nested object or array is a payload, and payloads are rejected.
 * 7. Size guard: serialized metadata above MAX_METADATA_BYTES is rejected —
 *    a "metadata" blob the size of a statement is a payload with a modest
 *    name.
 *
 * Violations throw (a defect at the call site), they do not return Result —
 * the write path's expected failures (store down, privilege) are the
 * writer's Result, not the guard's.
 */

import {
  redactionFor,
  type DataClassification,
} from '@karar/platform/dist/classification/index.js';

import type { AuditMetadata } from '../domain/audit-event.js';

/** Serialized-size ceiling for one metadata object. */
export const MAX_METADATA_BYTES = 4096;

/** A caller may classify a value explicitly; unwrapped scalars are treated as unclassified context. */
export interface ClassifiedMetadataValue {
  readonly classification: DataClassification;
  readonly value: string | number | boolean | null;
}

export type AuditMetadataInput = Readonly<
  Record<string, string | number | boolean | null | ClassifiedMetadataValue>
>;

export class AuditMetadataViolation extends Error {
  override readonly name = 'AuditMetadataViolation';
  readonly key: string | null;

  constructor(key: string | null, message: string) {
    super(message);
    this.key = key;
  }
}

/** camelCase/kebab-case -> snake_case, so one word-list matches every spelling. */
function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

const SECRET_KEY_PATTERN =
  /(?:^|_)(?:password|passwd|secret|token|api_?key|private_?key|credential|credentials|authorization|bearer|jwt|signing_?key)(?:_|$)/;

const FINANCIAL_KEY_PATTERN =
  /(?:^|_)(?:iban|account_?number|card_?number|pan|amount|amounts|balance|balances|minor_?units)(?:_|$)/;

/** Identifier/status-shaped keys whose values are references, not content. */
const IDENTIFIER_KEY_PATTERN = /(?:^id$|_id$|_ref$|^status$|^state$|_at$)/;

function isClassifiedValue(value: unknown): value is ClassifiedMetadataValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'classification' in value &&
    'value' in value
  );
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

export class AuditMetadataGuard {
  /**
   * Returns the storable form of `metadata`, or throws AuditMetadataViolation.
   * `null`/`undefined` pass through as null — absent metadata is a fine
   * audit record; a rejected one is not.
   */
  apply(metadata: AuditMetadataInput | null | undefined): AuditMetadata | null {
    if (metadata === null || metadata === undefined) {
      return null;
    }
    const sanitized: Record<string, string | number | boolean | null> = {};
    for (const [key, raw] of Object.entries(metadata)) {
      const normalizedKey = normalizeKey(key);
      if (SECRET_KEY_PATTERN.test(normalizedKey)) {
        throw new AuditMetadataViolation(
          key,
          `metadata key '${key}' matches a secret pattern; credentials never enter an audit record, redacted or otherwise`,
        );
      }

      let classification: DataClassification | null = null;
      let value: unknown = raw;
      if (isClassifiedValue(raw)) {
        classification = raw.classification;
        value = raw.value;
      }

      if (classification === 'SEALED') {
        throw new AuditMetadataViolation(
          key,
          `metadata key '${key}' carries a SEALED value; sealed content never appears in an audit record — record the ref, not the content`,
        );
      }
      if (classification === 'SECRET') {
        throw new AuditMetadataViolation(
          key,
          `metadata key '${key}' carries a SECRET value; secrets never enter an audit record`,
        );
      }

      if (!isScalar(value)) {
        throw new AuditMetadataViolation(
          key,
          `metadata key '${key}' carries a nested ${Array.isArray(value) ? 'array' : 'object'}; ` +
            'audit metadata is identifiers, statuses, and small scalars — full payloads are rejected by design',
        );
      }

      if (classification === 'HIGHLY_SENSITIVE_FINANCIAL') {
        sanitized[key] = IDENTIFIER_KEY_PATTERN.test(normalizedKey)
          ? value
          : (redactionFor('HIGHLY_SENSITIVE_FINANCIAL') as string);
        continue;
      }

      if (FINANCIAL_KEY_PATTERN.test(normalizedKey) && !IDENTIFIER_KEY_PATTERN.test(normalizedKey)) {
        throw new AuditMetadataViolation(
          key,
          `metadata key '${key}' is financial-shaped but its value is unclassified; pass it as ` +
            `{ classification: 'HIGHLY_SENSITIVE_FINANCIAL', value } (stored redacted) or record an identifier instead`,
        );
      }

      sanitized[key] = value;
    }

    const size = new TextEncoder().encode(JSON.stringify(sanitized)).length;
    if (size > MAX_METADATA_BYTES) {
      throw new AuditMetadataViolation(
        null,
        `metadata serializes to ${size} bytes (limit ${MAX_METADATA_BYTES}); ` +
          'a payload-sized blob is a payload — record identifiers and fetch state from the owning module',
      );
    }
    return Object.freeze(sanitized);
  }
}
