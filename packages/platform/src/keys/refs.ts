/**
 * Key references and key-version references.
 *
 * `KeyRef` is the config workstream's branded `karar-ref:key:<id>` reference
 * (config/refs.ts) — re-exported rather than redeclared so the platform has
 * exactly one KeyRef type. This file adds `KeyVersionRef`, the provenance
 * reference ADR-0017 requires on every wrap and every encryption result:
 * "key and version provenance recorded for every wrap and rotation".
 *
 * Scheme, aligned with config/refs.ts (`karar-ref:<kind>:<id>`):
 *
 *     karar-ref:key-version:<keyId>@v<N>
 *
 * The `<keyId>` portion is the id of the underlying `karar-ref:key:<keyId>`;
 * `<N>` is a positive integer version ordinal assigned by the key-management
 * provider. Nothing provider-specific ever appears in either — a cloud KMS
 * version resource name stays inside the provider adapter that resolves the
 * ref (infrastructure-portability.md §6).
 */

import { parseKeyRef, type KeyRef } from '../config/refs.js';

export { parseKeyRef, type KeyRef };

declare const keyVersionBrand: unique symbol;
/** Opaque, branded reference to one version of one key. */
export type KeyVersionRef = string & { readonly [keyVersionBrand]: 'key-version' };

const KEY_VERSION_PATTERN = /^karar-ref:key-version:(\S+?)@v([1-9]\d*)$/;

export class InvalidKeyVersionRefError extends Error {
  override readonly name = 'InvalidKeyVersionRefError';

  constructor(reason: string) {
    super(`invalid karar-ref:key-version reference: ${reason}`);
  }
}

/** Builds the version ref for `version` of the key behind `keyRef`. */
export function keyVersionRef(keyRef: KeyRef, version: number): KeyVersionRef {
  if (!Number.isInteger(version) || version < 1) {
    throw new InvalidKeyVersionRefError(`version must be a positive integer, got ${version}`);
  }
  const keyId = keyRef.slice('karar-ref:key:'.length);
  return `karar-ref:key-version:${keyId}@v${version}` as KeyVersionRef;
}

export function parseKeyVersionRef(raw: string): KeyVersionRef {
  if (!KEY_VERSION_PATTERN.test(raw)) {
    throw new InvalidKeyVersionRefError(`expected the form 'karar-ref:key-version:<keyId>@v<N>'`);
  }
  return raw as KeyVersionRef;
}

/** The `karar-ref:key:<id>` reference of the key a version ref belongs to. */
export function keyRefOf(ref: KeyVersionRef): KeyRef {
  const match = KEY_VERSION_PATTERN.exec(ref);
  // A branded ref can only be produced by keyVersionRef/parseKeyVersionRef.
  return parseKeyRef(`karar-ref:key:${match?.[1] ?? ''}`);
}

/** The version ordinal a version ref names. */
export function versionOf(ref: KeyVersionRef): number {
  const match = KEY_VERSION_PATTERN.exec(ref);
  return Number.parseInt(match?.[2] ?? '0', 10);
}
