/**
 * The use cases the financial HTTP surface is allowed to call, and the
 * ingestion bounds its routes are held to.
 *
 * ONE BUNDLE, BOUND ONCE. The composition root constructs every use case over
 * its real ports and provides this object; controllers receive it and call it.
 * Nothing in `apps/api/src/financial` constructs a repository, a provider, or
 * an encryption port — that is the composition root's job, and a controller
 * that could construct one could construct the wrong one.
 *
 * WHAT IS DELIBERATELY NOT IN THIS BUNDLE, so the absence is visible at the
 * seam rather than only in the contract:
 *
 *   * `DeleteOwnAccount`. Account deletion is not exposed over HTTP in this
 *     wave: its cross-module cascade is not atomic — records, source links
 *     and instruments are erased through separate ports, and a partial
 *     outcome is a real answer — and the contract for reporting that has not
 *     been chosen. It is left OUT rather than wired with no-op erasers,
 *     because a no-op eraser reports a successful deletion while the rows
 *     survive: cards still spending from an account the subject was told is
 *     gone.
 *   * `RecordReportedBalance`, `CreateManualConnection`, and every payment-
 *     instrument write. Their routes are not in the contract, so their use
 *     cases are not here; a bundle carrying a use case nothing calls invites
 *     the route to appear later without the contract review that should
 *     precede it.
 *   * `SuggestTransferMatch` and `EraseAccountSourceLinks`. The first would
 *     let a client assert a relationship the equal-and-opposite rule refuses;
 *     the second is reached only through account deletion, and as a standalone
 *     verb it would let a client orphan an account's data routes without
 *     deleting the account.
 *
 * THE INGESTION BOUNDS ARE DECLARED CENTRALLY AND VALIDATED AT STARTUP.
 * `packages/platform/src/ingestion/limits.ts` is the single registry;
 * `assertMountedIngestionLimits` runs its validator over the two policies
 * this surface mounts, at module registration, so a malformed bound stops the
 * process rather than being discovered by the first upload that exceeds it.
 */

import {
  INGESTION_LIMIT_POLICIES,
  assertValidIngestionLimitPolicy,
  type IngestionLimitPolicy,
} from '@karar/platform/dist/ingestion/limits.js';
import type { Clock } from '@karar/shared-kernel';

import type {
  CreateManualAccount,
  InstitutionCatalogueReader,
  ListOwnAccounts,
  ListOwnBalanceSnapshots,
  ReadOwnAccount,
  UpdateOwnAccount,
} from '@karar/financial-accounts';
import type { ListOwnAccountSourceLinks, ListOwnConnections } from '@karar/financial-connections';
import type { ListOwnPaymentInstruments } from '@karar/payment-instruments';
import type {
  CommitStatementImport,
  EraseStatementImport,
  ParseStatementSource,
  PreviewStatementImport,
  StartStatementImport,
  StoreImportSource,
} from '@karar/statement-imports';
import type {
  AssignCategory,
  CreateManualTransaction,
  DeleteOwnTransaction,
  FinancialCategoryCatalogue,
  ListOwnTransactions,
  ReadOwnTransaction,
  UpdateOwnTransaction,
} from '@karar/transactions';
import type {
  ConfirmTransferMatch,
  ListOwnTransferMatches,
  RejectTransferMatch,
} from '@karar/transfer-matching';

export const FINANCIAL_USE_CASES = 'karar.api.financial.use-cases';
export const FINANCIAL_CLOCK = 'karar.api.financial.clock';

export interface FinancialUseCases {
  /** Reviewed reference data. No principal scope: every caller reads the same rows. */
  readonly institutions: InstitutionCatalogueReader;
  readonly categories: FinancialCategoryCatalogue;

  readonly listOwnAccounts: ListOwnAccounts;
  readonly readOwnAccount: ReadOwnAccount;
  readonly createManualAccount: CreateManualAccount;
  readonly updateOwnAccount: UpdateOwnAccount;
  readonly listOwnBalanceSnapshots: ListOwnBalanceSnapshots;

  readonly listOwnTransactions: ListOwnTransactions;
  readonly createManualTransaction: CreateManualTransaction;
  readonly readOwnTransaction: ReadOwnTransaction;
  readonly updateOwnTransaction: UpdateOwnTransaction;
  readonly deleteOwnTransaction: DeleteOwnTransaction;
  readonly assignCategory: AssignCategory;

  readonly listOwnConnections: ListOwnConnections;
  readonly listOwnAccountSourceLinks: ListOwnAccountSourceLinks;
  readonly listOwnPaymentInstruments: ListOwnPaymentInstruments;

  readonly startStatementImport: StartStatementImport;
  readonly storeImportSource: StoreImportSource;
  readonly parseStatementSource: ParseStatementSource;
  readonly previewStatementImport: PreviewStatementImport;
  readonly commitStatementImport: CommitStatementImport;
  readonly eraseStatementImport: EraseStatementImport;

  readonly listOwnTransferMatches: ListOwnTransferMatches;
  readonly confirmTransferMatch: ConfirmTransferMatch;
  readonly rejectTransferMatch: RejectTransferMatch;
}

export type { Clock };

/**
 * The two declared ingestion paths this surface actually mounts.
 *
 * `manualTransaction` bounds every hand-entered record — one account, one
 * transaction, one category decision at a time — and supplies the page bounds
 * every read on this surface is held to. `csvStatementImport` bounds the
 * statement upload and its parse. Both are named here rather than restated,
 * so the numbers a route enforces and the numbers the architecture suite
 * reads are the same numbers.
 */
export const MANUAL_ENTRY_LIMITS: IngestionLimitPolicy = INGESTION_LIMIT_POLICIES.manualTransaction;
export const CSV_STATEMENT_LIMITS: IngestionLimitPolicy =
  INGESTION_LIMIT_POLICIES.csvStatementImport;

export const MOUNTED_INGESTION_POLICIES: readonly IngestionLimitPolicy[] = Object.freeze([
  MANUAL_ENTRY_LIMITS,
  CSV_STATEMENT_LIMITS,
]);

/**
 * Validates the mounted policies at registration.
 *
 * Throwing is correct here: a process running with a non-finite, zero or
 * negative bound is the exact state the limits registry exists to make
 * impossible, and it is not a condition any request handler can recover from.
 */
export function assertMountedIngestionLimits(): void {
  for (const policy of MOUNTED_INGESTION_POLICIES) assertValidIngestionLimitPolicy(policy);
}
