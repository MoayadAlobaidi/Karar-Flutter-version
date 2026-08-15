/**
 * Key-management and encryption ports (ADR-0017; data-model.md §9/§9.1).
 *
 * Application and module code depend on these interfaces and on opaque
 * `KeyRef`/`KeyVersionRef` values only. The adapter for the active deployment
 * profile (a cloud KMS, an external key manager, an HSM front, or the local
 * dev key file) implements them under `infrastructure/providers/` in a later
 * phase — no cloud SDK appears in this package.
 *
 * Provenance is structural: every wrap and every encryption result carries
 * the `KeyVersionRef` that produced it. There is no way to hold ciphertext
 * without knowing which key version can open it, which is what makes
 * key-version loss detectable and rotation auditable.
 */

import type { KeyRef, KeyVersionRef } from './refs.js';

/** Metadata about a key (never material). */
export interface KeyDescriptor {
  readonly ref: KeyRef;
  /** The specific version described. */
  readonly version: KeyVersionRef;
  /** Provider-neutral algorithm name, e.g. 'AES-256-GCM'. */
  readonly algorithm: string;
  readonly state: 'ENABLED' | 'DISABLED' | 'PENDING_DESTRUCTION';
}

/** A data-encryption key wrapped by a key-encryption key, with provenance. */
export interface WrappedDek {
  readonly ciphertext: Uint8Array;
  /** The exact KEK version that performed the wrap. */
  readonly kekVersion: KeyVersionRef;
}

/** An encryption result, with provenance. */
export interface CiphertextEnvelope {
  readonly ciphertext: Uint8Array;
  /** The exact key version that produced the ciphertext. */
  readonly keyVersion: KeyVersionRef;
}

export type KeyManagementErrorKind =
  /** The ref (or ref@version) names nothing the provider knows. */
  | 'unknown_key'
  | 'unknown_key_version'
  /** Authenticated decryption failed: wrong version, wrong key, or tampered ciphertext. */
  | 'decryption_failed'
  /** The provider is unreachable or refused access. */
  | 'provider_unavailable';

/**
 * The single typed failure of both ports. Decryption failure is deliberately
 * one opaque kind — distinguishing "wrong key" from "tampered ciphertext" to
 * a caller would leak an oracle; logs and metrics get the kind, never key
 * material or plaintext fragments.
 */
export class KeyManagementError extends Error {
  override readonly name = 'KeyManagementError';
  readonly kind: KeyManagementErrorKind;

  constructor(kind: KeyManagementErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * Key lifecycle and wrap/unwrap operations against the active provider.
 * All methods reject with `KeyManagementError`.
 */
export interface KeyManagementProvider {
  /** Describes a key (its current version, or the named one). Never returns material. */
  getKey(ref: KeyRef, version?: KeyVersionRef): Promise<KeyDescriptor>;
  /** Wraps a data-encryption key under the KEK's current version. */
  wrap(dek: Uint8Array, kekRef: KeyRef): Promise<WrappedDek>;
  /** Unwraps using the exact KEK version recorded at wrap time. */
  unwrap(wrapped: WrappedDek, kekRef: KeyRef): Promise<Uint8Array>;
  /** The version new wraps and encryptions would use right now. */
  currentVersion(ref: KeyRef): Promise<KeyVersionRef>;
  /**
   * Creates and activates a new version; prior versions remain usable for
   * unwrap/decrypt until destroyed under the rotation policy's destruction
   * safeguards (custody.ts).
   */
  rotate(ref: KeyRef): Promise<KeyVersionRef>;
}

/**
 * Payload encryption against a referenced key. `decrypt` uses the envelope's
 * own `keyVersion` — after a rotation, old envelopes stay readable and new
 * ones carry the new version.
 */
export interface EncryptionProvider {
  encrypt(plaintext: Uint8Array, keyRef: KeyRef): Promise<CiphertextEnvelope>;
  decrypt(envelope: CiphertextEnvelope, keyRef: KeyRef): Promise<Uint8Array>;
}
