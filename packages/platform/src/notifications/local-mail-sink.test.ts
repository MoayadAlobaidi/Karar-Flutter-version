/**
 * LocalMailSink: the environment gate (constructor throws outside local) and
 * the ring-buffer capture semantics tests rely on.
 */

import { describe, expect, it } from 'vitest';

import { LocalMailSink, LocalMailSinkEnvironmentError } from './local-mail-sink.js';

describe('LocalMailSink', () => {
  it('refuses to exist outside KARAR_ENV=local', () => {
    for (const env of ['dev', 'staging', 'production', '']) {
      expect(() => new LocalMailSink({ env })).toThrow(LocalMailSinkEnvironmentError);
    }
  });

  it('captures messages with accessors per address', async () => {
    const sink = new LocalMailSink({ env: 'local' });
    const expiresAt = new Date('2026-08-16T10:00:00.000Z');
    await sink.sendVerificationCode({ to: 'a@example.com', code: 'CODE0001', expiresAt });
    await sink.sendPasswordReset({ to: 'b@example.com', token: 'tok', expiresAt });
    await sink.sendSecurityNotice({ to: 'a@example.com', kind: 'password_changed' });

    expect(sink.captured()).toHaveLength(3);
    expect(sink.capturedFor('a@example.com')).toHaveLength(2);
    const last = sink.lastFor('a@example.com');
    expect(last?.type).toBe('security_notice');
    sink.clear();
    expect(sink.captured()).toHaveLength(0);
  });

  it('is a RING buffer: oldest entries are evicted at capacity', async () => {
    const sink = new LocalMailSink({ env: 'local', capacity: 3 });
    for (let i = 0; i < 5; i += 1) {
      await sink.sendSecurityNotice({ to: `user${i}@example.com`, kind: 'password_changed' });
    }
    const kept = sink.captured().map((entry) => entry.message.to);
    expect(kept).toEqual(['user2@example.com', 'user3@example.com', 'user4@example.com']);
  });
});
