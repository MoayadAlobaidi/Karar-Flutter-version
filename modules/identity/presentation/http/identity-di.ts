/**
 * DI tokens and the per-request edge context for the identity HTTP surface.
 * The edge context is where the two minimization rules are APPLIED: the
 * client address resolves through the trusted-proxy policy and immediately
 * becomes an HMAC digest; the user agent immediately becomes a coarse
 * summary. Raw values do not travel past this file.
 */

import type { TrustedProxyPolicy } from '@karar/platform/dist/http/index.js';

import { summarizeUserAgent } from '../../domain/user-agent.js';
import type { ClientContext } from '../../application/identity-deps.js';
import type { CredentialDigester } from '../../application/ports/crypto-ports.js';

export const IDENTITY_USE_CASES = Symbol('IDENTITY_USE_CASES');
export const IDENTITY_EDGE_CONTEXT = Symbol('IDENTITY_EDGE_CONTEXT');

/** The transport-facing request shape this module reads. Framework-thin. */
export interface IdentityRequestLike {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly raw?: { readonly socket?: { readonly remoteAddress?: string } };
  readonly socket?: { readonly remoteAddress?: string };
  identityPrincipal?: unknown;
}

export class IdentityEdgeContext {
  constructor(
    private readonly trustedProxies: TrustedProxyPolicy,
    private readonly digester: CredentialDigester,
  ) {}

  clientContext(request: IdentityRequestLike): ClientContext {
    const socketAddress =
      request.raw?.socket?.remoteAddress ?? request.socket?.remoteAddress;
    const header = request.headers['x-forwarded-for'];
    const resolved = this.trustedProxies.resolveClientIp({
      socketAddress,
      xForwardedFor: header as string | readonly string[] | undefined,
    });
    return {
      ipDigest: resolved.clientIp === 'unknown' ? null : this.digester.ipDigest(resolved.clientIp),
      userAgentSummary: summarizeUserAgent(
        typeof request.headers['user-agent'] === 'string'
          ? request.headers['user-agent']
          : null,
      ),
    };
  }
}
