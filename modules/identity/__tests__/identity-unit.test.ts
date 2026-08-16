/**
 * Pure unit coverage: e-mail normalization, user-agent minimization, the
 * security-metadata guard, uuidv7 shape, the token signer's audience
 * separation, and the LOCAL-ONLY gates (key provider, encryption provider,
 * mail sink all refuse to exist outside KARAR_ENV=local). No database.
 */

import { describe, expect, it } from 'vitest';

import { Clock, UserId } from '@karar/shared-kernel';
import {
  LocalDevEncryptionProvider,
  LocalDevEncryptionEnvironmentError,
} from '@karar/platform/dist/keys/index.js';
import {
  LocalMailSink,
  LocalMailSinkEnvironmentError,
} from '@karar/platform/dist/notifications/index.js';

import { normalizeEmail, parseEmail } from '../domain/email-address.js';
import { summarizeUserAgent } from '../domain/user-agent.js';
import { DEFAULT_IDENTITY_POLICY } from '../domain/identity-policy.js';
import { guardSecurityMetadata, SecurityMetadataViolation } from '../application/identity-deps.js';
import { uuidv7 } from '../infrastructure/crypto/uuidv7.js';
import { NodeSecretSource } from '../infrastructure/crypto/node-secret-source.js';
import { JoseTokenSigner } from '../infrastructure/crypto/jose-token-signer.js';
import {
  LocalDevKeyEnvironmentError,
  LocalDevKeyProvider,
} from '../infrastructure/providers/local-dev-key-provider.js';

describe('email normalization', () => {
  it('trims, lowercases, and NFC-normalizes', () => {
    expect(normalizeEmail('  User.Name@EXAMPLE.com ')).toBe('user.name@example.com');
  });

  it('accepts ordinary addresses and rejects malformed ones without echoing values', () => {
    expect(parseEmail('a.person@sub.example.co').ok).toBe(true);
    for (const bad of ['', 'no-at-sign', 'two@@example.com', 'user@nodot', 'a b@example.com']) {
      const outcome = parseEmail(bad);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.message).not.toContain(bad || 'unreachable');
    }
  });
});

describe('user-agent minimization', () => {
  it('summarizes to family and os, never the raw string', () => {
    const raw =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    expect(summarizeUserAgent(raw)).toBe('Chrome on macOS');
    expect(summarizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) FxiOS/126.0')).toBe(
      'Firefox on iOS',
    );
    expect(summarizeUserAgent('some-strange-client/9.9')).toBe('unknown client');
    expect(summarizeUserAgent(null)).toBeNull();
    expect(summarizeUserAgent('   ')).toBeNull();
  });
});

describe('security-metadata guard', () => {
  it('passes small scalar facts', () => {
    expect(guardSecurityMetadata({ reason: 'mismatch', attempts: 3, locked: true })).toEqual({
      reason: 'mismatch',
      attempts: 3,
      locked: true,
    });
  });

  it('throws on credential-shaped keys and oversized values', () => {
    for (const bad of [
      { password: 'x' },
      { code: '123456' },
      { token: 'abc' },
      { secret: 's' },
      { userEmail: 'a@b.co' },
      { apiKey: 'k' },
      { hash: 'h' },
    ]) {
      expect(() => guardSecurityMetadata(bad)).toThrow(SecurityMetadataViolation);
    }
    expect(() => guardSecurityMetadata({ blob: 'x'.repeat(300) })).toThrow(
      SecurityMetadataViolation,
    );
  });
});

describe('identifiers and randomness', () => {
  it('uuidv7 is RFC-shaped with the version and variant nibbles', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('mints distinct, correctly-sized material', () => {
    const source = new NodeSecretSource();
    expect(source.refreshToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(source.resetToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(source.verificationCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(source.recoveryCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(source.refreshToken()).not.toBe(source.refreshToken());
  });
});

describe('token signer', () => {
  const clock = new Clock.Fixed(new Date('2026-08-16T09:00:00.000Z'));
  const signer = new JoseTokenSigner({
    keys: new LocalDevKeyProvider({ env: 'local' }),
    accessTokenTtlMs: 600_000,
    challengeTokenTtlMs: 300_000,
  });
  const accountId = UserId.of('0198c0de-0000-7000-8000-000000000001');

  it('signs and verifies access tokens with sub/sid/tv and a 10-minute exp', async () => {
    const signed = await signer.signAccessToken(
      { accountId, sessionId: 'sess-1', tokenVersion: 3 },
      clock.now(),
    );
    expect(signed.expiresAt.getTime() - clock.now().getTime()).toBe(600_000);
    const verified = await signer.verifyAccessToken(signed.token, clock.now());
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error('unreachable');
    expect(verified.value).toEqual({ accountId, sessionId: 'sess-1', tokenVersion: 3 });

    // No roles, no permissions, no e-mail in the payload.
    const payload = JSON.parse(
      Buffer.from(signed.token.split('.')[1] as string, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid', 'sub', 'tv']);
    expect(payload['iss']).toBe('karar');
    expect(payload['aud']).toBe('karar-api');
  });

  it('expires access tokens and separates audiences', async () => {
    const signed = await signer.signAccessToken(
      { accountId, sessionId: 'sess-1', tokenVersion: 1 },
      clock.now(),
    );
    const later = new Date(clock.now().getTime() + 601_000);
    const expired = await signer.verifyAccessToken(signed.token, later);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error).toBe('expired');

    // A challenge token never verifies as an access token, nor vice versa.
    const challenge = await signer.signChallengeToken(accountId, clock.now());
    expect((await signer.verifyAccessToken(challenge.token, clock.now())).ok).toBe(false);
    expect((await signer.verifyChallengeToken(signed.token, clock.now())).ok).toBe(false);
    expect((await signer.verifyChallengeToken(challenge.token, clock.now())).ok).toBe(true);
  });

  it('rejects tokens signed by a DIFFERENT local keypair (kid mismatch)', async () => {
    const otherSigner = new JoseTokenSigner({
      keys: new LocalDevKeyProvider({ env: 'local' }),
      accessTokenTtlMs: 600_000,
      challengeTokenTtlMs: 300_000,
    });
    const foreign = await otherSigner.signAccessToken(
      { accountId, sessionId: 'sess-1', tokenVersion: 1 },
      clock.now(),
    );
    expect((await signer.verifyAccessToken(foreign.token, clock.now())).ok).toBe(false);
  });
});

describe('local-only gates', () => {
  it('every local-only provider throws at construction outside KARAR_ENV=local', () => {
    for (const env of ['dev', 'staging', 'production']) {
      expect(() => new LocalDevKeyProvider({ env })).toThrow(LocalDevKeyEnvironmentError);
      expect(() => new LocalDevEncryptionProvider({ env })).toThrow(
        LocalDevEncryptionEnvironmentError,
      );
      expect(() => new LocalMailSink({ env })).toThrow(LocalMailSinkEnvironmentError);
    }
    expect(() => new LocalDevKeyProvider({ env: 'local' })).not.toThrow();
    expect(() => new LocalDevEncryptionProvider({ env: 'local' })).not.toThrow();
    expect(() => new LocalMailSink({ env: 'local' })).not.toThrow();
  });
});

describe('policy defaults', () => {
  it('carries the documented thresholds', () => {
    expect(DEFAULT_IDENTITY_POLICY.accessTokenTtlMs).toBe(10 * 60_000);
    expect(DEFAULT_IDENTITY_POLICY.sessionIdleTtlMs).toBeNull();
    expect(DEFAULT_IDENTITY_POLICY.lockoutThreshold).toBe(10);
    expect(DEFAULT_IDENTITY_POLICY.recoveryLockThreshold).toBe(5);
    expect(DEFAULT_IDENTITY_POLICY.verificationMaxAttempts).toBe(5);
  });
});
