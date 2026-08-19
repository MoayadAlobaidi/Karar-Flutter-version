/**
 * Response serialization for accounts, issuers and reported balances — CLOSED
 * field sets, picked by name.
 *
 * PICKED BY NAME IS THE CONTROL. Every object below is built field by field
 * from the read model rather than spread from it, so a field the domain gains
 * later cannot reach a client by accident. The contract closes each of these
 * shapes with `additionalProperties: false`, and the runtime conformance
 * suite holds a real response to that closure — but the closure is only
 * enforceable because nothing here spreads.
 *
 * WHAT IS DELIBERATELY NOT SERIALIZED, and must stay that way:
 *   * `tenantId` and `userId`. The caller IS the subject; echoing the ids
 *     back invites a client to key on them and a later reader to think they
 *     are inputs.
 *   * every ciphertext, nonce, auth tag, algorithm and key version. Those
 *     live on the persistence port's `EncryptedField` and never on a read
 *     model, so there is nothing here to omit — and no helper that would make
 *     omitting them a choice.
 *   * a balance on the account itself. A balance is a reported fact with its
 *     own route and its own `balanceKind`; a figure on the account row would
 *     be a second number free to disagree with it.
 *   * the snapshot's `sourceReference`. It is the source's own internal
 *     identifier for a figure, and it is not the subject's to read here.
 */

import { CONSTRUCTIBLE_SOURCE_KINDS } from '@karar/financial-accounts';
import type { BalanceSnapshot, FinancialAccount, Institution } from '@karar/financial-accounts';

import {
  amountWire,
  instantWire,
  nullableRevealWire,
  revealWire,
  type AmountWire,
} from './wire.js';

/**
 * Whether a rail can actually RUN, not whether the column can hold it.
 *
 * Derived from the module's own constructible set rather than restated, so
 * "we can describe this rail" and "this rail works" cannot drift apart here
 * the way the database keeps its vocabulary CHECK and its gate CHECK apart.
 */
export function railAvailability(sourceKind: string): 'EXECUTABLE' | 'NOT_IMPLEMENTED' {
  return (CONSTRUCTIBLE_SOURCE_KINDS as readonly string[]).includes(sourceKind)
    ? 'EXECUTABLE'
    : 'NOT_IMPLEMENTED';
}

/**
 * The one link claim this platform can honestly make.
 *
 * Emitted on the wire rather than left in documentation: no issuer named in
 * the catalogue exposes an interface to Karar, no credential of any kind is
 * stored, and nothing may render "Connected", "Synced" or "Linked" for data a
 * person typed or uploaded (ADR-0028). A client that reads this object cannot
 * conclude otherwise from a status it half-recognises.
 */
export const NOT_LINKED = Object.freeze({
  state: 'NOT_LINKED' as const,
  impliesLiveInstitutionLink: false as const,
  providerAccessStatus: 'NOT_IMPLEMENTED' as const,
});

export interface InstitutionWire {
  readonly institutionId: string;
  readonly code: string;
  readonly kind: string;
  readonly displayNameEn: string;
  readonly displayNameAr: string;
  readonly status: string;
}

export function institutionWire(institution: Institution): InstitutionWire {
  return {
    institutionId: institution.id,
    code: institution.code,
    kind: institution.kind,
    displayNameEn: institution.displayNameEn,
    displayNameAr: institution.displayNameAr,
    status: institution.status,
  };
}

export interface FinancialAccountWire {
  readonly accountId: string;
  readonly accountType: string;
  readonly walletKind: string | null;
  readonly nature: string;
  readonly currency: { readonly code: string; readonly exponent: number };
  readonly displayName: string;
  readonly mask: string | null;
  readonly institution: InstitutionWire | null;
  readonly userSuppliedInstitutionLabel: string | null;
  readonly status: string;
  readonly origin: string;
  readonly link: typeof NOT_LINKED;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

/**
 * `institution` is resolved by the caller and handed in, rather than looked
 * up here: a serializer that reached for a repository would issue one query
 * per row, and the page bound would stop bounding anything that matters.
 */
export function financialAccountWire(
  account: FinancialAccount,
  institution: Institution | null,
): FinancialAccountWire {
  return {
    accountId: account.id,
    accountType: account.accountType,
    walletKind: account.walletKind,
    nature: account.nature,
    currency: { code: account.currency.code, exponent: account.currency.exponent },
    displayName: revealWire(account.displayName),
    mask: nullableRevealWire(account.mask),
    institution: institution === null ? null : institutionWire(institution),
    userSuppliedInstitutionLabel: nullableRevealWire(account.userSuppliedInstitutionLabel),
    status: account.status,
    origin: account.origin,
    link: NOT_LINKED,
    createdAt: instantWire(account.createdAt),
    updatedAt: instantWire(account.updatedAt),
    version: account.version,
  };
}

export interface BalanceSnapshotWire {
  readonly snapshotId: string;
  readonly accountId: string;
  readonly amount: AmountWire;
  readonly balanceKind: string;
  readonly sourceKind: string;
  readonly availability: 'EXECUTABLE' | 'NOT_IMPLEMENTED';
  readonly asOf: string;
  readonly capturedAt: string;
}

export function balanceSnapshotWire(snapshot: BalanceSnapshot): BalanceSnapshotWire {
  return {
    snapshotId: snapshot.id,
    accountId: snapshot.accountId,
    amount: amountWire(snapshot.amount),
    // Stated, never substituted: a caller asking what is AVAILABLE must not
    // receive a BOOKED figure wearing another label.
    balanceKind: snapshot.balanceKind,
    sourceKind: snapshot.sourceKind,
    availability: railAvailability(snapshot.sourceKind),
    asOf: instantWire(snapshot.asOf),
    capturedAt: instantWire(snapshot.capturedAt),
  };
}
