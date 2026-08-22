/**
 * **A profile cannot make an unavailable rail executable.**
 *
 * This file drives the REAL gate. It imports `@karar/financial-connections`'
 * own `checkRailImplemented` and `createFinancialConnection` — not a copy, not
 * a fake — feeds them everything a maximally optimistic profile describes as
 * available, and asserts that eleven of the thirteen rails are refused and the
 * other two are permitted by that module on its own authority rather than
 * because a profile said so.
 *
 * Three independent guarantees, in the order they fire:
 *
 *  1. **The compiler.** This module's `DataRail` is not assignable to
 *     `ImplementedConnectionRail`, which is the type
 *     `NewFinancialConnection.rail` demands. The `@ts-expect-error` below is
 *     the witness and `pnpm typecheck` is the enforcement — if the assignment
 *     ever became legal, the directive would go unused and the build would
 *     fail. The standing type-level proof of the same fact lives in
 *     `__tests__/mirrored-vocabularies.test.ts`.
 *  2. **The gate.** Even through a deliberate cast, `checkRailImplemented`
 *     answers `rail_not_implemented` for every unimplemented rail, and
 *     `createFinancialConnection` refuses to build the entity.
 *  3. **The database.** `financial_connections_rail_implemented_check`
 *     (migration 0096) refuses the row besides. That is proved in
 *     `modules/financial-connections`' own integration suite against live
 *     PostgreSQL, which is where it belongs — this module has no database
 *     access at all, and asserting a CHECK from here would need one.
 *
 * Rule 6 of this module's brief falls out of the same run: only `MANUAL` and
 * `USER_FILE_UPLOAD` are executable, and every other rail is described and
 * unavailable no matter what a description says.
 */

import { describe, expect, it } from 'vitest';

import { TenantId, UserId } from '@karar/shared-kernel';
import type { ImplementedConnectionRail } from '@karar/financial-connections';
import {
  CONNECTION_RAILS,
  FinancialConnectionId,
  IMPLEMENTED_CONNECTION_RAILS,
  checkRailImplemented,
  createFinancialConnection,
} from '@karar/financial-connections';

import type { DataRail } from '../domain/data-rails.js';
import {
  RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE,
  DATA_RAILS,
  describedRails,
  profileCanMakeExecutable,
  railsDescribedAsAvailable,
} from '../domain/data-rails.js';
import { SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE } from './fixtures.js';

const TENANT = TenantId.of('11111111-1111-4111-8111-111111111111');
const USER = UserId.of('22222222-2222-4222-8222-222222222222');
const CONNECTION = FinancialConnectionId.of('33333333-3333-4333-8333-333333333333');
const AT = new Date('2026-08-19T00:00:00.000Z');

/** Everything the optimistic profile says is on offer: all thirteen rails. */
const described = railsDescribedAsAvailable(SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE.dataRails);

describe('a description is not a permission', () => {
  it('describes every rail as available — the strongest thing a profile can say', () => {
    expect(described).toHaveLength(CONNECTION_RAILS.length);
    expect([...described].sort()).toEqual([...CONNECTION_RAILS].sort());
    // ...and the module's own vocabulary is the same thirteen names.
    expect([...described].sort()).toEqual([...DATA_RAILS].sort());
  });

  it('will not let a described rail be assigned where an executable one is required', () => {
    const anyDescribedRail: DataRail = described[0] as DataRail;

    // @ts-expect-error a rail a profile describes is not a rail a connection may be opened on
    const executable: ImplementedConnectionRail = anyDescribedRail;

    expect(typeof executable).toBe('string');
  });

  it('is refused by the other module gate for every unimplemented rail, even through a cast', () => {
    const refused: DataRail[] = [];
    const permitted: DataRail[] = [];

    for (const rail of described) {
      // `checkRailImplemented` takes a bare string on purpose — it is the gate
      // for callers who have not yet narrowed — so a described rail reaches it
      // without a cast, and is refused anyway.
      const outcome = checkRailImplemented(rail);
      if (outcome.ok) {
        permitted.push(rail);
      } else {
        refused.push(rail);
        expect(outcome.error.kind).toBe('rail_not_implemented');
      }
    }

    expect([...permitted].sort()).toEqual([...IMPLEMENTED_CONNECTION_RAILS].sort());
    expect(refused).toHaveLength(CONNECTION_RAILS.length - IMPLEMENTED_CONNECTION_RAILS.length);
    expect(refused).toHaveLength(11);
  });

  it('cannot build a connection on a rail a profile merely described', () => {
    for (const rail of described) {
      const outcome = createFinancialConnection({
        id: CONNECTION,
        tenantId: TENANT,
        userId: USER,
        institutionRef: null,
        // Cast for the same reason as above: proving the runtime gate holds
        // where the type gate has been ignored.
        rail: rail as ImplementedConnectionRail,
        status: 'ACTIVE',
        displayLabel: 'synthetic connection',
        createdAt: AT,
      });

      if ((IMPLEMENTED_CONNECTION_RAILS as readonly string[]).includes(rail)) {
        expect(outcome.ok).toBe(true);
      } else {
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) {
          expect(outcome.error.kind).toBe('rail_not_implemented');
        }
      }
    }
  });

  it('grants nothing at all — not even the two rails that work', () => {
    expect(RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE).toEqual([]);
    expect(Object.isFrozen(RAILS_A_PROFILE_CAN_MAKE_EXECUTABLE)).toBe(true);

    for (const rail of CONNECTION_RAILS) {
      expect(profileCanMakeExecutable(rail)).toBe(false);
    }

    // Including MANUAL and USER_FILE_UPLOAD: those are executable because
    // modules/financial-connections implemented them, which would remain true
    // if this module did not exist.
    expect(profileCanMakeExecutable('MANUAL')).toBe(false);
    expect(profileCanMakeExecutable('USER_FILE_UPLOAD')).toBe(false);
  });

  it('returns descriptions and names, and nothing shaped like a connection', () => {
    const rails = describedRails(SYNTHETIC_MAXIMALLY_OPTIMISTIC_PROFILE.dataRails);

    for (const description of rails) {
      // Exactly two fields: which rail, and what the review found. No
      // endpoint, no credential, no token, no handle, no cursor.
      expect(Object.keys(description).sort()).toEqual(['assertion', 'rail']);
    }
  });
});
