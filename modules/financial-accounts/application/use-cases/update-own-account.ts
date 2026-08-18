/**
 * UpdateOwnAccount — a person edits an account they own.
 *
 * Three things this use case is responsible for, in order:
 *
 * 1. **Visibility.** The account is read under the caller's principal first.
 *    Not visible means `account_not_found`, identically to a guessed id.
 * 2. **The currency-immutability rule.** This is the layer that knows whether
 *    financial records exist, so this is where the rule is decided
 *    (`checkCurrencyChange` states it; `countForAccount` answers the
 *    question). The database enforces it again through the composite foreign
 *    key from the snapshot table, so the invariant holds even against a
 *    caller that bypasses this path (migration 0089).
 * 3. **Optimistic concurrency.** The caller says which version they read; the
 *    store updates only if the row is still at that version. A losing edit
 *    reports `version_conflict` rather than being silently overwritten,
 *    because the edit that would be lost is usually one the same person just
 *    made on their other device.
 *
 * The input carries `expectedVersion` and the fields to change — and no owner
 * identifier, because the owner is the principal.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  applyAccountEdit,
  resolveSupportedCurrency,
  type AccountEdit,
  type AccountStatus,
  type AccountType,
  type FinancialAccount,
} from '../../domain/financial-account.js';
import { isSelectableForNewAccount } from '../../domain/institution.js';
import type { FinancialAccountId, InstitutionRef } from '../../domain/refs.js';
import { ACCOUNT_NOT_FOUND, storeFailure, type UpdateOwnAccountError } from '../errors.js';
import type { BalanceSnapshotRepository } from '../ports/balance-snapshot-repository.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import type { InstitutionCatalogueReader } from '../ports/institution-catalogue-reader.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/**
 * An absent key leaves a field alone; an explicit `null` clears it. No owner
 * identifier appears, and `sourceKind` is absent by design — the origin of a
 * record is immutable (the store's guard trigger refuses to change it).
 */
export interface UpdateOwnAccountInput {
  readonly accountId: FinancialAccountId;
  readonly expectedVersion: number;
  readonly displayName?: string;
  readonly accountType?: AccountType;
  readonly status?: AccountStatus;
  readonly mask?: string | null;
  readonly currencyCode?: string;
  readonly institutionRef?: InstitutionRef | null;
  readonly userSuppliedInstitutionLabel?: string | null;
}

export class UpdateOwnAccount {
  constructor(
    private readonly accounts: FinancialAccountRepository,
    private readonly snapshots: BalanceSnapshotRepository,
    private readonly institutions: InstitutionCatalogueReader,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: UpdateOwnAccountInput,
    actor: AccountsPrincipal,
  ): Promise<Result<FinancialAccount, UpdateOwnAccountError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    let current: FinancialAccount | null;
    try {
      current = await this.accounts.findOwnById(principal.value, input.accountId);
    } catch (error) {
      return Result.err(storeFailure('own-account read', error));
    }
    if (current === null) return Result.err(ACCOUNT_NOT_FOUND);

    const edit: { -readonly [K in keyof AccountEdit]: AccountEdit[K] } = {};
    if (input.displayName !== undefined) edit.displayName = input.displayName;
    if (input.accountType !== undefined) edit.accountType = input.accountType;
    if (input.status !== undefined) edit.status = input.status;
    if (input.mask !== undefined) edit.mask = input.mask;
    if (input.institutionRef !== undefined) edit.institutionRef = input.institutionRef;
    if (input.userSuppliedInstitutionLabel !== undefined) {
      edit.userSuppliedInstitutionLabel = input.userSuppliedInstitutionLabel;
    }

    if (input.currencyCode !== undefined) {
      const currency = resolveSupportedCurrency(input.currencyCode);
      if (!currency.ok) {
        return Result.err({
          kind: 'rule_violated',
          violation: currency.error,
          message: currency.error.message,
        });
      }
      edit.currency = currency.value;
    }

    if (edit.institutionRef !== undefined && edit.institutionRef !== null) {
      let institution;
      try {
        institution = await this.institutions.findByRef(edit.institutionRef);
      } catch (error) {
        return Result.err(storeFailure('institution catalogue read', error));
      }
      if (institution === null || !isSelectableForNewAccount(institution)) {
        return Result.err({
          kind: 'institution_not_selectable',
          message:
            `institution '${edit.institutionRef}' is not in the reviewed catalogue or is no longer ` +
            'selectable — an unlisted institution is recorded as the label the subject typed',
        });
      }
    }

    // Only asked when it matters: the rule turns on whether records exist, and
    // an account with no currency change does not need the question answered.
    let hasFinancialRecords = false;
    if (edit.currency !== undefined && edit.currency.code !== current.currency.code) {
      try {
        hasFinancialRecords =
          (await this.snapshots.countForAccount(principal.value, input.accountId)) > 0;
      } catch (error) {
        return Result.err(storeFailure('financial-record presence check', error));
      }
    }

    const next = applyAccountEdit(current, edit, {
      hasFinancialRecords,
      at: this.clock.now(),
    });
    if (!next.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: next.error,
        message: next.error.message,
      });
    }

    try {
      const outcome = await this.accounts.update(
        principal.value,
        input.expectedVersion,
        next.value,
      );
      if (outcome.kind === 'not_found') return Result.err(ACCOUNT_NOT_FOUND);
      if (outcome.kind === 'stale') {
        return Result.err({
          kind: 'version_conflict',
          expectedVersion: input.expectedVersion,
          message:
            `the account changed since version ${input.expectedVersion} was read — re-read it and ` +
            'decide, because the edit this would overwrite is usually one the same person just made elsewhere',
        });
      }
      return Result.ok(outcome.account);
    } catch (error) {
      return Result.err(storeFailure('own-account update', error));
    }
  }
}
