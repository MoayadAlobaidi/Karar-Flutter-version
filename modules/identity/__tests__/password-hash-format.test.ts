/**
 * Password hashing vs subject-key digestion — the regression pair for the
 * CodeQL alert-1 dismissal (docs/operations/repository-security-settings.md).
 *
 * Passwords are ALWAYS argon2id PHC strings with the versioned parameters;
 * they are never a bare digest. The other half of the pair lives in
 * packages/platform/src/ratelimit/ratelimit.test.ts, which pins that
 * rate-limit subject keys are HMAC digests and never the raw identifier.
 * Together they keep the two hashing purposes structurally distinguishable:
 * a change that routed a password into a plain digest, or a subject key into
 * a password hasher, fails one of the two.
 */

import { describe, expect, it } from 'vitest';

import {
  Argon2PasswordHasher,
  CURRENT_ARGON2_PARAMS_VERSION,
} from '../infrastructure/crypto/argon2-password-hasher.js';

describe('Argon2PasswordHasher output format', () => {
  it('produces a versioned argon2id PHC string, never a bare digest', async () => {
    const hasher = new Argon2PasswordHasher();
    const { passwordHash, paramsVersion } = await hasher.hash('a-test-only-password-value');

    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    // Version-1 parameters are embedded in the PHC string itself (the
    // library orders them m,p,t — assert each, not the ordering).
    expect(passwordHash).toContain('m=131072');
    expect(passwordHash).toContain('t=2');
    expect(passwordHash).toContain('p=1');
    expect(paramsVersion).toBe(CURRENT_ARGON2_PARAMS_VERSION);
    // Never a bare hex/base64url digest of the kind subject keys use.
    expect(/^[0-9a-f]+$/i.test(passwordHash)).toBe(false);

    await expect(hasher.verify(passwordHash, 'a-test-only-password-value')).resolves.toBe(true);
    await expect(hasher.verify(passwordHash, 'a-different-password')).resolves.toBe(false);
  });
});
