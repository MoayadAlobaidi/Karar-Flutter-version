import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';
import { isCapabilityId } from '@karar/capability-registry';

import {
  GetOwnSelection,
  GetSelectionVersionForResolution,
  InvalidSelectionInputError,
  JurisdictionRef,
  ProfileRef,
  RecordSubjectPolicySelection,
  SELECTION_SOURCE_SUBJECT_ELECTION,
  WithdrawOwnSelection,
  optionPermitted,
  resolveSelectionAt,
  type SubjectOptionSet,
  type SubjectPolicyPrincipal,
  type SubjectPolicySelection,
} from '../public-api.js';
import { FixedOptionSource } from './fakes/fixed-option-source.js';
import { InMemorySelectionRepository } from './fakes/in-memory-selection-repository.js';
import { capturingAuditTrail } from './fakes/capturing-audit.js';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const JURISDICTION = 'jurisdiction:qa';
const PACK_V1 = 'qa/v1';
const PACK_V2 = 'qa/v2';
// Distinctive canaries: option-content-shaped values that must never appear
// in audit entries or logs (the recording input and MY table may carry the
// references; the audit trail and console must not).
const PROFILE_CANARY = 'profile:zakat/methodology-canary-a7x';
const SNAPSHOT_CANARY = 'sha256:snapshot-canary-b3y';

const principal: SubjectPolicyPrincipal = {
  userId: UserId.of(randomUUID()),
  tenantId: TenantId.of(randomUUID()),
};

let ids = 0;
const idSource = { nextId: () => `00000000-0000-7000-8000-${(++ids).toString(16).padStart(12, '0')}` };

function optionSet(overrides?: Partial<SubjectOptionSet<'ZAKAT'>>): SubjectOptionSet<'ZAKAT'> {
  return {
    capabilityId: 'ZAKAT',
    jurisdictionRef: JurisdictionRef.of(JURISDICTION),
    policyPackVersion: PACK_V1,
    permittedOptions: [
      { profileRef: ProfileRef.of(PROFILE_CANARY), profileVersions: ['1.0.0', '1.1.0'] },
      { profileRef: ProfileRef.of('profile:zakat/methodology-beta'), profileVersions: ['2.0.0'] },
    ],
    ...overrides,
  };
}

function selectionRow(overrides: Partial<SubjectPolicySelection>): SubjectPolicySelection {
  return {
    id: idSource.nextId(),
    userId: principal.userId,
    tenantId: principal.tenantId,
    capabilityId: 'ZAKAT',
    profileRef: ProfileRef.of(PROFILE_CANARY),
    profileVersion: '1.0.0',
    jurisdictionRef: JurisdictionRef.of(JURISDICTION),
    policyPackVersion: PACK_V1,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    status: 'ACTIVE',
    selectionSource: SELECTION_SOURCE_SUBJECT_ELECTION,
    recordedBy: principal.userId,
    profileSnapshotHash: null,
    withdrawnAt: null,
    ...overrides,
  };
}

// Console discipline: selections never enter logs — the module has no
// logger, and nothing may print during any flow (leak regression).
let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level),
  );
});
afterEach(() => {
  for (const spy of consoleSpies) {
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  }
});

describe('resolveSelectionAt (pure temporal resolution)', () => {
  it('no rows -> NONE', () => {
    expect(resolveSelectionAt([], NOW)).toEqual({ kind: 'NONE' });
  });

  it('an open effective window covering the instant -> EFFECTIVE', () => {
    const row = selectionRow({});
    const resolved = resolveSelectionAt([row], NOW);
    expect(resolved.kind === 'EFFECTIVE' && resolved.selection.id === row.id).toBe(true);
  });

  it('a not-yet-effective row -> NONE (never served early)', () => {
    const row = selectionRow({ effectiveFrom: new Date('2027-01-01T00:00:00Z') });
    expect(resolveSelectionAt([row], NOW)).toEqual({ kind: 'NONE' });
  });

  it('a closed window -> EXPIRED with the closing instant, even when the stored status is stale ACTIVE', () => {
    const expiredAt = new Date('2026-06-01T00:00:00Z');
    const row = selectionRow({ effectiveTo: expiredAt, status: 'ACTIVE' });
    expect(resolveSelectionAt([row], NOW)).toEqual({
      kind: 'EXPIRED',
      selectionId: row.id,
      expiredAt,
    });
  });

  it('withdrawal is temporal: before the instant -> NONE; after it -> still EFFECTIVE historically', () => {
    const withdrawnAt = new Date('2026-05-01T00:00:00Z');
    const row = selectionRow({ status: 'WITHDRAWN', withdrawnAt });
    expect(resolveSelectionAt([row], NOW)).toEqual({ kind: 'NONE' });
    const beforeWithdrawal = new Date('2026-04-01T00:00:00Z');
    const historical = resolveSelectionAt([row], beforeWithdrawal);
    expect(historical.kind === 'EFFECTIVE' && historical.selection.id === row.id).toBe(true);
  });

  it('supersession replays: the old row answers past instants with ITS pinned versions', () => {
    const old = selectionRow({
      status: 'SUPERSEDED',
      policyPackVersion: PACK_V1,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    });
    const successor = selectionRow({
      status: 'ACTIVE',
      policyPackVersion: PACK_V2,
      effectiveFrom: new Date('2026-07-01T00:00:00Z'),
    });
    const past = resolveSelectionAt([old, successor], new Date('2026-03-01T00:00:00Z'));
    expect(past.kind === 'EFFECTIVE' && past.selection.policyPackVersion === PACK_V1).toBe(true);
    const present = resolveSelectionAt([old, successor], NOW);
    expect(present.kind === 'EFFECTIVE' && present.selection.policyPackVersion === PACK_V2).toBe(
      true,
    );
  });
});

describe('optionPermitted', () => {
  it('membership requires both the profile ref and a permitted version', () => {
    const set = optionSet();
    expect(optionPermitted(set, ProfileRef.of(PROFILE_CANARY), '1.0.0')).toBe(true);
    expect(optionPermitted(set, ProfileRef.of(PROFILE_CANARY), '9.9.9')).toBe(false);
    expect(optionPermitted(set, ProfileRef.of('profile:zakat/unlisted'), '1.0.0')).toBe(false);
  });
});

describe('RecordSubjectPolicySelection (production ids)', () => {
  function harness() {
    const repository = new InMemorySelectionRepository();
    const source = new FixedOptionSource<'ZAKAT' | 'TRANSACTIONS' | 'BUDGETS'>();
    const { trail, events } = capturingAuditTrail();
    const record = new RecordSubjectPolicySelection(
      repository,
      source,
      isCapabilityId,
      idSource,
      trail,
    );
    return { repository, source, record, events };
  }

  const validInput = {
    principal,
    capabilityId: 'ZAKAT',
    jurisdictionRef: JURISDICTION,
    expectedPolicyPackVersion: PACK_V1,
    profileRef: PROFILE_CANARY,
    profileVersion: '1.0.0',
    now: NOW,
  };

  it('records a selection inside the permitted options, pinning versions and provenance', async () => {
    const { repository, source, record } = harness();
    source.withOptionSet(optionSet());
    const recorded = await record.execute({ ...validInput, profileSnapshotHash: SNAPSHOT_CANARY });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(recorded.value).toMatchObject({
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      policyPackVersion: PACK_V1,
      profileVersion: '1.0.0',
      status: 'ACTIVE',
      selectionSource: SELECTION_SOURCE_SUBJECT_ELECTION,
      recordedBy: principal.userId,
      profileSnapshotHash: SNAPSHOT_CANARY,
      effectiveFrom: NOW,
    });
    expect(repository.allRows()).toHaveLength(1);
  });

  it('denies an option outside the pack-permitted set (restrict-only)', async () => {
    const { repository, source, record } = harness();
    source.withOptionSet(optionSet());
    const wrongVersion = await record.execute({ ...validInput, profileVersion: '9.9.9' });
    expect(!wrongVersion.ok && wrongVersion.error.kind === 'OPTION_NOT_PERMITTED').toBe(true);
    const wrongRef = await record.execute({
      ...validInput,
      profileRef: 'profile:zakat/not-in-pack',
    });
    expect(!wrongRef.ok && wrongRef.error.kind === 'OPTION_NOT_PERMITTED').toBe(true);
    expect(repository.allRows()).toHaveLength(0);
  });

  it('denies a capability id outside the production registry', async () => {
    const { repository, record } = harness();
    // FUNDRAISING is deliberately absent from the union (capability-registry).
    const denied = await record.execute({ ...validInput, capabilityId: 'FUNDRAISING' });
    expect(!denied.ok && denied.error.kind === 'CAPABILITY_UNKNOWN').toBe(true);
    expect(repository.allRows()).toHaveLength(0);
  });

  it('rejects the selection entirely where the capability declares no subject policy', async () => {
    const { repository, source, record } = harness();
    source.withNoSubjectPolicy('TRANSACTIONS', JURISDICTION);
    const denied = await record.execute({ ...validInput, capabilityId: 'TRANSACTIONS' });
    expect(!denied.ok && denied.error.kind === 'NO_SUBJECT_POLICY_DECLARED').toBe(true);
    expect(repository.allRows()).toHaveLength(0);
  });

  it('fails closed when the option set cannot be resolved', async () => {
    const { repository, source, record } = harness();
    source.withUnresolved('ZAKAT', JURISDICTION, 'pack not loadable');
    const denied = await record.execute(validInput);
    expect(!denied.ok && denied.error.kind === 'OPTION_SET_UNRESOLVED').toBe(true);
    expect(repository.allRows()).toHaveLength(0);
  });

  it('denies recording under a pack version that is not the applicable one', async () => {
    const { repository, source, record } = harness();
    source.withOptionSet(optionSet({ policyPackVersion: PACK_V2 }));
    const denied = await record.execute(validInput); // expects qa/v1, applicable is qa/v2
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error).toMatchObject({
      kind: 'PACK_VERSION_MISMATCH',
      expectedPackVersion: PACK_V1,
      applicablePackVersion: PACK_V2,
      detected: 'AT_RESOLUTION',
    });
    expect(repository.allRows()).toHaveLength(0);
  });

  it('detects a concurrent pack-version change between validation and pinning (the race)', async () => {
    const { repository, source, record } = harness();
    source
      .withOptionSet(optionSet())
      .flipTo('ZAKAT', JURISDICTION, {
        kind: 'OPTION_SET',
        optionSet: optionSet({ policyPackVersion: PACK_V2 }),
      });
    const denied = await record.execute(validInput);
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error).toMatchObject({
      kind: 'PACK_VERSION_MISMATCH',
      applicablePackVersion: PACK_V2,
      detected: 'AT_PIN',
    });
    // Nothing was recorded: a detected race is a refusal, never a mis-pin.
    expect(repository.allRows()).toHaveLength(0);
    expect(source.calls).toBe(2);
  });

  it('re-electing supersedes the prior ACTIVE row and preserves it with its pinned versions', async () => {
    const { repository, source, record, events } = harness();
    source.withOptionSet(optionSet());
    const first = await record.execute(validInput);
    expect(first.ok).toBe(true);
    const second = await record.execute({ ...validInput, profileVersion: '1.1.0' });
    expect(second.ok).toBe(true);
    const rows = repository.allRows();
    expect(rows.map((r) => r.status).sort()).toEqual(['ACTIVE', 'SUPERSEDED']);
    const superseded = rows.find((r) => r.status === 'SUPERSEDED');
    expect(superseded?.profileVersion).toBe('1.0.0');
    expect(superseded?.policyPackVersion).toBe(PACK_V1);
    const supersessionAudit = events.at(-1);
    expect(supersessionAudit?.beforeMetadata?.supersededSelectionIds).toBe(superseded?.id);
  });

  it('throws on a window that could never cover an instant (defect, not outcome)', async () => {
    const { source, record } = harness();
    source.withOptionSet(optionSet());
    await expect(
      record.execute({ ...validInput, effectiveTo: new Date('2020-01-01T00:00:00Z') }),
    ).rejects.toBeInstanceOf(InvalidSelectionInputError);
  });
});

describe('reads', () => {
  function readHarness() {
    const repository = new InMemorySelectionRepository();
    const source = new FixedOptionSource<'ZAKAT' | 'TRANSACTIONS' | 'BUDGETS'>();
    const { trail } = capturingAuditTrail();
    const record = new RecordSubjectPolicySelection(
      repository,
      source,
      isCapabilityId,
      idSource,
      trail,
    );
    const getOwn = new GetOwnSelection(repository, source, isCapabilityId);
    const forResolution = new GetSelectionVersionForResolution(repository, isCapabilityId);
    return { repository, source, record, getOwn, forResolution, trail };
  }

  const readInput = {
    principal,
    capabilityId: 'ZAKAT',
    jurisdictionRef: JURISDICTION,
    at: NOW,
  };

  it('returns the effective selection at the instant', async () => {
    const { source, record, getOwn } = readHarness();
    source.withOptionSet(optionSet());
    await record.execute({
      principal,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_CANARY,
      profileVersion: '1.0.0',
      now: NOW,
    });
    const view = await getOwn.execute({ ...readInput, at: new Date(NOW.getTime() + 1) });
    expect(view.ok && view.value.kind === 'SELECTION').toBe(true);
  });

  it('denies an expired selection on read — typed, never silently served', async () => {
    const { source, record, getOwn, forResolution } = readHarness();
    source.withOptionSet(optionSet());
    const expiry = new Date('2026-09-01T00:00:00Z');
    await record.execute({
      principal,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_CANARY,
      profileVersion: '1.0.0',
      effectiveTo: expiry,
      now: NOW,
    });
    const afterExpiry = new Date('2026-10-01T00:00:00Z');
    const view = await getOwn.execute({ ...readInput, at: afterExpiry });
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.value).toMatchObject({ kind: 'SELECTION_EXPIRED', expiredAt: expiry });
    }
    const pinned = await forResolution.execute({ principal, capabilityId: 'ZAKAT', at: afterExpiry });
    expect(pinned.ok).toBe(true);
    if (pinned.ok) {
      expect(pinned.value).toEqual({
        kind: 'NO_SELECTION_APPLICABLE',
        cause: 'SELECTION_EXPIRED',
      });
    }
  });

  it('absence is ALLOWED where the capability declares no subject policy: NO_SELECTION_APPLICABLE, not an error', async () => {
    const { source, getOwn } = readHarness();
    source.withNoSubjectPolicy('TRANSACTIONS', JURISDICTION);
    const view = await getOwn.execute({ ...readInput, capabilityId: 'TRANSACTIONS' });
    expect(view.ok).toBe(true);
    if (view.ok) {
      expect(view.value).toEqual({ kind: 'NO_SELECTION_APPLICABLE' });
    }
  });

  it('distinguishes electable-but-unelected (NO_SELECTION) and fails closed on an unresolvable set', async () => {
    const { source, getOwn } = readHarness();
    source.withOptionSet(optionSet());
    const unelected = await getOwn.execute(readInput);
    expect(unelected.ok).toBe(true);
    if (unelected.ok) {
      expect(unelected.value).toEqual({ kind: 'NO_SELECTION' });
    }
    const brokenSource = new FixedOptionSource<'ZAKAT'>().withUnresolved(
      'ZAKAT',
      JURISDICTION,
      'pack not loadable',
    );
    const failing = new GetOwnSelection(new InMemorySelectionRepository(), brokenSource, isCapabilityId);
    const unresolved = await failing.execute(readInput);
    expect(!unresolved.ok && unresolved.error.kind === 'OPTION_SET_UNRESOLVED').toBe(true);
  });

  it('rejects unknown capability ids on every read', async () => {
    const { getOwn, forResolution } = readHarness();
    const view = await getOwn.execute({ ...readInput, capabilityId: 'NOT_A_CAPABILITY' });
    expect(!view.ok && view.error.kind === 'CAPABILITY_UNKNOWN').toBe(true);
    const pinned = await forResolution.execute({
      principal,
      capabilityId: 'NOT_A_CAPABILITY',
      at: NOW,
    });
    expect(!pinned.ok && pinned.error.kind === 'CAPABILITY_UNKNOWN').toBe(true);
  });

  it('resolution reader replays the pinned versions of a superseded row at a past instant', async () => {
    const { source, record, forResolution } = readHarness();
    source.withOptionSet(optionSet());
    const first = await record.execute({
      principal,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_CANARY,
      profileVersion: '1.0.0',
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(first.ok).toBe(true);
    // The pack moved on; the subject re-elected under qa/v2 later.
    source.withOptionSet(optionSet({ policyPackVersion: PACK_V2 }));
    const second = await record.execute({
      principal,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V2,
      profileRef: PROFILE_CANARY,
      profileVersion: '1.1.0',
      now: new Date('2026-07-01T00:00:00Z'),
    });
    expect(second.ok).toBe(true);

    const past = await forResolution.execute({
      principal,
      capabilityId: 'ZAKAT',
      at: new Date('2026-03-01T00:00:00Z'),
    });
    expect(past.ok).toBe(true);
    if (past.ok) {
      expect(past.value).toMatchObject({
        kind: 'PINNED_VERSIONS',
        policyPackVersion: PACK_V1,
        profileVersion: '1.0.0',
      });
    }
    const present = await forResolution.execute({ principal, capabilityId: 'ZAKAT', at: NOW });
    expect(present.ok).toBe(true);
    if (present.ok) {
      expect(present.value).toMatchObject({
        kind: 'PINNED_VERSIONS',
        policyPackVersion: PACK_V2,
        profileVersion: '1.1.0',
      });
    }
  });
});

describe('WithdrawOwnSelection', () => {
  it('withdraws an ACTIVE selection, preserves the row, and refuses a second withdrawal', async () => {
    const repository = new InMemorySelectionRepository();
    const source = new FixedOptionSource<'ZAKAT'>().withOptionSet(optionSet());
    const { trail } = capturingAuditTrail();
    const record = new RecordSubjectPolicySelection(repository, source, isCapabilityId, idSource, trail);
    const withdraw = new WithdrawOwnSelection(repository, trail);

    const recorded = await record.execute({
      principal,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_CANARY,
      profileVersion: '1.0.0',
      now: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    const withdrawn = await withdraw.execute({
      principal,
      selectionId: recorded.value.id,
      now: NOW,
    });
    expect(withdrawn.ok && withdrawn.value.status === 'WITHDRAWN').toBe(true);
    expect(repository.allRows()).toHaveLength(1);

    const again = await withdraw.execute({ principal, selectionId: recorded.value.id, now: NOW });
    expect(!again.ok && again.error.kind === 'SELECTION_NOT_ACTIVE').toBe(true);

    const missing = await withdraw.execute({ principal, selectionId: randomUUID(), now: NOW });
    expect(!missing.ok && missing.error.kind === 'NOT_FOUND').toBe(true);
  });
});

describe('synthetic capability contract (the seam, generically)', () => {
  // No capability owns profile content yet (ZakatMethodologyProfile is Phase
  // 9). The seam is exercised with a SYNTHETIC capability id that exists only
  // in this test's type argument — never in the production union, and never
  // in a database row.
  type SynthId = 'SYNTH_ELECTIVE';
  const isSynth = (value: string): value is SynthId => value === 'SYNTH_ELECTIVE';

  it('the production union does not contain the synthetic id', () => {
    expect(isCapabilityId('SYNTH_ELECTIVE')).toBe(false);
  });

  it('records and resolves against a synthetic capability-owned option set', async () => {
    const repository = new InMemorySelectionRepository();
    const source = new FixedOptionSource<SynthId>().withOptionSet({
      capabilityId: 'SYNTH_ELECTIVE',
      jurisdictionRef: JurisdictionRef.of(JURISDICTION),
      policyPackVersion: PACK_V1,
      permittedOptions: [
        { profileRef: ProfileRef.of('profile:synth/alpha'), profileVersions: ['0.1.0'] },
      ],
    });
    const { trail } = capturingAuditTrail();
    const record = new RecordSubjectPolicySelection<SynthId>(
      repository,
      source,
      isSynth,
      idSource,
      trail,
    );
    const recorded = await record.execute({
      principal,
      capabilityId: 'SYNTH_ELECTIVE',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: 'profile:synth/alpha',
      profileVersion: '0.1.0',
      now: NOW,
    });
    expect(recorded.ok).toBe(true);

    const forResolution = new GetSelectionVersionForResolution<SynthId>(repository, isSynth);
    const pinned = await forResolution.execute({
      principal,
      capabilityId: 'SYNTH_ELECTIVE',
      at: new Date(NOW.getTime() + 1),
    });
    expect(pinned.ok).toBe(true);
    if (pinned.ok) {
      expect(pinned.value).toMatchObject({
        kind: 'PINNED_VERSIONS',
        capabilityId: 'SYNTH_ELECTIVE',
        profileRef: 'profile:synth/alpha',
      });
    }
  });
});

describe('leak regression: option content stays out of audit entries, logs, and module source', () => {
  it('audit entries carry references and pins only — never the profile ref, snapshot hash, or option values', async () => {
    const repository = new InMemorySelectionRepository();
    const source = new FixedOptionSource<'ZAKAT'>().withOptionSet(optionSet());
    const { trail, events } = capturingAuditTrail();
    const record = new RecordSubjectPolicySelection(repository, source, isCapabilityId, idSource, trail);
    const withdraw = new WithdrawOwnSelection(repository, trail);

    const recorded = await record.execute({
      principal,
      capabilityId: 'ZAKAT',
      jurisdictionRef: JURISDICTION,
      expectedPolicyPackVersion: PACK_V1,
      profileRef: PROFILE_CANARY,
      profileVersion: '1.0.0',
      profileSnapshotHash: SNAPSHOT_CANARY,
      now: NOW,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const withdrawn = await withdraw.execute({
      principal,
      selectionId: recorded.value.id,
      now: NOW,
    });
    expect(withdrawn.ok).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(PROFILE_CANARY);
    expect(serialized).not.toContain(SNAPSHOT_CANARY);
    expect(serialized).not.toContain('methodology');
    for (const event of events) {
      for (const metadata of [event.beforeMetadata, event.afterMetadata]) {
        for (const key of Object.keys(metadata ?? {})) {
          expect(key).not.toMatch(/profileRef|profile_ref|snapshot|option/i);
        }
      }
    }
  });

  it('module source never logs and never publishes domain events (no side channels exist to leak through)', () => {
    const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const sources: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (['__tests__', 'dist', 'node_modules'].includes(entry)) continue;
          walk(full);
        } else if (full.endsWith('.ts')) {
          sources.push(full);
        }
      }
    };
    walk(moduleRoot);
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} must not log`).not.toMatch(/\bconsole\./);
      expect(text, `${file} must not publish events`).not.toMatch(
        /\b(?:publishEvent|emitDomainEvent|DomainEvent)\b/,
      );
    }
  });
});
