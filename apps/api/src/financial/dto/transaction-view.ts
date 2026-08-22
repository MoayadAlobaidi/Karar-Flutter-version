/**
 * The single-transaction read: the record, its append-only history, the
 * category a person or a rule chose, and whether the current values DIVERGE
 * from what the source supplied.
 *
 * DIVERGENCE IS STATED RATHER THAN IMPLIED. An imported value stays
 * attributable after somebody corrects it, and the flag is what lets a client
 * say so without recomputing it from the revisions — which two clients would
 * eventually do differently.
 *
 * The provenance entries are NOT in this shape. They have their own route,
 * their own page, and their own closed field set, because provenance is the
 * part with the sharpest omissions — the dedup fingerprint and the source row
 * reference — and keeping it in one place keeps those omissions in one place.
 */

import type { OwnTransactionView } from '@karar/transactions';

import {
  categoryAssignmentWire,
  revisionWire,
  transactionWire,
  type CategoryAssignmentWire,
  type RevisionWire,
  type TransactionWire,
} from './transactions.js';

export interface OwnTransactionViewWire {
  readonly transaction: TransactionWire;
  readonly revisions: readonly RevisionWire[];
  readonly activeCategory: CategoryAssignmentWire | null;
  readonly divergesFromSource: boolean;
}

export function ownTransactionViewWire(view: OwnTransactionView): OwnTransactionViewWire {
  return {
    transaction: transactionWire(view.transaction),
    revisions: view.revisions.map(revisionWire),
    activeCategory:
      view.activeCategory === null ? null : categoryAssignmentWire(view.activeCategory),
    divergesFromSource: view.divergesFromSource,
  };
}
