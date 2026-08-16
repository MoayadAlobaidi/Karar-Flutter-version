/**
 * LOCAL-ONLY encryption provider for development boot paths that need a real
 * EncryptionProvider (identity's MFA secrets) before any key-management
 * service exists. The constructor THROWS outside `KARAR_ENV=local` — this
 * class must never be a production provider, and refusing to construct is
 * the guarantee (same posture as notifications' LocalMailSink).
 *
 * Mechanics are the standard-algorithm test provider's (AES-256-GCM,
 * node:crypto, fresh IV per encryption, version provenance) — deliberately
 * reused rather than re-implemented, so there is exactly one local AES-GCM
 * envelope shape. Key material is random per PROCESS: a restart makes prior
 * local ciphertexts undecryptable, which for local development means
 * re-enrolling MFA after a restart — a stated cost, not a surprise. No
 * export, no serialization, no fixed-key constructor.
 */

import { InMemoryTestEncryptionProvider } from './in-memory-test-encryption-provider.js';
import type {
  CiphertextEnvelope,
  EncryptionProvider,
  KeyDescriptor,
  KeyManagementProvider,
  WrappedDek,
} from './ports.js';
import type { KeyRef, KeyVersionRef } from './refs.js';

export class LocalDevEncryptionEnvironmentError extends Error {
  override readonly name = 'LocalDevEncryptionEnvironmentError';

  constructor(env: string) {
    super(
      `LocalDevEncryptionProvider is local-development-only and refuses to exist in KARAR_ENV='${env}' — wire the deployment profile's key-management provider for this environment`,
    );
  }
}

export class LocalDevEncryptionProvider implements EncryptionProvider, KeyManagementProvider {
  private readonly inner = new InMemoryTestEncryptionProvider();

  constructor(options: { readonly env: string }) {
    if (options.env !== 'local') {
      throw new LocalDevEncryptionEnvironmentError(options.env);
    }
  }

  getKey(ref: KeyRef, version?: KeyVersionRef): Promise<KeyDescriptor> {
    return this.inner.getKey(ref, version);
  }

  currentVersion(ref: KeyRef): Promise<KeyVersionRef> {
    return this.inner.currentVersion(ref);
  }

  rotate(ref: KeyRef): Promise<KeyVersionRef> {
    return this.inner.rotate(ref);
  }

  encrypt(plaintext: Uint8Array, keyRef: KeyRef): Promise<CiphertextEnvelope> {
    return this.inner.encrypt(plaintext, keyRef);
  }

  decrypt(envelope: CiphertextEnvelope, keyRef: KeyRef): Promise<Uint8Array> {
    return this.inner.decrypt(envelope, keyRef);
  }

  wrap(dek: Uint8Array, kekRef: KeyRef): Promise<WrappedDek> {
    return this.inner.wrap(dek, kekRef);
  }

  unwrap(wrapped: WrappedDek, kekRef: KeyRef): Promise<Uint8Array> {
    return this.inner.unwrap(wrapped, kekRef);
  }
}
