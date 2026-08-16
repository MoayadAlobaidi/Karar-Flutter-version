import { describe, expect, it } from 'vitest';

import {
  COUNTRIES,
  JURISDICTIONS,
  countryCode,
  findCountry,
  findJurisdiction,
  jurisdictionId,
  sameJurisdiction,
} from './index';

describe('jurisdictionId', () => {
  it('brands without altering the value', () => {
    expect(jurisdictionId('QA')).toBe('QA');
    expect(sameJurisdiction(jurisdictionId('QA'), 'QA')).toBe(true);
    expect(sameJurisdiction(jurisdictionId('QA'), 'AE')).toBe(false);
  });
});

describe('country reference data', () => {
  it('carries display, currency, and status attributes only — data, never policy', () => {
    const qa = findCountry('QA');
    expect(qa).toMatchObject({
      displayNameKey: 'country.qa',
      defaultCurrency: 'QAR',
      status: 'ACTIVE',
    });
    for (const country of COUNTRIES) {
      expect(Object.keys(country).sort()).toEqual([
        'code',
        'defaultCurrency',
        'displayNameKey',
        'status',
      ]);
    }
  });

  it('rejects malformed alpha-2 codes as defects', () => {
    expect(() => countryCode('QAT')).toThrow(/alpha-2/);
    expect(() => countryCode('qa')).toThrow(/alpha-2/);
  });
});

describe('jurisdiction reference data', () => {
  it('does not assume one jurisdiction per country', () => {
    const aeRegimes = JURISDICTIONS.filter((entry) => entry.countryCode === 'AE');
    expect(aeRegimes.length).toBeGreaterThan(1);
    expect(findJurisdiction('AE-DIFC')?.type).toBe('FINANCIAL_FREE_ZONE');
  });

  it('fabricates no approval: every seeded jurisdiction is DRAFT with stated provenance', () => {
    expect(JURISDICTIONS.length).toBeGreaterThan(0);
    for (const entry of JURISDICTIONS) {
      expect(['DRAFT', 'PENDING_LEGAL_REVIEW']).toContain(entry.status);
      expect(entry.status).not.toBe('APPROVED');
      expect(entry.effectiveFrom).toBeNull();
      expect(entry.provenance.length).toBeGreaterThan(0);
    }
  });

  it('references only known countries', () => {
    for (const entry of JURISDICTIONS) {
      expect(findCountry(entry.countryCode)).toBeDefined();
    }
  });
});
