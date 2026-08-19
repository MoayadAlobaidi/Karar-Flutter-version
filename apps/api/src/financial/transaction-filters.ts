/**
 * The transaction list's filters.
 *
 * THEY NARROW A PAGE, AND THE PAGE SAYS SO. `ListOwnTransactions` implements
 * one filter — the account — and a keyset cursor; everything else here is
 * applied to the page the module returned. That is a real property of this
 * surface rather than a hidden one: the page envelope reports `returned` as
 * the number actually sent, and `hasMore` from the module's own cursor rather
 * than from the filtered count, so a client paging through a narrow filter
 * keeps asking for the next page instead of concluding it has reached the end.
 *
 * Pushing these predicates into the repository is the right eventual answer
 * and is a change to the module's page query, not to this file — which is
 * exactly why the filters are readable here rather than woven into the
 * controller.
 *
 * A FILTER NEVER WIDENS. Every predicate below is applied to rows the module
 * already scoped to the caller, and there is no filter that could name
 * another subject: no `userId`, no `tenantId`, no tenant-wide flag.
 */

import { TRANSACTION_STATUSES } from '@karar/transactions';

import type { TransactionWire } from './dto/transactions.js';
import { isUuid, queryValue } from './request-input.js';

export interface InputRefusal {
  readonly field: string;
  readonly why: string;
}

export interface TransactionFilters {
  matches(row: TransactionWire): boolean;
}

const DIRECTIONS = ['MONEY_OUT', 'MONEY_IN'] as const;
const SOURCE_KINDS = ['MANUAL', 'CSV'] as const;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

function refusal(field: string, why: string): InputRefusal {
  return { field, why };
}

export function readTransactionFilters(query: unknown): TransactionFilters | InputRefusal {
  const currency = queryValue(query, 'currency');
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    return refusal('currency', 'must be an ISO 4217 alphabetic code');
  }
  const direction = queryValue(query, 'direction');
  if (direction !== undefined && !(DIRECTIONS as readonly string[]).includes(direction)) {
    return refusal('direction', "must be 'MONEY_OUT' or 'MONEY_IN'");
  }
  const status = queryValue(query, 'status');
  if (status !== undefined && !(TRANSACTION_STATUSES as readonly string[]).includes(status)) {
    return refusal('status', 'is not a value this platform recognises');
  }
  const sourceKind = queryValue(query, 'sourceKind');
  if (sourceKind !== undefined && !(SOURCE_KINDS as readonly string[]).includes(sourceKind)) {
    return refusal('sourceKind', 'is not a rail this platform can produce');
  }
  // Days, compared as days. `YYYY-MM-DD` sorts lexicographically in calendar
  // order, so no instant is constructed and no timezone is implied (ADR-0027).
  const bookedFrom = queryValue(query, 'bookedFrom');
  if (bookedFrom !== undefined && !CALENDAR_DAY.test(bookedFrom)) {
    return refusal('bookedFrom', 'must be an ISO calendar date YYYY-MM-DD');
  }
  const bookedTo = queryValue(query, 'bookedTo');
  if (bookedTo !== undefined && !CALENDAR_DAY.test(bookedTo)) {
    return refusal('bookedTo', 'must be an ISO calendar date YYYY-MM-DD');
  }
  const accountId = queryValue(query, 'accountId');
  if (accountId !== undefined && !isUuid(accountId)) {
    return refusal('accountId', 'is not a reference');
  }

  return {
    matches(row) {
      if (currency !== undefined && row.amount.currency !== currency) return false;
      if (direction !== undefined && row.direction !== direction) return false;
      if (status !== undefined && row.status !== status) return false;
      if (sourceKind !== undefined && row.sourceKind !== sourceKind) return false;
      if (bookedFrom !== undefined && row.bookingDate < bookedFrom) return false;
      if (bookedTo !== undefined && row.bookingDate > bookedTo) return false;
      return true;
    },
  };
}
