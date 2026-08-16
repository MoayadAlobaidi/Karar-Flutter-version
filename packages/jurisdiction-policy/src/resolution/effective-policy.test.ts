import { describe, expect, it } from 'vitest';

import { resolveEffectivePolicy, type ResolveEffectivePolicyInput } from './effective-policy';
import { createResolutionStrategyRegistry, DEFAULT_RESOLUTION_STRATEGIES } from './strategies';
import {
  SYNTH_CAP,
  SYNTH_DISCLOSING_CAP,
  TEST_JURISDICTION,
  syntheticPack,
} from '../__tests__/synthetic-pack';
import { QA_V1 } from '../packs/qa-v1';
import { jurisdictionId } from '../jurisdiction-id';

const AT = new Date('2026-08-01T00:00:00.000Z');

function baseInput(
  overrides: Partial<ResolveEffectivePolicyInput> = {},
): ResolveEffectivePolicyInput {
  return {
    jurisdiction: TEST_JURISDICTION,
    requestedAt: AT,
    packs: [syntheticPack()],
    selection: { kind: 'IN_FORCE' },
    environment: 'production',
    disclosureBearingCapabilityIds: [SYNTH_DISCLOSING_CAP],
    ...overrides,
  };
}

describe('resolveEffectivePolicy', () => {
  it('resolves the in-force pack and pins provenance: jurisdiction + pack version + strategy ids', () => {
    const resolved = resolveEffectivePolicy(baseInput());
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const policy = resolved.value;
    expect(policy.packVersion).toBe('zz-test/v1');
    expect(String(policy.jurisdiction)).toBe(String(TEST_JURISDICTION));
    expect(policy.capabilityCeiling).toEqual(
      expect.arrayContaining([
        { capabilityId: SYNTH_CAP, strategyId: 'AT_CREATION' },
        { capabilityId: SYNTH_DISCLOSING_CAP, strategyId: 'AT_CREATION' },
      ]),
    );
    expect(policy.provenance).toMatchObject({
      packVersion: 'zz-test/v1',
      packLifecycle: 'APPROVED',
      environment: 'production',
      selection: 'IN_FORCE',
      settingsVersion: null,
    });
    expect(policy.provenance.strategyByCapability).toMatchObject({
      [SYNTH_CAP]: 'AT_CREATION',
      [SYNTH_DISCLOSING_CAP]: 'AT_CREATION',
    });
    // The subject-selection slot ships empty; consumers fill it where a
    // capability declares elective options.
    expect(policy.subjectPolicySelectionVersion).toBeNull();
    expect(policy.unresolved).toHaveLength(0);
  });

  it('fails closed on jurisdictions and versions it does not know', () => {
    const noJurisdiction = resolveEffectivePolicy(
      baseInput({ jurisdiction: jurisdictionId('XX-UNKNOWN') }),
    );
    expect(!noJurisdiction.ok && noJurisdiction.error.kind).toBe('NO_PACK_FOR_JURISDICTION');

    const noVersion = resolveEffectivePolicy(
      baseInput({ selection: { kind: 'EXPLICIT_VERSION', version: 'zz-test/v9' } }),
    );
    expect(!noVersion.ok && noVersion.error.kind).toBe('PACK_VERSION_NOT_FOUND');
  });

  it('denies a DRAFT pack in production through IN_FORCE selection (§46)', () => {
    const draft = syntheticPack({ lifecycle: 'DRAFT', approvalReference: null });
    const denied = resolveEffectivePolicy(baseInput({ packs: [draft] }));
    expect(denied.ok).toBe(false);
    if (!denied.ok && denied.error.kind === 'PACK_NOT_RESOLVABLE') {
      expect(denied.error.reasons[0]?.kind).toBe('LIFECYCLE_NOT_ACTIVATABLE');
    } else {
      expect.fail(`expected PACK_NOT_RESOLVABLE, got ${JSON.stringify(denied)}`);
    }
    // The same draft resolves locally: local development may load drafts.
    expect(resolveEffectivePolicy(baseInput({ packs: [draft], environment: 'local' })).ok).toBe(
      true,
    );
  });

  it('resolves a RETIRED pack historically by explicit version — history never rewrites', () => {
    const retired = syntheticPack({
      version: 'zz-test/v1',
      lifecycle: 'RETIRED',
      effectiveTo: new Date('2026-06-01T00:00:00.000Z'),
    });
    const successor = syntheticPack({
      version: 'zz-test/v2',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
    });
    const packs = [retired, successor];

    const historical = resolveEffectivePolicy(
      baseInput({ packs, selection: { kind: 'EXPLICIT_VERSION', version: 'zz-test/v1' } }),
    );
    expect(historical.ok).toBe(true);
    if (historical.ok) {
      expect(historical.value.packVersion).toBe('zz-test/v1');
      expect(historical.value.packLifecycle).toBe('RETIRED');
    }

    // IN_FORCE at the same instant resolves the successor, not the retired pack.
    const current = resolveEffectivePolicy(baseInput({ packs }));
    expect(current.ok && current.value.packVersion).toBe('zz-test/v2');
  });

  it('keeps historical explicit-version resolution IDENTICAL after a new version appears', () => {
    const v1 = syntheticPack({
      version: 'zz-test/v1',
      effectiveTo: new Date('2026-06-01T00:00:00.000Z'),
    });
    const before = resolveEffectivePolicy(
      baseInput({ packs: [v1], selection: { kind: 'EXPLICIT_VERSION', version: 'zz-test/v1' } }),
    );
    const v2 = syntheticPack({
      version: 'zz-test/v2',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
    });
    const after = resolveEffectivePolicy(
      baseInput({
        packs: [v1, v2],
        selection: { kind: 'EXPLICIT_VERSION', version: 'zz-test/v1' },
      }),
    );
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) {
      expect(after.value).toEqual(before.value);
    }
  });

  it('fails closed on overlapping in-force versions instead of picking one', () => {
    const v1 = syntheticPack({ version: 'zz-test/v1' });
    const v2 = syntheticPack({ version: 'zz-test/v2' });
    const ambiguous = resolveEffectivePolicy(baseInput({ packs: [v1, v2] }));
    expect(!ambiguous.ok && ambiguous.error.kind).toBe('OVERLAPPING_PACKS_IN_FORCE');
  });

  it('refuses an invalid pack at resolution time (load-time posture)', () => {
    const invalid = syntheticPack({ resolutionStrategies: {} });
    const refused = resolveEffectivePolicy(baseInput({ packs: [invalid] }));
    expect(!refused.ok && refused.error.kind).toBe('PACK_INVALID');
  });

  it('RESTRICT-ONLY: settings can only shrink the ceiling, never expand it', () => {
    const pack = syntheticPack();
    const packCeiling = new Set(pack.clearedCapabilities);

    // Attempted "widening" inputs: ids the pack never cleared, alongside a
    // legitimate disable. The type has no enabling field — this list is the
    // closest expressible attack, and it must restrict nothing extra and
    // enable nothing at all.
    const attempts: ReadonlyArray<readonly string[]> = [
      [],
      ['CAP_THE_PACK_NEVER_CLEARED'],
      ['CAP_THE_PACK_NEVER_CLEARED', 'ANOTHER_UNCLEARED'],
      [SYNTH_CAP],
      [SYNTH_CAP, 'CAP_THE_PACK_NEVER_CLEARED'],
      [SYNTH_CAP, SYNTH_DISCLOSING_CAP],
    ];
    for (const disabledCapabilityIds of attempts) {
      const resolved = resolveEffectivePolicy(
        baseInput({ settings: { disabledCapabilityIds, settingsVersion: 7 } }),
      );
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) continue;
      const effective = resolved.value.capabilityCeiling.map((entry) => entry.capabilityId);
      // Subset of the pack ceiling, always.
      for (const id of effective) {
        expect(packCeiling.has(id)).toBe(true);
      }
      // Exactly the pack ceiling minus the disabled ids — unknown ids no-op.
      const expected = pack.clearedCapabilities.filter((id) => !disabledCapabilityIds.includes(id));
      expect(effective.sort()).toEqual([...expected].sort());
      expect(resolved.value.provenance.settingsVersion).toBe(7);
    }
  });

  it('RESTRICT-ONLY: an AI suspension narrows a DECIDED policy and cannot widen a pending one', () => {
    const suspended = resolveEffectivePolicy(
      baseInput({ settings: { aiProcessingSuspended: true } }),
    );
    expect(suspended.ok && suspended.value.aiProcessing.state).toBe('RESTRICTED_BY_SETTINGS');

    // qa/v1's AI policy is PENDING_LEGAL_REVIEW; a settings row saying
    // "not suspended" leaves it PENDING — settings never decide anything.
    const qa = resolveEffectivePolicy({
      jurisdiction: QA_V1.jurisdiction,
      requestedAt: new Date('2026-08-17T00:00:00.000Z'),
      packs: [QA_V1],
      selection: { kind: 'IN_FORCE' },
      environment: 'local',
      settings: { aiProcessingSuspended: false },
    });
    expect(qa.ok && qa.value.aiProcessing.state).toBe('PENDING_LEGAL_REVIEW');
  });

  it('surfaces explicit pending-legal states as typed denial reasons (§46: pending denies)', () => {
    const qa = resolveEffectivePolicy({
      jurisdiction: QA_V1.jurisdiction,
      requestedAt: new Date('2026-08-17T00:00:00.000Z'),
      packs: [QA_V1],
      selection: { kind: 'IN_FORCE' },
      environment: 'local',
    });
    expect(qa.ok).toBe(true);
    if (!qa.ok) return;
    // The real qa/v1 exposes NO capability…
    expect(qa.value.capabilityCeiling).toHaveLength(0);
    // …and every undecided question is a typed, reasoned denial state.
    expect(qa.value.unresolved.length).toBeGreaterThan(0);
    for (const entry of qa.value.unresolved) {
      expect(entry.state).toBe('PENDING_LEGAL_REVIEW');
      expect(entry.reason.length).toBeGreaterThan(0);
    }
    expect(qa.value.unresolved.map((entry) => entry.where)).toEqual(
      expect.arrayContaining([
        "processingBases['purpose:ai-processing']",
        'aiProcessingPolicy',
        'disclosurePolicy',
        'currencyPolicy',
        'identityRequirements',
        'consentRequirements',
      ]),
    );
  });

  it('a wider strategy registry leaves resolution of existing packs unchanged', () => {
    const wider = createResolutionStrategyRegistry([
      ...['AT_CREATION', 'AT_EVALUATION', 'MOST_RESTRICTIVE'].map(
        (id) =>
          DEFAULT_RESOLUTION_STRATEGIES.get(id) as NonNullable<
            ReturnType<typeof DEFAULT_RESOLUTION_STRATEGIES.get>
          >,
      ),
      {
        id: 'LATEST_FAVOURABLE_TO_SUBJECT',
        description: 'test extension',
        governingVersions: () => [],
      },
    ]);
    const withDefault = resolveEffectivePolicy(baseInput());
    const withWider = resolveEffectivePolicy(baseInput({ strategies: wider }));
    expect(withDefault.ok && withWider.ok).toBe(true);
    if (withDefault.ok && withWider.ok) {
      expect(withWider.value).toEqual(withDefault.value);
    }
  });
});
