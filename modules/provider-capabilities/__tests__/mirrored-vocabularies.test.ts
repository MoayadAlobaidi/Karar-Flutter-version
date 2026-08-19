/**
 * **The mirrored vocabularies are exactly their owners', and the compile-time
 * proofs that need both modules live here.**
 *
 * A domain layer may import only relative files and the pure packages
 * (architecture test 1), so `domain/vocabularies.ts` and `domain/data-rails.ts`
 * declare their own copies of five closed vocabularies that
 * `modules/financial-connections` and `modules/financial-accounts` own. That
 * duplication is the sanctioned cost of the layering rule, and this file is
 * where it is paid: a TEST may cross a module boundary, so this is the one
 * place in the module allowed to hold both sides at once and compare them.
 *
 * The comparisons are member-for-member and ORDER-SENSITIVE. Order matters
 * because the vocabularies are the argument of a review — a reader comparing a
 * profile against `modules/financial-connections/domain/rails.ts` should find
 * the same list in the same sequence — and because an order-insensitive
 * comparison would quietly tolerate a reordering that made a diff unreadable.
 *
 * If one of these fails, the fix is to update the mirror, never to relax the
 * assertion and never to re-import the owning module into `domain/`.
 */

import { describe, expect, it } from 'vitest';

import { ACCOUNT_TYPES as OWNED_ACCOUNT_TYPES } from '@karar/financial-accounts';
import { BALANCE_KINDS, INSTITUTION_KINDS as OWNED_INSTITUTION_KINDS } from '@karar/financial-accounts';
import { WALLET_KINDS as OWNED_WALLET_KINDS } from '@karar/financial-accounts';
import type { AccountType as OwnedAccountType, BalanceKind, InstitutionKind as OwnedInstitutionKind, WalletKind as OwnedWalletKind } from '@karar/financial-accounts';
import { CONNECTION_RAILS } from '@karar/financial-connections';
import type { ConnectionRail, ImplementedConnectionRail } from '@karar/financial-connections';

import type { DataRail } from '../domain/data-rails.js';
import { DATA_RAILS, isDataRail } from '../domain/data-rails.js';
import type { ProfiledBalanceKind } from '../domain/capability-profile.js';
import { PROFILED_BALANCE_KINDS } from '../domain/capability-profile.js';
import type { AccountType, InstitutionKind, WalletKind } from '../domain/vocabularies.js';
import { ACCOUNT_TYPES, INSTITUTION_KINDS, WALLET_KINDS } from '../domain/vocabularies.js';

describe('the mirrors match the vocabularies their owners define', () => {
  it('DATA_RAILS is exactly CONNECTION_RAILS', () => {
    expect([...DATA_RAILS]).toEqual([...CONNECTION_RAILS]);
    expect(DATA_RAILS).toHaveLength(13);

    for (const rail of CONNECTION_RAILS) {
      expect(isDataRail(rail)).toBe(true);
    }
  });

  it('ACCOUNT_TYPES, WALLET_KINDS and INSTITUTION_KINDS are exactly the accounts module lists', () => {
    expect([...ACCOUNT_TYPES]).toEqual([...OWNED_ACCOUNT_TYPES]);
    expect([...WALLET_KINDS]).toEqual([...OWNED_WALLET_KINDS]);
    expect([...INSTITUTION_KINDS]).toEqual([...OWNED_INSTITUTION_KINDS]);
  });

  it('PROFILED_BALANCE_KINDS is a real subset of BALANCE_KINDS', () => {
    // A subset rather than a mirror: four of that module's six kinds are not
    // interface capabilities. What must hold is that both words still exist
    // over there, or this module describes a kind nothing can record.
    for (const kind of PROFILED_BALANCE_KINDS) {
      expect(BALANCE_KINDS as readonly string[]).toContain(kind);
    }
    expect([...PROFILED_BALANCE_KINDS]).toEqual(['BOOKED', 'AVAILABLE']);
  });
});

// ---------------------------------------------------------------------------
// Compile-time proofs. These are enforced by `pnpm typecheck` (this directory
// is in the module's tsconfig `include`), not by the runtime assertions below
// them: a type that evaluates to `never` cannot be assigned, so the BUILD
// fails. They live in a test file because they are the only place in this
// module allowed to name both a local type and its owner's.
// ---------------------------------------------------------------------------

/** The mirrors are the same TYPE, not merely the same runtime list. */
type RailTypesAgree = [DataRail] extends [ConnectionRail]
  ? [ConnectionRail] extends [DataRail]
    ? true
    : never
  : never;
const railTypesAgree: RailTypesAgree = true;

type AccountTypesAgree = [AccountType] extends [OwnedAccountType]
  ? [OwnedAccountType] extends [AccountType]
    ? true
    : never
  : never;
const accountTypesAgree: AccountTypesAgree = true;

type WalletKindsAgree = [WalletKind] extends [OwnedWalletKind]
  ? [OwnedWalletKind] extends [WalletKind]
    ? true
    : never
  : never;
const walletKindsAgree: WalletKindsAgree = true;

type InstitutionKindsAgree = [InstitutionKind] extends [OwnedInstitutionKind]
  ? [OwnedInstitutionKind] extends [InstitutionKind]
    ? true
    : never
  : never;
const institutionKindsAgree: InstitutionKindsAgree = true;

/** ...and the profiled balance kinds stay a real subset. */
type ProfiledBalanceKindsAreBalanceKinds = [ProfiledBalanceKind] extends [BalanceKind]
  ? true
  : never;
const profiledBalanceKindsAreBalanceKinds: ProfiledBalanceKindsAreBalanceKinds = true;

/**
 * **The one that carries rule 3.** A rail this module can describe is NOT a
 * rail a connection may be opened on. If `IMPLEMENTED_CONNECTION_RAILS` were
 * ever widened to the whole vocabulary, this evaluates to `never` and the
 * build fails here — which is the right place for it to fail, because at that
 * point the distinction this module relies on would have stopped existing.
 */
type DescribedRailIsNotExecutable = [DataRail] extends [ImplementedConnectionRail] ? never : true;
const describedRailIsNotExecutable: DescribedRailIsNotExecutable = true;

/** ...and everything executable is describable, so no working rail is unsayable. */
type ExecutableRailIsDescribable = [ImplementedConnectionRail] extends [DataRail] ? true : never;
const executableRailIsDescribable: ExecutableRailIsDescribable = true;

describe('the compile-time proofs are present and hold', () => {
  it('carries every proof this module depends on', () => {
    // The assignments above are the enforcement; asserting them here keeps the
    // constants used and makes the list of proofs readable in one place.
    expect([
      railTypesAgree,
      accountTypesAgree,
      walletKindsAgree,
      institutionKindsAgree,
      profiledBalanceKindsAreBalanceKinds,
      describedRailIsNotExecutable,
      executableRailIsDescribable,
    ]).toEqual([true, true, true, true, true, true, true]);
  });
});
