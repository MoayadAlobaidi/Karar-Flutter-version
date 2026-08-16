// Test support only (not exported from the package index): a synthetic,
// fully-DECIDED pack over synthetic capability ids. Positive fixtures live
// here because the REAL qa/v1 draft decides nothing and clears nothing —
// synthetic ids never enter the real registry, production builds, or rows.

import { jurisdictionId } from '../jurisdiction-id';
import { decided } from '../decision';
import type { PolicyPack } from '../policy-pack';

export const TEST_JURISDICTION = jurisdictionId('ZZ-TEST');

export const SYNTH_CAP = 'SYNTH_LEDGER';
export const SYNTH_DISCLOSING_CAP = 'SYNTH_DISCLOSER';

export interface SyntheticPackOverrides {
  readonly version?: string;
  readonly lifecycle?: PolicyPack['lifecycle'];
  readonly reviewStatus?: PolicyPack['reviewStatus'];
  readonly effectiveFrom?: Date;
  readonly effectiveTo?: Date | null;
  readonly clearedCapabilities?: readonly string[];
  readonly resolutionStrategies?: Readonly<Partial<Record<string, string>>>;
  readonly approvalPolicies?: PolicyPack['approvalPolicies'];
  readonly declaredPurposes?: readonly string[];
  readonly processingBases?: PolicyPack['processingBases'];
  readonly approvalReference?: string | null;
  readonly jurisdiction?: PolicyPack['jurisdiction'];
}

/** An APPROVED, evidence-carrying, fully-decided synthetic pack. */
export function syntheticPack(overrides: SyntheticPackOverrides = {}): PolicyPack {
  const cleared = overrides.clearedCapabilities ?? [SYNTH_CAP, SYNTH_DISCLOSING_CAP];
  const strategies =
    overrides.resolutionStrategies ??
    Object.fromEntries(cleared.map((id) => [id, 'AT_CREATION' as const]));
  return {
    jurisdiction: overrides.jurisdiction ?? TEST_JURISDICTION,
    version: overrides.version ?? 'zz-test/v1',
    lifecycle: overrides.lifecycle ?? 'APPROVED',
    reviewStatus: overrides.reviewStatus ?? 'REVIEW_COMPLETE',
    effectiveFrom: overrides.effectiveFrom ?? new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: overrides.effectiveTo === undefined ? null : overrides.effectiveTo,
    financialRulesets: Object.fromEntries(
      cleared.map((id) => [
        id,
        decided({ rulesetId: 'synthetic-ruleset', rulesetVersion: 'v1' }, 'synthetic test basis'),
      ]),
    ),
    consentRequirements: decided(
      [{ purposeRef: 'purpose:synthetic', documentKind: 'SYNTHETIC_NOTICE' }],
      'synthetic test basis',
    ),
    declaredPurposes: overrides.declaredPurposes ?? ['purpose:synthetic'],
    processingBases:
      overrides.processingBases ??
      Object.freeze({ 'purpose:synthetic': decided('basis:consent', 'synthetic test basis') }),
    retention: Object.freeze({
      'synthetic-records': decided({ duration: 'P1Y' }, 'synthetic test basis'),
    }),
    identityRequirements: decided(
      [{ kind: 'VERIFIED_IDENTITY', description: 'synthetic verification requirement' }],
      'synthetic test basis',
    ),
    disclosurePolicy: decided(
      { requiredDocumentKinds: ['SYNTHETIC_DISCLOSURE'] },
      'synthetic test basis',
    ),
    approvalPolicies:
      overrides.approvalPolicies ??
      Object.freeze({
        [SYNTH_DISCLOSING_CAP]: decided(
          { workflow: 'synthetic-approval', approverRole: 'SYNTHETIC_REVIEWER' },
          'synthetic test basis',
        ),
      }),
    currencyPolicy: decided(
      { baseCurrency: 'QAR', permittedCurrencies: ['QAR', 'USD'] },
      'synthetic test basis',
    ),
    aiProcessingPolicy: decided(
      { permitted: true, crossBorderTransferPermitted: false, conditions: [] },
      'synthetic test basis',
    ),
    clearedCapabilities: cleared,
    resolutionStrategies: strategies,
    subjectPolicyOptions: Object.freeze({
      [SYNTH_CAP]: {
        optionSetId: 'synthetic-options',
        version: 'v1',
        permittedOptionIds: ['option-a', 'option-b'],
      },
    }),
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
