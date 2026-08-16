/**
 * Trusted-proxy client-IP resolution (backend.md §10, legacy AUTHN-04 HIGH).
 *
 * The rule, stated once and enforced here for every consumer: a
 * client-supplied header is NEVER trusted on its own. The client IP is
 *
 *   - the socket peer address, unless the socket peer itself is inside the
 *     configured trusted-proxy allow-list (`KARAR_TRUSTED_PROXIES`, a CIDR
 *     list, DEFAULT EMPTY — trust nothing);
 *   - when the peer IS a trusted proxy: the rightmost `X-Forwarded-For` hop
 *     that is NOT itself a trusted proxy (each trusted hop appended the next
 *     address and may be believed about it; everything left of the first
 *     untrusted address is attacker-writable and ignored);
 *   - the socket peer again whenever the header is absent, malformed, or
 *     exhausted — a malformed chain from a trusted proxy is a
 *     misconfiguration, and the safe answer is the address we actually see.
 *
 * `Forwarded` and `X-Real-IP` are deliberately not consulted at all: one
 * derivation, one header, no second opinion for a spoofer to try
 * (resolveClientIp reads exactly `x-forwarded-for`).
 *
 * This module never reads the environment. The composition root parses
 * `KARAR_TRUSTED_PROXIES` (see `parseTrustedProxySpec`) and constructs the
 * policy; everything downstream receives the policy object.
 */

/** The environment variable the composition root feeds `parseTrustedProxySpec` from. */
export const TRUSTED_PROXIES_ENV_VAR = 'KARAR_TRUSTED_PROXIES';

export class InvalidTrustedProxySpecError extends Error {
  override readonly name = 'InvalidTrustedProxySpecError';
}

interface ParsedIp {
  /** 4 or 16 bytes; v4-mapped IPv6 (::ffff:a.b.c.d) is normalized to 4. */
  readonly bytes: Uint8Array;
}

function parseIpv4(raw: string): Uint8Array | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw);
  if (m === null) return null;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const octet = Number(m[i + 1]);
    if (octet > 255) return null;
    bytes[i] = octet;
  }
  return bytes;
}

function parseIpv6(raw: string): Uint8Array | null {
  // Zone index (fe80::1%en0) is link-local scoping, irrelevant to matching.
  const zoneless = raw.split('%')[0] ?? '';
  if (zoneless.length === 0 || !zoneless.includes(':')) return null;

  let head = zoneless;
  let embeddedV4: Uint8Array | null = null;
  const lastColon = zoneless.lastIndexOf(':');
  const tail = zoneless.slice(lastColon + 1);
  if (tail.includes('.')) {
    embeddedV4 = parseIpv4(tail);
    if (embeddedV4 === null) return null;
    head = `${zoneless.slice(0, lastColon)}:0:0`; // placeholder groups, replaced below
  }

  const doubleColonSplits = head.split('::');
  if (doubleColonSplits.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };

  let groups: number[];
  if (doubleColonSplits.length === 2) {
    const left = parseGroups(doubleColonSplits[0] ?? '');
    const right = parseGroups(doubleColonSplits[1] ?? '');
    if (left === null || right === null) return null;
    const fill = 8 - left.length - right.length;
    if (fill < 1) return null;
    groups = [...left, ...Array.from({ length: fill }, () => 0), ...right];
  } else {
    const parsed = parseGroups(head);
    if (parsed === null || parsed.length !== 8) return null;
    groups = parsed;
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const group = groups[i] ?? 0;
    bytes[2 * i] = group >> 8;
    bytes[2 * i + 1] = group & 0xff;
  }
  if (embeddedV4 !== null) {
    bytes.set(embeddedV4, 12);
  }
  return bytes;
}

const V4_MAPPED_PREFIX = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff];

function isV4Mapped(bytes: Uint8Array): boolean {
  return bytes.length === 16 && V4_MAPPED_PREFIX.every((b, i) => bytes[i] === b);
}

/** Parses an address into bytes, normalizing v4-mapped IPv6 to IPv4. `null` on garbage. */
export function parseIp(raw: string): ParsedIp | null {
  const trimmed = raw.trim().replace(/^\[|\]$/g, ''); // bracketed v6 from proxies
  const v4 = parseIpv4(trimmed);
  if (v4 !== null) return { bytes: v4 };
  const v6 = parseIpv6(trimmed);
  if (v6 === null) return null;
  if (isV4Mapped(v6)) return { bytes: v6.slice(12) };
  return { bytes: v6 };
}

/** Canonical text for a parsed address — the form digests and logs receive. */
export function canonicalIp(ip: ParsedIp): string {
  if (ip.bytes.length === 4) return Array.from(ip.bytes).join('.');
  const groups: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    groups.push((((ip.bytes[2 * i] ?? 0) << 8) | (ip.bytes[2 * i + 1] ?? 0)).toString(16));
  }
  return groups.join(':');
}

interface Cidr {
  readonly bytes: Uint8Array;
  readonly prefix: number;
}

function cidrContains(cidr: Cidr, ip: ParsedIp): boolean {
  if (cidr.bytes.length !== ip.bytes.length) return false;
  const fullBytes = Math.floor(cidr.prefix / 8);
  for (let i = 0; i < fullBytes; i += 1) {
    if (cidr.bytes[i] !== ip.bytes[i]) return false;
  }
  const remainder = cidr.prefix % 8;
  if (remainder === 0) return true;
  const mask = 0xff << (8 - remainder);
  return ((cidr.bytes[fullBytes] ?? 0) & mask) === ((ip.bytes[fullBytes] ?? 0) & mask);
}

/**
 * Splits the `KARAR_TRUSTED_PROXIES` value (comma-separated CIDRs or bare
 * addresses) into entries. Pure string handling; validation happens in the
 * policy constructor so a bad entry names its POSITION, never its value.
 */
export function parseTrustedProxySpec(raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

export interface ResolveClientIpInput {
  /** The socket peer address as reported by the server (request.socket.remoteAddress). */
  readonly socketAddress: string | undefined;
  /** Raw `X-Forwarded-For` value(s); multiple physical headers arrive as an array. */
  readonly xForwardedFor?: string | readonly string[] | undefined;
}

export interface ResolvedClientIp {
  /** Canonical address text — feed this to digests, rate-limit keys, logs. */
  readonly clientIp: string;
  /** True only when the value came from a header via a trusted proxy. */
  readonly fromTrustedProxy: boolean;
}

export class TrustedProxyPolicy {
  private readonly cidrs: readonly Cidr[];

  /**
   * @param entries CIDR strings (`10.0.0.0/8`, `2001:db8::/32`) or bare
   * addresses (exact match). An EMPTY list is the default posture: no proxy
   * is trusted and every forwarded header is ignored.
   */
  constructor(entries: readonly string[]) {
    this.cidrs = entries.map((entry, index) => {
      const [addressPart, prefixPart, extra] = entry.split('/');
      if (extra !== undefined || addressPart === undefined || addressPart === '') {
        throw new InvalidTrustedProxySpecError(
          `${TRUSTED_PROXIES_ENV_VAR} entry #${index + 1} is not a valid CIDR or address`,
        );
      }
      const parsed = parseIp(addressPart);
      if (parsed === null) {
        throw new InvalidTrustedProxySpecError(
          `${TRUSTED_PROXIES_ENV_VAR} entry #${index + 1} is not a valid CIDR or address`,
        );
      }
      const maxPrefix = parsed.bytes.length * 8;
      let prefix = maxPrefix;
      if (prefixPart !== undefined) {
        if (!/^\d{1,3}$/.test(prefixPart)) {
          throw new InvalidTrustedProxySpecError(
            `${TRUSTED_PROXIES_ENV_VAR} entry #${index + 1} has a malformed prefix length`,
          );
        }
        prefix = Number(prefixPart);
        if (prefix > maxPrefix) {
          throw new InvalidTrustedProxySpecError(
            `${TRUSTED_PROXIES_ENV_VAR} entry #${index + 1} prefix exceeds the address family width`,
          );
        }
      }
      return { bytes: parsed.bytes, prefix };
    });
  }

  isTrustedProxy(address: string): boolean {
    const parsed = parseIp(address);
    if (parsed === null) return false;
    return this.cidrs.some((cidr) => cidrContains(cidr, parsed));
  }

  /**
   * Derives the client address per the module contract above. Total: always
   * returns an address (falling back to the socket peer, and to `'unknown'`
   * only when even the socket address is absent or unparseable — a shape
   * that occurs in unit tests and process-internal calls, never on a real
   * accepted TCP connection).
   */
  resolveClientIp(input: ResolveClientIpInput): ResolvedClientIp {
    const peerRaw = input.socketAddress ?? '';
    const peer = parseIp(peerRaw);
    const peerCanonical = peer === null ? 'unknown' : canonicalIp(peer);
    const fallback: ResolvedClientIp = { clientIp: peerCanonical, fromTrustedProxy: false };

    if (peer === null || !this.isTrustedProxy(peerCanonical)) {
      // Untrusted peer: whatever headers it sent are its own claims. Ignored.
      return fallback;
    }

    const headerValues =
      input.xForwardedFor === undefined
        ? []
        : Array.isArray(input.xForwardedFor)
          ? input.xForwardedFor
          : [input.xForwardedFor as string];
    const hops = headerValues
      .flatMap((value) => value.split(','))
      .map((hop) => hop.trim())
      .filter((hop) => hop !== '');
    if (hops.length === 0) return fallback;

    let leftmostTrusted: ParsedIp | null = null;
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      const hop = parseIp(hops[i] as string);
      if (hop === null) {
        // A malformed hop inside a trusted chain: nothing to the left of it
        // can be believed. The safe answer is the socket peer.
        return fallback;
      }
      const canonical = canonicalIp(hop);
      if (!this.isTrustedProxy(canonical)) {
        return { clientIp: canonical, fromTrustedProxy: true };
      }
      leftmostTrusted = hop;
    }
    // Every hop is a trusted proxy (health checks, internal calls): the
    // leftmost entry is the closest thing to a client the chain names.
    return leftmostTrusted === null
      ? fallback
      : { clientIp: canonicalIp(leftmostTrusted), fromTrustedProxy: true };
  }
}
