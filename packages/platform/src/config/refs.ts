/**
 * Opaque references — `karar-ref:<kind>:<id>`.
 *
 * Nothing provider-specific is ever domain identity
 * (docs/architecture/infrastructure-portability.md §6). Application code and
 * persisted data carry these opaque, branded strings — never a `gs://` URL, an
 * `arn:aws:…`, a secret-manager resource ID, or a KMS key resource name.
 *
 * Resolution is deliberately absent here: the active deployment profile's
 * adapters (SecretProvider, KeyManagementProvider, ObjectStorage, …) resolve a
 * ref to a provider resource in a later phase. Phase 2 pins only the shape, so
 * that everything written from now on is already portable.
 */

const REF_SCHEME = 'karar-ref';

/** The reference kinds defined by infrastructure-portability.md §6 (plus the two profile refs). */
export const REF_KINDS = [
  'secret',
  'key',
  'object',
  'database-profile',
  'deployment-profile',
] as const;
export type RefKind = (typeof REF_KINDS)[number];

declare const refBrand: unique symbol;
type Branded<K extends RefKind> = string & { readonly [refBrand]: K };

/** Opaque reference to a secret held by the active profile's SecretProvider. */
export type SecretRef = Branded<'secret'>;
/** Opaque reference to a key held by the active profile's KeyManagementProvider. */
export type KeyRef = Branded<'key'>;
/** Opaque reference to a stored object, resolved by the profile's ObjectStorage adapter. */
export type ObjectRef = Branded<'object'>;
/** Opaque reference to a named database connection profile. */
export type DatabaseProfileRef = Branded<'database-profile'>;
/** Opaque reference to a DeploymentProfile. */
export type DeploymentProfileRef = Branded<'deployment-profile'>;

// `<id>` is intentionally loose (any non-empty string without whitespace or
// further colon-splitting rules) — its meaning belongs to the resolver, not us.
const REF_PATTERN = /^karar-ref:([a-z][a-z-]*):(\S+)$/;

export class InvalidRefError extends Error {
  override readonly name = 'InvalidRefError';
  /** The kind that was expected. The raw value is never echoed for `secret` refs. */
  readonly expectedKind: RefKind;

  constructor(expectedKind: RefKind, reason: string) {
    super(`invalid ${REF_SCHEME}:${expectedKind} reference: ${reason}`);
    this.expectedKind = expectedKind;
  }
}

function parseRef<K extends RefKind>(kind: K, raw: string): Branded<K> {
  const match = REF_PATTERN.exec(raw);
  if (match === null) {
    throw new InvalidRefError(kind, `expected the form '${REF_SCHEME}:${kind}:<id>'`);
  }
  if (match[1] !== kind) {
    throw new InvalidRefError(kind, `kind mismatch (got '${match[1] ?? ''}')`);
  }
  return raw as Branded<K>;
}

export function parseSecretRef(raw: string): SecretRef {
  return parseRef('secret', raw);
}

export function parseKeyRef(raw: string): KeyRef {
  return parseRef('key', raw);
}

export function parseObjectRef(raw: string): ObjectRef {
  return parseRef('object', raw);
}

export function parseDatabaseProfileRef(raw: string): DatabaseProfileRef {
  return parseRef('database-profile', raw);
}

export function parseDeploymentProfileRef(raw: string): DeploymentProfileRef {
  return parseRef('deployment-profile', raw);
}

/** True when `raw` is a well-formed reference of the given kind. */
export function isRef(kind: RefKind, raw: string): boolean {
  const match = REF_PATTERN.exec(raw);
  return match !== null && match[1] === kind;
}

/** The `<id>` portion of a well-formed reference. */
export function refId(
  ref: SecretRef | KeyRef | ObjectRef | DatabaseProfileRef | DeploymentProfileRef,
): string {
  const match = REF_PATTERN.exec(ref);
  // A branded ref can only be produced by parseRef, so this cannot fail.
  return match?.[2] ?? '';
}
