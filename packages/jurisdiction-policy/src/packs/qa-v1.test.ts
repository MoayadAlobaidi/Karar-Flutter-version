import { describe, expect, it } from 'vitest';

import { QA_V1, POLICY_PACKS } from './qa-v1';
import { validatePack, validatePackSet } from '../validation';
import { isDecided } from '../decision';

// §46: the REAL qa/v1 — a structurally valid draft that decides nothing,
// clears nothing, and cannot be treated as approved anywhere.

describe('qa/v1 draft pack', () => {
  it('is DRAFT, PENDING_LEGAL_REVIEW, and carries no approval evidence', () => {
    expect(QA_V1.lifecycle).toBe('DRAFT');
    expect(QA_V1.reviewStatus).toBe('PENDING_LEGAL_REVIEW');
    expect(QA_V1.approvalReference).toBeNull();
    expect(QA_V1.version).toBe('qa/v1');
    expect(String(QA_V1.jurisdiction)).toBe('QA');
  });

  it('clears NO capability — real or synthetic', () => {
    expect(QA_V1.clearedCapabilities).toHaveLength(0);
    expect(Object.keys(QA_V1.resolutionStrategies)).toHaveLength(0);
    expect(Object.keys(QA_V1.subjectPolicyOptions)).toHaveLength(0);
    expect(Object.keys(QA_V1.approvalPolicies)).toHaveLength(0);
  });

  it('fabricates no legal decision: every decision slot is explicitly PENDING with a reason', () => {
    const decisions: ReadonlyArray<{ readonly state: string; readonly reason?: string }> = [
      QA_V1.consentRequirements,
      QA_V1.identityRequirements,
      QA_V1.disclosurePolicy,
      QA_V1.currencyPolicy,
      QA_V1.aiProcessingPolicy,
      ...Object.values(QA_V1.processingBases),
      ...Object.values(QA_V1.retention),
    ];
    expect(decisions.length).toBeGreaterThan(0);
    for (const decision of decisions) {
      expect(decision.state).toBe('PENDING_LEGAL_REVIEW');
      expect(decision.reason?.length ?? 0).toBeGreaterThan(0);
    }
    expect(isDecided(QA_V1.aiProcessingPolicy)).toBe(false);
  });

  it('every declared purpose carries an explicit basis state — none is silently absent', () => {
    for (const purpose of QA_V1.declaredPurposes) {
      expect(QA_V1.processingBases[purpose]).toBeDefined();
    }
  });

  it('is a VALID pack: pending everywhere is a legitimate state, not a defect', () => {
    expect(validatePack(QA_V1)).toHaveLength(0);
    expect(validatePackSet([...POLICY_PACKS])).toHaveLength(0);
  });
});
