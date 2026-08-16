// @karar/platform http — edge HTTP concerns that must be identical for every
// entrypoint. Today: trusted-proxy client-IP derivation (backend.md §10).
export {
  InvalidTrustedProxySpecError,
  TRUSTED_PROXIES_ENV_VAR,
  TrustedProxyPolicy,
  canonicalIp,
  parseIp,
  parseTrustedProxySpec,
  type ResolveClientIpInput,
  type ResolvedClientIp,
} from './trusted-proxy.js';
