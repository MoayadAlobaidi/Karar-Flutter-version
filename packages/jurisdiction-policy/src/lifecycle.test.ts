import { describe, expect, it } from 'vitest';

import { canActivate, canResolveExplicitVersion } from './lifecycle';
import { POLICY_ENVIRONMENTS } from './environment';
import { syntheticPack } from './__tests__/synthetic-pack';
import { QA_V1 } from './packs/qa-v1';

describe('canActivate (§46: DRAFT/unapproved activation gates)', () => {
  it('denies DRAFT activation in production — and in every non-local environment', () => {
    const draft = syntheticPack({ lifecycle: 'DRAFT', approvalReference: null });
    for (const environment of ['dev', 'staging', 'production'] as const) {
      const decision = canActivate(draft, environment);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reasons[0]?.kind).toBe('LIFECYCLE_NOT_ACTIVATABLE');
      }
    }
    expect(canActivate(draft, 'local').allowed).toBe(true);
  });

  it('denies PENDING_LEGAL_REVIEW activation outside local', () => {
    const pending = syntheticPack({ lifecycle: 'PENDING_LEGAL_REVIEW', approvalReference: null });
    expect(canActivate(pending, 'production').allowed).toBe(false);
    expect(canActivate(pending, 'local').allowed).toBe(true);
  });

  it('denies an APPROVED claim without evidence EVERYWHERE — absence means not approved', () => {
    const unevidenced = syntheticPack({ lifecycle: 'APPROVED', approvalReference: null });
    for (const environment of POLICY_ENVIRONMENTS) {
      const decision = canActivate(unevidenced, environment);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) {
        expect(decision.reasons[0]?.kind).toBe('APPROVAL_EVIDENCE_MISSING');
      }
    }
  });

  it('allows APPROVED-with-evidence in production and denies re-activating RETIRED anywhere', () => {
    expect(canActivate(syntheticPack(), 'production').allowed).toBe(true);
    const retired = syntheticPack({ lifecycle: 'RETIRED' });
    for (const environment of POLICY_ENVIRONMENTS) {
      expect(canActivate(retired, environment).allowed).toBe(false);
    }
  });

  it('refuses qa/v1 outside local: the real draft is not production-approvable', () => {
    expect(canActivate(QA_V1, 'local').allowed).toBe(true);
    for (const environment of ['dev', 'staging', 'production'] as const) {
      expect(canActivate(QA_V1, environment).allowed).toBe(false);
    }
  });
});

describe('canResolveExplicitVersion (history keeps resolving)', () => {
  it('permits a RETIRED, once-approved pack for historical records in production', () => {
    const retired = syntheticPack({ lifecycle: 'RETIRED' });
    expect(canResolveExplicitVersion(retired, 'production').allowed).toBe(true);
  });

  it('refuses a RETIRED never-approved pack outside local', () => {
    const retired = syntheticPack({ lifecycle: 'RETIRED', approvalReference: null });
    expect(canResolveExplicitVersion(retired, 'production').allowed).toBe(false);
    expect(canResolveExplicitVersion(retired, 'local').allowed).toBe(true);
  });
});
