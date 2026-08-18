/**
 * CreateManualAccount — a person records an account they hold.
 *
 * **This is a first-class path, not a side effect.** The legacy exposed a
 * single GET and created accounts only as a byproduct of committing a
 * statement import, while a compulsory consent document promised customers
 * they could manage and delete individual accounts; that contradiction is not
 * carried forward (modules/financial-accounts/MODULE.md, challenge C9). A
 * cash account, a wallet, and an account at an institution the catalogue does
 * not list all arrive through here.
 *
 * **Nothing created here claims a bank connection.** `sourceKind` is fixed to
 * `MANUAL` by this use case — it is not an input, because the origin of a
 * record is a fact about how it was made and never something the caller gets
 * to assert. `EXTERNAL_PROVIDER` is unreachable: the domain factory accepts
 * only the constructible kinds, and a database CHECK refuses the row besides.
 *
 * The input carries no `userId` and no `tenantId`. The owner is the
 * authenticated principal, and the RLS WITH CHECK arm on
 * `public.financial_accounts` binds the inserted row to it at the database
 * layer, so even a defective repository cannot create an account for someone
 * else.
 *
 * **The retention gate runs FIRST, and the ordering is the control.** The
 * module's data-lifecycle declaration says non-local durable financial
 * creation fails closed while the retention decision is unresolved; until the
 * Phase 5 remediation, nothing enforced that. The check therefore happens
 * before the currency is resolved, before the catalogue is read, before any
 * field is encrypted, and before any statement reaches the database — so a
 * refusal leaves nothing behind at all: no row, no ciphertext, and no key
 * usage recorded against a subject whose data the platform had not yet
 * established it may keep. A gate placed after the encryption call would
 * still refuse the write, and would still have handed a subject's account
 * name to a key-management provider first.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  createFinancialAccount,
  resolveSupportedCurrency,
  type AccountType,
  type FinancialAccount,
} from '../../domain/financial-account.js';
import { isSelectableForNewAccount } from '../../domain/institution.js';
import type { FinancialAccountId, InstitutionRef } from '../../domain/refs.js';
import {
  retentionUnresolved,
  storeFailure,
  type CreateManualAccountError,
} from '../errors.js';
import {
  permitsDurableWrite,
  type FinancialAccountRetentionDecisionPort,
} from '../ports/financial-account-retention-decision.js';
import type { FinancialAccountRepository } from '../ports/financial-account-repository.js';
import type { IdSource } from '../ports/id-source.js';
import type { InstitutionCatalogueReader } from '../ports/institution-catalogue-reader.js';
import { requirePrincipal, type AccountsPrincipal } from '../principal.js';

/**
 * Deliberately carries no owner identifier and no `sourceKind`: the first is
 * context, the second is this use case's own answer.
 */
export interface CreateManualAccountInput {
  readonly accountType: AccountType;
  /** ISO 4217 code; validated against the platform registry, never assumed. */
  readonly currencyCode: string;
  readonly displayName: string;
  /** A catalogue entry, or the label the subject typed — never both. */
  readonly institutionRef: InstitutionRef | null;
  readonly userSuppliedInstitutionLabel: string | null;
  /** A masked fragment only; a full number is refused by the domain rule. */
  readonly mask: string | null;
}

export class CreateManualAccount {
  constructor(
    private readonly accounts: FinancialAccountRepository,
    private readonly institutions: InstitutionCatalogueReader,
    private readonly retention: FinancialAccountRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateManualAccountInput,
    actor: AccountsPrincipal,
  ): Promise<Result<FinancialAccount, CreateManualAccountError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    // Before anything else — see the header. A port that cannot answer says
    // UNAVAILABLE rather than throwing, so a rejection here is a genuine
    // defect and is reported as a store failure rather than swallowed into
    // the same refusal as an honest "we have not decided".
    let decision;
    try {
      decision = await this.retention.decideFor(principal.value, 'financial_accounts');
    } catch (error) {
      return Result.err(storeFailure('retention decision resolution', error));
    }
    if (!permitsDurableWrite(decision)) {
      return Result.err(retentionUnresolved('financial_accounts', decision));
    }

    const currency = resolveSupportedCurrency(input.currencyCode);
    if (!currency.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: currency.error,
        message: currency.error.message,
      });
    }

    // A named catalogue entry must exist and be selectable. Checked BEFORE the
    // insert so the refusal names the real problem, rather than surfacing as a
    // foreign-key error from the store.
    if (input.institutionRef !== null) {
      let institution;
      try {
        institution = await this.institutions.findByRef(input.institutionRef);
      } catch (error) {
        return Result.err(storeFailure('institution catalogue read', error));
      }
      if (institution === null || !isSelectableForNewAccount(institution)) {
        return Result.err({
          kind: 'institution_not_selectable',
          message:
            `institution '${input.institutionRef}' is not in the reviewed catalogue or is no longer ` +
            'selectable — an unlisted institution is recorded as the label the subject typed, which ' +
            'stays on their own account row and never enters the global catalogue',
        });
      }
    }

    const built = createFinancialAccount({
      id: this.ids.nextId() as FinancialAccountId,
      tenantId: principal.value.tenantId,
      userId: principal.value.userId,
      institutionRef: input.institutionRef,
      userSuppliedInstitutionLabel: input.userSuppliedInstitutionLabel,
      accountType: input.accountType,
      currency: currency.value,
      displayName: input.displayName,
      mask: input.mask,
      // Fixed here, never taken from input: how a record came to exist is a
      // fact about its making, not a claim the caller may assert.
      sourceKind: 'MANUAL',
      createdAt: this.clock.now(),
    });
    if (!built.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: built.error,
        message: built.error.message,
      });
    }

    try {
      return Result.ok(await this.accounts.create(principal.value, built.value));
    } catch (error) {
      return Result.err(storeFailure('manual account creation', error));
    }
  }
}
