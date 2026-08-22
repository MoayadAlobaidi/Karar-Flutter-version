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
 * There is deliberately NO `ProviderConnectionRef` here, and its removal is the
 * point rather than an omission.
 *
 * The account row used to carry an opaque provider-connection reference bound
 * to its source kind, which asserted that an account has exactly one permanent
 * data source. That is false about real accounts: one account may be typed by
 * hand, then fed by CSV imports, then linked to an API, then corrected by hand,
 * and it stays one account throughout (ADR-0028). The type and the column were
 * therefore removed rather than reinterpreted. Which sources feed an account —
 * now and historically — is many-per-account and belongs to account-source
 * links, which this module does not model and must not grow a field for.
 */

/**
 * Where the figure came from, as an OPAQUE UUID — the statement import or the
 * manual entry that reported a balance, named by its identifier and by
 * nothing else.
 *
 * Deliberately not free-form. The value sits on a table classified
 * `HIGHLY_SENSITIVE_FINANCIAL`, and a free-form reference is a place a
 * statement line or an account number can be written by a caller who meant
 * to be helpful. `isValidSourceReference` and the `uuid` column in migration
 * 0089 make that structurally impossible rather than discouraged.
 */
export type SourceReference = string & { readonly __brand: 'SourceReference' };
