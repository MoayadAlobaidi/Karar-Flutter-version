/**
 * Which rate-limit budget each mounted financial operation is charged to.
 *
 * KEYED BY HANDLER, NOT BY URL. Two controllers share the base path
 * `financial/transactions` and two share `financial/statement-imports`, so a
 * path-keyed map cannot address them unambiguously — and a URL-pattern map
 * drifts silently the day a path suffix changes, which is the class of defect
 * this whole surface has already been bitten by. `ControllerClass.name` plus
 * the handler's method name is what the framework itself dispatches on, and
 * `rate-limit-mounting.test.ts` derives the same pairs from route metadata, so
 * the map and the router cannot disagree about what exists.
 *
 * EVERY MOUNTED OPERATION IS HERE. There are no exemptions. An operation with
 * no policy is refused by the guard rather than admitted unlimited, and the
 * structural test fails on a mounted route this map does not name — a route
 * must not become unbounded because somebody forgot an entry.
 *
 * These are SECURITY ceilings. Nothing here is a product quota, a subscription
 * limit or a jurisdiction rule, and none of it may be presented to a person as
 * one; the policies themselves carry that statement and their rationale.
 */

import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from '@karar/platform/dist/ratelimit/index.js';

/** `ControllerClass.name` + '.' + handler method name. */
export type FinancialOperationKey = string;

export const FINANCIAL_RATE_LIMIT_POLICIES: ReadonlyMap<FinancialOperationKey, RateLimitPolicy> =
  new Map<FinancialOperationKey, RateLimitPolicy>([
    // Accounts — three reads and two writes.
    ['FinancialAccountsController.list', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialAccountsController.read', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialAccountsController.create', RATE_LIMIT_POLICIES.financialWrite],
    ['FinancialAccountsController.update', RATE_LIMIT_POLICIES.financialWrite],

    // Global catalogues. Reads, and not of the subject's own records — but
    // charged to the subject all the same, because the cost is the server's.
    ['FinancialCatalogueController.listInstitutions', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialCatalogueController.listCategories', RATE_LIMIT_POLICIES.financialRead],

    // Transactions.
    ['FinancialTransactionsController.list', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialTransactionsController.read', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialTransactionsController.create', RATE_LIMIT_POLICIES.financialWrite],
    ['FinancialTransactionsController.correct', RATE_LIMIT_POLICIES.financialWrite],
    ['FinancialTransactionsController.remove', RATE_LIMIT_POLICIES.financialWrite],
    ['FinancialTransactionDetailController.assignCategory', RATE_LIMIT_POLICIES.financialWrite],
    ['FinancialTransactionDetailController.listProvenance', RATE_LIMIT_POLICIES.financialRead],

    // Views: balances, source links, instruments, connections. All reads.
    ['FinancialViewsController.balances', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialViewsController.sourceLinks', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialViewsController.paymentInstruments', RATE_LIMIT_POLICIES.financialRead],
    ['FinancialViewsController.connections', RATE_LIMIT_POLICIES.financialRead],

    // Statement imports. The draft is an ordinary write; the three expensive
    // steps each carry their own budget, because they cost different things:
    // upload stores bytes, parse burns CPU, commit opens a write transaction.
    ['StatementImportsController.create', RATE_LIMIT_POLICIES.financialWrite],
    ['StatementImportsController.read', RATE_LIMIT_POLICIES.financialRead],
    ['StatementImportsController.preview', RATE_LIMIT_POLICIES.financialStatementParse],
    ['StatementImportsController.erase', RATE_LIMIT_POLICIES.financialErase],
    ['StatementImportSourceController.upload', RATE_LIMIT_POLICIES.financialStatementUpload],
    ['StatementImportSourceController.parse', RATE_LIMIT_POLICIES.financialStatementParse],
    ['StatementImportSourceController.commit', RATE_LIMIT_POLICIES.financialCommit],

    // Transfer matching: one read, two per-match decisions.
    ['TransferMatchesController.list', RATE_LIMIT_POLICIES.financialRead],
    ['TransferMatchesController.confirm', RATE_LIMIT_POLICIES.financialTransferDecision],
    ['TransferMatchesController.reject', RATE_LIMIT_POLICIES.financialTransferDecision],
  ]);

/** The budget for one mounted operation, or `undefined` if it has none. */
export function policyForHandler(
  controllerName: string,
  handlerName: string,
): RateLimitPolicy | undefined {
  return FINANCIAL_RATE_LIMIT_POLICIES.get(`${controllerName}.${handlerName}`);
}
