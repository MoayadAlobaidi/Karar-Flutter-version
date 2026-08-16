import { describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';

import {
  evaluateRedeemability,
  isValidInvitationEmail,
  isValidRoleHint,
  normalizeInvitationEmail,
  type TenantInvitation,
} from '../domain/tenancy.js';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const LATER = new Date('2026-08-17T12:00:00.000Z');

function invitation(overrides: Partial<TenantInvitation> = {}): TenantInvitation {
  return {
    id: 'inv-1',
    tenantId: TenantId.of('aaaaaaaa-0000-4000-8000-00000000000a'),
    email: 'invitee@example.com',
    roleHint: 'MEMBER',
    expiresAt: LATER,
    redeemedAt: null,
    redeemedBy: null,
    revokedAt: null,
    attempts: 0,
    maxAttempts: 5,
    createdBy: UserId.of('a1a1a1a1-0000-4000-8000-0000000000a1'),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('normalizeInvitationEmail / validation', () => {
  it('normalizes by trim + lowercase and matching uses the normalized form', () => {
    expect(normalizeInvitationEmail('  Invitee@Example.COM ')).toBe('invitee@example.com');
  });

  it('accepts sane emails and rejects junk', () => {
    expect(isValidInvitationEmail('invitee@example.com')).toBe(true);
    for (const bad of ['', 'not-an-email', 'a@b', '@example.com', `x@${'y'.repeat(300)}.com`]) {
      expect(isValidInvitationEmail(bad)).toBe(false);
    }
  });

  it('role hints are short UPPER_SNAKE labels', () => {
    expect(isValidRoleHint('MEMBER')).toBe(true);
    expect(isValidRoleHint('TENANT_ADMIN')).toBe(true);
    for (const bad of ['', 'member', 'ADMIN!', 'A'.repeat(41), 'DROP TABLE']) {
      expect(isValidRoleHint(bad)).toBe(false);
    }
  });
});

describe('evaluateRedeemability — denial-priority order', () => {
  it('allows a live invitation with the matching verified email', () => {
    expect(evaluateRedeemability(invitation(), NOW, 'Invitee@example.com ').ok).toBe(true);
  });

  it('denies revoked before anything else', () => {
    const result = evaluateRedeemability(
      invitation({ revokedAt: NOW, redeemedAt: NOW }),
      NOW,
      'invitee@example.com',
    );
    expect(!result.ok && result.error === 'revoked').toBe(true);
  });

  it('denies already_redeemed', () => {
    const result = evaluateRedeemability(invitation({ redeemedAt: NOW }), NOW, 'invitee@example.com');
    expect(!result.ok && result.error === 'already_redeemed').toBe(true);
  });

  it('denies expired at and after the boundary instant', () => {
    const result = evaluateRedeemability(invitation({ expiresAt: NOW }), NOW, 'invitee@example.com');
    expect(!result.ok && result.error === 'expired').toBe(true);
  });

  it('denies attempts_exhausted before revealing whether the email would match', () => {
    const result = evaluateRedeemability(
      invitation({ attempts: 5 }),
      NOW,
      'invitee@example.com',
    );
    expect(!result.ok && result.error === 'attempts_exhausted').toBe(true);
  });

  it('denies email_mismatch, including a redeemer with no verified email at all', () => {
    const wrong = evaluateRedeemability(invitation(), NOW, 'other@example.com');
    expect(!wrong.ok && wrong.error === 'email_mismatch').toBe(true);
    const none = evaluateRedeemability(invitation(), NOW, null);
    expect(!none.ok && none.error === 'email_mismatch').toBe(true);
  });
});
