import { describe, expect, it } from 'vitest';

import {
  AT_CREATION,
  AT_EVALUATION,
  DEFAULT_RESOLUTION_STRATEGIES,
  MOST_RESTRICTIVE,
  createResolutionStrategyRegistry,
} from './strategies';

describe('resolution-strategy registry', () => {
  it('registers exactly the three launch strategies and answers by lookup', () => {
    expect([...DEFAULT_RESOLUTION_STRATEGIES.ids()].sort()).toEqual([
      'AT_CREATION',
      'AT_EVALUATION',
      'MOST_RESTRICTIVE',
    ]);
    expect(DEFAULT_RESOLUTION_STRATEGIES.get('AT_CREATION')).toBe(AT_CREATION);
  });

  it('has NO default: an unknown id resolves to undefined, never a fallback', () => {
    expect(DEFAULT_RESOLUTION_STRATEGIES.get('SOMETHING_ELSE')).toBeUndefined();
    expect(DEFAULT_RESOLUTION_STRATEGIES.has('SOMETHING_ELSE')).toBe(false);
  });

  it('AT_CREATION governs by the creation-time version and fails closed without one', () => {
    expect(
      AT_CREATION.governingVersions({ versionAtCreation: 'qa/v1', versionAtEvaluation: 'qa/v2' }),
    ).toEqual(['qa/v1']);
    expect(
      AT_CREATION.governingVersions({ versionAtCreation: null, versionAtEvaluation: 'qa/v2' }),
    ).toEqual([]);
  });

  it('AT_EVALUATION governs by the evaluation-time version', () => {
    expect(
      AT_EVALUATION.governingVersions({ versionAtCreation: 'qa/v1', versionAtEvaluation: 'qa/v2' }),
    ).toEqual(['qa/v2']);
  });

  it('MOST_RESTRICTIVE consults both versions (deduplicated)', () => {
    expect(
      MOST_RESTRICTIVE.governingVersions({
        versionAtCreation: 'qa/v1',
        versionAtEvaluation: 'qa/v2',
      }),
    ).toEqual(['qa/v1', 'qa/v2']);
    expect(
      MOST_RESTRICTIVE.governingVersions({
        versionAtCreation: 'qa/v1',
        versionAtEvaluation: 'qa/v1',
      }),
    ).toEqual(['qa/v1']);
  });

  it('adding a strategy is additive: existing lookups are untouched, duplicates throw', () => {
    const extension = {
      id: 'JURISDICTION_SPECIFIED',
      description: 'test extension',
      governingVersions: () => [],
    };
    const wider = createResolutionStrategyRegistry([
      AT_CREATION,
      AT_EVALUATION,
      MOST_RESTRICTIVE,
      extension,
    ]);
    expect(wider.get('AT_CREATION')).toBe(AT_CREATION);
    expect(wider.get('JURISDICTION_SPECIFIED')).toBe(extension);
    expect(() => createResolutionStrategyRegistry([AT_CREATION, AT_CREATION])).toThrow(
      /registered twice/,
    );
  });
});
