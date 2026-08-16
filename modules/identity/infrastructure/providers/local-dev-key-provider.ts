/**
 * LocalDevKeyProvider (TokenKeyProvider port) — the LOCAL-ONLY signing-key
 * source. Generates a fresh ES256 keypair lazily at first use, stamps a
 * random kid, and THROWS at construction outside `KARAR_ENV=local` — a
 * deployment must wire a real key-management provider; a process-lifetime
 * keypair in production would mean every deploy signs everyone out and no
 * second instance can verify the first's tokens.
 *
 * Key material lives only in this object (non-extractable CryptoKey pair);
 * there is no export path and no fixed-key constructor.
 */

import { generateKeyPair } from 'jose';

import type { TokenKeyProvider } from '../../application/ports/crypto-ports.js';
import { randomBytes } from 'node:crypto';

export class LocalDevKeyEnvironmentError extends Error {
  override readonly name = 'LocalDevKeyEnvironmentError';

  constructor(env: string) {
    super(
      `LocalDevKeyProvider is local-development-only and refuses to exist in KARAR_ENV='${env}' — wire the deployment profile's key provider for this environment`,
    );
  }
}

interface KeyState {
  readonly kid: string;
  readonly privateKey: unknown;
  readonly publicKey: unknown;
}

export class LocalDevKeyProvider implements TokenKeyProvider {
  readonly algorithm = 'ES256' as const;
  private statePromise: Promise<KeyState> | undefined;

  constructor(options: { readonly env: string }) {
    if (options.env !== 'local') {
      throw new LocalDevKeyEnvironmentError(options.env);
    }
  }

  async keyId(): Promise<string> {
    return (await this.state()).kid;
  }

  async signingKey(): Promise<unknown> {
    return (await this.state()).privateKey;
  }

  async verificationKey(kid: string): Promise<unknown | null> {
    const state = await this.state();
    return kid === state.kid ? state.publicKey : null;
  }

  private state(): Promise<KeyState> {
    this.statePromise ??= (async () => {
      const { privateKey, publicKey } = await generateKeyPair('ES256');
      return {
        kid: `local-${randomBytes(6).toString('base64url')}`,
        privateKey,
        publicKey,
      };
    })();
    return this.statePromise;
  }
}
