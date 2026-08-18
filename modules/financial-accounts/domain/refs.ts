/**
 * Reference types this module declares.
 *
 * Cross-module references carry a raw UUID plus a reference type declared
 * HERE (modules/financial-accounts/MODULE.md; data-model.md §2) — the branded
 * alias is what stops a snapshot id being handed to a call site expecting an
 * account id, without dragging a foreign module's types across the boundary.
 * `TenantId` and `UserId` are kernel universals and are deliberately not
 * redeclared.
 */

/** A `financial_accounts.id`. */
export type FinancialAccountId = string & { readonly __brand: 'FinancialAccountId' };

/** A `financial_account_balance_snapshots.id`. */
export type BalanceSnapshotId = string & { readonly __brand: 'BalanceSnapshotId' };

/** An `institutions.id` — a row in the reviewed catalogue, never a connection. */
export type InstitutionRef = string & { readonly __brand: 'InstitutionRef' };

/**
 * An opaque forward reference to a provider connection that does not exist.
 *
 * Phase 5 integrates no provider, stores no credential, and keeps no
 * synchronisation cursor. The type is declared so the shape of an account is
 * settled before a provider arrives — NOT because anything can produce one.
 * Nothing in this module constructs a value of this type, and the rule that
 * a MANUAL or CSV account may not carry one is enforced in the domain, in the
 * use cases, and by a database CHECK (migration 0088). It is never a
 * credential: no column, type, or field in this module may hold one.
 */
export type ProviderConnectionRef = string & { readonly __brand: 'ProviderConnectionRef' };

/**
 * Where the figure or the row came from, as an opaque in-module reference —
 * for example the statement import that reported a balance. Free-form to the
 * caller, bounded and non-empty at the boundary.
 */
export type SourceReference = string & { readonly __brand: 'SourceReference' };
