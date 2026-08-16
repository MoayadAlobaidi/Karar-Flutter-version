/**
 * Trusted-proxy derivation: the spoofing matrix (AUTHN-04). The invariant
 * under test everywhere: a client-supplied header changes NOTHING unless the
 * direct peer is inside the configured allow-list — and even then only the
 * hops a trusted proxy vouches for are believed.
 */

import { describe, expect, it } from 'vitest';

import {
  InvalidTrustedProxySpecError,
  TrustedProxyPolicy,
  canonicalIp,
  parseIp,
  parseTrustedProxySpec,
} from './trusted-proxy.js';

describe('parseTrustedProxySpec', () => {
  it('splits a comma-separated list and defaults to EMPTY (trust nothing)', () => {
    expect(parseTrustedProxySpec(undefined)).toEqual([]);
    expect(parseTrustedProxySpec('')).toEqual([]);
    expect(parseTrustedProxySpec('10.0.0.0/8, 192.168.1.1 ,2001:db8::/32')).toEqual([
      '10.0.0.0/8',
      '192.168.1.1',
      '2001:db8::/32',
    ]);
  });
});

describe('TrustedProxyPolicy construction', () => {
  it('rejects malformed entries by POSITION, never echoing junk into config state', () => {
    expect(() => new TrustedProxyPolicy(['10.0.0.0/8', 'not-an-ip'])).toThrow(
      InvalidTrustedProxySpecError,
    );
    expect(() => new TrustedProxyPolicy(['10.0.0.0/33'])).toThrow(InvalidTrustedProxySpecError);
    expect(() => new TrustedProxyPolicy(['10.0.0.0/8/9'])).toThrow(InvalidTrustedProxySpecError);
    expect(() => new TrustedProxyPolicy(['2001:db8::/129'])).toThrow(InvalidTrustedProxySpecError);
  });
});

describe('ip parsing', () => {
  it('parses v4, v6, bracketed v6, zone indexes, and v4-mapped v6', () => {
    expect(canonicalIp(parseIp('192.168.1.20')!)).toBe('192.168.1.20');
    expect(canonicalIp(parseIp('2001:DB8::1')!)).toBe('2001:db8:0:0:0:0:0:1');
    expect(canonicalIp(parseIp('[2001:db8::1]')!)).toBe('2001:db8:0:0:0:0:0:1');
    expect(canonicalIp(parseIp('fe80::1%en0')!)).toBe('fe80:0:0:0:0:0:0:1');
    // v4-mapped v6 normalizes to v4, so one CIDR matches both notations.
    expect(canonicalIp(parseIp('::ffff:192.168.1.20')!)).toBe('192.168.1.20');
    expect(parseIp('999.1.1.1')).toBeNull();
    expect(parseIp('2001:db8:::1')).toBeNull();
    expect(parseIp('')).toBeNull();
  });
});

describe('resolveClientIp — the spoofing matrix', () => {
  const policy = new TrustedProxyPolicy(['10.0.0.0/8', '2001:db8::/32']);

  it('ignores every forwarded header from an UNTRUSTED peer', () => {
    const resolved = policy.resolveClientIp({
      socketAddress: '203.0.113.50',
      xForwardedFor: '1.2.3.4, 5.6.7.8',
    });
    expect(resolved).toEqual({ clientIp: '203.0.113.50', fromTrustedProxy: false });
  });

  it('with an EMPTY allow-list (the default) trusts nothing at all', () => {
    const empty = new TrustedProxyPolicy([]);
    const resolved = empty.resolveClientIp({
      socketAddress: '10.1.2.3', // even a private peer is untrusted by default
      xForwardedFor: '198.51.100.9',
    });
    expect(resolved).toEqual({ clientIp: '10.1.2.3', fromTrustedProxy: false });
  });

  it('takes the RIGHTMOST non-trusted hop when the peer is trusted', () => {
    const resolved = policy.resolveClientIp({
      socketAddress: '10.0.0.5',
      // attacker-controlled left side; the proxy appended the real client.
      xForwardedFor: '6.6.6.6, 198.51.100.9',
    });
    expect(resolved).toEqual({ clientIp: '198.51.100.9', fromTrustedProxy: true });
  });

  it('skips trusted intermediate hops to find the client', () => {
    const resolved = policy.resolveClientIp({
      socketAddress: '10.0.0.5',
      xForwardedFor: '198.51.100.9, 10.0.0.7, 10.0.0.8',
    });
    expect(resolved).toEqual({ clientIp: '198.51.100.9', fromTrustedProxy: true });
  });

  it('does not let a spoofed TRUSTED-looking left entry win', () => {
    // The attacker pre-fills the header with a trusted-range address hoping
    // the resolver walks too far left. Rightmost non-trusted still wins.
    const resolved = policy.resolveClientIp({
      socketAddress: '10.0.0.5',
      xForwardedFor: '10.0.0.99, 198.51.100.9',
    });
    expect(resolved).toEqual({ clientIp: '198.51.100.9', fromTrustedProxy: true });
  });

  it('falls back to the socket peer on a malformed hop inside a trusted chain', () => {
    const resolved = policy.resolveClientIp({
      socketAddress: '10.0.0.5',
      xForwardedFor: 'total-garbage, 198.51.100.9, also-garbage',
    });
    expect(resolved).toEqual({ clientIp: '10.0.0.5', fromTrustedProxy: false });
  });

  it('handles multiple physical header values and whitespace', () => {
    const resolved = policy.resolveClientIp({
      socketAddress: '10.0.0.5',
      xForwardedFor: ['198.51.100.9', ' 10.0.0.6 , 10.0.0.7'],
    });
    expect(resolved).toEqual({ clientIp: '198.51.100.9', fromTrustedProxy: true });
  });

  it('returns the leftmost hop when EVERY hop is trusted (internal calls)', () => {
    const resolved = policy.resolveClientIp({
      socketAddress: '10.0.0.5',
      xForwardedFor: '10.0.0.1, 10.0.0.2',
    });
    expect(resolved).toEqual({ clientIp: '10.0.0.1', fromTrustedProxy: true });
  });

  it('matches a v4-mapped v6 peer against a v4 CIDR', () => {
    const resolved = policy.resolveClientIp({
      socketAddress: '::ffff:10.0.0.5',
      xForwardedFor: '198.51.100.9',
    });
    expect(resolved).toEqual({ clientIp: '198.51.100.9', fromTrustedProxy: true });
  });

  it('matches IPv6 CIDRs and never cross-family', () => {
    expect(
      policy.resolveClientIp({
        socketAddress: '2001:db8:1::9',
        xForwardedFor: '198.51.100.9',
      }),
    ).toEqual({ clientIp: '198.51.100.9', fromTrustedProxy: true });
    // 10.x as v6-embedded text is NOT inside 2001:db8::/32, and the v4 list
    // cannot match a 16-byte address that is not v4-mapped.
    expect(
      policy.resolveClientIp({
        socketAddress: '2001:db9::1',
        xForwardedFor: '198.51.100.9',
      }).fromTrustedProxy,
    ).toBe(false);
  });

  it('answers the socket peer when the header is absent, and unknown when even that is missing', () => {
    expect(policy.resolveClientIp({ socketAddress: '10.0.0.5' })).toEqual({
      clientIp: '10.0.0.5',
      fromTrustedProxy: false,
    });
    expect(policy.resolveClientIp({ socketAddress: undefined, xForwardedFor: '1.2.3.4' })).toEqual({
      clientIp: 'unknown',
      fromTrustedProxy: false,
    });
  });
});
