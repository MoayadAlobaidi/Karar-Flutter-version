/**
 * Test fixture only: a fully-DECIDED, APPROVED synthetic pack over a
 * synthetic jurisdiction and synthetic capability ids. Positive activation
 * fixtures live here because the REAL qa/v1 decides nothing and is not
 * production-activatable; synthetic ids and the ZZ-TEST regime never enter
 * production builds, the real registry, or non-test databases.
 */

import { decided, jurisdictionId, type PolicyPack } from '@karar/jurisdiction-policy';

export interface SyntheticApprovedPackOverrides {
  readonly version?: string;
  readonly approvalReference?: string | null;
}

export function syntheticApprovedPack(overrides: SyntheticApprovedPackOverrides): PolicyPack {
  return {
    jurisdiction: jurisdictionId('ZZ-TEST'),
    version: overrides.version ?? 'zz-test/v1',
    lifecycle: 'APPROVED',
    reviewStatus: 'REVIEW_COMPLETE',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    financialRulesets: {
      SYNTH_LEDGER: decided(
        { rulesetId: 'synthetic-ruleset', rulesetVersion: 'v1' },
        'synthetic test basis',
      ),
    },
    consentRequirements: decided([], 'synthetic test basis'),
    declaredPurposes: [],
    processingBases: {},
    retention: {},
    identityRequirements: decided([], 'synthetic test basis'),
    disclosurePolicy: decided({ requiredDocumentKinds: [] }, 'synthetic test basis'),
    approvalPolicies: {},
    currencyPolicy: decided(
      { baseCurrency: 'QAR', permittedCurrencies: ['QAR'] },
      'synthetic test basis',
    ),
    aiProcessingPolicy: decided(
      { permitted: false, crossBorderTransferPermitted: false, conditions: [] },
      'synthetic test basis',
    ),
    clearedCapabilities: ['SYNTH_LEDGER'],
    resolutionStrategies: { SYNTH_LEDGER: 'AT_CREATION' },
    subjectPolicyOptions: {},
    provenance: {
      declaredBy: 'test-suite',
      declaredAt: new Date('2026-01-01T00:00:00.000Z'),
      source: 'synthetic fixture — test files only',
    },
    approvalReference:
      overrides.approvalReference === undefined
        ? 'synthetic-approval-record-1'
        : overrides.approvalReference,
  };
}
