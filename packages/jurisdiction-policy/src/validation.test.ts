import { describe, expect, it } from 'vitest';

import { validatePack, validatePackSet } from './validation';
import { createResolutionStrategyRegistry, AT_CREATION } from './resolution/strategies';
import { pendingLegalReview } from './decision';
import { SYNTH_CAP, SYNTH_DISCLOSING_CAP, syntheticPack } from './__tests__/synthetic-pack';

const DISCLOSING = { disclosureBearingCapabilityIds: [SYNTH_DISCLOSING_CAP] };

describe('validatePack (§46 matrix)', () => {
  it('accepts a valid synthetic pack', () => {
    expect(validatePack(syntheticPack(), DISCLOSING)).toHaveLength(0);
  });

  it('fails on a missing version', () => {
    const findings = validatePack(syntheticPack({ version: '' }), DISCLOSING);
    expect(findings.map((f) => f.kind)).toContain('MISSING_VERSION');
  });

  it('fails when a cleared capability names no resolution strategy — no default exists', () => {
    const pack = syntheticPack({
      resolutionStrategies: { [SYNTH_DISCLOSING_CAP]: 'AT_CREATION' }, // SYNTH_CAP omitted
    });
    const findings = validatePack(pack, DISCLOSING);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'MISSING_RESOLUTION_STRATEGY', capabilityId: SYNTH_CAP }),
    );
  });

  it('fails on an unregistered strategy name', () => {
    const pack = syntheticPack({
      resolutionStrategies: {
        [SYNTH_CAP]: 'INVENTED_FALLBACK',
        [SYNTH_DISCLOSING_CAP]: 'AT_CREATION',
      },
    });
    expect(validatePack(pack, DISCLOSING)).toContainEqual(
      expect.objectContaining({
        kind: 'UNKNOWN_RESOLUTION_STRATEGY',
        capabilityId: SYNTH_CAP,
        strategyId: 'INVENTED_FALLBACK',
      }),
    );
  });

  it('fails when a declared purpose has no processing-basis entry at all', () => {
    const pack = syntheticPack({
      declaredPurposes: ['purpose:synthetic', 'purpose:unanswered'],
    });
    expect(validatePack(pack, DISCLOSING)).toContainEqual(
      expect.objectContaining({
        kind: 'MISSING_PROCESSING_BASIS',
        purposeRef: 'purpose:unanswered',
      }),
    );
  });

  it('accepts an explicitly PENDING basis — a pending decision is a valid state', () => {
    const pack = syntheticPack({
      declaredPurposes: ['purpose:synthetic', 'purpose:under-review'],
      processingBases: {
        'purpose:synthetic': { state: 'DECIDED', value: 'basis:consent', basis: 'synthetic' },
        'purpose:under-review': pendingLegalReview('with counsel'),
      },
    });
    expect(validatePack(pack, DISCLOSING)).toHaveLength(0);
  });

  it('fails when a cleared disclosure-bearing capability has no DECIDED approval policy', () => {
    const missing = syntheticPack({ approvalPolicies: {} });
    expect(validatePack(missing, DISCLOSING)).toContainEqual(
      expect.objectContaining({
        kind: 'MISSING_APPROVAL_POLICY',
        capabilityId: SYNTH_DISCLOSING_CAP,
      }),
    );

    const pending = syntheticPack({
      approvalPolicies: { [SYNTH_DISCLOSING_CAP]: pendingLegalReview('workflow undecided') },
    });
    expect(validatePack(pending, DISCLOSING)).toContainEqual(
      expect.objectContaining({
        kind: 'MISSING_APPROVAL_POLICY',
        capabilityId: SYNTH_DISCLOSING_CAP,
      }),
    );

    // The same pack with no disclosure-bearing declaration passes: the rule
    // binds disclosure to approval, not every capability to approval.
    expect(validatePack(missing, {})).toHaveLength(0);
  });

  it('fails an APPROVED lifecycle without approval evidence', () => {
    const pack = syntheticPack({ approvalReference: null });
    expect(validatePack(pack, DISCLOSING)).toContainEqual(
      expect.objectContaining({ kind: 'APPROVAL_EVIDENCE_MISSING' }),
    );
  });

  it('fails a DECIDED entry that carries no basis', () => {
    const pack = syntheticPack({
      processingBases: {
        'purpose:synthetic': { state: 'DECIDED', value: 'basis:consent', basis: '' },
      },
    });
    expect(validatePack(pack, DISCLOSING)).toContainEqual(
      expect.objectContaining({ kind: 'DECISION_WITHOUT_BASIS' }),
    );
  });

  it('accepts ids admitted by a WIDER strategy registry without any other change', () => {
    const wider = createResolutionStrategyRegistry([
      AT_CREATION,
      {
        id: 'JURISDICTION_SPECIFIED',
        description: 'test extension',
        governingVersions: () => [],
      },
    ]);
    const pack = syntheticPack({
      resolutionStrategies: {
        [SYNTH_CAP]: 'JURISDICTION_SPECIFIED',
        [SYNTH_DISCLOSING_CAP]: 'AT_CREATION',
      },
    });
    expect(validatePack(pack, { ...DISCLOSING, strategies: wider })).toHaveLength(0);
    // The launch registry still refuses it: no default admission anywhere.
    expect(validatePack(pack, DISCLOSING).map((f) => f.kind)).toContain(
      'UNKNOWN_RESOLUTION_STRATEGY',
    );
  });
});

describe('validatePackSet', () => {
  it('fails overlapping effective periods within one jurisdiction', () => {
    const v1 = syntheticPack({
      version: 'zz-test/v1',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    });
    const v2 = syntheticPack({
      version: 'zz-test/v2',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
      effectiveTo: null,
    });
    expect(validatePackSet([v1, v2], DISCLOSING)).toContainEqual(
      expect.objectContaining({ kind: 'OVERLAPPING_EFFECTIVE_PERIODS' }),
    );
  });

  it('accepts adjacent periods (v1 ends where v2 begins) and flags duplicates', () => {
    const v1 = syntheticPack({
      version: 'zz-test/v1',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-06-01T00:00:00.000Z'),
    });
    const v2 = syntheticPack({
      version: 'zz-test/v2',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
      effectiveTo: null,
    });
    expect(validatePackSet([v1, v2], DISCLOSING)).toHaveLength(0);
    expect(validatePackSet([v1, v1], DISCLOSING)).toContainEqual(
      expect.objectContaining({ kind: 'DUPLICATE_VERSION' }),
    );
  });
});
