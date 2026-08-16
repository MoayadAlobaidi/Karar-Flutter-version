import { describe, expect, it } from 'vitest';

import { resolveConsentStatus, statusPermitsProcessing } from '../domain/consent-status.js';
import { versionMayPublish } from '../domain/legal-document.js';
import type { VersionClassification } from '../domain/legal-document.js';

// The classification matrix (ADR-0024; jurisdiction-policy.md §10) as pure
// resolution — every arm, including the defensive fail-closed ones.
describe('resolveConsentStatus', () => {
  const grant = {
    id: 'grant-1',
    status: 'ACTIVE' as const,
    consentVersion: '1.0.0',
    legalDocumentVersionId: 'v1',
  };
  const v1EffectiveAt = new Date('2026-01-01T00:00:00Z');
  const newerVersion = (classification: VersionClassification | null) => ({
    id: 'v2',
    version: '2.0.0',
    classification,
    effectiveAt: new Date('2026-02-01T00:00:00Z'),
  });

  it('no grant -> NO_GRANT (fail closed)', () => {
    const status = resolveConsentStatus({
      grant: null,
      grantedVersionEffectiveAt: null,
      effectiveVersion: newerVersion('NO_USER_ACTION_REQUIRED'),
    });
    expect(status.state).toBe('NO_GRANT');
    expect(statusPermitsProcessing(status.state)).toBe(false);
  });

  it('withdrawn grant -> WITHDRAWN (fail closed)', () => {
    const status = resolveConsentStatus({
      grant: { ...grant, status: 'WITHDRAWN' },
      grantedVersionEffectiveAt: v1EffectiveAt,
      effectiveVersion: newerVersion('NO_USER_ACTION_REQUIRED'),
    });
    expect(status.state).toBe('WITHDRAWN');
    expect(statusPermitsProcessing(status.state)).toBe(false);
  });

  it('active grant on the current version -> ACTIVE, no notice', () => {
    const status = resolveConsentStatus({
      grant,
      grantedVersionEffectiveAt: v1EffectiveAt,
      effectiveVersion: {
        id: 'v1',
        version: '1.0.0',
        classification: 'NO_USER_ACTION_REQUIRED',
        effectiveAt: v1EffectiveAt,
      },
    });
    expect(status).toMatchObject({ state: 'ACTIVE', noticeRequired: false });
    expect(statusPermitsProcessing(status.state)).toBe(true);
  });

  it('newer MATERIAL version -> RECONSENT_REQUIRED (fail closed)', () => {
    const status = resolveConsentStatus({
      grant,
      grantedVersionEffectiveAt: v1EffectiveAt,
      effectiveVersion: newerVersion('MATERIAL_REACCEPTANCE_REQUIRED'),
    });
    expect(status.state).toBe('RECONSENT_REQUIRED');
    expect(statusPermitsProcessing(status.state)).toBe(false);
  });

  it('newer NOTICE version -> the acceptance stands, with the notice flag', () => {
    const status = resolveConsentStatus({
      grant,
      grantedVersionEffectiveAt: v1EffectiveAt,
      effectiveVersion: newerVersion('NOTICE_REQUIRED'),
    });
    expect(status).toMatchObject({ state: 'ACTIVE', noticeRequired: true });
    expect(statusPermitsProcessing(status.state)).toBe(true);
  });

  it('newer NO_ACTION version -> unchanged', () => {
    const status = resolveConsentStatus({
      grant,
      grantedVersionEffectiveAt: v1EffectiveAt,
      effectiveVersion: newerVersion('NO_USER_ACTION_REQUIRED'),
    });
    expect(status).toMatchObject({ state: 'ACTIVE', noticeRequired: false });
  });

  it('newer version with NO classification -> RECONSENT_REQUIRED (defensive fail-closed)', () => {
    const status = resolveConsentStatus({
      grant,
      grantedVersionEffectiveAt: v1EffectiveAt,
      effectiveVersion: newerVersion(null),
    });
    expect(status.state).toBe('RECONSENT_REQUIRED');
  });

  it('an OLDER effective version than the granted one leaves the acceptance standing', () => {
    const status = resolveConsentStatus({
      grant,
      grantedVersionEffectiveAt: new Date('2026-03-01T00:00:00Z'),
      effectiveVersion: newerVersion('MATERIAL_REACCEPTANCE_REQUIRED'), // effective 2026-02-01
    });
    expect(status.state).toBe('ACTIVE');
  });

  it('no effective version at all -> the grant stands', () => {
    const status = resolveConsentStatus({
      grant,
      grantedVersionEffectiveAt: v1EffectiveAt,
      effectiveVersion: null,
    });
    expect(status.state).toBe('ACTIVE');
  });
});

// The publication rule: no classification, no publication — no default.
describe('versionMayPublish', () => {
  it('refuses an unclassified version', () => {
    const refusal = versionMayPublish({ id: 'v1', classification: null, publishedAt: null });
    expect(refusal?.refusal).toBe('UNCLASSIFIED');
  });

  it('refuses a published version (immutable)', () => {
    const refusal = versionMayPublish({
      id: 'v1',
      classification: 'NOTICE_REQUIRED',
      publishedAt: new Date(),
    });
    expect(refusal?.refusal).toBe('ALREADY_PUBLISHED');
  });

  it('permits a classified draft', () => {
    expect(
      versionMayPublish({ id: 'v1', classification: 'MATERIAL_REACCEPTANCE_REQUIRED', publishedAt: null }),
    ).toBeNull();
  });
});
