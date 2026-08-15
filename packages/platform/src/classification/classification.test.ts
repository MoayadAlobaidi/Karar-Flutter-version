import { describe, expect, it } from 'vitest';

import {
  DATA_CLASSIFICATIONS,
  EventPayloadViolation,
  REDACTED_HSF,
  REDACTED_SEALED,
  REDACTED_SECRET,
  assertEventPayloadAllowed,
  isLoggable,
  redact,
  redactionFor,
  type DataClassification,
} from './classification.js';

describe('the six canonical classes', () => {
  it('is exactly the six, in the canonical order (data-classification.md §1)', () => {
    expect(DATA_CLASSIFICATIONS).toEqual([
      'PUBLIC',
      'INTERNAL',
      'CONFIDENTIAL',
      'HIGHLY_SENSITIVE_FINANCIAL',
      'SECRET',
      'SEALED',
    ]);
  });
});

describe('isLoggable', () => {
  it('denies SECRET and SEALED, which never appear in a log', () => {
    expect(isLoggable('SECRET')).toBe(false);
    expect(isLoggable('SEALED')).toBe(false);
  });

  it('permits the four classes that may appear (redacted where the matrix says so)', () => {
    expect(isLoggable('PUBLIC')).toBe(true);
    expect(isLoggable('INTERNAL')).toBe(true);
    expect(isLoggable('CONFIDENTIAL')).toBe(true);
    expect(isLoggable('HIGHLY_SENSITIVE_FINANCIAL')).toBe(true);
  });
});

describe('redactionFor / redact', () => {
  it('maps the three always-replaced classes to their markers', () => {
    expect(redactionFor('SEALED')).toBe(REDACTED_SEALED);
    expect(redactionFor('SECRET')).toBe(REDACTED_SECRET);
    expect(redactionFor('HIGHLY_SENSITIVE_FINANCIAL')).toBe(REDACTED_HSF);
    expect(REDACTED_SEALED).toBe('[sealed]');
    expect(REDACTED_SECRET).toBe('[redacted:secret]');
    expect(REDACTED_HSF).toBe('[redacted:hsf]');
  });

  it('passes PUBLIC, INTERNAL, and CONFIDENTIAL through', () => {
    for (const classification of ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'] as const) {
      expect(redactionFor(classification)).toBeNull();
      expect(redact('as-was', classification)).toBe('as-was');
    }
  });

  it('redact replaces the value itself for the marked classes', () => {
    expect(redact({ iban: 'QA00...' }, 'HIGHLY_SENSITIVE_FINANCIAL')).toBe('[redacted:hsf]');
    expect(redact('api-key-value', 'SECRET')).toBe('[redacted:secret]');
    expect(redact('obligation text', 'SEALED')).toBe('[sealed]');
  });
});

describe('assertEventPayloadAllowed — SEALED', () => {
  it('allows identifiers and status only, in camelCase and snake_case', () => {
    expect(() =>
      assertEventPayloadAllowed('SEALED', ['id', 'status', 'caseId', 'tenant_id', 'occurredAt']),
    ).not.toThrow();
    // The catalogue's canonical example (event-governance.md §3).
    expect(() =>
      assertEventPayloadAllowed('SEALED', [
        'case_id',
        'tenant_id',
        'jurisdiction_id',
        'operating_entity_id',
        'occurred_at',
      ]),
    ).not.toThrow();
  });

  it('rejects any substantive field and names it', () => {
    let thrown: unknown;
    try {
      assertEventPayloadAllowed('SEALED', ['caseId', 'status', 'obligationAmount']);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EventPayloadViolation);
    expect((thrown as EventPayloadViolation).offendingFields).toEqual(['obligationAmount']);
    expect((thrown as EventPayloadViolation).message).toContain('No exemption mechanism');
  });

  it('rejects near-miss field names that are not identifiers', () => {
    for (const field of ['identity', 'idempotencyKey', 'statusReason', 'amount']) {
      expect(() => assertEventPayloadAllowed('SEALED', [field])).toThrow(EventPayloadViolation);
    }
  });

  it('ignores a supplied exemption — SEALED has no exemption mechanism', () => {
    expect(() =>
      assertEventPayloadAllowed('SEALED', ['amount'], {
        owner: 'anyone',
        reason: 'any reason',
        reviewer: 'any reviewer',
      }),
    ).toThrow(EventPayloadViolation);
  });

  it('accepts an object payload shape, reading its keys', () => {
    expect(() => assertEventPayloadAllowed('SEALED', { id: 'x', status: 'PENDING' })).not.toThrow();
    expect(() => assertEventPayloadAllowed('SEALED', { id: 'x', note: 'text' })).toThrow(
      EventPayloadViolation,
    );
  });
});

describe('assertEventPayloadAllowed — SECRET', () => {
  it('rejects every shape, including an empty one — SECRET never enters an event', () => {
    expect(() => assertEventPayloadAllowed('SECRET', [])).toThrow(EventPayloadViolation);
    expect(() => assertEventPayloadAllowed('SECRET', ['id'])).toThrow(EventPayloadViolation);
  });
});

describe('assertEventPayloadAllowed — HIGHLY_SENSITIVE_FINANCIAL', () => {
  it('allows identifier-only payloads without an exemption', () => {
    expect(() =>
      assertEventPayloadAllowed('HIGHLY_SENSITIVE_FINANCIAL', [
        'transactionId',
        'account_id',
        'occurredAt',
      ]),
    ).not.toThrow();
  });

  it('rejects payload fields without an exemption, and names them', () => {
    let thrown: unknown;
    try {
      assertEventPayloadAllowed('HIGHLY_SENSITIVE_FINANCIAL', ['transactionId', 'amountMinor']);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(EventPayloadViolation);
    expect((thrown as EventPayloadViolation).offendingFields).toEqual(['amountMinor']);
    expect((thrown as EventPayloadViolation).message).toContain('payloadExemption');
  });

  it('rejects status too — HSF is identifier-only, stricter than SEALED on that one field', () => {
    expect(() => assertEventPayloadAllowed('HIGHLY_SENSITIVE_FINANCIAL', ['id', 'status'])).toThrow(
      EventPayloadViolation,
    );
  });

  it('allows payload fields with a complete {owner, reason, reviewer} exemption', () => {
    expect(() =>
      assertEventPayloadAllowed('HIGHLY_SENSITIVE_FINANCIAL', ['transactionId', 'amountMinor'], {
        owner: 'projections',
        reason: 'budget totals need the amount',
        reviewer: 'engineering-owner',
      }),
    ).not.toThrow();
  });

  it('rejects an incomplete exemption — every field named, none blank', () => {
    const complete = {
      owner: 'projections',
      reason: 'budget totals need the amount',
      reviewer: 'engineering-owner',
    };
    for (const missing of ['owner', 'reason', 'reviewer'] as const) {
      const broken = { ...complete, [missing]: '  ' };
      expect(() =>
        assertEventPayloadAllowed('HIGHLY_SENSITIVE_FINANCIAL', ['amountMinor'], broken),
      ).toThrow(EventPayloadViolation);
    }
  });
});

describe('assertEventPayloadAllowed — the permissive classes', () => {
  it('permits arbitrary payloads for PUBLIC, INTERNAL, and CONFIDENTIAL', () => {
    for (const classification of ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'] as DataClassification[]) {
      expect(() =>
        assertEventPayloadAllowed(classification, ['id', 'name', 'freeText', 'anything']),
      ).not.toThrow();
    }
  });
});
