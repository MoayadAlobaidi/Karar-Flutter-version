/**
 * The rail vocabulary, the implemented subset, and the connection factory.
 *
 * Three claims this module makes about itself are asserted here, and each of
 * them is the kind that decays silently if nobody checks it:
 *
 *   1. all thirteen rails are representable;
 *   2. exactly two of them may be created;
 *   3. no status means connected, synced, linked or authorized.
 *
 * The database carries (2) as a CHECK and the schema suite proves it there.
 * What is proven HERE is that the code agrees with the database, because a
 * type that drifted from a constraint is how a caller gets a refusal it
 * cannot explain.
 */

import { describe, expect, it } from 'vitest';

import { Clock, TenantId, UserId } from '@karar/shared-kernel';

import {
  CONNECTION_RAILS,
  CONNECTION_STATUSES,
  CONSTRUCTIBLE_CONNECTION_STATUSES,
  IMPLEMENTED_CONNECTION_RAILS,
  impliesLiveInstitutionLink,
  isConnectionRail,
  isImplementedConnectionRail,
  mayBeAuthoritative,
} from '../domain/rails.js';
import {
  acceptsSubjectSuppliedData,
  applyConnectionEdit,
  checkRailImplemented,
  checkStatusForRail,
  createFinancialConnection,
} from '../domain/financial-connection.js';
import { HSF_REDACTION } from '../domain/hsf-field.js';
import type { FinancialConnectionId } from '../domain/refs.js';
import { TENANT_A, USER_A1 } from './fixtures.js';

const clock = new Clock.Fixed(new Date('2026-08-18T12:00:00.000Z'));
const ID = '0c0c0c0c-0000-4000-8000-00000000c001' as FinancialConnectionId;

function build(overrides: Partial<Parameters<typeof createFinancialConnection>[0]> = {}) {
  return createFinancialConnection({
    id: ID,
    tenantId: TENANT_A,
    userId: USER_A1,
    institutionRef: null,
    rail: 'MANUAL',
    status: 'ACTIVE',
    displayLabel: 'Synthetic Test Connection One',
    createdAt: clock.now(),
    ...overrides,
  });
}

describe('the rail vocabulary is complete', () => {
  it('names all thirteen rails ADR-0028 lists', () => {
    expect(CONNECTION_RAILS).toEqual([
      'MANUAL',
      'USER_FILE_UPLOAD',
      'OPEN_FINANCE_API',
      'DIRECT_BANK_OR_WALLET_API',
      'LICENSED_AGGREGATOR_API',
      'HOST_TO_HOST_SFTP',
      'ISO_20022_FILE',
      'SWIFT_MT_FILE',
      'OFX_QFX_FILE',
      'QIF_FILE',
      'PDF_STATEMENT',
      'SECURE_EMAIL_STATEMENT',
      'DEVICE_SIGNAL',
    ]);
    expect(CONNECTION_RAILS).toHaveLength(13);
  });

  it('recognises every named rail, and nothing else', () => {
    for (const rail of CONNECTION_RAILS) expect(isConnectionRail(rail)).toBe(true);
    expect(isConnectionRail('SCREEN_SCRAPE')).toBe(false);
    expect(isConnectionRail('')).toBe(false);
  });
});

describe('only two rails may be created', () => {
  it('implements exactly MANUAL and USER_FILE_UPLOAD', () => {
    expect(IMPLEMENTED_CONNECTION_RAILS).toEqual(['MANUAL', 'USER_FILE_UPLOAD']);
  });

  it('accepts the two implemented rails', () => {
    for (const rail of IMPLEMENTED_CONNECTION_RAILS) {
      expect(isImplementedConnectionRail(rail)).toBe(true);
      const checked = checkRailImplemented(rail);
      expect(checked.ok).toBe(true);
    }
  });

  it('refuses every one of the eleven unimplemented rails, by name', () => {
    const unimplemented = CONNECTION_RAILS.filter(
      (rail) => !(IMPLEMENTED_CONNECTION_RAILS as readonly string[]).includes(rail),
    );
    expect(unimplemented).toHaveLength(11);
    for (const rail of unimplemented) {
      const checked = checkRailImplemented(rail);
      expect(checked.ok, `${rail} must be refused`).toBe(false);
      if (checked.ok) continue;
      expect(checked.error.kind).toBe('rail_not_implemented');
      const built = build({ rail: rail as 'MANUAL' });
      expect(built.ok, `${rail} must not be constructible`).toBe(false);
    }
  });

  it('refuses a rail outside the vocabulary as a caller error, not as "not implemented"', () => {
    const checked = checkRailImplemented('SCREEN_SCRAPE');
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.error.kind).toBe('unknown_vocabulary_value');
  });
});

describe('no status means connected', () => {
  it('has no value naming a live link, in any spelling', () => {
    for (const status of CONNECTION_STATUSES) {
      expect(status).not.toMatch(/CONNECT|SYNC|LINKED|AUTHORI|PAIRED|BOUND|LIVE/i);
    }
  });

  it('answers false for every status when asked whether it implies a live link', () => {
    for (const status of CONNECTION_STATUSES) {
      expect(impliesLiveInstitutionLink(status)).toBe(false);
    }
  });

  it('does not let a caller construct NOT_IMPLEMENTED — it is modelled and unreachable', () => {
    expect(CONNECTION_STATUSES).toContain('NOT_IMPLEMENTED');
    expect(CONSTRUCTIBLE_CONNECTION_STATUSES).not.toContain('NOT_IMPLEMENTED');
    const checked = checkStatusForRail('NOT_IMPLEMENTED', 'MANUAL');
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.error.kind).toBe('connection_status_not_available');
    expect(build({ status: 'NOT_IMPLEMENTED' as 'ACTIVE' }).ok).toBe(false);
  });

  it('reads ACTIVE as "the person may supply data", never as connected', () => {
    const built = build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(acceptsSubjectSuppliedData(built.value)).toBe(true);
    expect(impliesLiveInstitutionLink(built.value.status)).toBe(false);
  });
});

describe('the connection factory', () => {
  it('builds a MANUAL connection at version 1 with a redacting label', () => {
    const built = build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.rail).toBe('MANUAL');
    expect(built.value.version).toBe(1);
    expect(built.value.displayLabel.reveal()).toBe('Synthetic Test Connection One');
    // The label is HSF: every accidental rendering path yields a marker.
    expect(String(built.value.displayLabel)).toBe(HSF_REDACTION);
    expect(JSON.stringify(built.value.displayLabel)).toBe(`"${HSF_REDACTION}"`);
    expect(`${built.value.displayLabel}`).toBe(HSF_REDACTION);
  });

  it('requires a label, because several connections to one issuer are ordinary', () => {
    const blank = build({ displayLabel: '   ' });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error.kind).toBe('invalid_display_text');
  });

  it('refuses an over-long label rather than truncating it', () => {
    const built = build({ displayLabel: 'x'.repeat(121) });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.kind).toBe('invalid_display_text');
  });

  it('never quotes the label in a refusal — it is HIGHLY_SENSITIVE_FINANCIAL', () => {
    const secret = 'Synthetic Test Connection With A Very Distinctive Label';
    const built = build({ displayLabel: `${secret}${'x'.repeat(200)}` });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.message).not.toContain(secret);
  });

  it('carries the principal onto the row, never a caller-supplied owner', () => {
    const built = build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(TenantId.toString(built.value.tenantId)).toBe(TenantId.toString(TENANT_A));
    expect(UserId.toString(built.value.userId)).toBe(UserId.toString(USER_A1));
  });
});

describe('the rail is immutable, and the edit surface says so', () => {
  it('offers no way to change the rail', () => {
    const built = build();
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const edited = applyConnectionEdit(
      built.value,
      { displayLabel: 'Synthetic Test Connection Renamed', status: 'RETIRED' },
      clock.now(),
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.rail).toBe('MANUAL');
    expect(edited.value.status).toBe('RETIRED');
    expect(edited.value.version).toBe(2);
    // A retired connection no longer accepts data.
    expect(acceptsSubjectSuppliedData(edited.value)).toBe(false);
  });
});

describe('a device signal is never authoritative', () => {
  it('answers false only for DEVICE_SIGNAL', () => {
    for (const rail of CONNECTION_RAILS) {
      expect(mayBeAuthoritative(rail)).toBe(rail !== 'DEVICE_SIGNAL');
    }
  });
});
