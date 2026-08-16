/**
 * MFA secret encryption over the platform EncryptionProvider (MfaSecretCipher
 * port). The stored envelope is {ciphertext, keyVersion}: version provenance
 * travels with the ciphertext exactly as ADR-0017 requires, so a rotation
 * leaves old enrolments decryptable and new ones on the new version.
 */

import { parseKeyRef, parseKeyVersionRef } from '@karar/platform/dist/keys/index.js';
import type { EncryptionProvider, KeyRef } from '@karar/platform/dist/keys/index.js';

import type {
  EncryptedSecret,
  MfaSecretCipher,
} from '../../application/ports/crypto-ports.js';

/** The identity module's MFA key reference; the provider resolves it. */
export const MFA_SECRET_KEY_REF = 'karar-ref:key:identity-mfa-secrets';

export class PlatformMfaSecretCipher implements MfaSecretCipher {
  private readonly keyRef: KeyRef;

  constructor(private readonly provider: EncryptionProvider) {
    this.keyRef = parseKeyRef(MFA_SECRET_KEY_REF);
  }

  async encrypt(plaintextSecret: string): Promise<EncryptedSecret> {
    const envelope = await this.provider.encrypt(
      new TextEncoder().encode(plaintextSecret),
      this.keyRef,
    );
    return { ciphertext: envelope.ciphertext, keyVersion: envelope.keyVersion };
  }

  async decrypt(secret: EncryptedSecret): Promise<string> {
    const plaintext = await this.provider.decrypt(
      { ciphertext: secret.ciphertext, keyVersion: parseKeyVersionRef(secret.keyVersion) },
      this.keyRef,
    );
    return new TextDecoder().decode(plaintext);
  }
}
